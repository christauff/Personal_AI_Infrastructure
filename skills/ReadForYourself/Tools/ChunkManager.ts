#!/usr/bin/env bun
/**
 * ChunkManager.ts - Intelligent book chunking for context windows
 *
 * Usage:
 *   bun ChunkManager.ts <book-path> [options]
 *
 * Options:
 *   --info              Show chunk info and cost estimate only
 *   --chunk <n>         Output specific chunk (0-indexed)
 *   --target-tokens <n> Target tokens per chunk (default: 30000)
 *
 * Outputs:
 *   JSON with chunks array or specific chunk content
 */

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname } from "path";

interface ChunkInfo {
  index: number;
  title: string;
  startOffset: number;
  endOffset: number;
  estimatedTokens: number;
  chaptersCovered: string[];
}

interface BookChunks {
  bookTitle: string;
  bookAuthor: string;
  bookSlug: string;
  sourcePath: string;
  totalChunks: number;
  totalTokens: number;
  estimatedCost: CostEstimate;
  chunks: ChunkInfo[];
}

interface CostEstimate {
  readingPhase: string;
  synthesisPhase: string;
  total: string;
  breakdown: string;
}

interface Chapter {
  index: number;
  title: string;
  startOffset: number;
  endOffset: number;
}

interface BookContent {
  info: {
    title: string;
    author: string;
    slug: string;
    estimatedTokens: number;
  };
  chapters: Chapter[];
  rawText: string;
}

const TARGET_TOKENS = 30000;  // Default target per chunk

// Cost estimates (as of 2026-02)
const COSTS = {
  sonnet: { input: 3.00, output: 15.00 },  // per 1M tokens
  opus: { input: 15.00, output: 75.00 },
  haiku: { input: 0.25, output: 1.25 },
};

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 1.33);
}

function calculateCost(totalTokens: number, numChunks: number): CostEstimate {
  // Reading phase: each chunk processed by sonnet
  // Input: chunk (~30K) + prompt (~2K)
  // Output: notes (~5K)
  const readingInput = numChunks * 32000;
  const readingOutput = numChunks * 5000;
  const readingCost =
    (readingInput / 1_000_000) * COSTS.sonnet.input +
    (readingOutput / 1_000_000) * COSTS.sonnet.output;

  // Synthesis phase: all notes processed by opus
  // Input: all notes (~5K * chunks) + prompt (~3K)
  // Output: synthesis (~10K)
  const synthesisInput = (numChunks * 5000) + 3000;
  const synthesisOutput = 10000;
  const synthesisCost =
    (synthesisInput / 1_000_000) * COSTS.opus.input +
    (synthesisOutput / 1_000_000) * COSTS.opus.output;

  // RedTeam adds ~20% overhead
  const redteamCost = synthesisCost * 0.2;

  const total = readingCost + synthesisCost + redteamCost;

  return {
    readingPhase: `$${readingCost.toFixed(2)}`,
    synthesisPhase: `$${(synthesisCost + redteamCost).toFixed(2)}`,
    total: `$${total.toFixed(2)}`,
    breakdown: `Reading: ${numChunks} chunks × ~32K input + 5K output (sonnet)\nSynthesis: ~${Math.ceil(synthesisInput / 1000)}K input + 10K output (opus)\nRedTeam: +20% overhead`,
  };
}

async function loadBookContent(path: string): Promise<BookContent> {
  const loaderPath = `${dirname(import.meta.path)}/BookLoader.ts`;
  const result = await $`bun ${loaderPath} ${path}`.json();
  return result as BookContent;
}

function createChunks(book: BookContent, targetTokens: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const text = book.rawText;
  const chapters = book.chapters;

  let currentChunk: ChunkInfo = {
    index: 0,
    title: "",
    startOffset: 0,
    endOffset: 0,
    estimatedTokens: 0,
    chaptersCovered: [],
  };

  for (const chapter of chapters) {
    const chapterText = text.slice(chapter.startOffset, chapter.endOffset);
    const chapterTokens = estimateTokens(chapterText);

    // If single chapter exceeds target, it becomes its own chunk
    if (chapterTokens > targetTokens * 1.5) {
      // Finalize current chunk if it has content
      if (currentChunk.chaptersCovered.length > 0) {
        chunks.push({ ...currentChunk });
        currentChunk = {
          index: chunks.length,
          title: "",
          startOffset: chapter.startOffset,
          endOffset: 0,
          estimatedTokens: 0,
          chaptersCovered: [],
        };
      }

      // Split large chapter into sub-chunks by paragraph
      const paragraphs = chapterText.split(/\n\n+/);
      let subChunkText = "";
      let subChunkStart = chapter.startOffset;

      for (const para of paragraphs) {
        const paraTokens = estimateTokens(para);
        const currentTokens = estimateTokens(subChunkText);

        if (currentTokens + paraTokens > targetTokens && subChunkText.length > 0) {
          // Save sub-chunk
          chunks.push({
            index: chunks.length,
            title: `${chapter.title} (Part ${chunks.length - currentChunk.index + 1})`,
            startOffset: subChunkStart,
            endOffset: subChunkStart + subChunkText.length,
            estimatedTokens: estimateTokens(subChunkText),
            chaptersCovered: [chapter.title],
          });

          subChunkText = para;
          subChunkStart = chapter.startOffset + chapterText.indexOf(para);
        } else {
          subChunkText += (subChunkText ? "\n\n" : "") + para;
        }
      }

      // Handle remaining text
      if (subChunkText.length > 0) {
        chunks.push({
          index: chunks.length,
          title: `${chapter.title} (Part ${chunks.length - currentChunk.index + 1})`,
          startOffset: subChunkStart,
          endOffset: chapter.endOffset,
          estimatedTokens: estimateTokens(subChunkText),
          chaptersCovered: [chapter.title],
        });
      }

      // Reset for next chapter
      currentChunk = {
        index: chunks.length,
        title: "",
        startOffset: chapter.endOffset,
        endOffset: 0,
        estimatedTokens: 0,
        chaptersCovered: [],
      };
    }
    // If adding this chapter would exceed target, finalize current chunk
    else if (currentChunk.estimatedTokens + chapterTokens > targetTokens &&
             currentChunk.chaptersCovered.length > 0) {
      chunks.push({ ...currentChunk });
      currentChunk = {
        index: chunks.length,
        title: chapter.title,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        estimatedTokens: chapterTokens,
        chaptersCovered: [chapter.title],
      };
    }
    // Add chapter to current chunk
    else {
      if (currentChunk.chaptersCovered.length === 0) {
        currentChunk.startOffset = chapter.startOffset;
        currentChunk.title = chapter.title;
      }
      currentChunk.endOffset = chapter.endOffset;
      currentChunk.estimatedTokens += chapterTokens;
      currentChunk.chaptersCovered.push(chapter.title);
    }
  }

  // Don't forget the last chunk
  if (currentChunk.chaptersCovered.length > 0) {
    chunks.push(currentChunk);
  }

  // Update titles for multi-chapter chunks
  for (const chunk of chunks) {
    if (chunk.chaptersCovered.length > 1) {
      chunk.title = `${chunk.chaptersCovered[0]} - ${chunk.chaptersCovered[chunk.chaptersCovered.length - 1]}`;
    }
  }

  return chunks;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Usage: bun ChunkManager.ts <book-path> [options]

Intelligent book chunking for context windows.

Options:
  --info              Show chunk info and cost estimate only
  --chunk <n>         Output specific chunk content (0-indexed)
  --target-tokens <n> Target tokens per chunk (default: 30000)

Examples:
  bun ChunkManager.ts ~/books/meditations.epub --info
  bun ChunkManager.ts ~/books/republic.pdf --chunk 0
  bun ChunkManager.ts ~/books/ethics.txt --target-tokens 20000`);
    process.exit(0);
  }

  const bookPath = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
  const infoOnly = args.includes("--info");
  const chunkIndex = args.includes("--chunk")
    ? parseInt(args[args.indexOf("--chunk") + 1], 10)
    : null;
  const targetTokens = args.includes("--target-tokens")
    ? parseInt(args[args.indexOf("--target-tokens") + 1], 10)
    : TARGET_TOKENS;

  if (!bookPath) {
    console.error("Error: Book path required");
    process.exit(1);
  }

  if (!existsSync(bookPath)) {
    console.error(`Error: File not found: ${bookPath}`);
    process.exit(1);
  }

  try {
    const book = await loadBookContent(bookPath);
    const chunks = createChunks(book, targetTokens);
    const totalTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0);
    const costEstimate = calculateCost(totalTokens, chunks.length);

    const result: BookChunks = {
      bookTitle: book.info.title,
      bookAuthor: book.info.author,
      bookSlug: book.info.slug,
      sourcePath: bookPath,
      totalChunks: chunks.length,
      totalTokens,
      estimatedCost: costEstimate,
      chunks,
    };

    // If specific chunk requested, output just that chunk's content
    if (chunkIndex !== null) {
      if (chunkIndex < 0 || chunkIndex >= chunks.length) {
        console.error(`Error: Chunk ${chunkIndex} out of range (0-${chunks.length - 1})`);
        process.exit(1);
      }

      const chunk = chunks[chunkIndex];
      const content = book.rawText.slice(chunk.startOffset, chunk.endOffset);

      console.log(JSON.stringify({
        ...chunk,
        content,
        bookTitle: book.info.title,
        totalChunks: chunks.length,
      }, null, 2));
      return;
    }

    // Info only mode
    if (infoOnly) {
      // Don't include full chunk details for cleaner output
      console.log(JSON.stringify({
        ...result,
        chunks: result.chunks.map(c => ({
          index: c.index,
          title: c.title,
          estimatedTokens: c.estimatedTokens,
          chaptersCovered: c.chaptersCovered.length,
        })),
      }, null, 2));
      return;
    }

    // Full output
    console.log(JSON.stringify(result, null, 2));

  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

main();

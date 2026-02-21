#!/usr/bin/env bun
/**
 * BookLoader.ts - Extract text from book files (epub, PDF, txt)
 *
 * Usage:
 *   bun BookLoader.ts <book-path> [--info]
 *
 * Options:
 *   --info    Show book info without extracting full text
 *
 * Outputs:
 *   JSON with extracted text, metadata, and chapter markers
 */

import { $ } from "bun";
import { existsSync, readFileSync } from "fs";
import { basename, extname } from "path";

interface BookInfo {
  title: string;
  author: string;
  path: string;
  format: "epub" | "pdf" | "txt";
  slug: string;
  estimatedWords: number;
  estimatedTokens: number;
}

interface BookContent {
  info: BookInfo;
  chapters: Chapter[];
  rawText: string;
}

interface Chapter {
  index: number;
  title: string;
  startOffset: number;
  endOffset: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function detectFormat(path: string): "epub" | "pdf" | "txt" {
  const ext = extname(path).toLowerCase();
  if (ext === ".epub") return "epub";
  if (ext === ".pdf") return "pdf";
  if (ext === ".txt" || ext === ".text") return "txt";
  throw new Error(`Unsupported format: ${ext}. Supported: epub, pdf, txt`);
}

async function extractEpub(path: string): Promise<{ text: string; metadata: { title?: string; author?: string } }> {
  // Check for calibre's ebook-convert
  try {
    await $`which ebook-convert`.quiet();
  } catch {
    throw new Error("ebook-convert not found. Install Calibre: sudo apt install calibre");
  }

  // Create temp file for text output
  const tempPath = `/tmp/book-${Date.now()}.txt`;

  try {
    // Convert epub to txt
    await $`ebook-convert ${path} ${tempPath} --txt-output-encoding utf-8`.quiet();
    const text = readFileSync(tempPath, "utf-8");

    // Try to extract metadata
    let title = basename(path, ".epub");
    let author = "Unknown";

    try {
      const metaResult = await $`ebook-meta ${path}`.text();
      const titleMatch = metaResult.match(/Title\s*:\s*(.+)/);
      const authorMatch = metaResult.match(/Author\(s\)\s*:\s*(.+)/);
      if (titleMatch) title = titleMatch[1].trim();
      if (authorMatch) author = authorMatch[1].trim();
    } catch {
      // Metadata extraction failed, use defaults
    }

    // Cleanup
    await $`rm -f ${tempPath}`.quiet();

    return { text, metadata: { title, author } };
  } catch (e) {
    await $`rm -f ${tempPath}`.quiet();
    throw new Error(`Failed to extract epub: ${e}`);
  }
}

async function extractPdf(path: string): Promise<{ text: string; metadata: { title?: string; author?: string } }> {
  // Check for pdftotext
  try {
    await $`which pdftotext`.quiet();
  } catch {
    throw new Error("pdftotext not found. Install: sudo apt install poppler-utils");
  }

  const tempPath = `/tmp/book-${Date.now()}.txt`;

  try {
    await $`pdftotext -layout ${path} ${tempPath}`.quiet();
    const text = readFileSync(tempPath, "utf-8");

    // Try to get PDF info
    let title = basename(path, ".pdf");
    let author = "Unknown";

    try {
      const infoResult = await $`pdfinfo ${path}`.text();
      const titleMatch = infoResult.match(/Title:\s*(.+)/);
      const authorMatch = infoResult.match(/Author:\s*(.+)/);
      if (titleMatch && titleMatch[1].trim()) title = titleMatch[1].trim();
      if (authorMatch && authorMatch[1].trim()) author = authorMatch[1].trim();
    } catch {
      // Info extraction failed
    }

    await $`rm -f ${tempPath}`.quiet();

    return { text, metadata: { title, author } };
  } catch (e) {
    await $`rm -f ${tempPath}`.quiet();
    throw new Error(`Failed to extract PDF: ${e}`);
  }
}

function extractTxt(path: string): { text: string; metadata: { title?: string; author?: string } } {
  const text = readFileSync(path, "utf-8");
  const title = basename(path, extname(path));
  return { text, metadata: { title, author: "Unknown" } };
}

function detectChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];

  // Common chapter patterns
  const patterns = [
    /^(CHAPTER|Chapter)\s+(\d+|[IVXLC]+)[\s:.\-]*(.*)$/gm,
    /^(Part|PART)\s+(\d+|[IVXLC]+)[\s:.\-]*(.*)$/gm,
    /^(\d+)\.\s+(.+)$/gm,  // "1. Chapter Title"
    /^(BOOK|Book)\s+(\d+|[IVXLC]+)[\s:.\-]*(.*)$/gm,
  ];

  const matches: { index: number; title: string }[] = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        title: match[0].trim(),
      });
    }
  }

  // Sort by position
  matches.sort((a, b) => a.index - b.index);

  // Remove duplicates (same position)
  const unique = matches.filter((m, i) =>
    i === 0 || m.index !== matches[i - 1].index
  );

  // Convert to chapters with bounds
  for (let i = 0; i < unique.length; i++) {
    chapters.push({
      index: i,
      title: unique[i].title,
      startOffset: unique[i].index,
      endOffset: i < unique.length - 1 ? unique[i + 1].index : text.length,
    });
  }

  // If no chapters detected, treat whole book as one chapter
  if (chapters.length === 0) {
    chapters.push({
      index: 0,
      title: "Full Text",
      startOffset: 0,
      endOffset: text.length,
    });
  }

  return chapters;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~0.75 tokens per word, ~4 chars per word
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 1.33);  // words to tokens ratio
}

async function loadBook(path: string, infoOnly: boolean = false): Promise<BookInfo | BookContent> {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  const format = detectFormat(path);

  let result: { text: string; metadata: { title?: string; author?: string } };

  switch (format) {
    case "epub":
      result = await extractEpub(path);
      break;
    case "pdf":
      result = await extractPdf(path);
      break;
    case "txt":
      result = extractTxt(path);
      break;
  }

  const estimatedWords = result.text.split(/\s+/).length;
  const estimatedTokens = estimateTokens(result.text);

  const info: BookInfo = {
    title: result.metadata.title || basename(path, extname(path)),
    author: result.metadata.author || "Unknown",
    path,
    format,
    slug: slugify(result.metadata.title || basename(path, extname(path))),
    estimatedWords,
    estimatedTokens,
  };

  if (infoOnly) {
    return info;
  }

  const chapters = detectChapters(result.text);

  return {
    info,
    chapters,
    rawText: result.text,
  };
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`Usage: bun BookLoader.ts <book-path> [--info]

Extract text from book files (epub, PDF, txt).

Options:
  --info    Show book info without extracting full text

Outputs JSON with:
  - info: title, author, path, format, slug, estimated tokens
  - chapters: detected chapter boundaries
  - rawText: full extracted text (unless --info)`);
  process.exit(0);
}

const bookPath = args.find(a => !a.startsWith("--"));
const infoOnly = args.includes("--info");

if (!bookPath) {
  console.error("Error: Book path required");
  process.exit(1);
}

try {
  const result = await loadBook(bookPath, infoOnly);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(`Error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

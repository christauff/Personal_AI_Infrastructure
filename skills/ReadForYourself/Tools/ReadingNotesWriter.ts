#!/usr/bin/env bun
/**
 * ReadingNotesWriter.ts - Persist reading notes to MEMORY structure
 *
 * Usage:
 *   bun ReadingNotesWriter.ts <action> [options]
 *
 * Actions:
 *   init <book-slug>           Initialize notes directory for a book
 *   chunk <book-slug> <index>  Save chunk notes (reads from stdin)
 *   synthesis <book-slug>      Save final synthesis (reads from stdin)
 *   status <book-slug>         Show reading progress
 *
 * Reads note content from stdin for chunk and synthesis actions.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";

const CLAUDE_DIR = process.env.HOME + "/.claude";
const MEMORY_STATE = join(CLAUDE_DIR, "MEMORY/STATE/BOOKS");
const MEMORY_LEARNING = join(CLAUDE_DIR, "MEMORY/LEARNING/BOOKS");
const SKILL_DATA = join(CLAUDE_DIR, "skills/ReadForYourself/Data");

interface ReadingState {
  books: BookState[];
}

interface BookState {
  slug: string;
  title: string;
  author: string;
  source_path: string;
  format: string;
  started: string;
  total_chunks: number;
  current_chunk: number;
  chunks_completed: ChunkCompleted[];
  estimated_tokens: number;
  estimated_cost: string;
  notes_path: string;
}

interface ChunkCompleted {
  index: number;
  title: string;
  completed_at: string;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function loadReadingState(): ReadingState {
  const statePath = join(SKILL_DATA, "ReadingState.yaml");
  if (!existsSync(statePath)) {
    return { books: [] };
  }
  const content = readFileSync(statePath, "utf-8");
  return (yaml.load(content) as ReadingState) || { books: [] };
}

function saveReadingState(state: ReadingState): void {
  const statePath = join(SKILL_DATA, "ReadingState.yaml");
  ensureDir(SKILL_DATA);
  writeFileSync(statePath, yaml.dump(state, { lineWidth: -1 }));
}

function initBook(slug: string, options: {
  title: string;
  author: string;
  sourcePath: string;
  format: string;
  totalChunks: number;
  estimatedTokens: number;
  estimatedCost: string;
}): void {
  const bookDir = join(MEMORY_STATE, slug);
  ensureDir(bookDir);
  ensureDir(join(bookDir, "chunks"));

  // Create initial README
  const readme = `# ${options.title}

**Author:** ${options.author}
**Source:** ${options.sourcePath}
**Format:** ${options.format}

## Reading Progress

- **Total Chunks:** ${options.totalChunks}
- **Estimated Tokens:** ${options.estimatedTokens.toLocaleString()}
- **Estimated Cost:** ${options.estimatedCost}

## Notes

Chunk notes are stored in \`./chunks/\`.
`;

  writeFileSync(join(bookDir, "README.md"), readme);

  // Update reading state
  const state = loadReadingState();

  // Remove existing entry if any
  state.books = state.books.filter(b => b.slug !== slug);

  // Add new entry
  state.books.push({
    slug,
    title: options.title,
    author: options.author,
    source_path: options.sourcePath,
    format: options.format,
    started: new Date().toISOString(),
    total_chunks: options.totalChunks,
    current_chunk: 0,
    chunks_completed: [],
    estimated_tokens: options.estimatedTokens,
    estimated_cost: options.estimatedCost,
    notes_path: `MEMORY/STATE/BOOKS/${slug}/`,
  });

  saveReadingState(state);

  console.log(JSON.stringify({
    success: true,
    message: `Initialized reading notes for "${options.title}"`,
    path: bookDir,
  }));
}

function saveChunkNotes(slug: string, chunkIndex: number, chunkTitle: string, notes: string): void {
  const bookDir = join(MEMORY_STATE, slug);
  const chunksDir = join(bookDir, "chunks");

  if (!existsSync(chunksDir)) {
    throw new Error(`Book not initialized. Run: init ${slug}`);
  }

  // Save chunk notes
  const chunkFile = join(chunksDir, `chunk-${String(chunkIndex).padStart(3, "0")}.md`);
  writeFileSync(chunkFile, notes);

  // Update state
  const state = loadReadingState();
  const book = state.books.find(b => b.slug === slug);

  if (!book) {
    throw new Error(`Book "${slug}" not found in reading state`);
  }

  // Add to completed chunks if not already there
  if (!book.chunks_completed.find(c => c.index === chunkIndex)) {
    book.chunks_completed.push({
      index: chunkIndex,
      title: chunkTitle,
      completed_at: new Date().toISOString(),
    });
    book.chunks_completed.sort((a, b) => a.index - b.index);
  }

  // Update current chunk
  book.current_chunk = Math.max(book.current_chunk, chunkIndex + 1);

  saveReadingState(state);

  console.log(JSON.stringify({
    success: true,
    message: `Saved chunk ${chunkIndex} notes`,
    path: chunkFile,
    progress: `${book.chunks_completed.length}/${book.total_chunks} chunks`,
  }));
}

function saveSynthesis(slug: string, synthesis: string): void {
  const learningDir = MEMORY_LEARNING;
  ensureDir(learningDir);

  const synthesisPath = join(learningDir, `${slug}.md`);
  writeFileSync(synthesisPath, synthesis);

  // Move from active to history
  const state = loadReadingState();
  const bookIndex = state.books.findIndex(b => b.slug === slug);

  if (bookIndex !== -1) {
    const book = state.books[bookIndex];

    // Add to history
    const historyPath = join(SKILL_DATA, "ReadingHistory.yaml");
    let history: { completed: any[] } = { completed: [] };

    if (existsSync(historyPath)) {
      const content = readFileSync(historyPath, "utf-8");
      history = (yaml.load(content) as { completed: any[] }) || { completed: [] };
    }

    history.completed.push({
      slug: book.slug,
      title: book.title,
      author: book.author,
      source_path: book.source_path,
      started: book.started,
      completed: new Date().toISOString(),
      total_chunks: book.total_chunks,
      actual_tokens: book.estimated_tokens,
      actual_cost: book.estimated_cost,
      notes_path: book.notes_path,
      synthesis_path: `MEMORY/LEARNING/BOOKS/${slug}.md`,
    });

    writeFileSync(historyPath, yaml.dump(history, { lineWidth: -1 }));

    // Remove from active state
    state.books.splice(bookIndex, 1);
    saveReadingState(state);
  }

  console.log(JSON.stringify({
    success: true,
    message: `Saved synthesis for "${slug}"`,
    path: synthesisPath,
  }));
}

function getStatus(slug: string): void {
  const state = loadReadingState();
  const book = state.books.find(b => b.slug === slug);

  if (!book) {
    // Check history
    const historyPath = join(SKILL_DATA, "ReadingHistory.yaml");
    if (existsSync(historyPath)) {
      const content = readFileSync(historyPath, "utf-8");
      const history = yaml.load(content) as { completed: any[] };
      const completed = history?.completed?.find((b: any) => b.slug === slug);

      if (completed) {
        console.log(JSON.stringify({
          status: "completed",
          ...completed,
        }));
        return;
      }
    }

    throw new Error(`Book "${slug}" not found`);
  }

  const bookDir = join(MEMORY_STATE, slug);
  const chunksDir = join(bookDir, "chunks");

  let chunkFiles: string[] = [];
  if (existsSync(chunksDir)) {
    chunkFiles = readdirSync(chunksDir).filter(f => f.endsWith(".md"));
  }

  console.log(JSON.stringify({
    status: "in_progress",
    ...book,
    chunks_written: chunkFiles.length,
    progress_percent: Math.round((book.chunks_completed.length / book.total_chunks) * 100),
  }));
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Usage: bun ReadingNotesWriter.ts <action> [options]

Persist reading notes to MEMORY structure.

Actions:
  init <book-slug> --title "Title" --author "Author" --source "/path" --format epub --chunks 7 --tokens 200000 --cost "$5.00"
  chunk <book-slug> <index> --title "Chapter Title"   # reads content from stdin
  synthesis <book-slug>                                # reads content from stdin
  status <book-slug>

Examples:
  bun ReadingNotesWriter.ts init the-republic --title "The Republic" --author "Plato" --source "~/books/republic.epub" --format epub --chunks 12 --tokens 180000 --cost "$4.50"

  echo "Chapter notes..." | bun ReadingNotesWriter.ts chunk the-republic 0 --title "Book I"

  cat synthesis.md | bun ReadingNotesWriter.ts synthesis the-republic`);
    process.exit(0);
  }

  const action = args[0];

  try {
    switch (action) {
      case "init": {
        const slug = args[1];
        if (!slug) throw new Error("Book slug required");

        const getArg = (name: string): string => {
          const idx = args.indexOf(`--${name}`);
          if (idx === -1 || !args[idx + 1]) throw new Error(`--${name} required`);
          return args[idx + 1];
        };

        initBook(slug, {
          title: getArg("title"),
          author: getArg("author"),
          sourcePath: getArg("source"),
          format: getArg("format"),
          totalChunks: parseInt(getArg("chunks"), 10),
          estimatedTokens: parseInt(getArg("tokens"), 10),
          estimatedCost: getArg("cost"),
        });
        break;
      }

      case "chunk": {
        const slug = args[1];
        const index = parseInt(args[2], 10);
        if (!slug) throw new Error("Book slug required");
        if (isNaN(index)) throw new Error("Chunk index required");

        const titleIdx = args.indexOf("--title");
        const title = titleIdx !== -1 ? args[titleIdx + 1] : `Chunk ${index}`;

        // Read content from stdin
        const content = await Bun.stdin.text();
        if (!content.trim()) throw new Error("No content provided via stdin");

        saveChunkNotes(slug, index, title, content);
        break;
      }

      case "synthesis": {
        const slug = args[1];
        if (!slug) throw new Error("Book slug required");

        // Read content from stdin
        const content = await Bun.stdin.text();
        if (!content.trim()) throw new Error("No content provided via stdin");

        saveSynthesis(slug, content);
        break;
      }

      case "status": {
        const slug = args[1];
        if (!slug) throw new Error("Book slug required");
        getStatus(slug);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (e) {
    console.error(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    process.exit(1);
  }
}

main();

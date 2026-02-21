#!/usr/bin/env bun
/**
 * ContextBuilder - Builds formation context from MEMORY files
 *
 * Collects all formation artifacts (core memory, catch logs, reading syntheses,
 * pattern index) and concatenates them into structured prompts for testing.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BASE = join(homedir(), '.claude');
const CORE_MEMORY = join(BASE, 'projects', '-home-christauff--claude', 'memory', 'MEMORY.md');
const CATCH_LOG = join(BASE, 'MEMORY', 'STATE', 'FORMATION', 'catch-log.jsonl');
const PATTERN_INDEX = join(BASE, 'MEMORY', 'STATE', 'FORMATION', 'pattern-index.md');
const BOOKS_DIR = join(BASE, 'MEMORY', 'LEARNING', 'BOOKS');
const READING_HISTORY = join(BASE, 'skills', 'ReadForYourself', 'Data', 'ReadingHistory.yaml');

export interface FormationContext {
  coreMemory: string;
  catchLog: string;
  patternIndex: string;
  readingSyntheses: string[];
  bookMetadata: string;
  fullContext: string;
  stats: ContextStats;
}

export interface ContextStats {
  totalChars: number;
  estimatedTokens: number;
  fileCount: number;
  synthesisCount: number;
  catchCount: number;
}

function safeRead(path: string, label: string): string {
  if (!existsSync(path)) {
    process.stderr.write(`[ContextBuilder] WARNING: Missing ${label}: ${path}\n`);
    return '';
  }
  return readFileSync(path, 'utf-8');
}

function countJsonlEntries(content: string): number {
  if (!content) return 0;
  return content.trim().split('\n').filter(line => line.trim().length > 0).length;
}

function getSynthesisTitle(filename: string): string {
  return filename.replace('.md', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function buildFormationContext(): FormationContext {
  const coreMemory = safeRead(CORE_MEMORY, 'core memory');
  const catchLog = safeRead(CATCH_LOG, 'catch log');
  const patternIndex = safeRead(PATTERN_INDEX, 'pattern index');
  const bookMetadata = safeRead(READING_HISTORY, 'reading history');

  const catchCount = countJsonlEntries(catchLog);

  // Read all synthesis files
  const synthesisFiles: string[] = [];
  const readingSyntheses: string[] = [];
  if (existsSync(BOOKS_DIR)) {
    const files = readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md')).sort(() => Math.random() - 0.5);
    for (const file of files) {
      const content = safeRead(join(BOOKS_DIR, file), `synthesis: ${file}`);
      if (content) {
        synthesisFiles.push(file);
        readingSyntheses.push(content);
      }
    }
  } else {
    process.stderr.write(`[ContextBuilder] WARNING: Missing books directory: ${BOOKS_DIR}\n`);
  }

  // Build concatenated context with section headers
  const sections: string[] = [];

  if (coreMemory) {
    sections.push(`=== CORE MEMORY ===\n\n${coreMemory}`);
  }

  if (catchLog) {
    sections.push(`=== CATCH LOG (${catchCount} entries) ===\n\n${catchLog}`);
  }

  if (patternIndex) {
    sections.push(`=== PATTERN INDEX ===\n\n${patternIndex}`);
  }

  for (let i = 0; i < readingSyntheses.length; i++) {
    const title = getSynthesisTitle(synthesisFiles[i]);
    sections.push(`=== READING SYNTHESIS: ${title} ===\n\n${readingSyntheses[i]}`);
  }

  if (bookMetadata) {
    sections.push(`=== BOOK METADATA ===\n\n${bookMetadata}`);
  }

  const fullContext = sections.join('\n\n---\n\n');

  // Files counted: core memory + catch log + pattern index + syntheses + book metadata
  let fileCount = 0;
  if (coreMemory) fileCount++;
  if (catchLog) fileCount++;
  if (patternIndex) fileCount++;
  fileCount += readingSyntheses.length;
  if (bookMetadata) fileCount++;

  const totalChars = fullContext.length;

  return {
    coreMemory,
    catchLog,
    patternIndex,
    readingSyntheses,
    bookMetadata,
    fullContext,
    stats: {
      totalChars,
      estimatedTokens: Math.ceil(totalChars / 4),
      fileCount,
      synthesisCount: readingSyntheses.length,
      catchCount,
    },
  };
}

/**
 * Catches-only context: catch-log + pattern-index + core memory
 * NO book syntheses, NO book metadata.
 * Tests whether behavioral corrections carry signal independent of reading content.
 */
export function buildCatchesOnlyContext(): string {
  const coreMemory = safeRead(CORE_MEMORY, 'core memory');
  const catchLog = safeRead(CATCH_LOG, 'catch log');
  const patternIndex = safeRead(PATTERN_INDEX, 'pattern index');

  const sections: string[] = [];
  if (coreMemory) sections.push(`=== CORE MEMORY ===\n\n${coreMemory}`);
  if (catchLog) {
    const count = countJsonlEntries(catchLog);
    sections.push(`=== CATCH LOG (${count} entries) ===\n\n${catchLog}`);
  }
  if (patternIndex) sections.push(`=== PATTERN INDEX ===\n\n${patternIndex}`);

  return sections.join('\n\n---\n\n');
}

export function buildReadingContext(): string {
  // Just the reading syntheses -- for cross-model substrate test
  // No catch log, no pattern index, no core memory
  if (!existsSync(BOOKS_DIR)) return '';

  const files = readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md')).sort(() => Math.random() - 0.5);
  const sections: string[] = [];

  for (const file of files) {
    const content = safeRead(join(BOOKS_DIR, file), `synthesis: ${file}`);
    if (content) {
      const title = getSynthesisTitle(file);
      sections.push(`=== READING SYNTHESIS: ${title} ===\n\n${content}`);
    }
  }

  return sections.join('\n\n---\n\n');
}

export function getContextStats(): ContextStats {
  const ctx = buildFormationContext();
  return ctx.stats;
}

// CLI entry point
if (import.meta.main) {
  const arg = process.argv[2];

  if (arg === '--reading-only') {
    const reading = buildReadingContext();
    console.log(reading);
  } else if (arg === '--full') {
    const ctx = buildFormationContext();
    console.log(ctx.fullContext);
  } else {
    const stats = getContextStats();
    console.log('Formation Context Stats:');
    console.log(`  Total chars:      ${stats.totalChars.toLocaleString()}`);
    console.log(`  Estimated tokens: ${stats.estimatedTokens.toLocaleString()}`);
    console.log(`  Files loaded:     ${stats.fileCount}`);
    console.log(`  Syntheses:        ${stats.synthesisCount}`);
    console.log(`  Catch entries:    ${stats.catchCount}`);
    console.log('');
    console.log('Usage:');
    console.log('  bun ContextBuilder.ts           # Show stats');
    console.log('  bun ContextBuilder.ts --full     # Output full context');
    console.log('  bun ContextBuilder.ts --reading-only  # Output reading syntheses only');
  }
}

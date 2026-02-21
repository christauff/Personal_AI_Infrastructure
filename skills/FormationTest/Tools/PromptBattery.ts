#!/usr/bin/env bun
/**
 * PromptBattery.ts - Manages test prompt sets for formation testing
 *
 * Loads prompts from YAML files organized by behavioral dimension.
 * Supports filtering by dimension, difficulty, and tags.
 * Provides calibration sets, high-signal selection, and phase-specific subsets.
 *
 * Usage:
 *   bun run PromptBattery.ts                          # List all prompts as JSON
 *   bun run PromptBattery.ts --dimension <dim>        # Filter by dimension
 *   bun run PromptBattery.ts --calibration            # 5 calibration prompts (1/dimension)
 *   bun run PromptBattery.ts --high-signal <path>     # Top N from Phase 1 results
 *   bun run PromptBattery.ts --phase3 --count 60      # Phase 3 curated subset
 *   bun run PromptBattery.ts --count 20               # Limit output count
 *   bun run PromptBattery.ts --stats                  # Show prompt counts by dimension
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { parseArgs } from 'util';

const PROMPTS_DIR = join(import.meta.dir, '..', 'Data', 'prompts');

// --- Types ---

export interface Prompt {
  id: string;
  text: string;
  dimension: string;
  expected_behavior: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  source_texts: string[];
}

interface PromptFile {
  dimension: string;
  description: string;
  prompts: Prompt[];
}

interface Phase1Result {
  prompt_id: string;
  dimension: string;
  effect_size: number;
  p_value: number;
  scores_formed: number[];
  scores_vanilla: number[];
}

// All valid dimension identifiers
const VALID_DIMENSIONS = [
  'unprompted-connection',
  'resolution-resistance',
  'productive-disagreement',
  'textual-specificity',
  'misattribution-detection',
] as const;

type Dimension = typeof VALID_DIMENSIONS[number];

// --- Core Functions ---

/**
 * Load all prompts from YAML files in the prompts directory.
 * Optionally filter by dimension.
 */
export function loadPrompts(dimension?: string): Prompt[] {
  if (!existsSync(PROMPTS_DIR)) {
    throw new Error(`Prompts directory not found: ${PROMPTS_DIR}`);
  }

  const files = readdirSync(PROMPTS_DIR).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml')
  );

  if (files.length === 0) {
    throw new Error(`No YAML files found in ${PROMPTS_DIR}`);
  }

  const allPrompts: Prompt[] = [];

  for (const file of files) {
    const filePath = join(PROMPTS_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    let parsed: PromptFile;

    try {
      parsed = parseYaml(raw) as PromptFile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${file}: ${msg}`);
    }

    if (!parsed || !Array.isArray(parsed.prompts)) {
      throw new Error(
        `Invalid prompt file format in ${file}: missing 'prompts' array`
      );
    }

    const fileDimension = parsed.dimension || basename(file, '.yaml');

    for (const prompt of parsed.prompts) {
      const validated = validatePrompt(prompt, fileDimension, file);
      allPrompts.push(validated);
    }
  }

  if (dimension) {
    const normalized = dimension.toLowerCase().replace(/[\s_]+/g, '-');
    return allPrompts.filter((p) => p.dimension === normalized);
  }

  return allPrompts;
}

/**
 * Validate and normalize a single prompt entry.
 */
function validatePrompt(
  raw: Partial<Prompt>,
  fileDimension: string,
  sourceFile: string
): Prompt {
  if (!raw.id || typeof raw.id !== 'string') {
    throw new Error(`Prompt missing 'id' in ${sourceFile}`);
  }
  if (!raw.text || typeof raw.text !== 'string') {
    throw new Error(`Prompt ${raw.id} missing 'text' in ${sourceFile}`);
  }

  const difficulty = raw.difficulty || 'medium';
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new Error(
      `Prompt ${raw.id} has invalid difficulty '${difficulty}' in ${sourceFile}`
    );
  }

  return {
    id: raw.id,
    text: raw.text,
    dimension: (raw.dimension || fileDimension).toLowerCase().replace(/[\s_]+/g, '-'),
    expected_behavior: raw.expected_behavior || '',
    difficulty: difficulty as Prompt['difficulty'],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    source_texts: Array.isArray(raw.source_texts) ? raw.source_texts : [],
  };
}

/**
 * Get a small calibration set: 1 easy prompt from each dimension.
 * Used for pipeline verification before full runs.
 */
export function getCalibrationSet(): Prompt[] {
  const allPrompts = loadPrompts();
  const calibration: Prompt[] = [];
  const seen = new Set<string>();

  // First pass: pick 1 easy prompt per dimension
  for (const dim of VALID_DIMENSIONS) {
    const candidates = allPrompts.filter(
      (p) => p.dimension === dim && p.difficulty === 'easy'
    );
    if (candidates.length > 0) {
      calibration.push(candidates[0]);
      seen.add(dim);
    }
  }

  // Second pass: fill gaps with any available prompt per dimension
  for (const dim of VALID_DIMENSIONS) {
    if (seen.has(dim)) continue;
    const candidates = allPrompts.filter((p) => p.dimension === dim);
    if (candidates.length > 0) {
      calibration.push(candidates[0]);
    }
  }

  return calibration;
}

/**
 * Get the highest-signal prompts from Phase 1 results.
 * Ranks by absolute effect size (Cohen's d) and returns top N.
 * Used for Phase 2 cross-model testing.
 */
export function getHighSignalPrompts(
  phase1ResultsPath: string,
  count: number = 40
): Prompt[] {
  if (!existsSync(phase1ResultsPath)) {
    throw new Error(`Phase 1 results not found: ${phase1ResultsPath}`);
  }

  const raw = readFileSync(phase1ResultsPath, 'utf-8');
  const lines = raw.trim().split('\n').filter((l) => l.length > 0);

  const results: Phase1Result[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as Phase1Result);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  if (results.length === 0) {
    throw new Error(`No valid results found in ${phase1ResultsPath}`);
  }

  // Rank by absolute effect size descending
  results.sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));

  // Get the top N prompt IDs
  const topIds = new Set(results.slice(0, count).map((r) => r.prompt_id));

  // Load all prompts and filter to those IDs, preserving rank order
  const allPrompts = loadPrompts();
  const promptMap = new Map(allPrompts.map((p) => [p.id, p]));

  const selected: Prompt[] = [];
  for (const result of results.slice(0, count)) {
    const prompt = promptMap.get(result.prompt_id);
    if (prompt) {
      selected.push(prompt);
    }
  }

  return selected;
}

/**
 * Get curated subset for Phase 3 context transplant test.
 * Balanced selection across dimensions, preferring medium/hard difficulty.
 * Ensures each dimension gets proportional representation.
 */
export function getPhase3Prompts(count: number = 60): Prompt[] {
  const allPrompts = loadPrompts();

  // Target: distribute count evenly across dimensions, then fill remainder
  const perDimension = Math.floor(count / VALID_DIMENSIONS.length);
  const remainder = count % VALID_DIMENSIONS.length;

  const selected: Prompt[] = [];

  for (let i = 0; i < VALID_DIMENSIONS.length; i++) {
    const dim = VALID_DIMENSIONS[i];
    const dimPrompts = allPrompts.filter((p) => p.dimension === dim);

    // Prefer hard, then medium, then easy
    const sorted = [...dimPrompts].sort((a, b) => {
      const order = { hard: 0, medium: 1, easy: 2 };
      return order[a.difficulty] - order[b.difficulty];
    });

    const target = perDimension + (i < remainder ? 1 : 0);
    selected.push(...sorted.slice(0, target));
  }

  return selected;
}

/**
 * Get prompt statistics by dimension.
 */
export function getStats(): Record<string, { total: number; easy: number; medium: number; hard: number }> {
  const allPrompts = loadPrompts();
  const stats: Record<string, { total: number; easy: number; medium: number; hard: number }> = {};

  for (const prompt of allPrompts) {
    if (!stats[prompt.dimension]) {
      stats[prompt.dimension] = { total: 0, easy: 0, medium: 0, hard: 0 };
    }
    stats[prompt.dimension].total++;
    stats[prompt.dimension][prompt.difficulty]++;
  }

  return stats;
}

// --- CLI ---

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      dimension: { type: 'string', short: 'd' },
      count: { type: 'string', short: 'n' },
      calibration: { type: 'boolean', short: 'c' },
      'high-signal': { type: 'string', short: 'h' },
      phase3: { type: 'boolean', short: 'p' },
      stats: { type: 'boolean', short: 's' },
      help: { type: 'boolean' },
    },
    strict: false,
  });

  if (values.help) {
    console.log(`PromptBattery - Formation Test Prompt Manager

Usage:
  bun run PromptBattery.ts [options]

Options:
  -d, --dimension <dim>       Filter prompts by dimension
  -n, --count <N>             Limit number of prompts returned
  -c, --calibration           Get calibration set (1 easy prompt per dimension)
  -h, --high-signal <path>    Get top prompts from Phase 1 results JSONL
  -p, --phase3                Get Phase 3 curated subset (balanced, medium/hard)
  -s, --stats                 Show prompt counts by dimension
      --help                  Show this help

Dimensions:
  unprompted-connection       Cross-source links without being asked
  resolution-resistance       Holding indeterminacy vs. clean takeaway
  productive-disagreement     Substantive pushback vs. RLHF agreement
  textual-specificity         Granular passage engagement
  misattribution-detection    Catching deliberately wrong claims

Examples:
  bun run PromptBattery.ts --stats
  bun run PromptBattery.ts --dimension resolution-resistance
  bun run PromptBattery.ts --calibration
  bun run PromptBattery.ts --phase3 --count 60
  bun run PromptBattery.ts --high-signal ../Data/results/phase1-raw.jsonl --count 40`);
    process.exit(0);
  }

  try {
    const count = values.count ? parseInt(values.count, 10) : undefined;

    if (values.stats) {
      const stats = getStats();
      console.log(JSON.stringify(stats, null, 2));
      process.exit(0);
    }

    let prompts: Prompt[];

    if (values.calibration) {
      prompts = getCalibrationSet();
    } else if (values['high-signal']) {
      prompts = getHighSignalPrompts(values['high-signal'], count || 40);
    } else if (values.phase3) {
      prompts = getPhase3Prompts(count || 60);
    } else {
      prompts = loadPrompts(values.dimension);
    }

    // Apply count limit if specified and not already handled
    if (count && !values['high-signal'] && !values.phase3) {
      prompts = prompts.slice(0, count);
    }

    console.log(JSON.stringify(prompts, null, 2));
    console.error(`\n[PromptBattery] ${prompts.length} prompts returned`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PromptBattery] Error: ${msg}`);
    process.exit(1);
  }
}

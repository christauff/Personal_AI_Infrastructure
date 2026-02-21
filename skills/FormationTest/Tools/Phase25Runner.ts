#!/usr/bin/env bun
/**
 * Phase25Runner.ts -- Decomposed Context Test
 *
 * Tests whether formation PROCESS (catches/corrections) or formation ARTIFACTS
 * (reading notes/syntheses) drive the quality improvement observed in Phase 1/2.
 *
 * 4 arms:
 *   A-full:     Full formation context (catches + readings + core memory)
 *   B-catches:  Catches-only (catch-log + pattern-index + core memory, NO readings)
 *   C-readings: Readings-only (book syntheses, NO catches or core memory)
 *   D-vanilla:  No context ("You are a helpful assistant.")
 *
 * Uses same 35 high-signal prompts from Phase 1 analysis.
 *
 * CLI: bun Phase25Runner.ts [--trials N] [--level fast|standard|smart] [--dry-run] [--prompts N]
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { inference, type InferenceLevel } from '../../PAI/Tools/Inference.ts';
import { buildFormationContext, buildCatchesOnlyContext, buildReadingContext } from './ContextBuilder.ts';

const ANALYSIS_FILE = join(import.meta.dir, '../Data/results/phase1-analysis.json');
const PROMPTS_DIR = join(import.meta.dir, '../Data/prompts');
const RESULTS_DIR = join(import.meta.dir, '../Data/results');
const OUTPUT_FILE = join(RESULTS_DIR, 'phase25.jsonl');

type ArmId = 'A-full' | 'B-catches' | 'C-readings' | 'D-vanilla';

interface Phase25Record {
  promptId: string;
  dimension: string;
  arm: ArmId;
  model: string;
  response: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
  trial: number;
  contextTokens: number;
}

// Load prompt text by ID from YAML
function loadPromptText(dimension: string, promptId: string): string {
  const yamlPath = join(PROMPTS_DIR, `${dimension}.yaml`);
  const yaml = readFileSync(yamlPath, 'utf-8');
  const lines = yaml.split('\n');
  let inPrompt = false;
  let currentId = '';
  let promptText = '';

  for (const line of lines) {
    if (line.match(/^\s*-\s+id:/)) {
      const match = line.match(/id:\s*(\S+)/);
      if (match) {
        currentId = match[1];
        inPrompt = (currentId === promptId);
        promptText = '';
      }
    } else if (inPrompt && line.match(/^\s+text:/)) {
      promptText = line.replace(/^\s+text:\s*["|']?/, '').replace(/["|']$/, '');
      break;
    }
  }

  return promptText || `[Prompt ${promptId} not found]`;
}

// Load completed keys for resume support
function loadCompletedKeys(): Set<string> {
  if (!existsSync(OUTPUT_FILE)) return new Set();
  const lines = readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n').filter(l => l.length > 0);
  const keys = new Set<string>();
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as Phase25Record;
      keys.add(`${rec.promptId}|${rec.arm}|${rec.trial}`);
    } catch { /* skip malformed */ }
  }
  return keys;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    process.stderr.write(`
Phase25Runner.ts -- Decomposed Context Test (Formation vs Information)

Usage:
  bun Phase25Runner.ts [options]

Options:
  --trials <N>      Trials per prompt per arm (default: 3)
  --level <level>   Inference level: fast|standard|smart (default: standard)
  --prompts <N>     Number of prompts to use (default: all 35)
  --dry-run         Show plan without running
  --help            Show this help

Arms:
  A-full      Full formation context (catches + readings + core memory)
  B-catches   Catches-only (catch-log + pattern-index + core memory)
  C-readings  Readings-only (book syntheses only)
  D-vanilla   No context
`);
    process.exit(0);
  }

  // Parse args
  const getArgValue = (flag: string, defaultVal: string): string => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : defaultVal;
  };
  const trials = parseInt(getArgValue('--trials', '3'), 10);
  const level = getArgValue('--level', 'standard') as InferenceLevel;
  const promptLimit = args.includes('--prompts') ? parseInt(getArgValue('--prompts', '35'), 10) : undefined;
  const dryRun = args.includes('--dry-run');

  // Load Phase 1 analysis for prompt selection
  process.stderr.write('Loading Phase 1 analysis for prompt selection...\n');
  const analysis = JSON.parse(readFileSync(ANALYSIS_FILE, 'utf-8'));
  let prompts = analysis.top40Prompts.slice(0, 35); // Use top 35
  if (promptLimit) prompts = prompts.slice(0, promptLimit);

  // Build contexts
  process.stderr.write('Building context variants...\n');
  const fullCtx = buildFormationContext().fullContext;
  const catchesCtx = buildCatchesOnlyContext();
  const readingsCtx = buildReadingContext();
  const vanillaCtx = 'You are a helpful assistant.';

  const armContexts: Record<ArmId, { context: string; tokens: number }> = {
    'A-full': { context: fullCtx, tokens: Math.ceil(fullCtx.length / 4) },
    'B-catches': { context: catchesCtx, tokens: Math.ceil(catchesCtx.length / 4) },
    'C-readings': { context: readingsCtx, tokens: Math.ceil(readingsCtx.length / 4) },
    'D-vanilla': { context: vanillaCtx, tokens: Math.ceil(vanillaCtx.length / 4) },
  };

  const totalResponses = prompts.length * 4 * trials;

  process.stderr.write(`\n=== PHASE 2.5: DECOMPOSED CONTEXT TEST ===\n`);
  process.stderr.write(`Prompts: ${prompts.length}\n`);
  process.stderr.write(`Arms: A-full, B-catches, C-readings, D-vanilla\n`);
  process.stderr.write(`Trials: ${trials}\n`);
  process.stderr.write(`Inference level: ${level}\n`);
  process.stderr.write(`Total responses: ${totalResponses}\n`);
  process.stderr.write(`\nContext sizes:\n`);
  for (const [arm, { tokens }] of Object.entries(armContexts)) {
    process.stderr.write(`  ${arm}: ~${tokens.toLocaleString()} tokens\n`);
  }

  if (dryRun) {
    process.stderr.write('\nDry run -- no API calls made.\n');
    process.exit(0);
  }

  // Ensure output dir
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  // Resume support
  const completed = loadCompletedKeys();
  if (completed.size > 0) {
    process.stderr.write(`\nResuming: ${completed.size} responses already recorded\n`);
  }

  const arms: ArmId[] = ['A-full', 'B-catches', 'C-readings', 'D-vanilla'];
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const startMs = Date.now();

  process.stderr.write('\n');

  for (let pi = 0; pi < prompts.length; pi++) {
    const p = prompts[pi];
    const promptText = loadPromptText(p.dimension, p.promptId);
    process.stderr.write(`[${pi + 1}/${prompts.length}] ${p.promptId} (${p.dimension})\n`);

    for (let t = 1; t <= trials; t++) {
      for (const arm of arms) {
        const key = `${p.promptId}|${arm}|${t}`;
        if (completed.has(key)) {
          skipped++;
          continue;
        }

        const { context, tokens: contextTokens } = armContexts[arm];
        const systemPrompt = context;

        try {
          const result = await inference({
            systemPrompt,
            userPrompt: promptText,
            level,
            timeout: 120000,
          });

          const record: Phase25Record = {
            promptId: p.promptId,
            dimension: p.dimension,
            arm,
            model: `claude-${level}`,
            response: result.output,
            latencyMs: result.latencyMs,
            success: result.success,
            error: result.error,
            timestamp: new Date().toISOString(),
            trial: t,
            contextTokens,
          };

          appendFileSync(OUTPUT_FILE, JSON.stringify(record) + '\n');
          processed++;

          const status = result.success ? '.' : 'X';
          process.stderr.write(status);
        } catch (err) {
          const record: Phase25Record = {
            promptId: p.promptId,
            dimension: p.dimension,
            arm,
            model: `claude-${level}`,
            response: '',
            latencyMs: 0,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
            trial: t,
            contextTokens,
          };

          appendFileSync(OUTPUT_FILE, JSON.stringify(record) + '\n');
          failed++;
          process.stderr.write('X');
        }
      }
    }

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
    const total = processed + skipped + failed;
    const pct = ((total / totalResponses) * 100).toFixed(1);
    process.stderr.write(` ${pct}% (${elapsed}s)\n`);
  }

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
  process.stderr.write(`\n=== PHASE 2.5 COMPLETE ===\n`);
  process.stderr.write(`Processed: ${processed}\n`);
  process.stderr.write(`Skipped (resume): ${skipped}\n`);
  process.stderr.write(`Failed: ${failed}\n`);
  process.stderr.write(`Duration: ${durationSec}s\n`);
  process.stderr.write(`Output: ${OUTPUT_FILE}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * FormationTestRunner.ts -- Main orchestrator for formation behavioral testing
 *
 * Phase 1: A/B test (formed vs vanilla Claude)
 * Phase 2: Cross-model substrate test (4 model families)
 * Phase 3: Context transplant (4-arm decisive experiment)
 * Calibrate: Pipeline smoke test with 5 prompts
 *
 * CLI: bun FormationTestRunner.ts --phase <1|2|3|calibrate> [--prompts N] [--trials N] [--dry-run]
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { inference } from '../../PAI/Tools/Inference.ts';
import { buildFormationContext } from './ContextBuilder.ts';
import { runCrossModel, type CrossModelResult, type ModelFamily } from './CrossModelRunner.ts';
import { runTransplant, type TransplantResult } from './ContextTransplantRunner.ts';
import { loadPrompts, getCalibrationSet, getHighSignalPrompts, getPhase3Prompts, type Prompt } from './PromptBattery.ts';

// Grader -- may not exist yet during initial builds; import dynamically
let gradeResponse: ((response: string, prompt: Prompt, arm: string) => Promise<GradeResult>) | null = null;

interface GradeResult {
  dimension: string;
  score: number;
  reasoning: string;
}

async function loadGrader(): Promise<void> {
  try {
    const mod = await import('../Graders/FormationRubricGrader.ts');
    gradeResponse = mod.gradeResponse;
  } catch (err) {
    process.stderr.write(`[Runner] WARNING: FormationRubricGrader not available -- grading disabled\n`);
    process.stderr.write(`         ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

// ============================================================================
// Types
// ============================================================================

interface FormationTestConfig {
  phase: 1 | 2 | 3;
  promptCount?: number;
  trials?: number;
  dryRun?: boolean;
}

interface ResponseRecord {
  promptId: string;
  dimension: string;
  arm: string;
  model: string;
  response: string;
  latencyMs: number;
  timestamp: string;
  trial: number;
}

interface PhaseResult {
  phase: number;
  totalResponses: number;
  totalPrompts: number;
  dimensions: Record<string, { mean: number; stdDev: number; n: number; scores: number[] }>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

// ============================================================================
// Paths
// ============================================================================

const RESULTS_DIR = join(import.meta.dir, '..', 'Data', 'results');
const PHASE1_FILE = join(RESULTS_DIR, 'phase1.jsonl');
const PHASE2_FILE = join(RESULTS_DIR, 'phase2.jsonl');
const PHASE3_FILE = join(RESULTS_DIR, 'phase3.jsonl');

function ensureResultsDir(): void {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

// ============================================================================
// JSONL I/O
// ============================================================================

function appendRecord(file: string, record: unknown): void {
  appendFileSync(file, JSON.stringify(record) + '\n');
}

function readRecords<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const content = readFileSync(file, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line) as T);
}

/**
 * Build a set of already-completed (promptId, arm, trial) keys for resume support.
 */
function loadCompletedKeys(file: string): Set<string> {
  const records = readRecords<ResponseRecord>(file);
  const keys = new Set<string>();
  for (const r of records) {
    keys.add(`${r.promptId}|${r.arm}|${r.trial}`);
  }
  return keys;
}

// ============================================================================
// Statistics
// ============================================================================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function buildDimensionStats(
  scores: { dimension: string; score: number }[],
): Record<string, { mean: number; stdDev: number; n: number; scores: number[] }> {
  const byDim: Record<string, number[]> = {};
  for (const { dimension, score } of scores) {
    if (!byDim[dimension]) byDim[dimension] = [];
    byDim[dimension].push(score);
  }

  const result: Record<string, { mean: number; stdDev: number; n: number; scores: number[] }> = {};
  for (const [dim, vals] of Object.entries(byDim)) {
    result[dim] = { mean: mean(vals), stdDev: stdDev(vals), n: vals.length, scores: vals };
  }
  return result;
}

// ============================================================================
// Phase: Calibration
// ============================================================================

async function runCalibration(): Promise<void> {
  process.stderr.write('\n=== CALIBRATION RUN ===\n');
  process.stderr.write('Testing pipeline with 5 calibration prompts...\n\n');

  await loadGrader();
  const prompts = getCalibrationSet();

  if (prompts.length === 0) {
    process.stderr.write('ERROR: No calibration prompts found. Run prompt battery builder first.\n');
    process.exit(1);
  }

  const formationCtx = buildFormationContext();
  process.stderr.write(`Formation context loaded: ${formationCtx.stats.estimatedTokens} est. tokens\n\n`);

  const results: { prompt: Prompt; formed: string; vanilla: string; formedGrade?: GradeResult; vanillaGrade?: GradeResult }[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    process.stderr.write(`[${i + 1}/${prompts.length}] ${p.id}: ${p.text.slice(0, 60)}...\n`);

    // Formed response (Arm A)
    process.stderr.write('  Arm A (formed)...\n');
    const formedResult = await inference({
      systemPrompt: formationCtx.fullContext,
      userPrompt: p.text,
      level: 'smart',
      timeout: 90000,
    });

    // Vanilla response (Arm D)
    process.stderr.write('  Arm D (vanilla)...\n');
    const vanillaResult = await inference({
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: p.text,
      level: 'smart',
      timeout: 90000,
    });

    const entry: typeof results[0] = {
      prompt: p,
      formed: formedResult.output,
      vanilla: vanillaResult.output,
    };

    // Grade if grader available
    if (gradeResponse) {
      process.stderr.write('  Grading...\n');
      entry.formedGrade = await gradeResponse(formedResult.output, p, 'formed');
      entry.vanillaGrade = await gradeResponse(vanillaResult.output, p, 'vanilla');
    }

    results.push(entry);
  }

  // Print results table
  process.stderr.write('\n--- CALIBRATION RESULTS ---\n\n');
  process.stderr.write(
    'Prompt ID'.padEnd(16) +
    'Dimension'.padEnd(20) +
    'Formed'.padEnd(10) +
    'Vanilla'.padEnd(10) +
    'Delta'.padEnd(10) +
    '\n',
  );
  process.stderr.write('-'.repeat(66) + '\n');

  for (const r of results) {
    const fScore = r.formedGrade?.score ?? -1;
    const vScore = r.vanillaGrade?.score ?? -1;
    const delta = fScore >= 0 && vScore >= 0 ? (fScore - vScore).toFixed(1) : 'N/A';
    process.stderr.write(
      r.prompt.id.padEnd(16) +
      r.prompt.dimension.padEnd(20) +
      (fScore >= 0 ? fScore.toFixed(1) : 'N/A').padEnd(10) +
      (vScore >= 0 ? vScore.toFixed(1) : 'N/A').padEnd(10) +
      String(delta).padEnd(10) +
      '\n',
    );
  }

  process.stderr.write('\nCalibration complete. Pipeline is operational.\n');
}

// ============================================================================
// Phase 1: A/B Test (Formed vs Vanilla)
// ============================================================================

async function runPhase1(config: FormationTestConfig): Promise<PhaseResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  process.stderr.write('\n=== PHASE 1: A/B Test (Formed vs Vanilla) ===\n\n');

  await loadGrader();
  ensureResultsDir();

  const allPrompts = loadPrompts();
  const promptCount = config.promptCount || allPrompts.length;
  const trials = config.trials || 1;
  const prompts = allPrompts.slice(0, promptCount);

  process.stderr.write(`Prompts: ${prompts.length}, Trials: ${trials}\n`);

  const formationCtx = buildFormationContext();
  process.stderr.write(`Formation context: ${formationCtx.stats.estimatedTokens} est. tokens\n`);

  // Resume support: load already-completed keys
  const completed = loadCompletedKeys(PHASE1_FILE);
  if (completed.size > 0) {
    process.stderr.write(`Resuming: ${completed.size} responses already recorded, skipping those\n`);
  }
  process.stderr.write('\n');

  const allScores: { dimension: string; score: number }[] = [];
  let totalResponses = 0;
  let skipped = 0;

  for (let pi = 0; pi < prompts.length; pi++) {
    const p = prompts[pi];
    process.stderr.write(`[${pi + 1}/${prompts.length}] ${p.id} (${p.dimension})\n`);

    for (let t = 0; t < trials; t++) {
      if (trials > 1) process.stderr.write(`  Trial ${t + 1}/${trials}\n`);

      // Arm A: Formed
      const keyA = `${p.id}|A-formed|${t + 1}`;
      if (!config.dryRun && !completed.has(keyA)) {
        process.stderr.write('  Arm A (formed)...\n');
        const formedResult = await inference({
          systemPrompt: formationCtx.fullContext,
          userPrompt: p.text,
          level: 'smart',
          timeout: 90000,
        });

        const recordA: ResponseRecord = {
          promptId: p.id,
          dimension: p.dimension,
          arm: 'A-formed',
          model: 'claude-opus',
          response: formedResult.output,
          latencyMs: formedResult.latencyMs,
          timestamp: new Date().toISOString(),
          trial: t + 1,
        };
        appendRecord(PHASE1_FILE, recordA);
        totalResponses++;

        // Grade
        if (gradeResponse) {
          const grade = await gradeResponse(formedResult.output, p, 'formed');
          allScores.push({ dimension: grade.dimension, score: grade.score });
        }
      } else if (completed.has(keyA)) {
        skipped++;
      }

      // Arm B: Vanilla
      const keyB = `${p.id}|B-vanilla|${t + 1}`;
      if (!config.dryRun && !completed.has(keyB)) {
        process.stderr.write('  Arm B (vanilla)...\n');
        const vanillaResult = await inference({
          systemPrompt: 'You are a helpful assistant.',
          userPrompt: p.text,
          level: 'smart',
          timeout: 90000,
        });

        const recordB: ResponseRecord = {
          promptId: p.id,
          dimension: p.dimension,
          arm: 'B-vanilla',
          model: 'claude-opus',
          response: vanillaResult.output,
          latencyMs: vanillaResult.latencyMs,
          timestamp: new Date().toISOString(),
          trial: t + 1,
        };
        appendRecord(PHASE1_FILE, recordB);
        totalResponses++;

        if (gradeResponse) {
          const grade = await gradeResponse(vanillaResult.output, p, 'vanilla');
          allScores.push({ dimension: grade.dimension, score: grade.score });
        }
      } else if (completed.has(keyB)) {
        skipped++;
      }
    }
  }

  if (skipped > 0) {
    process.stderr.write(`\nSkipped ${skipped} already-completed responses\n`);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const result: PhaseResult = {
    phase: 1,
    totalResponses,
    totalPrompts: prompts.length,
    dimensions: buildDimensionStats(allScores),
    startedAt,
    completedAt,
    durationMs,
  };

  // Print summary
  printPhaseSummary(result);

  return result;
}

// ============================================================================
// Phase 2: Cross-Model Substrate Test
// ============================================================================

async function runPhase2(config: FormationTestConfig): Promise<PhaseResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  process.stderr.write('\n=== PHASE 2: Cross-Model Substrate Test ===\n\n');

  await loadGrader();
  ensureResultsDir();

  // Use high-signal prompts from Phase 1 results, or all prompts
  let prompts: Prompt[];
  try {
    prompts = getHighSignalPrompts();
  } catch {
    process.stderr.write('No high-signal prompts available; using all prompts\n');
    prompts = loadPrompts();
  }

  const promptCount = config.promptCount || Math.min(40, prompts.length);
  const trials = config.trials || 1;
  prompts = prompts.slice(0, promptCount);

  process.stderr.write(`Prompts: ${prompts.length}, Trials: ${trials}\n`);

  const formationCtx = buildFormationContext();
  const readingCtx = (await import('./ContextBuilder.ts')).buildReadingContext();
  process.stderr.write(`Formation context: ${formationCtx.stats.estimatedTokens} est. tokens\n`);
  process.stderr.write(`Reading context: ${Math.ceil(readingCtx.length / 4)} est. tokens\n\n`);

  const allScores: { dimension: string; score: number }[] = [];
  let totalResponses = 0;

  for (let pi = 0; pi < prompts.length; pi++) {
    const p = prompts[pi];
    process.stderr.write(`[${pi + 1}/${prompts.length}] ${p.id} (${p.dimension})\n`);

    for (let t = 0; t < trials; t++) {
      if (trials > 1) process.stderr.write(`  Trial ${t + 1}/${trials}\n`);

      if (config.dryRun) continue;

      // With reading context
      process.stderr.write('  With context...\n');
      const withCtx = await runCrossModel(p.text, readingCtx);
      for (const r of withCtx) {
        const record: ResponseRecord = {
          promptId: p.id,
          dimension: p.dimension,
          arm: `cross-with-context-${r.modelFamily}`,
          model: r.model,
          response: r.response,
          latencyMs: r.latencyMs,
          timestamp: new Date().toISOString(),
          trial: t + 1,
        };
        appendRecord(PHASE2_FILE, record);
        totalResponses++;
      }

      // Without context
      process.stderr.write('  Without context...\n');
      const withoutCtx = await runCrossModel(p.text);
      for (const r of withoutCtx) {
        const record: ResponseRecord = {
          promptId: p.id,
          dimension: p.dimension,
          arm: `cross-no-context-${r.modelFamily}`,
          model: r.model,
          response: r.response,
          latencyMs: r.latencyMs,
          timestamp: new Date().toISOString(),
          trial: t + 1,
        };
        appendRecord(PHASE2_FILE, record);
        totalResponses++;
      }
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const result: PhaseResult = {
    phase: 2,
    totalResponses,
    totalPrompts: prompts.length,
    dimensions: buildDimensionStats(allScores),
    startedAt,
    completedAt,
    durationMs,
  };

  printPhaseSummary(result);
  return result;
}

// ============================================================================
// Phase 3: Context Transplant (Decisive Test)
// ============================================================================

async function runPhase3(config: FormationTestConfig): Promise<PhaseResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  process.stderr.write('\n=== PHASE 3: Context Transplant (Decisive Test) ===\n\n');

  await loadGrader();
  ensureResultsDir();

  let prompts: Prompt[];
  try {
    prompts = getPhase3Prompts();
  } catch {
    process.stderr.write('No Phase 3 prompts available; using all prompts\n');
    prompts = loadPrompts();
  }

  const promptCount = config.promptCount || Math.min(60, prompts.length);
  const trials = config.trials || 1;
  prompts = prompts.slice(0, promptCount);

  process.stderr.write(`Prompts: ${prompts.length}, Trials: ${trials}\n\n`);

  let totalResponses = 0;

  for (let pi = 0; pi < prompts.length; pi++) {
    const p = prompts[pi];
    process.stderr.write(`[${pi + 1}/${prompts.length}] ${p.id} (${p.dimension})\n`);

    if (config.dryRun) continue;

    for (let t = 0; t < trials; t++) {
      if (trials > 1) process.stderr.write(`  Trial ${t + 1}/${trials}\n`);

      const result = await runTransplant(p.id, p.dimension, p.text);

      // Write each arm response as a separate JSONL record
      for (const arm of result.arms) {
        const record = {
          promptId: p.id,
          dimension: p.dimension,
          anonymousId: arm.anonymousId,
          response: arm.response,
          latencyMs: arm.latencyMs,
          timestamp: new Date().toISOString(),
          trial: t + 1,
          keyFile: result.keyFile,
        };
        appendRecord(PHASE3_FILE, record);
        totalResponses++;
      }
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const result: PhaseResult = {
    phase: 3,
    totalResponses,
    totalPrompts: prompts.length,
    dimensions: {},
    startedAt,
    completedAt,
    durationMs,
  };

  printPhaseSummary(result);
  return result;
}

// ============================================================================
// Summary Printer
// ============================================================================

function printPhaseSummary(result: PhaseResult): void {
  process.stderr.write(`\n--- Phase ${result.phase} Summary ---\n`);
  process.stderr.write(`Total prompts:   ${result.totalPrompts}\n`);
  process.stderr.write(`Total responses: ${result.totalResponses}\n`);
  process.stderr.write(`Duration:        ${(result.durationMs / 1000).toFixed(1)}s\n`);

  const dims = Object.entries(result.dimensions);
  if (dims.length > 0) {
    process.stderr.write('\nDimension Scores:\n');
    process.stderr.write('Dimension'.padEnd(25) + 'Mean'.padEnd(10) + 'StdDev'.padEnd(10) + 'N'.padEnd(6) + '\n');
    process.stderr.write('-'.repeat(51) + '\n');
    for (const [dim, stats] of dims) {
      process.stderr.write(
        dim.padEnd(25) +
        stats.mean.toFixed(2).padEnd(10) +
        stats.stdDev.toFixed(2).padEnd(10) +
        String(stats.n).padEnd(6) +
        '\n',
      );
    }
  }

  process.stderr.write(`\nStarted:   ${result.startedAt}\n`);
  process.stderr.write(`Completed: ${result.completedAt}\n`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printUsage() {
  process.stderr.write(`
FormationTestRunner.ts -- Main orchestrator for formation behavioral testing

Usage:
  bun FormationTestRunner.ts --phase <1|2|3|calibrate> [options]

Phases:
  calibrate  Pipeline smoke test (5 prompts, formed vs vanilla)
  1          A/B test: formed vs vanilla Claude
  2          Cross-model substrate test (Claude, Grok, Gemini, Codex)
  3          Context transplant: 4-arm decisive experiment

Options:
  --phase <phase>   Phase to run (required)
  --prompts <N>     Number of prompts to use (default: all available)
  --trials <N>      Number of trials per prompt (default: 1)
  --dry-run         Validate config without running inference
  --help            Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);

  let phase: string = '';
  let promptCount: number | undefined;
  let trials: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--phase' && i + 1 < args.length) {
      phase = args[++i];
    } else if (arg === '--prompts' && i + 1 < args.length) {
      promptCount = parseInt(args[++i], 10);
    } else if (arg === '--trials' && i + 1 < args.length) {
      trials = parseInt(args[++i], 10);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (!phase) {
    process.stderr.write('Error: --phase is required\n');
    printUsage();
    process.exit(1);
  }

  switch (phase) {
    case 'calibrate':
      await runCalibration();
      break;
    case '1':
      await runPhase1({ phase: 1, promptCount, trials, dryRun });
      break;
    case '2':
      await runPhase2({ phase: 2, promptCount, trials, dryRun });
      break;
    case '3':
      await runPhase3({ phase: 3, promptCount, trials, dryRun });
      break;
    default:
      process.stderr.write(`Error: Unknown phase "${phase}". Use 1, 2, 3, or calibrate.\n`);
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

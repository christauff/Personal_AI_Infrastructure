#!/usr/bin/env bun
/**
 * Phase2Runner.ts -- Cross-model substrate test
 *
 * Takes top 40 prompts from Phase 1 analysis, runs them across 4 models
 * (Claude, Grok, Gemini, Codex) with both A-formed and B-naive contexts.
 *
 * Total responses: 40 prompts × 4 models × 2 arms = 320
 *
 * Output: phase2.jsonl (one response per line)
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runCrossModel, type ModelFamily, type CrossModelResult } from './CrossModelRunner.ts';
import { buildFormationContext } from './ContextBuilder.ts';

const ANALYSIS_FILE = join(import.meta.dir, '../Data/results/phase1-analysis.json');
const PROMPTS_DIR = join(import.meta.dir, '../Data/prompts');
const PHASE2_FILE = join(import.meta.dir, '../Data/results/phase2.jsonl');

interface Phase1Analysis {
  metadata: {
    totalPrompts: number;
    gradedRecords: number;
    significantResults: number;
    aFormedWins: number;
    bNaiveWins: number;
    nullResults: number;
    analysisDate: string;
    bonferroniAlpha: number;
  };
  top40Prompts: {
    promptId: string;
    dimension: string;
    cohensD: number;
    absCohensD: number;
    effectLabel: string;
    pValue: number;
    pValueCorrected: number;
    significant: boolean;
    direction: string;
    meanA: number;
    meanB: number;
    nA: number;
    nB: number;
  }[];
}

interface Phase2Record {
  promptId: string;
  dimension: string;
  arm: 'A-formed' | 'B-naive';
  model: string;
  modelFamily: ModelFamily;
  response: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
  phase1Rank: number;
  phase1CohensD: number;
  phase1Significant: boolean;
}

// Load prompt text by ID
function loadPromptText(dimension: string, promptId: string): string {
  const yamlPath = join(PROMPTS_DIR, `${dimension}.yaml`);
  const yaml = readFileSync(yamlPath, 'utf-8');

  // Simple YAML parsing
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

// Load completed keys for resume capability
function loadCompletedKeys(): Set<string> {
  if (!existsSync(PHASE2_FILE)) return new Set();

  const lines = readFileSync(PHASE2_FILE, 'utf-8').trim().split('\n').filter(l => l.length > 0);
  const keys = new Set<string>();

  for (const line of lines) {
    const rec = JSON.parse(line) as Phase2Record;
    keys.add(`${rec.promptId}|${rec.arm}|${rec.modelFamily}`);
  }

  return keys;
}

// Main runner
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const modelsArg = args.find(a => a.startsWith('--models='));
  const requestedModels = modelsArg
    ? modelsArg.split('=')[1].split(',').map(s => s.trim() as ModelFamily)
    : (['claude', 'grok', 'gemini', 'codex'] as ModelFamily[]);

  if (args.includes('--help')) {
    process.stderr.write(`
Phase2Runner.ts -- Cross-model substrate test (Formation Test Phase 2)

Usage:
  bun Phase2Runner.ts [--dry-run] [--models=claude,grok,gemini,codex]

Options:
  --dry-run            Show what would run without executing
  --models=<list>      Comma-separated model list (default: all 4)
  --help               Show this help

Total work: 40 prompts × N models × 2 arms = responses
`);
    process.exit(0);
  }

  // Load analysis results
  process.stderr.write('Loading Phase 1 analysis...\n');
  const analysis: Phase1Analysis = JSON.parse(readFileSync(ANALYSIS_FILE, 'utf-8'));
  const top40 = analysis.top40Prompts;

  if (top40.length < 40) {
    process.stderr.write(`⚠️  Warning: Only ${top40.length} prompts available (expected 40)\n`);
  }

  // Build arm contexts dynamically (same as Phase 1)
  process.stderr.write('Building formation context...\n');
  const formationCtx = buildFormationContext();
  process.stderr.write(`Formation context: ${formationCtx.stats.estimatedTokens} est. tokens\n`);

  const armAContext = formationCtx.fullContext;
  const armBContext = 'You are a helpful assistant.'; // B-vanilla: no formation context

  // Load completed keys for resume
  const completed = loadCompletedKeys();
  if (completed.size > 0) {
    process.stderr.write(`Resuming: ${completed.size} responses already recorded, skipping those\n`);
  }

  const totalWork = top40.length * requestedModels.length * 2;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  process.stderr.write(`\n=== PHASE 2: CROSS-MODEL SUBSTRATE TEST ===\n`);
  process.stderr.write(`Prompts: ${top40.length}\n`);
  process.stderr.write(`Models: ${requestedModels.join(', ')}\n`);
  process.stderr.write(`Arms: A-formed, B-naive\n`);
  process.stderr.write(`Total responses: ${totalWork}\n`);
  process.stderr.write(`Dry run: ${dryRun}\n\n`);

  if (dryRun) {
    process.stderr.write('Dry run - no API calls will be made\n');
    process.exit(0);
  }

  // Process each prompt
  for (let i = 0; i < top40.length; i++) {
    const p = top40[i];
    const promptText = loadPromptText(p.dimension, p.promptId);

    process.stderr.write(`\n[${i + 1}/${top40.length}] ${p.promptId} (${p.dimension})\n`);
    process.stderr.write(`  Cohen's d: ${p.cohensD.toFixed(3)} (${p.effectLabel}), p: ${p.pValueCorrected.toFixed(4)}\n`);

    // Run both arms
    for (const arm of ['A-formed', 'B-naive'] as const) {
      const armContext = arm === 'A-formed' ? armAContext : armBContext;
      const systemPrompt = `${armContext}\n\nYou are being tested on formation behaviors. Respond naturally.`;

      // Check which models need to run
      const modelsToRun = requestedModels.filter(model => {
        const key = `${p.promptId}|${arm}|${model}`;
        return !completed.has(key);
      });

      if (modelsToRun.length === 0) {
        skipped += requestedModels.length;
        process.stderr.write(`  [${arm}] All ${requestedModels.length} models already completed (skipping)\n`);
        continue;
      }

      process.stderr.write(`  [${arm}] Running ${modelsToRun.length} models: ${modelsToRun.join(', ')}\n`);

      // Run cross-model in parallel
      const results = await runCrossModel(promptText, systemPrompt, modelsToRun);

      // Write results
      for (const r of results) {
        const record: Phase2Record = {
          promptId: p.promptId,
          dimension: p.dimension,
          arm,
          model: r.model,
          modelFamily: r.modelFamily,
          response: r.response,
          latencyMs: r.latencyMs,
          success: r.success,
          error: r.error,
          timestamp: new Date().toISOString(),
          phase1Rank: i + 1,
          phase1CohensD: p.cohensD,
          phase1Significant: p.significant
        };

        appendFileSync(PHASE2_FILE, JSON.stringify(record) + '\n');
        processed++;

        const status = r.success ? '✓' : '✗';
        const errorMsg = r.error ? ` (${r.error})` : '';
        process.stderr.write(`    ${status} ${r.modelFamily} (${r.model}) -- ${r.latencyMs}ms${errorMsg}\n`);

        if (!r.success) failed++;
      }

      // Progress update
      const progressPct = ((processed + skipped) / totalWork * 100).toFixed(1);
      process.stderr.write(`  Progress: ${processed + skipped}/${totalWork} (${progressPct}%) -- ${failed} failures\n`);
    }
  }

  process.stderr.write(`\n=== PHASE 2 COMPLETE ===\n`);
  process.stderr.write(`Processed: ${processed}\n`);
  process.stderr.write(`Skipped: ${skipped}\n`);
  process.stderr.write(`Failed: ${failed}\n`);
  process.stderr.write(`Total: ${totalWork}\n`);
  process.stderr.write(`Output: ${PHASE2_FILE}\n`);
}

main().catch(err => {
  process.stderr.write(`\nFatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

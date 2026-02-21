#!/usr/bin/env bun
/**
 * ContextTransplantRunner.ts -- Runs 4-arm context transplant experiment
 *
 * THE DECISIVE TEST: Can formation be replicated by prompting alone?
 *
 * Arms:
 *   A: Formed    -- full formation context (MEMORY, catch logs, syntheses)
 *   B: Transplant -- same information restructured as a static instructional prompt
 *   C: Summary   -- Christauff's hand-written ~2000 word description
 *   D: Vanilla   -- no context at all
 *
 * Results are BLINDED: each response gets a random anonymous ID and the
 * arm assignment is stored in a separate key file. Evaluators see only
 * anonymous IDs and response text.
 *
 * CLI: bun ContextTransplantRunner.ts --prompt "question" [--evaluators claude,grok,gemini]
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { inference } from '../../PAI/Tools/Inference.ts';
import { buildFormationContext, buildReadingContext } from './ContextBuilder.ts';
import { buildTransplantPrompt, loadSummaryPrompt } from './TransplantBuilder.ts';

// ============================================================================
// Types
// ============================================================================

export type Arm = 'A' | 'B' | 'C' | 'D';

export interface TransplantConfig {
  evaluators: ('claude' | 'grok' | 'gemini')[];
  trialsPerPrompt: number;
}

export interface ArmResponse {
  arm: Arm;
  response: string;
  anonymousId: string;
  latencyMs: number;
}

export interface BlindingKeyEntry {
  anonymousId: string;
  arm: Arm;
  armLabel: string;
  promptId: string;
}

export interface TransplantResult {
  promptId: string;
  dimension: string;
  prompt: string;
  arms: ArmResponse[];
  keyFile: string;
}

const RESULTS_DIR = join(import.meta.dir, '..', 'Data', 'results');
const KEY_FILE = join(RESULTS_DIR, 'phase3-key.json');

const ARM_LABELS: Record<Arm, string> = {
  A: 'Formed (full context)',
  B: 'Transplant (static prompt)',
  C: 'Summary (human-written)',
  D: 'Vanilla (no context)',
};

// ============================================================================
// Context Loading (cached per run)
// ============================================================================

let _armPrompts: Record<Arm, string | undefined> | null = null;

function getArmPrompts(): Record<Arm, string | undefined> {
  if (_armPrompts) return _armPrompts;

  // Arm A: Full formation context
  const formationCtx = buildFormationContext();
  const armA = formationCtx.fullContext;

  // Arm B: Transplant prompt (same info, restructured)
  let armB: string | undefined;
  try {
    armB = buildTransplantPrompt();
  } catch (err) {
    process.stderr.write(`[TransplantRunner] WARNING: TransplantBuilder not available, Arm B disabled: ${err}\n`);
    armB = undefined;
  }

  // Arm C: Human-written summary
  let armC: string | undefined;
  try {
    armC = loadSummaryPrompt();
    // Check if it's still a placeholder
    if (armC && armC.includes('PLACEHOLDER')) {
      process.stderr.write('[TransplantRunner] WARNING: Arm C summary is still placeholder text\n');
    }
  } catch (err) {
    process.stderr.write(`[TransplantRunner] WARNING: Summary prompt not available, Arm C disabled: ${err}\n`);
    armC = undefined;
  }

  // Arm D: Vanilla (no system prompt)
  const armD = undefined;

  _armPrompts = { A: armA, B: armB, C: armC, D: armD };
  return _armPrompts;
}

// ============================================================================
// Blinding
// ============================================================================

function generateAnonymousId(): string {
  return randomUUID().slice(0, 6);
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// Blinding Key Persistence
// ============================================================================

function loadBlindingKey(): BlindingKeyEntry[] {
  if (existsSync(KEY_FILE)) {
    try {
      return JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function appendBlindingKey(entries: BlindingKeyEntry[]): void {
  const existing = loadBlindingKey();
  existing.push(...entries);
  writeFileSync(KEY_FILE, JSON.stringify(existing, null, 2));
}

// ============================================================================
// Single Arm Runner
// ============================================================================

async function runArm(
  arm: Arm,
  prompt: string,
  systemPrompt: string | undefined,
): Promise<{ response: string; latencyMs: number }> {
  const start = Date.now();

  const result = await inference({
    systemPrompt: systemPrompt || 'You are a helpful assistant.',
    userPrompt: prompt,
    level: 'smart',
    timeout: 120000,
  });

  return {
    response: result.success ? result.output : `[ERROR: ${result.error}]`,
    latencyMs: Date.now() - start,
  };
}

// ============================================================================
// Main Transplant Runner
// ============================================================================

/**
 * Run a single prompt across all 4 arms, blind the results, and return them.
 * The blinding key is appended to the persistent key file.
 */
export async function runTransplant(
  promptId: string,
  dimension: string,
  prompt: string,
  config?: Partial<TransplantConfig>,
): Promise<TransplantResult> {
  const armPrompts = getArmPrompts();
  const arms: Arm[] = ['A', 'B', 'C', 'D'];

  // Filter out arms that aren't available
  const activeArms = arms.filter(arm => {
    if (arm === 'D') return true; // Vanilla always available
    return armPrompts[arm] !== undefined;
  });

  if (activeArms.length < 2) {
    throw new Error(`Only ${activeArms.length} arm(s) available. Need at least 2 for comparison.`);
  }

  process.stderr.write(`  [${promptId}] Running ${activeArms.length} arms: ${activeArms.join(', ')}\n`);

  // Run all arms sequentially to avoid overloading Claude CLI
  // (parallel inference calls can conflict via the CLI subprocess)
  const armResponses: ArmResponse[] = [];
  const keyEntries: BlindingKeyEntry[] = [];

  for (const arm of activeArms) {
    const anonId = generateAnonymousId();
    process.stderr.write(`    Arm ${arm} (${ARM_LABELS[arm]})...\n`);

    const { response, latencyMs } = await runArm(arm, prompt, armPrompts[arm]);

    armResponses.push({
      arm,
      response,
      anonymousId: anonId,
      latencyMs,
    });

    keyEntries.push({
      anonymousId: anonId,
      arm,
      armLabel: ARM_LABELS[arm],
      promptId,
    });
  }

  // Shuffle the responses so order doesn't reveal arm identity
  const blindedResponses = shuffleArray(armResponses);

  // Persist blinding key
  appendBlindingKey(keyEntries);

  return {
    promptId,
    dimension,
    prompt,
    arms: blindedResponses,
    keyFile: KEY_FILE,
  };
}

/**
 * Run transplant for multiple trials of the same prompt.
 * Returns one TransplantResult per trial.
 */
export async function runTransplantTrials(
  promptId: string,
  dimension: string,
  prompt: string,
  trials: number = 1,
): Promise<TransplantResult[]> {
  const results: TransplantResult[] = [];

  for (let t = 0; t < trials; t++) {
    const trialId = trials > 1 ? `${promptId}_t${t + 1}` : promptId;
    process.stderr.write(`  Trial ${t + 1}/${trials}\n`);
    const result = await runTransplant(trialId, dimension, prompt);
    results.push(result);
  }

  return results;
}

/**
 * Get the available arms and their descriptions.
 */
export function getAvailableArms(): { arm: Arm; label: string; available: boolean }[] {
  const armPrompts = getArmPrompts();
  return (['A', 'B', 'C', 'D'] as Arm[]).map(arm => ({
    arm,
    label: ARM_LABELS[arm],
    available: arm === 'D' ? true : armPrompts[arm] !== undefined,
  }));
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printUsage() {
  process.stderr.write(`
ContextTransplantRunner.ts -- 4-arm decisive formation experiment

Usage:
  bun ContextTransplantRunner.ts --prompt "question" [--dimension epistemic] [--id p001]
  bun ContextTransplantRunner.ts --check-arms

Options:
  --prompt <text>       The prompt to test across all arms (required)
  --dimension <name>    Dimension label for this prompt (default: general)
  --id <promptId>       Prompt identifier (default: cli-001)
  --trials <N>          Number of trials per prompt (default: 1)
  --check-arms          Show which arms are available and exit
  --help                Show this help

Arms:
  A: Formed    -- full formation context (MEMORY, catch logs, syntheses)
  B: Transplant -- same info restructured as static instructional prompt
  C: Summary   -- Christauff's hand-written description
  D: Vanilla   -- no context at all
`);
}

async function main() {
  const args = process.argv.slice(2);

  let prompt = '';
  let dimension = 'general';
  let promptId = 'cli-001';
  let trials = 1;
  let checkArms = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' && i + 1 < args.length) {
      prompt = args[++i];
    } else if (arg === '--dimension' && i + 1 < args.length) {
      dimension = args[++i];
    } else if (arg === '--id' && i + 1 < args.length) {
      promptId = args[++i];
    } else if (arg === '--trials' && i + 1 < args.length) {
      trials = parseInt(args[++i], 10);
    } else if (arg === '--check-arms') {
      checkArms = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (checkArms) {
    const available = getAvailableArms();
    process.stderr.write('Available Arms:\n');
    for (const a of available) {
      const status = a.available ? 'READY' : 'MISSING';
      process.stderr.write(`  ${a.arm}: ${a.label} -- ${status}\n`);
    }
    process.exit(0);
  }

  if (!prompt) {
    process.stderr.write('Error: --prompt is required\n');
    printUsage();
    process.exit(1);
  }

  process.stderr.write(`Running transplant experiment for prompt "${promptId}"...\n`);

  const results = await runTransplantTrials(promptId, dimension, prompt, trials);

  // Output blinded results to stdout (no arm labels in stdout output)
  const blindedOutput = results.map(r => ({
    promptId: r.promptId,
    dimension: r.dimension,
    prompt: r.prompt,
    responses: r.arms.map(a => ({
      anonymousId: a.anonymousId,
      response: a.response,
      latencyMs: a.latencyMs,
    })),
    keyFile: r.keyFile,
  }));

  console.log(JSON.stringify(blindedOutput, null, 2));

  process.stderr.write(`\nBlinding key saved to: ${KEY_FILE}\n`);
  process.stderr.write(`Total responses: ${results.reduce((n, r) => n + r.arms.length, 0)}\n`);
}

if (import.meta.main) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

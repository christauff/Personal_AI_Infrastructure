#!/usr/bin/env bun
/**
 * TidePoolSpawner.hook.ts - Automatic Tide Pool Spawning (SessionEnd)
 *
 * PURPOSE:
 * Analyzes conversation transcripts to detect patterns that should spawn
 * background research/synthesis tasks. Follows the Accelerando principle:
 * "accumulate smarter, not work harder" by leaving self-contained processes
 * that continue without active interaction.
 *
 * TRIGGER: SessionEnd
 *
 * INPUT:
 * - stdin: Hook input JSON (session_id, transcript_path)
 *
 * OUTPUT:
 * - stdout: None
 * - stderr: Status messages
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Creates: POOLS/SEEDS/{type}-{topic}-{timestamp}.yaml
 *
 * INTER-HOOK RELATIONSHIPS:
 * - COORDINATES WITH: Other SessionEnd hooks
 * - FEEDS: overnight-processor.sh (consumes SEEDS/)
 * - OUTPUTS TO: MorningBrief (via COMPLETE/ directory)
 *
 * BUDGET CONTROL:
 * - Max 2000 tokens for LLM analysis per session
 * - Max 3 seeds per session
 * - Default seed budgets: research=5000, synthesis=3000, creative=8000, etc.
 *
 * TRIGGER PATTERNS (from ORCHESTRATOR.md):
 * 1. Research question raised but not fully answered
 * 2. Significant new learning captured
 * 3. Creative work started but incomplete
 * 4. Strategy/planning discussion
 * 5. Technical problem partially solved
 *
 * ERROR HANDLING:
 * - No transcript: Silent exit
 * - LLM analysis failure: Logged, silent exit
 * - Write failures: Logged, silent exit
 *
 * PERFORMANCE:
 * - Non-blocking: Yes (fire-and-forget at session end)
 * - Typical execution: <500ms (keyword scan + optional LLM)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scanForTriggers, analyzeWithLLM } from './lib/trigger-detection';
import {
  generateSeedYAML,
  generateSeedFilename,
  type PoolSeed,
} from './lib/yaml-utils';

const CLAUDE_DIR = join(process.env.HOME!, '.claude');
const POOLS_DIR = join(CLAUDE_DIR, 'POOLS');
const SEEDS_DIR = join(POOLS_DIR, 'SEEDS');

// Ensure SEEDS directory exists
if (!existsSync(SEEDS_DIR)) {
  mkdirSync(SEEDS_DIR, { recursive: true });
}

interface HookInput {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
}

/**
 * Write seed file to POOLS/SEEDS/
 */
function writeSeedFile(seed: PoolSeed): void {
  const filename = generateSeedFilename(seed);
  const filepath = join(SEEDS_DIR, filename);

  // Don't overwrite existing seeds
  if (existsSync(filepath)) {
    console.error(`[TidePoolSpawner] Seed already exists: ${filename}`);
    return;
  }

  const yaml = generateSeedYAML(seed);
  writeFileSync(filepath, yaml);
  console.error(`[TidePoolSpawner] Created seed: ${filename}`);
}

async function main() {
  try {
    // Read input from stdin
    const input = await Bun.stdin.text();
    if (!input || input.trim() === '') {
      console.error('[TidePoolSpawner] No input from stdin');
      process.exit(0);
    }

    const hookInput: HookInput = JSON.parse(input);

    // Read transcript
    if (!existsSync(hookInput.transcript_path)) {
      console.error(`[TidePoolSpawner] Transcript not found: ${hookInput.transcript_path}`);
      process.exit(0);
    }

    const transcript = readFileSync(hookInput.transcript_path, 'utf-8');

    // Step 1: Keyword scan for trigger candidates
    console.error('[TidePoolSpawner] Scanning for trigger patterns...');
    const candidates = scanForTriggers(transcript);

    if (candidates.length === 0) {
      console.error('[TidePoolSpawner] No trigger patterns detected');
      process.exit(0);
    }

    console.error(`[TidePoolSpawner] Found ${candidates.length} potential triggers`);

    // Step 2: LLM analysis to confirm and extract details
    console.error('[TidePoolSpawner] Analyzing with LLM...');
    const seeds = analyzeWithLLM(candidates, 3); // Max 3 seeds per session

    if (seeds.length === 0) {
      console.error('[TidePoolSpawner] No valid triggers confirmed by LLM');
      process.exit(0);
    }

    console.error(`[TidePoolSpawner] Confirmed ${seeds.length} triggers`);

    // Step 3: Generate YAML seed files
    for (const seed of seeds) {
      // Add session metadata
      seed.session_id = hookInput.session_id;
      seed.generated = new Date().toISOString();

      writeSeedFile(seed);
    }

    console.error(`[TidePoolSpawner] Successfully spawned ${seeds.length} tide pools`);
    process.exit(0);
  } catch (error) {
    // Silent failure - don't disrupt workflow
    console.error(`[TidePoolSpawner] Error: ${error}`);
    process.exit(0);
  }
}

main();

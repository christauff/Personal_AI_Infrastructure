#!/usr/bin/env bun
/**
 * BudgetTracker.hook.ts - Track session usage on SessionEnd
 *
 * TRIGGER: SessionEnd
 *
 * INPUT: stdin JSON with { session_id, transcript_path }
 * OUTPUT: None (appends to BUDGET/usage.jsonl via TrackSession.ts)
 *
 * Non-blocking: always exits 0. Spawns TrackSession.ts with 5s timeout.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const PAI_DIR = join(process.env.HOME!, '.claude');
const TRACK_SESSION = join(PAI_DIR, 'skills', 'BudgetMonitor', 'Tools', 'TrackSession.ts');

async function main() {
  let input: any = {};

  try {
    const stdinData = readFileSync('/dev/stdin', 'utf-8').trim();
    if (stdinData) {
      input = JSON.parse(stdinData);
    }
  } catch {
    console.error('BudgetTracker: No valid stdin');
    process.exit(0);
  }

  const transcriptPath = input.transcript_path;
  if (!transcriptPath) {
    console.error('BudgetTracker: No transcript_path in input');
    process.exit(0);
  }

  try {
    const child = spawn('bun', ['run', TRACK_SESSION, `--transcript=${transcriptPath}`], {
      stdio: ['ignore', 'ignore', 'inherit'],
      detached: false,
    });

    // 5 second timeout
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      console.error('BudgetTracker: TrackSession timed out after 5s');
    }, 5000);

    child.on('close', () => clearTimeout(timeout));
    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`BudgetTracker: spawn error - ${err.message}`);
    });

    // Wait for child
    await new Promise<void>((resolve) => {
      child.on('close', resolve);
      child.on('error', resolve);
    });
  } catch (err) {
    console.error(`BudgetTracker: Error - ${err}`);
  }

  process.exit(0);
}

main();

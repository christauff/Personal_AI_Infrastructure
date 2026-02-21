#!/usr/bin/env bun
/**
 * ProofOfWork.ts — Deterministic verification runner
 *
 * Three-party trust model:
 *   Human designs proof patterns (trusted)
 *   LLM implements specifics (untrusted)
 *   Bash executes proofs, returns exit codes (deterministic)
 *
 * Discovery: globs GOVERNANCE/{name}.proof.sh and skills/{skill}/Tests/{name}.proof.sh
 * Execution: spawnSync('bash', [proofFile]) with 10s timeout per file
 * Output: JSONL to stdout, logged to MEMORY/EVALUATIONS/{YYYY-MM}/proof-results.jsonl
 *
 * Usage:
 *   bun ProofOfWork.ts                  # Run all discovered proofs
 *   bun ProofOfWork.ts <file.proof.sh>  # Run specific proof
 *   bun ProofOfWork.ts --list           # List discovered proof files
 *   bun ProofOfWork.ts --json           # JSON output for programmatic use
 *   bun ProofOfWork.ts --self-test      # Meta-verification (proves the prover works)
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import { paiPath } from '../../../hooks/lib/paths';
import { getISOTimestamp } from '../../../hooks/lib/time';
import { Glob } from 'bun';

// ── Types ──────────────────────────────────────────────────────

interface ProofCheck {
  check: string;
  result: 'pass' | 'fail' | 'skip';
  evidence: string;
}

interface ProofSummary {
  summary: true;
  total: number;
  passed: number;
  failed: number;
}

interface ProofFileResult {
  proofFile: string;
  target: string;
  checks: ProofCheck[];
  summary: ProofSummary;
  exitCode: number;
  durationMs: number;
}

interface ProofRunResult {
  timestamp: string;
  proofFiles: number;
  totalChecks: number;
  totalPassed: number;
  totalFailed: number;
  results: ProofFileResult[];
  allPassed: boolean;
}

// ── Discovery ──────────────────────────────────────────────────

function discoverProofFiles(): string[] {
  const patterns = [
    { dir: paiPath('GOVERNANCE'), glob: '*.proof.sh' },
    { dir: paiPath('skills'), glob: '*/Tests/*.proof.sh' },
  ];

  const files: string[] = [];

  for (const { dir, glob: pattern } of patterns) {
    if (!existsSync(dir)) continue;
    const g = new Glob(pattern);
    for (const match of g.scanSync({ cwd: dir, absolute: true })) {
      files.push(match);
    }
  }

  return files.sort();
}

// ── Execution ──────────────────────────────────────────────────

function parseProofOutput(stdout: string): { checks: ProofCheck[]; summary: ProofSummary | null } {
  const checks: ProofCheck[] = [];
  let summary: ProofSummary | null = null;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.summary === true) {
        summary = parsed as ProofSummary;
      } else if (parsed.check && parsed.result) {
        checks.push({
          check: String(parsed.check),
          result: parsed.result as 'pass' | 'fail' | 'skip',
          evidence: String(parsed.evidence || ''),
        });
      }
    } catch {
      // Non-JSONL output — ignore (stderr or debug lines)
    }
  }

  return { checks, summary };
}

function runProofFile(filePath: string): ProofFileResult {
  const start = Date.now();

  const result = spawnSync('bash', [filePath], {
    timeout: 10_000,
    encoding: 'utf-8',
    env: { ...process.env, PAI_DIR: paiPath() },
  });

  const durationMs = Date.now() - start;
  const stdout = (result.stdout || '') as string;
  const exitCode = result.status ?? -1;

  const { checks, summary } = parseProofOutput(stdout);

  // Derive target from filename: overnight-processor.proof.sh -> overnight-processor.sh
  const target = basename(filePath).replace('.proof.sh', '.sh');

  // If no summary was emitted, construct one from checks
  const finalSummary: ProofSummary = summary || {
    summary: true,
    total: checks.length,
    passed: checks.filter(c => c.result === 'pass').length,
    failed: checks.filter(c => c.result === 'fail').length,
  };

  return {
    proofFile: filePath,
    target,
    checks,
    summary: finalSummary,
    exitCode,
    durationMs,
  };
}

// ── Self-Test ──────────────────────────────────────────────────

function selfTest(): boolean {
  const testScript = `
set -uo pipefail
FAILURES=0
check() {
  printf '{"check":"%s","result":"%s","evidence":"%s"}\\n' "$1" "$2" "$3"
  if [[ "$2" == "fail" ]]; then FAILURES=$((FAILURES + 1)); fi
}
check "always-passes" "pass" "This check always passes"
check "math-works" "pass" "1+1=2"
check "deliberate-fail" "fail" "This check always fails (by design)"
printf '{"summary":true,"total":3,"passed":2,"failed":1}\\n'
exit $FAILURES
`;

  const result = spawnSync('bash', ['-c', testScript], {
    timeout: 5_000,
    encoding: 'utf-8',
  });

  const stdout = (result.stdout || '') as string;
  const exitCode = result.status ?? -1;
  const { checks, summary } = parseProofOutput(stdout);

  let passed = true;

  // Verify parser extracted all 3 checks
  if (checks.length !== 3) {
    console.error(`  SELF-TEST FAIL: Expected 3 checks, got ${checks.length}`);
    passed = false;
  }

  // Verify check results
  if (checks[0]?.result !== 'pass') {
    console.error(`  SELF-TEST FAIL: Check 1 should be pass, got ${checks[0]?.result}`);
    passed = false;
  }
  if (checks[2]?.result !== 'fail') {
    console.error(`  SELF-TEST FAIL: Check 3 should be fail, got ${checks[2]?.result}`);
    passed = false;
  }

  // Verify summary was parsed
  if (!summary || summary.total !== 3 || summary.passed !== 2 || summary.failed !== 1) {
    console.error(`  SELF-TEST FAIL: Summary mismatch:`, summary);
    passed = false;
  }

  // Verify exit code = number of failures
  if (exitCode !== 1) {
    console.error(`  SELF-TEST FAIL: Exit code should be 1, got ${exitCode}`);
    passed = false;
  }

  return passed;
}

// ── Logging ────────────────────────────────────────────────────

function logResults(runResult: ProofRunResult): void {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const logDir = paiPath('MEMORY', 'EVALUATIONS', yearMonth);

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = join(logDir, 'proof-results.jsonl');
  appendFileSync(logFile, JSON.stringify(runResult) + '\n');
}

// ── Display ────────────────────────────────────────────────────

function displayHuman(runResult: ProofRunResult): void {
  console.log(`\nProofOfWork — ${runResult.timestamp}`);
  console.log(`${'─'.repeat(60)}`);

  for (const r of runResult.results) {
    const icon = r.summary.failed === 0 ? '\u2705' : '\u274C';
    console.log(`\n${icon} ${basename(r.proofFile)} → ${r.target} (${r.durationMs}ms)`);

    for (const c of r.checks) {
      const sym = c.result === 'pass' ? '\u2713' : c.result === 'fail' ? '\u2717' : '\u2014';
      console.log(`  ${sym} ${c.check}: ${c.evidence}`);
    }

    console.log(`  ${r.summary.passed}/${r.summary.total} passed, ${r.summary.failed} failed`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  const allIcon = runResult.allPassed ? '\u2705' : '\u274C';
  console.log(
    `${allIcon} Total: ${runResult.totalPassed}/${runResult.totalChecks} passed across ${runResult.proofFiles} proof file(s)`
  );
  if (!runResult.allPassed) {
    console.log(`   ${runResult.totalFailed} failure(s) detected`);
  }
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  // --self-test
  if (args.includes('--self-test')) {
    console.log('ProofOfWork self-test...');
    const ok = selfTest();
    if (ok) {
      console.log('  SELF-TEST PASSED: Parser, summary extraction, and exit codes all verified.');
      process.exit(0);
    } else {
      console.log('  SELF-TEST FAILED: Prover cannot verify itself.');
      process.exit(1);
    }
  }

  // --list
  if (args.includes('--list')) {
    const files = discoverProofFiles();
    if (files.length === 0) {
      console.log('No proof files found.');
    } else {
      console.log(`Found ${files.length} proof file(s):`);
      for (const f of files) {
        console.log(`  ${f}`);
      }
    }
    process.exit(0);
  }

  const jsonMode = args.includes('--json');

  // Determine which files to run
  let proofFiles: string[];
  const explicitFile = args.find(a => a.endsWith('.proof.sh'));

  if (explicitFile) {
    const resolved = explicitFile.startsWith('/') ? explicitFile : join(process.cwd(), explicitFile);
    if (!existsSync(resolved)) {
      console.error(`Proof file not found: ${resolved}`);
      process.exit(1);
    }
    proofFiles = [resolved];
  } else {
    proofFiles = discoverProofFiles();
  }

  if (proofFiles.length === 0) {
    const msg = 'No proof files discovered.';
    if (jsonMode) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.log(msg);
    }
    process.exit(0);
  }

  // Run all proof files
  const results: ProofFileResult[] = proofFiles.map(runProofFile);

  const timestamp = getISOTimestamp();
  const totalChecks = results.reduce((s, r) => s + r.summary.total, 0);
  const totalPassed = results.reduce((s, r) => s + r.summary.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.summary.failed, 0);

  const runResult: ProofRunResult = {
    timestamp,
    proofFiles: proofFiles.length,
    totalChecks,
    totalPassed,
    totalFailed,
    results,
    allPassed: totalFailed === 0,
  };

  // Log to MEMORY/EVALUATIONS
  logResults(runResult);

  // Output
  if (jsonMode) {
    console.log(JSON.stringify(runResult, null, 2));
  } else {
    displayHuman(runResult);
  }

  // Exit with failure count (capped at 125 for POSIX)
  process.exit(Math.min(totalFailed, 125));
}

main();

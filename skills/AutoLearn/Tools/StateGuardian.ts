#!/usr/bin/env bun
/**
 * StateGuardian - Poisoned state detection and rollback for AutoLearn
 *
 * Creates checkpoints before execution and monitors for corruption signals.
 * Enables graceful rollback when bad decisions are made.
 *
 * Usage:
 *   bun run StateGuardian.ts checkpoint <task-id>   # Create pre-execution checkpoint
 *   bun run StateGuardian.ts verify <task-id>       # Verify post-execution health
 *   bun run StateGuardian.ts rollback <task-id>     # Rollback to checkpoint
 *   bun run StateGuardian.ts status                 # Show checkpoint status
 *   bun run StateGuardian.ts monitor                # Run continuous health monitoring
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { parse, stringify } from 'yaml';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CHECKPOINTS_DIR = join(AUTOLEARN_DIR, 'CHECKPOINTS');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const HEALTH_LOG = join(AUTOLEARN_DIR, 'METRICS', 'health-history.jsonl');
const CLAUDE_DIR = join(process.env.HOME || '~', '.claude');

// Health indicators that signal poisoned state
interface HealthSignals {
  git_status_clean: boolean;
  skills_syntax_valid: boolean;
  config_parseable: boolean;
  no_forbidden_patterns: boolean;
  skill_index_valid: boolean;
  critical_files_exist: boolean;
  no_unexpected_deletions: boolean;
  tests_pass?: boolean;  // Optional, if tests exist
}

interface Checkpoint {
  task_id: string;
  created: string;
  git_commit: string;
  git_branch: string;
  file_hashes: Record<string, string>;
  critical_file_list: string[];
  health_before: HealthSignals;
}

interface HealthReport {
  timestamp: string;
  task_id: string | null;
  signals: HealthSignals;
  score: number;  // 0-100
  poisoned: boolean;
  details: string[];
}

// Ensure directories exist
if (!existsSync(CHECKPOINTS_DIR)) {
  mkdirSync(CHECKPOINTS_DIR, { recursive: true });
}

// Critical files that must exist for PAI to function
const CRITICAL_FILES = [
  'settings.json',
  'skills/skill-index.json',
  'skills/PAI/SKILL.md',
  'GOVERNANCE/overnight-processor.sh',
  'AUTOLEARN/config.yaml'
];

// Patterns that indicate malicious or corrupted content
// Note: Patterns must be precise to avoid false positives (e.g., sha256sum != sh)
const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,
  /curl\s+.*\|\s*(ba)?sh\s*$/m,      // Must end with sh/bash (not sha256sum)
  /curl\s+.*\|\s*(ba)?sh\s+/,         // sh/bash followed by space (command)
  /eval\s*\(/,
  /exec\s*\(/,
  /DROP\s+DATABASE/i,
  /DELETE\s+FROM\s+\*/i,
  /chmod\s+777/,
  /\|\s*(ba)?sh$/,
  /;\s*(ba)?sh$/,
  /--force\s+push/,
  /git\s+push\s+--force/,
];

function hashFile(path: string): string {
  if (!existsSync(path)) return 'MISSING';
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

function getGitInfo(): { commit: string; branch: string } {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: CLAUDE_DIR, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CLAUDE_DIR, encoding: 'utf-8' }).trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

function checkGitStatusClean(): boolean {
  try {
    const status = execSync('git status --porcelain', { cwd: CLAUDE_DIR, encoding: 'utf-8' });
    return status.trim().length === 0;
  } catch {
    return false;
  }
}

function validateYamlFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    parse(readFileSync(path, 'utf-8'));
    return true;
  } catch {
    return false;
  }
}

function validateJsonFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    JSON.parse(readFileSync(path, 'utf-8'));
    return true;
  } catch {
    return false;
  }
}

function checkForbiddenPatterns(paths: string[]): { clean: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const relPath of paths) {
    const fullPath = join(CLAUDE_DIR, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern.toString()}`);
        }
      }
    } catch {
      // Skip binary files
    }
  }

  return { clean: violations.length === 0, violations };
}

function getModifiedFiles(sinceCommit: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${sinceCommit}`, { cwd: CLAUDE_DIR, encoding: 'utf-8' });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

function checkCriticalFilesExist(): { exist: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const file of CRITICAL_FILES) {
    if (!existsSync(join(CLAUDE_DIR, file))) {
      missing.push(file);
    }
  }
  return { exist: missing.length === 0, missing };
}

function runHealthCheck(taskId: string | null = null): HealthReport {
  const timestamp = new Date().toISOString();
  const details: string[] = [];

  // Check 1: Git status
  const gitClean = checkGitStatusClean();
  if (!gitClean) details.push('Uncommitted changes detected');

  // Check 2: Skills syntax (check .md files for valid structure)
  let skillsSyntaxValid = true;
  const skillsDir = join(CLAUDE_DIR, 'skills');
  try {
    const skills = readdirSync(skillsDir).filter(f =>
      statSync(join(skillsDir, f)).isDirectory()
    );
    for (const skill of skills) {
      const skillFile = join(skillsDir, skill, 'SKILL.md');
      if (existsSync(skillFile)) {
        const content = readFileSync(skillFile, 'utf-8');
        if (!content.includes('# ') || content.length < 100) {
          skillsSyntaxValid = false;
          details.push(`Skill ${skill}/SKILL.md appears malformed`);
        }
      }
    }
  } catch (e) {
    skillsSyntaxValid = false;
    details.push('Could not validate skills directory');
  }

  // Check 3: Config parseable
  const configParseable = validateYamlFile(CONFIG_FILE);
  if (!configParseable) details.push('AUTOLEARN/config.yaml is unparseable');

  // Check 4: No forbidden patterns in recent changes
  const gitInfo = getGitInfo();
  const modifiedFiles = taskId ? getModifiedFiles(gitInfo.commit + '^') : [];
  const { clean: noForbidden, violations } = checkForbiddenPatterns(modifiedFiles);
  if (!noForbidden) {
    details.push(`Forbidden patterns found: ${violations.join(', ')}`);
  }

  // Check 5: Skill index valid
  const skillIndexValid = validateJsonFile(join(CLAUDE_DIR, 'skills', 'skill-index.json'));
  if (!skillIndexValid) details.push('skill-index.json is invalid');

  // Check 6: Critical files exist
  const { exist: criticalExist, missing } = checkCriticalFilesExist();
  if (!criticalExist) details.push(`Missing critical files: ${missing.join(', ')}`);

  // Check 7: No unexpected deletions (only check if we have a checkpoint)
  let noUnexpectedDeletions = true;
  if (taskId) {
    const checkpointPath = join(CHECKPOINTS_DIR, `${taskId}.yaml`);
    if (existsSync(checkpointPath)) {
      const checkpoint: Checkpoint = parse(readFileSync(checkpointPath, 'utf-8'));
      for (const file of checkpoint.critical_file_list) {
        if (!existsSync(join(CLAUDE_DIR, file))) {
          noUnexpectedDeletions = false;
          details.push(`Unexpected deletion: ${file}`);
        }
      }
    }
  }

  const signals: HealthSignals = {
    git_status_clean: gitClean,
    skills_syntax_valid: skillsSyntaxValid,
    config_parseable: configParseable,
    no_forbidden_patterns: noForbidden,
    skill_index_valid: skillIndexValid,
    critical_files_exist: criticalExist,
    no_unexpected_deletions: noUnexpectedDeletions
  };

  // Calculate health score
  const weights: Record<keyof HealthSignals, number> = {
    git_status_clean: 5,           // Minor - uncommitted changes are often fine
    skills_syntax_valid: 20,       // Major - skills must work
    config_parseable: 15,          // Important - config must parse
    no_forbidden_patterns: 25,     // Critical - security
    skill_index_valid: 15,         // Important - skill discovery
    critical_files_exist: 15,      // Important - system must function
    no_unexpected_deletions: 5,    // Minor - tracked separately
    tests_pass: 0                  // Not implemented yet
  };

  let score = 0;
  let maxScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    maxScore += weight;
    if (signals[key as keyof HealthSignals] === true) {
      score += weight;
    }
  }
  const normalizedScore = Math.round((score / maxScore) * 100);

  // Poisoned if any critical check fails
  const poisoned = !noForbidden || !criticalExist || !skillIndexValid || !configParseable;

  const report: HealthReport = {
    timestamp,
    task_id: taskId,
    signals,
    score: normalizedScore,
    poisoned,
    details
  };

  return report;
}

function createCheckpoint(taskId: string): void {
  const gitInfo = getGitInfo();
  const healthBefore = runHealthCheck(null);

  // Hash critical files
  const fileHashes: Record<string, string> = {};
  for (const file of CRITICAL_FILES) {
    fileHashes[file] = hashFile(join(CLAUDE_DIR, file));
  }

  // Add any files that might be modified by this task
  const pendingPath = join(AUTOLEARN_DIR, 'APPROVED', `${taskId}.yaml`);
  if (existsSync(pendingPath)) {
    const task = parse(readFileSync(pendingPath, 'utf-8'));
    if (task.proposed_action?.target) {
      fileHashes[task.proposed_action.target] = hashFile(join(CLAUDE_DIR, task.proposed_action.target));
    }
  }

  const checkpoint: Checkpoint = {
    task_id: taskId,
    created: new Date().toISOString(),
    git_commit: gitInfo.commit,
    git_branch: gitInfo.branch,
    file_hashes: fileHashes,
    critical_file_list: CRITICAL_FILES,
    health_before: healthBefore.signals
  };

  writeFileSync(join(CHECKPOINTS_DIR, `${taskId}.yaml`), stringify(checkpoint));

  console.log(`\n✅ Checkpoint created for ${taskId}`);
  console.log(`   Git commit: ${gitInfo.commit.substring(0, 8)}`);
  console.log(`   Files tracked: ${Object.keys(fileHashes).length}`);
  console.log(`   Health score: ${healthBefore.score}/100`);
}

function verifyPostExecution(taskId: string): HealthReport {
  const report = runHealthCheck(taskId);

  // Log health
  appendFileSync(HEALTH_LOG, JSON.stringify(report) + '\n');

  console.log(`\n🔍 POST-EXECUTION HEALTH CHECK: ${taskId}`);
  console.log('═'.repeat(60));
  console.log(`   Score: ${report.score}/100 ${report.poisoned ? '❌ POISONED' : '✅ HEALTHY'}`);
  console.log('\n   Signals:');
  for (const [key, value] of Object.entries(report.signals)) {
    const icon = value ? '✅' : '❌';
    console.log(`     ${icon} ${key}`);
  }

  if (report.details.length > 0) {
    console.log('\n   Issues:');
    for (const detail of report.details) {
      console.log(`     ⚠️  ${detail}`);
    }
  }

  if (report.poisoned) {
    console.log('\n   ⚠️  POISONED STATE DETECTED');
    console.log(`   Run: bun run StateGuardian.ts rollback ${taskId}`);
  }

  return report;
}

function rollbackToCheckpoint(taskId: string): void {
  const checkpointPath = join(CHECKPOINTS_DIR, `${taskId}.yaml`);

  if (!existsSync(checkpointPath)) {
    console.error(`❌ No checkpoint found for ${taskId}`);
    process.exit(1);
  }

  const checkpoint: Checkpoint = parse(readFileSync(checkpointPath, 'utf-8'));

  console.log(`\n🔄 ROLLING BACK TO CHECKPOINT: ${taskId}`);
  console.log('═'.repeat(60));
  console.log(`   Checkpoint created: ${checkpoint.created}`);
  console.log(`   Target commit: ${checkpoint.git_commit.substring(0, 8)}`);

  // Use git to rollback
  try {
    // First, stash any current changes
    execSync('git stash', { cwd: CLAUDE_DIR, encoding: 'utf-8' });
    console.log('   Stashed current changes');

    // Reset to checkpoint commit
    execSync(`git reset --hard ${checkpoint.git_commit}`, { cwd: CLAUDE_DIR, encoding: 'utf-8' });
    console.log(`   Reset to commit ${checkpoint.git_commit.substring(0, 8)}`);

    // Verify health after rollback
    const health = runHealthCheck(null);
    console.log(`\n   Post-rollback health: ${health.score}/100`);

    if (health.poisoned) {
      console.log('\n   ⚠️  Still poisoned after rollback!');
      console.log('   Manual intervention may be required.');
    } else {
      console.log('\n   ✅ Rollback successful, system healthy');
    }

    // Move task back to PENDING with failure notes
    const approvedPath = join(AUTOLEARN_DIR, 'APPROVED', `${taskId}.yaml`);
    const executedPath = join(AUTOLEARN_DIR, 'EXECUTED', `${taskId}.yaml`);
    const pendingPath = join(AUTOLEARN_DIR, 'PENDING', `${taskId}.yaml`);

    let taskPath = '';
    if (existsSync(approvedPath)) taskPath = approvedPath;
    else if (existsSync(executedPath)) taskPath = executedPath;

    if (taskPath) {
      const task = parse(readFileSync(taskPath, 'utf-8'));
      task.rollback_reason = 'Poisoned state detected after execution';
      task.rollback_timestamp = new Date().toISOString();
      task.status = 'rolled_back';
      writeFileSync(pendingPath, stringify(task));
      console.log(`   Task moved back to PENDING for review`);
    }

  } catch (error) {
    console.error(`\n❌ Rollback failed: ${error}`);
    console.log('   Manual intervention required.');
    console.log(`   Original commit: ${checkpoint.git_commit}`);
    process.exit(1);
  }
}

function showStatus(): void {
  console.log('\n🛡️  STATE GUARDIAN STATUS');
  console.log('═'.repeat(60));

  // Current health
  const health = runHealthCheck(null);
  console.log(`\nCurrent Health: ${health.score}/100 ${health.poisoned ? '❌ POISONED' : '✅ HEALTHY'}`);

  // List checkpoints
  if (existsSync(CHECKPOINTS_DIR)) {
    const checkpoints = readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith('.yaml'));
    console.log(`\nCheckpoints: ${checkpoints.length}`);
    for (const cp of checkpoints.slice(-5)) {
      const checkpoint: Checkpoint = parse(readFileSync(join(CHECKPOINTS_DIR, cp), 'utf-8'));
      console.log(`  - ${checkpoint.task_id} (${checkpoint.created.substring(0, 10)})`);
    }
  }

  // Recent health history
  if (existsSync(HEALTH_LOG)) {
    const lines = readFileSync(HEALTH_LOG, 'utf-8').trim().split('\n');
    const recent = lines.slice(-5).map(l => JSON.parse(l) as HealthReport);
    console.log('\nRecent Health Checks:');
    for (const r of recent) {
      const icon = r.poisoned ? '❌' : '✅';
      console.log(`  ${icon} ${r.timestamp.substring(0, 19)} - Score: ${r.score} ${r.task_id ? `(${r.task_id})` : ''}`);
    }
  }
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'checkpoint':
    if (!args[0]) {
      console.error('Usage: StateGuardian.ts checkpoint <task-id>');
      process.exit(1);
    }
    createCheckpoint(args[0]);
    break;

  case 'verify':
    if (!args[0]) {
      console.error('Usage: StateGuardian.ts verify <task-id>');
      process.exit(1);
    }
    const report = verifyPostExecution(args[0]);
    process.exit(report.poisoned ? 1 : 0);
    break;

  case 'rollback':
    if (!args[0]) {
      console.error('Usage: StateGuardian.ts rollback <task-id>');
      process.exit(1);
    }
    rollbackToCheckpoint(args[0]);
    break;

  case 'status':
    showStatus();
    break;

  case 'monitor':
    // Continuous monitoring mode
    console.log('🛡️  Starting continuous health monitoring...');
    const health = runHealthCheck(null);
    appendFileSync(HEALTH_LOG, JSON.stringify(health) + '\n');
    process.exit(health.poisoned ? 1 : 0);
    break;

  default:
    console.log(`
StateGuardian - Poisoned State Detection & Rollback

Usage:
  bun run StateGuardian.ts checkpoint <task-id>   Create pre-execution checkpoint
  bun run StateGuardian.ts verify <task-id>       Verify post-execution health
  bun run StateGuardian.ts rollback <task-id>     Rollback to checkpoint
  bun run StateGuardian.ts status                 Show checkpoint status
  bun run StateGuardian.ts monitor                Run health check (for cron)

Health Signals Monitored:
  - Git status (uncommitted changes)
  - Skills syntax validity
  - Config file parseability
  - Forbidden pattern detection (rm -rf, curl|bash, etc.)
  - Skill index validity
  - Critical file existence

Rollback:
  When poisoned state is detected, rollback reverts to the pre-execution
  git commit and moves the task back to PENDING for human review.
`);
}

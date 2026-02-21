/**
 * SyncExecutor — File sync, backup, and post-sync verification
 *
 * Handles the actual file copying, backup creation, and verification
 * after upstream files are synced to the local installation.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import type { FileDiffEntry, SyncState } from './DiffEngine';
import { hashFile } from './DiffEngine';

// ============================================================================
// Types
// ============================================================================

export type ConflictStrategy = 'keep-local' | 'take-upstream' | 'skip';

export interface SyncOptions {
  dryRun: boolean;
  conflictStrategy: ConflictStrategy;
  verbose: boolean;
}

export interface SyncResult {
  synced: string[];
  skipped: string[];
  conflicts: string[];
  errors: string[];
  backupDir: string | null;
}

export interface VerifyResult {
  passed: boolean;
  checks: Array<{
    file: string;
    check: string;
    passed: boolean;
    message: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = join(homedir(), '.claude');
const BACKUP_BASE = join(CLAUDE_DIR, '.sync-backup');

// ============================================================================
// Backup
// ============================================================================

/**
 * Back up local files before overwriting
 * Returns the backup directory path
 */
export function backupFiles(
  files: FileDiffEntry[],
  localDir: string
): string | null {
  const filesToBackup = files.filter(
    (f) => f.status !== 'added' && existsSync(join(localDir, f.relativePath))
  );

  if (filesToBackup.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = join(BACKUP_BASE, timestamp);
  mkdirSync(backupDir, { recursive: true });

  for (const file of filesToBackup) {
    const srcPath = join(localDir, file.relativePath);
    const destPath = join(backupDir, file.relativePath);

    try {
      mkdirSync(dirname(destPath), { recursive: true });
      cpSync(srcPath, destPath);
    } catch (err) {
      // Log but continue — backup is best-effort
      console.error(`  Warning: Could not backup ${file.relativePath}: ${err}`);
    }
  }

  return backupDir;
}

// ============================================================================
// Sync
// ============================================================================

/**
 * Sync a single file from upstream to local
 */
export function syncFile(upstreamPath: string, localPath: string): void {
  mkdirSync(dirname(localPath), { recursive: true });
  cpSync(upstreamPath, localPath);
}

/**
 * Sync a batch of files with conflict handling
 */
export function syncBatch(
  entries: FileDiffEntry[],
  upstreamDir: string,
  localDir: string,
  options: SyncOptions
): SyncResult {
  const result: SyncResult = {
    synced: [],
    skipped: [],
    conflicts: [],
    errors: [],
    backupDir: null,
  };

  // Filter to actionable entries
  const actionable = entries.filter(
    (e) => e.status === 'modified' || e.status === 'added'
  );

  if (actionable.length === 0) {
    console.log('  No files to sync.');
    return result;
  }

  // Backup before sync (unless dry run)
  if (!options.dryRun) {
    result.backupDir = backupFiles(actionable, localDir);
    if (result.backupDir) {
      console.log(`  Backup created: ${result.backupDir}`);
    }
  }

  for (const entry of actionable) {
    const upstreamPath = join(upstreamDir, entry.relativePath);
    const localPath = join(localDir, entry.relativePath);

    // Protected files are always skipped
    if (entry.protected) {
      result.skipped.push(entry.relativePath);
      if (options.verbose) {
        console.log(`  SKIP (protected): ${entry.relativePath}`);
      }
      continue;
    }

    // Handle conflicts
    if (entry.locallyModified) {
      switch (options.conflictStrategy) {
        case 'keep-local':
          result.skipped.push(entry.relativePath);
          if (options.verbose) {
            console.log(`  SKIP (keep-local): ${entry.relativePath}`);
          }
          continue;
        case 'skip':
          result.conflicts.push(entry.relativePath);
          if (options.verbose) {
            console.log(`  CONFLICT (skipped): ${entry.relativePath}`);
          }
          continue;
        case 'take-upstream':
          // Fall through to sync
          break;
      }
    }

    // Perform sync
    if (options.dryRun) {
      const label = entry.status === 'added' ? 'ADD' : 'SYNC';
      console.log(`  [DRY RUN] ${label}: ${entry.relativePath}`);
      result.synced.push(entry.relativePath);
    } else {
      try {
        syncFile(upstreamPath, localPath);
        result.synced.push(entry.relativePath);
        if (options.verbose) {
          console.log(`  SYNCED: ${entry.relativePath}`);
        }
      } catch (err) {
        result.errors.push(`${entry.relativePath}: ${err}`);
        console.error(`  ERROR: ${entry.relativePath}: ${err}`);
      }
    }
  }

  return result;
}

// ============================================================================
// Post-Sync Actions
// ============================================================================

/**
 * Run post-sync actions based on what was synced
 */
export function postSyncActions(syncedFiles: string[]): void {
  // If Algorithm components synced, rebuild PAI
  const algorithmFiles = syncedFiles.filter((f) =>
    f.startsWith('skills/PAI/Components/Algorithm/')
  );
  if (algorithmFiles.length > 0) {
    console.log('\n  Running RebuildPAI (Algorithm components changed)...');
    try {
      execSync(
        `bun run ${join(CLAUDE_DIR, 'skills/PAI/Tools/RebuildPAI.ts')}`,
        { timeout: 30000, stdio: 'pipe' }
      );
      console.log('  RebuildPAI complete.');
    } catch (err) {
      console.error(`  Warning: RebuildPAI failed: ${err}`);
    }
  }

  // If skill-index.json synced or skills changed, regenerate index
  const skillFiles = syncedFiles.filter(
    (f) => f.startsWith('skills/') || f === 'skill-index.json'
  );
  if (skillFiles.length > 0) {
    console.log('\n  Regenerating skill index...');
    try {
      execSync(
        `bun run ${join(CLAUDE_DIR, 'skills/PAI/Tools/GenerateSkillIndex.ts')}`,
        { timeout: 30000, stdio: 'pipe' }
      );
      console.log('  Skill index regenerated.');
    } catch {
      console.error('  Warning: Skill index regeneration failed.');
    }
  }
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify sync results — confirm files were written correctly
 */
export function verifySyncResult(
  syncedFiles: string[],
  upstreamDir: string,
  localDir: string
): VerifyResult {
  const checks: VerifyResult['checks'] = [];

  for (const file of syncedFiles) {
    const localPath = join(localDir, file);
    const upstreamPath = join(upstreamDir, file);

    // Check 1: File exists
    if (!existsSync(localPath)) {
      checks.push({
        file,
        check: 'exists',
        passed: false,
        message: 'File not found after sync',
      });
      continue;
    }

    // Check 2: Hash matches upstream
    const localHash = hashFile(localPath);
    const upstreamHash = hashFile(upstreamPath);
    if (localHash && upstreamHash) {
      checks.push({
        file,
        check: 'hash-match',
        passed: localHash === upstreamHash,
        message:
          localHash === upstreamHash
            ? 'Hash matches upstream'
            : `Hash mismatch: local=${localHash.slice(0, 8)} upstream=${upstreamHash.slice(0, 8)}`,
      });
    }

    // Check 3: TypeScript syntax check
    if (file.endsWith('.ts')) {
      try {
        execSync(`bun build --no-bundle "${localPath}" --outfile /tmp/sync-check-output.js 2>&1`, {
          timeout: 10000,
          stdio: 'pipe',
        });
        checks.push({
          file,
          check: 'syntax',
          passed: true,
          message: 'TypeScript syntax OK',
        });
      } catch (err) {
        checks.push({
          file,
          check: 'syntax',
          passed: false,
          message: `TypeScript syntax error: ${String(err).slice(0, 100)}`,
        });
      }
    }

    // Check 4: JSON validity
    if (file.endsWith('.json')) {
      try {
        JSON.parse(readFileSync(localPath, 'utf-8'));
        checks.push({
          file,
          check: 'json-valid',
          passed: true,
          message: 'Valid JSON',
        });
      } catch (err) {
        checks.push({
          file,
          check: 'json-valid',
          passed: false,
          message: `Invalid JSON: ${String(err).slice(0, 100)}`,
        });
      }
    }
  }

  // Check 5: Settings.json hook references still resolve
  const settingsPath = join(localDir, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.hooks) {
        for (const hookGroup of Object.values(settings.hooks) as any[]) {
          if (!Array.isArray(hookGroup)) continue;
          for (const hook of hookGroup) {
            if (hook?.command && typeof hook.command === 'string') {
              // Extract file path from command if it references a hook file
              const match = hook.command.match(/hooks\/[\w.-]+\.ts/);
              if (match) {
                const hookPath = join(localDir, match[0]);
                checks.push({
                  file: match[0],
                  check: 'hook-reference',
                  passed: existsSync(hookPath),
                  message: existsSync(hookPath)
                    ? 'Hook file exists'
                    : 'Hook file missing — settings.json references non-existent file',
                });
              }
            }
          }
        }
      }
    } catch {
      // Settings parse error already caught elsewhere
    }
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * Update sync state after successful sync
 */
export function updateSyncState(
  state: SyncState,
  syncedFiles: string[],
  upstreamDir: string,
  version: string
): SyncState {
  const now = new Date().toISOString();

  for (const file of syncedFiles) {
    const hash = hashFile(join(upstreamDir, file));
    if (hash) {
      state.files[file] = {
        hash,
        resolution: 'upstream',
        syncedAt: now,
      };
    }
  }

  state.lastSyncedVersion = version;
  state.lastSyncTimestamp = now;

  // Update version history
  const existing = state.versionHistory.find((v) => v.version === version);
  if (existing) {
    existing.syncedAt = now;
  } else {
    state.versionHistory.push({
      version,
      detectedAt: now,
      syncedAt: now,
    });
  }

  return state;
}

/**
 * Bootstrap sync state from current local installation
 * Maps all files against an upstream version to establish baseline
 */
export function bootstrapSyncState(
  upstreamDir: string,
  localDir: string,
  version: string
): SyncState {
  const state: SyncState = {
    lastSyncedVersion: version,
    lastSyncTimestamp: new Date().toISOString(),
    files: {},
    versionHistory: [
      {
        version,
        detectedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      },
    ],
  };

  // Walk upstream and hash matching local files
  const { discoverFiles } = require('./DiffEngine');
  const fileMap = discoverFiles(upstreamDir, localDir);

  for (const [relativePath, presence] of fileMap) {
    // Only record baseline for files that exist in BOTH trees.
    // Upstream-only files should NOT be recorded — they need to appear
    // as "added" in the diff report so the sync copies them.
    if (!presence.upstream || !presence.local) continue;

    const hash = hashFile(join(localDir, relativePath));

    if (hash) {
      state.files[relativePath] = {
        hash,
        resolution: 'local',
        syncedAt: new Date().toISOString(),
      };
    }
  }

  return state;
}

/**
 * Format sync result for console output
 */
export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];

  lines.push('\nSync Results');
  lines.push('═'.repeat(40));
  lines.push(`  Synced:    ${result.synced.length}`);
  lines.push(`  Skipped:   ${result.skipped.length}`);
  lines.push(`  Conflicts: ${result.conflicts.length}`);
  lines.push(`  Errors:    ${result.errors.length}`);

  if (result.backupDir) {
    lines.push(`  Backup:    ${result.backupDir}`);
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const err of result.errors) {
      lines.push(`  ! ${err}`);
    }
  }

  if (result.conflicts.length > 0) {
    lines.push('\nUnresolved Conflicts:');
    for (const c of result.conflicts) {
      lines.push(`  ! ${c}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format verification result for console output
 */
export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];

  lines.push(`\nVerification: ${result.passed ? 'PASSED' : 'FAILED'}`);
  lines.push('─'.repeat(40));

  const failed = result.checks.filter((c) => !c.passed);
  const passed = result.checks.filter((c) => c.passed);

  if (failed.length > 0) {
    lines.push(`\n  Failed (${failed.length}):`);
    for (const check of failed) {
      lines.push(`    ✗ ${check.file} [${check.check}]: ${check.message}`);
    }
  }

  lines.push(`\n  Passed: ${passed.length}/${result.checks.length} checks`);

  return lines.join('\n');
}

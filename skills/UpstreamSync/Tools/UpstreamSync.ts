#!/usr/bin/env bun

/**
 * UpstreamSync — CLI entry point for upstream sync operations
 *
 * Detects upstream changes, diffs against local, and selectively syncs
 * with backup, verification, and state tracking.
 *
 * Commands:
 *   bun UpstreamSync.ts detect              # List available upstream versions
 *   bun UpstreamSync.ts diff [version]      # Show what changed (default: latest)
 *   bun UpstreamSync.ts sync [version]      # Apply changes
 *   bun UpstreamSync.ts status              # Show current sync state
 *
 * Flags:
 *   --category, -c <cat>    Filter: skill, hook, agent, lib, config
 *   --path, -p <glob>       Filter by path pattern
 *   --dry-run               Preview without applying
 *   --conflict <strategy>   keep-local | take-upstream | skip (default: skip)
 *   --json                  Machine-readable output
 *   --verbose               Show line-level details
 *   --bootstrap             Seed state from current installation
 */

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  discoverVersions,
  getUpstreamPath,
  getLatestVersion,
  generateDiffReport,
  formatDiffReport,
  defaultSyncState,
  type SyncState,
  type FileCategory,
  type DiffReport,
} from './DiffEngine';

import {
  syncBatch,
  postSyncActions,
  verifySyncResult,
  updateSyncState,
  bootstrapSyncState,
  formatSyncResult,
  formatVerifyResult,
  type ConflictStrategy,
} from './SyncExecutor';

// ============================================================================
// Configuration
// ============================================================================

const CLAUDE_DIR = join(homedir(), '.claude');
const STATE_PATH = join(CLAUDE_DIR, 'skills', 'UpstreamSync', 'State', 'sync-state.json');

// ============================================================================
// State Management
// ============================================================================

function loadState(): SyncState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch {
    console.error('  Warning: Could not parse sync state, using defaults.');
  }
  return defaultSyncState();
}

function saveState(state: SyncState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ============================================================================
// CLI Parsing
// ============================================================================

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    category: { type: 'string', short: 'c' },
    path: { type: 'string', short: 'p' },
    'dry-run': { type: 'boolean', default: false },
    conflict: { type: 'string', default: 'skip' },
    json: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    bootstrap: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: true,
});

// ============================================================================
// Commands
// ============================================================================

function showHelp(): void {
  console.log(`
UpstreamSync — Automated upstream sync tool for PAI

COMMANDS:
  detect              List available upstream versions in Releases/
  diff [version]      Show what changed (default: latest)
  sync [version]      Apply changes from upstream
  status              Show current sync state

FLAGS:
  --category, -c      Filter by category: skill, hook, agent, lib, config
  --path, -p          Filter by path pattern (glob)
  --dry-run           Preview without applying changes
  --conflict          Conflict strategy: keep-local | take-upstream | skip
  --json              Machine-readable JSON output
  --verbose           Show detailed output
  --bootstrap         Seed initial state from current installation
  --help, -h          Show this help

EXAMPLES:
  bun UpstreamSync.ts detect
  bun UpstreamSync.ts diff v2.5
  bun UpstreamSync.ts diff --category hook
  bun UpstreamSync.ts sync v2.5 --dry-run
  bun UpstreamSync.ts sync v2.5 --conflict take-upstream
  bun UpstreamSync.ts sync --bootstrap
  bun UpstreamSync.ts status
`);
}

function cmdDetect(): void {
  const versions = discoverVersions();

  if (versions.length === 0) {
    console.log('No upstream versions found in Releases/');
    return;
  }

  const state = loadState();

  if (values.json) {
    console.log(JSON.stringify({ versions, currentSync: state.lastSyncedVersion }));
    return;
  }

  console.log('\nAvailable Upstream Versions');
  console.log('═'.repeat(40));
  for (const version of versions) {
    const isCurrent = version === state.lastSyncedVersion;
    const marker = isCurrent ? ' (synced)' : '';
    console.log(`  ${version}${marker}`);
  }

  if (state.lastSyncedVersion) {
    console.log(`\n  Last synced: ${state.lastSyncedVersion} (${state.lastSyncTimestamp?.slice(0, 10) || 'unknown'})`);
  } else {
    console.log('\n  No sync history. Run `sync --bootstrap` to initialize.');
  }
}

function cmdDiff(version?: string): void {
  const targetVersion = version || getLatestVersion();
  if (!targetVersion) {
    console.error('No upstream versions found.');
    process.exit(1);
  }

  const upstreamDir = getUpstreamPath(targetVersion);
  if (!existsSync(upstreamDir)) {
    console.error(`Upstream directory not found: ${upstreamDir}`);
    process.exit(1);
  }

  const state = loadState();
  const report = generateDiffReport(targetVersion, upstreamDir, CLAUDE_DIR, state);

  // Apply filters
  const filteredReport = applyFilters(report);

  if (values.json) {
    console.log(JSON.stringify(filteredReport, null, 2));
    return;
  }

  console.log(formatDiffReport(filteredReport));
}

function cmdSync(version?: string): void {
  const targetVersion = version || getLatestVersion();
  if (!targetVersion) {
    console.error('No upstream versions found.');
    process.exit(1);
  }

  const upstreamDir = getUpstreamPath(targetVersion);
  if (!existsSync(upstreamDir)) {
    console.error(`Upstream directory not found: ${upstreamDir}`);
    process.exit(1);
  }

  const state = loadState();

  // Bootstrap mode
  if (values.bootstrap) {
    console.log(`\nBootstrapping sync state from ${targetVersion}...`);
    const newState = bootstrapSyncState(upstreamDir, CLAUDE_DIR, targetVersion);
    saveState(newState);
    const fileCount = Object.keys(newState.files).length;
    console.log(`  Baseline established: ${fileCount} files tracked.`);
    console.log(`  State saved to: ${STATE_PATH}`);
    return;
  }

  // Generate diff report
  const report = generateDiffReport(targetVersion, upstreamDir, CLAUDE_DIR, state);
  const filteredReport = applyFilters(report);

  // Show what will be synced
  const actionable = filteredReport.files.filter(
    (f) => f.status === 'modified' || f.status === 'added'
  );

  if (actionable.length === 0) {
    console.log('\nNothing to sync — local installation is up to date.');
    return;
  }

  const dryRun = values['dry-run'] || false;
  const conflictStrategy = (values.conflict as ConflictStrategy) || 'skip';

  console.log(`\nSyncing ${actionable.length} files from ${targetVersion}...`);
  if (dryRun) console.log('  (DRY RUN — no changes will be made)');
  console.log(`  Conflict strategy: ${conflictStrategy}`);

  // Execute sync
  const result = syncBatch(actionable, upstreamDir, CLAUDE_DIR, {
    dryRun,
    conflictStrategy,
    verbose: values.verbose || false,
  });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSyncResult(result));
  }

  // Post-sync actions (only if not dry run)
  if (!dryRun && result.synced.length > 0) {
    postSyncActions(result.synced);

    // Verify
    console.log('\nVerifying sync...');
    const verifyResult = verifySyncResult(result.synced, upstreamDir, CLAUDE_DIR);
    console.log(formatVerifyResult(verifyResult));

    // Update state
    const updatedState = updateSyncState(state, result.synced, upstreamDir, targetVersion);
    saveState(updatedState);
    console.log('\n  Sync state saved.');
  }
}

function cmdStatus(): void {
  const state = loadState();

  if (values.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log('\nUpstream Sync Status');
  console.log('═'.repeat(40));

  if (!state.lastSyncedVersion) {
    console.log('  No sync history. Run `sync --bootstrap` to initialize.');
    return;
  }

  console.log(`  Last synced version:  ${state.lastSyncedVersion}`);
  console.log(`  Last sync timestamp:  ${state.lastSyncTimestamp}`);
  console.log(`  Files tracked:        ${Object.keys(state.files).length}`);

  if (state.versionHistory.length > 0) {
    console.log('\n  Version History:');
    for (const entry of state.versionHistory) {
      const syncInfo = entry.syncedAt
        ? `synced ${entry.syncedAt.slice(0, 10)}`
        : 'detected only';
      console.log(`    ${entry.version} — ${syncInfo}`);
    }
  }

  // Show quick diff against latest
  const latest = getLatestVersion();
  if (latest && latest !== state.lastSyncedVersion) {
    console.log(`\n  New version available: ${latest}`);
    console.log(`  Run: bun UpstreamSync.ts diff ${latest}`);
  } else if (latest) {
    console.log(`\n  Up to date with latest: ${latest}`);
  }
}

// ============================================================================
// Filter Helpers
// ============================================================================

function applyFilters(report: DiffReport): DiffReport {
  let files = report.files;

  // Category filter
  if (values.category) {
    const cat = values.category as FileCategory;
    files = files.filter((f) => f.category === cat);
  }

  // Path filter
  if (values.path) {
    const pattern = values.path;
    files = files.filter((f) => f.relativePath.includes(pattern));
  }

  // Recalculate summary
  const summary = {
    total: files.length,
    unchanged: files.filter((f) => f.status === 'unchanged').length,
    modified: files.filter((f) => f.status === 'modified').length,
    added: files.filter((f) => f.status === 'added').length,
    deleted: files.filter((f) => f.status === 'deleted').length,
    conflicts: files.filter((f) => f.locallyModified).length,
    protected: files.filter((f) => f.protected).length,
  };

  return { ...report, files, summary };
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const command = positionals[0];
  const versionArg = positionals[1];

  switch (command) {
    case 'detect':
      cmdDetect();
      break;
    case 'diff':
      cmdDiff(versionArg);
      break;
    case 'sync':
      cmdSync(versionArg);
      break;
    case 'status':
      cmdStatus();
      break;
    default:
      if (!command) {
        showHelp();
      } else {
        console.error(`Unknown command: ${command}`);
        console.error('Run with --help for usage.');
        process.exit(1);
      }
  }
}

main();

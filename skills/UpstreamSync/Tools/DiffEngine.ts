/**
 * DiffEngine — Core diff logic for upstream sync
 *
 * Handles path translation (Releases/vX.Y/.claude/ → root),
 * file hashing, three-way diff classification, and protected path detection.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, relative } from 'path';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

export type FileStatus = 'unchanged' | 'modified' | 'added' | 'deleted';

export type FileCategory =
  | 'skill'
  | 'hook'
  | 'hook-lib'
  | 'agent'
  | 'lib'
  | 'config'
  | 'voiceserver'
  | 'observability'
  | 'other';

export interface FileDiffEntry {
  relativePath: string;
  category: FileCategory;
  status: FileStatus;
  locallyModified: boolean; // true = CONFLICT (both sides changed)
  protected: boolean;
  upstreamHash: string | null;
  localHash: string | null;
  lastSyncHash: string | null;
}

export interface DiffReport {
  upstreamVersion: string;
  timestamp: string;
  summary: {
    total: number;
    unchanged: number;
    modified: number;
    added: number;
    deleted: number;
    conflicts: number;
    protected: number;
  };
  files: FileDiffEntry[];
}

export interface SyncState {
  lastSyncedVersion: string | null;
  lastSyncTimestamp: string | null;
  files: Record<string, {
    hash: string;
    resolution?: 'local' | 'upstream' | 'skip';
    syncedAt: string;
  }>;
  versionHistory: Array<{
    version: string;
    detectedAt: string;
    syncedAt?: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = join(homedir(), '.claude');

/** Directories to skip during traversal */
const SKIP_DIRS = new Set(['node_modules', '.git', '.sync-backup']);

/** Files to skip */
const SKIP_FILES = new Set(['bun.lock', 'bun.lockb', '.DS_Store']);

/** Local-only directories — never exist upstream, skip entirely */
const EXCLUDED_LOCAL_DIRS = new Set([
  'AUTOLEARN',
  'DREAMS',
  'GOVERNANCE',
  'MEMORY',
  'BUDGET',
  'POOLS',
  'USER',
  'LEGAL',
  'www',
  'debug',
  'paste-cache',
  'telemetry',
  'todos',
  'tasks',
  'statsig',
  'session-env',
  'cache',
  'projects',
  'teams',
  'custom-agents',
  'PAI-Install',
  'SYSTEM',
  'WORK',
]);

/** Files that are NEVER auto-synced — always flagged as protected */
const PROTECTED_FILES = new Set([
  'settings.json',
  'CLAUDE.md',
  'hooks/ExternalContentValidator.hook.ts',
  'hooks/IntegrityCheck.hook.ts',
  'hooks/MemoryWriteGuard.hook.ts',
  'hooks/VoiceGate.hook.ts',
  'hooks/ImplicitSentimentCapture.hook.ts',
  'hooks/ExplicitRatingCapture.hook.ts',
  'hooks/SecurityValidator.hook.ts',
  'VoiceServer/server.ts',
  'VoiceServer/voices.json',
  'VoiceServer/pronunciations.json',
]);

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Walk a directory tree recursively, returning relative paths
 */
function walkDir(dir: string, basePath: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  function walk(currentDir: string): void {
    try {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        if (SKIP_FILES.has(entry)) continue;

        const fullPath = join(currentDir, entry);
        const rel = relative(basePath, fullPath);

        // Skip local-only top-level directories
        const topDir = rel.split('/')[0];
        if (EXCLUDED_LOCAL_DIRS.has(topDir)) continue;

        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else {
          results.push(rel);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(dir);
  return results;
}

/**
 * Discover files from both upstream release and local installation
 * Returns unified map of relativePath → { upstream exists, local exists }
 */
export function discoverFiles(
  upstreamDir: string,
  localDir: string
): Map<string, { upstream: boolean; local: boolean }> {
  const fileMap = new Map<string, { upstream: boolean; local: boolean }>();

  // Walk upstream (inside Releases/vX.Y/.claude/)
  const upstreamFiles = walkDir(upstreamDir, upstreamDir);
  for (const file of upstreamFiles) {
    fileMap.set(file, { upstream: true, local: false });
  }

  // Walk local
  const localFiles = walkDir(localDir, localDir);
  for (const file of localFiles) {
    const existing = fileMap.get(file);
    if (existing) {
      existing.local = true;
    } else {
      fileMap.set(file, { upstream: false, local: true });
    }
  }

  return fileMap;
}

// ============================================================================
// Hashing
// ============================================================================

/**
 * Compute MD5 hash of a file's contents
 */
export function hashFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Categorize a file by its path
 */
export function categorizeFile(relativePath: string): FileCategory {
  if (relativePath.startsWith('skills/')) return 'skill';
  if (relativePath.startsWith('hooks/lib/')) return 'hook-lib';
  if (relativePath.startsWith('hooks/')) return 'hook';
  if (relativePath.startsWith('agents/')) return 'agent';
  if (relativePath.startsWith('lib/')) return 'lib';
  if (relativePath.startsWith('VoiceServer/')) return 'voiceserver';
  if (relativePath.startsWith('Observability/')) return 'observability';
  if (
    relativePath === 'settings.json' ||
    relativePath === 'CLAUDE.md' ||
    relativePath === 'skill-index.json' ||
    relativePath.startsWith('statusline')
  ) {
    return 'config';
  }
  return 'other';
}

/**
 * Three-way diff classification
 *
 * Uses upstream hash, local hash, and last-sync hash to determine status:
 * - Both same as last sync → unchanged
 * - Upstream changed, local unchanged from sync → modified (safe to sync)
 * - Local changed, upstream unchanged from sync → unchanged (local customization)
 * - Both changed differently → modified + locallyModified = CONFLICT
 * - Upstream has, no local, no prior sync → added (new upstream file)
 * - Local has, no upstream → deleted upstream (local-only)
 */
export function classifyFile(
  upstreamHash: string | null,
  localHash: string | null,
  lastSyncHash: string | null
): { status: FileStatus; locallyModified: boolean } {
  // New upstream file — doesn't exist locally regardless of sync history
  // Covers both truly new files (!lastSyncHash) and files that bootstrap
  // recorded but were never actually copied to local (lastSyncHash exists)
  if (upstreamHash && !localHash) {
    return { status: 'added', locallyModified: false };
  }

  // Upstream removed the file
  if (!upstreamHash && localHash) {
    return { status: 'deleted', locallyModified: !!lastSyncHash };
  }

  // Both exist — compare
  if (upstreamHash && localHash) {
    // Identical
    if (upstreamHash === localHash) {
      return { status: 'unchanged', locallyModified: false };
    }

    // No prior sync baseline — first time seeing this pair
    if (!lastSyncHash) {
      // Files differ but we have no baseline — treat as conflict
      return { status: 'modified', locallyModified: true };
    }

    const upstreamChanged = upstreamHash !== lastSyncHash;
    const localChanged = localHash !== lastSyncHash;

    if (upstreamChanged && !localChanged) {
      // Only upstream changed — safe to sync
      return { status: 'modified', locallyModified: false };
    }

    if (!upstreamChanged && localChanged) {
      // Only local changed — local customization, leave alone
      return { status: 'unchanged', locallyModified: false };
    }

    if (upstreamChanged && localChanged) {
      // Both changed — CONFLICT
      return { status: 'modified', locallyModified: true };
    }

    // Neither changed from baseline but they differ?
    // Shouldn't happen with consistent hashing, but treat as unchanged
    return { status: 'unchanged', locallyModified: false };
  }

  return { status: 'unchanged', locallyModified: false };
}

// ============================================================================
// Protected Path Detection
// ============================================================================

/** Runtime cache for private paths from .pai-publish.yaml */
let _publishPrivatePaths: string[] | null = null;

function loadPublishPrivatePaths(): string[] {
  if (_publishPrivatePaths !== null) return _publishPrivatePaths;

  const yamlPath = join(CLAUDE_DIR, '.pai-publish.yaml');
  _publishPrivatePaths = [];

  try {
    if (!existsSync(yamlPath)) return _publishPrivatePaths;
    const content = readFileSync(yamlPath, 'utf-8');

    // Simple YAML parsing — extract lines under `private:` section
    const lines = content.split('\n');
    let inPrivate = false;
    for (const line of lines) {
      if (line.match(/^private:/)) {
        inPrivate = true;
        continue;
      }
      if (inPrivate && line.match(/^\S/) && !line.startsWith('#')) {
        inPrivate = false;
        continue;
      }
      if (inPrivate) {
        const match = line.match(/^\s+-\s+(.+?)(\s*#.*)?$/);
        if (match) {
          _publishPrivatePaths.push(match[1].trim());
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return _publishPrivatePaths;
}

/**
 * Check if a path is protected (should never be auto-synced)
 */
export function isProtectedPath(relativePath: string): boolean {
  // Check hardcoded protected files
  if (PROTECTED_FILES.has(relativePath)) return true;

  // Check .pai-publish.yaml private paths
  const privatePaths = loadPublishPrivatePaths();
  for (const pp of privatePaths) {
    // Directory match (path ends with /)
    if (pp.endsWith('/') && relativePath.startsWith(pp)) return true;
    // Exact file match
    if (relativePath === pp) return true;
    // Directory match without trailing slash
    if (!pp.includes('.') && relativePath.startsWith(pp + '/')) return true;
  }

  return false;
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate a full diff report comparing upstream version to local installation
 */
export function generateDiffReport(
  upstreamVersion: string,
  upstreamDir: string,
  localDir: string,
  syncState: SyncState
): DiffReport {
  const fileMap = discoverFiles(upstreamDir, localDir);

  const files: FileDiffEntry[] = [];
  const summary = {
    total: 0,
    unchanged: 0,
    modified: 0,
    added: 0,
    deleted: 0,
    conflicts: 0,
    protected: 0,
  };

  for (const [relativePath, presence] of fileMap) {
    // Skip local-only files (no upstream counterpart)
    if (!presence.upstream) continue;

    const upstreamHash = presence.upstream
      ? hashFile(join(upstreamDir, relativePath))
      : null;
    const localHash = presence.local
      ? hashFile(join(localDir, relativePath))
      : null;
    const lastSyncHash = syncState.files[relativePath]?.hash ?? null;

    const { status, locallyModified } = classifyFile(
      upstreamHash,
      localHash,
      lastSyncHash
    );
    const isProtected = isProtectedPath(relativePath);

    const entry: FileDiffEntry = {
      relativePath,
      category: categorizeFile(relativePath),
      status,
      locallyModified,
      protected: isProtected,
      upstreamHash,
      localHash,
      lastSyncHash,
    };

    files.push(entry);
    summary.total++;

    switch (status) {
      case 'unchanged':
        summary.unchanged++;
        break;
      case 'modified':
        summary.modified++;
        if (locallyModified) summary.conflicts++;
        break;
      case 'added':
        summary.added++;
        break;
      case 'deleted':
        summary.deleted++;
        break;
    }

    if (isProtected) summary.protected++;
  }

  // Sort: conflicts first, then added, then modified, then unchanged
  files.sort((a, b) => {
    const order: Record<string, number> = { added: 0, modified: 1, deleted: 2, unchanged: 3 };
    const aConflict = a.locallyModified ? -1 : 0;
    const bConflict = b.locallyModified ? -1 : 0;
    if (aConflict !== bConflict) return aConflict - bConflict;
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return {
    upstreamVersion,
    timestamp: new Date().toISOString(),
    summary,
    files,
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Discover available upstream versions in Releases/ directory
 */
export function discoverVersions(): string[] {
  const releasesDir = join(CLAUDE_DIR, 'Releases');
  if (!existsSync(releasesDir)) return [];

  try {
    return readdirSync(releasesDir)
      .filter(entry => {
        const fullPath = join(releasesDir, entry);
        return entry.startsWith('v') && statSync(fullPath).isDirectory();
      })
      .sort((a, b) => {
        // Sort by version number
        const av = a.replace('v', '').split('.').map(Number);
        const bv = b.replace('v', '').split('.').map(Number);
        for (let i = 0; i < Math.max(av.length, bv.length); i++) {
          const diff = (av[i] || 0) - (bv[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
  } catch {
    return [];
  }
}

/**
 * Get the path to an upstream release's .claude/ directory
 */
export function getUpstreamPath(version: string): string {
  return join(CLAUDE_DIR, 'Releases', version, '.claude');
}

/**
 * Get latest available upstream version
 */
export function getLatestVersion(): string | null {
  const versions = discoverVersions();
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

/**
 * Default empty sync state
 */
export function defaultSyncState(): SyncState {
  return {
    lastSyncedVersion: null,
    lastSyncTimestamp: null,
    files: {},
    versionHistory: [],
  };
}

/**
 * Format a diff report for human-readable console output
 */
export function formatDiffReport(report: DiffReport): string {
  const lines: string[] = [];

  lines.push(`\nUpstream Sync Report — ${report.upstreamVersion}`);
  lines.push('═'.repeat(60));
  lines.push(`  Total files:  ${report.summary.total}`);
  lines.push(`  Unchanged:    ${report.summary.unchanged}`);
  lines.push(`  Modified:     ${report.summary.modified} (${report.summary.conflicts} conflicts)`);
  lines.push(`  Added:        ${report.summary.added}`);
  lines.push(`  Deleted:      ${report.summary.deleted}`);
  lines.push(`  Protected:    ${report.summary.protected}`);
  lines.push('');

  // Group by category
  const categories = new Map<FileCategory, FileDiffEntry[]>();
  for (const file of report.files) {
    if (file.status === 'unchanged') continue;
    const list = categories.get(file.category) || [];
    list.push(file);
    categories.set(file.category, list);
  }

  if (categories.size === 0) {
    lines.push('  No changes detected.');
    return lines.join('\n');
  }

  for (const [category, files] of categories) {
    lines.push(`── ${category.toUpperCase()} ${'─'.repeat(50 - category.length)}`);
    for (const file of files) {
      const icon = file.locallyModified
        ? '!'
        : file.status === 'added'
        ? '+'
        : file.status === 'deleted'
        ? '-'
        : '~';
      const protectedTag = file.protected ? ' [PROTECTED]' : '';
      const conflictTag = file.locallyModified ? ' [CONFLICT]' : '';
      lines.push(`  ${icon} ${file.relativePath}${conflictTag}${protectedTag}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

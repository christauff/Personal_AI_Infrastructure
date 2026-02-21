#!/usr/bin/env bun
/**
 * IntegrityManifest.ts - SHA-256 integrity baseline for critical PAI files
 *
 * Computes and verifies SHA-256 hashes for security-critical files:
 * - hooks/*.ts (behavior-modifying hooks)
 * - settings.json (configuration)
 * - GOVERNANCE/*.ts and GOVERNANCE/*.sh (governance scripts)
 * - skills/PAI/USER/PAISECURITYSYSTEM/patterns.yaml (detection patterns)
 *
 * CLI:
 *   bun Tools/IntegrityManifest.ts generate  — Compute hashes, store manifest
 *   bun Tools/IntegrityManifest.ts verify    — Compare against stored manifest
 *
 * Exit codes:
 *   0 = clean (generate success, or verify with no drift)
 *   1 = drift detected (verify found changes)
 *   2 = error (missing manifest on verify, filesystem errors)
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

const PAI_DIR = join(homedir(), '.claude');
const MANIFEST_PATH = join(PAI_DIR, 'MEMORY', 'SECURITY', 'integrity-manifest.json');

interface FileEntry {
  sha256: string;
  size: number;
  modified: string;
}

interface Manifest {
  generated: string;
  version: number;
  files: Record<string, FileEntry>;
}

interface VerifyResult {
  clean: boolean;
  changed: string[];
  added: string[];
  removed: string[];
}

/**
 * Compute SHA-256 hash of a file's contents.
 */
function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * List files matching a pattern in a directory.
 * Returns paths relative to PAI_DIR.
 */
function listFiles(dir: string, extension: string): string[] {
  const fullDir = join(PAI_DIR, dir);
  if (!existsSync(fullDir)) {
    return [];
  }
  return readdirSync(fullDir)
    .filter(f => f.endsWith(extension))
    .map(f => join(dir, f));
}

/**
 * Collect all critical file paths (relative to PAI_DIR).
 */
function collectCriticalFiles(): string[] {
  const files: string[] = [];

  // hooks/*.ts
  files.push(...listFiles('hooks', '.ts'));

  // settings.json
  if (existsSync(join(PAI_DIR, 'settings.json'))) {
    files.push('settings.json');
  }

  // GOVERNANCE/*.ts
  files.push(...listFiles('GOVERNANCE', '.ts'));

  // GOVERNANCE/*.sh
  files.push(...listFiles('GOVERNANCE', '.sh'));

  // patterns.yaml
  const patternsPath = 'skills/PAI/USER/PAISECURITYSYSTEM/patterns.yaml';
  if (existsSync(join(PAI_DIR, patternsPath))) {
    files.push(patternsPath);
  }

  return files.sort();
}

/**
 * Generate a new integrity manifest from current file state.
 */
export function generate(): Manifest {
  const files = collectCriticalFiles();
  const manifest: Manifest = {
    generated: new Date().toISOString(),
    version: 1,
    files: {},
  };

  for (const relPath of files) {
    const fullPath = join(PAI_DIR, relPath);
    try {
      const stat = statSync(fullPath);
      manifest.files[relPath] = {
        sha256: hashFile(fullPath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    } catch (err) {
      console.error(`Warning: Could not hash ${relPath}: ${err}`);
    }
  }

  return manifest;
}

/**
 * Verify current file state against a stored manifest.
 */
export function verify(stored: Manifest): VerifyResult {
  const currentFiles = collectCriticalFiles();
  const storedFiles = Object.keys(stored.files);

  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Check for changed and added files
  for (const relPath of currentFiles) {
    const fullPath = join(PAI_DIR, relPath);
    if (!(relPath in stored.files)) {
      added.push(relPath);
      continue;
    }
    try {
      const currentHash = hashFile(fullPath);
      if (currentHash !== stored.files[relPath].sha256) {
        changed.push(relPath);
      }
    } catch (err) {
      console.error(`Warning: Could not verify ${relPath}: ${err}`);
      changed.push(relPath);
    }
  }

  // Check for removed files
  for (const relPath of storedFiles) {
    if (!currentFiles.includes(relPath)) {
      removed.push(relPath);
    }
  }

  return {
    clean: changed.length === 0 && added.length === 0 && removed.length === 0,
    changed,
    added,
    removed,
  };
}

/**
 * CLI entry point.
 */
function main(): void {
  const command = process.argv[2];

  if (!command || !['generate', 'verify'].includes(command)) {
    console.error('Usage: bun IntegrityManifest.ts <generate|verify>');
    console.error('  generate  - Compute hashes and store manifest');
    console.error('  verify    - Compare current state against stored manifest');
    process.exit(2);
  }

  if (command === 'generate') {
    const manifest = generate();
    const fileCount = Object.keys(manifest.files).length;

    // Ensure output directory exists
    const manifestDir = join(PAI_DIR, 'MEMORY', 'SECURITY');
    if (!existsSync(manifestDir)) {
      mkdirSync(manifestDir, { recursive: true });
    }

    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`Integrity manifest generated: ${fileCount} files hashed`);
    console.log(`Stored at: ${MANIFEST_PATH}`);
    process.exit(0);
  }

  if (command === 'verify') {
    if (!existsSync(MANIFEST_PATH)) {
      console.error('No manifest found. Run "generate" first.');
      console.error(`Expected at: ${MANIFEST_PATH}`);
      process.exit(2);
    }

    let stored: Manifest;
    try {
      stored = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (err) {
      console.error(`Failed to parse manifest: ${err}`);
      process.exit(2);
      return; // unreachable but satisfies TS
    }

    const result = verify(stored);

    if (result.clean) {
      console.log('INTEGRITY CHECK: CLEAN');
      console.log(`All ${Object.keys(stored.files).length} files match manifest from ${stored.generated}`);
      process.exit(0);
    }

    console.log('INTEGRITY CHECK: DRIFT DETECTED');
    console.log(`Manifest from: ${stored.generated}`);

    if (result.changed.length > 0) {
      console.log(`\nCHANGED (${result.changed.length}):`);
      for (const f of result.changed) {
        console.log(`  ~ ${f}`);
      }
    }

    if (result.added.length > 0) {
      console.log(`\nADDED (${result.added.length}):`);
      for (const f of result.added) {
        console.log(`  + ${f}`);
      }
    }

    if (result.removed.length > 0) {
      console.log(`\nREMOVED (${result.removed.length}):`);
      for (const f of result.removed) {
        console.log(`  - ${f}`);
      }
    }

    process.exit(1);
  }
}

main();

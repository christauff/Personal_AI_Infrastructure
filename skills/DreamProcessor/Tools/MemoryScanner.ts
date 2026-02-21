#!/usr/bin/env bun
/**
 * MemoryScanner.ts - Scan memory directories for unprocessed content
 * Part of DreamProcessor skill
 *
 * Scalability considerations:
 * - Streams file metadata, doesn't load content into memory
 * - Configurable limits prevent runaway scans
 * - Uses fd for fast file discovery
 * - Returns summaries, not full content
 *
 * Usage:
 *   bun run MemoryScanner.ts [options]
 *
 * Options:
 *   --hours=N     Scan files modified in last N hours (default: 24)
 *   --limit=N     Maximum files to return (default: 100)
 *   --dir=PATH    Specific directory to scan (default: all memory dirs)
 *   --category    Include category inference (slower)
 *   --json        Output as JSON (default: formatted text)
 */

import { $ } from "bun";
import { readdir, stat } from "fs/promises";
import { join, relative, basename, extname } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";

// Configuration
const PAI_DIR = process.env.HOME + "/.claude";
const MEMORY_DIRS = [
  `${PAI_DIR}/MEMORY/FRESH`,
  `${PAI_DIR}/MEMORY/WORK`,
  `${PAI_DIR}/MEMORY/LEARNING`,
  `${PAI_DIR}/MEMORY/STATE`,
];

// Detect file finder binary once at startup
type FinderType = "fd" | "fdfind" | "find" | "none";
function detectFinder(): FinderType {
  for (const cmd of ["fd", "fdfind"] as const) {
    try {
      execSync(`which ${cmd}`, { stdio: "pipe" });
      return cmd;
    } catch { /* not found */ }
  }
  try {
    execSync("which find", { stdio: "pipe" });
    return "find";
  } catch { /* not found */ }
  return "none";
}
const FINDER = detectFinder();

interface MemoryFile {
  path: string;
  relativePath: string;
  modified: string;
  modifiedTimestamp: number;
  sizeBytes: number;
  category: string;
  extension: string;
  preview?: string;
}

interface ScanResult {
  scanTime: string;
  hoursBack: number;
  totalFilesFound: number;
  filesReturned: number;
  limitApplied: boolean;
  directoriesScanned: string[];
  files: MemoryFile[];
  categoryCounts: Record<string, number>;
}

// Parse command line arguments
function parseArgs(): {
  hours: number;
  limit: number;
  dir?: string;
  includeCategory: boolean;
  json: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    hours: 24,
    limit: 100,
    dir: undefined as string | undefined,
    includeCategory: false,
    json: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--hours=")) {
      result.hours = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--limit=")) {
      result.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--dir=")) {
      result.dir = arg.split("=")[1];
    } else if (arg === "--category") {
      result.includeCategory = true;
    } else if (arg === "--json") {
      result.json = true;
    }
  }

  return result;
}

// Infer category from file path and extension
function inferCategory(filePath: string): string {
  const lower = filePath.toLowerCase();

  // Path-based inference
  if (lower.includes("/learning/")) return "learning";
  if (lower.includes("/work/")) return "work";
  if (lower.includes("/fresh/")) return "fresh";
  if (lower.includes("/state/")) return "state";
  if (lower.includes("/research/")) return "research";

  // Extension-based inference
  const ext = extname(lower);
  if ([".ts", ".js", ".py", ".go", ".rs"].includes(ext)) return "technical";
  if ([".md", ".txt"].includes(ext)) return "documentation";
  if ([".yaml", ".yml", ".json"].includes(ext)) return "config";
  if ([".log"].includes(ext)) return "logs";

  return "uncategorized";
}

// Get file preview (first N characters) - only if small file
async function getPreview(
  filePath: string,
  maxBytes: number = 200
): Promise<string | undefined> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;

    // Skip large files and binaries
    if (size > 100000) return "[large file - preview skipped]";

    const ext = extname(filePath).toLowerCase();
    if ([".png", ".jpg", ".gif", ".pdf", ".zip"].includes(ext)) {
      return "[binary file]";
    }

    const text = await file.text();
    const preview = text.slice(0, maxBytes).replace(/\n/g, " ").trim();
    return preview.length < text.length ? preview + "..." : preview;
  } catch {
    return undefined;
  }
}

// Recursively walk a directory and collect file paths
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await walkDir(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return results;
}

// Scan a single directory recursively for modified files
async function scanDirectory(
  dir: string,
  cutoffTime: number,
  limit: number,
  includeCategory: boolean
): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  let filePaths: string[] = [];
  const hoursAgo = Math.ceil((Date.now() - cutoffTime) / (1000 * 60 * 60));

  try {
    let result = "";
    switch (FINDER) {
      case "fd":
        result = await $`fd --no-ignore-vcs --type f --changed-within ${hoursAgo}h . ${dir} 2>/dev/null`.text();
        break;
      case "fdfind":
        result = await $`fdfind --no-ignore-vcs --type f --changed-within ${hoursAgo}h . ${dir} 2>/dev/null`.text();
        break;
      case "find":
        result = await $`find ${dir} -type f -mmin -${hoursAgo * 60} 2>/dev/null`.text();
        break;
      case "none":
        filePaths = await walkDir(dir);
        break;
    }
    if (FINDER !== "none") {
      filePaths = result.trim().split("\n").filter((p) => p);
    }
  } catch {
    // Subprocess failed — use recursive readdir
    filePaths = await walkDir(dir);
  }

  for (const filePath of filePaths.slice(0, limit)) {
    try {
      const stats = await stat(filePath);
      if (stats.mtimeMs >= cutoffTime) {
        const memFile: MemoryFile = {
          path: filePath,
          relativePath: relative(PAI_DIR, filePath),
          modified: new Date(stats.mtimeMs).toISOString(),
          modifiedTimestamp: stats.mtimeMs,
          sizeBytes: stats.size,
          category: includeCategory ? inferCategory(filePath) : "unknown",
          extension: extname(filePath),
        };

        // Only get preview for smaller files
        if (stats.size < 50000) {
          memFile.preview = await getPreview(filePath);
        }

        files.push(memFile);
      }
    } catch {
      // Skip files we can't stat
    }
  }

  return files;
}

// Main scan function
async function scan(): Promise<ScanResult> {
  const args = parseArgs();
  const cutoffTime = Date.now() - args.hours * 60 * 60 * 1000;

  const dirsToScan = args.dir ? [args.dir] : MEMORY_DIRS;
  let allFiles: MemoryFile[] = [];

  for (const dir of dirsToScan) {
    const files = await scanDirectory(
      dir,
      cutoffTime,
      args.limit,
      args.includeCategory
    );
    allFiles = allFiles.concat(files);
  }

  // Sort by modification time (newest first)
  allFiles.sort((a, b) => b.modifiedTimestamp - a.modifiedTimestamp);

  // Apply limit
  const totalFound = allFiles.length;
  const limitApplied = totalFound > args.limit;
  allFiles = allFiles.slice(0, args.limit);

  // Count categories
  const categoryCounts: Record<string, number> = {};
  for (const file of allFiles) {
    categoryCounts[file.category] = (categoryCounts[file.category] || 0) + 1;
  }

  const result: ScanResult = {
    scanTime: new Date().toISOString(),
    hoursBack: args.hours,
    totalFilesFound: totalFound,
    filesReturned: allFiles.length,
    limitApplied,
    directoriesScanned: dirsToScan,
    files: allFiles,
    categoryCounts,
  };

  // Output
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Memory Scan Results`);
    console.log(`===================`);
    console.log(`Scan time: ${result.scanTime}`);
    console.log(`Looking back: ${args.hours} hours`);
    console.log(`Files found: ${totalFound}${limitApplied ? ` (limited to ${args.limit})` : ""}`);
    console.log(`Directories: ${dirsToScan.join(", ")}`);
    console.log();

    if (Object.keys(categoryCounts).length > 0) {
      console.log(`Categories:`);
      for (const [cat, count] of Object.entries(categoryCounts)) {
        console.log(`  ${cat}: ${count}`);
      }
      console.log();
    }

    console.log(`Files (newest first):`);
    for (const file of allFiles) {
      const sizeKB = Math.round(file.sizeBytes / 1024);
      console.log(`  ${file.relativePath}`);
      console.log(`    Modified: ${file.modified} | Size: ${sizeKB}KB | Category: ${file.category}`);
      if (file.preview) {
        console.log(`    Preview: ${file.preview.slice(0, 100)}`);
      }
      console.log();
    }
  }

  return result;
}

// Run
scan().catch(console.error);

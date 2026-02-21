#!/usr/bin/env bun
/**
 * TraceCapture.ts - AI Code Provenance Tracking Tool
 *
 * Track AI-generated code ranges with conversation context.
 * Append-only JSONL storage for audit trail.
 *
 * Usage:
 *   bun run TraceCapture.ts capture <file> --start-line <N> --end-line <N> --action <write|edit> [--session-id <id>] [--model <model>]
 *   bun run TraceCapture.ts query [--file <path>] [--session <id>] [--since <date>] [--limit <N>]
 *   bun run TraceCapture.ts report [--since <date>]
 *   bun run TraceCapture.ts --help
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";

const SKILL_DIR = join(import.meta.dir, "..");
const DATA_DIR = join(SKILL_DIR, "Data");
const TRACES_PATH = join(DATA_DIR, "traces.jsonl");

// ============================================================
// TYPES
// ============================================================

interface TraceRecord {
  ts: string;
  file: string;
  startLine: number;
  endLine: number;
  model: string;
  sessionId: string;
  action: "write" | "edit";
  linesChanged: number;
}

// ============================================================
// HELPERS
// ============================================================

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, ...v] = key.split("=");
        parsed[k] = v.join("=");
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed[key] = args[i + 1];
        i++;
      } else {
        parsed[key] = "true";
      }
    }
  }
  return parsed;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readTraces(): TraceRecord[] {
  if (!existsSync(TRACES_PATH)) return [];
  const content = readFileSync(TRACES_PATH, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => {
    try {
      return JSON.parse(line) as TraceRecord;
    } catch {
      return null;
    }
  }).filter(Boolean) as TraceRecord[];
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : " ".repeat(len - str.length) + str;
}

// ============================================================
// SUBCOMMANDS
// ============================================================

function showHelp(): void {
  console.log(`AgentTrace - AI Code Provenance Tracking

USAGE:
  bun run TraceCapture.ts <command> [options]

COMMANDS:
  capture <file>  Record a trace for a file
  query           Search trace records
  report          Generate aggregate report

CAPTURE OPTIONS:
  --start-line <N>     Start line number (required)
  --end-line <N>       End line number (required)
  --action <type>      write or edit (required)
  --session-id <id>    Session identifier (default: "manual")
  --model <name>       Model name (default: "unknown")

QUERY OPTIONS:
  --file <path>        Filter by file path (substring match)
  --session <id>       Filter by session ID
  --since <date>       Filter by date (ISO format)
  --limit <N>          Max results (default: 50)

REPORT OPTIONS:
  --since <date>       Only include traces since date

EXAMPLES:
  bun run TraceCapture.ts capture /tmp/test.ts --start-line 1 --end-line 50 --action write
  bun run TraceCapture.ts query --file /tmp/test.ts
  bun run TraceCapture.ts query --since 2026-02-01 --limit 20
  bun run TraceCapture.ts report --since 2026-02-01
`);
}

function captureTrace(args: string[]): void {
  // First positional arg after "capture" is the file path
  const positionalArgs = args.filter((a) => !a.startsWith("--"));
  const file = positionalArgs[1]; // [0] is "capture"

  if (!file) {
    console.error("Error: File path required. Usage: capture <file> --start-line <N> --end-line <N> --action <write|edit>");
    process.exit(1);
  }

  const opts = parseArgs(args);
  const startLine = parseInt(opts["start-line"] || "0", 10);
  const endLine = parseInt(opts["end-line"] || "0", 10);
  const action = opts["action"] as "write" | "edit";

  if (!action || (action !== "write" && action !== "edit")) {
    console.error("Error: --action must be 'write' or 'edit'");
    process.exit(1);
  }

  if (startLine === 0 || endLine === 0) {
    console.error("Error: --start-line and --end-line are required and must be > 0");
    process.exit(1);
  }

  const sessionId = opts["session-id"] || "manual";
  const model = opts["model"] || "unknown";
  const linesChanged = Math.abs(endLine - startLine) + 1;

  const trace: TraceRecord = {
    ts: new Date().toISOString(),
    file,
    startLine,
    endLine,
    model,
    sessionId,
    action,
    linesChanged,
  };

  ensureDataDir();
  appendFileSync(TRACES_PATH, JSON.stringify(trace) + "\n");

  console.log(`Trace recorded: ${action} ${file} [${startLine}-${endLine}] (${linesChanged} lines, model=${model}, session=${sessionId})`);
}

function queryTraces(args: string[]): void {
  const opts = parseArgs(args);
  const fileFilter = opts["file"] || "";
  const sessionFilter = opts["session"] || "";
  const sinceFilter = opts["since"] || "";
  const limit = parseInt(opts["limit"] || "50", 10);

  let traces = readTraces();

  if (fileFilter) {
    traces = traces.filter((t) => t.file.includes(fileFilter));
  }
  if (sessionFilter) {
    traces = traces.filter((t) => t.sessionId === sessionFilter);
  }
  if (sinceFilter) {
    const sinceDate = new Date(sinceFilter);
    traces = traces.filter((t) => new Date(t.ts) >= sinceDate);
  }

  // Most recent first
  traces.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  traces = traces.slice(0, limit);

  if (traces.length === 0) {
    console.log("No traces found matching criteria.");
    return;
  }

  // Print table header
  const hdr = [
    padRight("TIMESTAMP", 24),
    padRight("ACTION", 6),
    padRight("FILE", 40),
    padLeft("LINES", 8),
    padRight("MODEL", 20),
    padRight("SESSION", 16),
  ].join("  ");

  console.log(hdr);
  console.log("-".repeat(hdr.length));

  for (const t of traces) {
    const ts = t.ts.replace("T", " ").slice(0, 19);
    const shortFile = t.file.length > 40 ? "..." + t.file.slice(-37) : t.file;
    const lineRange = `${t.startLine}-${t.endLine}`;

    console.log([
      padRight(ts, 24),
      padRight(t.action, 6),
      padRight(shortFile, 40),
      padLeft(lineRange, 8),
      padRight(t.model, 20),
      padRight(t.sessionId.slice(0, 16), 16),
    ].join("  "));
  }

  console.log(`\n${traces.length} trace(s) shown.`);
}

function generateReport(args: string[]): void {
  const opts = parseArgs(args);
  const sinceFilter = opts["since"] || "";

  let traces = readTraces();

  if (sinceFilter) {
    const sinceDate = new Date(sinceFilter);
    traces = traces.filter((t) => new Date(t.ts) >= sinceDate);
  }

  if (traces.length === 0) {
    console.log("No traces found for report.");
    return;
  }

  // Aggregate by file
  const fileStats = new Map<string, { count: number; totalLines: number }>();
  for (const t of traces) {
    const existing = fileStats.get(t.file) || { count: 0, totalLines: 0 };
    existing.count++;
    existing.totalLines += t.linesChanged;
    fileStats.set(t.file, existing);
  }

  // Aggregate by model
  const modelStats = new Map<string, { count: number; totalLines: number }>();
  for (const t of traces) {
    const existing = modelStats.get(t.model) || { count: 0, totalLines: 0 };
    existing.count++;
    existing.totalLines += t.linesChanged;
    modelStats.set(t.model, existing);
  }

  // Aggregate by session
  const sessionStats = new Map<string, { count: number; totalLines: number }>();
  for (const t of traces) {
    const existing = sessionStats.get(t.sessionId) || { count: 0, totalLines: 0 };
    existing.count++;
    existing.totalLines += t.linesChanged;
    sessionStats.set(t.sessionId, existing);
  }

  // Date range
  const dates = traces.map((t) => new Date(t.ts).getTime());
  const earliest = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const latest = new Date(Math.max(...dates)).toISOString().slice(0, 10);

  // Action breakdown
  const writes = traces.filter((t) => t.action === "write").length;
  const edits = traces.filter((t) => t.action === "edit").length;
  const totalLines = traces.reduce((sum, t) => sum + t.linesChanged, 0);

  // Print report
  console.log("=".repeat(60));
  console.log("AGENTTRACE PROVENANCE REPORT");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Date Range:      ${earliest} to ${latest}`);
  console.log(`Total Traces:    ${traces.length}`);
  console.log(`Total Lines:     ${totalLines}`);
  console.log(`Writes:          ${writes}`);
  console.log(`Edits:           ${edits}`);
  console.log(`Files Touched:   ${fileStats.size}`);
  console.log(`Sessions:        ${sessionStats.size}`);
  console.log(`Models:          ${modelStats.size}`);

  // Top files
  console.log("");
  console.log("-".repeat(60));
  console.log("TOP FILES BY TRACE COUNT");
  console.log("-".repeat(60));
  const sortedFiles = [...fileStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  for (const [file, stats] of sortedFiles) {
    const shortFile = file.length > 45 ? "..." + file.slice(-42) : file;
    console.log(`  ${padRight(shortFile, 45)}  ${padLeft(String(stats.count), 4)} traces  ${padLeft(String(stats.totalLines), 6)} lines`);
  }

  // Models
  console.log("");
  console.log("-".repeat(60));
  console.log("LINES BY MODEL");
  console.log("-".repeat(60));
  const sortedModels = [...modelStats.entries()].sort((a, b) => b[1].totalLines - a[1].totalLines);
  for (const [model, stats] of sortedModels) {
    console.log(`  ${padRight(model, 25)}  ${padLeft(String(stats.count), 4)} traces  ${padLeft(String(stats.totalLines), 6)} lines`);
  }

  // Sessions
  console.log("");
  console.log("-".repeat(60));
  console.log("TOP SESSIONS BY ACTIVITY");
  console.log("-".repeat(60));
  const sortedSessions = [...sessionStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  for (const [session, stats] of sortedSessions) {
    const shortSession = session.length > 30 ? session.slice(0, 27) + "..." : session;
    console.log(`  ${padRight(shortSession, 30)}  ${padLeft(String(stats.count), 4)} traces  ${padLeft(String(stats.totalLines), 6)} lines`);
  }

  console.log("");
  console.log("=".repeat(60));
}

// ============================================================
// MAIN
// ============================================================

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  showHelp();
  process.exit(0);
}

switch (command) {
  case "capture":
    captureTrace(args);
    break;
  case "query":
    queryTraces(args);
    break;
  case "report":
    generateReport(args);
    break;
  default:
    console.error(`Unknown command: ${command}. Run with --help for usage.`);
    process.exit(1);
}

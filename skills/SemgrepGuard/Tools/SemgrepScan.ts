#!/usr/bin/env bun
/**
 * SemgrepScan.ts - SAST scanning tool wrapping Semgrep CLI
 *
 * Usage:
 *   bun run SemgrepScan.ts scan <path> [--severity high|medium|low] [--fix] [--rules <path>]
 *   bun run SemgrepScan.ts report
 *   bun run SemgrepScan.ts rules
 *   bun run SemgrepScan.ts --help
 *
 * Exit codes:
 *   0 - No HIGH+ findings (or report/rules subcommand)
 *   1 - HIGH+ findings detected
 *   2 - Execution error
 *
 * NOTE: Semgrep is installed as a snap, which cannot read dotfile directories
 * (~/.claude). This tool stages files to ~/semgrep-staging/ before scanning,
 * then maps paths back to their original locations in the output.
 */

import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
  statSync,
  readdirSync,
} from "fs";
import { join, resolve, relative, basename, dirname } from "path";
import { homedir } from "os";

// ============================================================
// PATHS
// ============================================================

const HOME = homedir();
const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_DIR = join(SKILL_DIR, "Config");
const DATA_DIR = join(SKILL_DIR, "Data");
const RULES_PATH = join(CONFIG_DIR, "rules.yaml");
const FINDINGS_PATH = join(DATA_DIR, "findings.jsonl");
const SEMGREP_BIN = "/snap/bin/semgrep";

// Snap-accessible staging directory (not a dotdir)
const STAGING_DIR = join(HOME, "semgrep-staging");

// ============================================================
// TYPES
// ============================================================

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    fix?: string;
    lines?: string;
    metadata?: Record<string, unknown>;
  };
}

interface SemgrepOutput {
  results: SemgrepResult[];
  errors: Array<{ message: string }>;
  version: string;
}

interface Finding {
  ts: string;
  file: string;
  rule: string;
  severity: string;
  message: string;
  line: number;
  fix: string | null;
}

// ============================================================
// HELPERS
// ============================================================

function severityRank(sev: string): number {
  const upper = sev.toUpperCase();
  if (upper === "ERROR" || upper === "HIGH") return 3;
  if (upper === "WARNING" || upper === "MEDIUM") return 2;
  if (upper === "INFO" || upper === "LOW") return 1;
  return 0;
}

function normalizeSeverity(sev: string): string {
  const upper = sev.toUpperCase();
  if (upper === "ERROR") return "HIGH";
  if (upper === "WARNING") return "MEDIUM";
  if (upper === "INFO") return "LOW";
  return upper;
}

/**
 * Strip staging path prefix from semgrep rule IDs.
 * Semgrep prepends config file path to rule IDs when using local --config,
 * e.g. "home.christauff.semgrep-staging.config.pai-exec-injection"
 * We want just "pai-exec-injection".
 */
function normalizeRuleId(checkId: string): string {
  // Match our rule ID pattern: pai-<something>
  const match = checkId.match(/\bpai-[\w-]+$/);
  return match ? match[0] : checkId;
}

/**
 * Stage files to ~/semgrep-staging/ so the snap can read them.
 * Returns { stagedTarget, stagedRules, pathMap } where pathMap
 * maps staged paths back to original paths.
 */
function stageForSnap(
  targetPath: string,
  rulesPath: string | null
): { stagedTarget: string; stagedRules: string | null; cleanup: () => void } {
  // Clean up any previous staging
  try {
    rmSync(STAGING_DIR, { recursive: true, force: true });
  } catch {}

  mkdirSync(join(STAGING_DIR, "target"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "config"), { recursive: true });

  // Copy target (file or directory)
  const stagedTarget = join(STAGING_DIR, "target");
  const stat = statSync(targetPath);
  if (stat.isDirectory()) {
    cpSync(targetPath, stagedTarget, { recursive: true });
  } else {
    // Single file -- copy into target dir preserving name
    const dest = join(stagedTarget, basename(targetPath));
    cpSync(targetPath, dest);
  }

  // Copy rules if present
  let stagedRules: string | null = null;
  if (rulesPath && existsSync(rulesPath)) {
    stagedRules = join(STAGING_DIR, "config", "rules.yaml");
    cpSync(rulesPath, stagedRules);
  }

  const cleanup = () => {
    try {
      rmSync(STAGING_DIR, { recursive: true, force: true });
    } catch {}
  };

  return { stagedTarget, stagedRules, cleanup };
}

/**
 * Map a staged path back to the original path.
 * e.g., ~/semgrep-staging/target/SemgrepScan.ts -> /original/path/SemgrepScan.ts
 */
function unstage(stagedPath: string, originalTarget: string): string {
  const stagedTarget = join(STAGING_DIR, "target");
  const rel = relative(stagedTarget, stagedPath);
  const stat = statSync(originalTarget);
  if (stat.isDirectory()) {
    return join(originalTarget, rel);
  } else {
    // Single file -- the staged file is basename, return original
    return originalTarget;
  }
}

function printUsage(): void {
  console.log(`SemgrepScan - PAI SAST Scanning Tool

Usage:
  bun run SemgrepScan.ts scan <path> [options]   Scan files for security issues
  bun run SemgrepScan.ts report                   Show findings report
  bun run SemgrepScan.ts rules                    List available rules
  bun run SemgrepScan.ts --help                   Show this help

Scan Options:
  --severity <level>   Filter by minimum severity: high, medium, low (default: low)
  --fix                Apply auto-fixes where available
  --rules <path>       Path to custom rules YAML (default: Config/rules.yaml)

Exit Codes:
  0  No HIGH+ findings found (or report/rules command)
  1  HIGH+ findings detected
  2  Execution error`);
}

// ============================================================
// SCAN SUBCOMMAND
// ============================================================

async function runScan(
  targetPath: string,
  options: {
    severity: string;
    fix: boolean;
    rulesPath: string;
  }
): Promise<number> {
  const resolvedPath = resolve(targetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Path does not exist: ${resolvedPath}`);
    return 2;
  }

  if (!existsSync(SEMGREP_BIN)) {
    console.error(`Error: Semgrep not found at ${SEMGREP_BIN}`);
    return 2;
  }

  console.log(`Scanning: ${resolvedPath}`);
  if (existsSync(options.rulesPath)) {
    console.log(`Rules: ${options.rulesPath}`);
  }
  console.log("");

  // Stage files for snap confinement
  const { stagedTarget, stagedRules, cleanup } = stageForSnap(
    resolvedPath,
    existsSync(options.rulesPath) ? options.rulesPath : null
  );

  try {
    // Build semgrep command args
    const args: string[] = ["scan", "--json"];

    // Add custom rules if staged
    if (stagedRules) {
      args.push("--config", stagedRules);
    }

    // Add auto-fix flag
    if (options.fix) {
      args.push("--autofix");
    }

    // Add staged target path
    args.push(stagedTarget);

    const proc = Bun.spawn([SEMGREP_BIN, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SEMGREP_SEND_METRICS: "off" },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    // Semgrep exits with code 1 when findings are present, which is normal
    let output: SemgrepOutput;
    try {
      output = JSON.parse(stdout);
    } catch {
      // If JSON parse fails, check stderr for real errors
      if (stderr.trim()) {
        console.error(`Semgrep stderr: ${stderr.trim()}`);
      }
      if (!stdout.trim()) {
        console.error("Error: No output from semgrep");
        return 2;
      }
      console.error(`Error: Could not parse semgrep output`);
      return 2;
    }

    // Filter by severity
    const minRank = severityRank(options.severity);
    const filtered = (output.results || []).filter(
      (r) => severityRank(r.extra?.severity || "INFO") >= minRank
    );

    // Convert to findings, mapping staged paths back to originals
    const findings: Finding[] = filtered.map((r) => ({
      ts: new Date().toISOString(),
      file: unstage(r.path, resolvedPath),
      rule: normalizeRuleId(r.check_id),
      severity: normalizeSeverity(r.extra?.severity || "INFO"),
      message: r.extra?.message || "",
      line: r.start?.line || 0,
      fix: r.extra?.fix || null,
    }));

    // Append findings to data file
    if (findings.length > 0) {
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        const lines = findings.map((f) => JSON.stringify(f)).join("\n") + "\n";
        appendFileSync(FINDINGS_PATH, lines);
      } catch (e) {
        console.error(`Warning: Could not write findings log: ${e}`);
      }
    }

    // Print semgrep errors/warnings if any (filter noise)
    const realErrors = (output.errors || []).filter(
      (e) => !e.message?.includes("METRICS")
    );
    if (realErrors.length > 0) {
      console.log("Semgrep Warnings:");
      for (const err of realErrors) {
        console.log(`  - ${err.message}`);
      }
      console.log("");
    }

    // Group findings by severity
    const high = findings.filter((f) => f.severity === "HIGH");
    const medium = findings.filter((f) => f.severity === "MEDIUM");
    const low = findings.filter((f) => f.severity === "LOW");

    // Print formatted results
    if (findings.length === 0) {
      console.log("No findings detected. Clean scan.");
      return 0;
    }

    if (high.length > 0) {
      console.log(
        `### HIGH (${high.length} finding${high.length > 1 ? "s" : ""})`
      );
      for (const f of high) {
        console.log(`  - [${f.rule}] ${f.file}:${f.line} - ${f.message}`);
        if (f.fix) console.log(`    Fix: ${f.fix}`);
      }
      console.log("");
    }

    if (medium.length > 0) {
      console.log(
        `### MEDIUM (${medium.length} finding${medium.length > 1 ? "s" : ""})`
      );
      for (const f of medium) {
        console.log(`  - [${f.rule}] ${f.file}:${f.line} - ${f.message}`);
        if (f.fix) console.log(`    Fix: ${f.fix}`);
      }
      console.log("");
    }

    if (low.length > 0) {
      console.log(
        `### LOW (${low.length} finding${low.length > 1 ? "s" : ""})`
      );
      for (const f of low) {
        console.log(`  - [${f.rule}] ${f.file}:${f.line} - ${f.message}`);
      }
      console.log("");
    }

    console.log(`### Summary`);
    console.log(
      `Total: ${findings.length} finding${findings.length > 1 ? "s" : ""} (${high.length} high, ${medium.length} medium, ${low.length} low)`
    );

    if (options.fix && findings.some((f) => f.fix)) {
      console.log(`\nAuto-fixes were applied. Re-scan recommended to verify.`);
    }

    // Exit code 1 if HIGH findings present
    return high.length > 0 ? 1 : 0;
  } catch (e) {
    console.error(`Error running semgrep: ${e}`);
    return 2;
  } finally {
    cleanup();
  }
}

// ============================================================
// REPORT SUBCOMMAND
// ============================================================

function runReport(): number {
  if (!existsSync(FINDINGS_PATH)) {
    console.log("No findings recorded yet. Run a scan first.");
    console.log(`Expected findings file: ${FINDINGS_PATH}`);
    return 0;
  }

  const content = readFileSync(FINDINGS_PATH, "utf-8").trim();
  if (!content) {
    console.log("Findings file is empty. Run a scan first.");
    return 0;
  }

  const lines = content.split("\n").filter((l) => l.trim());
  const findings: Finding[] = [];
  for (const line of lines) {
    try {
      findings.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (findings.length === 0) {
    console.log("No valid findings in log.");
    return 0;
  }

  // Aggregate stats
  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  let earliest = findings[0].ts;
  let latest = findings[0].ts;

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    byFile[f.file] = (byFile[f.file] || 0) + 1;
    if (f.ts < earliest) earliest = f.ts;
    if (f.ts > latest) latest = f.ts;
  }

  const sortedRules = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  const sortedFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
  const uniqueFiles = Object.keys(byFile).length;

  console.log("## SemgrepGuard Findings Report\n");

  console.log("### Summary");
  console.log(`- Total findings: ${findings.length}`);
  console.log(`- Period: ${earliest.slice(0, 10)} to ${latest.slice(0, 10)}`);
  console.log(`- Files affected: ${uniqueFiles}\n`);

  console.log("### By Severity");
  console.log(`- HIGH: ${bySeverity["HIGH"] || 0} findings`);
  console.log(`- MEDIUM: ${bySeverity["MEDIUM"] || 0} findings`);
  console.log(`- LOW: ${bySeverity["LOW"] || 0} findings\n`);

  console.log("### Top Rules");
  for (const [rule, count] of sortedRules.slice(0, 10)) {
    console.log(`- ${rule}: ${count} occurrence${count > 1 ? "s" : ""}`);
  }
  console.log("");

  console.log("### Top Files");
  for (const [file, count] of sortedFiles.slice(0, 10)) {
    console.log(`- ${file}: ${count} finding${count > 1 ? "s" : ""}`);
  }

  return 0;
}

// ============================================================
// RULES SUBCOMMAND
// ============================================================

function runRules(): number {
  console.log("## Available Custom Rules\n");

  if (!existsSync(RULES_PATH)) {
    console.log("No custom rules file found at: " + RULES_PATH);
    console.log("Only Semgrep default rulesets will be used.");
    return 0;
  }

  const content = readFileSync(RULES_PATH, "utf-8");

  // Simple YAML parsing for rule IDs and metadata
  // Split on "  - id:" to get individual rule blocks, skip the preamble
  const ruleBlocks = content.split(/\n  - id:\s*/);
  let count = 0;

  for (let i = 0; i < ruleBlocks.length; i++) {
    const block = ruleBlocks[i];
    if (!block.trim()) continue;

    // First block is just "rules:" preamble, skip it
    if (i === 0 && block.trim().startsWith("rules:")) continue;

    const idMatch = block.match(/^(\S+)/);
    const sevMatch = block.match(/severity:\s*(\S+)/);
    const msgMatch = block.match(/message:\s*"([^"]+)"/);
    const langMatch = block.match(/languages:\s*\[([^\]]+)\]/);

    if (idMatch) {
      count++;
      const id = idMatch[1];
      const severity = sevMatch ? sevMatch[1] : "UNKNOWN";
      const message = msgMatch ? msgMatch[1] : "(no description)";
      const languages = langMatch ? langMatch[1] : "any";

      console.log(`${count}. **${id}** [${severity}]`);
      console.log(`   ${message}`);
      console.log(`   Languages: ${languages}\n`);
    }
  }

  if (count === 0) {
    console.log("No rules found in rules file.");
  } else {
    console.log(`\nTotal: ${count} custom rule${count > 1 ? "s" : ""}`);
  }

  console.log(`\nRules file: ${RULES_PATH}`);
  return 0;
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "scan": {
      const targetPath = args[1];
      if (!targetPath) {
        console.error("Error: scan requires a path argument");
        console.error("Usage: bun run SemgrepScan.ts scan <path>");
        process.exit(2);
      }

      // Parse options
      let severity = "low";
      let fix = false;
      let rulesPath = RULES_PATH;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--severity" && args[i + 1]) {
          severity = args[i + 1].toLowerCase();
          i++;
        } else if (args[i] === "--fix") {
          fix = true;
        } else if (args[i] === "--rules" && args[i + 1]) {
          rulesPath = resolve(args[i + 1]);
          i++;
        }
      }

      const exitCode = await runScan(targetPath, { severity, fix, rulesPath });
      process.exit(exitCode);
      break;
    }

    case "report": {
      const exitCode = runReport();
      process.exit(exitCode);
      break;
    }

    case "rules": {
      const exitCode = runRules();
      process.exit(exitCode);
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printUsage();
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`Fatal error: ${e}`);
  process.exit(2);
});

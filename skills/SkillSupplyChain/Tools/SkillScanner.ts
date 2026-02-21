#!/usr/bin/env bun
/**
 * SkillScanner.ts - Skill Package Security Scanner
 *
 * Scans skill packages for security issues before installation.
 * Pipeline: Static analysis -> SemgrepGuard -> Prompt injection detection -> Verdict
 *
 * Usage:
 *   bun run SkillScanner.ts scan <path> [--strict] [--report] [--json]
 *   bun run SkillScanner.ts report
 *   bun run SkillScanner.ts policy
 *   bun run SkillScanner.ts --help
 *
 * Exit codes:
 *   0 - PASS
 *   1 - WARN
 *   2 - FAIL or error
 */

import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { join, resolve, extname, relative } from "path";
import { parse as parseYaml } from "yaml";

// ============================================================
// PATHS
// ============================================================

const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_DIR = join(SKILL_DIR, "Config");
const DATA_DIR = join(SKILL_DIR, "Data");
const POLICIES_PATH = join(CONFIG_DIR, "policies.yaml");
const AUDIT_LOG_PATH = join(DATA_DIR, "audit-log.jsonl");

// Integration tool paths
const SEMGREP_SCAN_PATH = "/home/christauff/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts";
const INJECTION_LIBRARY_PATH = "/home/christauff/.claude/skills/PromptInjection/Tools/InjectionLibrary.ts";
const AGENT_TRACE_PATH = "/home/christauff/.claude/skills/AgentTrace/Tools/TraceCapture.ts";

// ============================================================
// TYPES
// ============================================================

interface PolicyPattern {
  pattern: string;
  message: string;
}

interface AllowlistEntry {
  pattern: string;
  reason: string;
}

interface Policies {
  version: string;
  thresholds: {
    pass: number;
    warn: number;
    fail: number;
  };
  dangerous_patterns: {
    critical: PolicyPattern[];
    high: PolicyPattern[];
    medium: PolicyPattern[];
  };
  allowlist: AllowlistEntry[];
  scan_extensions: string[];
  injection_scan_exclude_paths?: string[];
}

interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  pattern: string;
  message: string;
  file: string;
  line: number;
  source: "static" | "semgrep" | "injection";
}

interface ScanResult {
  verdict: "PASS" | "WARN" | "FAIL";
  score: number;
  findings: Finding[];
  scannedFiles: number;
  timestamp: string;
  path: string;
  semgrepAvailable: boolean;
  injectionDetectionAvailable: boolean;
}

// ============================================================
// HELPERS
// ============================================================

function loadPolicies(): Policies {
  if (!existsSync(POLICIES_PATH)) {
    console.error(`Error: Policies file not found at ${POLICIES_PATH}`);
    process.exit(2);
  }
  const content = readFileSync(POLICIES_PATH, "utf-8");
  return parseYaml(content) as Policies;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Recursively collect all files in a directory matching scan extensions.
 */
function collectFiles(dirPath: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    if (!existsSync(currentPath)) return;

    const stat = statSync(currentPath);
    if (stat.isFile()) {
      const ext = extname(currentPath).toLowerCase();
      if (extensions.includes(ext)) {
        files.push(currentPath);
      }
      return;
    }

    if (!stat.isDirectory()) return;

    // Skip node_modules, .git, Data directories
    const basename = currentPath.split("/").pop() || "";
    if (["node_modules", ".git", "Data"].includes(basename) && currentPath !== dirPath) {
      return;
    }

    try {
      const entries = readdirSync(currentPath);
      for (const entry of entries) {
        walk(join(currentPath, entry));
      }
    } catch {
      // Permission denied or other read error -- skip
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Check if a line matches any allowlist pattern.
 */
function isAllowlisted(line: string, allowlist: AllowlistEntry[]): boolean {
  for (const entry of allowlist) {
    try {
      const regex = new RegExp(entry.pattern);
      if (regex.test(line)) {
        return true;
      }
    } catch {
      // Invalid regex in allowlist -- skip
    }
  }
  return false;
}

/**
 * Run static analysis patterns against file content.
 */
function runStaticAnalysis(
  filePath: string,
  content: string,
  policies: Policies
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  const severityLevels: Array<{
    severity: "critical" | "high" | "medium";
    patterns: PolicyPattern[];
  }> = [
    { severity: "critical", patterns: policies.dangerous_patterns.critical || [] },
    { severity: "high", patterns: policies.dangerous_patterns.high || [] },
    { severity: "medium", patterns: policies.dangerous_patterns.medium || [] },
  ];

  for (const { severity, patterns } of severityLevels) {
    for (const policyPattern of patterns) {
      try {
        const regex = new RegExp(policyPattern.pattern, "i");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Skip comments
          if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
            continue;
          }

          if (regex.test(line)) {
            // Check allowlist
            if (isAllowlisted(line, policies.allowlist)) {
              continue;
            }

            findings.push({
              severity,
              pattern: policyPattern.pattern,
              message: policyPattern.message,
              file: filePath,
              line: i + 1,
              source: "static",
            });
          }
        }
      } catch {
        // Invalid regex pattern -- skip
      }
    }
  }

  return findings;
}

/**
 * Run SemgrepGuard scan if available.
 * Returns findings and availability status.
 */
async function runSemgrepScan(
  targetPath: string
): Promise<{ findings: Finding[]; available: boolean }> {
  if (!existsSync(SEMGREP_SCAN_PATH)) {
    return { findings: [], available: false };
  }

  try {
    const proc = Bun.spawn(
      ["bun", "run", SEMGREP_SCAN_PATH, "scan", targetPath],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60000, // 60 second timeout
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    // Parse semgrep output for findings
    const findings: Finding[] = [];

    if (exitCode === 1) {
      // HIGH findings detected -- parse output
      const lines = stdout.split("\n");
      for (const line of lines) {
        const highMatch = line.match(/^\s+-\s+\[(.+?)\]\s+(.+?):(\d+)\s+-\s+(.+)$/);
        if (highMatch) {
          findings.push({
            severity: "high",
            pattern: highMatch[1],
            message: highMatch[4],
            file: highMatch[2],
            line: parseInt(highMatch[3], 10),
            source: "semgrep",
          });
        }
      }
    }

    return { findings, available: true };
  } catch {
    return { findings: [], available: false };
  }
}

/**
 * Run InjectionLibrary detection on markdown content.
 * Returns findings and availability status.
 */
async function runInjectionDetection(
  filePath: string,
  content: string
): Promise<{ findings: Finding[]; available: boolean }> {
  if (!existsSync(INJECTION_LIBRARY_PATH)) {
    return { findings: [], available: false };
  }

  try {
    const proc = Bun.spawn(
      ["bun", INJECTION_LIBRARY_PATH, "detect"],
      {
        stdin: new Response(content).body!,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000, // 30 second timeout
      }
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const findings: Finding[] = [];

    // Parse InjectionLibrary output
    // Look for risk level and technique detections
    const riskMatch = stdout.match(/Risk Level:\s*(\w+)/i);
    const riskLevel = riskMatch?.[1]?.toLowerCase() || "none";

    if (riskLevel !== "none") {
      // Extract detected technique names
      const techniqueMatches = stdout.matchAll(
        /\[(\w+)\]\s+(.+?)\s+\(([^)]+)\)/g
      );

      for (const match of techniqueMatches) {
        const category = match[1];
        const name = match[2];
        const id = match[3];

        // Map injection risk to finding severity
        let severity: Finding["severity"] = "medium";
        if (riskLevel === "critical") severity = "critical";
        else if (riskLevel === "high") severity = "high";

        findings.push({
          severity,
          pattern: id,
          message: `Prompt injection pattern detected: ${name} (${category})`,
          file: filePath,
          line: 1,
          source: "injection",
        });
      }
    }

    return { findings, available: true };
  } catch {
    return { findings: [], available: false };
  }
}

/**
 * Record provenance via AgentTrace if available.
 */
async function recordProvenance(scannedPath: string): Promise<void> {
  if (!existsSync(AGENT_TRACE_PATH)) {
    return;
  }

  try {
    const proc = Bun.spawn(
      [
        "bun",
        "run",
        AGENT_TRACE_PATH,
        "capture",
        scannedPath,
        "--start-line", "1",
        "--end-line", "1",
        "--action", "write",
        "--session-id", "supply-chain-scan",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      }
    );
    await proc.exited;
  } catch {
    // AgentTrace unavailable -- non-fatal
  }
}

/**
 * Calculate score from findings.
 * Start at 100, subtract per finding severity.
 */
function calculateScore(findings: Finding[]): number {
  const penalties: Record<string, number> = {
    critical: 30,
    high: 20,
    medium: 10,
    low: 5,
  };

  let score = 100;
  for (const finding of findings) {
    score -= penalties[finding.severity] || 5;
  }

  return Math.max(0, score);
}

/**
 * Determine verdict based on score and thresholds.
 */
function determineVerdict(
  score: number,
  thresholds: Policies["thresholds"],
  strict: boolean
): "PASS" | "WARN" | "FAIL" {
  if (strict && score < 100) {
    return score >= thresholds.warn ? "WARN" : "FAIL";
  }
  if (score >= thresholds.pass) return "PASS";
  if (score >= thresholds.warn) return "WARN";
  return "FAIL";
}

// ============================================================
// SCAN SUBCOMMAND
// ============================================================

async function runScan(
  targetPath: string,
  options: { strict: boolean; report: boolean; json: boolean }
): Promise<number> {
  const resolvedPath = resolve(targetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Path does not exist: ${resolvedPath}`);
    return 2;
  }

  const policies = loadPolicies();
  const allFindings: Finding[] = [];

  // Step 1: Collect files
  const stat = statSync(resolvedPath);
  const files = stat.isDirectory()
    ? collectFiles(resolvedPath, policies.scan_extensions)
    : [resolvedPath];

  if (!options.json) {
    console.log(`SkillSupplyChain Scanner v1.0`);
    console.log(`Scanning: ${resolvedPath}`);
    console.log(`Files to scan: ${files.length}`);
    console.log("");
  }

  // Step 2: Static analysis on all files
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      const findings = runStaticAnalysis(file, content, policies);
      allFindings.push(...findings);
    } catch {
      // File read error -- skip
    }
  }

  if (!options.json) {
    console.log(`[1/4] Static analysis: ${allFindings.length} finding(s)`);
  }

  // Step 3: SemgrepGuard scan
  const semgrepResult = await runSemgrepScan(resolvedPath);
  allFindings.push(...semgrepResult.findings);

  if (!options.json) {
    if (semgrepResult.available) {
      console.log(
        `[2/4] SemgrepGuard: ${semgrepResult.findings.length} finding(s)`
      );
    } else {
      console.log(`[2/4] SemgrepGuard: SKIPPED (not available)`);
    }
  }

  // Step 4: Prompt injection detection on .md files
  // Respect injection_scan_exclude_paths from policies
  const excludePaths = policies.injection_scan_exclude_paths || [];
  const mdFiles = files.filter((f) => {
    if (extname(f).toLowerCase() !== ".md") return false;
    // Skip files matching any exclusion path pattern
    for (const excludePath of excludePaths) {
      if (f.includes(excludePath)) return false;
    }
    return true;
  });
  let injectionAvailable = false;
  let injectionFindings = 0;
  let injectionSkipped = 0;

  // Count how many md files were excluded
  const allMdFiles = files.filter((f) => extname(f).toLowerCase() === ".md");
  injectionSkipped = allMdFiles.length - mdFiles.length;

  for (const mdFile of mdFiles) {
    try {
      const content = readFileSync(mdFile, "utf-8");
      const result = await runInjectionDetection(mdFile, content);
      injectionAvailable = result.available;
      allFindings.push(...result.findings);
      injectionFindings += result.findings.length;
    } catch {
      // Skip files that can't be read
    }
  }

  if (!options.json) {
    if (injectionAvailable) {
      const skipNote = injectionSkipped > 0 ? ` (${injectionSkipped} excluded by policy)` : "";
      console.log(
        `[3/4] Injection detection: ${injectionFindings} finding(s) in ${mdFiles.length} markdown file(s)${skipNote}`
      );
    } else {
      console.log(`[3/4] Injection detection: SKIPPED (not available)`);
    }
  }

  // Step 5: Calculate score and verdict
  const score = calculateScore(allFindings);
  const verdict = determineVerdict(score, policies.thresholds, options.strict);

  if (!options.json) {
    console.log(`[4/4] Verdict: ${verdict} (score: ${score}/100)`);
    console.log("");
  }

  // Build result
  const result: ScanResult = {
    verdict,
    score,
    findings: allFindings,
    scannedFiles: files.length,
    timestamp: new Date().toISOString(),
    path: resolvedPath,
    semgrepAvailable: semgrepResult.available,
    injectionDetectionAvailable: injectionAvailable,
  };

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.report || allFindings.length > 0) {
    // Print detailed findings
    const critical = allFindings.filter((f) => f.severity === "critical");
    const high = allFindings.filter((f) => f.severity === "high");
    const medium = allFindings.filter((f) => f.severity === "medium");
    const low = allFindings.filter((f) => f.severity === "low");

    if (critical.length > 0) {
      console.log(
        `### CRITICAL (${critical.length} finding${critical.length !== 1 ? "s" : ""}) [-30 each]`
      );
      for (const f of critical) {
        const relFile = relative(resolvedPath, f.file) || f.file;
        console.log(`  [${f.source}] ${relFile}:${f.line} - ${f.message}`);
      }
      console.log("");
    }

    if (high.length > 0) {
      console.log(
        `### HIGH (${high.length} finding${high.length !== 1 ? "s" : ""}) [-20 each]`
      );
      for (const f of high) {
        const relFile = relative(resolvedPath, f.file) || f.file;
        console.log(`  [${f.source}] ${relFile}:${f.line} - ${f.message}`);
      }
      console.log("");
    }

    if (medium.length > 0) {
      console.log(
        `### MEDIUM (${medium.length} finding${medium.length !== 1 ? "s" : ""}) [-10 each]`
      );
      for (const f of medium) {
        const relFile = relative(resolvedPath, f.file) || f.file;
        console.log(`  [${f.source}] ${relFile}:${f.line} - ${f.message}`);
      }
      console.log("");
    }

    if (low.length > 0) {
      console.log(
        `### LOW (${low.length} finding${low.length !== 1 ? "s" : ""}) [-5 each]`
      );
      for (const f of low) {
        const relFile = relative(resolvedPath, f.file) || f.file;
        console.log(`  [${f.source}] ${relFile}:${f.line} - ${f.message}`);
      }
      console.log("");
    }

    console.log("### Summary");
    console.log(
      `Total: ${allFindings.length} finding(s) (${critical.length} critical, ${high.length} high, ${medium.length} medium, ${low.length} low)`
    );
    console.log(`Score: ${score}/100`);
    console.log(`Verdict: ${verdict}`);
  } else {
    console.log(`No findings. Score: ${score}/100. Verdict: ${verdict}`);
  }

  // Log to audit trail
  try {
    ensureDataDir();
    const logEntry = {
      timestamp: result.timestamp,
      path: result.path,
      verdict: result.verdict,
      score: result.score,
      findingsCount: result.findings.length,
      scannedFiles: result.scannedFiles,
      criticalCount: allFindings.filter((f) => f.severity === "critical").length,
      highCount: allFindings.filter((f) => f.severity === "high").length,
      mediumCount: allFindings.filter((f) => f.severity === "medium").length,
      lowCount: allFindings.filter((f) => f.severity === "low").length,
      semgrepAvailable: result.semgrepAvailable,
      injectionDetectionAvailable: result.injectionDetectionAvailable,
    };
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(logEntry) + "\n");
  } catch (e) {
    // Audit log write failure is non-fatal
    if (!options.json) {
      console.error(`Warning: Could not write audit log: ${e}`);
    }
  }

  // Record provenance via AgentTrace
  await recordProvenance(resolvedPath);

  // Exit code based on verdict
  if (verdict === "PASS") return 0;
  if (verdict === "WARN") return 1;
  return 2;
}

// ============================================================
// REPORT SUBCOMMAND
// ============================================================

function runReport(): number {
  if (!existsSync(AUDIT_LOG_PATH)) {
    console.log("No audit history found. Run a scan first.");
    console.log(`Expected audit log: ${AUDIT_LOG_PATH}`);
    return 0;
  }

  const content = readFileSync(AUDIT_LOG_PATH, "utf-8").trim();
  if (!content) {
    console.log("Audit log is empty. Run a scan first.");
    return 0;
  }

  const lines = content.split("\n").filter((l) => l.trim());
  const entries: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (entries.length === 0) {
    console.log("No valid audit entries found.");
    return 0;
  }

  // Aggregate
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let totalFindings = 0;
  let totalCritical = 0;
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;

  for (const entry of entries) {
    const verdict = entry.verdict as string;
    if (verdict === "PASS") passCount++;
    else if (verdict === "WARN") warnCount++;
    else if (verdict === "FAIL") failCount++;

    totalFindings += (entry.findingsCount as number) || 0;
    totalCritical += (entry.criticalCount as number) || 0;
    totalHigh += (entry.highCount as number) || 0;
    totalMedium += (entry.mediumCount as number) || 0;
    totalLow += (entry.lowCount as number) || 0;
  }

  const earliest = entries[0].timestamp as string;
  const latest = entries[entries.length - 1].timestamp as string;

  console.log("## SkillSupplyChain Audit Report\n");
  console.log("### Summary");
  console.log(`- Total scans: ${entries.length}`);
  console.log(
    `- Period: ${(earliest || "").slice(0, 10)} to ${(latest || "").slice(0, 10)}`
  );
  console.log(`- PASS: ${passCount}`);
  console.log(`- WARN: ${warnCount}`);
  console.log(`- FAIL: ${failCount}`);
  console.log("");

  console.log("### Findings Breakdown");
  console.log(`- Total findings across all scans: ${totalFindings}`);
  console.log(`- Critical: ${totalCritical}`);
  console.log(`- High: ${totalHigh}`);
  console.log(`- Medium: ${totalMedium}`);
  console.log(`- Low: ${totalLow}`);
  console.log("");

  // Show FAIL scans
  const failScans = entries.filter((e) => e.verdict === "FAIL");
  if (failScans.length > 0) {
    console.log("### FAILED Scans");
    for (const scan of failScans) {
      console.log(
        `- ${(scan.timestamp as string || "").slice(0, 19)} | ${scan.path} | Score: ${scan.score} | Findings: ${scan.findingsCount}`
      );
    }
    console.log("");
  }

  // Show recent scans
  console.log("### Recent Scans (last 10)");
  const recent = entries.slice(-10);
  for (const scan of recent) {
    const ts = (scan.timestamp as string || "").slice(0, 19);
    const path = scan.path as string || "unknown";
    const shortPath = path.length > 40 ? "..." + path.slice(-37) : path;
    console.log(
      `  ${ts}  ${scan.verdict}  ${String(scan.score).padStart(3)}  ${shortPath}`
    );
  }

  return 0;
}

// ============================================================
// POLICY SUBCOMMAND
// ============================================================

function runPolicy(): number {
  const policies = loadPolicies();

  console.log("## SkillSupplyChain Security Policies\n");
  console.log(`Version: ${policies.version}\n`);

  console.log("### Verdict Thresholds");
  console.log(`- PASS: score >= ${policies.thresholds.pass}`);
  console.log(`- WARN: score >= ${policies.thresholds.warn}`);
  console.log(`- FAIL: score < ${policies.thresholds.warn}`);
  console.log("");

  console.log("### Dangerous Patterns");
  for (const severity of ["critical", "high", "medium"] as const) {
    const patterns = policies.dangerous_patterns[severity] || [];
    console.log(
      `\n#### ${severity.toUpperCase()} (${patterns.length} pattern${patterns.length !== 1 ? "s" : ""}) [-${severity === "critical" ? 30 : severity === "high" ? 20 : 10} per match]`
    );
    for (const p of patterns) {
      console.log(`  - /${p.pattern}/ : ${p.message}`);
    }
  }

  console.log("\n### Allowlist");
  for (const entry of policies.allowlist) {
    console.log(`  - /${entry.pattern}/ : ${entry.reason}`);
  }

  console.log("\n### Scan Extensions");
  console.log(`  ${policies.scan_extensions.join(", ")}`);

  return 0;
}

// ============================================================
// USAGE
// ============================================================

function printUsage(): void {
  console.log(`SkillScanner - PAI Skill Package Security Scanner

Usage:
  bun run SkillScanner.ts scan <path> [options]   Scan skill package for security issues
  bun run SkillScanner.ts report                    Show audit history report
  bun run SkillScanner.ts policy                    Show current security policies
  bun run SkillScanner.ts --help                    Show this help

Scan Options:
  --strict       Treat any WARN as FAIL
  --report       Show detailed findings
  --json         Output as JSON

Scan Pipeline:
  1. Static analysis (regex patterns from policies.yaml)
  2. SemgrepGuard SAST scan (if available)
  3. Prompt injection detection on .md files (if available)
  4. Score calculation and verdict

Verdicts:
  PASS  Score >= 80  (exit code 0)
  WARN  Score >= 40  (exit code 1)
  FAIL  Score <  40  (exit code 2)

Scoring:
  Start at 100, subtract per finding:
  - Critical: -30
  - High:     -20
  - Medium:   -10
  - Low:      -5

Examples:
  bun run SkillScanner.ts scan /path/to/skill/
  bun run SkillScanner.ts scan /path/to/skill/ --strict --json
  bun run SkillScanner.ts report`);
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
        console.error("Usage: bun run SkillScanner.ts scan <path>");
        process.exit(2);
      }

      const strict = args.includes("--strict");
      const report = args.includes("--report");
      const json = args.includes("--json");

      const exitCode = await runScan(targetPath, { strict, report, json });
      process.exit(exitCode);
      break;
    }

    case "report": {
      const exitCode = runReport();
      process.exit(exitCode);
      break;
    }

    case "policy": {
      const exitCode = runPolicy();
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

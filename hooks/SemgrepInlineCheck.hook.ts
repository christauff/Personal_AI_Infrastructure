#!/usr/bin/env bun
/**
 * SemgrepInlineCheck.hook.ts - Scan Modified Files for Security Issues (PostToolUse)
 *
 * TRIGGER: PostToolUse (matcher: Write, Edit)
 * GATE: Soft - warns but does not block
 *
 * Runs semgrep on the file that was just written/edited.
 * If HIGH+ findings found, adds additionalContext warning.
 * Findings are appended to SemgrepGuard Data/findings.jsonl.
 *
 * NOTE: Semgrep is a snap and cannot read dotfile directories (~/.claude).
 * Files are staged to ~/semgrep-staging/ before scanning.
 */

import { existsSync, appendFileSync, mkdirSync, cpSync, rmSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// ============================================================
// TYPES
// ============================================================

interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: string;
}

// ============================================================
// PATHS
// ============================================================

const HOME = homedir();
const SEMGREP_BIN = "/snap/bin/semgrep";
const SKILL_DIR = join(HOME, ".claude", "skills", "SemgrepGuard");
const DATA_DIR = join(SKILL_DIR, "Data");
const FINDINGS_PATH = join(DATA_DIR, "findings.jsonl");
const RULES_PATH = join(SKILL_DIR, "Config", "rules.yaml");
const STAGING_DIR = join(HOME, "semgrep-staging");

// File extensions worth scanning
const SCANNABLE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|py|yaml|yml|json|sh|bash|rb|go|rs|java|c|cpp|h|hpp)$/;

// ============================================================
// MAIN HOOK LOGIC
// ============================================================

async function main(): Promise<void> {
  let input: HookInput;

  try {
    const text = await Promise.race([
      Bun.stdin.text(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 200)
      ),
    ]);

    if (!text.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    input = JSON.parse(text);
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Only process Write and Edit tools
  if (input.tool_name !== "Write" && input.tool_name !== "Edit") {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Extract file path from tool input
  const filePath = (input.tool_input?.file_path as string) || "";
  if (!filePath || !SCANNABLE_EXTENSIONS.test(filePath)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Verify file exists
  if (!existsSync(filePath)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Verify semgrep is available
  if (!existsSync(SEMGREP_BIN)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    // Stage file and rules to snap-accessible directory
    try {
      rmSync(STAGING_DIR, { recursive: true, force: true });
    } catch {}
    mkdirSync(join(STAGING_DIR, "target"), { recursive: true });

    const stagedFile = join(STAGING_DIR, "target", basename(filePath));
    cpSync(filePath, stagedFile);

    // Build semgrep args
    const args: string[] = ["scan", "--json", "--severity", "WARNING"];

    // Stage custom rules if available
    if (existsSync(RULES_PATH)) {
      mkdirSync(join(STAGING_DIR, "config"), { recursive: true });
      const stagedRules = join(STAGING_DIR, "config", "rules.yaml");
      cpSync(RULES_PATH, stagedRules);
      args.push("--config", stagedRules);
    }

    args.push(stagedFile);

    const proc = Bun.spawn([SEMGREP_BIN, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SEMGREP_SEND_METRICS: "off" },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    // Clean up staging
    try {
      rmSync(STAGING_DIR, { recursive: true, force: true });
    } catch {}

    let results: { results?: Array<any> } = {};
    try {
      results = JSON.parse(stdout);
    } catch {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const findings = results.results || [];
    const highFindings = findings.filter(
      (f: any) =>
        f.extra?.severity === "ERROR" || f.extra?.severity === "WARNING"
    );

    if (highFindings.length > 0) {
      // Format summary -- use original file path, not staged
      const summary = highFindings
        .map(
          (f: any) =>
            `  - ${f.check_id}: ${f.extra?.message || "no message"} (line ${f.start?.line || "?"})`
        )
        .join("\n");

      // Append findings to JSONL log
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        for (const f of highFindings) {
          const entry = {
            ts: new Date().toISOString(),
            file: filePath,
            rule: f.check_id,
            severity: f.extra?.severity === "ERROR" ? "HIGH" : "MEDIUM",
            message: f.extra?.message || "",
            line: f.start?.line || 0,
            fix: f.extra?.fix || null,
          };
          appendFileSync(FINDINGS_PATH, JSON.stringify(entry) + "\n");
        }
      } catch {
        // Logging failure should not block
      }

      console.log(
        JSON.stringify({
          continue: true,
          additionalContext: `SemgrepGuard: ${highFindings.length} finding(s) in ${filePath}:\n${summary}`,
        })
      );
    } else {
      console.log(JSON.stringify({ continue: true }));
    }
  } catch {
    // Clean up on error
    try {
      rmSync(STAGING_DIR, { recursive: true, force: true });
    } catch {}
    // Semgrep not available or failed - don't block
    console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});

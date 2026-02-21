#!/usr/bin/env bun
/**
 * SupplyChainGate.hook.ts - Supply Chain Security Gate (PreToolUse)
 *
 * PURPOSE:
 * Intercepts dependency and skill install commands to:
 * 1. Flag new dependencies not in known-dependencies.yaml
 * 2. Block known-malicious packages
 * 3. Inject security scanning reminders for skill installs
 *
 * TRIGGER: PreToolUse (matcher: Bash)
 * GATE: Soft - warns and injects context, does not hard-block (except blocklist)
 *
 * Updated: 2026-02-13 - Sprint 4B: Expanded dependency verification
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PAI_DIR = join(homedir(), ".claude");
const KNOWN_DEPS_PATH = join(PAI_DIR, "skills", "PromptInjection", "Config", "known-dependencies.yaml");

const input = JSON.parse(await Bun.stdin.text());
const { tool_input } = input;
const command = tool_input?.command || "";

// ============================================================
// PATTERN MATCHING
// ============================================================

// Skill install patterns
const skillInstallPatterns = [
  /npx\s+skills?\s+add/i,
  /npx\s+skills?\s+install/i,
  /bun\s+.*skills?\s+add/i,
  /npm\s+.*skills?\s+install.*skill/i,
  /pai\s+install/i,
  /pai\s+add/i,
];

// Dependency install patterns (bun add, npm install)
const depInstallPatterns = [
  /^bun\s+add\s+/i,
  /^bun\s+install\s+/i,
  /^npm\s+install\s+/i,
  /^npm\s+i\s+/i,
  /^yarn\s+add\s+/i,
  /^pnpm\s+add\s+/i,
];

const isSkillInstall = skillInstallPatterns.some((p) => p.test(command));
const isDepInstall = depInstallPatterns.some((p) => p.test(command));

// If not an install command, pass through
if (!isSkillInstall && !isDepInstall) {
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// ============================================================
// KNOWN DEPENDENCIES CHECK
// ============================================================

/**
 * Load blocklist and known dependencies from YAML config.
 * Simple parsing — no YAML library dependency.
 */
function loadKnownDeps(): {
  known: Set<string>;
  blocklist: Set<string>;
} {
  const known = new Set<string>();
  const blocklist = new Set<string>();

  if (!existsSync(KNOWN_DEPS_PATH)) {
    return { known, blocklist };
  }

  try {
    const content = readFileSync(KNOWN_DEPS_PATH, "utf-8");

    // Extract dependencies section
    const depsMatch = content.match(/^dependencies:\n((?:  .+\n)*)/m);
    if (depsMatch) {
      const lines = depsMatch[1].match(/"([^"]+)":/g);
      if (lines) {
        for (const line of lines) {
          known.add(line.replace(/"/g, "").replace(/:$/, ""));
        }
      }
    }

    // Extract blocklist
    const blockMatch = content.match(/^blocklist:\n((?:  - .+\n)*)/m);
    if (blockMatch) {
      const items = blockMatch[1].match(/"([^"]+)"/g);
      if (items) {
        for (const item of items) {
          blocklist.add(item.replace(/"/g, ""));
        }
      }
    }
  } catch {
    // Config parsing failure — continue without enforcement
  }

  return { known, blocklist };
}

/**
 * Extract package name(s) from an install command.
 */
function extractPackages(cmd: string): string[] {
  // Match: bun add @scope/pkg or bun add pkg1 pkg2
  const match = cmd.match(/(?:add|install|i)\s+(.+?)(?:\s*$)/i);
  if (!match) return [];

  return match[1]
    .split(/\s+/)
    .filter((p) => !p.startsWith("-")) // Remove flags
    .filter((p) => p.length > 0);
}

// ============================================================
// EVALUATION
// ============================================================

const warnings: string[] = [];
let blocked = false;

if (isDepInstall) {
  const { known, blocklist } = loadKnownDeps();
  const packages = extractPackages(command);

  for (const pkg of packages) {
    // Check blocklist first
    if (blocklist.has(pkg)) {
      warnings.push(`BLOCKED: ${pkg} is on the supply chain blocklist (known malicious package)`);
      blocked = true;
      continue;
    }

    // Check if known
    if (known.size > 0 && !known.has(pkg)) {
      warnings.push(`NEW DEPENDENCY: ${pkg} is not in known-dependencies.yaml. Verify this package before use.`);
    }
  }
}

if (isSkillInstall) {
  const skillMatch = command.match(/(?:add|install)\s+(.+?)(?:\s|$)/);
  const skillRef = skillMatch?.[1] || "unknown";
  warnings.push(
    `Skill install detected (${skillRef}). After installation, run:\n  bun run ~/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts scan <installed-skill-path>`
  );
}

// ============================================================
// OUTPUT
// ============================================================

if (blocked) {
  // Hard block for blocklisted packages
  console.log(
    JSON.stringify({
      continue: false,
      message: `[SUPPLY CHAIN GATE] ${warnings.join("\n")}`,
    })
  );
} else if (warnings.length > 0) {
  // Soft warning for unknown or skill installs
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `[SUPPLY CHAIN GATE]\n${warnings.join("\n")}`,
    })
  );
} else {
  console.log(JSON.stringify({ continue: true }));
}

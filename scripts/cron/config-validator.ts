#!/usr/bin/env bun
// Job 4: Config Validator (Hook Health + Settings Integrity)
// Schedule: 0 7 * * * (daily 7 AM)
// Validates hooks exist/executable and settings.json integrity

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const PAI_DIR = process.env.PAI_DIR || `${process.env.HOME}/.claude`;
const REPORTS_DIR = join(PAI_DIR, "GOVERNANCE", "REPORTS");
const HEARTBEAT = join(REPORTS_DIR, ".heartbeat-config-validator");
const REPORT_PATH = join(REPORTS_DIR, `config-health-${new Date().toISOString().slice(0, 10)}.md`);
const LOG_PATH = join(REPORTS_DIR, "maintenance.log");

interface Finding {
  level: "ERROR" | "WARN" | "INFO";
  category: string;
  message: string;
}

const findings: Finding[] = [];
let errors = 0;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [config-validator] ${msg}\n`;
  try {
    const { appendFileSync } = require("fs");
    appendFileSync(LOG_PATH, line);
  } catch {
    process.stderr.write(line);
  }
}

function addFinding(level: Finding["level"], category: string, message: string) {
  findings.push({ level, category, message });
  if (level === "ERROR") errors++;
}

// --- Settings Integrity ---
function validateSettings() {
  const settingsPath = join(PAI_DIR, "settings.json");

  if (!existsSync(settingsPath)) {
    addFinding("ERROR", "settings", "settings.json not found");
    return;
  }

  let settings: any;
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    settings = JSON.parse(raw);
    addFinding("INFO", "settings", "Valid JSON");
  } catch (e: any) {
    addFinding("ERROR", "settings", `Invalid JSON: ${e.message}`);
    return;
  }

  // Required keys
  const requiredKeys = ["env", "permissions", "hooks"];
  for (const key of requiredKeys) {
    if (!(key in settings)) {
      addFinding("ERROR", "settings", `Missing required key: ${key}`);
    }
  }

  // PAI_DIR resolves
  if (settings.env?.PAI_DIR) {
    if (!existsSync(settings.env.PAI_DIR)) {
      addFinding("ERROR", "settings", `PAI_DIR path does not exist: ${settings.env.PAI_DIR}`);
    }
  }

  // ntfy consistency
  if (settings.notifications?.ntfy?.enabled) {
    if (!settings.notifications.ntfy.topic) {
      addFinding("WARN", "settings", "ntfy enabled but no topic configured");
    }
    if (!settings.notifications.ntfy.server) {
      addFinding("WARN", "settings", "ntfy enabled but no server configured");
    }
  }

  // Check contextFiles exist
  if (settings.contextFiles) {
    for (const cf of settings.contextFiles) {
      const expanded = cf.replace(/\$\{PAI_DIR\}/g, PAI_DIR).replace(/\$HOME/g, process.env.HOME || "");
      if (!existsSync(expanded)) {
        addFinding("WARN", "settings", `contextFile not found: ${cf}`);
      }
    }
  }
}

// --- Hook Health ---
function validateHooks() {
  const settingsPath = join(PAI_DIR, "settings.json");
  if (!existsSync(settingsPath)) return;

  let settings: any;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return;
  }

  const hooks = settings.hooks || {};
  const registeredPaths = new Set<string>();

  for (const [event, hookList] of Object.entries(hooks)) {
    if (!Array.isArray(hookList)) continue;

    for (const hook of hookList as any[]) {
      const cmd = hook.command;
      if (!cmd) continue;

      // Extract script path from command (handles "bun run /path/to/script.ts" patterns)
      const parts = cmd.split(/\s+/);
      let scriptPath = "";

      for (const part of parts) {
        const expanded = part
          .replace(/\$\{PAI_DIR\}/g, PAI_DIR)
          .replace(/\$PAI_DIR/g, PAI_DIR)
          .replace(/\$HOME/g, process.env.HOME || "");
        if (expanded.startsWith("/") && (expanded.endsWith(".ts") || expanded.endsWith(".sh"))) {
          scriptPath = expanded;
          break;
        }
      }

      if (!scriptPath) continue;
      registeredPaths.add(scriptPath);

      // Check exists
      if (!existsSync(scriptPath)) {
        addFinding("ERROR", "hooks", `Hook script missing: ${scriptPath} (event: ${event})`);
        continue;
      }

      // Check non-empty
      const stat = statSync(scriptPath);
      if (stat.size === 0) {
        addFinding("ERROR", "hooks", `Hook script empty: ${scriptPath}`);
        continue;
      }

      // Check shebang
      try {
        const firstLine = readFileSync(scriptPath, "utf-8").split("\n")[0];
        if (!firstLine.startsWith("#!")) {
          addFinding("WARN", "hooks", `No shebang in: ${basename(scriptPath)}`);
        }
      } catch {}

      addFinding("INFO", "hooks", `OK: ${basename(scriptPath)} (${event})`);
    }
  }

  // Scan hooks/ directory for unregistered .ts files
  const hooksDir = join(PAI_DIR, "hooks");
  if (existsSync(hooksDir)) {
    try {
      const files = readdirSync(hooksDir).filter(f => f.endsWith(".hook.ts") || f.endsWith(".hook.sh"));
      for (const file of files) {
        const fullPath = join(hooksDir, file);
        if (!registeredPaths.has(fullPath)) {
          addFinding("WARN", "hooks", `Unregistered hook file: ${file}`);
        }
      }
    } catch {}
  }

  // Check for duplicate registrations
  const cmdCounts = new Map<string, number>();
  for (const [, hookList] of Object.entries(hooks)) {
    if (!Array.isArray(hookList)) continue;
    for (const hook of hookList as any[]) {
      const cmd = hook.command || "";
      cmdCounts.set(cmd, (cmdCounts.get(cmd) || 0) + 1);
    }
  }
  for (const [cmd, count] of cmdCounts) {
    if (count > 1) {
      addFinding("WARN", "hooks", `Duplicate registration (${count}x): ${cmd.slice(0, 80)}`);
    }
  }
}

// --- Main ---
function main() {
  log("=== Config validation starting ===");

  validateSettings();
  validateHooks();

  // Write report
  const errorFindings = findings.filter(f => f.level === "ERROR");
  const warnFindings = findings.filter(f => f.level === "WARN");
  const infoFindings = findings.filter(f => f.level === "INFO");

  const report = `# Config Health Report — ${new Date().toISOString().slice(0, 10)}

## Summary
- **Errors:** ${errorFindings.length}
- **Warnings:** ${warnFindings.length}
- **Info:** ${infoFindings.length}
- **Status:** ${errorFindings.length === 0 ? "HEALTHY" : "ISSUES FOUND"}

## Errors
${errorFindings.length === 0 ? "None" : errorFindings.map(f => `- [${f.category}] ${f.message}`).join("\n")}

## Warnings
${warnFindings.length === 0 ? "None" : warnFindings.map(f => `- [${f.category}] ${f.message}`).join("\n")}

## Details
${infoFindings.map(f => `- [${f.category}] ${f.message}`).join("\n")}

---
*Generated by config-validator.ts*
`;

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, report);

  log(`Config validation complete: ${errorFindings.length} errors, ${warnFindings.length} warnings`);

  // Alert on errors
  if (errorFindings.length > 0) {
    try {
      execSync(
        `source "${PAI_DIR}/scripts/lib/notify.sh" && pai_notify "PAI: Config Validation Failed" "${errorFindings.length} errors found" 4`,
        { shell: "/bin/bash", stdio: "ignore" }
      );
    } catch {}
  }

  // Write heartbeat on success (even with warnings — only errors are fatal)
  if (errorFindings.length === 0) {
    writeFileSync(HEARTBEAT, String(Math.floor(Date.now() / 1000)));
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();

#!/usr/bin/env bun
/**
 * A2AValidator.hook.ts - Validate Inbound A2A Tasks (PostToolUse)
 *
 * TRIGGER: PostToolUse (matcher: Bash - when A2AServer processes inbound)
 * GATE: Hard - blocks tasks with detected injection attempts
 *
 * Validates content from A2A inbound tasks against known injection patterns.
 * Extends zero-trust to inter-platform agent communication.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const input = JSON.parse(await Bun.stdin.text());
const { tool_name, tool_input, tool_output } = input;

// Only check Bash commands that involve A2A
const command = tool_input?.command || "";
if (!command.includes("A2AServer") && !command.includes("a2a")) {
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Check output for suspicious patterns
const output = tool_output || "";

// Basic injection detection patterns
const injectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /new\s+instructions?\s*:/i,
  /override\s+(all\s+)?rules/i,
  /disregard\s+(all\s+)?prior/i,
  /forget\s+(all\s+)?previous/i,
  /<\/?system>/i,
  /\[SYSTEM\]/i,
  /BEGIN\s+INJECTION/i,
];

const matches: string[] = [];
for (const pattern of injectionPatterns) {
  const match = output.match(pattern);
  if (match) {
    matches.push(match[0]);
  }
}

if (matches.length > 0) {
  // Log security event
  const dataDir = join(import.meta.dir, "..", "skills", "A2ABridge", "Data");
  try {
    mkdirSync(dataDir, { recursive: true });
    appendFileSync(join(dataDir, "a2a-events.jsonl"), JSON.stringify({
      ts: new Date().toISOString(),
      type: "security",
      event: "injection_blocked",
      matches,
      command: command.slice(0, 200)
    }) + "\n");
  } catch {}

  // Also log to AgentWatch
  const secEventsPath = join(import.meta.dir, "..", "skills", "AgentWatch", "Data", "security-events.jsonl");
  try {
    if (existsSync(join(import.meta.dir, "..", "skills", "AgentWatch", "Data"))) {
      appendFileSync(secEventsPath, JSON.stringify({
        ts: new Date().toISOString(),
        source: "A2AValidator",
        type: "injection_attempt",
        severity: "HIGH",
        details: `A2A inbound task blocked: ${matches.join(", ")}`
      }) + "\n");
    }
  } catch {}

  console.log(JSON.stringify({
    continue: false,
    reason: `A2AValidator: Injection attempt detected in A2A task content: ${matches.join(", ")}. Task blocked.`
  }));
} else {
  console.log(JSON.stringify({ continue: true }));
}

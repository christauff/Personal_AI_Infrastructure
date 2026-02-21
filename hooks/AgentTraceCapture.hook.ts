#!/usr/bin/env bun
/**
 * AgentTraceCapture.hook.ts - Track AI Code Generation (PostToolUse)
 *
 * TRIGGER: PostToolUse (matcher: Write, Edit)
 * GATE: None - pure tracking, never blocks
 *
 * Automatically logs trace records when AI writes or edits code.
 * Non-blocking: always outputs {"continue": true} and exits 0.
 */

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  let input: any = {};

  try {
    const stdinData = await Bun.stdin.text();
    if (stdinData.trim()) {
      input = JSON.parse(stdinData.trim());
    }
  } catch {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const { tool_name, tool_input } = input;

  // Extract file path
  const filePath = tool_input?.file_path;
  if (!filePath) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // Skip non-code files
  if (!filePath.match(/\.(ts|js|py|yaml|yml|json|md|sh|css|html|tsx|jsx|go|rs|rb|java|c|cpp|h|hpp|sql|toml|ini|cfg|conf|xml|svg)$/)) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // Determine action and line metrics
  const action = tool_name === "Write" ? "write" : "edit";
  let startLine = 1;
  let endLine = 1;
  let linesChanged = 0;

  if (action === "write") {
    // For Write, count lines in content
    const content = tool_input?.content || "";
    const lines = content.split("\n").length;
    endLine = lines;
    linesChanged = lines;
  } else if (action === "edit") {
    // For Edit, estimate from new_string vs old_string
    const newStr = tool_input?.new_string || "";
    const oldStr = tool_input?.old_string || "";
    const newLines = newStr.split("\n").length;
    const oldLines = oldStr.split("\n").length;
    linesChanged = Math.abs(newLines - oldLines) || newLines;
    // Line positions unknown without reading file; use 0 to indicate unknown
    startLine = 0;
    endLine = 0;
  }

  // Detect execution mode (fast vs standard) from OTel speed attribute
  const executionMode = process.env.CLAUDE_SPEED || input.speed || "standard";

  // Build trace record
  const trace = {
    ts: new Date().toISOString(),
    file: filePath,
    startLine,
    endLine,
    model: "claude-opus-4-6",
    sessionId: input.session_id || "unknown",
    action,
    linesChanged,
    executionMode,
  };

  // Append to traces.jsonl
  try {
    const dataDir = join(import.meta.dir, "..", "skills", "AgentTrace", "Data");
    mkdirSync(dataDir, { recursive: true });
    appendFileSync(join(dataDir, "traces.jsonl"), JSON.stringify(trace) + "\n");
  } catch {
    // Never fail - this is non-blocking tracking
  }

  console.log(JSON.stringify({ continue: true }));
}

main();

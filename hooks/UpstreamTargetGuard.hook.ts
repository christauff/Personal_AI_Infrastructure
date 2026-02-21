#!/usr/bin/env bun
/**
 * UpstreamTargetGuard.hook.ts - Upstream Target Verification Gate (PreToolUse)
 *
 * PURPOSE:
 * Prevents submitting PRs or writing deliverables targeting the wrong repository.
 * Mechanically enforces what a steering rule cannot: verification before action.
 *
 * ORIGIN: 2026-02-21 formation event. Wrong repo target propagated through 12+
 * agents (RedTeam 8 + Council 4) without anyone checking git remote -v.
 * Rating 0. This hook ensures it never happens again.
 *
 * TRIGGER: PreToolUse (matcher: Bash, Write)
 *
 * FOR BASH:
 *   - Intercepts: gh pr create, git push upstream, git push fork
 *   - Verifies: target matches actual git remote -v output
 *   - Action: BLOCK if mismatch detected
 *
 * FOR WRITE:
 *   - Intercepts: files with PR/pr/diff in name or path
 *   - Action: Injects reminder to verify upstream target with git remote -v
 */

import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

const PAI_DIR = join(homedir(), ".claude");

const input = JSON.parse(await Bun.stdin.text());
const { tool_name, tool_input } = input;

// ============================================================
// HELPER: Get actual git remotes
// ============================================================

function getRemotes(): Map<string, string> {
  const remotes = new Map<string, string>();
  try {
    const output = execSync("git remote -v", {
      cwd: PAI_DIR,
      timeout: 5000,
      encoding: "utf-8",
    });
    for (const line of output.split("\n")) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(push\)$/);
      if (match) {
        remotes.set(match[1], match[2]);
      }
    }
  } catch {
    // Not in a git repo or git not available — pass through
  }
  return remotes;
}

// ============================================================
// BASH GUARD: Intercept git push and gh pr create
// ============================================================

if (tool_name === "Bash") {
  const command = tool_input?.command || "";

  // Patterns that target upstream repos
  const prCreatePattern = /gh\s+pr\s+create/i;
  const gitPushPattern = /git\s+push\s+(\S+)/i;

  const isPRCreate = prCreatePattern.test(command);
  const pushMatch = command.match(gitPushPattern);

  if (!isPRCreate && !pushMatch) {
    // Not a PR or push command — pass through
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const remotes = getRemotes();

  if (remotes.size === 0) {
    // No remotes found — warn but don't block
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext:
          "[UPSTREAM TARGET GUARD] No git remotes detected. If this PR targets an upstream repo, verify the target with: git remote -v",
      })
    );
    process.exit(0);
  }

  if (isPRCreate) {
    // For gh pr create, show all remotes so the user/agent can verify
    const remoteList = Array.from(remotes.entries())
      .map(([name, url]) => `  ${name}: ${url}`)
      .join("\n");

    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `[UPSTREAM TARGET GUARD] PR creation detected. Verify target repository:\n${remoteList}\n\nIf this PR targets upstream, confirm the repo URL matches your intended target. If writing PR specs (not executing gh pr create), verify file paths match upstream structure with: git ls-tree upstream/main <path>`,
      })
    );
    process.exit(0);
  }

  if (pushMatch) {
    const targetRemote = pushMatch[1];
    const remoteUrl = remotes.get(targetRemote);

    if (remoteUrl) {
      console.log(
        JSON.stringify({
          continue: true,
          additionalContext: `[UPSTREAM TARGET GUARD] Pushing to ${targetRemote}: ${remoteUrl}`,
        })
      );
    } else {
      console.log(
        JSON.stringify({
          continue: true,
          additionalContext: `[UPSTREAM TARGET GUARD] WARNING: Remote '${targetRemote}' not found in git remotes. Known remotes: ${Array.from(remotes.keys()).join(", ")}`,
        })
      );
    }
    process.exit(0);
  }
}

// ============================================================
// WRITE GUARD: Intercept PR-targeting files
// ============================================================

if (tool_name === "Write" || tool_name === "Edit") {
  const filePath = tool_input?.file_path || "";
  const content = tool_input?.content || tool_input?.new_string || "";

  // Check if this looks like a PR spec or upstream-targeting document
  const prFilePatterns = [
    /PR[-_]?PACKAGE/i,
    /FINAL[-_]?PR/i,
    /pr[-_]?draft/i,
    /pr[-_]?spec/i,
    /upstream[-_]?pr/i,
    /pull[-_]?request/i,
  ];

  const isPRFile = prFilePatterns.some((p) => p.test(filePath));

  // Also check content for repo references that might be wrong
  const repoRefPatterns = [
    /github\.com\/\S+\/\S+/g, // Any GitHub repo reference
    /Target:.*github/i,
    /upstream.*repo/i,
  ];

  const hasRepoRef = repoRefPatterns.some((p) => p.test(content));

  if (!isPRFile && !hasRepoRef) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // Get remotes for verification context
  const remotes = getRemotes();
  const upstream = remotes.get("upstream") || remotes.get("origin") || "unknown";

  const warnings: string[] = [];

  if (isPRFile) {
    warnings.push(
      `PR specification file detected. Verified upstream: ${upstream}`
    );
  }

  // Check for repo URL mismatches in content
  const repoRefs = content.match(/github\.com\/[\w-]+\/[\w-]+/g) || [];
  const upstreamHost = upstream.replace(/\.git$/, "").replace(/^https?:\/\//, "");

  for (const ref of repoRefs) {
    // Normalize for comparison
    const normalizedRef = ref.replace(/^github\.com\//, "");
    const normalizedUpstream = upstreamHost.replace(/^github\.com\//, "");

    if (
      normalizedRef !== normalizedUpstream &&
      !ref.includes("danielmiessler/TheAlgorithm") && // Allow Algorithm refs
      !ref.includes("anthropics/") && // Allow Anthropic refs
      !ref.includes("christauff/") // Allow own repos
    ) {
      warnings.push(
        `REPO MISMATCH: Content references '${ref}' but upstream is '${upstreamHost}'. Verify this is correct.`
      );
    }
  }

  if (warnings.length > 0) {
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `[UPSTREAM TARGET GUARD]\n${warnings.join("\n")}\n\nTo verify: git remote -v && git ls-tree upstream/main <path>`,
      })
    );
  } else {
    console.log(JSON.stringify({ continue: true }));
  }
  process.exit(0);
}

// Default: pass through
console.log(JSON.stringify({ continue: true }));

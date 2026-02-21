#!/usr/bin/env bun
/**
 * CodexApi.ts - Codex CLI Integration Tool for CodexResearcher
 *
 * Provides interface to OpenAI Codex CLI for multi-model research
 * with O3, GPT-5-Codex, and GPT-4 model access.
 *
 * Usage:
 *   bun run CodexApi.ts --query "your research question"
 *   bun run CodexApi.ts --query "deep analysis" --model o3
 *   bun run CodexApi.ts --query "code research" --model gpt-5-codex
 *
 * Requirements:
 *   codex CLI must be installed and configured
 */

import { spawn } from "child_process";
import { warnIfNeeded } from "./budgetCheck.ts";
import { logModelUsage, detectOverrideType } from "./usageLogger.ts";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MODEL = "gpt-5-codex";
const SANDBOX_MODE = "danger-full-access"; // Required for web access

// Model tier mappings (see Model-Selection-Guide.md for current pricing)
// Last Verified: 2026-02-01 against https://platform.openai.com/docs/models
// Note: Verify quarterly or when PAIUpgrade alerts on OpenAI changelog updates
const MODEL_TIERS = {
  cheap: "gpt-4o-mini",
  expensive: "o3",
};

const AVAILABLE_MODELS = [
  { name: "gpt-4o-mini", tier: "cheap", description: "High-volume, simple tasks, cost optimization" },
  { name: "gpt-4o", tier: "balanced", description: "General purpose, multimodal, balanced" },
  { name: "gpt-5-codex", tier: "code", description: "Agentic coding, long-running code tasks" },
  { name: "o3", tier: "expensive", description: "Complex reasoning, math, science, critical analysis" },
];

interface CodexResult {
  content: string;
  exitCode: number;
  model: string;
}

// ============================================================================
// Codex CLI Client
// ============================================================================

async function callCodexCli(
  query: string,
  model: string = DEFAULT_MODEL
): Promise<CodexResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "--sandbox",
      SANDBOX_MODE,
      "--model",
      model,
      query,
    ];

    console.error(`\nExecuting: codex ${args.join(" ")}\n`);

    const codex = spawn("codex", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    codex.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    codex.stderr.on("data", (data) => {
      stderr += data.toString();
      // Stream stderr to show progress
      process.stderr.write(data);
    });

    codex.on("error", (error) => {
      reject(new Error(`Failed to execute codex: ${error.message}`));
    });

    codex.on("close", (code) => {
      if (code !== 0 && !stdout) {
        reject(
          new Error(
            `Codex exited with code ${code}${stderr ? `\n${stderr}` : ""}`
          )
        );
      } else {
        resolve({
          content: stdout || stderr,
          exitCode: code || 0,
          model,
        });
      }
    });
  });
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Detect override type early for usage tracking
  const { overrideType } = detectOverrideType(args);

  // Handle --list-models early
  if (args.includes("--list-models")) {
    console.log(`
Available OpenAI Models:
`);
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : m.tier === "code" ? "💻" : "⚡";
      console.log(`  ${tierBadge} ${m.name.padEnd(20)} ${m.description}`);
    });
    console.log(`
Tier Shortcuts:
  --cheap      → ${MODEL_TIERS.cheap}
  --expensive  → ${MODEL_TIERS.expensive}

Pricing: See ~/.claude/docs/Model-Selection-Guide.md for current costs
`);
    process.exit(0);
  }

  // Parse arguments
  let query = "";
  let model = DEFAULT_MODEL;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--query" && i + 1 < args.length) {
      query = args[++i];
    } else if (arg === "--model" && i + 1 < args.length) {
      model = args[++i];
    } else if (arg === "--cheap") {
      model = MODEL_TIERS.cheap;
    } else if (arg === "--expensive") {
      model = MODEL_TIERS.expensive;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
CodexApi.ts - Codex CLI Integration Tool for CodexResearcher

Usage:
  bun run CodexApi.ts --query "your research question"
  bun run CodexApi.ts --query "simple query" --cheap
  bun run CodexApi.ts --query "complex reasoning" --expensive

Options:
  --query <text>     Research question or query (required)
  --model <name>     Specific model to use (default: gpt-5-codex)
  --cheap            Use fastest/cheapest model (gpt-4o-mini)
  --expensive        Use most capable model (o3)
  --list-models      Show all available models
  --help, -h         Show this help

Requirements:
  codex CLI must be installed and authenticated

Pricing:
  See ~/.claude/docs/Model-Selection-Guide.md for current model costs

Note: Uses --sandbox danger-full-access for web/network access
      `);
      process.exit(0);
    }
  }

  if (!query) {
    console.error("Error: --query is required\n");
    console.error(
      'Usage: bun run CodexApi.ts --query "your research question"'
    );
    process.exit(1);
  }

  // Validate model
  const validModels = AVAILABLE_MODELS.map((m) => m.name);
  if (!validModels.includes(model)) {
    console.error(`❌ Error: Invalid model '${model}'\n`);
    console.error("Available models:");
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : m.tier === "code" ? "💻" : "⚡";
      console.error(`  ${tierBadge} ${m.name.padEnd(20)} ${m.description}`);
    });
    console.error("\nTier shortcuts:");
    console.error(`  --cheap      → ${MODEL_TIERS.cheap}`);
    console.error(`  --expensive  → ${MODEL_TIERS.expensive}`);
    console.error("\nPricing: See ~/.claude/docs/Model-Selection-Guide.md");
    process.exit(1);
  }

  // Check if codex CLI is available
  try {
    const checkCodex = spawn("which", ["codex"]);
    await new Promise<void>((resolve, reject) => {
      checkCodex.on("close", (code) => {
        if (code !== 0) {
          reject(new Error("codex CLI not found"));
        } else {
          resolve();
        }
      });
    });
  } catch {
    console.error("Error: codex CLI not found in PATH");
    console.error("Please install codex CLI:");
    console.error("  npm install -g @openai/codex");
    console.error("  codex auth login");
    process.exit(1);
  }

  // Budget awareness check
  const modelData = AVAILABLE_MODELS.find((m) => m.name === model);
  if (modelData) {
    warnIfNeeded(modelData.tier as "cheap" | "expensive" | "balanced", "Codex");
  }

  // Usage tracking
  if (modelData) {
    logModelUsage("Codex", model, modelData.tier, DEFAULT_MODEL, overrideType);
  }

  // Call Codex CLI
  console.error(`\nQuerying Codex (${model})...\n`);

  try {
    const result = await callCodexCli(query, model);
    console.log(result.content);

    if (result.exitCode !== 0) {
      console.error(`\n[Codex exited with code ${result.exitCode}]`);
    }
  } catch (error) {
    console.error(
      `\n${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

// Export for use as module
export { callCodexCli };

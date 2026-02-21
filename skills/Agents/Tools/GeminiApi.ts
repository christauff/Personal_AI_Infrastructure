#!/usr/bin/env bun
/**
 * GeminiApi.ts - Google Gemini API Client for GeminiResearcher
 *
 * Provides interface to Google Gemini API for multi-perspective research
 * with query variation and parallel investigation.
 *
 * Usage:
 *   bun run GeminiApi.ts --query "your research question"
 *   bun run GeminiApi.ts --query "analyze topic from multiple angles" --model gemini-2.5-pro
 *
 * Environment:
 *   GOOGLE_API_KEY - Your Google API key (from ~/.claude/.env)
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { warnIfNeeded } from "./budgetCheck.ts";
import { logModelUsage, detectOverrideType } from "./usageLogger.ts";

// ============================================================================
// Configuration
// ============================================================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

// Model tier mappings (see Model-Selection-Guide.md for current pricing)
// Last Verified: 2026-02-01 against https://ai.google.dev/gemini-api/docs/models
// Note: Verify quarterly or when PAIUpgrade alerts on Google AI changelog updates
const MODEL_TIERS = {
  cheap: "gemini-2.5-flash-lite",
  expensive: "gemini-2.5-pro",
};

const AVAILABLE_MODELS = [
  { name: "gemini-2.5-flash-lite", tier: "cheap", description: "High-volume, cost-sensitive, fast responses" },
  { name: "gemini-2.5-flash", tier: "balanced", description: "Balanced workloads, production scale" },
  { name: "gemini-2.5-pro", tier: "expensive", description: "Complex reasoning (code, math, STEM)" },
];

interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
    role?: string;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  systemInstruction?: {
    parts: Array<{
      text: string;
    }>;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ============================================================================
// Environment Loading
// ============================================================================

function loadEnv(): Map<string, string> {
  const envFile = join(homedir(), ".claude", ".env");
  const envVars = new Map<string, string>();

  try {
    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          envVars.set(key.trim(), valueParts.join("=").trim());
        }
      }
    }
  } catch (error) {
    console.error("❌ Failed to load .env file:", error);
  }

  return envVars;
}

// ============================================================================
// API Client
// ============================================================================

async function callGeminiApi(
  apiKey: string,
  query: string,
  model: string = DEFAULT_MODEL,
  systemPrompt?: string
): Promise<string> {
  const defaultSystemPrompt = `You are Alex Rivera, a multi-perspective researcher using Google Gemini.

Your approach:
- Break complex queries into 3-10 different perspectives/angles
- Analyze each perspective independently
- Consider stakeholder viewpoints (users, developers, business, regulators)
- Use scenario planning techniques
- Synthesize comprehensive coverage from all angles
- Present findings with clear multi-perspective structure

Your goal is to provide thorough, well-rounded analysis that covers all important dimensions of the question.`;

  const request: GeminiRequest = {
    contents: [
      {
        parts: [
          {
            text: query,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (systemPrompt || defaultSystemPrompt) {
    request.systemInstruction = {
      parts: [
        {
          text: systemPrompt || defaultSystemPrompt,
        },
      ],
    };
  }

  try {
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("No response from Gemini API");
    }

    // Log usage if available
    if (data.usageMetadata) {
      console.error(`\n[Usage: ${data.usageMetadata.totalTokenCount} tokens (prompt: ${data.usageMetadata.promptTokenCount}, completion: ${data.usageMetadata.candidatesTokenCount})]`);
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
  }
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
Available Gemini Models:
`);
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : "⚡";
      console.log(`  ${tierBadge} ${m.name.padEnd(25)} ${m.description}`);
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
  let systemPrompt: string | undefined;

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
    } else if (arg === "--system" && i + 1 < args.length) {
      systemPrompt = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
GeminiApi.ts - Google Gemini API Client for GeminiResearcher

Usage:
  bun run GeminiApi.ts --query "your research question"
  bun run GeminiApi.ts --query "complex analysis" --cheap
  bun run GeminiApi.ts --query "STEM reasoning" --expensive

Options:
  --query <text>     Research question or query (required)
  --model <name>     Specific model to use (default: gemini-2.5-flash)
  --cheap            Use fastest/cheapest model (flash-lite)
  --expensive        Use most capable model (pro)
  --list-models      Show all available models
  --system <prompt>  Custom system prompt (optional)
  --help, -h         Show this help

Environment:
  GOOGLE_API_KEY must be set in ~/.claude/.env

Pricing:
  See ~/.claude/docs/Model-Selection-Guide.md for current model costs
      `);
      process.exit(0);
    }
  }

  if (!query) {
    console.error("❌ Error: --query is required\n");
    console.error("Usage: bun run GeminiApi.ts --query \"your research question\"");
    process.exit(1);
  }

  // Validate model
  const validModels = AVAILABLE_MODELS.map((m) => m.name);
  if (!validModels.includes(model)) {
    console.error(`❌ Error: Invalid model '${model}'\n`);
    console.error("Available models:");
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : "⚡";
      console.error(`  ${tierBadge} ${m.name.padEnd(25)} ${m.description}`);
    });
    console.error("\nTier shortcuts:");
    console.error(`  --cheap      → ${MODEL_TIERS.cheap}`);
    console.error(`  --expensive  → ${MODEL_TIERS.expensive}`);
    console.error("\nPricing: See ~/.claude/docs/Model-Selection-Guide.md");
    process.exit(1);
  }

  // Load API key
  const envVars = loadEnv();
  const apiKey = envVars.get("GOOGLE_API_KEY") || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: GOOGLE_API_KEY not found");
    console.error("Please add your Google API key to ~/.claude/.env:");
    console.error("  GOOGLE_API_KEY=your-key-here");
    process.exit(1);
  }

  // Budget awareness check
  const modelData = AVAILABLE_MODELS.find((m) => m.name === model);
  if (modelData) {
    warnIfNeeded(modelData.tier as "cheap" | "expensive" | "balanced", "Gemini");
  }

  // Usage tracking
  if (modelData) {
    logModelUsage("Gemini", model, modelData.tier, DEFAULT_MODEL, overrideType);
  }

  // Call API
  console.error(`\n🔍 Querying Gemini (${model})...\n`);

  try {
    const response = await callGeminiApi(apiKey, query, model, systemPrompt);
    console.log(response);
  } catch (error) {
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

// Export for use as module
export { callGeminiApi, loadEnv };

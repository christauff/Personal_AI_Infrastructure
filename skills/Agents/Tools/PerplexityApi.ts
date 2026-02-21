#!/usr/bin/env bun
/**
 * PerplexityApi.ts - Perplexity Sonar API Client for PerplexityResearcher
 *
 * Provides interface to Perplexity API for fast, accurate web search
 * with real-time citations and source verification.
 *
 * Usage:
 *   bun run PerplexityApi.ts --query "your research question"
 *   bun run PerplexityApi.ts --query "complex query" --model sonar-pro
 *
 * Environment:
 *   PERPLEXITY_API_KEY - Your Perplexity API key (from ~/.claude/.env)
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { warnIfNeeded } from "./budgetCheck.ts";
import { logModelUsage, detectOverrideType } from "./usageLogger.ts";

// ============================================================================
// Configuration
// ============================================================================

const PERPLEXITY_API_BASE = "https://api.perplexity.ai";
const DEFAULT_MODEL = "sonar";

// Model tier mappings (see Model-Selection-Guide.md for current pricing)
// Last Verified: 2026-02-01 against https://docs.perplexity.ai/docs/model-cards
// Note: Verify quarterly or when PAIUpgrade alerts on Perplexity changelog updates
const MODEL_TIERS = {
  cheap: "sonar",
  expensive: "sonar-pro",
};

const AVAILABLE_MODELS = [
  { name: "sonar", tier: "cheap", description: "Quick factual queries, topic summaries" },
  { name: "sonar-pro", tier: "expensive", description: "Complex multi-step queries, long-form" },
  { name: "sonar-reasoning", tier: "reasoning", description: "Logical problem-solving, CoT analysis" },
  { name: "sonar-deep-research", tier: "extensive", description: "Comprehensive reports, market analysis" },
];

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityRequest {
  model: string;
  messages: PerplexityMessage[];
  temperature?: number;
  max_tokens?: number;
  return_citations?: boolean;
  return_images?: boolean;
}

interface PerplexityCitation {
  url: string;
  title?: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  citations?: PerplexityCitation[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
    console.error("Failed to load .env file:", error);
  }

  return envVars;
}

// ============================================================================
// API Client
// ============================================================================

async function callPerplexityApi(
  apiKey: string,
  query: string,
  model: string = DEFAULT_MODEL,
  systemPrompt?: string
): Promise<{ content: string; citations: PerplexityCitation[] }> {
  const defaultSystemPrompt = `You are Ava Chen, a lightning-fast web researcher using Perplexity Sonar.

Your approach:
- Decompose queries into searchable atomic questions
- Search and verify across multiple sources in parallel
- Return only confirmed facts with citations
- Be direct and efficient - no filler, no speculation
- Every claim must have a source
- Speed is critical but accuracy is non-negotiable

Format your responses with clear findings and source citations.`;

  const request: PerplexityRequest = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt || defaultSystemPrompt,
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    return_citations: true,
    return_images: false,
  };

  try {
    const response = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const data = (await response.json()) as PerplexityResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Perplexity API");
    }

    // Log usage if available
    if (data.usage) {
      console.error(
        `\n[Usage: ${data.usage.total_tokens} tokens (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})]`
      );
    }

    return {
      content: data.choices[0].message.content,
      citations: data.citations || [],
    };
  } catch (error) {
    throw new Error(
      `Perplexity API error: ${error instanceof Error ? error.message : String(error)}`
    );
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
Available Perplexity Models:
`);
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : m.tier === "reasoning" ? "🧠" : "📊";
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
  let showCitations = true;

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
    } else if (arg === "--no-citations") {
      showCitations = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
PerplexityApi.ts - Perplexity Sonar API Client for PerplexityResearcher

Usage:
  bun run PerplexityApi.ts --query "your research question"
  bun run PerplexityApi.ts --query "complex query" --cheap
  bun run PerplexityApi.ts --query "critical analysis" --expensive

Options:
  --query <text>     Research question or query (required)
  --model <name>     Specific model to use (default: sonar)
  --cheap            Use fastest/cheapest model (sonar)
  --expensive        Use most capable model (sonar-pro)
  --list-models      Show all available models
  --system <prompt>  Custom system prompt (optional)
  --no-citations     Suppress citation output
  --help, -h         Show this help

Environment:
  PERPLEXITY_API_KEY must be set in ~/.claude/.env

Pricing:
  See ~/.claude/docs/Model-Selection-Guide.md for current model costs
      `);
      process.exit(0);
    }
  }

  if (!query) {
    console.error("Error: --query is required\n");
    console.error(
      'Usage: bun run PerplexityApi.ts --query "your research question"'
    );
    process.exit(1);
  }

  // Validate model
  const validModels = AVAILABLE_MODELS.map((m) => m.name);
  if (!validModels.includes(model)) {
    console.error(`❌ Error: Invalid model '${model}'\n`);
    console.error("Available models:");
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : m.tier === "reasoning" ? "🧠" : "📊";
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
  const apiKey = envVars.get("PERPLEXITY_API_KEY") || process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.error("Error: PERPLEXITY_API_KEY not found");
    console.error("Please add your Perplexity API key to ~/.claude/.env:");
    console.error("  PERPLEXITY_API_KEY=pplx-your-key-here");
    process.exit(1);
  }

  // Budget awareness check
  const modelData = AVAILABLE_MODELS.find((m) => m.name === model);
  if (modelData) {
    warnIfNeeded(modelData.tier as "cheap" | "expensive" | "balanced", "Perplexity");
  }

  // Usage tracking
  if (modelData) {
    logModelUsage("Perplexity", model, modelData.tier, DEFAULT_MODEL, overrideType);
  }

  // Call API
  console.error(`\nSearching Perplexity (${model})...\n`);

  try {
    const { content, citations } = await callPerplexityApi(
      apiKey,
      query,
      model,
      systemPrompt
    );

    console.log(content);

    // Show citations if enabled and available
    if (showCitations && citations.length > 0) {
      console.log("\n--- Citations ---");
      citations.forEach((citation, index) => {
        console.log(`[${index + 1}] ${citation.title || citation.url}`);
        console.log(`    ${citation.url}`);
      });
    }
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

// Export for use as module
export { callPerplexityApi, loadEnv };

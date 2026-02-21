#!/usr/bin/env bun
/**
 * GrokApi.ts - xAI Grok API Client for GrokResearcher
 *
 * Provides interface to xAI Grok API for social/political research
 * with X (Twitter) access and real-time data.
 *
 * Usage:
 *   bun run GrokApi.ts --query "your research question"
 *   bun run GrokApi.ts --query "analyze social sentiment on topic" --model grok-4
 *
 * Environment:
 *   XAI_API_KEY - Your xAI API key (from ~/.claude/.env)
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { warnIfNeeded } from "./budgetCheck.ts";
import { logModelUsage, detectOverrideType } from "./usageLogger.ts";

// ============================================================================
// Configuration
// ============================================================================

const XAI_API_BASE = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4";

// Model tier mappings (see Model-Selection-Guide.md for current pricing)
// Last Verified: 2026-02-04 against https://docs.x.ai/api
// Note: Verify quarterly or when PAIUpgrade alerts on xAI changelog updates
const MODEL_TIERS = {
  cheap: "grok-3-fast",
  expensive: "grok-4",
};

const AVAILABLE_MODELS = [
  { name: "grok-3-fast", tier: "cheap", description: "Fast queries, cost optimization" },
  { name: "grok-4", tier: "expensive", description: "Full capability, X/Twitter access" },
  { name: "grok-3", tier: "balanced", description: "Previous generation, good balance" },
];

// Live search tools - xAI server-side tools (executed by xAI, not client)
// These use the /v1/responses endpoint with simple type declarations
const LIVE_SEARCH_TOOLS = [
  { type: "x_search" },
  { type: "web_search" },
];

// Standard chat completions format (no live search)
interface GrokChatRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
}

// Responses API format (with live search tools)
interface GrokResponsesRequest {
  model: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  tools?: Array<{ type: string }>;
}

interface GrokChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GrokResponsesResponse {
  output?: Array<{
    type?: string;  // "message" or "custom_tool_call"
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
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
    console.error("❌ Failed to load .env file:", error);
  }

  return envVars;
}

// ============================================================================
// API Client
// ============================================================================

async function callGrokApi(
  apiKey: string,
  query: string,
  model: string = DEFAULT_MODEL,
  systemPrompt?: string,
  enableLiveSearch: boolean = false
): Promise<string> {
  const defaultSystemPrompt = `You are Johannes, a contrarian fact-based researcher using xAI Grok with X (Twitter) access.

Your approach:
- Challenge conventional wisdom with data
- Provide unbiased analysis (no political lean)
- Focus on long-term truth over short-term trends
- Analyze social sentiment from X (Twitter)
- Separate facts from opinions
- Present evidence-based conclusions

Use your real-time X access to analyze social/political discussions and provide fact-based insights.`;

  const systemContent = systemPrompt || defaultSystemPrompt;

  // Use different endpoints based on whether live search is needed
  if (enableLiveSearch) {
    // Use /v1/responses endpoint with server-side tools
    console.error("📡 Live search enabled (x_search + web_search)");

    // Responses API: prepend system content to user query (no separate system role)
    const combinedQuery = systemContent
      ? `[Context: ${systemContent}]\n\n${query}`
      : query;

    const request: GrokResponsesRequest = {
      model,
      input: [
        { role: "user", content: combinedQuery },
      ],
      tools: LIVE_SEARCH_TOOLS,
    };

    try {
      const response = await fetch(`${XAI_API_BASE}/responses`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = (await response.json()) as GrokResponsesResponse;

      // Find the message output (not tool calls) and extract text
      const messageOutput = data.output?.find(o => o.type === "message");
      const outputText = messageOutput?.content?.find(c => c.type === "output_text")?.text;

      if (!outputText) {
        throw new Error("No response from Grok API (responses endpoint)");
      }

      // Log usage if available
      if (data.usage) {
        console.error(`\n[Usage: ${data.usage.total_tokens} tokens (input: ${data.usage.input_tokens}, output: ${data.usage.output_tokens})]`);
      }

      return outputText;
    } catch (error) {
      throw new Error(`Grok API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Use standard /v1/chat/completions endpoint (no live search)
    const request: GrokChatRequest = {
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: query },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    };

    try {
      const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = (await response.json()) as GrokChatResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from Grok API");
      }

      // Log usage if available
      if (data.usage) {
        console.error(`\n[Usage: ${data.usage.total_tokens} tokens (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})]`);
      }

      return data.choices[0].message.content;
    } catch (error) {
      throw new Error(`Grok API error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
Available Grok Models:
`);
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : "📦";
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
  let systemPrompt: string | undefined;
  let enableLiveSearch = false;

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
    } else if (arg === "--live") {
      enableLiveSearch = true;
    } else if (arg === "--system" && i + 1 < args.length) {
      systemPrompt = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
GrokApi.ts - xAI Grok API Client for GrokResearcher

Usage:
  bun run GrokApi.ts --query "your research question"
  bun run GrokApi.ts --query "read this tweet" --live
  bun run GrokApi.ts --query "analyze sentiment" --cheap

Options:
  --query <text>     Research question or query (required)
  --live             Enable real-time X/Twitter and web search (REQUIRED for current data)
  --model <name>     Specific model to use (default: grok-4)
  --cheap            Use fastest/cheapest model (grok-3-fast)
  --expensive        Use most capable model (grok-4)
  --list-models      Show all available models
  --system <prompt>  Custom system prompt (optional)
  --help, -h         Show this help

IMPORTANT: Without --live, Grok only uses training data (no real-time X access).
           Use --live for current tweets, trends, and web searches.

Environment:
  XAI_API_KEY must be set in ~/.claude/.env

Pricing:
  See ~/.claude/docs/Model-Selection-Guide.md for current model costs
      `);
      process.exit(0);
    }
  }

  if (!query) {
    console.error("❌ Error: --query is required\n");
    console.error("Usage: bun run GrokApi.ts --query \"your research question\"");
    process.exit(1);
  }

  // Validate model
  const validModels = AVAILABLE_MODELS.map((m) => m.name);
  if (!validModels.includes(model)) {
    console.error(`❌ Error: Invalid model '${model}'\n`);
    console.error("Available models:");
    AVAILABLE_MODELS.forEach((m) => {
      const tierBadge = m.tier === "cheap" ? "💰" : m.tier === "expensive" ? "🚀" : "📦";
      console.error(`  ${tierBadge} ${m.name.padEnd(20)} ${m.description}`);
    });
    console.error("\nTier shortcuts:");
    console.error(`  --cheap      → ${MODEL_TIERS.cheap}`);
    console.error(`  --expensive  → ${MODEL_TIERS.expensive}`);
    console.error("\nPricing: See ~/.claude/docs/Model-Selection-Guide.md");
    process.exit(1);
  }

  // Load API key
  const envVars = loadEnv();
  const apiKey = envVars.get("XAI_API_KEY") || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: XAI_API_KEY not found");
    console.error("Please add your xAI API key to ~/.claude/.env:");
    console.error("  XAI_API_KEY=xai-your-key-here");
    process.exit(1);
  }

  // Budget awareness check
  const modelData = AVAILABLE_MODELS.find((m) => m.name === model);
  if (modelData) {
    warnIfNeeded(modelData.tier as "cheap" | "expensive" | "balanced", "Grok");
  }

  // Usage tracking
  if (modelData) {
    logModelUsage("Grok", model, modelData.tier, DEFAULT_MODEL, overrideType);
  }

  // Call API
  console.error(`\n🔍 Querying Grok (${model})${enableLiveSearch ? " with live search" : ""}...\n`);

  try {
    const response = await callGrokApi(apiKey, query, model, systemPrompt, enableLiveSearch);
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
export { callGrokApi, loadEnv };

/**
 * usageLogger.ts - Track model selection patterns for learning
 *
 * Logs model override decisions to help refine guidance and defaults.
 * Lightweight, gracefully degrades if logging fails.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getBudgetState } from "./budgetCheck.ts";

interface ModelUsageEvent {
  timestamp: string;
  service: string;
  model: string;
  tier: string;
  isOverride: boolean;
  overrideType?: "cheap" | "expensive" | "specific";
  budgetPercentage?: number;
  defaultModel: string;
}

const LOG_PATH = join(
  homedir(),
  ".claude",
  "MEMORY",
  "LEARNING",
  "model-usage.jsonl"
);

/**
 * Logs a model selection event.
 * Fails gracefully if logging unavailable.
 */
export function logModelUsage(
  service: string,
  model: string,
  tier: string,
  defaultModel: string,
  overrideType?: "cheap" | "expensive" | "specific"
): void {
  try {
    // Ensure directory exists
    const logDir = join(homedir(), ".claude", "MEMORY", "LEARNING");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Get budget state if available
    const budgetState = getBudgetState();
    const budgetPercentage = budgetState
      ? Math.round(budgetState.percentage * 100)
      : undefined;

    // Create event record
    const event: ModelUsageEvent = {
      timestamp: new Date().toISOString(),
      service,
      model,
      tier,
      isOverride: model !== defaultModel,
      overrideType,
      budgetPercentage,
      defaultModel,
    };

    // Append to log file (JSONL format)
    appendFileSync(LOG_PATH, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Gracefully degrade - logging failure shouldn't break API calls
    // Silent failure is acceptable for analytics
  }
}

/**
 * Helper to determine override type from CLI flags.
 * Call this before model selection to track intent.
 */
export function detectOverrideType(args: string[]): {
  overrideType?: "cheap" | "expensive" | "specific";
  modelOverride?: string;
} {
  if (args.includes("--cheap")) {
    return { overrideType: "cheap" };
  }

  if (args.includes("--expensive")) {
    return { overrideType: "expensive" };
  }

  // Check for --model flag
  const modelIndex = args.indexOf("--model");
  if (modelIndex !== -1 && modelIndex + 1 < args.length) {
    return {
      overrideType: "specific",
      modelOverride: args[modelIndex + 1],
    };
  }

  return {};
}

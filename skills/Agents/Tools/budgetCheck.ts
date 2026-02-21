/**
 * budgetCheck.ts - Lightweight budget awareness for API wrappers
 *
 * Reads budget state and warns operators when using expensive models
 * near budget limits.
 *
 * Design: Graceful degradation - if budget data unavailable, skip warnings.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface BudgetState {
  monthlyTotal: number;
  currentSpend: number;
  percentage: number;
}

interface BudgetThresholds {
  caution: number;   // 70%
  warning: number;   // 85%
  critical: number;  // 95%
}

const THRESHOLDS: BudgetThresholds = {
  caution: 0.70,
  warning: 0.85,
  critical: 0.95,
};

/**
 * Attempts to read current budget state.
 * Returns null if budget tracking not available (graceful degradation).
 */
export function getBudgetState(): BudgetState | null {
  try {
    const budgetDir = join(homedir(), ".claude", "BUDGET");
    const configPath = join(budgetDir, "config.yaml");

    // Read monthly total from config
    if (!existsSync(configPath)) {
      return null;
    }

    const configContent = readFileSync(configPath, "utf-8");
    const monthlyMatch = configContent.match(/monthly_total:\s*([\d.]+)/);

    if (!monthlyMatch) {
      return null;
    }

    const monthlyTotal = parseFloat(monthlyMatch[1]);

    // Check for current spend tracking file
    const usagePath = join(budgetDir, "usage.jsonl");

    if (!existsSync(usagePath)) {
      // No spend tracking yet - return null (no warnings)
      return null;
    }

    // Read usage.jsonl to calculate current month spend
    const usageContent = readFileSync(usagePath, "utf-8");

    if (!usageContent.trim()) {
      // Empty tracking file - assume 0% spend
      return {
        monthlyTotal,
        currentSpend: 0,
        percentage: 0,
      };
    }

    // Parse usage entries for current month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let currentSpend = 0;

    for (const line of usageContent.split("\n")) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        if (entry.month === currentMonth && entry.cost) {
          currentSpend += parseFloat(entry.cost);
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return {
      monthlyTotal,
      currentSpend,
      percentage: currentSpend / monthlyTotal,
    };
  } catch {
    // Any error - gracefully degrade (no warnings)
    return null;
  }
}

/**
 * Checks if operator should be warned about using expensive model.
 * Returns warning message if budget pressure exists, null otherwise.
 */
export function checkBudgetWarning(
  modelTier: "cheap" | "expensive" | "balanced",
  serviceName: string
): string | null {
  // Only warn when using expensive models
  if (modelTier !== "expensive") {
    return null;
  }

  const state = getBudgetState();

  // No budget data available - skip warning
  if (!state) {
    return null;
  }

  const { percentage } = state;

  // Warn at different levels based on threshold
  if (percentage >= THRESHOLDS.critical) {
    return `🚨 BUDGET CRITICAL (${Math.round(percentage * 100)}%) - Consider using --cheap to conserve resources`;
  }

  if (percentage >= THRESHOLDS.warning) {
    return `⚠️  Budget at ${Math.round(percentage * 100)}% - Consider using --cheap for cost savings`;
  }

  if (percentage >= THRESHOLDS.caution) {
    return `💡 Budget at ${Math.round(percentage * 100)}% - Expensive model selected. Use --cheap if appropriate.`;
  }

  // Below caution threshold - no warning needed
  return null;
}

/**
 * Displays budget warning if appropriate.
 * Call before making expensive API calls.
 */
export function warnIfNeeded(
  modelTier: "cheap" | "expensive" | "balanced",
  serviceName: string
): void {
  const warning = checkBudgetWarning(modelTier, serviceName);

  if (warning) {
    console.error(`\n${warning}\n`);
  }
}

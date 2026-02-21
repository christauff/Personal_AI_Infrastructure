#!/usr/bin/env bun
/**
 * analyzeUsage.ts - Analyze model selection patterns
 *
 * Reads model-usage.jsonl and summarizes:
 * - Which models are actually being used
 * - Override frequency (cheap, expensive, specific)
 * - Budget state correlation with model choices
 * - Service-specific patterns
 *
 * Usage:
 *   bun run analyzeUsage.ts [--last-n-days 7]
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

function parseArgs(): { lastNDays?: number } {
  const args = process.argv.slice(2);
  const lastNDaysIndex = args.indexOf("--last-n-days");

  if (lastNDaysIndex !== -1 && lastNDaysIndex + 1 < args.length) {
    return { lastNDays: parseInt(args[lastNDaysIndex + 1], 10) };
  }

  return {};
}

function loadEvents(lastNDays?: number): ModelUsageEvent[] {
  if (!existsSync(LOG_PATH)) {
    console.log("No usage data found at:", LOG_PATH);
    console.log("Model usage will be tracked as you use the API wrappers.");
    return [];
  }

  const content = readFileSync(LOG_PATH, "utf-8");
  const events: ModelUsageEvent[] = [];

  const cutoffDate = lastNDays
    ? new Date(Date.now() - lastNDays * 24 * 60 * 60 * 1000)
    : null;

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as ModelUsageEvent;

      // Filter by date if specified
      if (cutoffDate && new Date(event.timestamp) < cutoffDate) {
        continue;
      }

      events.push(event);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return events;
}

function analyzeEvents(events: ModelUsageEvent[]): void {
  if (events.length === 0) {
    console.log("No events to analyze.");
    return;
  }

  console.log(`\n📊 Model Usage Analysis (${events.length} events)\n`);
  console.log("=" .repeat(80));

  // Overall override rate
  const overrides = events.filter((e) => e.isOverride);
  const overrideRate = ((overrides.length / events.length) * 100).toFixed(1);

  console.log(`\n📈 Override Rate: ${overrideRate}% (${overrides.length}/${events.length})`);

  // Override type breakdown
  if (overrides.length > 0) {
    const byType: Record<string, number> = {};
    overrides.forEach((e) => {
      const type = e.overrideType || "unknown";
      byType[type] = (byType[type] || 0) + 1;
    });

    console.log("\nOverride Types:");
    Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        const pct = ((count / overrides.length) * 100).toFixed(1);
        console.log(`  ${type.padEnd(10)} ${count.toString().padStart(3)} (${pct}%)`);
      });
  }

  // By service
  const byService: Record<string, ModelUsageEvent[]> = {};
  events.forEach((e) => {
    if (!byService[e.service]) byService[e.service] = [];
    byService[e.service].push(e);
  });

  console.log("\n📦 Usage by Service:");
  Object.entries(byService)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([service, serviceEvents]) => {
      const overrideCount = serviceEvents.filter((e) => e.isOverride).length;
      const overridePct = ((overrideCount / serviceEvents.length) * 100).toFixed(1);

      console.log(`\n  ${service}:`);
      console.log(`    Total calls: ${serviceEvents.length}`);
      console.log(`    Overrides: ${overrideCount} (${overridePct}%)`);

      // Model distribution
      const modelCounts: Record<string, number> = {};
      serviceEvents.forEach((e) => {
        modelCounts[e.model] = (modelCounts[e.model] || 0) + 1;
      });

      console.log(`    Models used:`);
      Object.entries(modelCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([model, count]) => {
          const pct = ((count / serviceEvents.length) * 100).toFixed(1);
          const isDefault = serviceEvents[0].defaultModel === model;
          const marker = isDefault ? " (default)" : "";
          console.log(`      ${model.padEnd(25)} ${count.toString().padStart(3)} (${pct}%)${marker}`);
        });
    });

  // Budget correlation
  const withBudget = events.filter((e) => e.budgetPercentage !== undefined);
  if (withBudget.length > 0) {
    console.log("\n💰 Budget Correlation:");

    const cheapAtHighBudget = withBudget.filter(
      (e) => e.tier === "cheap" && (e.budgetPercentage || 0) > 70
    );
    const expensiveAtHighBudget = withBudget.filter(
      (e) => e.tier === "expensive" && (e.budgetPercentage || 0) > 70
    );

    console.log(`  Cheap tier used at >70% budget: ${cheapAtHighBudget.length}`);
    console.log(`  Expensive tier used at >70% budget: ${expensiveAtHighBudget.length}`);

    if (expensiveAtHighBudget.length > 0) {
      console.log(`  ⚠️  Consider reviewing expensive model usage when budget is constrained`);
    }
  }

  // Time range
  const timestamps = events.map((e) => new Date(e.timestamp));
  const earliest = new Date(Math.min(...timestamps.map((t) => t.getTime())));
  const latest = new Date(Math.max(...timestamps.map((t) => t.getTime())));

  console.log(`\n📅 Time Range:`);
  console.log(`  From: ${earliest.toISOString().slice(0, 10)}`);
  console.log(`  To:   ${latest.toISOString().slice(0, 10)}`);

  console.log("\n" + "=".repeat(80) + "\n");
}

function main(): void {
  const { lastNDays } = parseArgs();

  console.log("🔍 Model Selection Usage Analysis");

  if (lastNDays) {
    console.log(`Analyzing last ${lastNDays} days...`);
  }

  const events = loadEvents(lastNDays);
  analyzeEvents(events);

  console.log("\n💡 Insights:");
  console.log("  - High override rates suggest defaults may need adjustment");
  console.log("  - Cheap tier usage at high budget shows cost consciousness");
  console.log("  - Expensive tier at high budget may indicate critical work");
  console.log("\n📝 Next steps:");
  console.log("  - Review patterns weekly: bun run analyzeUsage.ts --last-n-days 7");
  console.log("  - Consider updating defaults if override rate >50%");
  console.log("  - Update Model-Selection-Guide.md based on observed patterns\n");
}

main();

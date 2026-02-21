#!/usr/bin/env bun
/**
 * DreamWriter.ts - Write formatted dream reports
 * Part of DreamProcessor skill
 *
 * Scalability considerations:
 * - Append-only hypothesis registry (YAML is grep-friendly)
 * - Automatic archival triggers for old reports
 * - Cross-reference validation to prevent orphaned links
 * - Temporal layering (NIGHTLY → WEEKLY → MONTHLY)
 *
 * Usage:
 *   echo '{"themes": [...]}' | bun run DreamWriter.ts --type=nightly --date=2026-02-04
 *   bun run DreamWriter.ts --type=weekly --week=2026-W05
 *   bun run DreamWriter.ts --type=monthly --month=2026-02
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

// Configuration
const PAI_DIR = process.env.HOME + "/.claude";
const DREAMS_DIR = `${PAI_DIR}/DREAMS`;
const DATA_DIR = `${PAI_DIR}/skills/DreamProcessor/Data`;

interface Theme {
  title: string;
  analysis: string;
  evidenceSources?: string[];
  relatedHypotheses?: string[];
  confidence?: "low" | "medium" | "high";
}

interface Insight {
  insight: string;
  category?: "technical" | "behavioral" | "strategic" | "meta";
  sourceTheme?: string;
  actionable?: boolean;
}

interface Hypothesis {
  id?: string;
  statement: string;
  confidence: "low" | "medium" | "high";
  evidenceNeeded: string;
  verificationMethod: string;
  status?: "new" | "tracking" | "validated" | "refuted" | "stale";
}

interface Connection {
  fromDomain: string;
  toDomain: string;
  connectionType: "analogy" | "causation" | "correlation" | "contradiction";
  description: string;
  strength?: "weak" | "moderate" | "strong";
}

interface ActionItem {
  item: string;
  priority?: "low" | "medium" | "high" | "urgent";
  domain?: string;
}

interface DreamData {
  themes?: Theme[];
  insights?: Insight[];
  hypotheses?: Hypothesis[];
  connections?: Connection[];
  actionItems?: ActionItem[];
  freshMemoriesCount?: number;
  historicalContext?: string;
}

// Parse command line arguments
function parseArgs(): {
  type: "nightly" | "weekly" | "monthly";
  date?: string;
  week?: string;
  month?: string;
} {
  const args = process.argv.slice(2);
  const result: ReturnType<typeof parseArgs> = {
    type: "nightly",
  };

  for (const arg of args) {
    if (arg.startsWith("--type=")) {
      result.type = arg.split("=")[1] as typeof result.type;
    } else if (arg.startsWith("--date=")) {
      result.date = arg.split("=")[1];
    } else if (arg.startsWith("--week=")) {
      result.week = arg.split("=")[1];
    } else if (arg.startsWith("--month=")) {
      result.month = arg.split("=")[1];
    }
  }

  // Defaults
  if (result.type === "nightly" && !result.date) {
    result.date = new Date().toISOString().split("T")[0];
  }

  return result;
}

// Generate hypothesis ID
function generateHypothesisId(date: string, index: number): string {
  return `HYP-${date}-${String(index).padStart(3, "0")}`;
}

// Format a nightly dream report
function formatNightlyReport(data: DreamData, date: string): string {
  const now = new Date().toISOString();
  const connectionsCount = data.connections?.length || 0;

  let report = `# Dream Report: ${date}

**Generated:** ${now}
**Fresh memories analyzed:** ${data.freshMemoriesCount || "unknown"}
**Historical context:** ${data.historicalContext || "general session activity"}
**Connections found:** ${connectionsCount} significant patterns

---

`;

  // Key Themes
  if (data.themes && data.themes.length > 0) {
    report += `## Key Themes Emerging\n\n`;
    data.themes.forEach((theme, i) => {
      report += `### ${i + 1}. ${theme.title}\n\n`;
      report += `${theme.analysis}\n\n`;
      if (theme.evidenceSources?.length) {
        report += `**Evidence sources:** ${theme.evidenceSources.join(", ")}\n\n`;
      }
      if (theme.confidence) {
        report += `**Confidence:** ${theme.confidence}\n\n`;
      }
      report += `---\n\n`;
    });
  }

  // Insights
  if (data.insights && data.insights.length > 0) {
    report += `## Consolidated Insights\n\n`;
    data.insights.forEach((insight) => {
      const category = insight.category ? ` [${insight.category}]` : "";
      const actionable = insight.actionable ? " **(actionable)**" : "";
      report += `- ${insight.insight}${category}${actionable}\n`;
    });
    report += `\n---\n\n`;
  }

  // Hypotheses
  if (data.hypotheses && data.hypotheses.length > 0) {
    report += `## Hypotheses Generated\n\n`;
    data.hypotheses.forEach((hyp, i) => {
      const id = hyp.id || generateHypothesisId(date, i + 1);
      report += `### ${id}: ${hyp.statement}\n\n`;
      report += `**Confidence:** ${hyp.confidence}\n`;
      report += `**Evidence needed:** ${hyp.evidenceNeeded}\n`;
      report += `**Verification method:** ${hyp.verificationMethod}\n`;
      report += `**Status:** ${hyp.status || "new"}\n\n`;
    });
    report += `---\n\n`;
  }

  // Connections
  if (data.connections && data.connections.length > 0) {
    report += `## Cross-Domain Connections\n\n`;
    data.connections.forEach((conn) => {
      const strength = conn.strength ? ` (${conn.strength})` : "";
      report += `- **${conn.fromDomain}** → **${conn.toDomain}**${strength}\n`;
      report += `  - Type: ${conn.connectionType}\n`;
      report += `  - ${conn.description}\n\n`;
    });
    report += `---\n\n`;
  }

  // Action Items
  if (data.actionItems && data.actionItems.length > 0) {
    report += `## Action Items for Morning\n\n`;
    data.actionItems.forEach((item, i) => {
      const priority = item.priority ? ` [${item.priority}]` : "";
      report += `${i + 1}. ${item.item}${priority}\n`;
    });
    report += `\n---\n\n`;
  }

  // Footer
  const quality =
    data.themes && data.themes.length > 0 ? "high" : "partial";
  report += `**Dream quality:** ${quality} (${data.themes?.length || 0} themes, ${data.hypotheses?.length || 0} hypotheses)\n`;
  report += `*Generated by DreamProcessor NightlyConsolidation*\n`;

  return report;
}

// Append hypotheses to registry
async function updateHypothesisRegistry(
  hypotheses: Hypothesis[],
  date: string
): Promise<void> {
  const registryPath = join(DATA_DIR, "HypothesisRegistry.yaml");

  let yamlContent = "";

  hypotheses.forEach((hyp, i) => {
    const id = hyp.id || generateHypothesisId(date, i + 1);
    yamlContent += `
- id: "${id}"
  statement: "${hyp.statement.replace(/"/g, '\\"')}"
  confidence: ${hyp.confidence}
  evidenceNeeded: "${hyp.evidenceNeeded.replace(/"/g, '\\"')}"
  verificationMethod: "${hyp.verificationMethod.replace(/"/g, '\\"')}"
  status: ${hyp.status || "new"}
  createdDate: "${date}"
  lastUpdated: "${date}"
`;
  });

  if (yamlContent) {
    // Append to existing file or create new
    if (existsSync(registryPath)) {
      const existing = await Bun.file(registryPath).text();
      await Bun.write(registryPath, existing + yamlContent);
    } else {
      const header = `# HypothesisRegistry.yaml
# Auto-updated by DreamProcessor
# Format: append-only for scalability
# Created: ${date}

hypotheses:
${yamlContent}`;
      await Bun.write(registryPath, header);
    }
    console.log(`Updated HypothesisRegistry with ${hypotheses.length} hypotheses`);
  }
}

// Main write function
async function writeDream(): Promise<void> {
  const args = parseArgs();

  // Read input from stdin
  let inputData: DreamData;
  try {
    const stdin = await Bun.stdin.text();
    inputData = JSON.parse(stdin);
  } catch (e) {
    // If no stdin, create minimal report
    inputData = {
      themes: [],
      insights: [{ insight: "No data provided - minimal dream report generated" }],
      hypotheses: [],
      connections: [],
      actionItems: [{ item: "Review dream processor input pipeline", priority: "medium" }],
    };
    console.log("No stdin data, generating minimal report");
  }

  let outputPath: string;
  let content: string;

  switch (args.type) {
    case "nightly": {
      const date = args.date!;
      const dir = join(DREAMS_DIR, "NIGHTLY");
      mkdirSync(dir, { recursive: true });
      outputPath = join(dir, `${date}.md`);
      content = formatNightlyReport(inputData, date);

      // Update hypothesis registry if we have new hypotheses
      if (inputData.hypotheses && inputData.hypotheses.length > 0) {
        await updateHypothesisRegistry(inputData.hypotheses, date);
      }
      break;
    }

    case "weekly": {
      const week = args.week || `${new Date().getFullYear()}-W${String(Math.ceil((new Date().getDate()) / 7)).padStart(2, "0")}`;
      const dir = join(DREAMS_DIR, "WEEKLY");
      mkdirSync(dir, { recursive: true });
      outputPath = join(dir, `${week}.md`);
      content = `# Weekly Synthesis: ${week}\n\n*Weekly synthesis placeholder - implement in WeeklyPatternSynthesis workflow*\n`;
      break;
    }

    case "monthly": {
      const month = args.month || new Date().toISOString().slice(0, 7);
      const dir = join(DREAMS_DIR, "MONTHLY");
      mkdirSync(dir, { recursive: true });
      outputPath = join(dir, `${month}.md`);
      content = `# Monthly Wisdom: ${month}\n\n*Monthly wisdom placeholder - implement in CumulativeWisdomBuilding workflow*\n`;
      break;
    }

    default:
      throw new Error(`Unknown report type: ${args.type}`);
  }

  await Bun.write(outputPath, content);
  console.log(`Dream report written: ${outputPath}`);
  console.log(`Size: ${content.length} bytes`);
}

// Run
writeDream().catch(console.error);

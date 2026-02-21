#!/usr/bin/env bun
/**
 * LandscapeFacade.ts — Feedly data shaped for AI landscape monitoring
 *
 * Usage:
 *   bun LandscapeFacade.ts agent-news [count]     AI agent ecosystem news
 *   bun LandscapeFacade.ts github [count]          GitHub repo/framework releases
 *   bun LandscapeFacade.ts creators [count]        Claude Code creator content
 *   bun LandscapeFacade.ts daily-scan              Full landscape scan (all categories)
 *   bun LandscapeFacade.ts status                  Rate budget status
 *
 * This facade:
 * - Calls FeedlyClient with consumer="landscape"
 * - Covers all 4 LandscapeMonitor feed categories via Feedly search
 * - Produces structured output for MorningBrief consumption
 * - Zero LLM cost — deterministic keyword scoring and structuring
 *
 * Note: Security feeds are NOT included here — they're covered by
 * CyberOpsFacade (daily-digest) and SECUpdates (overnight processor).
 */

import * as Feedly from "../FeedlyClient";
import { ENTERPRISE_ID } from "../FeedlyClient";
import * as RateBudget from "../RateBudget";
import type { FeedlyArticle, FeedlySearchRequest } from "../Types";

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const GLOBAL_SOURCE = { items: [{ type: "stream", id: `enterprise/${ENTERPRISE_ID}/category/global.all` }] };

const CONSUMER = "landscape";
const PAI_DIR = process.env.PAI_DIR || `${process.env.HOME}/.claude`;
const SCAN_DIR = join(PAI_DIR, "skills/LandscapeMonitor/Data/scans");
const ALERT_DIR = join(PAI_DIR, "skills/LandscapeMonitor/Data/alerts");

// ============================================================================
// Alert Keyword Configuration (from LandscapeMonitor feed configs)
// ============================================================================

const CRITICAL_KEYWORDS = [
  "breaking change", "deprecation", "security vulnerability",
  "api deprecation", "end of life", "critical vulnerability",
  "mcp 2", "mcp breaking", "claude code breaking",
];

const HIGH_KEYWORDS = [
  "new feature", "major release", "api change", "new version",
  "mcp", "claude code", "agent sdk", "model context protocol",
  "a2a", "agent-to-agent", "claude 4", "claude 5", "opus",
  "sonnet", "gemini", "gpt-5", "gpt-6",
];

const WATCHED_FRAMEWORKS = [
  "langchain", "langgraph", "crewai", "autogpt", "openclaw",
  "mem0", "letta", "memgpt", "chromadb", "llamaindex",
];

const WATCHED_REPOS = [
  "anthropics/mcp", "modelcontextprotocol/servers",
  "anthropics/claude-code", "langchain-ai/langchain",
  "langchain-ai/langgraph", "joaomdmoura/crewai",
];

// ============================================================================
// Scoring
// ============================================================================

interface ScoredArticle {
  article: FeedlyArticle;
  score: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  matchedKeywords: string[];
  category: string;
}

function scoreArticle(article: FeedlyArticle, category: string): ScoredArticle {
  const text = `${article.title || ""} ${article.summary?.content || ""} ${(article.keywords || []).join(" ")}`.toLowerCase();
  let score = 0;
  const matched: string[] = [];

  for (const kw of CRITICAL_KEYWORDS) {
    if (text.includes(kw)) { score += 50; matched.push(kw); }
  }
  for (const kw of HIGH_KEYWORDS) {
    if (text.includes(kw)) { score += 20; matched.push(kw); }
  }
  for (const fw of WATCHED_FRAMEWORKS) {
    if (text.includes(fw)) { score += 10; matched.push(fw); }
  }
  for (const repo of WATCHED_REPOS) {
    if (text.includes(repo) || text.includes(repo.split("/")[1])) {
      score += 15; matched.push(repo);
    }
  }

  // Recency boost (last 24h = +10, last 48h = +5)
  const ageHours = (Date.now() - article.published) / (1000 * 60 * 60);
  if (ageHours < 24) score += 10;
  else if (ageHours < 48) score += 5;

  const priority = score >= 50 ? "CRITICAL"
    : score >= 30 ? "HIGH"
    : score >= 10 ? "MEDIUM"
    : "LOW";

  return { article, score, priority, matchedKeywords: [...new Set(matched)], category };
}

// ============================================================================
// Search Queries
// ============================================================================

/** AI agent ecosystem: Anthropic, OpenAI, Google, Microsoft, frameworks */
export async function agentEcosystemScan(count = 20): Promise<ScoredArticle[]> {
  const queries = [
    "Claude Code OR MCP specification OR model context protocol",
    "AI agent framework OR autonomous agent OR multi-agent",
    "Anthropic API OR OpenAI agent OR Google Gemini agent",
  ];

  const results: ScoredArticle[] = [];
  for (const query of queries) {
    try {
      const resp = await Feedly.searchContents(
        { query, source: GLOBAL_SOURCE, count: Math.ceil(count / queries.length), sortBy: "newest" },
        CONSUMER,
      );
      for (const article of resp.items || []) {
        results.push(scoreArticle(article, "agent-news"));
      }
    } catch (e: any) {
      if (e.name === "RateLimitError") break;
      // Log but continue with other queries
      console.error(`[landscape] Search failed for "${query}": ${e.message}`);
    }
  }

  return dedup(results).sort((a, b) => b.score - a.score);
}

/** GitHub ecosystem: framework releases, trending repos */
export async function githubEcosystemScan(count = 15): Promise<ScoredArticle[]> {
  const queries = [
    "LangChain release OR LangGraph release OR CrewAI release",
    "MCP server OR model context protocol GitHub",
  ];

  const results: ScoredArticle[] = [];
  for (const query of queries) {
    try {
      const resp = await Feedly.searchContents(
        { query, source: GLOBAL_SOURCE, count: Math.ceil(count / queries.length), sortBy: "newest" },
        CONSUMER,
      );
      for (const article of resp.items || []) {
        results.push(scoreArticle(article, "github"));
      }
    } catch (e: any) {
      if (e.name === "RateLimitError") break;
      console.error(`[landscape] GitHub search failed for "${query}": ${e.message}`);
    }
  }

  return dedup(results).sort((a, b) => b.score - a.score);
}

/** Claude Code creators: community content, tutorials, insights */
export async function creatorsScan(count = 15): Promise<ScoredArticle[]> {
  const query = "Claude Code tutorial OR Claude Code tips OR Claude Code hooks OR Claude Code MCP";

  try {
    const resp = await Feedly.searchContents(
      { query, source: GLOBAL_SOURCE, count, sortBy: "newest" },
      CONSUMER,
    );
    return (resp.items || [])
      .map(a => scoreArticle(a, "creators"))
      .sort((a, b) => b.score - a.score);
  } catch (e: any) {
    console.error(`[landscape] Creators search failed: ${e.message}`);
    return [];
  }
}

/** Full daily landscape scan — orchestrates all categories */
export async function dailyLandscapeScan(): Promise<{
  date: string;
  agentNews: ScoredArticle[];
  github: ScoredArticle[];
  creators: ScoredArticle[];
  alerts: ScoredArticle[];
  summary: {
    totalArticles: number;
    critical: number;
    high: number;
    medium: number;
    apiCallsUsed: number;
  };
}> {
  const date = new Date().toISOString().slice(0, 10);

  const [agentNews, github, creators] = await Promise.all([
    agentEcosystemScan(20),
    githubEcosystemScan(15),
    creatorsScan(15),
  ]);

  const all = [...agentNews, ...github, ...creators];
  const alerts = all.filter(a => a.priority === "CRITICAL" || a.priority === "HIGH");

  return {
    date,
    agentNews,
    github,
    creators,
    alerts,
    summary: {
      totalArticles: all.length,
      critical: all.filter(a => a.priority === "CRITICAL").length,
      high: all.filter(a => a.priority === "HIGH").length,
      medium: all.filter(a => a.priority === "MEDIUM").length,
      apiCallsUsed: 6, // 3 agent + 2 github + 1 creators
    },
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatScanMarkdown(scan: Awaited<ReturnType<typeof dailyLandscapeScan>>): string {
  const lines: string[] = [];

  lines.push(`# Landscape Scan — ${scan.date}`);
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Source:** Feedly Enterprise API (LandscapeFacade)`);
  lines.push(`**API calls:** ${scan.summary.apiCallsUsed}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- **Total articles:** ${scan.summary.totalArticles}`);
  lines.push(`- **Critical:** ${scan.summary.critical}`);
  lines.push(`- **High:** ${scan.summary.high}`);
  lines.push(`- **Medium:** ${scan.summary.medium}`);
  lines.push("");

  if (scan.alerts.length > 0) {
    lines.push(`## Alerts`);
    lines.push("");
    for (const a of scan.alerts) {
      const age = Math.round((Date.now() - a.article.published) / (1000 * 60 * 60));
      const source = a.article.origin?.title || "unknown";
      lines.push(`- **[${a.priority}]** ${a.article.title}`);
      lines.push(`  - Source: ${source} | ${age}h ago | Score: ${a.score}`);
      lines.push(`  - Keywords: ${a.matchedKeywords.join(", ")}`);
      if (a.article.origin?.htmlUrl) {
        lines.push(`  - URL: ${a.article.origin.htmlUrl}`);
      }
      lines.push("");
    }
  }

  const sections: [string, ScoredArticle[]][] = [
    ["Agent Ecosystem", scan.agentNews],
    ["GitHub / Frameworks", scan.github],
    ["Claude Code Creators", scan.creators],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`## ${title}`);
    lines.push("");
    for (const a of items.slice(0, 10)) {
      const age = Math.round((Date.now() - a.article.published) / (1000 * 60 * 60));
      const source = a.article.origin?.title || "unknown";
      lines.push(`- **[${a.priority}]** ${a.article.title}`);
      lines.push(`  - ${source} | ${age}h ago | Score: ${a.score}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by LandscapeFacade.ts — zero LLM cost*");
  return lines.join("\n");
}

function writeAlertFiles(alerts: ScoredArticle[]): number {
  if (alerts.length === 0) return 0;
  mkdirSync(ALERT_DIR, { recursive: true });
  let written = 0;

  for (const a of alerts.filter(x => x.priority === "CRITICAL")) {
    const slug = (a.article.title || "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
    const path = join(ALERT_DIR, `${slug}.yaml`);
    if (existsSync(path)) continue; // Don't overwrite existing alerts

    const yaml = [
      `title: "${(a.article.title || "").replace(/"/g, '\\"')}"`,
      `priority: ${a.priority}`,
      `score: ${a.score}`,
      `source: "${a.article.origin?.title || "unknown"}"`,
      `url: "${a.article.origin?.htmlUrl || ""}"`,
      `detected: "${new Date().toISOString()}"`,
      `keywords: [${a.matchedKeywords.map(k => `"${k}"`).join(", ")}]`,
      `category: ${a.category}`,
      `status: new`,
    ].join("\n");

    writeFileSync(path, yaml);
    written++;
  }

  return written;
}

// ============================================================================
// Helpers
// ============================================================================

function dedup(articles: ScoredArticle[]): ScoredArticle[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    const key = a.article.id || a.article.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const cmd = process.argv[2];
  const count = parseInt(process.argv[3]) || undefined;

  switch (cmd) {
    case "agent-news": {
      const results = await agentEcosystemScan(count);
      console.log(JSON.stringify(results.map(r => ({
        title: r.article.title,
        source: r.article.origin?.title,
        priority: r.priority,
        score: r.score,
        keywords: r.matchedKeywords,
        published: new Date(r.article.published).toISOString(),
      })), null, 2));
      break;
    }

    case "github": {
      const results = await githubEcosystemScan(count);
      console.log(JSON.stringify(results.map(r => ({
        title: r.article.title,
        source: r.article.origin?.title,
        priority: r.priority,
        score: r.score,
        keywords: r.matchedKeywords,
        published: new Date(r.article.published).toISOString(),
      })), null, 2));
      break;
    }

    case "creators": {
      const results = await creatorsScan(count);
      console.log(JSON.stringify(results.map(r => ({
        title: r.article.title,
        source: r.article.origin?.title,
        priority: r.priority,
        score: r.score,
        published: new Date(r.article.published).toISOString(),
      })), null, 2));
      break;
    }

    case "daily-scan": {
      mkdirSync(SCAN_DIR, { recursive: true });
      const scan = await dailyLandscapeScan();
      const md = formatScanMarkdown(scan);
      const today = new Date().toISOString().slice(0, 10);
      const scanPath = join(SCAN_DIR, `${today}-auto.md`);
      writeFileSync(scanPath, md);

      // Write CRITICAL alerts as individual files
      const alertCount = writeAlertFiles(scan.alerts);

      // JSON output for cron job consumption
      console.log(JSON.stringify({
        scanPath,
        alertCount,
        summary: scan.summary,
      }));
      break;
    }

    case "status": {
      console.log(RateBudget.formatStatus());
      break;
    }

    default:
      console.log(`LandscapeFacade.ts — AI Landscape Monitoring via Feedly Enterprise

Usage:
  bun LandscapeFacade.ts agent-news [count]     AI agent ecosystem news
  bun LandscapeFacade.ts github [count]          GitHub repo/framework releases
  bun LandscapeFacade.ts creators [count]        Claude Code creator content
  bun LandscapeFacade.ts daily-scan              Full landscape scan (all categories)
  bun LandscapeFacade.ts status                  Rate budget status

Consumer: landscape (300 calls/day budget)
Categories covered: agent-news, github, claude-code-creators
Note: Security feeds covered by CyberOpsFacade + SECUpdates
`);
  }
}

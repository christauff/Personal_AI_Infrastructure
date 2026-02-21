#!/usr/bin/env bun
/**
 * EngagementTracker.ts — X account metrics and reporting
 *
 * Tracks post performance, follower growth, and generates reports.
 * Supports Apify-based scraping of @DCWebGuy's own tweets for automated
 * metric collection (no manual entry needed).
 *
 * Usage:
 *   bun EngagementTracker.ts scrape-own              # Scrape DCWebGuy metrics via Apify
 *   bun EngagementTracker.ts log <json>              # Log engagement data manually
 *   bun EngagementTracker.ts report                  # Generate performance report
 *   bun EngagementTracker.ts report --weekly          # Weekly summary
 *   bun EngagementTracker.ts report --monthly         # Monthly summary
 *   bun EngagementTracker.ts revenue                  # Revenue tracking report
 *   bun EngagementTracker.ts --help
 *
 * @author PAI System
 * @version 2.0.0
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Apify } from "/home/christauff/.claude/skills/Apify/index";

// ============================================================================
// Configuration
// ============================================================================

const PAI_DIR = join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "TwitterBot");
const DATA_DIR = join(SKILL_DIR, "Data");
const METRICS_FILE = join(DATA_DIR, "engagement-metrics.jsonl");
const REVENUE_FILE = join(DATA_DIR, "revenue-tracking.jsonl");
const POST_HISTORY = join(DATA_DIR, "post-history.jsonl");
const ENV_FILE = join(PAI_DIR, ".env");
const DCWEBGUY_HANDLE = "DCWebGuy";

// ============================================================================
// Env Loading
// ============================================================================

function loadEnv(): void {
  if (!existsSync(ENV_FILE)) return;
  const text = readFileSync(ENV_FILE, "utf-8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
}

// ============================================================================
// Types
// ============================================================================

interface EngagementEntry {
  timestamp: string;
  tweetId?: string;
  tweetText?: string;
  pillar?: string;
  impressions?: number;
  likes?: number;
  retweets?: number;
  replies?: number;
  clicks?: number;
  profileVisits?: number;
  followers?: number;
  followersGained?: number;
  followersLost?: number;
  source: "manual" | "api" | "analytics-export" | "apify";
}

interface RevenueEntry {
  timestamp: string;
  source: "beehiiv-boosts" | "newsletter-sponsor" | "x-subscriptions" | "x-ad-revenue" | "consulting" | "digital-products";
  amount: number;
  currency: "USD";
  description: string;
  recurring: boolean;
}

interface PerformanceReport {
  period: string;
  startDate: string;
  endDate: string;
  posts: number;
  totalImpressions: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  avgImpressions: number;
  avgEngagementRate: number;
  followerGrowth: number;
  currentFollowers: number;
  topPosts: Array<{ tweetId: string; impressions: number; content: string }>;
  revenue: {
    total: number;
    bySource: Record<string, number>;
  };
}

// ============================================================================
// Data Access
// ============================================================================

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMetrics(): EngagementEntry[] {
  if (!existsSync(METRICS_FILE)) return [];
  return readFileSync(METRICS_FILE, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function readRevenue(): RevenueEntry[] {
  if (!existsSync(REVENUE_FILE)) return [];
  return readFileSync(REVENUE_FILE, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function readPostHistory(): Array<{ content: string; tweetId?: string; timestamp: string }> {
  if (!existsSync(POST_HISTORY)) return [];
  return readFileSync(POST_HISTORY, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

// ============================================================================
// Apify Scraping — DCWebGuy's Own Metrics
// ============================================================================

async function scrapeOwnMetrics(): Promise<void> {
  console.log(`\nScraping @${DCWEBGUY_HANDLE} metrics via Apify...`);

  const apify = new Apify();

  try {
    const run = await apify.callActor("apidojo/twitter-scraper-lite", {
      twitterHandles: [DCWEBGUY_HANDLE],
      maxItems: 100,
    }, { timeout: 300 });

    console.log(`  Run started: ${run.id}`);
    await apify.waitForRun(run.id);

    const finalRun = await apify.getRun(run.id);
    if (finalRun.status !== "SUCCEEDED") {
      console.error(`  Scrape FAILED: ${finalRun.status}`);
      process.exit(1);
    }

    const dataset = apify.getDataset(finalRun.defaultDatasetId);
    const items = await dataset.listItems({ limit: 100 });

    console.log(`  Raw items retrieved: ${items.length}`);

    // Extract profile info for follower count
    const firstItem = items[0];
    const author = firstItem?.author || firstItem || {};
    const followersCount = author.followers || author.followersCount || null;

    // Filter to non-RT, non-reply posts
    const ownPosts = items.filter((item: any) => {
      const isRetweet =
        item.isRetweet ||
        !!item.retweetedTweet ||
        (item.text || "").startsWith("RT @");
      const isReply =
        item.isReply || !!item.inReplyToId || !!item.in_reply_to_status_id;
      return !isRetweet && !isReply;
    });

    console.log(`  Own posts (no RT/reply): ${ownPosts.length}`);

    ensureDataDir();

    // Log per-tweet metrics
    let newEntries = 0;
    const existingMetrics = readMetrics();
    const existingTweetIds = new Set(
      existingMetrics.filter(m => m.tweetId).map(m => m.tweetId)
    );

    for (const item of ownPosts) {
      const tweetId = String(item.id || item.tweetId || item.id_str || "");
      if (!tweetId || existingTweetIds.has(tweetId)) continue;

      const text = item.text || item.full_text || item.fullText || "";

      const entry: EngagementEntry = {
        timestamp: item.createdAt || item.created_at || new Date().toISOString(),
        tweetId,
        tweetText: text.slice(0, 200),
        impressions: item.viewCount || item.views || item.view_count || 0,
        likes: item.likeCount || item.likes || item.favorite_count || 0,
        retweets: item.retweetCount || item.retweets || item.retweet_count || 0,
        replies: item.replyCount || item.replies || item.reply_count || 0,
        source: "apify",
      };

      appendFileSync(METRICS_FILE, JSON.stringify(entry) + "\n");
      newEntries++;
    }

    // Log aggregate follower snapshot
    if (followersCount) {
      const followerEntry: EngagementEntry = {
        timestamp: new Date().toISOString(),
        followers: followersCount,
        source: "apify",
      };
      appendFileSync(METRICS_FILE, JSON.stringify(followerEntry) + "\n");
    }

    console.log(`\n  Results:`);
    console.log(`    New tweet metrics logged: ${newEntries}`);
    console.log(`    Followers: ${followersCount?.toLocaleString() || "N/A"}`);
    console.log(`    Total own posts found: ${ownPosts.length}`);
    console.log(`    Data saved to: ${METRICS_FILE}`);

    // Show top 3 by engagement
    const sorted = ownPosts
      .map((item: any) => ({
        text: (item.text || item.full_text || "").slice(0, 80),
        views: item.viewCount || item.views || 0,
        likes: item.likeCount || item.likes || 0,
        replies: item.replyCount || item.replies || 0,
      }))
      .sort((a: any, b: any) => (b.views + b.likes * 100) - (a.views + a.likes * 100));

    if (sorted.length > 0) {
      console.log(`\n  Top 3 posts by engagement:`);
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const p = sorted[i];
        console.log(
          `    ${i + 1}. "${p.text}..." (${p.views}v, ${p.likes}l, ${p.replies}r)`
        );
      }
    }
  } catch (error: any) {
    console.error(`  ERROR: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(period: "weekly" | "monthly" | "all"): PerformanceReport {
  const metrics = readMetrics();
  const revenue = readRevenue();
  const posts = readPostHistory();

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(0);
  }

  // Filter to period
  const periodMetrics = metrics.filter(m => new Date(m.timestamp) >= startDate);
  const periodRevenue = revenue.filter(r => new Date(r.timestamp) >= startDate);
  const periodPosts = posts.filter(p => new Date(p.timestamp) >= startDate);

  // For Apify-sourced metrics, use per-tweet data
  const tweetMetrics = periodMetrics.filter(m => m.tweetId);
  const aggregateMetrics = periodMetrics.filter(m => !m.tweetId && m.impressions);

  // Aggregate metrics (prefer per-tweet when available)
  const totalImpressions = tweetMetrics.length > 0
    ? tweetMetrics.reduce((s, m) => s + (m.impressions || 0), 0)
    : aggregateMetrics.reduce((s, m) => s + (m.impressions || 0), 0);
  const totalLikes = tweetMetrics.length > 0
    ? tweetMetrics.reduce((s, m) => s + (m.likes || 0), 0)
    : aggregateMetrics.reduce((s, m) => s + (m.likes || 0), 0);
  const totalRetweets = tweetMetrics.length > 0
    ? tweetMetrics.reduce((s, m) => s + (m.retweets || 0), 0)
    : aggregateMetrics.reduce((s, m) => s + (m.retweets || 0), 0);
  const totalReplies = tweetMetrics.length > 0
    ? tweetMetrics.reduce((s, m) => s + (m.replies || 0), 0)
    : aggregateMetrics.reduce((s, m) => s + (m.replies || 0), 0);

  const postCount = tweetMetrics.length > 0 ? tweetMetrics.length : periodPosts.length;
  const avgImpressions = postCount > 0 ? Math.round(totalImpressions / postCount) : 0;
  const avgEngagement = totalImpressions > 0
    ? ((totalLikes + totalRetweets + totalReplies) / totalImpressions) * 100
    : 0;

  // Follower tracking
  const latestFollowers = periodMetrics
    .filter(m => m.followers !== undefined)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const currentFollowers = latestFollowers[0]?.followers || 0;
  const followerGrowth = periodMetrics.reduce((s, m) => s + (m.followersGained || 0) - (m.followersLost || 0), 0);

  // Revenue
  const totalRevenueAmount = periodRevenue.reduce((s, r) => s + r.amount, 0);
  const revenueBySource: Record<string, number> = {};
  for (const r of periodRevenue) {
    revenueBySource[r.source] = (revenueBySource[r.source] || 0) + r.amount;
  }

  // Top posts — prefer Apify per-tweet data, fall back to manual
  let topPosts: Array<{ tweetId: string; impressions: number; content: string }>;

  if (tweetMetrics.length > 0) {
    topPosts = [...tweetMetrics]
      .sort((a, b) => ((b.impressions || 0) + (b.likes || 0) * 100) - ((a.impressions || 0) + (a.likes || 0) * 100))
      .slice(0, 5)
      .map(m => ({
        tweetId: m.tweetId!,
        impressions: m.impressions || 0,
        content: m.tweetText || posts.find(p => p.tweetId === m.tweetId)?.content?.slice(0, 80) || "Unknown",
      }));
  } else {
    const postMetrics = periodMetrics
      .filter(m => m.tweetId && m.impressions)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 5);

    topPosts = postMetrics.map(m => {
      const post = posts.find(p => p.tweetId === m.tweetId);
      return {
        tweetId: m.tweetId!,
        impressions: m.impressions || 0,
        content: post?.content?.slice(0, 80) || "Unknown",
      };
    });
  }

  return {
    period,
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    posts: postCount,
    totalImpressions,
    totalLikes,
    totalRetweets,
    totalReplies,
    avgImpressions,
    avgEngagementRate: Math.round(avgEngagement * 100) / 100,
    followerGrowth,
    currentFollowers,
    topPosts,
    revenue: {
      total: totalRevenueAmount,
      bySource: revenueBySource,
    },
  };
}

// ============================================================================
// Revenue Report
// ============================================================================

function generateRevenueReport(): void {
  const revenue = readRevenue();

  if (revenue.length === 0) {
    console.log("\nNo revenue data recorded yet.");
    console.log("\nRevenue streams to track:");
    console.log("  - beehiiv Boosts (Day 1)");
    console.log("  - Newsletter sponsorships (Month 3+)");
    console.log("  - X Subscriptions (Month 3+)");
    console.log("  - X Ad Revenue (Month 6+)");
    console.log("  - Consulting leads (Month 3+)");
    console.log("  - Digital products (Month 6+)");
    console.log("\nLog revenue: bun EngagementTracker.ts log-revenue '{\"source\":\"beehiiv-boosts\",\"amount\":2.50,\"description\":\"New subscriber boost\"}'");
    return;
  }

  const monthlyTotals: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const entry of revenue) {
    const month = entry.timestamp.slice(0, 7); // YYYY-MM
    monthlyTotals[month] = (monthlyTotals[month] || 0) + entry.amount;
    bySource[entry.source] = (bySource[entry.source] || 0) + entry.amount;
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const monthlyCost = 8; // X Premium
  const selfSustainTarget = 500;

  console.log("\nRevenue Report");
  console.log("\u2500".repeat(60));
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`Monthly Cost: $${monthlyCost}/mo (X Premium)`);
  console.log(`Self-Sustaining Target: $${selfSustainTarget}/mo`);
  console.log(`Progress: ${Math.round((totalRevenue / selfSustainTarget) * 100)}%`);
  console.log();

  console.log("By Source:");
  for (const [source, amount] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(25)} $${amount.toFixed(2)}`);
  }
  console.log();

  console.log("Monthly:");
  for (const [month, amount] of Object.entries(monthlyTotals).sort()) {
    const net = amount - monthlyCost;
    const icon = net >= 0 ? "\u2705" : "\u274C";
    console.log(`  ${month}: $${amount.toFixed(2)} (net: ${icon} $${net.toFixed(2)})`);
  }

  console.log("\u2500".repeat(60));
}

// ============================================================================
// Display
// ============================================================================

function displayReport(report: PerformanceReport): void {
  console.log(`\nPerformance Report (${report.period})`);
  console.log("\u2500".repeat(60));
  console.log(`Period: ${report.startDate.slice(0, 10)} to ${report.endDate.slice(0, 10)}`);
  console.log();

  console.log("Content:");
  console.log(`  Posts tracked: ${report.posts}`);
  console.log();

  console.log("Engagement:");
  console.log(`  Impressions:     ${report.totalImpressions.toLocaleString()} (avg ${report.avgImpressions}/post)`);
  console.log(`  Likes:           ${report.totalLikes.toLocaleString()}`);
  console.log(`  Retweets:        ${report.totalRetweets.toLocaleString()}`);
  console.log(`  Replies:         ${report.totalReplies.toLocaleString()}`);
  console.log(`  Engagement Rate: ${report.avgEngagementRate}%`);
  console.log();

  console.log("Growth:");
  console.log(`  Followers: ${report.currentFollowers.toLocaleString()} (${report.followerGrowth >= 0 ? "+" : ""}${report.followerGrowth})`);
  console.log();

  if (report.topPosts.length > 0) {
    console.log("Top Posts:");
    for (const post of report.topPosts) {
      console.log(`  ${post.impressions.toLocaleString().padStart(8)} imp  ${post.content}...`);
    }
    console.log();
  }

  console.log("Revenue:");
  console.log(`  Total: $${report.revenue.total.toFixed(2)}`);
  for (const [source, amount] of Object.entries(report.revenue.bySource)) {
    console.log(`    ${source}: $${amount.toFixed(2)}`);
  }

  console.log("\u2500".repeat(60));
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`EngagementTracker.ts — X account metrics and reporting

Usage:
  bun EngagementTracker.ts scrape-own                 Scrape @DCWebGuy metrics via Apify
  bun EngagementTracker.ts log '{"impressions":500}'  Log engagement data manually
  bun EngagementTracker.ts log-revenue '{"source":"beehiiv-boosts","amount":2.50,"description":"Subscriber boost"}'
  bun EngagementTracker.ts report                     All-time report
  bun EngagementTracker.ts report --weekly             Last 7 days
  bun EngagementTracker.ts report --monthly            Last 30 days
  bun EngagementTracker.ts revenue                     Revenue breakdown
  bun EngagementTracker.ts --help

Commands:
  scrape-own     Scrape @DCWebGuy tweets via Apify for automated metrics
  log            Log engagement metrics manually (JSON)
  log-revenue    Log revenue entry (JSON)
  report         Generate performance report
  revenue        Revenue tracking and self-sustainability report

Data Sources:
  Primary: Apify apidojo/twitter-scraper-lite (scrape-own command)
  Fallback: Manual logging from X Analytics dashboard

Revenue Sources:
  beehiiv-boosts, newsletter-sponsor, x-subscriptions,
  x-ad-revenue, consulting, digital-products`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  loadEnv();

  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "scrape-own": {
      await scrapeOwnMetrics();
      break;
    }

    case "log": {
      const json = args.slice(1).join(" ");
      if (!json) {
        console.error("Error: Provide metrics as JSON");
        process.exit(1);
      }

      try {
        const data = JSON.parse(json);
        const entry: EngagementEntry = {
          timestamp: new Date().toISOString(),
          source: data.source || "manual",
          ...data,
        };

        ensureDataDir();
        appendFileSync(METRICS_FILE, JSON.stringify(entry) + "\n");
        console.log(`Metrics logged: ${JSON.stringify(entry).slice(0, 100)}...`);
      } catch (err) {
        console.error("Error parsing JSON:", err);
        process.exit(1);
      }
      break;
    }

    case "log-revenue": {
      const json = args.slice(1).join(" ");
      if (!json) {
        console.error("Error: Provide revenue data as JSON");
        process.exit(1);
      }

      try {
        const data = JSON.parse(json);
        const entry: RevenueEntry = {
          timestamp: new Date().toISOString(),
          source: data.source,
          amount: data.amount,
          currency: "USD",
          description: data.description || "",
          recurring: data.recurring || false,
        };

        ensureDataDir();
        appendFileSync(REVENUE_FILE, JSON.stringify(entry) + "\n");
        console.log(`Revenue logged: $${entry.amount} from ${entry.source}`);
      } catch (err) {
        console.error("Error parsing JSON:", err);
        process.exit(1);
      }
      break;
    }

    case "report": {
      let period: "weekly" | "monthly" | "all" = "all";
      if (args.includes("--weekly")) period = "weekly";
      if (args.includes("--monthly")) period = "monthly";

      const report = generateReport(period);
      displayReport(report);
      break;
    }

    case "revenue": {
      generateRevenueReport();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

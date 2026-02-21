#!/usr/bin/env bun
/**
 * CompetitiveIntel.ts — Competitive intelligence for @DCWebGuy
 *
 * Scrapes and analyzes tracked X/Twitter accounts to surface
 * engagement patterns, content strategies, and actionable insights.
 *
 * Uses Apify apidojo/twitter-scraper-lite for data collection.
 *
 * Usage:
 *   bun CompetitiveIntel.ts scrape                    # Scrape all tracked accounts
 *   bun CompetitiveIntel.ts scrape --account handle   # Scrape one account
 *   bun CompetitiveIntel.ts analyze                   # Generate weekly intel report
 *   bun CompetitiveIntel.ts top-performers            # Top 10 tweets this week
 *   bun CompetitiveIntel.ts patterns                  # Cross-account pattern analysis
 *   bun CompetitiveIntel.ts add-account handle        # Add account to track
 *   bun CompetitiveIntel.ts remove-account handle     # Remove account from tracking
 *   bun CompetitiveIntel.ts --help
 *
 * @author PAI System
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Apify } from "/home/christauff/.claude/skills/Apify/index";

// ============================================================================
// Configuration
// ============================================================================

const PAI_DIR = join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "TwitterBot");
const DATA_DIR = join(SKILL_DIR, "Data");
const INTEL_DIR = join(DATA_DIR, "competitive-intel");
const TRACKED_FILE = join(DATA_DIR, "tracked-accounts.yaml");
const SCRAPE_DIR = join(INTEL_DIR, "raw");
const ENV_FILE = join(PAI_DIR, ".env");

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

interface TrackedAccount {
  handle: string;
  domain: string;
  why: string;
  added: string;
}

interface ScrapedTweet {
  text: string;
  date: string;
  likesCount: number;
  retweetsCount: number;
  repliesCount: number;
  viewsCount: number | null;
  hasMedia: boolean;
  mediaType: "image" | "video" | "none";
  isQuoteTweet: boolean;
  isThread: boolean;
  url: string;
  hashtags: string[];
  length: number;
}

interface AccountScrape {
  handle: string;
  domain: string;
  scrapedAt: string;
  followersCount: number | null;
  tweets: ScrapedTweet[];
}

interface WeeklyReport {
  date: string;
  generatedAt: string;
  accountsAnalyzed: number;
  topTweets: Array<{
    handle: string;
    text: string;
    views: number;
    likes: number;
    replies: number;
    retweets: number;
    url: string;
    format: string;
  }>;
  patterns: string[];
  insights: string[];
  recommendations: string[];
}

// ============================================================================
// YAML Parsing (simple — tracked-accounts.yaml is straightforward)
// ============================================================================

function parseTrackedAccounts(): TrackedAccount[] {
  if (!existsSync(TRACKED_FILE)) {
    console.error("No tracked-accounts.yaml found at", TRACKED_FILE);
    process.exit(1);
  }

  const text = readFileSync(TRACKED_FILE, "utf-8");
  const accounts: TrackedAccount[] = [];
  let currentAccount: Partial<TrackedAccount> | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("- handle:")) {
      if (currentAccount?.handle) {
        accounts.push(currentAccount as TrackedAccount);
      }
      currentAccount = { handle: trimmed.replace("- handle:", "").trim() };
    } else if (currentAccount && trimmed.startsWith("domain:")) {
      currentAccount.domain = trimmed.replace("domain:", "").trim();
    } else if (currentAccount && trimmed.startsWith("why:")) {
      currentAccount.why = trimmed.replace("why:", "").trim();
    } else if (currentAccount && trimmed.startsWith("added:")) {
      currentAccount.added = trimmed.replace("added:", "").trim();
    }
  }

  if (currentAccount?.handle) {
    accounts.push(currentAccount as TrackedAccount);
  }

  return accounts;
}

// ============================================================================
// Scraping
// ============================================================================

async function scrapeAccount(
  handle: string,
  tweetCount: number = 50
): Promise<AccountScrape | null> {
  console.log(`  Scraping @${handle}...`);

  const apify = new Apify();

  try {
    const run = await apify.callActor("apidojo/twitter-scraper-lite", {
      twitterHandles: [handle],
      maxItems: tweetCount,
    }, { timeout: 300 });

    console.log(`    Run started: ${run.id}`);
    await apify.waitForRun(run.id);

    const finalRun = await apify.getRun(run.id);
    if (finalRun.status !== "SUCCEEDED") {
      console.error(`    FAILED for @${handle}: ${finalRun.status}`);
      return null;
    }

    const dataset = apify.getDataset(finalRun.defaultDatasetId);
    const items = await dataset.listItems({ limit: tweetCount });

    console.log(`    Raw items: ${items.length}`);

    // Extract profile info
    const firstItem = items[0];
    const author = firstItem?.author || firstItem || {};

    // Filter to original tweets + QTs (no retweets, no replies)
    const originalTweets = items.filter((item: any) => {
      const isRetweet =
        item.isRetweet ||
        !!item.retweetedTweet ||
        (item.text || "").startsWith("RT @");
      const isReply =
        item.isReply || !!item.inReplyToId || !!item.in_reply_to_status_id;
      return !isRetweet && !isReply;
    });

    console.log(`    Original tweets: ${originalTweets.length}`);

    const tweets: ScrapedTweet[] = originalTweets.map((item: any) => {
      const text = item.text || item.full_text || item.fullText || "";
      const hasImages = !!(
        (item.media?.some?.((m: any) => m.type === "photo" || m.type === "image")) ||
        (item.photos && item.photos.length > 0) ||
        (item.entities?.media?.some?.((m: any) => m.type === "photo"))
      );
      const hasVideo = !!(
        (item.media?.some?.((m: any) => m.type === "video" || m.type === "animated_gif")) ||
        item.video?.url ||
        item.videoUrl
      );
      const isQuote = item.isQuote || !!item.quotedTweet;
      const conversationId = item.conversationId || item.conversation_id_str;
      const tweetId = item.id || item.tweetId || item.id_str;
      const isThread =
        conversationId &&
        tweetId &&
        String(conversationId) === String(tweetId) &&
        (item.replyCount || item.replies || 0) > 0;

      const authorName =
        item.author?.userName || item.authorUsername || item.username || handle;
      const tweetUrl =
        item.url ||
        item.tweetUrl ||
        (authorName && tweetId
          ? `https://x.com/${authorName}/status/${tweetId}`
          : "");

      return {
        text,
        date: item.createdAt || item.created_at || item.timestamp || "",
        likesCount: item.likeCount || item.likes || item.favorite_count || 0,
        retweetsCount:
          item.retweetCount || item.retweets || item.retweet_count || 0,
        repliesCount: item.replyCount || item.replies || item.reply_count || 0,
        viewsCount: item.viewCount || item.views || item.view_count || null,
        hasMedia: hasImages || hasVideo,
        mediaType: hasVideo
          ? ("video" as const)
          : hasImages
          ? ("image" as const)
          : ("none" as const),
        isQuoteTweet: isQuote,
        isThread: !!isThread,
        url: tweetUrl,
        hashtags: item.hashtags || extractHashtags(text),
        length: text.length,
      };
    });

    return {
      handle,
      domain: "",
      scrapedAt: new Date().toISOString(),
      followersCount:
        author.followers || author.followersCount || author.followersCount || null,
      tweets,
    };
  } catch (error: any) {
    console.error(`    ERROR for @${handle}: ${error.message}`);
    return null;
  }
}

function extractHashtags(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(/#\w+/g);
  return matches ? matches.map((h) => h.slice(1)) : [];
}

async function scrapeAll(
  specificAccount?: string
): Promise<AccountScrape[]> {
  const accounts = parseTrackedAccounts();
  const targets = specificAccount
    ? accounts.filter(
        (a) => a.handle.toLowerCase() === specificAccount.toLowerCase()
      )
    : accounts;

  if (targets.length === 0) {
    console.error(
      specificAccount
        ? `Account @${specificAccount} not found in tracked accounts.`
        : "No tracked accounts found."
    );
    process.exit(1);
  }

  console.log(`\nScraping ${targets.length} account(s)...`);

  const results: AccountScrape[] = [];

  for (const account of targets) {
    const result = await scrapeAccount(account.handle);
    if (result) {
      result.domain = account.domain;
      results.push(result);
    }
    // Small delay between accounts
    if (targets.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Save raw scrape data
  ensureDir(SCRAPE_DIR);
  const dateStr = new Date().toISOString().slice(0, 10);
  const scrapePath = join(SCRAPE_DIR, `scrape-${dateStr}.json`);
  writeFileSync(scrapePath, JSON.stringify(results, null, 2));
  console.log(`\nRaw data saved: ${scrapePath}`);
  console.log(
    `Accounts scraped: ${results.length}/${targets.length}`
  );
  console.log(
    `Total tweets collected: ${results.reduce(
      (s, r) => s + r.tweets.length,
      0
    )}`
  );

  return results;
}

// ============================================================================
// Analysis
// ============================================================================

function getLatestScrape(): AccountScrape[] | null {
  ensureDir(SCRAPE_DIR);
  const files = require("fs")
    .readdirSync(SCRAPE_DIR)
    .filter((f: string) => f.startsWith("scrape-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("No scrape data found. Run 'scrape' first.");
    return null;
  }

  const latest = join(SCRAPE_DIR, files[0]);
  console.log(`Using scrape data: ${files[0]}`);
  return JSON.parse(readFileSync(latest, "utf-8"));
}

function analyzeTopPerformers(
  scrapes: AccountScrape[]
): WeeklyReport["topTweets"] {
  const allTweets: Array<ScrapedTweet & { handle: string }> = [];

  for (const scrape of scrapes) {
    for (const tweet of scrape.tweets) {
      allTweets.push({ ...tweet, handle: scrape.handle });
    }
  }

  // Sort by engagement (views if available, else likes + retweets + replies)
  allTweets.sort((a, b) => {
    const scoreA =
      (a.viewsCount || 0) + (a.likesCount + a.retweetsCount + a.repliesCount) * 100;
    const scoreB =
      (b.viewsCount || 0) + (b.likesCount + b.retweetsCount + b.repliesCount) * 100;
    return scoreB - scoreA;
  });

  return allTweets.slice(0, 10).map((t) => ({
    handle: t.handle,
    text: t.text.slice(0, 200),
    views: t.viewsCount || 0,
    likes: t.likesCount,
    replies: t.repliesCount,
    retweets: t.retweetsCount,
    url: t.url,
    format: t.isThread
      ? "thread"
      : t.isQuoteTweet
      ? "quote-tweet"
      : t.hasMedia
      ? `original+${t.mediaType}`
      : "original",
  }));
}

function analyzePatterns(scrapes: AccountScrape[]): string[] {
  const patterns: string[] = [];

  // Aggregate stats across all accounts
  let totalTweets = 0;
  let withMedia = 0;
  let withHashtags = 0;
  let quotesTweets = 0;
  let threads = 0;
  let totalLength = 0;
  let shortTweets = 0; // ≤ 50 chars
  let longTweets = 0; // > 200 chars

  for (const scrape of scrapes) {
    for (const tweet of scrape.tweets) {
      totalTweets++;
      if (tweet.hasMedia) withMedia++;
      if (tweet.hashtags.length > 0) withHashtags++;
      if (tweet.isQuoteTweet) quotesTweets++;
      if (tweet.isThread) threads++;
      totalLength += tweet.length;
      if (tweet.length <= 50) shortTweets++;
      if (tweet.length > 200) longTweets++;
    }
  }

  if (totalTweets === 0) return ["No tweets to analyze."];

  const mediaRate = Math.round((withMedia / totalTweets) * 100);
  const hashtagRate = Math.round((withHashtags / totalTweets) * 100);
  const qtRate = Math.round((quotesTweets / totalTweets) * 100);
  const threadRate = Math.round((threads / totalTweets) * 100);
  const avgLength = Math.round(totalLength / totalTweets);
  const shortRate = Math.round((shortTweets / totalTweets) * 100);
  const longRate = Math.round((longTweets / totalTweets) * 100);

  patterns.push(
    `Media usage: ${mediaRate}% of tweets include images/video`
  );
  patterns.push(
    `Hashtag usage: ${hashtagRate}% (${
      hashtagRate < 10 ? "confirms zero-hashtag trend" : "some accounts still use them"
    })`
  );
  patterns.push(`Quote tweets: ${qtRate}% of content`);
  patterns.push(`Threads: ${threadRate}% of content`);
  patterns.push(
    `Length: avg ${avgLength} chars (${shortRate}% short ≤50, ${longRate}% long >200)`
  );

  // Per-account top performer analysis
  for (const scrape of scrapes) {
    if (scrape.tweets.length === 0) continue;

    const topTweet = [...scrape.tweets].sort((a, b) => {
      const sa = (a.viewsCount || 0) + (a.likesCount + a.retweetsCount + a.repliesCount) * 100;
      const sb = (b.viewsCount || 0) + (b.likesCount + b.retweetsCount + b.repliesCount) * 100;
      return sb - sa;
    })[0];

    if (topTweet) {
      const format = topTweet.isThread
        ? "thread"
        : topTweet.isQuoteTweet
        ? "QT"
        : topTweet.hasMedia
        ? `original+${topTweet.mediaType}`
        : "text-only";
      patterns.push(
        `@${scrape.handle} top: ${format}, ${topTweet.viewsCount || "?"}v, ${
          topTweet.likesCount
        }l — "${topTweet.text.slice(0, 80)}..."`
      );
    }
  }

  return patterns;
}

async function generateReport(scrapes: AccountScrape[]): Promise<void> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const topTweets = analyzeTopPerformers(scrapes);
  const patterns = analyzePatterns(scrapes);

  // Generate insights and recommendations
  const insights: string[] = [];
  const recommendations: string[] = [];

  // Check format distribution of top performers
  const topFormats = topTweets.map((t) => t.format);
  const threadCount = topFormats.filter((f) => f === "thread").length;
  const mediaCount = topFormats.filter((f) => f.includes("image") || f.includes("video")).length;

  if (threadCount >= 3) {
    insights.push(
      "Threads dominate top performers this week — long-form analysis is working"
    );
    recommendations.push("Prioritize a deep thread this week on your strongest topic");
  }

  if (mediaCount >= 4) {
    insights.push(
      "Visual content (screenshots, images) appears in most top performers"
    );
    recommendations.push(
      "Include screenshots or data visualizations in your next show-work post"
    );
  }

  // Check if any topic/domain is consistently performing
  const domainCounts: Record<string, number> = {};
  for (const scrape of scrapes) {
    if (scrape.tweets.length > 0) {
      domainCounts[scrape.domain] = (domainCounts[scrape.domain] || 0) + 1;
    }
  }

  // Build markdown report
  let report = `# Competitive Intelligence Report — ${dateStr}\n\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Accounts analyzed: ${scrapes.length}\n`;
  report += `Total tweets analyzed: ${scrapes.reduce(
    (s, r) => s + r.tweets.length,
    0
  )}\n\n`;

  report += `## Top 10 Tweets Across Tracked Accounts\n\n`;
  for (let i = 0; i < topTweets.length; i++) {
    const t = topTweets[i];
    report += `### ${i + 1}. @${t.handle} (${t.format})\n`;
    report += `> ${t.text}\n\n`;
    report += `Views: ${t.views.toLocaleString()} | Likes: ${t.likes} | Replies: ${t.replies} | RTs: ${t.retweets}\n`;
    report += `${t.url}\n\n`;
  }

  report += `## Cross-Account Patterns\n\n`;
  for (const pattern of patterns) {
    report += `- ${pattern}\n`;
  }
  report += "\n";

  if (insights.length > 0) {
    report += `## Insights\n\n`;
    for (const insight of insights) {
      report += `- ${insight}\n`;
    }
    report += "\n";
  }

  if (recommendations.length > 0) {
    report += `## Recommendations for @DCWebGuy\n\n`;
    for (const rec of recommendations) {
      report += `- ${rec}\n`;
    }
    report += "\n";
  }

  report += `## Account Snapshots\n\n`;
  for (const scrape of scrapes) {
    report += `### @${scrape.handle} (${scrape.domain})\n`;
    report += `- Followers: ${
      scrape.followersCount?.toLocaleString() || "N/A"
    }\n`;
    report += `- Tweets analyzed: ${scrape.tweets.length}\n`;
    const avgLikes =
      scrape.tweets.length > 0
        ? Math.round(
            scrape.tweets.reduce((s, t) => s + t.likesCount, 0) /
              scrape.tweets.length
          )
        : 0;
    const avgViews =
      scrape.tweets.length > 0
        ? Math.round(
            scrape.tweets.reduce((s, t) => s + (t.viewsCount || 0), 0) /
              scrape.tweets.length
          )
        : 0;
    report += `- Avg likes: ${avgLikes} | Avg views: ${avgViews.toLocaleString()}\n`;
    const mediaRate =
      scrape.tweets.length > 0
        ? Math.round(
            (scrape.tweets.filter((t) => t.hasMedia).length /
              scrape.tweets.length) *
              100
          )
        : 0;
    report += `- Media rate: ${mediaRate}%\n\n`;
  }

  // Save report
  ensureDir(INTEL_DIR);
  const reportPath = join(INTEL_DIR, `weekly-${dateStr}.md`);
  writeFileSync(reportPath, report);
  console.log(`\nReport saved: ${reportPath}`);

  // Also print summary to console
  console.log("\n" + "=".repeat(60));
  console.log(`COMPETITIVE INTEL SUMMARY — ${dateStr}`);
  console.log("=".repeat(60));

  console.log("\nTop 3 tweets:");
  for (let i = 0; i < Math.min(3, topTweets.length); i++) {
    const t = topTweets[i];
    console.log(
      `  ${i + 1}. @${t.handle}: "${t.text.slice(0, 80)}..." (${
        t.views
      }v, ${t.likes}l)`
    );
  }

  if (patterns.length > 0) {
    console.log("\nKey patterns:");
    for (const p of patterns.slice(0, 5)) {
      console.log(`  - ${p}`);
    }
  }

  if (recommendations.length > 0) {
    console.log("\nRecommendations:");
    for (const r of recommendations) {
      console.log(`  - ${r}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

// ============================================================================
// Account Management
// ============================================================================

function addAccount(handle: string): void {
  const clean = handle.replace("@", "");
  const text = readFileSync(TRACKED_FILE, "utf-8");

  // Check if already tracked
  if (text.includes(`handle: ${clean}`)) {
    console.log(`@${clean} is already being tracked.`);
    return;
  }

  // Insert before scrape_config section
  const insertPoint = text.indexOf("# Scrape settings");
  if (insertPoint === -1) {
    console.error("Could not find insertion point in tracked-accounts.yaml");
    return;
  }

  const newEntry = `\n  - handle: ${clean}\n    domain: unknown\n    why: Added manually\n    added: ${new Date().toISOString().slice(0, 10)}\n\n`;
  const updated = text.slice(0, insertPoint) + newEntry + text.slice(insertPoint);
  writeFileSync(TRACKED_FILE, updated);
  console.log(`Added @${clean} to tracked accounts.`);
  console.log("Edit tracked-accounts.yaml to set domain and why fields.");
}

function removeAccount(handle: string): void {
  const clean = handle.replace("@", "");
  const text = readFileSync(TRACKED_FILE, "utf-8");

  if (!text.includes(`handle: ${clean}`)) {
    console.log(`@${clean} is not being tracked.`);
    return;
  }

  // Remove the account block (handle + domain + why + added lines)
  const lines = text.split("\n");
  const filtered: string[] = [];
  let skipUntilNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === `- handle: ${clean}`) {
      skipUntilNext = true;
      continue;
    }
    if (skipUntilNext) {
      if (
        line.trim().startsWith("- handle:") ||
        line.trim().startsWith("# ") ||
        line.trim() === ""
      ) {
        if (line.trim() !== "") {
          skipUntilNext = false;
          filtered.push(line);
        }
      }
      continue;
    }
    filtered.push(line);
  }

  writeFileSync(TRACKED_FILE, filtered.join("\n"));
  console.log(`Removed @${clean} from tracked accounts.`);
}

// ============================================================================
// Utilities
// ============================================================================

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`CompetitiveIntel.ts — Competitive intelligence for @DCWebGuy

Usage:
  bun CompetitiveIntel.ts scrape                    Scrape all tracked accounts
  bun CompetitiveIntel.ts scrape --account handle   Scrape one account
  bun CompetitiveIntel.ts analyze                   Generate weekly intel report
  bun CompetitiveIntel.ts top-performers            Show top 10 tweets across accounts
  bun CompetitiveIntel.ts patterns                  Cross-account pattern analysis
  bun CompetitiveIntel.ts add-account handle        Add account to track
  bun CompetitiveIntel.ts remove-account handle     Remove account from tracking
  bun CompetitiveIntel.ts --help                    Show this help

Tracked accounts are defined in Data/tracked-accounts.yaml.
Scrape data is stored in Data/competitive-intel/raw/.
Weekly reports are stored in Data/competitive-intel/weekly-{date}.md.

Requires APIFY_API_TOKEN in ~/.claude/.env.`);
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
    case "scrape": {
      const accountIdx = args.indexOf("--account");
      const specificAccount =
        accountIdx !== -1 ? args[accountIdx + 1] : undefined;
      await scrapeAll(specificAccount);
      break;
    }

    case "analyze": {
      const scrapes = getLatestScrape();
      if (!scrapes) process.exit(1);
      await generateReport(scrapes);
      break;
    }

    case "top-performers": {
      const scrapes = getLatestScrape();
      if (!scrapes) process.exit(1);

      const top = analyzeTopPerformers(scrapes);
      console.log("\nTop 10 Tweets Across Tracked Accounts:");
      console.log("─".repeat(60));

      for (let i = 0; i < top.length; i++) {
        const t = top[i];
        console.log(
          `\n${i + 1}. @${t.handle} (${t.format})`
        );
        console.log(`   "${t.text.slice(0, 120)}${t.text.length > 120 ? "..." : ""}"`);
        console.log(
          `   Views: ${t.views.toLocaleString()} | Likes: ${t.likes} | Replies: ${t.replies} | RTs: ${t.retweets}`
        );
        console.log(`   ${t.url}`);
      }

      console.log("\n" + "─".repeat(60));
      break;
    }

    case "patterns": {
      const scrapes = getLatestScrape();
      if (!scrapes) process.exit(1);

      const patterns = analyzePatterns(scrapes);
      console.log("\nCross-Account Content Patterns:");
      console.log("─".repeat(60));

      for (const pattern of patterns) {
        console.log(`  - ${pattern}`);
      }

      console.log("\n" + "─".repeat(60));
      break;
    }

    case "add-account": {
      const handle = args[1];
      if (!handle) {
        console.error("Usage: add-account <handle>");
        process.exit(1);
      }
      addAccount(handle);
      break;
    }

    case "remove-account": {
      const handle = args[1];
      if (!handle) {
        console.error("Usage: remove-account <handle>");
        process.exit(1);
      }
      removeAccount(handle);
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

#!/usr/bin/env bun
/**
 * PostScheduler.ts — X API v2 posting client
 *
 * Handles tweet composition, scheduling, and publishing via X API v2.
 * All content passes through ContentSafety.ts before posting.
 *
 * Usage:
 *   bun PostScheduler.ts post "tweet content"
 *   bun PostScheduler.ts post "link reply" --reply-to TWEET_ID
 *   bun PostScheduler.ts post-thread "tweet1|||tweet2|||tweet3"
 *   bun PostScheduler.ts queue "content" --at "2026-02-14T10:00:00"
 *   bun PostScheduler.ts publish-queue
 *   bun PostScheduler.ts list-queue
 *   bun PostScheduler.ts dry-run "content"
 *   bun PostScheduler.ts --help
 *
 * Environment:
 *   X_API_KEY           — Consumer API Key
 *   X_API_SECRET        — Consumer API Secret
 *   X_ACCESS_TOKEN      — Access Token
 *   X_ACCESS_TOKEN_SECRET — Access Token Secret
 *
 * @author PAI System
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { createHmac, randomBytes } from "crypto";
import { spawnSync } from "child_process";

// ============================================================================
// Configuration
// ============================================================================

const X_API_BASE = "https://api.twitter.com/2";
const PAI_DIR = join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "TwitterBot");
const DATA_DIR = join(SKILL_DIR, "Data");
const QUEUE_FILE = join(DATA_DIR, "content-queue.jsonl");
const HISTORY_FILE = join(DATA_DIR, "post-history.jsonl");
const CONTENT_SAFETY = join(SKILL_DIR, "Tools", "ContentSafety.ts");
const BUDGET_FILE = join(DATA_DIR, "daily-budget.json");

// Rate limiting configuration (from AlgorithmStrategy.md)
const MAX_THREADS_PER_DAY = 2;
const MAX_TWEETS_PER_DAY = 10;
const MIN_THREAD_SPACING_MS = 4 * 60 * 60 * 1000; // 4 hours between threads
const THREAD_TWEET_DELAY_MS = 30_000; // 30s between thread tweets (was 1s)
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]; // Exponential backoff for 429
const OPTIMAL_WINDOWS_UTC = [
  { start: 13, end: 15 }, // 8-10am ET
  { start: 17, end: 18 }, // 12-1pm ET
  { start: 21, end: 23 }, // 4-6pm ET
];

// ============================================================================
// Environment
// ============================================================================

function loadEnv(): Record<string, string> {
  const envPath = join(PAI_DIR, ".env");
  const vars: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env not found — rely on process.env
  }
  return vars;
}

function getCredentials(): {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
} {
  const env = loadEnv();
  const apiKey = process.env.X_API_KEY || env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET || env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN || env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET || env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    console.error("Missing X API credentials. Required env vars:");
    console.error("  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
    console.error("Set in ~/.claude/.env or as environment variables.");
    process.exit(1);
  }

  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

// ============================================================================
// OAuth 1.0a Signature
// ============================================================================

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  // Sort parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  // Create signature base string
  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`;

  // Create signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // Generate HMAC-SHA1
  return createHmac("sha1", signingKey).update(signatureBase).digest("base64");
}

function generateOAuthHeader(
  method: string,
  url: string,
  creds: ReturnType<typeof getCredentials>
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    creds.apiSecret,
    creds.accessTokenSecret
  );

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ============================================================================
// Types
// ============================================================================

interface QueueItem {
  id: string;
  content: string;
  scheduledAt: string | null; // ISO timestamp or null for immediate
  createdAt: string;
  status: "queued" | "posted" | "failed" | "cancelled";
  threadId?: string; // For threading tweets
  inReplyTo?: string; // X tweet ID for thread continuation
}

interface PostResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  httpStatus?: number;
  content: string;
  timestamp: string;
  threadId?: string;
  threadIndex?: number;
}

// ============================================================================
// Content Safety Integration
// ============================================================================

function checkContentSafety(content: string): { passed: boolean; output: string } {
  const result = spawnSync("bun", [CONTENT_SAFETY, "--json", "check", content], {
    timeout: 10_000,
    encoding: "utf-8",
  });

  const output = (result.stdout || "") as string;
  const exitCode = result.status ?? 1;

  return {
    passed: exitCode === 0 || exitCode === 2, // pass or warn
    output,
  };
}

// ============================================================================
// Rate Budget & Spacing
// ============================================================================

interface DailyBudget {
  date: string;
  postsToday: number;
  threadsToday: number;
  lastPostAt: string | null;
  lastThreadAt: string | null;
}

function readPostHistory(): PostResult[] {
  if (!existsSync(HISTORY_FILE)) return [];
  const lines = readFileSync(HISTORY_FILE, "utf-8").split("\n").filter(l => l.trim());
  return lines.map(l => JSON.parse(l) as PostResult);
}

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function getTodaysBudget(): DailyBudget {
  const today = getTodayUTC();
  const history = readPostHistory();
  const todayPosts = history.filter(p => p.success && p.timestamp.startsWith(today));

  // Count threads using threadId field (new posts) or timestamp proximity (legacy posts)
  const threadIds = new Set<string>();
  let legacyThreads = 0;
  let lastTime = 0;
  let inThread = false;

  for (const post of todayPosts) {
    if (post.threadId) {
      threadIds.add(post.threadId);
    } else {
      // Legacy detection: posts <2 min apart = same thread
      const t = new Date(post.timestamp).getTime();
      if (lastTime && (t - lastTime) < 120_000) {
        if (!inThread) { legacyThreads++; inThread = true; }
      } else {
        inThread = false;
      }
      lastTime = t;
    }
  }

  const threadsToday = threadIds.size + legacyThreads;

  // Find last thread timestamp
  let lastThreadAt: string | null = null;
  if (threadIds.size > 0) {
    // Find earliest timestamp of most recent threadId
    const threadStarts = new Map<string, string>();
    for (const post of todayPosts) {
      if (post.threadId && !threadStarts.has(post.threadId)) {
        threadStarts.set(post.threadId, post.timestamp);
      }
    }
    lastThreadAt = [...threadStarts.values()].sort().pop() || null;
  } else if (legacyThreads > 0) {
    // Legacy: find start of last burst
    for (let i = todayPosts.length - 1; i >= 1; i--) {
      const curr = new Date(todayPosts[i].timestamp).getTime();
      const prev = new Date(todayPosts[i - 1].timestamp).getTime();
      if (curr - prev < 120_000) {
        lastThreadAt = todayPosts[i - 1].timestamp;
      } else if (lastThreadAt) {
        break;
      }
    }
  }

  const lastPost = todayPosts[todayPosts.length - 1];
  return {
    date: today,
    postsToday: todayPosts.length,
    threadsToday,
    lastPostAt: lastPost?.timestamp || null,
    lastThreadAt,
  };
}

function checkBudget(isThread: boolean, tweetCount: number = 1): { allowed: boolean; reason?: string; nextSlot?: string } {
  const budget = getTodaysBudget();

  if (budget.postsToday + tweetCount > MAX_TWEETS_PER_DAY) {
    return {
      allowed: false,
      reason: `Daily tweet budget: ${budget.postsToday}/${MAX_TWEETS_PER_DAY} used, need ${tweetCount}`,
      nextSlot: getNextDayStart(),
    };
  }

  if (isThread && budget.threadsToday >= MAX_THREADS_PER_DAY) {
    return {
      allowed: false,
      reason: `Daily thread budget exhausted (${budget.threadsToday}/${MAX_THREADS_PER_DAY})`,
      nextSlot: getNextDayStart(),
    };
  }

  return { allowed: true };
}

function checkSpacing(isThread: boolean): { allowed: boolean; reason?: string; nextSlot?: string } {
  if (!isThread) return { allowed: true };

  const budget = getTodaysBudget();
  if (!budget.lastThreadAt) return { allowed: true };

  const lastThread = new Date(budget.lastThreadAt).getTime();
  const now = Date.now();
  const elapsed = now - lastThread;

  if (elapsed < MIN_THREAD_SPACING_MS) {
    const waitMs = MIN_THREAD_SPACING_MS - elapsed;
    const nextSlot = new Date(now + waitMs).toISOString();
    const hours = Math.floor(waitMs / 3600000);
    const mins = Math.floor((waitMs % 3600000) / 60000);
    return {
      allowed: false,
      reason: `Thread spacing: ${hours}h ${mins}m remaining (min 4h between threads)`,
      nextSlot,
    };
  }

  return { allowed: true };
}

function getNextDayStart(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

function getNextOptimalWindow(): string {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();

  for (const window of OPTIMAL_WINDOWS_UTC) {
    if (currentHourUTC < window.start) {
      const next = new Date(now);
      next.setUTCHours(window.start, 0, 0, 0);
      return next.toISOString();
    }
  }

  // All windows passed today — schedule for first window tomorrow
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(OPTIMAL_WINDOWS_UTC[0].start, 0, 0, 0);
  return tomorrow.toISOString();
}

function displayBudgetStatus(): void {
  const budget = getTodaysBudget();
  const spacing = checkSpacing(true);
  const nextWindow = getNextOptimalWindow();

  console.log(`\nDaily Budget Status (${budget.date})`);
  console.log("\u2500".repeat(50));
  console.log(`  Tweets today:   ${budget.postsToday}/${MAX_TWEETS_PER_DAY}`);
  console.log(`  Threads today:  ${budget.threadsToday}/${MAX_THREADS_PER_DAY}`);
  console.log(`  Last post:      ${budget.lastPostAt || "none"}`);
  console.log(`  Last thread:    ${budget.lastThreadAt || "none"}`);
  console.log(`  Thread spacing: ${spacing.allowed ? "clear" : spacing.reason}`);
  console.log(`  Next optimal:   ${nextWindow}`);
  console.log("\u2500".repeat(50));
}

// ============================================================================
// Media Upload (v1.1 API)
// ============================================================================

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function generateOAuthHeaderForUpload(
  method: string,
  url: string,
  creds: ReturnType<typeof getCredentials>
): string {
  // For multipart/form-data, OAuth params only — body params NOT included in signature base
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    creds.apiSecret,
    creds.accessTokenSecret
  );

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

async function uploadMedia(filePath: string): Promise<string> {
  const creds = getCredentials();

  if (!existsSync(filePath)) {
    throw new Error(`Media file not found: ${filePath}`);
  }

  const stats = statSync(filePath);
  const maxSize = 5 * 1024 * 1024; // 5MB for images via simple upload
  if (stats.size > maxSize) {
    throw new Error(`Media file too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Max 5MB for simple upload.`);
  }

  const mediaData = readFileSync(filePath);
  const mimeType = getMimeType(filePath);

  // Build multipart form data
  const boundary = `----BunBoundary${randomBytes(8).toString("hex")}`;
  const parts: Buffer[] = [];

  // media_data field (base64 encoded)
  const mediaBase64 = mediaData.toString("base64");
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media_data"\r\n\r\n` +
    `${mediaBase64}\r\n`
  ));

  // media_category field
  const category = mimeType.startsWith("video/") ? "tweet_video" : "tweet_image";
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media_category"\r\n\r\n` +
    `${category}\r\n`
  ));

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);
  const oauthHeader = generateOAuthHeaderForUpload("POST", UPLOAD_URL, creds);

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      "Authorization": oauthHeader,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Media upload failed (HTTP ${response.status}): ${errorBody}`);
  }

  const data = await response.json() as { media_id_string: string };
  if (!data.media_id_string) {
    throw new Error(`Media upload response missing media_id_string: ${JSON.stringify(data)}`);
  }

  console.log(`Media uploaded: ${data.media_id_string} (${mimeType}, ${(stats.size / 1024).toFixed(0)}KB)`);
  return data.media_id_string;
}

// ============================================================================
// X API v2 Operations
// ============================================================================

async function postTweet(
  text: string,
  inReplyTo?: string,
  mediaIds?: string[]
): Promise<PostResult> {
  const creds = getCredentials();
  const url = `${X_API_BASE}/tweets`;

  const body: Record<string, unknown> = { text };
  if (inReplyTo) {
    body.reply = { in_reply_to_tweet_id: inReplyTo };
  }
  if (mediaIds && mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  const oauthHeader = generateOAuthHeader("POST", url, creds);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": oauthHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorBody}`,
        httpStatus: response.status,
        content: text,
        timestamp: new Date().toISOString(),
      };
    }

    const data = await response.json() as { data?: { id: string } };
    return {
      success: true,
      tweetId: data.data?.id,
      content: text,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      error: String(err),
      content: text,
      timestamp: new Date().toISOString(),
    };
  }
}

async function postTweetWithRetry(
  text: string,
  inReplyTo?: string,
  mediaIds?: string[]
): Promise<PostResult> {
  let result = await postTweet(text, inReplyTo, mediaIds);

  if (result.success || result.httpStatus !== 429) return result;

  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    const delay = RETRY_DELAYS_MS[i];
    console.log(`Rate limited (429). Retry ${i + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    result = await postTweet(text, inReplyTo, mediaIds);
    if (result.success || result.httpStatus !== 429) return result;
  }

  console.error(`All ${RETRY_DELAYS_MS.length} retries exhausted for: ${text.slice(0, 50)}...`);
  return result;
}

async function postThread(tweets: string[], mediaIds?: string[]): Promise<PostResult[]> {
  const results: PostResult[] = [];
  let previousTweetId: string | undefined;
  const threadId = randomBytes(8).toString("hex");

  for (let i = 0; i < tweets.length; i++) {
    const tweetMedia = (i === 0 && mediaIds) ? mediaIds : undefined;
    const result = await postTweetWithRetry(tweets[i], previousTweetId, tweetMedia);
    result.threadId = threadId;
    result.threadIndex = i;
    results.push(result);

    if (!result.success) {
      console.error(`Thread stopped at tweet ${i + 1}/${tweets.length}: ${result.error}`);

      // Queue remaining tweets for continuation instead of losing them
      if (i < tweets.length - 1) {
        const lastSuccessId = results.filter(r => r.success).pop()?.tweetId;
        queueThreadContinuation(tweets.slice(i), lastSuccessId, threadId, i);
      }
      break;
    }

    previousTweetId = result.tweetId;

    // Rate limit courtesy — 30s between thread tweets (was 1s)
    if (i < tweets.length - 1) {
      console.log(`Thread tweet ${i + 1}/${tweets.length} posted. Waiting ${THREAD_TWEET_DELAY_MS / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, THREAD_TWEET_DELAY_MS));
    }
  }

  return results;
}

function queueThreadContinuation(
  remainingTweets: string[],
  replyToId: string | undefined,
  threadId: string,
  startIndex: number
): void {
  ensureDataDir();
  const scheduledAt = getNextOptimalWindow();

  for (let i = 0; i < remainingTweets.length; i++) {
    const item: QueueItem = {
      id: randomBytes(8).toString("hex"),
      content: remainingTweets[i],
      scheduledAt,
      createdAt: new Date().toISOString(),
      status: "queued",
      threadId,
      inReplyTo: i === 0 ? replyToId : undefined,
    };
    appendFileSync(QUEUE_FILE, JSON.stringify(item) + "\n");
  }

  console.log(`Queued ${remainingTweets.length} remaining thread tweets for ${scheduledAt}`);
}

// ============================================================================
// Queue Management
// ============================================================================

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function addToQueue(content: string, scheduledAt: string | null = null): QueueItem {
  ensureDataDir();
  const item: QueueItem = {
    id: randomBytes(8).toString("hex"),
    content,
    scheduledAt,
    createdAt: new Date().toISOString(),
    status: "queued",
  };

  appendFileSync(QUEUE_FILE, JSON.stringify(item) + "\n");
  return item;
}

function readQueue(): QueueItem[] {
  if (!existsSync(QUEUE_FILE)) return [];
  const lines = readFileSync(QUEUE_FILE, "utf-8").split("\n").filter(l => l.trim());
  return lines.map(l => JSON.parse(l) as QueueItem);
}

function writeQueue(items: QueueItem[]): void {
  ensureDataDir();
  writeFileSync(QUEUE_FILE, items.map(i => JSON.stringify(i)).join("\n") + "\n");
}

function logPost(result: PostResult): void {
  ensureDataDir();
  appendFileSync(HISTORY_FILE, JSON.stringify(result) + "\n");
}

async function publishQueue(): Promise<void> {
  const items = readQueue();
  const now = new Date();
  const ready = items.filter(
    i => i.status === "queued" && (!i.scheduledAt || new Date(i.scheduledAt) <= now)
  );

  if (ready.length === 0) {
    console.log("No items ready to publish.");
    return;
  }

  console.log(`Publishing ${ready.length} queued item(s)...`);

  for (const item of ready) {
    // Safety check
    const safety = checkContentSafety(item.content);
    if (!safety.passed) {
      console.error(`Content safety blocked item ${item.id}: ${item.content.slice(0, 50)}...`);
      item.status = "failed";
      continue;
    }

    // Budget check before each queued post
    const budgetCheck = checkBudget(false);
    if (!budgetCheck.allowed) {
      console.log(`Budget exceeded, deferring: ${item.content.slice(0, 50)}...`);
      item.scheduledAt = budgetCheck.nextSlot || getNextDayStart();
      continue;
    }

    const result = await postTweetWithRetry(item.content, item.inReplyTo);
    logPost(result);

    if (result.success) {
      item.status = "posted";
      console.log(`Posted: ${item.content.slice(0, 60)}... (${result.tweetId})`);
    } else {
      item.status = "failed";
      console.error(`Failed: ${item.content.slice(0, 60)}... (${result.error})`);
    }
  }

  writeQueue(items);
}

async function retryFailed(): Promise<void> {
  const history = readPostHistory();
  const failed = history.filter(p => !p.success);

  if (failed.length === 0) {
    console.log("No failed posts to retry.");
    return;
  }

  // Deduplicate — same content may have been tried multiple times
  const seen = new Set<string>();
  const unique = failed.filter(f => {
    if (seen.has(f.content)) return false;
    seen.add(f.content);
    return true;
  });

  console.log(`Found ${unique.length} unique failed post(s). Attempting retry...`);

  // Check budget before retrying
  const budgetCheck = checkBudget(false, unique.length);
  if (!budgetCheck.allowed) {
    console.error(`Budget check: ${budgetCheck.reason}`);
    console.log("Queuing for next available slot instead.");
    for (const post of unique) {
      addToQueue(post.content, getNextOptimalWindow());
    }
    return;
  }

  for (const post of unique) {
    console.log(`Retrying: ${post.content.slice(0, 60)}...`);

    const safety = checkContentSafety(post.content);
    if (!safety.passed) {
      console.error(`Content safety now blocks this post. Skipping.`);
      continue;
    }

    const result = await postTweetWithRetry(post.content);
    logPost(result);

    if (result.success) {
      console.log(`Retried successfully: ${result.tweetId}`);
    } else {
      console.error(`Retry failed again: ${result.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// ============================================================================
// Display
// ============================================================================

function displayQueue(items: QueueItem[]): void {
  if (items.length === 0) {
    console.log("Queue is empty.");
    return;
  }

  console.log(`\nContent Queue (${items.length} items)`);
  console.log("─".repeat(60));

  for (const item of items) {
    const icon = item.status === "posted" ? "\u2705" :
                 item.status === "failed" ? "\u274C" :
                 item.status === "cancelled" ? "\u23ED" : "\u23F3";
    const schedule = item.scheduledAt ? ` @ ${item.scheduledAt}` : " (immediate)";
    console.log(`  ${icon} [${item.id}] ${item.status}${schedule}`);
    console.log(`    ${item.content.slice(0, 80)}${item.content.length > 80 ? "..." : ""}`);
  }
  console.log("─".repeat(60));
}

// ============================================================================
// Time Jitter
// ============================================================================

function addHumanJitter(): number {
  // Add 0-15 minutes of random jitter to avoid machine-regular posting
  return Math.floor(Math.random() * 15 * 60 * 1000);
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`PostScheduler.ts — Rate-aware X API v2 posting client

Usage:
  bun PostScheduler.ts post "tweet content"
  bun PostScheduler.ts post "tweet" --media /path/to/image.png
  bun PostScheduler.ts post "reply content" --reply-to TWEET_ID
  bun PostScheduler.ts post-thread "tweet1|||tweet2|||tweet3"
  bun PostScheduler.ts post-thread "tweet1|||tweet2" --media /path/to/image.png
  bun PostScheduler.ts queue "content" [--at "2026-02-14T10:00:00"]
  bun PostScheduler.ts queue-smart "content"
  bun PostScheduler.ts publish-queue
  bun PostScheduler.ts list-queue
  bun PostScheduler.ts retry-failed
  bun PostScheduler.ts status
  bun PostScheduler.ts dry-run "content"
  bun PostScheduler.ts --help

Commands:
  post           Post a single tweet (budget + safety checked)
  post-thread    Post a thread (budget + spacing + safety checked)
  queue          Add content to the queue for later posting
  queue-smart    Auto-schedule for next optimal window (respects budget/spacing)
  publish-queue  Post all queued items that are ready
  list-queue     Show current queue status
  retry-failed   Retry all failed posts from history
  status         Show daily budget, spacing, and next optimal window
  dry-run        Run content safety checks without posting

Options:
  --at           Schedule time for queued content (ISO 8601)
  --reply-to     Tweet ID to reply to (for link-in-reply strategy)
  --media        Attach image/video to tweet (PNG, JPG, GIF, WebP, MP4; max 5MB)
  --no-jitter    Skip random timing jitter
  --force        Override budget and spacing checks
  --help         Show this help

Rate Limiting (from AlgorithmStrategy.md):
  - Max ${MAX_TWEETS_PER_DAY} tweets/day, max ${MAX_THREADS_PER_DAY} threads/day
  - Min 4 hours between threads
  - 30s between tweets within a thread
  - HTTP 429 retries: 30s, 60s, 120s exponential backoff
  - Partial thread failures queue remaining tweets for continuation
  - Optimal windows: 8-10am ET, 12-1pm ET, 4-6pm ET

Environment Variables (set in ~/.claude/.env):
  X_API_KEY              Consumer API Key
  X_API_SECRET           Consumer API Secret
  X_ACCESS_TOKEN         Access Token
  X_ACCESS_TOKEN_SECRET  Access Token Secret

Notes:
  - All content passes through ContentSafety.ts before posting
  - Budget/spacing enforced unless --force is used
  - Replies (--reply-to) skip budget checks (they're part of existing threads)
  - Posting times include random jitter (0-15 min) for human-like timing
  - Media uploaded via v1.1 API, tweets posted via v2 API
  - Free tier: 500 tweets/month, POST only`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "post": {
      // Parse --reply-to, --media, --no-jitter, --force flags
      const replyToIdx = args.indexOf("--reply-to");
      const mediaIdx = args.indexOf("--media");
      const noJitter = args.includes("--no-jitter");
      const forcePost = args.includes("--force");
      let replyTo: string | undefined;
      let mediaPath: string | undefined;

      // Extract --reply-to value
      if (replyToIdx >= 0 && args[replyToIdx + 1]) {
        replyTo = args[replyToIdx + 1];
      }

      // Extract --media value
      if (mediaIdx >= 0 && args[mediaIdx + 1]) {
        mediaPath = args[mediaIdx + 1];
      }

      const contentArgs = args.slice(1).filter((a, idx) => {
        const absIdx = idx + 1; // offset since we sliced from 1
        if (a === "--reply-to" || (replyToIdx >= 0 && absIdx === replyToIdx)) return false;
        if (a === "--media" || (mediaIdx >= 0 && absIdx === mediaIdx)) return false;
        if (a === "--no-jitter" || a === "--force") return false;
        // Skip the values that follow --reply-to and --media
        if (replyToIdx >= 0 && absIdx === replyToIdx + 1) return false;
        if (mediaIdx >= 0 && absIdx === mediaIdx + 1) return false;
        return true;
      });

      const content = contentArgs.join(" ");
      if (!content) {
        console.error("Error: No content provided");
        process.exit(1);
      }

      // Safety check
      const safety = checkContentSafety(content);
      if (!safety.passed) {
        console.error("Content safety check BLOCKED this post.");
        console.error(safety.output);
        process.exit(1);
      }

      // Budget check (skip for replies and --force)
      if (!forcePost && !replyTo) {
        const budgetCheck = checkBudget(false);
        if (!budgetCheck.allowed) {
          console.error(`Budget exceeded: ${budgetCheck.reason}`);
          console.log(`Next slot: ${budgetCheck.nextSlot}`);
          console.log("Use --force to override, or queue-smart to auto-schedule.");
          process.exit(1);
        }
      }

      // Upload media if provided
      let mediaIds: string[] | undefined;
      if (mediaPath) {
        try {
          const mediaId = await uploadMedia(mediaPath);
          mediaIds = [mediaId];
        } catch (err) {
          console.error(`Media upload failed: ${err}`);
          process.exit(1);
        }
      }

      // Add human jitter (skip for self-replies to keep them timely)
      if (!noJitter && !replyTo) {
        const jitter = addHumanJitter();
        if (jitter > 0) {
          console.log(`Adding ${Math.round(jitter / 1000)}s jitter for human-like timing...`);
          await new Promise(resolve => setTimeout(resolve, jitter));
        }
      }

      const result = await postTweetWithRetry(content, replyTo, mediaIds);
      logPost(result);

      if (result.success) {
        console.log(`Posted successfully! Tweet ID: ${result.tweetId}`);
        if (replyTo) {
          console.log(`  (reply to: ${replyTo})`);
        }
        if (mediaPath) {
          console.log(`  (with media: ${mediaPath})`);
        }
      } else {
        console.error(`Post failed: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "post-thread": {
      // Parse --media and --force flags for thread
      const threadMediaIdx = args.indexOf("--media");
      const forceThread = args.includes("--force");
      let threadMediaPath: string | undefined;
      if (threadMediaIdx >= 0 && args[threadMediaIdx + 1]) {
        threadMediaPath = args[threadMediaIdx + 1];
      }

      const threadArgs = args.slice(1).filter((a, idx) => {
        const absIdx = idx + 1;
        if (a === "--media" || a === "--force") return false;
        if (threadMediaIdx >= 0 && absIdx === threadMediaIdx + 1) return false;
        return true;
      });

      const threadContent = threadArgs.join(" ");
      if (!threadContent) {
        console.error("Error: No content provided");
        process.exit(1);
      }

      const tweets = threadContent.split("|||").map(t => t.trim());

      // Safety check each tweet
      for (let i = 0; i < tweets.length; i++) {
        const safety = checkContentSafety(tweets[i]);
        if (!safety.passed) {
          console.error(`Content safety BLOCKED tweet ${i + 1}/${tweets.length}`);
          process.exit(1);
        }
      }

      // Budget + spacing checks (skip with --force)
      if (!forceThread) {
        const threadBudget = checkBudget(true, tweets.length);
        if (!threadBudget.allowed) {
          console.error(`Budget exceeded: ${threadBudget.reason}`);
          console.log(`Next slot: ${threadBudget.nextSlot}`);
          console.log("Use --force to override, or queue-smart to auto-schedule.");
          process.exit(1);
        }

        const threadSpacing = checkSpacing(true);
        if (!threadSpacing.allowed) {
          console.error(`Spacing check: ${threadSpacing.reason}`);
          console.log(`Next slot: ${threadSpacing.nextSlot}`);
          console.log("Use --force to override.");
          process.exit(1);
        }
      }

      // Upload media if provided
      let threadMediaIds: string[] | undefined;
      if (threadMediaPath) {
        try {
          const mediaId = await uploadMedia(threadMediaPath);
          threadMediaIds = [mediaId];
          console.log(`Media will be attached to first tweet in thread.`);
        } catch (err) {
          console.error(`Media upload failed: ${err}`);
          process.exit(1);
        }
      }

      const results = await postThread(tweets, threadMediaIds);
      for (const r of results) {
        logPost(r);
      }

      const succeeded = results.filter(r => r.success).length;
      console.log(`Thread: ${succeeded}/${tweets.length} tweets posted.`);
      if (succeeded < tweets.length) process.exit(1);
      break;
    }

    case "queue": {
      const atIdx = args.indexOf("--at");
      let scheduledAt: string | null = null;
      let content: string;

      if (atIdx > 0) {
        scheduledAt = args[atIdx + 1];
        content = args.slice(1, atIdx).join(" ");
      } else {
        content = args.slice(1).join(" ");
      }

      if (!content) {
        console.error("Error: No content provided");
        process.exit(1);
      }

      // Safety check before queuing
      const safety = checkContentSafety(content);
      if (!safety.passed) {
        console.error("Content safety BLOCKED — not queued.");
        process.exit(1);
      }

      const item = addToQueue(content, scheduledAt);
      console.log(`Queued: ${item.id} (${scheduledAt ? `scheduled for ${scheduledAt}` : "immediate"})`);
      break;
    }

    case "publish-queue": {
      await publishQueue();
      break;
    }

    case "list-queue": {
      const items = readQueue();
      displayQueue(items);
      break;
    }

    case "dry-run": {
      const content = args.slice(1).join(" ");
      if (!content) {
        console.error("Error: No content provided");
        process.exit(1);
      }

      console.log("Dry run — checking content safety only (no posting)");
      const safety = checkContentSafety(content);
      console.log(safety.output || (safety.passed ? "PASSED" : "BLOCKED"));
      process.exit(safety.passed ? 0 : 1);
      break;
    }

    case "queue-smart": {
      const smartContent = args.slice(1).join(" ");
      if (!smartContent) {
        console.error("Error: No content provided");
        process.exit(1);
      }

      const smartSafety = checkContentSafety(smartContent);
      if (!smartSafety.passed) {
        console.error("Content safety BLOCKED — not queued.");
        process.exit(1);
      }

      const smartBudget = checkBudget(false);
      const smartSpacing = checkSpacing(false);
      let smartSchedule: string;

      if (!smartBudget.allowed) {
        smartSchedule = smartBudget.nextSlot!;
        console.log(`Budget exceeded. Scheduling for: ${smartSchedule}`);
      } else if (!smartSpacing.allowed) {
        smartSchedule = smartSpacing.nextSlot!;
        console.log(`Spacing constraint. Scheduling for: ${smartSchedule}`);
      } else {
        smartSchedule = getNextOptimalWindow();
        console.log(`Scheduling for next optimal window: ${smartSchedule}`);
      }

      // Add jitter
      const smartJitter = addHumanJitter();
      const smartDate = new Date(new Date(smartSchedule).getTime() + smartJitter);
      smartSchedule = smartDate.toISOString();

      const smartItem = addToQueue(smartContent, smartSchedule);
      console.log(`Smart-queued: ${smartItem.id} for ${smartSchedule}`);
      break;
    }

    case "retry-failed": {
      await retryFailed();
      break;
    }

    case "status": {
      displayBudgetStatus();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

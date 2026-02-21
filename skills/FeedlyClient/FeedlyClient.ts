#!/usr/bin/env bun
/**
 * FeedlyClient.ts — Core Feedly Threat Intelligence API client
 *
 * Single point of contact with the Feedly API. All HTTP requests flow through here.
 * Composes Cache and RateBudget for rate-aware, cached API access.
 *
 * Usage:
 *   bun FeedlyClient.ts profile                                 Account info
 *   bun FeedlyClient.ts trending                                 Top 25 trending CVEs
 *   bun FeedlyClient.ts dashboard                                Vulnerability dashboard
 *   bun FeedlyClient.ts cve <CVE-ID>                             Full CVE enrichment
 *   bun FeedlyClient.ts actor <entity-id>                        Threat actor profile
 *   bun FeedlyClient.ts malware <entity-id>                      Malware profile
 *   bun FeedlyClient.ts trending-actors                          Trending threat actors
 *   bun FeedlyClient.ts trending-malware                         Trending malware families
 *   bun FeedlyClient.ts search-entity <query>                    Entity autocomplete
 *   bun FeedlyClient.ts actor-relations <entity-id>              Actor relationships
 *   bun FeedlyClient.ts detection-rules <malware-entity-id>      YARA/Sigma rules
 *   bun FeedlyClient.ts search <query>                           Content search
 *   bun FeedlyClient.ts tags                                     Team folders/boards
 *   bun FeedlyClient.ts stream <stream-id> [--count N]           Articles from stream
 *   bun FeedlyClient.ts budget                                   Rate budget status
 *   bun FeedlyClient.ts cache-stats                              Cache statistics
 *   bun FeedlyClient.ts purge                                    Purge expired cache
 *
 * Environment:
 *   FEEDLY_ACCESS_TOKEN in ~/.claude/.env
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as Cache from "./Cache";
import * as RateBudget from "./RateBudget";
import type {
  EndpointCategory,
  RateLimitInfo,
  RequestLogEntry,
  FeedlyTrendingCVE,
  FeedlyDashboard,
  FeedlyCVEEntity,
  FeedlyThreatActor,
  FeedlyMalware,
  FeedlyTrendingActors,
  FeedlyTrendingMalware,
  FeedlyEntitySearchResult,
  FeedlyActorRelationships,
  FeedlyDetectionRules,
  FeedlySearchResponse,
  FeedlySearchRequest,
  FeedlyStreamResponse,
} from "./Types";

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = "https://feedly.com";
const ENV_PATH = join(homedir(), ".claude", ".env");
const LOG_DIR = join(import.meta.dir, "Data");
const LOG_PATH = join(LOG_DIR, "request-log.jsonl");

/** Enterprise ID from Feedly profile — used for search source stream IDs */
export const ENTERPRISE_ID = "accenturefederalservicesafsthrea";

function loadToken(): string {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing .env file: ${ENV_PATH}`);
  }
  const env = readFileSync(ENV_PATH, "utf-8");
  const match = env.match(/FEEDLY_ACCESS_TOKEN=(.+)/);
  if (!match) {
    throw new Error("FEEDLY_ACCESS_TOKEN not found in .env");
  }
  return match[1].trim();
}

// ============================================================================
// URL Encoding for Entity IDs
// ============================================================================

/**
 * Feedly entity IDs contain slashes and colons that must be URL-encoded
 * when used as path segments.
 *
 * Example: "nlp/f/entity/gz:ta:5b4ee3ea-eee3-4c8e-8323-85ae32658754"
 *       -> "nlp%2Ff%2Fentity%2Fgz%3Ata%3A5b4ee3ea-eee3-4c8e-8323-85ae32658754"
 */
function encodeEntityId(entityId: string): string {
  return encodeURIComponent(entityId);
}

// ============================================================================
// Rate Limit Header Parsing
// ============================================================================

function parseRateHeaders(headers: Headers): RateLimitInfo | null {
  const count = parseInt(headers.get("X-Ratelimit-Count") || "", 10);
  const limit = parseInt(headers.get("X-Ratelimit-Limit") || "", 10);
  const reset = parseInt(headers.get("X-Ratelimit-Reset") || "", 10);

  if (isNaN(count) || isNaN(limit)) return null;

  return {
    count,
    limit,
    reset: reset || 0,
    remaining: limit - count,
    percentUsed: (count / limit) * 100,
  };
}

// ============================================================================
// Core Request Function
// ============================================================================

export interface RequestOptions {
  consumer: string;
  category: EndpointCategory;
  forceRefresh?: boolean;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  options: RequestOptions,
  body?: unknown,
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : undefined;

  // 1. Check cache (unless forced refresh)
  if (!options.forceRefresh) {
    const cached = Cache.get<T>(options.category, path, bodyStr);
    if (cached !== null) {
      logRequest(path, method, options.consumer, true, 200, 0, null);
      return cached;
    }
  }

  // 2. Check rate budget
  const budget = RateBudget.checkBudget(options.consumer);

  if (!budget.allowed) {
    if (budget.waitMs && budget.waitMs <= 5000) {
      // Short wait (burst rate limit) — wait and retry
      await new Promise(resolve => setTimeout(resolve, budget.waitMs));
    } else {
      throw new RateLimitError(budget.reason || "Rate limit exceeded");
    }
  }

  if (budget.cacheOnly) {
    // Try stale cache (stale data > no data)
    const stale = Cache.getStale<T>(options.category, path, bodyStr);
    if (stale !== null) {
      logRequest(path, method, options.consumer, true, 200, 0, null);
      return stale;
    }
    console.error(`[WARN] Cache-only mode but no cached data for ${path}`);
  }

  // 3. Wait for burst rate limit
  await RateBudget.waitForBurst();

  // 4. Make the API call
  const token = loadToken();
  const url = `${BASE_URL}${path}`;
  const start = performance.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: bodyStr,
    });
  } catch (err) {
    RateBudget.recordError();
    throw err;
  }

  const latency = Math.round(performance.now() - start);
  const rateInfo = parseRateHeaders(response.headers);

  // 5. Handle errors
  if (!response.ok) {
    logRequest(path, method, options.consumer, false, response.status, latency, rateInfo);

    if (response.status === 429) {
      RateBudget.recordError();
      // Still record the rate info if available
      if (rateInfo) {
        const state = RateBudget.loadRateState();
        state.lastApiRateInfo = rateInfo;
        state.lastRequestTs = Date.now();
        RateBudget.saveRateState(state);
      }
      throw new RateLimitError(
        `Feedly API returned 429. Rate info: ${JSON.stringify(rateInfo)}`
      );
    }

    if (response.status >= 500) {
      RateBudget.recordError();
    }

    const errorBody = await response.text();
    throw new FeedlyApiError(response.status, errorBody, path);
  }

  // 6. Record success and cache
  RateBudget.recordRequest(options.consumer, options.category, rateInfo);
  logRequest(path, method, options.consumer, false, response.status, latency, rateInfo);

  const data = await response.json() as T;
  Cache.set(options.category, path, data, bodyStr);

  return data;
}

// ============================================================================
// Public API Methods
// ============================================================================

export async function getProfile(consumer = "manual"): Promise<unknown> {
  return request("GET", "/v3/profile", { consumer, category: "profile" });
}

/**
 * Top 25 trending CVEs — refreshes hourly.
 * Returns normalized FeedlyTrendingCVE[] from the memes response.
 * For full enrichment (CVSS, EPSS, actors, malware), call getCVE(cveId).
 */
export async function getTrending(consumer = "manual"): Promise<FeedlyTrendingCVE[]> {
  const raw = await request<{ memes: TrendingMeme[] }>(
    "GET", "/v3/memes/vulnerabilities/en", { consumer, category: "trending" },
  );
  return (raw.memes || []).map(normalizeMeme);
}

/** Raw meme from trending endpoint */
interface TrendingMeme {
  label: string;
  id: string;
  size: number;
  summary?: string[];
  score: number;
  featured?: boolean;
  sparklineUrl?: string;
  vulnerabilitiesMetadata?: {
    vendor?: string;
    products?: string[];
    cvssCategoryEstimate?: string;
    publishedDate?: number;
    hasExploit?: boolean;
  };
  items?: unknown[];
}

/** Normalize a trending meme into our FeedlyTrendingCVE shape */
function normalizeMeme(meme: TrendingMeme): FeedlyTrendingCVE {
  const vm = meme.vulnerabilitiesMetadata || {};
  return {
    id: meme.id,
    cveid: meme.label,
    label: meme.label,
    description: meme.summary?.[0] || "",
    cvssCategoryEstimate: vm.cvssCategoryEstimate,
    trending: true,
    exploitedInTheWild: vm.hasExploit || false,
    patched: false, // Not available from memes endpoint — requires getCVE()
    graphUrl: meme.sparklineUrl,
    publishedDate: vm.publishedDate ? new Date(vm.publishedDate).toISOString() : undefined,
    affectedProducts: vm.vendor ? [{ vendor: vm.vendor, product: vm.products?.[0] || "" }] : undefined,
    stats: { articleCount: meme.size },
  };
}

/** Vulnerability dashboard with aggregations */
export async function getDashboard(consumer = "manual"): Promise<FeedlyDashboard> {
  return request("POST", "/v3/trends/vulnerability-dashboard", {
    consumer, category: "dashboard",
  });
}

/** Full CVE entity enrichment */
export async function getCVE(cveId: string, consumer = "manual"): Promise<FeedlyCVEEntity> {
  const normalized = cveId.startsWith("CVE-") ? cveId : `CVE-${cveId}`;
  return request("GET", `/v3/entities/${normalized}`, { consumer, category: "cve-entity" });
}

/** Threat actor entity profile */
export async function getThreatActor(entityId: string, consumer = "manual"): Promise<FeedlyThreatActor> {
  const encoded = encodeEntityId(entityId);
  return request("GET", `/v3/entities/${encoded}`, { consumer, category: "threat-actor" });
}

/** Malware entity profile */
export async function getMalware(entityId: string, consumer = "manual"): Promise<FeedlyMalware> {
  const encoded = encodeEntityId(entityId);
  return request("GET", `/v3/entities/${encoded}`, { consumer, category: "malware" });
}

/** Trending threat actors — live-tested path */
export async function getTrendingActors(consumer = "manual"): Promise<FeedlyTrendingActors> {
  return request("GET", "/v3/trends/threat-actors", { consumer, category: "trending-actors" });
}

/** Trending malware families — live-tested path */
export async function getTrendingMalware(consumer = "manual"): Promise<FeedlyTrendingMalware> {
  return request("GET", "/v3/trends/new-malwares", { consumer, category: "trending-malware" });
}

/** Entity autocomplete search — live-tested path */
export async function searchEntities(query: string, consumer = "manual"): Promise<FeedlyEntitySearchResult> {
  const encoded = encodeURIComponent(query);
  return request("GET", `/v3/search/entities?query=${encoded}`, {
    consumer, category: "entity-search",
  });
}

/** Actor relationships (malware, TTPs, CVEs, IoCs) — requires intervalType */
export async function getActorRelationships(
  entityId: string,
  intervalType = "LAST_30_DAYS",
  consumer = "manual",
): Promise<FeedlyActorRelationships> {
  const encoded = encodeEntityId(entityId);
  return request(
    "GET",
    `/v3/ml/relationships/actor/${encoded}?intervalType=${intervalType}`,
    { consumer, category: "actor-relations" },
  );
}

/** Detection rules (YARA/Sigma) for a malware family */
export async function getDetectionRules(
  malwareEntityId: string,
  consumer = "manual",
): Promise<FeedlyDetectionRules> {
  const encoded = encodeEntityId(malwareEntityId);
  return request("GET", `/v3/ml/detection-rules/threat/${encoded}`, {
    consumer, category: "detection-rules",
  });
}

/** Search articles with layered filters */
export async function searchContents(
  searchRequest: FeedlySearchRequest,
  consumer = "manual",
): Promise<FeedlySearchResponse> {
  return request("POST", "/v3/search/contents", { consumer, category: "search" }, searchRequest);
}

/** Team folders and boards */
export async function getTags(consumer = "manual"): Promise<unknown> {
  return request("GET", "/v3/tags", { consumer, category: "tags" });
}

/** Articles from a feed, board, or folder stream */
export async function getStream(
  streamId: string,
  count = 20,
  consumer = "manual",
): Promise<FeedlyStreamResponse> {
  const encoded = encodeURIComponent(streamId);
  return request(
    "GET",
    `/v3/streams/contents?streamId=${encoded}&count=${count}`,
    { consumer, category: "stream" },
  );
}

/** Batch get articles by entry IDs (max 1000) */
export async function batchGetArticles(
  entryIds: string[],
  consumer = "manual",
): Promise<unknown[]> {
  return request("POST", "/v3/entries/.mget", {
    consumer, category: "batch-articles",
  }, entryIds);
}

// ============================================================================
// Error Classes
// ============================================================================

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class FeedlyApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
    public endpoint: string,
  ) {
    super(`Feedly API ${statusCode} on ${endpoint}: ${body.slice(0, 200)}`);
    this.name = "FeedlyApiError";
  }
}

// ============================================================================
// Request Logging
// ============================================================================

function logRequest(
  endpoint: string,
  method: "GET" | "POST",
  consumer: string,
  cacheHit: boolean,
  statusCode: number,
  latencyMs: number,
  rateInfo: RateLimitInfo | null,
): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

  const entry: RequestLogEntry = {
    ts: new Date().toISOString(),
    endpoint,
    method,
    consumer,
    cacheHit,
    statusCode,
    latencyMs,
    rateLimitAfter: rateInfo,
  };
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Non-fatal: don't crash on log write failure
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help") {
    console.log(`FeedlyClient.ts — Feedly Threat Intelligence API Client

Usage:
  bun FeedlyClient.ts profile                                 Account info + rate limits
  bun FeedlyClient.ts trending                                 Top 25 trending CVEs
  bun FeedlyClient.ts dashboard                                Vulnerability dashboard
  bun FeedlyClient.ts cve <CVE-ID>                             Full CVE enrichment
  bun FeedlyClient.ts actor <entity-id>                        Threat actor profile
  bun FeedlyClient.ts malware <entity-id>                      Malware profile
  bun FeedlyClient.ts trending-actors                          Trending threat actors
  bun FeedlyClient.ts trending-malware                         Trending malware families
  bun FeedlyClient.ts search-entity <query>                    Entity autocomplete
  bun FeedlyClient.ts actor-relations <entity-id>              Actor relationships (TTPs, malware, CVEs)
  bun FeedlyClient.ts detection-rules <malware-entity-id>      YARA/Sigma detection rules
  bun FeedlyClient.ts search <query>                           Content search
  bun FeedlyClient.ts tags                                     Team folders/boards
  bun FeedlyClient.ts stream <stream-id> [--count N]           Articles from stream
  bun FeedlyClient.ts budget                                   Rate budget status
  bun FeedlyClient.ts cache-stats                              Cache statistics
  bun FeedlyClient.ts purge                                    Purge expired cache entries

Rate Budget:
  Daily: 1,667 (CyberOps: 1,000 | Twitter: 500 | Reserve: 167)
  Burst limit: 2s minimum between requests
  Circuit breaker: 5 errors in 10min = 15min cooldown
  Hard stop at 90% of API-reported limit.
`);
    return;
  }

  try {
    switch (command) {
      case "profile":
        console.log(JSON.stringify(await getProfile(), null, 2));
        break;
      case "trending":
        console.log(JSON.stringify(await getTrending(), null, 2));
        break;
      case "dashboard":
        console.log(JSON.stringify(await getDashboard(), null, 2));
        break;
      case "cve":
        if (!args[1]) { console.error("Usage: cve <CVE-ID>"); process.exit(1); }
        console.log(JSON.stringify(await getCVE(args[1]), null, 2));
        break;
      case "actor":
        if (!args[1]) { console.error("Usage: actor <entity-id>"); process.exit(1); }
        console.log(JSON.stringify(await getThreatActor(args[1]), null, 2));
        break;
      case "malware":
        if (!args[1]) { console.error("Usage: malware <entity-id>"); process.exit(1); }
        console.log(JSON.stringify(await getMalware(args[1]), null, 2));
        break;
      case "trending-actors":
        console.log(JSON.stringify(await getTrendingActors(), null, 2));
        break;
      case "trending-malware":
        console.log(JSON.stringify(await getTrendingMalware(), null, 2));
        break;
      case "search-entity":
        if (!args[1]) { console.error("Usage: search-entity <query>"); process.exit(1); }
        console.log(JSON.stringify(await searchEntities(args[1]), null, 2));
        break;
      case "actor-relations":
        if (!args[1]) { console.error("Usage: actor-relations <entity-id>"); process.exit(1); }
        console.log(JSON.stringify(await getActorRelationships(args[1]), null, 2));
        break;
      case "detection-rules":
        if (!args[1]) { console.error("Usage: detection-rules <malware-entity-id>"); process.exit(1); }
        console.log(JSON.stringify(await getDetectionRules(args[1]), null, 2));
        break;
      case "search": {
        if (!args[1]) { console.error("Usage: search <query>"); process.exit(1); }
        const result = await searchContents({
          query: args[1],
          source: { items: [{ type: "stream", id: `enterprise/${ENTERPRISE_ID}/category/global.all` }] },
          count: 10,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "tags":
        console.log(JSON.stringify(await getTags(), null, 2));
        break;
      case "stream": {
        if (!args[1]) { console.error("Usage: stream <stream-id> [--count N]"); process.exit(1); }
        const countIdx = args.indexOf("--count");
        const count = countIdx >= 0 ? parseInt(args[countIdx + 1]) : 20;
        console.log(JSON.stringify(await getStream(args[1], count), null, 2));
        break;
      }
      case "budget":
        console.log(RateBudget.formatStatus());
        break;
      case "cache-stats": {
        const result = Cache.purgeExpired();
        console.log(`Cache: ${result.remaining} live entries, ${result.purged} expired (purged)`);
        break;
      }
      case "purge": {
        const result = Cache.purgeExpired();
        console.log(`Purged ${result.purged} expired entries. ${result.remaining} remain.`);
        break;
      }
      default:
        console.error(`Unknown command: ${command}. Use --help for usage.`);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error(`[RATE LIMIT] ${err.message}`);
      process.exit(2);
    }
    if (err instanceof FeedlyApiError) {
      console.error(`[API ERROR] ${err.message}`);
      process.exit(3);
    }
    throw err;
  }
}

if (import.meta.main) {
  await cli();
}

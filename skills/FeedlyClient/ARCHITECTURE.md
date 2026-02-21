# FeedlyClient Architecture

**Author:** Architect Agent
**Date:** 2026-02-14
**Status:** SPECIFICATION (pre-implementation)
**Consumers:** TwitterBot, Cyber Ops Daily Intel

---

## Problem Statement

Two PAI subsystems need Feedly threat intelligence data:

1. **TwitterBot** -- needs trending CVEs, AI summaries, threat actor context to compose cyber threat intelligence, AI/Cyber content, federal compliance tweets. Runs on a scheduled cadence (hourly-daily).

2. **Cyber Ops Daily Intel** -- needs on-demand CVE enrichment, threat actor profiles with aliases/malware/targets, IoC collection (STIX 2.1), malware relationship mapping. Runs on-demand + daily digest.

Both share a single DOE Enterprise Feedly account with a hard ceiling of 100,000 requests/month. We budget ourselves to 50,000 (~1,667/day, ~69/hour) to avoid degrading service for other account users.

The fundamental constraint is the shared rate limit. Every architectural decision flows from this.

---

## Fundamental Constraints

| Constraint | Value | Implication |
|-----------|-------|-------------|
| Monthly cap | 100,000 total, 50,000 our budget | Every request must justify its cost |
| Daily budget | ~1,667 requests | Caching is not optional -- it is structural |
| Hourly budget | ~69 requests | Batch operations must be coalesced |
| Shared account | DOE Enterprise | No retry storms, no burst patterns |
| Auth | Bearer token | Single token, no per-consumer auth |
| Entity IDs | URL-encoded `nlp/f/entity/gz:*` | Encoding layer required |
| Rate headers | X-Ratelimit-Count, Limit, Reset | Must read and respect on every response |

---

## Module Structure

```
skills/FeedlyClient/
  ARCHITECTURE.md          # This document
  SKILL.md                 # Skill definition (trigger: feedly, threat intel feed, cve enrichment)
  FeedlyClient.ts          # Core client -- HTTP, auth, encoding, rate tracking
  Cache.ts                 # Filesystem cache with TTL enforcement
  RateBudget.ts            # Budget allocator -- daily/hourly tracking, priority system
  Types.ts                 # All TypeScript interfaces
  Facades/
    TwitterBotFacade.ts    # Consumer-specific: trending CVEs, tweet-ready summaries
    CyberOpsFacade.ts      # Consumer-specific: enrichment, actors, IoCs, STIX
  Config/
    rate-budget.yaml       # Budget allocation config
    cache-ttls.yaml        # TTL configuration per endpoint type
  Data/
    cache/                 # Cached API responses (JSON files with metadata)
    rate-state.json        # Persistent rate counter state
    request-log.jsonl      # Append-only request audit trail
```

**Design decision: Modular, not monolithic.** The core HTTP client, cache, and rate budget are independent concerns. Each consumer gets a facade that composes them. This lets us add a third consumer (e.g., a daily digest email, a Slack bot) without touching core code.

---

## TypeScript Interfaces

### `/Types.ts` -- Complete Type System

```typescript
// ============================================================================
// Core API Types
// ============================================================================

/** Rate limit state extracted from response headers */
export interface RateLimitInfo {
  count: number;        // X-Ratelimit-Count: requests used this period
  limit: number;        // X-Ratelimit-Limit: max requests this period
  reset: number;        // X-Ratelimit-Reset: epoch seconds when counter resets
  remaining: number;    // Computed: limit - count
  percentUsed: number;  // Computed: count / limit * 100
}

/** Persistent rate tracking state */
export interface RateState {
  daily: {
    date: string;           // YYYY-MM-DD
    total: number;          // Total requests today
    byEndpoint: Record<string, number>;  // Requests by endpoint category
    byConsumer: Record<string, number>;  // Requests by consumer
  };
  hourly: {
    hour: string;           // YYYY-MM-DDTHH
    total: number;
  };
  monthly: {
    month: string;          // YYYY-MM
    total: number;
  };
  lastApiRateInfo: RateLimitInfo | null;  // Most recent from API headers
  lastUpdated: string;
}

/** Budget allocation for a consumer */
export interface BudgetAllocation {
  dailyLimit: number;
  hourlyLimit: number;
  priority: 1 | 2 | 3;     // 1 = highest (cyber ops), 3 = lowest
  canBorrow: boolean;       // Can borrow unused budget from lower-priority consumers
}

/** Cache entry wrapper */
export interface CacheEntry<T> {
  data: T;
  cachedAt: string;         // ISO timestamp
  expiresAt: string;        // ISO timestamp
  endpoint: string;         // API endpoint that produced this
  etag?: string;            // For conditional requests if supported
}

/** Request log entry */
export interface RequestLogEntry {
  ts: string;
  endpoint: string;
  method: "GET" | "POST";
  consumer: string;         // "twitter-bot" | "cyber-ops" | "manual"
  cacheHit: boolean;
  statusCode: number;
  latencyMs: number;
  rateLimitAfter: RateLimitInfo | null;
}

// ============================================================================
// Endpoint Categories (for budget tracking and TTL assignment)
// ============================================================================

export type EndpointCategory =
  | "trending"          // /v3/memes/vulnerabilities -- hot CVEs
  | "dashboard"         // /v3/trends/vulnerability-dashboard -- aggregated view
  | "cve-entity"        // /v3/entities/CVE-* -- individual CVE enrichment
  | "threat-actor"      // /v3/entities/nlp/f/entity/gz:ta:* -- actor profiles
  | "malware"           // /v3/entities/nlp/f/entity/gz:mal:* -- malware profiles
  | "stream"            // /v3/streams/contents -- feed/board articles
  | "tags"              // /v3/tags -- team folders
  | "profile"           // /v3/profile -- account info
  | "batch-articles";   // /v3/entries/.mget -- batch article fetch

// ============================================================================
// Feedly API Response Types
// ============================================================================

/** CVE from trending endpoint (/v3/memes/vulnerabilities/en) */
export interface FeedlyTrendingCVE {
  id: string;                       // "vulnerability/m/CVE-2024-XXXXX"
  cveid: string;                    // "CVE-2024-XXXXX"
  label: string;                    // Human-readable title
  description: string;              // AI-generated summary
  cvssV3?: number;
  cvssV4?: number;
  epssScore?: number;               // EPSS probability (0-1)
  trending: boolean;
  exploitedInTheWild: boolean;
  patched: boolean;
  patchDetails?: PatchDetail[];
  affectedProducts?: AffectedProduct[];
  relatedThreatActors?: RelatedEntity[];
  relatedMalware?: RelatedEntity[];
  executiveSummary?: string;        // AI-generated exec summary
  whatIsIt?: string;                // AI "what" explanation
  soWhat?: string;                  // AI "so what" explanation
  publishedDate?: string;
  lastModifiedDate?: string;
}

/** Dashboard response (/v3/trends/vulnerability-dashboard) */
export interface FeedlyDashboard {
  vulnerabilities: FeedlyTrendingCVE[];
  topMalwareFamilies?: AggregationBucket[];
  topThreatActors?: AggregationBucket[];
  topVendors?: AggregationBucket[];
  totalCount: number;
}

/** Full CVE entity (/v3/entities/CVE-*) */
export interface FeedlyCVEEntity {
  id: string;
  cveid: string;
  label: string;
  description: string;
  cvssV3?: number;
  cvssV4?: number;
  epssScore?: number;
  epssPercentile?: number;
  cweIds?: string[];
  exploitedInTheWild: boolean;
  trending: boolean;
  patched: boolean;
  patchDetails?: PatchDetail[];
  affectedProducts?: AffectedProduct[];
  relatedThreatActors?: RelatedEntity[];
  relatedMalware?: RelatedEntity[];
  executiveSummary?: string;
  whatIsIt?: string;
  soWhat?: string;
  timeline?: TimelineEvent[];
  references?: Reference[];
  publishedDate?: string;
  lastModifiedDate?: string;
}

/** Threat Actor entity (/v3/entities/nlp/f/entity/gz:ta:*) */
export interface FeedlyThreatActor {
  id: string;                        // "nlp/f/entity/gz:ta:UUID"
  label: string;                     // Primary name
  description: string;
  aliases?: string[];
  country?: string;                  // Attribution country
  motivation?: string;               // e.g., "Espionage", "Financial"
  firstSeen?: string;
  lastSeen?: string;
  targetSectors?: string[];
  targetCountries?: string[];
  associatedMalware?: RelatedEntity[];
  associatedTools?: RelatedEntity[];
  associatedVulnerabilities?: RelatedEntity[];
  ttps?: MitreTTP[];                 // MITRE ATT&CK techniques
  iocs?: IoC[];
  reports?: Reference[];
}

/** Malware entity (/v3/entities/nlp/f/entity/gz:mal:*) */
export interface FeedlyMalware {
  id: string;
  label: string;
  description: string;
  aliases?: string[];
  type?: string;                     // "ransomware", "trojan", "loader", etc.
  firstSeen?: string;
  lastSeen?: string;
  associatedThreatActors?: RelatedEntity[];
  associatedVulnerabilities?: RelatedEntity[];
  affectedPlatforms?: string[];
  capabilities?: string[];
  iocs?: IoC[];
}

/** Stream content (/v3/streams/contents) */
export interface FeedlyStreamResponse {
  items: FeedlyArticle[];
  id: string;
  continuation?: string;            // Pagination cursor
  updated?: number;
}

/** Individual article */
export interface FeedlyArticle {
  id: string;
  title: string;
  content?: { content: string };
  summary?: { content: string };
  author?: string;
  origin?: { title: string; htmlUrl: string };
  published: number;                 // Epoch ms
  crawled: number;
  updated?: number;
  categories?: Array<{ id: string; label: string }>;
  keywords?: string[];
  entities?: ArticleEntity[];
  commonTopics?: Array<{ id: string; label: string }>;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface PatchDetail {
  url: string;
  vendor: string;
  publishedDate?: string;
}

export interface AffectedProduct {
  vendor: string;
  product: string;
  versions?: string[];
}

export interface RelatedEntity {
  id: string;
  label: string;
  type: "threat-actor" | "malware" | "vulnerability" | "tool";
}

export interface AggregationBucket {
  id: string;
  label: string;
  count: number;
}

export interface TimelineEvent {
  date: string;
  event: string;
  source?: string;
}

export interface Reference {
  url: string;
  title?: string;
  source?: string;
  publishedDate?: string;
}

export interface MitreTTP {
  techniqueId: string;              // e.g., "T1566.001"
  techniqueName: string;
  tacticName?: string;
}

export interface IoC {
  type: "ip" | "domain" | "url" | "hash-md5" | "hash-sha1" | "hash-sha256" | "email";
  value: string;
  firstSeen?: string;
  lastSeen?: string;
  confidence?: number;              // 0-100
}

export interface ArticleEntity {
  id: string;
  label: string;
  type: string;
  mentions: number;
}

// ============================================================================
// Consumer-Specific Types
// ============================================================================

/** TwitterBot needs: tweet-ready intelligence packages */
export interface TweetIntelPackage {
  cve: FeedlyTrendingCVE;
  tweetAngle: string;               // Generated angle for the tweet
  urgency: "critical" | "high" | "medium";
  federalRelevance: string;         // Why this matters for federal compliance, federal cyber ops, threat hunting
  threadPoints?: string[];          // If thread-worthy, key points
  relatedContext: {
    actorNames: string[];
    malwareFamilies: string[];
    affectedVendors: string[];
  };
}

/** CyberOps needs: enriched intelligence objects */
export interface EnrichedCVE {
  cve: FeedlyCVEEntity;
  actors: FeedlyThreatActor[];
  malware: FeedlyMalware[];
  stixBundle?: STIXBundle;          // Optional STIX 2.1 representation
}

/** Minimal STIX 2.1 bundle for IoC sharing */
export interface STIXBundle {
  type: "bundle";
  id: string;
  objects: STIXObject[];
}

export interface STIXObject {
  type: string;                     // "indicator", "threat-actor", "malware", etc.
  spec_version: "2.1";
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}
```

---

## Cache Strategy

### TTL Table

| Endpoint Category | TTL | Rationale |
|------------------|-----|-----------|
| `trending` | 1 hour | Hot CVEs change frequently; stale = missed tweet opportunity |
| `dashboard` | 2 hours | Aggregated view, less volatile than individual trending |
| `cve-entity` | 24 hours | CVE metadata stable once enriched; EPSS updates daily |
| `threat-actor` | 7 days | Actor profiles change slowly; aliases/TTPs evolve over weeks |
| `malware` | 7 days | Same rationale as threat actors |
| `stream` | 30 minutes | Article feeds need freshness for monitoring |
| `tags` | 24 hours | Team structure rarely changes |
| `profile` | 1 hour | Rate limit info useful to refresh hourly |
| `batch-articles` | 6 hours | Article content is immutable once published |

### Cache Implementation (`Cache.ts`)

```typescript
/**
 * Filesystem cache with TTL enforcement.
 *
 * Storage layout:
 *   Data/cache/{category}/{key}.json
 *
 * Each file contains a CacheEntry<T> with metadata.
 * Keys are SHA-256 hashes of the request URL + body.
 *
 * Design decisions:
 * - Filesystem over SQLite: no dependency, inspectable, git-friendly
 * - One file per entry: atomic reads/writes, no corruption risk
 * - Hash-based keys: safe filenames, deduplication
 * - TTL in the entry itself: no separate expiry tracking needed
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import type { CacheEntry, EndpointCategory } from "./Types";

const CACHE_DIR = join(import.meta.dir, "Data", "cache");

const TTL_MAP: Record<EndpointCategory, number> = {
  "trending":        60 * 60 * 1000,           // 1 hour
  "dashboard":       2 * 60 * 60 * 1000,       // 2 hours
  "cve-entity":      24 * 60 * 60 * 1000,      // 24 hours
  "threat-actor":    7 * 24 * 60 * 60 * 1000,  // 7 days
  "malware":         7 * 24 * 60 * 60 * 1000,  // 7 days
  "stream":          30 * 60 * 1000,            // 30 minutes
  "tags":            24 * 60 * 60 * 1000,       // 24 hours
  "profile":         60 * 60 * 1000,            // 1 hour
  "batch-articles":  6 * 60 * 60 * 1000,        // 6 hours
};

function cacheKey(endpoint: string, body?: string): string {
  const hash = createHash("sha256");
  hash.update(endpoint);
  if (body) hash.update(body);
  return hash.digest("hex").slice(0, 16);  // 16 chars is sufficient
}

export function get<T>(category: EndpointCategory, endpoint: string, body?: string): T | null {
  const key = cacheKey(endpoint, body);
  const path = join(CACHE_DIR, category, `${key}.json`);

  if (!existsSync(path)) return null;

  const entry: CacheEntry<T> = JSON.parse(readFileSync(path, "utf-8"));
  const now = new Date().getTime();
  const expires = new Date(entry.expiresAt).getTime();

  if (now > expires) {
    unlinkSync(path);  // Expired -- clean up
    return null;
  }

  return entry.data;
}

export function set<T>(category: EndpointCategory, endpoint: string, data: T, body?: string): void {
  const key = cacheKey(endpoint, body);
  const dir = join(CACHE_DIR, category);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const ttl = TTL_MAP[category];
  const now = new Date();

  const entry: CacheEntry<T> = {
    data,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    endpoint,
  };

  writeFileSync(join(dir, `${key}.json`), JSON.stringify(entry, null, 2));
}

/** Purge all expired entries across all categories. Run periodically. */
export function purgeExpired(): { purged: number; remaining: number } {
  let purged = 0;
  let remaining = 0;
  const now = Date.now();

  for (const category of Object.keys(TTL_MAP)) {
    const dir = join(CACHE_DIR, category);
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      try {
        const entry = JSON.parse(readFileSync(path, "utf-8"));
        if (now > new Date(entry.expiresAt).getTime()) {
          unlinkSync(path);
          purged++;
        } else {
          remaining++;
        }
      } catch {
        unlinkSync(path);  // Corrupted -- remove
        purged++;
      }
    }
  }

  return { purged, remaining };
}
```

---

## Rate Budget Allocator

### The Algorithm

The fundamental insight: this is a **priority-based token bucket** where tokens are API requests and the bucket refills daily.

```
Daily Budget: 1,667 requests
  |
  +-- CyberOps (Priority 1): 1,000/day (~42/hr)
  |     Rationale: on-demand enrichment is latency-sensitive
  |     and the primary intelligence mission
  |
  +-- TwitterBot (Priority 2): 500/day (~21/hr)
  |     Rationale: scheduled cadence, can tolerate cache hits,
  |     needs fewer unique requests
  |
  +-- Reserve (Priority 3): 167/day
        Rationale: manual CLI queries, debugging, unexpected needs
        Any consumer can borrow from reserve when their budget is exhausted
```

### Budget Borrowing Rules

1. A consumer can borrow from Reserve at any time.
2. A consumer can borrow from a lower-priority consumer's UNUSED daily budget.
3. CyberOps (P1) can borrow from TwitterBot's unused budget. Not vice versa.
4. No consumer can ever exceed the global daily cap of 1,667.
5. If global daily usage > 1,400 (85%), all consumers enter "cache-only" mode for non-critical requests.

### Hard Stop

At 90% of the API-reported `X-Ratelimit-Limit`, ALL requests are blocked except `GET /v3/profile` (to check whether the limit has reset). This prevents us from ever hitting the hard wall.

```typescript
/**
 * RateBudget.ts -- Priority-based rate budget allocator
 *
 * Tracks request counts by day/hour/month and by consumer.
 * Enforces budget limits with borrowing rules.
 * Reads API rate headers to maintain ground truth.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { RateState, RateLimitInfo, BudgetAllocation } from "./Types";

const STATE_PATH = join(import.meta.dir, "Data", "rate-state.json");

const BUDGETS: Record<string, BudgetAllocation> = {
  "cyber-ops": { dailyLimit: 1000, hourlyLimit: 42, priority: 1, canBorrow: true },
  "twitter-bot": { dailyLimit: 500, hourlyLimit: 21, priority: 2, canBorrow: false },
  "reserve": { dailyLimit: 167, hourlyLimit: 7, priority: 3, canBorrow: false },
};

const GLOBAL_DAILY_LIMIT = 1667;
const SOFT_CAP_PERCENT = 85;  // Enter cache-only mode
const HARD_CAP_PERCENT = 90;  // Block all non-profile requests

export function loadRateState(): RateState {
  if (!existsSync(STATE_PATH)) {
    return {
      daily: { date: today(), total: 0, byEndpoint: {}, byConsumer: {} },
      hourly: { hour: currentHour(), total: 0 },
      monthly: { month: currentMonth(), total: 0 },
      lastApiRateInfo: null,
      lastUpdated: new Date().toISOString(),
    };
  }
  const state: RateState = JSON.parse(readFileSync(STATE_PATH, "utf-8"));

  // Roll over if date/hour/month changed
  if (state.daily.date !== today()) {
    state.daily = { date: today(), total: 0, byEndpoint: {}, byConsumer: {} };
  }
  if (state.hourly.hour !== currentHour()) {
    state.hourly = { hour: currentHour(), total: 0 };
  }
  if (state.monthly.month !== currentMonth()) {
    state.monthly = { month: currentMonth(), total: 0 };
  }

  return state;
}

export function saveRateState(state: RateState): void {
  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  cacheOnly?: boolean;  // True = use cache, do not make API call
  remainingDaily: number;
  remainingHourly: number;
}

export function checkBudget(consumer: string): BudgetCheck {
  const state = loadRateState();
  const budget = BUDGETS[consumer] || BUDGETS["reserve"];

  const usedByConsumer = state.daily.byConsumer[consumer] || 0;
  const globalUsed = state.daily.total;

  // Hard stop: API-reported rate limit at 90%
  if (state.lastApiRateInfo) {
    if (state.lastApiRateInfo.percentUsed >= HARD_CAP_PERCENT) {
      return {
        allowed: false,
        reason: `API rate limit at ${state.lastApiRateInfo.percentUsed.toFixed(0)}% -- hard stop`,
        remainingDaily: GLOBAL_DAILY_LIMIT - globalUsed,
        remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
      };
    }
  }

  // Global daily cap
  if (globalUsed >= GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Global daily limit reached (${globalUsed}/${GLOBAL_DAILY_LIMIT})`,
      remainingDaily: 0,
      remainingHourly: 0,
    };
  }

  // Soft cap: cache-only mode
  if (globalUsed >= GLOBAL_DAILY_LIMIT * (SOFT_CAP_PERCENT / 100)) {
    return {
      allowed: true,
      cacheOnly: true,
      reason: `Global usage at ${((globalUsed / GLOBAL_DAILY_LIMIT) * 100).toFixed(0)}% -- cache-only mode`,
      remainingDaily: GLOBAL_DAILY_LIMIT - globalUsed,
      remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
    };
  }

  // Consumer budget check with borrowing
  let effectiveLimit = budget.dailyLimit;
  if (usedByConsumer >= budget.dailyLimit && budget.canBorrow) {
    // Try to borrow from reserve
    const reserveUsed = state.daily.byConsumer["reserve"] || 0;
    const reserveAvailable = BUDGETS["reserve"].dailyLimit - reserveUsed;
    if (reserveAvailable > 0) {
      effectiveLimit = budget.dailyLimit + reserveAvailable;
    }

    // P1 can also borrow from P2 unused
    if (budget.priority === 1) {
      const twitterUsed = state.daily.byConsumer["twitter-bot"] || 0;
      const twitterAvailable = BUDGETS["twitter-bot"].dailyLimit - twitterUsed;
      if (twitterAvailable > 0) {
        effectiveLimit += twitterAvailable;
      }
    }
  }

  if (usedByConsumer >= effectiveLimit) {
    return {
      allowed: false,
      reason: `Consumer "${consumer}" daily limit reached (${usedByConsumer}/${effectiveLimit})`,
      remainingDaily: 0,
      remainingHourly: 0,
    };
  }

  return {
    allowed: true,
    remainingDaily: effectiveLimit - usedByConsumer,
    remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
  };
}

export function recordRequest(
  consumer: string,
  endpoint: string,
  rateInfo: RateLimitInfo | null
): void {
  const state = loadRateState();

  state.daily.total++;
  state.daily.byEndpoint[endpoint] = (state.daily.byEndpoint[endpoint] || 0) + 1;
  state.daily.byConsumer[consumer] = (state.daily.byConsumer[consumer] || 0) + 1;
  state.hourly.total++;
  state.monthly.total++;

  if (rateInfo) {
    state.lastApiRateInfo = rateInfo;
  }

  saveRateState(state);
}

// Time helpers
function today(): string { return new Date().toISOString().slice(0, 10); }
function currentHour(): string { return new Date().toISOString().slice(0, 13); }
function currentMonth(): string { return new Date().toISOString().slice(0, 7); }
```

---

## Core Client (`FeedlyClient.ts`)

The core client is the single point of contact with the Feedly API. All HTTP requests flow through it. It composes the cache and rate budget.

```typescript
#!/usr/bin/env bun
/**
 * FeedlyClient.ts -- Core Feedly API client
 *
 * Single responsibility: HTTP transport, auth, URL encoding, rate tracking.
 * Does NOT contain business logic -- that lives in the facades.
 *
 * Usage (CLI):
 *   bun FeedlyClient.ts profile                              # Account info
 *   bun FeedlyClient.ts trending                              # Top 25 trending CVEs
 *   bun FeedlyClient.ts dashboard                             # Vulnerability dashboard
 *   bun FeedlyClient.ts cve CVE-2024-12345                    # Full CVE enrichment
 *   bun FeedlyClient.ts actor <entity-id>                     # Threat actor profile
 *   bun FeedlyClient.ts malware <entity-id>                   # Malware profile
 *   bun FeedlyClient.ts tags                                  # Team folders/boards
 *   bun FeedlyClient.ts stream <stream-id> [--count 20]       # Articles from stream
 *   bun FeedlyClient.ts budget                                # Show rate budget status
 *   bun FeedlyClient.ts cache-stats                           # Cache hit/miss stats
 *   bun FeedlyClient.ts purge                                 # Purge expired cache
 *   bun FeedlyClient.ts --help
 *
 * Environment:
 *   FEEDLY_ACCESS_TOKEN in ~/.claude/.env
 */

import { readFileSync, appendFileSync, existsSync } from "fs";
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
  FeedlyStreamResponse,
} from "./Types";

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = "https://feedly.com";
const ENV_PATH = join(homedir(), ".claude", ".env");
const LOG_PATH = join(import.meta.dir, "Data", "request-log.jsonl");

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
  consumer: string;         // Who is making this request
  category: EndpointCategory;
  forceRefresh?: boolean;   // Bypass cache
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
    throw new RateLimitError(budget.reason || "Rate limit exceeded");
  }

  if (budget.cacheOnly) {
    // Try cache even if expired (stale data > no data)
    const stale = Cache.get<T>(options.category, path, bodyStr);
    if (stale !== null) {
      logRequest(path, method, options.consumer, true, 200, 0, null);
      return stale;  // Return stale cached data
    }
    // No cache at all -- allow the request anyway but log warning
    console.error(`[WARN] Cache-only mode but no cached data for ${path}`);
  }

  // 3. Make the API call
  const token = loadToken();
  const url = `${BASE_URL}${path}`;
  const start = performance.now();

  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  const latency = Math.round(performance.now() - start);
  const rateInfo = parseRateHeaders(response.headers);

  // 4. Record the request
  RateBudget.recordRequest(options.consumer, options.category, rateInfo);
  logRequest(path, method, options.consumer, false, response.status, latency, rateInfo);

  // 5. Handle errors
  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited by API -- emergency brake
      throw new RateLimitError(
        `Feedly API returned 429. Rate info: ${JSON.stringify(rateInfo)}`
      );
    }
    const errorBody = await response.text();
    throw new FeedlyApiError(response.status, errorBody, path);
  }

  // 6. Parse and cache
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

export async function getTrending(consumer = "manual"): Promise<FeedlyTrendingCVE[]> {
  return request("GET", "/v3/memes/vulnerabilities/en", { consumer, category: "trending" });
}

export async function getDashboard(consumer = "manual"): Promise<FeedlyDashboard> {
  return request("POST", "/v3/trends/vulnerability-dashboard", {
    consumer, category: "dashboard",
  });
}

export async function getCVE(cveId: string, consumer = "manual"): Promise<FeedlyCVEEntity> {
  // Normalize: accept "CVE-2024-12345" or just the ID
  const normalized = cveId.startsWith("CVE-") ? cveId : `CVE-${cveId}`;
  return request("GET", `/v3/entities/${normalized}`, { consumer, category: "cve-entity" });
}

export async function getThreatActor(entityId: string, consumer = "manual"): Promise<FeedlyThreatActor> {
  const encoded = encodeEntityId(entityId);
  return request("GET", `/v3/entities/${encoded}`, { consumer, category: "threat-actor" });
}

export async function getMalware(entityId: string, consumer = "manual"): Promise<FeedlyMalware> {
  const encoded = encodeEntityId(entityId);
  return request("GET", `/v3/entities/${encoded}`, { consumer, category: "malware" });
}

export async function getTags(consumer = "manual"): Promise<unknown> {
  return request("GET", "/v3/tags", { consumer, category: "tags" });
}

export async function getStream(
  streamId: string,
  count = 20,
  consumer = "manual"
): Promise<FeedlyStreamResponse> {
  const encoded = encodeURIComponent(streamId);
  return request(
    "GET",
    `/v3/streams/contents?streamId=${encoded}&count=${count}`,
    { consumer, category: "stream" }
  );
}

export async function batchGetArticles(
  entryIds: string[],
  consumer = "manual"
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
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
}

// ============================================================================
// CLI Interface
// ============================================================================

async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help") {
    console.log(`FeedlyClient.ts -- Feedly Threat Intelligence API Client

Usage:
  bun FeedlyClient.ts profile                        Account info + rate limits
  bun FeedlyClient.ts trending                        Top 25 trending CVEs
  bun FeedlyClient.ts dashboard                       Vulnerability dashboard
  bun FeedlyClient.ts cve <CVE-ID>                    Full CVE enrichment
  bun FeedlyClient.ts actor <entity-id>               Threat actor profile
  bun FeedlyClient.ts malware <entity-id>             Malware profile
  bun FeedlyClient.ts tags                            Team folders/boards
  bun FeedlyClient.ts stream <stream-id> [--count N]  Articles from stream
  bun FeedlyClient.ts budget                          Rate budget status
  bun FeedlyClient.ts cache-stats                     Cache statistics
  bun FeedlyClient.ts purge                           Purge expired cache entries
  bun FeedlyClient.ts --help

Rate Budget:
  Daily: 1,667 (CyberOps: 1,000 | Twitter: 500 | Reserve: 167)
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
      case "budget": {
        const state = RateBudget.loadRateState();
        console.log("Rate Budget Status");
        console.log("=".repeat(50));
        console.log(`Date: ${state.daily.date}`);
        console.log(`Daily total: ${state.daily.total} / ${1667}`);
        console.log(`Hourly total: ${state.hourly.total}`);
        console.log(`Monthly total: ${state.monthly.total}`);
        console.log("\nBy consumer:");
        for (const [k, v] of Object.entries(state.daily.byConsumer)) {
          console.log(`  ${k}: ${v}`);
        }
        console.log("\nBy endpoint:");
        for (const [k, v] of Object.entries(state.daily.byEndpoint)) {
          console.log(`  ${k}: ${v}`);
        }
        if (state.lastApiRateInfo) {
          console.log("\nAPI Rate Headers (last seen):");
          console.log(`  Used: ${state.lastApiRateInfo.count}/${state.lastApiRateInfo.limit}`);
          console.log(`  Remaining: ${state.lastApiRateInfo.remaining}`);
          console.log(`  Percent: ${state.lastApiRateInfo.percentUsed.toFixed(1)}%`);
        }
        break;
      }
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
        console.error(`Unknown command: ${command}`);
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

// Run CLI if executed directly
if (import.meta.main) {
  await cli();
}
```

---

## Consumer Facades

### TwitterBot Facade (`Facades/TwitterBotFacade.ts`)

```typescript
#!/usr/bin/env bun
/**
 * TwitterBotFacade.ts -- Feedly data shaped for tweet composition
 *
 * Usage:
 *   bun TwitterBotFacade.ts trending-intel          # Top CVEs ready for tweets
 *   bun TwitterBotFacade.ts daily-package           # Full daily content package
 *   bun TwitterBotFacade.ts cve-context <CVE-ID>    # Single CVE with tweet angle
 *
 * This facade:
 * - Calls FeedlyClient with consumer="twitter-bot"
 * - Filters for federal-compliance relevance
 * - Scores CVEs by tweet-worthiness (exploited > trending > high CVSS)
 * - Packages results as TweetIntelPackage objects
 */

import * as Feedly from "../FeedlyClient";
import type { FeedlyTrendingCVE, TweetIntelPackage } from "../Types";

const CONSUMER = "twitter-bot";

/** Federal sectors -- CVEs affecting these get priority */
const FEDERAL_VENDORS = [
  "microsoft", "cisco", "vmware", "palo alto", "fortinet",
  "adobe", "oracle", "sap", "citrix", "ivanti", "juniper",
  "f5", "barracuda", "sonicwall", "zyxel",
];

function scoreCVE(cve: FeedlyTrendingCVE): number {
  let score = 0;
  if (cve.exploitedInTheWild) score += 50;
  if (cve.trending) score += 30;
  if (cve.epssScore && cve.epssScore > 0.5) score += 25;
  if ((cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) score += 20;
  if ((cve.cvssV4 || cve.cvssV3 || 0) >= 7.0) score += 10;
  if (cve.relatedThreatActors?.length) score += 15;
  if (cve.relatedMalware?.length) score += 10;
  if (!cve.patched) score += 10;  // Unpatched = more urgent

  // Federal relevance bonus
  const vendors = (cve.affectedProducts || []).map(p => p.vendor.toLowerCase());
  if (vendors.some(v => FEDERAL_VENDORS.some(fv => v.includes(fv)))) {
    score += 20;
  }

  return score;
}

function determineUrgency(cve: FeedlyTrendingCVE): "critical" | "high" | "medium" {
  if (cve.exploitedInTheWild && (cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) return "critical";
  if (cve.exploitedInTheWild || (cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) return "high";
  return "medium";
}

function federalRelevance(cve: FeedlyTrendingCVE): string {
  const parts: string[] = [];
  if (cve.exploitedInTheWild) parts.push("actively exploited -- CISA KEV candidate");
  if (cve.relatedThreatActors?.length) {
    parts.push(`linked to ${cve.relatedThreatActors.map(a => a.label).join(", ")}`);
  }
  const vendors = (cve.affectedProducts || []).map(p => p.vendor);
  if (vendors.length) parts.push(`affects ${vendors.join(", ")}`);
  if (!cve.patched) parts.push("no patch available");

  return parts.join("; ") || "Trending in threat intelligence feeds";
}

export async function getTrendingIntel(limit = 5): Promise<TweetIntelPackage[]> {
  const trending = await Feedly.getTrending(CONSUMER);

  return trending
    .map(cve => ({ cve, score: scoreCVE(cve) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cve }) => ({
      cve,
      tweetAngle: cve.soWhat || cve.executiveSummary || cve.description,
      urgency: determineUrgency(cve),
      federalRelevance: federalRelevance(cve),
      relatedContext: {
        actorNames: (cve.relatedThreatActors || []).map(a => a.label),
        malwareFamilies: (cve.relatedMalware || []).map(m => m.label),
        affectedVendors: (cve.affectedProducts || []).map(p => p.vendor),
      },
    }));
}

export async function getDailyPackage(): Promise<{
  topCVEs: TweetIntelPackage[];
  dashboard: Awaited<ReturnType<typeof Feedly.getDashboard>>;
}> {
  const [topCVEs, dashboard] = await Promise.all([
    getTrendingIntel(10),
    Feedly.getDashboard(CONSUMER),
  ]);

  return { topCVEs, dashboard };
}

// CLI
if (import.meta.main) {
  const cmd = process.argv[2];
  switch (cmd) {
    case "trending-intel":
      console.log(JSON.stringify(await getTrendingIntel(), null, 2));
      break;
    case "daily-package":
      console.log(JSON.stringify(await getDailyPackage(), null, 2));
      break;
    case "cve-context": {
      const cveId = process.argv[3];
      if (!cveId) { console.error("Usage: cve-context <CVE-ID>"); process.exit(1); }
      const cve = await Feedly.getCVE(cveId, CONSUMER);
      console.log(JSON.stringify(cve, null, 2));
      break;
    }
    default:
      console.log(`TwitterBotFacade.ts

Usage:
  bun TwitterBotFacade.ts trending-intel        Top tweet-worthy CVEs
  bun TwitterBotFacade.ts daily-package         Full daily content package
  bun TwitterBotFacade.ts cve-context <CVE-ID>  CVE with federal context`);
  }
}
```

### CyberOps Facade (`Facades/CyberOpsFacade.ts`)

```typescript
#!/usr/bin/env bun
/**
 * CyberOpsFacade.ts -- Feedly data shaped for cyber operations intel
 *
 * Usage:
 *   bun CyberOpsFacade.ts enrich <CVE-ID>           # Full CVE enrichment with actors + malware
 *   bun CyberOpsFacade.ts actor <name-or-id>         # Threat actor deep profile
 *   bun CyberOpsFacade.ts malware <name-or-id>       # Malware profile
 *   bun CyberOpsFacade.ts iocs <CVE-ID>              # IoCs from CVE + related entities
 *   bun CyberOpsFacade.ts daily-digest               # Full daily intel digest
 *
 * This facade:
 * - Calls FeedlyClient with consumer="cyber-ops"
 * - Follows relationship chains (CVE -> actors -> malware -> IoCs)
 * - Produces EnrichedCVE objects with full context
 * - Generates STIX 2.1 bundles for IoC sharing
 */

import * as Feedly from "../FeedlyClient";
import type {
  EnrichedCVE,
  FeedlyCVEEntity,
  FeedlyThreatActor,
  FeedlyMalware,
  STIXBundle,
  STIXObject,
  IoC,
} from "../Types";
import { randomUUID } from "crypto";

const CONSUMER = "cyber-ops";

/**
 * Enrich a CVE by following its relationship graph:
 * CVE -> related threat actors -> related malware
 *
 * Budget cost: 1 (CVE) + N (actors) + M (malware) requests
 * With 7-day cache on actors/malware, repeat enrichments cost 1 request.
 */
export async function enrichCVE(cveId: string): Promise<EnrichedCVE> {
  const cve = await Feedly.getCVE(cveId, CONSUMER);

  // Follow actor relationships
  const actors: FeedlyThreatActor[] = [];
  for (const ref of cve.relatedThreatActors || []) {
    try {
      const actor = await Feedly.getThreatActor(ref.id, CONSUMER);
      actors.push(actor);
    } catch (err) {
      console.error(`Failed to fetch actor ${ref.label}: ${err}`);
    }
  }

  // Follow malware relationships
  const malware: FeedlyMalware[] = [];
  for (const ref of cve.relatedMalware || []) {
    try {
      const mal = await Feedly.getMalware(ref.id, CONSUMER);
      malware.push(mal);
    } catch (err) {
      console.error(`Failed to fetch malware ${ref.label}: ${err}`);
    }
  }

  // Generate STIX bundle
  const stixBundle = buildSTIXBundle(cve, actors, malware);

  return { cve, actors, malware, stixBundle };
}

/**
 * Collect all IoCs across a CVE's relationship graph.
 */
export async function collectIoCs(cveId: string): Promise<{
  cveId: string;
  iocs: IoC[];
  sources: string[];
}> {
  const enriched = await enrichCVE(cveId);
  const allIocs: IoC[] = [];
  const sources: string[] = [cveId];

  for (const actor of enriched.actors) {
    if (actor.iocs?.length) {
      allIocs.push(...actor.iocs);
      sources.push(actor.label);
    }
  }
  for (const mal of enriched.malware) {
    if (mal.iocs?.length) {
      allIocs.push(...mal.iocs);
      sources.push(mal.label);
    }
  }

  // Deduplicate by type+value
  const seen = new Set<string>();
  const unique = allIocs.filter(ioc => {
    const key = `${ioc.type}:${ioc.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { cveId, iocs: unique, sources };
}

/**
 * Daily digest: trending CVEs enriched with full context.
 * Budget-aware: enriches top 5 by default.
 */
export async function dailyDigest(limit = 5): Promise<{
  date: string;
  enrichedCVEs: EnrichedCVE[];
  actorSummary: Array<{ name: string; cveCount: number; motivation?: string }>;
}> {
  const trending = await Feedly.getTrending(CONSUMER);

  // Take top N by severity
  const top = trending
    .sort((a, b) => {
      const aScore = (a.exploitedInTheWild ? 100 : 0) + (a.cvssV4 || a.cvssV3 || 0) * 10;
      const bScore = (b.exploitedInTheWild ? 100 : 0) + (b.cvssV4 || b.cvssV3 || 0) * 10;
      return bScore - aScore;
    })
    .slice(0, limit);

  const enrichedCVEs: EnrichedCVE[] = [];
  for (const cve of top) {
    try {
      const enriched = await enrichCVE(cve.cveid);
      enrichedCVEs.push(enriched);
    } catch (err) {
      console.error(`Failed to enrich ${cve.cveid}: ${err}`);
    }
  }

  // Summarize actors across all enriched CVEs
  const actorMap = new Map<string, { count: number; motivation?: string }>();
  for (const e of enrichedCVEs) {
    for (const actor of e.actors) {
      const existing = actorMap.get(actor.label) || { count: 0 };
      existing.count++;
      existing.motivation = actor.motivation;
      actorMap.set(actor.label, existing);
    }
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    enrichedCVEs,
    actorSummary: Array.from(actorMap.entries())
      .map(([name, info]) => ({ name, cveCount: info.count, motivation: info.motivation }))
      .sort((a, b) => b.cveCount - a.cveCount),
  };
}

// ============================================================================
// STIX 2.1 Bundle Generation
// ============================================================================

function buildSTIXBundle(
  cve: FeedlyCVEEntity,
  actors: FeedlyThreatActor[],
  malware: FeedlyMalware[],
): STIXBundle {
  const objects: STIXObject[] = [];
  const now = new Date().toISOString();

  // Vulnerability object
  objects.push({
    type: "vulnerability",
    spec_version: "2.1",
    id: `vulnerability--${randomUUID()}`,
    created: now,
    modified: now,
    name: cve.cveid,
    description: cve.description,
    external_references: [
      { source_name: "cve", external_id: cve.cveid },
    ],
  });

  // Threat actor objects
  for (const actor of actors) {
    objects.push({
      type: "threat-actor",
      spec_version: "2.1",
      id: `threat-actor--${randomUUID()}`,
      created: now,
      modified: now,
      name: actor.label,
      description: actor.description,
      aliases: actor.aliases,
      primary_motivation: actor.motivation?.toLowerCase(),
      goals: actor.targetSectors,
    });
  }

  // Malware objects
  for (const mal of malware) {
    objects.push({
      type: "malware",
      spec_version: "2.1",
      id: `malware--${randomUUID()}`,
      created: now,
      modified: now,
      name: mal.label,
      description: mal.description,
      malware_types: mal.type ? [mal.type] : [],
      is_family: true,
    });
  }

  // IoC indicators
  const allIocs = [
    ...actors.flatMap(a => a.iocs || []),
    ...malware.flatMap(m => m.iocs || []),
  ];

  for (const ioc of allIocs) {
    const patternMap: Record<string, string> = {
      "ip": `[ipv4-addr:value = '${ioc.value}']`,
      "domain": `[domain-name:value = '${ioc.value}']`,
      "url": `[url:value = '${ioc.value}']`,
      "hash-sha256": `[file:hashes.'SHA-256' = '${ioc.value}']`,
      "hash-sha1": `[file:hashes.'SHA-1' = '${ioc.value}']`,
      "hash-md5": `[file:hashes.MD5 = '${ioc.value}']`,
      "email": `[email-addr:value = '${ioc.value}']`,
    };

    if (patternMap[ioc.type]) {
      objects.push({
        type: "indicator",
        spec_version: "2.1",
        id: `indicator--${randomUUID()}`,
        created: now,
        modified: now,
        name: `${ioc.type}: ${ioc.value}`,
        pattern_type: "stix",
        pattern: patternMap[ioc.type],
        valid_from: ioc.firstSeen || now,
        indicator_types: ["malicious-activity"],
      });
    }
  }

  return {
    type: "bundle",
    id: `bundle--${randomUUID()}`,
    objects,
  };
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const cmd = process.argv[2];
  switch (cmd) {
    case "enrich": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: enrich <CVE-ID>"); process.exit(1); }
      console.log(JSON.stringify(await enrichCVE(id), null, 2));
      break;
    }
    case "actor": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: actor <entity-id>"); process.exit(1); }
      console.log(JSON.stringify(await Feedly.getThreatActor(id, CONSUMER), null, 2));
      break;
    }
    case "malware": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: malware <entity-id>"); process.exit(1); }
      console.log(JSON.stringify(await Feedly.getMalware(id, CONSUMER), null, 2));
      break;
    }
    case "iocs": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: iocs <CVE-ID>"); process.exit(1); }
      console.log(JSON.stringify(await collectIoCs(id), null, 2));
      break;
    }
    case "daily-digest": {
      const limit = parseInt(process.argv[3] || "5");
      console.log(JSON.stringify(await dailyDigest(limit), null, 2));
      break;
    }
    default:
      console.log(`CyberOpsFacade.ts

Usage:
  bun CyberOpsFacade.ts enrich <CVE-ID>          Full CVE enrichment
  bun CyberOpsFacade.ts actor <entity-id>          Threat actor profile
  bun CyberOpsFacade.ts malware <entity-id>        Malware profile
  bun CyberOpsFacade.ts iocs <CVE-ID>              Collect IoCs from relationship graph
  bun CyberOpsFacade.ts daily-digest [limit]       Daily intel digest (default: top 5)`);
  }
}
```

---

## Error Handling Strategy

### Error Hierarchy

```
Error
  +-- RateLimitError        (exit code 2)
  |     Cause: Budget exhausted OR API 429
  |     Recovery: Return cached data, wait for reset
  |
  +-- FeedlyApiError        (exit code 3)
  |     Cause: 4xx/5xx from API
  |     Recovery: Log, return cached if available, surface to consumer
  |
  +-- CacheError            (exit code 0, non-fatal)
        Cause: Corrupt cache file, disk full
        Recovery: Delete bad entry, proceed with API call
```

### Graceful Degradation Ladder

| Condition | Behavior |
|-----------|----------|
| Budget at 0-84% | Normal operation |
| Budget at 85-89% | Cache-only mode (return stale data, avoid API calls) |
| Budget at 90%+ | Hard stop (block all non-profile requests) |
| API returns 429 | Emergency brake -- block all requests, log warning |
| API returns 5xx | Retry once after 5s, then return cached data |
| API returns 401 | Token expired -- surface error, do not retry |
| Cache corrupt | Delete entry, make fresh API call |
| No cache + no budget | Return error to consumer (cannot serve request) |

### The Circuit Breaker

If the API returns 5 consecutive errors (any type) within a 10-minute window, trip the circuit breaker. All requests fail-fast for 15 minutes, then attempt a single probe request. If the probe succeeds, reset. If it fails, extend the wait to 30 minutes.

This protects the shared DOE account from retry storms.

---

## Integration Points

### TwitterBot Integration

The existing `skills/TwitterBot/Tools/RegulatoryMonitor.ts` currently delegates source scanning to WebFetch/Research agents. FeedlyClient replaces this for CVE-specific content:

```
[Current Flow]
RegulatoryMonitor.ts scan -> manual WebFetch -> manual findings -> generate tweets

[New Flow]
TwitterBotFacade.ts trending-intel -> scored TweetIntelPackage[] -> RegulatoryMonitor add-finding
TwitterBotFacade.ts daily-package -> full dashboard + top CVEs -> content pipeline
```

The integration point is RegulatoryMonitor's `add-finding` command. The TwitterBotFacade outputs findings in the format RegulatoryMonitor already accepts.

### Cyber Ops Integration

New consumer. No existing integration point. CyberOpsFacade is self-contained and CLI-first. Future integration:

1. **Daily cron**: `bun CyberOpsFacade.ts daily-digest > /path/to/MEMORY/WORK/daily-intel/YYYY-MM-DD.json`
2. **On-demand enrichment**: Agent calls `bun CyberOpsFacade.ts enrich CVE-2024-XXXXX` during OSINT investigations
3. **STIX export**: IoC bundles can be fed into any STIX-compatible tool or shared with SOC teams

---

## Request Budget Scenarios

### Scenario 1: Normal Day (TwitterBot + CyberOps)

```
TwitterBot (scheduled, 2x/day):
  trending-intel:    1 API call (trending endpoint, cached 1hr)
  daily-package:     2 API calls (trending + dashboard)
  cve-context x3:    3 API calls (individual CVE enrichment)
  Subtotal: ~8 calls/day (cache serves most repeats)

CyberOps (on-demand + daily digest):
  daily-digest(5):   1 trending + 5 CVE + ~8 actors + ~5 malware = ~19 calls
  ad-hoc enrich x3:  3 CVE + ~4 actors + ~3 malware = ~10 calls (many cached)
  Subtotal: ~29 calls/day

Total: ~37 calls/day (2.2% of daily budget)
```

Cache does most of the work. The 7-day TTL on actor/malware profiles means a popular actor (e.g., Volt Typhoon) is fetched once per week regardless of how many CVEs reference it.

### Scenario 2: Incident Day (heavy CyberOps)

```
CyberOps (responding to major vuln):
  Enrich 20 CVEs:     20 CVE + ~30 actors + ~15 malware = ~65 calls
  IoC collection x10: Mostly cached from enrichment = ~5 new calls
  Ad-hoc lookups:     ~20 calls
  Subtotal: ~90 calls

TwitterBot (urgent posting):
  Extra trending checks: 3 calls (hourly cache refresh)
  Extra CVE context: 5 calls
  Subtotal: ~8 calls

Total: ~98 calls/day (5.9% of daily budget)
```

Even on an incident day, we use under 6% of the budget. The constraint is real but the cache strategy makes it manageable.

---

## Configuration Files

### `Config/rate-budget.yaml`

```yaml
# Rate budget allocation for Feedly API
# Total monthly: 100,000 (shared DOE Enterprise)
# Our budget: 50,000/month (~1,667/day)

global:
  monthly_budget: 50000
  daily_budget: 1667
  hourly_budget: 69
  soft_cap_percent: 85   # Cache-only mode
  hard_cap_percent: 90   # Block all requests

consumers:
  cyber-ops:
    daily_limit: 1000
    hourly_limit: 42
    priority: 1
    can_borrow: true

  twitter-bot:
    daily_limit: 500
    hourly_limit: 21
    priority: 2
    can_borrow: false

  reserve:
    daily_limit: 167
    hourly_limit: 7
    priority: 3
    can_borrow: false

circuit_breaker:
  consecutive_errors: 5
  window_minutes: 10
  cooldown_minutes: 15
  extended_cooldown_minutes: 30
```

### `Config/cache-ttls.yaml`

```yaml
# Cache TTLs per endpoint category
# Values in seconds

trending: 3600          # 1 hour
dashboard: 7200         # 2 hours
cve-entity: 86400       # 24 hours
threat-actor: 604800    # 7 days
malware: 604800         # 7 days
stream: 1800            # 30 minutes
tags: 86400             # 24 hours
profile: 3600           # 1 hour
batch-articles: 21600   # 6 hours
```

---

## Implementation Plan

### Phase 1: Core (Day 1)
- [P] `Types.ts` -- all interfaces
- [P] `Cache.ts` -- filesystem cache with TTL
- [P] `RateBudget.ts` -- budget allocator with persistence
- `FeedlyClient.ts` -- core client composing cache + budget
- Test: `bun FeedlyClient.ts profile` succeeds, rate tracked, cache works

### Phase 2: Facades (Day 2)
- [P] `Facades/TwitterBotFacade.ts` -- trending intel, daily package
- [P] `Facades/CyberOpsFacade.ts` -- enrichment, IoCs, STIX, daily digest
- Test: Both facades produce correct output, budget tracked by consumer

### Phase 3: Integration (Day 3)
- Wire TwitterBotFacade into RegulatoryMonitor findings pipeline
- Set up daily cron for CyberOps digest
- Write `SKILL.md` for FeedlyClient skill
- End-to-end test: trending -> tweet content -> post queue

### Phase 4: Hardening (Day 4+)
- Circuit breaker implementation
- Request log analysis tooling
- Cache warming strategy (pre-fetch trending on startup)
- Budget alerting (notify when approaching limits)

**[P]** marks items that can be implemented in parallel.

---

## Trade-offs and Decisions

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Cache backend | Filesystem JSON | SQLite, Redis | Zero dependencies, inspectable, git-friendly. Performance sufficient for ~100 entries. |
| Module structure | Multi-file | Single monolith | Testable, composable, each file < 200 lines. Consistent with SecurityPoller pattern. |
| Rate tracking | Dual (local counter + API headers) | API headers only | Local gives prediction/budget enforcement. API gives ground truth. Belt and suspenders. |
| Consumer isolation | Facades with consumer tag | Shared client, no tracking | Budget accountability requires knowing WHO spent the budget. |
| STIX generation | In-process, minimal | External STIX library | Avoid dependency. We need basic bundles, not full STIX tooling. |
| Entity ID encoding | `encodeURIComponent` in client | Consumer responsibility | Single encoding point prevents double-encoding bugs. |
| Stale cache behavior | Return stale when budget exhausted | Error when budget exhausted | Stale data > no data for intel consumers. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Exceed shared rate limit | Low | High (degrades DOE users) | Dual tracking, 85% soft cap, 90% hard stop |
| Token expiration | Medium | Medium (all calls fail) | 401 detection, clear error message, manual token refresh |
| Cache corruption | Low | Low (single entry) | Delete and re-fetch. No cascading failure. |
| API response schema change | Medium | Medium (type mismatches) | Loose typing on optional fields, graceful fallbacks |
| Entity ID format change | Low | High (all entity lookups fail) | Encoding function is isolated, easy to update |
| Concurrent access (multiple agents) | Medium | Low (counter race) | File-based state is atomic at OS level for single writes |

---

## File Paths (Absolute)

```
/home/christauff/.claude/skills/FeedlyClient/ARCHITECTURE.md
/home/christauff/.claude/skills/FeedlyClient/SKILL.md
/home/christauff/.claude/skills/FeedlyClient/Types.ts
/home/christauff/.claude/skills/FeedlyClient/Cache.ts
/home/christauff/.claude/skills/FeedlyClient/RateBudget.ts
/home/christauff/.claude/skills/FeedlyClient/FeedlyClient.ts
/home/christauff/.claude/skills/FeedlyClient/Facades/TwitterBotFacade.ts
/home/christauff/.claude/skills/FeedlyClient/Facades/CyberOpsFacade.ts
/home/christauff/.claude/skills/FeedlyClient/Config/rate-budget.yaml
/home/christauff/.claude/skills/FeedlyClient/Config/cache-ttls.yaml
/home/christauff/.claude/skills/FeedlyClient/Data/cache/              (auto-created)
/home/christauff/.claude/skills/FeedlyClient/Data/rate-state.json     (auto-created)
/home/christauff/.claude/skills/FeedlyClient/Data/request-log.jsonl   (auto-created)
```

/**
 * Cache.ts — Filesystem cache with TTL enforcement
 *
 * Storage layout: Data/cache/{category}/{key}.json
 * Each file contains a CacheEntry<T> with metadata.
 * Keys are SHA-256 hashes of the request URL + body.
 *
 * Design decisions:
 * - Filesystem over SQLite: zero deps, inspectable, git-friendly
 * - One file per entry: atomic reads/writes, no corruption risk
 * - Hash-based keys: safe filenames, deduplication
 * - TTL in the entry: no separate expiry tracking needed
 */

import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import type { CacheEntry, EndpointCategory } from "./Types";

const CACHE_DIR = join(import.meta.dir, "Data", "cache");

/** TTL in milliseconds per endpoint category */
const TTL_MAP: Record<EndpointCategory, number> = {
  "trending":         60 * 60 * 1000,            // 1 hour
  "dashboard":        2 * 60 * 60 * 1000,        // 2 hours
  "cve-entity":       24 * 60 * 60 * 1000,       // 24 hours
  "threat-actor":     7 * 24 * 60 * 60 * 1000,   // 7 days
  "malware":          7 * 24 * 60 * 60 * 1000,   // 7 days
  "trending-actors":  60 * 60 * 1000,            // 1 hour
  "trending-malware": 60 * 60 * 1000,            // 1 hour
  "entity-search":    24 * 60 * 60 * 1000,       // 24 hours
  "actor-relations":  24 * 60 * 60 * 1000,       // 24 hours
  "detection-rules":  7 * 24 * 60 * 60 * 1000,   // 7 days
  "search":           30 * 60 * 1000,            // 30 minutes
  "stream":           30 * 60 * 1000,            // 30 minutes
  "ioc":              6 * 60 * 60 * 1000,        // 6 hours
  "tags":             24 * 60 * 60 * 1000,       // 24 hours
  "profile":          60 * 60 * 1000,            // 1 hour
  "batch-articles":   6 * 60 * 60 * 1000,        // 6 hours
};

function cacheKey(endpoint: string, body?: string): string {
  const hash = createHash("sha256");
  hash.update(endpoint);
  if (body) hash.update(body);
  return hash.digest("hex").slice(0, 16);
}

export function get<T>(
  category: EndpointCategory,
  endpoint: string,
  body?: string,
): T | null {
  const key = cacheKey(endpoint, body);
  const path = join(CACHE_DIR, category, `${key}.json`);

  if (!existsSync(path)) return null;

  try {
    const entry: CacheEntry<T> = JSON.parse(readFileSync(path, "utf-8"));
    const now = Date.now();
    const expires = new Date(entry.expiresAt).getTime();

    if (now > expires) {
      unlinkSync(path);
      return null;
    }

    return entry.data;
  } catch {
    // Corrupted cache entry — remove it
    try { unlinkSync(path); } catch { /* ignore */ }
    return null;
  }
}

/** Get even if expired (for stale-while-revalidate / budget-exhausted scenarios) */
export function getStale<T>(
  category: EndpointCategory,
  endpoint: string,
  body?: string,
): T | null {
  const key = cacheKey(endpoint, body);
  const path = join(CACHE_DIR, category, `${key}.json`);

  if (!existsSync(path)) return null;

  try {
    const entry: CacheEntry<T> = JSON.parse(readFileSync(path, "utf-8"));
    return entry.data;
  } catch {
    try { unlinkSync(path); } catch { /* ignore */ }
    return null;
  }
}

export function set<T>(
  category: EndpointCategory,
  endpoint: string,
  data: T,
  body?: string,
): void {
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

/** Purge all expired entries across all categories */
export function purgeExpired(): { purged: number; remaining: number } {
  let purged = 0;
  let remaining = 0;
  const now = Date.now();

  for (const category of Object.keys(TTL_MAP)) {
    const dir = join(CACHE_DIR, category);
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
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
        unlinkSync(path);
        purged++;
      }
    }
  }

  return { purged, remaining };
}

/** Get cache statistics without purging */
export function stats(): {
  totalEntries: number;
  expired: number;
  live: number;
  byCategory: Record<string, number>;
} {
  let totalEntries = 0;
  let expired = 0;
  let live = 0;
  const byCategory: Record<string, number> = {};
  const now = Date.now();

  for (const category of Object.keys(TTL_MAP)) {
    const dir = join(CACHE_DIR, category);
    if (!existsSync(dir)) continue;

    let categoryCount = 0;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      totalEntries++;
      categoryCount++;
      try {
        const entry = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        if (now > new Date(entry.expiresAt).getTime()) {
          expired++;
        } else {
          live++;
        }
      } catch {
        expired++;
      }
    }
    if (categoryCount > 0) byCategory[category] = categoryCount;
  }

  return { totalEntries, expired, live, byCategory };
}

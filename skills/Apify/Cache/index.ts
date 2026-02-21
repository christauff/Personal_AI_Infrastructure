#!/usr/bin/env bun
/**
 * Apify Cache Layer
 *
 * In-memory cache with per-actor TTL for reducing redundant API calls.
 * Tracks hits/misses for monitoring and optimization.
 */

import { generateKey, generateUrlKey, generateSearchKey, parseKey } from './keys'
import { getTtl, DEFAULT_TTL } from './ttl'

export { generateKey, generateUrlKey, generateSearchKey } from './keys'
export { getTtl, getActorTtl, getContentTypeTtl } from './ttl'

/**
 * Cached entry with metadata
 */
export interface CacheEntry<T = any> {
  /** Cached value */
  value: T

  /** Actor ID that produced this value */
  actorId: string

  /** Cache key */
  key: string

  /** Timestamp when cached (ms since epoch) */
  cachedAt: number

  /** TTL in seconds */
  ttl: number

  /** Expiration timestamp (ms since epoch) */
  expiresAt: number

  /** Cost to fetch this data (for savings tracking) */
  fetchCost?: number

  /** Content type if known */
  contentType?: string
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number

  /** Total cache misses */
  misses: number

  /** Current number of entries */
  size: number

  /** Total entries ever cached */
  totalCached: number

  /** Total entries expired */
  totalExpired: number

  /** Estimated cost savings (USD) */
  costSavings: number

  /** Hit rate percentage */
  hitRate: number
}

/**
 * Apify Cache implementation
 */
export class ApifyCache {
  private store: Map<string, CacheEntry> = new Map()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    totalCached: 0,
    totalExpired: 0,
    costSavings: 0,
    hitRate: 0
  }

  /**
   * Get a cached value
   *
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T = any>(key: string): T | null {
    const entry = this.store.get(key)

    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.stats.size--
      this.stats.totalExpired++
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Cache hit
    this.stats.hits++
    if (entry.fetchCost) {
      this.stats.costSavings += entry.fetchCost
    }
    this.updateHitRate()

    return entry.value as T
  }

  /**
   * Set a cached value
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param actorId - Actor that produced this value
   * @param options - Cache options
   */
  set<T = any>(
    key: string,
    value: T,
    actorId: string,
    options?: {
      ttl?: number
      fetchCost?: number
      contentType?: string
    }
  ): void {
    const ttl = options?.ttl ?? getTtl(actorId, options?.contentType)
    const now = Date.now()

    const entry: CacheEntry<T> = {
      value,
      actorId,
      key,
      cachedAt: now,
      ttl,
      expiresAt: now + ttl * 1000,
      fetchCost: options?.fetchCost,
      contentType: options?.contentType
    }

    // Update size tracking
    if (!this.store.has(key)) {
      this.stats.size++
      this.stats.totalCached++
    }

    this.store.set(key, entry)
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.stats.size--
      this.stats.totalExpired++
      return false
    }

    return true
  }

  /**
   * Delete a cached entry
   */
  delete(key: string): boolean {
    if (this.store.has(key)) {
      this.store.delete(key)
      this.stats.size--
      return true
    }
    return false
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.store.clear()
    this.stats.size = 0
  }

  /**
   * Clear expired entries (garbage collection)
   *
   * @returns Number of entries cleared
   */
  clearExpired(): number {
    const now = Date.now()
    let cleared = 0

    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        cleared++
      }
    }

    this.stats.size -= cleared
    this.stats.totalExpired += cleared

    return cleared
  }

  /**
   * Clear entries for a specific actor
   */
  clearActor(actorId: string): number {
    let cleared = 0

    for (const [key, entry] of this.store) {
      if (entry.actorId === actorId) {
        this.store.delete(key)
        cleared++
      }
    }

    this.stats.size -= cleared
    return cleared
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Get all entries (for debugging)
   */
  getEntries(): CacheEntry[] {
    return Array.from(this.store.values())
  }

  /**
   * Get entries by actor
   */
  getEntriesByActor(actorId: string): CacheEntry[] {
    return Array.from(this.store.values()).filter(e => e.actorId === actorId)
  }

  /**
   * Get time until expiration for a key
   */
  getTtlRemaining(key: string): number | null {
    const entry = this.store.get(key)
    if (!entry) return null

    const remaining = entry.expiresAt - Date.now()
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }
}

// =============================================================================
// Singleton instance for shared cache
// =============================================================================

let globalCache: ApifyCache | null = null

/**
 * Get the global cache instance
 */
export function getCache(): ApifyCache {
  if (!globalCache) {
    globalCache = new ApifyCache()
  }
  return globalCache
}

/**
 * Reset the global cache (for testing)
 */
export function resetCache(): void {
  globalCache = new ApifyCache()
}

// =============================================================================
// Convenience functions
// =============================================================================

/**
 * Cache result from an actor call
 */
export function cacheResult<T>(
  actorId: string,
  params: Record<string, any>,
  result: T,
  options?: { fetchCost?: number; contentType?: string }
): string {
  const key = generateKey(actorId, params)
  getCache().set(key, result, actorId, options)
  return key
}

/**
 * Get cached result for an actor call
 */
export function getCachedResult<T>(
  actorId: string,
  params: Record<string, any>
): T | null {
  const key = generateKey(actorId, params)
  return getCache().get<T>(key)
}

/**
 * Cache result for a URL
 */
export function cacheUrlResult<T>(
  actorId: string,
  url: string,
  result: T,
  options?: { fetchCost?: number; contentType?: string }
): string {
  const key = generateUrlKey(actorId, url)
  getCache().set(key, result, actorId, options)
  return key
}

/**
 * Get cached result for a URL
 */
export function getCachedUrlResult<T>(actorId: string, url: string): T | null {
  const key = generateUrlKey(actorId, url)
  return getCache().get<T>(key)
}

// =============================================================================
// CLI: Test cache
// =============================================================================

if (import.meta.main) {
  console.log('=== Apify Cache Test ===\n')

  const cache = new ApifyCache()

  // Test basic set/get
  console.log('1. Basic set/get:')
  const key1 = generateKey('apidojo/twitter-scraper-lite', { startUrls: ['https://x.com/user'] })
  cache.set(key1, { tweets: ['hello', 'world'] }, 'apidojo/twitter-scraper-lite', { fetchCost: 0.01 })
  const result1 = cache.get(key1)
  console.log(`   Key: ${key1}`)
  console.log(`   Value: ${JSON.stringify(result1)}`)
  console.log(`   Has: ${cache.has(key1)}`)
  console.log('')

  // Test cache hit
  console.log('2. Cache hit (repeated get):')
  const result2 = cache.get(key1)
  console.log(`   Second get: ${JSON.stringify(result2)}`)
  console.log(`   Stats: ${JSON.stringify(cache.getStats())}`)
  console.log('')

  // Test cache miss
  console.log('3. Cache miss:')
  const missKey = generateKey('apidojo/twitter-scraper-lite', { startUrls: ['https://x.com/other'] })
  const result3 = cache.get(missKey)
  console.log(`   Key: ${missKey}`)
  console.log(`   Value: ${result3}`)
  console.log(`   Stats: ${JSON.stringify(cache.getStats())}`)
  console.log('')

  // Test expiration
  console.log('4. Expiration test (1 second TTL):')
  const key2 = generateKey('test/actor', { test: true })
  cache.set(key2, { data: 'expires soon' }, 'test/actor', { ttl: 1 })
  console.log(`   Immediately: ${cache.has(key2)}`)
  console.log(`   TTL remaining: ${cache.getTtlRemaining(key2)}s`)

  await new Promise(resolve => setTimeout(resolve, 1100))
  console.log(`   After 1.1s: ${cache.has(key2)}`)
  console.log('')

  // Test URL caching
  console.log('5. URL caching:')
  const urlKey = generateUrlKey('streamers/youtube-scraper', 'https://youtube.com/watch?v=abc123')
  cache.set(urlKey, { video: 'data' }, 'streamers/youtube-scraper')
  console.log(`   Key: ${urlKey}`)
  console.log(`   Value: ${JSON.stringify(cache.get(urlKey))}`)
  console.log('')

  // Final stats
  console.log('=== Final Stats ===')
  const stats = cache.getStats()
  console.log(`Hits: ${stats.hits}`)
  console.log(`Misses: ${stats.misses}`)
  console.log(`Hit Rate: ${stats.hitRate.toFixed(1)}%`)
  console.log(`Size: ${stats.size}`)
  console.log(`Cost Savings: $${stats.costSavings.toFixed(4)}`)
}

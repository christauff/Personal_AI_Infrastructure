/**
 * Cache Key Generation
 *
 * Creates deterministic, collision-free cache keys from actor + params.
 */

import { createHash } from 'crypto'

/**
 * Generate a cache key from actor ID and input parameters
 *
 * Format: {actorId}:{hash}
 *
 * @param actorId - Apify actor ID
 * @param params - Actor input parameters
 * @returns Deterministic cache key
 *
 * @example
 * generateKey('apidojo/twitter-scraper-lite', { startUrls: ['https://x.com/user'] })
 * // Returns: "apidojo/twitter-scraper-lite:a1b2c3d4"
 */
export function generateKey(actorId: string, params: Record<string, any>): string {
  // Normalize params for consistent hashing
  const normalized = normalizeParams(params)

  // Create hash of normalized params
  const hash = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 12) // First 12 chars is enough for uniqueness

  return `${actorId}:${hash}`
}

/**
 * Generate a simple key for URL-only queries
 *
 * @param actorId - Actor ID
 * @param url - Target URL
 * @returns Cache key
 */
export function generateUrlKey(actorId: string, url: string): string {
  // Normalize URL
  const normalized = normalizeUrl(url)

  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 12)

  return `${actorId}:url:${hash}`
}

/**
 * Generate a key for search queries
 *
 * @param actorId - Actor ID
 * @param query - Search query
 * @param options - Search options (limit, sort, etc.)
 * @returns Cache key
 */
export function generateSearchKey(
  actorId: string,
  query: string,
  options?: Record<string, any>
): string {
  const normalized = {
    q: query.toLowerCase().trim(),
    ...normalizeParams(options || {})
  }

  const hash = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 12)

  return `${actorId}:search:${hash}`
}

/**
 * Parse a cache key to extract components
 *
 * @param key - Cache key
 * @returns Parsed components
 */
export function parseKey(key: string): {
  actorId: string
  type: 'params' | 'url' | 'search'
  hash: string
} {
  const parts = key.split(':')

  if (parts.length === 2) {
    return {
      actorId: parts[0],
      type: 'params',
      hash: parts[1]
    }
  }

  if (parts.length === 3) {
    return {
      actorId: parts[0],
      type: parts[1] as 'url' | 'search',
      hash: parts[2]
    }
  }

  // Handle actor IDs with slashes (e.g., "apidojo/twitter-scraper-lite")
  const lastColon = key.lastIndexOf(':')
  const secondLastColon = key.lastIndexOf(':', lastColon - 1)

  if (secondLastColon > 0 && ['url', 'search'].includes(key.substring(secondLastColon + 1, lastColon))) {
    return {
      actorId: key.substring(0, secondLastColon),
      type: key.substring(secondLastColon + 1, lastColon) as 'url' | 'search',
      hash: key.substring(lastColon + 1)
    }
  }

  return {
    actorId: key.substring(0, lastColon),
    type: 'params',
    hash: key.substring(lastColon + 1)
  }
}

/**
 * Normalize parameters for consistent hashing
 * - Sorts object keys
 * - Removes undefined/null values
 * - Normalizes arrays
 */
function normalizeParams(params: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}

  // Sort keys for deterministic ordering
  const keys = Object.keys(params).sort()

  for (const key of keys) {
    const value = params[key]

    // Skip undefined/null
    if (value === undefined || value === null) continue

    // Recursively normalize objects
    if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeParams(value)
    }
    // Sort and normalize arrays
    else if (Array.isArray(value)) {
      result[key] = value.map(v =>
        typeof v === 'object' ? normalizeParams(v) : v
      ).sort((a, b) => {
        if (typeof a === 'string' && typeof b === 'string') {
          return a.localeCompare(b)
        }
        return JSON.stringify(a).localeCompare(JSON.stringify(b))
      })
    }
    // Normalize strings
    else if (typeof value === 'string') {
      result[key] = value.trim()
    }
    // Keep other values as-is
    else {
      result[key] = value
    }
  }

  return result
}

/**
 * Normalize URL for consistent caching
 * - Removes trailing slashes
 * - Sorts query parameters
 * - Lowercases hostname
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase()

    // Sort query parameters
    const params = new URLSearchParams(parsed.search)
    const sortedParams = new URLSearchParams()
    const keys = Array.from(params.keys()).sort()
    for (const key of keys) {
      sortedParams.set(key, params.get(key)!)
    }
    parsed.search = sortedParams.toString()

    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }

    return parsed.toString()
  } catch {
    // If URL parsing fails, just lowercase and trim
    return url.toLowerCase().trim()
  }
}

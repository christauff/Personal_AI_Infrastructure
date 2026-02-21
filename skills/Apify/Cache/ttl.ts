/**
 * Per-Actor TTL Configuration
 *
 * Defines cache duration based on data volatility.
 * Lower TTL for fast-changing data, higher for stable data.
 */

/**
 * Default TTL values in seconds
 */
export const DEFAULT_TTL = 3600 // 1 hour

/**
 * TTL by actor ID
 *
 * Based on data volatility:
 * - Social feeds: shorter (content changes frequently)
 * - Profiles: medium (updates occasionally)
 * - Products: medium (prices change)
 * - Business data: longer (relatively stable)
 * - Static content: longest
 */
export const ACTOR_TTL: Record<string, number> = {
  // Social Media - Feeds (short TTL, content changes fast)
  'apidojo/twitter-scraper-lite': 1800,           // 30 min - tweets flow fast
  'streamers/youtube-scraper': 3600,              // 1 hour - videos less frequent
  'apify/instagram-post-scraper': 1800,           // 30 min
  'apify/facebook-posts-scraper': 1800,           // 30 min
  'clockworks/tiktok-profile-scraper': 1800,      // 30 min

  // Social Media - Profiles (medium TTL)
  'apify/instagram-profile-scraper': 7200,        // 2 hours
  'streamers/youtube-channel-scraper': 7200,      // 2 hours
  'dev_fusion/Linkedin-Profile-Scraper': 14400,   // 4 hours

  // Social Media - Comments (medium-short TTL)
  'apify/instagram-comment-scraper': 3600,        // 1 hour
  'streamers/youtube-comments-scraper': 3600,     // 1 hour
  'apify/facebook-comments-scraper': 3600,        // 1 hour

  // E-commerce (medium TTL - prices change)
  'junglee/free-amazon-product-scraper': 7200,    // 2 hours
  'axesso_data/amazon-reviews-scraper': 14400,    // 4 hours - reviews stable
  'dtrungtin/ebay-scraper': 3600,                 // 1 hour - auctions change

  // Business Intelligence (longer TTL - stable data)
  'compass/crawler-google-places': 86400,         // 24 hours
  'compass/Google-Maps-Reviews-Scraper': 43200,   // 12 hours
  'epctex/crunchbase-scraper': 86400,             // 24 hours
  'epctex/glassdoor-scraper': 86400,              // 24 hours

  // Web Scraping (medium TTL)
  'apify/web-scraper': 3600,                      // 1 hour
  'apify/google-search-scraper': 1800,            // 30 min - SERPs change

  // Jobs (medium TTL - listings update)
  'curious_coder/linkedin-jobs-scraper': 3600,    // 1 hour
}

/**
 * TTL by content type (fallback when actor not in map)
 */
export const CONTENT_TYPE_TTL: Record<string, number> = {
  'tweet': 86400,           // 24 hours - individual tweets don't change
  'post': 86400,            // 24 hours - individual posts stable
  'video': 86400,           // 24 hours - video metadata stable
  'profile': 7200,          // 2 hours - profiles update occasionally
  'search': 1800,           // 30 min - search results change
  'product': 7200,          // 2 hours - prices/availability change
  'place': 86400,           // 24 hours - business info stable
  'hashtag': 900,           // 15 min - trending content
  'channel': 14400,         // 4 hours - channel info stable
  'unknown': 3600,          // 1 hour - default
}

/**
 * Get TTL for an actor
 */
export function getActorTtl(actorId: string): number {
  return ACTOR_TTL[actorId] ?? DEFAULT_TTL
}

/**
 * Get TTL for a content type
 */
export function getContentTypeTtl(contentType: string): number {
  return CONTENT_TYPE_TTL[contentType] ?? DEFAULT_TTL
}

/**
 * Get optimal TTL based on actor and content type
 * Uses the more specific value when available
 */
export function getTtl(actorId: string, contentType?: string): number {
  // Actor-specific TTL takes precedence
  if (ACTOR_TTL[actorId]) {
    return ACTOR_TTL[actorId]
  }

  // Fall back to content type
  if (contentType && CONTENT_TYPE_TTL[contentType]) {
    return CONTENT_TYPE_TTL[contentType]
  }

  return DEFAULT_TTL
}

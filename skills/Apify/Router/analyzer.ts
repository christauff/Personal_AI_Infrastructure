/**
 * Apify Query Analyzer
 *
 * Parses queries to extract URLs, entities, and intent.
 * Used by the router to select optimal actors.
 */

import { matchByUrl, matchByTrigger, getActors } from '../Registry/loader'
import type { ActorCategory, ActorMatch } from '../Registry/types'

/**
 * Extracted entities from a query
 */
export interface ExtractedEntities {
  /** Full URLs found in query */
  urls: ParsedUrl[]

  /** @username mentions */
  mentions: string[]

  /** #hashtag references */
  hashtags: string[]

  /** Search keywords (non-entity text) */
  keywords: string[]

  /** Location references (for business queries) */
  locations: string[]
}

/**
 * Parsed URL with platform detection
 */
export interface ParsedUrl {
  /** Original URL string */
  raw: string

  /** Detected platform (twitter, youtube, etc.) */
  platform: string | null

  /** URL type (profile, post, search, etc.) */
  type: UrlType | null

  /** Extracted identifiers */
  ids: {
    username?: string
    postId?: string
    videoId?: string
    channelId?: string
    productId?: string
    query?: string
  }
}

export type UrlType =
  | 'profile'
  | 'post'
  | 'video'
  | 'channel'
  | 'search'
  | 'product'
  | 'hashtag'
  | 'place'
  | 'unknown'

/**
 * Query intent classification
 */
export type QueryIntent = 'social' | 'business' | 'ecommerce' | 'web' | 'mixed' | 'unknown'

/**
 * Complete query analysis result
 */
export interface QueryAnalysis {
  /** Original query */
  query: string

  /** Detected intent */
  intent: QueryIntent

  /** Extracted entities */
  entities: ExtractedEntities

  /** Suggested actors with confidence scores */
  suggestedActors: ActorMatch[]

  /** Overall confidence (0-1) */
  confidence: number
}

// =============================================================================
// URL PATTERNS
// =============================================================================

const URL_PATTERNS: Record<string, { platform: string; patterns: RegExp[] }> = {
  twitter: {
    platform: 'twitter',
    patterns: [
      // Tweet: x.com/user/status/123 or twitter.com/user/status/123
      /(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i,
      // Profile: x.com/user or twitter.com/user
      /(?:twitter\.com|x\.com)\/(\w+)\/?$/i,
      // Search: twitter.com/search?q=...
      /(?:twitter\.com|x\.com)\/search\?q=([^&]+)/i,
      // Hashtag: twitter.com/hashtag/...
      /(?:twitter\.com|x\.com)\/hashtag\/(\w+)/i,
    ]
  },
  youtube: {
    platform: 'youtube',
    patterns: [
      // Video: youtube.com/watch?v=xxx or youtu.be/xxx
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
      // Channel: youtube.com/channel/xxx or youtube.com/@xxx
      /youtube\.com\/(?:channel\/([a-zA-Z0-9_-]+)|@(\w+))/i,
      // Playlist: youtube.com/playlist?list=xxx
      /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/i,
      // Search: youtube.com/results?search_query=xxx
      /youtube\.com\/results\?search_query=([^&]+)/i,
    ]
  },
  instagram: {
    platform: 'instagram',
    patterns: [
      // Post: instagram.com/p/xxx
      /instagram\.com\/p\/([a-zA-Z0-9_-]+)/i,
      // Reel: instagram.com/reel/xxx
      /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/i,
      // Profile: instagram.com/username
      /instagram\.com\/([a-zA-Z0-9_.]+)\/?$/i,
      // Hashtag: instagram.com/explore/tags/xxx
      /instagram\.com\/explore\/tags\/(\w+)/i,
    ]
  },
  linkedin: {
    platform: 'linkedin',
    patterns: [
      // Profile: linkedin.com/in/username
      /linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i,
      // Company: linkedin.com/company/xxx
      /linkedin\.com\/company\/([a-zA-Z0-9_-]+)/i,
      // Post: linkedin.com/posts/xxx
      /linkedin\.com\/posts\/([a-zA-Z0-9_-]+)/i,
      // Jobs: linkedin.com/jobs/...
      /linkedin\.com\/jobs\//i,
    ]
  },
  tiktok: {
    platform: 'tiktok',
    patterns: [
      // Video: tiktok.com/@user/video/xxx
      /tiktok\.com\/@(\w+)\/video\/(\d+)/i,
      // Profile: tiktok.com/@user
      /tiktok\.com\/@(\w+)\/?$/i,
      // Hashtag: tiktok.com/tag/xxx
      /tiktok\.com\/tag\/(\w+)/i,
    ]
  },
  facebook: {
    platform: 'facebook',
    patterns: [
      // Profile/Page: facebook.com/username or facebook.com/pages/xxx
      /facebook\.com\/([a-zA-Z0-9.]+)\/?$/i,
      // Post: facebook.com/username/posts/xxx
      /facebook\.com\/([a-zA-Z0-9.]+)\/posts\/(\d+)/i,
      // Group: facebook.com/groups/xxx
      /facebook\.com\/groups\/([a-zA-Z0-9_-]+)/i,
    ]
  },
  amazon: {
    platform: 'amazon',
    patterns: [
      // Product: amazon.com/dp/xxx or amazon.com/gp/product/xxx
      /amazon\.[a-z.]+\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
      // Search: amazon.com/s?k=xxx
      /amazon\.[a-z.]+\/s\?k=([^&]+)/i,
    ]
  },
  ebay: {
    platform: 'ebay',
    patterns: [
      // Item: ebay.com/itm/xxx
      /ebay\.[a-z.]+\/itm\/(\d+)/i,
      // Search: ebay.com/sch/i.html?_nkw=xxx
      /ebay\.[a-z.]+\/sch\/.*[?&]_nkw=([^&]+)/i,
    ]
  },
  google_maps: {
    platform: 'google-maps',
    patterns: [
      // Place: google.com/maps/place/xxx
      /google\.[a-z.]+\/maps\/place\/([^/]+)/i,
      // Search: google.com/maps/search/xxx
      /google\.[a-z.]+\/maps\/search\/([^/]+)/i,
    ]
  },
  crunchbase: {
    platform: 'crunchbase',
    patterns: [
      // Organization: crunchbase.com/organization/xxx
      /crunchbase\.com\/organization\/([a-zA-Z0-9_-]+)/i,
      // Person: crunchbase.com/person/xxx
      /crunchbase\.com\/person\/([a-zA-Z0-9_-]+)/i,
    ]
  },
  glassdoor: {
    platform: 'glassdoor',
    patterns: [
      // Company: glassdoor.com/Reviews/xxx
      /glassdoor\.[a-z.]+\/Reviews\/([^-]+)/i,
      // Salary: glassdoor.com/Salary/xxx
      /glassdoor\.[a-z.]+\/Salary\/([^-]+)/i,
    ]
  }
}

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  return text.match(urlRegex) || []
}

/**
 * Parse a URL and detect platform/type
 */
export function parseUrl(url: string): ParsedUrl {
  const result: ParsedUrl = {
    raw: url,
    platform: null,
    type: null,
    ids: {}
  }

  for (const [key, config] of Object.entries(URL_PATTERNS)) {
    for (const pattern of config.patterns) {
      const match = url.match(pattern)
      if (match) {
        result.platform = config.platform

        // Determine URL type and extract IDs based on platform
        switch (config.platform) {
          case 'twitter':
            if (url.includes('/status/')) {
              result.type = 'post'
              result.ids.username = match[1]
              result.ids.postId = match[2]
            } else if (url.includes('/hashtag/')) {
              result.type = 'hashtag'
            } else if (url.includes('/search')) {
              result.type = 'search'
              result.ids.query = decodeURIComponent(match[1] || '')
            } else {
              result.type = 'profile'
              result.ids.username = match[1]
            }
            break

          case 'youtube':
            if (url.includes('/watch') || url.includes('youtu.be')) {
              result.type = 'video'
              result.ids.videoId = match[1]
            } else if (url.includes('/channel/') || url.includes('/@')) {
              result.type = 'channel'
              result.ids.channelId = match[1] || match[2]
            } else if (url.includes('/results')) {
              result.type = 'search'
              result.ids.query = decodeURIComponent(match[1] || '')
            } else {
              result.type = 'unknown'
            }
            break

          case 'instagram':
            if (url.includes('/p/') || url.includes('/reel/')) {
              result.type = 'post'
              result.ids.postId = match[1]
            } else if (url.includes('/explore/tags/')) {
              result.type = 'hashtag'
            } else {
              result.type = 'profile'
              result.ids.username = match[1]
            }
            break

          case 'linkedin':
            if (url.includes('/in/')) {
              result.type = 'profile'
              result.ids.username = match[1]
            } else if (url.includes('/company/')) {
              result.type = 'profile'
              result.ids.username = match[1]
            } else if (url.includes('/posts/')) {
              result.type = 'post'
              result.ids.postId = match[1]
            } else if (url.includes('/jobs')) {
              result.type = 'search'
            } else {
              result.type = 'unknown'
            }
            break

          case 'tiktok':
            if (url.includes('/video/')) {
              result.type = 'video'
              result.ids.username = match[1]
              result.ids.postId = match[2]
            } else if (url.includes('/tag/')) {
              result.type = 'hashtag'
            } else {
              result.type = 'profile'
              result.ids.username = match[1]
            }
            break

          case 'facebook':
            if (url.includes('/posts/')) {
              result.type = 'post'
              result.ids.username = match[1]
              result.ids.postId = match[2]
            } else if (url.includes('/groups/')) {
              result.type = 'profile'
            } else {
              result.type = 'profile'
              result.ids.username = match[1]
            }
            break

          case 'amazon':
            if (url.includes('/dp/') || url.includes('/gp/product/')) {
              result.type = 'product'
              result.ids.productId = match[1]
            } else if (url.includes('/s?')) {
              result.type = 'search'
              result.ids.query = decodeURIComponent(match[1] || '')
            }
            break

          case 'ebay':
            if (url.includes('/itm/')) {
              result.type = 'product'
              result.ids.productId = match[1]
            } else if (url.includes('/sch/')) {
              result.type = 'search'
              result.ids.query = decodeURIComponent(match[1] || '')
            }
            break

          case 'google-maps':
            result.type = 'place'
            result.ids.query = decodeURIComponent(match[1] || '')
            break

          case 'crunchbase':
          case 'glassdoor':
            result.type = 'profile'
            result.ids.username = match[1]
            break
        }

        return result
      }
    }
  }

  // Unknown URL - mark as generic web
  result.platform = 'web'
  result.type = 'unknown'
  return result
}

/**
 * Extract @mentions from text
 */
export function extractMentions(text: string): string[] {
  // Match @username but not email addresses
  const mentionRegex = /(?:^|[^a-zA-Z0-9.@])@([a-zA-Z0-9_]{1,50})(?![a-zA-Z0-9_@.])/g
  const matches: string[] = []
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
    matches.push(match[1])
  }

  return [...new Set(matches)] // Dedupe
}

/**
 * Extract #hashtags from text
 */
export function extractHashtags(text: string): string[] {
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g
  const matches: string[] = []
  let match

  while ((match = hashtagRegex.exec(text)) !== null) {
    matches.push(match[1])
  }

  return [...new Set(matches)]
}

/**
 * Extract location references from text
 */
export function extractLocations(text: string): string[] {
  // Simple heuristic: "in/near/at [City]" or "[City], [State/Country]"
  const locationPatterns = [
    /(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /([A-Z][a-z]+),\s*([A-Z]{2}|[A-Z][a-z]+)/g,
  ]

  const locations: string[] = []
  for (const pattern of locationPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      locations.push(match[1])
    }
  }

  return [...new Set(locations)]
}

/**
 * Extract keywords (remaining text after removing entities)
 */
export function extractKeywords(
  text: string,
  urls: string[],
  mentions: string[],
  hashtags: string[]
): string[] {
  let cleaned = text

  // Remove URLs
  for (const url of urls) {
    cleaned = cleaned.replace(url, '')
  }

  // Remove mentions
  for (const mention of mentions) {
    cleaned = cleaned.replace(new RegExp(`@${mention}\\b`, 'gi'), '')
  }

  // Remove hashtags
  for (const hashtag of hashtags) {
    cleaned = cleaned.replace(new RegExp(`#${hashtag}\\b`, 'gi'), '')
  }

  // Remove common stop words and clean up
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
    'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
    'only', 'same', 'so', 'than', 'too', 'very', 'just', 'get', 'me',
    'scrape', 'find', 'search', 'look', 'show', 'give', 'fetch'
  ])

  const words = cleaned
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))

  return [...new Set(words)]
}

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

/**
 * Classify query intent based on entities and keywords
 */
export function classifyIntent(entities: ExtractedEntities): QueryIntent {
  const { urls, mentions, keywords } = entities

  // Check URL platforms
  const platforms = new Set(urls.map(u => u.platform).filter(Boolean))

  // Social media indicators
  const socialPlatforms = new Set(['twitter', 'instagram', 'linkedin', 'tiktok', 'facebook', 'youtube'])
  const hasSocial = [...platforms].some(p => socialPlatforms.has(p!)) || mentions.length > 0

  // E-commerce indicators
  const ecommercePlatforms = new Set(['amazon', 'ebay'])
  const hasEcommerce = [...platforms].some(p => ecommercePlatforms.has(p!))
  const ecommerceKeywords = ['product', 'price', 'buy', 'shop', 'review', 'deal', 'discount']
  const hasEcommerceKeywords = keywords.some(k => ecommerceKeywords.includes(k))

  // Business indicators
  const businessPlatforms = new Set(['google-maps', 'crunchbase', 'glassdoor'])
  const hasBusiness = [...platforms].some(p => businessPlatforms.has(p!))
  const businessKeywords = ['company', 'business', 'startup', 'funding', 'salary', 'restaurant', 'store', 'near']
  const hasBusinessKeywords = keywords.some(k => businessKeywords.includes(k))

  // Determine intent
  const intents: QueryIntent[] = []
  if (hasSocial) intents.push('social')
  if (hasEcommerce || hasEcommerceKeywords) intents.push('ecommerce')
  if (hasBusiness || hasBusinessKeywords) intents.push('business')

  if (intents.length === 0) {
    // Default to web if URLs present, unknown otherwise
    return urls.length > 0 ? 'web' : 'unknown'
  }

  if (intents.length === 1) {
    return intents[0]
  }

  return 'mixed'
}

// =============================================================================
// MAIN ANALYZER
// =============================================================================

/**
 * Analyze a query and extract all relevant information
 */
export function analyzeQuery(query: string): QueryAnalysis {
  // Extract raw URLs first
  const rawUrls = extractUrls(query)

  // Parse each URL
  const parsedUrls = rawUrls.map(parseUrl)

  // Extract other entities
  const mentions = extractMentions(query)
  const hashtags = extractHashtags(query)
  const locations = extractLocations(query)
  const keywords = extractKeywords(query, rawUrls, mentions, hashtags)

  const entities: ExtractedEntities = {
    urls: parsedUrls,
    mentions,
    hashtags,
    keywords,
    locations
  }

  // Classify intent
  const intent = classifyIntent(entities)

  // Find matching actors
  const actorMatches: ActorMatch[] = []
  const seenActors = new Set<string>()

  // Match by URL first (highest confidence)
  for (const url of rawUrls) {
    const urlMatches = matchByUrl(url)
    for (const match of urlMatches) {
      if (!seenActors.has(match.actor.id)) {
        actorMatches.push(match)
        seenActors.add(match.actor.id)
      }
    }
  }

  // Match by triggers (lower confidence if URL already matched)
  const triggerMatches = matchByTrigger(query)
  for (const match of triggerMatches) {
    if (!seenActors.has(match.actor.id)) {
      // Reduce score since URL matches are more reliable
      match.score *= 0.7
      actorMatches.push(match)
      seenActors.add(match.actor.id)
    }
  }

  // Sort by score
  actorMatches.sort((a, b) => b.score - a.score)

  // Calculate overall confidence
  let confidence = 0
  if (actorMatches.length > 0) {
    confidence = actorMatches[0].score
    if (parsedUrls.length > 0 && parsedUrls[0].platform !== 'web') {
      confidence = Math.min(1, confidence + 0.2) // Boost for specific URL match
    }
  }

  return {
    query,
    intent,
    entities,
    suggestedActors: actorMatches,
    confidence
  }
}

// =============================================================================
// CLI: Test analyzer
// =============================================================================

if (import.meta.main) {
  const testQueries = [
    'https://x.com/Alibaba_Qwen/status/2018718453570707465',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://amazon.com/dp/B09V3KXJPB',
    'scrape @elonmusk tweets about AI',
    'find restaurants near San Francisco',
    'instagram profile for @natgeo',
    '#machinelearning trending on twitter',
    'https://linkedin.com/in/satyanadella',
  ]

  console.log('=== Query Analyzer Tests ===\n')

  for (const query of testQueries) {
    console.log(`Query: "${query}"`)
    const analysis = analyzeQuery(query)

    console.log(`  Intent: ${analysis.intent}`)
    console.log(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}%`)

    if (analysis.entities.urls.length > 0) {
      console.log(`  URLs: ${analysis.entities.urls.map(u => `${u.platform}/${u.type}`).join(', ')}`)
    }
    if (analysis.entities.mentions.length > 0) {
      console.log(`  Mentions: ${analysis.entities.mentions.map(m => '@' + m).join(', ')}`)
    }
    if (analysis.entities.keywords.length > 0) {
      console.log(`  Keywords: ${analysis.entities.keywords.join(', ')}`)
    }
    if (analysis.suggestedActors.length > 0) {
      console.log(`  Actors: ${analysis.suggestedActors.slice(0, 3).map(a => a.actor.name).join(', ')}`)
    }

    console.log('')
  }
}

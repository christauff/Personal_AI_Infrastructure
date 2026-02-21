/**
 * Apify Actor Selector
 *
 * Scores and selects optimal actors for a given query analysis.
 * Uses weighted scoring based on URL match, triggers, capabilities, and cost.
 */

import type { ActorDefinition, ActorMatch, ActorCategory } from '../Registry/types'
import { getActors, getActor } from '../Registry/loader'
import type { QueryAnalysis, ParsedUrl, ExtractedEntities } from './analyzer'

/**
 * Selection configuration
 */
export interface SelectionConfig {
  /** Maximum number of actors to return */
  maxActors?: number

  /** Minimum confidence score (0-1) to include */
  minConfidence?: number

  /** Prefer cheaper actors when scores are similar */
  costSensitive?: boolean

  /** Only return implemented actors */
  implementedOnly?: boolean

  /** Filter to specific categories */
  categories?: ActorCategory[]
}

/**
 * Selected actor with execution details
 */
export interface SelectedActor {
  /** Actor definition */
  actor: ActorDefinition

  /** Overall confidence score (0-1) */
  confidence: number

  /** Why this actor was selected */
  reason: SelectionReason

  /** Specific URLs this actor should handle */
  assignedUrls: string[]

  /** Specific entities this actor should process */
  assignedEntities: {
    mentions?: string[]
    hashtags?: string[]
    keywords?: string[]
  }

  /** Estimated cost for this operation */
  estimatedCost: number
}

export type SelectionReason =
  | 'url_exact_match'      // URL pattern matched directly
  | 'url_platform_match'   // URL platform matched actor
  | 'trigger_match'        // Keyword trigger matched
  | 'capability_match'     // Actor has required capability
  | 'fallback'             // Generic fallback actor

/**
 * Scoring weights for different match types
 */
const WEIGHTS = {
  URL_EXACT: 1.0,      // Direct URL pattern match
  URL_PLATFORM: 0.8,   // Platform detected but no specific pattern
  TRIGGER: 0.6,        // Keyword trigger matched
  CAPABILITY: 0.4,     // Actor has matching capability
  MENTION: 0.3,        // @mention suggests social platform
  HASHTAG: 0.2,        // #hashtag suggests social platform
  FALLBACK: 0.1,       // Generic fallback
}

/**
 * Platform to actor key mapping
 */
const PLATFORM_ACTOR_MAP: Record<string, string> = {
  'twitter': 'twitter',
  'youtube': 'youtube',
  'instagram': 'instagram',
  'linkedin': 'linkedin',
  'tiktok': 'tiktok',
  'facebook': 'facebook',
  'amazon': 'amazon',
  'ebay': 'ebay',
  'google-maps': 'google-maps',
  'crunchbase': 'crunchbase',
  'glassdoor': 'glassdoor',
  'web': 'web-scraper',
}

/**
 * Score an actor for a given query analysis
 */
export function scoreActor(
  actor: ActorDefinition,
  analysis: QueryAnalysis
): { score: number; reason: SelectionReason; urls: string[] } {
  const { entities } = analysis
  let score = 0
  let reason: SelectionReason = 'fallback'
  const matchedUrls: string[] = []

  // 1. Check URL matches (highest priority)
  for (const parsedUrl of entities.urls) {
    // Check if actor's URL patterns match
    for (const pattern of actor.urlPatterns || []) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(parsedUrl.raw)) {
          score = Math.max(score, WEIGHTS.URL_EXACT)
          reason = 'url_exact_match'
          matchedUrls.push(parsedUrl.raw)
          break
        }
      } catch {
        // Invalid regex, skip
      }
    }

    // Check platform match
    const actorKey = PLATFORM_ACTOR_MAP[parsedUrl.platform || '']
    if (actorKey && actor.id === getActor(actorKey)?.id) {
      if (score < WEIGHTS.URL_PLATFORM) {
        score = WEIGHTS.URL_PLATFORM
        reason = 'url_platform_match'
      }
      if (!matchedUrls.includes(parsedUrl.raw)) {
        matchedUrls.push(parsedUrl.raw)
      }
    }
  }

  // 2. Check trigger matches
  const queryLower = analysis.query.toLowerCase()
  for (const trigger of actor.triggers) {
    if (queryLower.includes(trigger.toLowerCase())) {
      if (score < WEIGHTS.TRIGGER) {
        score = WEIGHTS.TRIGGER
        reason = 'trigger_match'
      }
      // Boost score based on trigger specificity
      const specificity = trigger.length / analysis.query.length
      score = Math.min(1, score + specificity * 0.1)
      break
    }
  }

  // 3. Check capability matches based on entities
  if (entities.mentions.length > 0 && actor.capabilities.includes('profile')) {
    if (score < WEIGHTS.MENTION) {
      score = WEIGHTS.MENTION
      reason = 'capability_match'
    }
  }

  if (entities.hashtags.length > 0 && actor.capabilities.includes('hashtags')) {
    if (score < WEIGHTS.HASHTAG) {
      score = WEIGHTS.HASHTAG
      reason = 'capability_match'
    }
  }

  // 4. Fallback for generic web scraper
  if (score === 0 && actor.id === 'apify/web-scraper' && entities.urls.length > 0) {
    score = WEIGHTS.FALLBACK
    reason = 'fallback'
    matchedUrls.push(...entities.urls.map(u => u.raw))
  }

  return { score, reason, urls: matchedUrls }
}

/**
 * Select optimal actors for a query analysis
 */
export function selectActors(
  analysis: QueryAnalysis,
  config: SelectionConfig = {}
): SelectedActor[] {
  const {
    maxActors = 3,
    minConfidence = 0.1,
    costSensitive = true,
    implementedOnly = true,
    categories
  } = config

  // Get candidate actors
  let candidates = getActors({ implementedOnly })

  if (categories?.length) {
    candidates = candidates.filter(a => categories.includes(a.category))
  }

  // Score each actor
  const scored: Array<{
    actor: ActorDefinition
    score: number
    reason: SelectionReason
    urls: string[]
  }> = []

  for (const actor of candidates) {
    const { score, reason, urls } = scoreActor(actor, analysis)
    if (score >= minConfidence) {
      scored.push({ actor, score, reason, urls })
    }
  }

  // Sort by score (desc), then by cost (asc) if cost sensitive
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.05 && costSensitive) {
      return a.actor.costPer1k - b.actor.costPer1k
    }
    return b.score - a.score
  })

  // Dedupe by assigned URLs - each URL should only be handled by one actor
  const selectedUrls = new Set<string>()
  const results: SelectedActor[] = []

  for (const item of scored) {
    if (results.length >= maxActors) break

    // Filter out already-assigned URLs
    const availableUrls = item.urls.filter(u => !selectedUrls.has(u))

    // Skip if this actor has no unique URLs to handle and we have URL-based actors
    if (availableUrls.length === 0 && item.reason.includes('url') && results.length > 0) {
      continue
    }

    // Mark URLs as assigned
    for (const url of availableUrls) {
      selectedUrls.add(url)
    }

    // Determine assigned entities based on actor capabilities
    const assignedEntities: SelectedActor['assignedEntities'] = {}

    if (item.actor.capabilities.includes('profile') && analysis.entities.mentions.length > 0) {
      assignedEntities.mentions = analysis.entities.mentions
    }

    if (item.actor.capabilities.includes('hashtags') && analysis.entities.hashtags.length > 0) {
      assignedEntities.hashtags = analysis.entities.hashtags
    }

    if (analysis.entities.keywords.length > 0) {
      assignedEntities.keywords = analysis.entities.keywords
    }

    // Estimate cost (rough: $costPer1k * expected results / 1000)
    const expectedResults = Math.max(
      availableUrls.length,
      (assignedEntities.mentions?.length || 0) * 10,
      10 // minimum estimate
    )
    const estimatedCost = (item.actor.costPer1k * expectedResults) / 1000

    results.push({
      actor: item.actor,
      confidence: item.score,
      reason: item.reason,
      assignedUrls: availableUrls.length > 0 ? availableUrls : item.urls,
      assignedEntities,
      estimatedCost
    })
  }

  return results
}

/**
 * Get the single best actor for a query
 */
export function selectBestActor(
  analysis: QueryAnalysis,
  config: SelectionConfig = {}
): SelectedActor | null {
  const results = selectActors(analysis, { ...config, maxActors: 1 })
  return results[0] || null
}

/**
 * Check if a specific actor can handle a query
 */
export function canActorHandle(
  actorKey: string,
  analysis: QueryAnalysis
): boolean {
  const actor = getActor(actorKey)
  if (!actor) return false

  const { score } = scoreActor(actor, analysis)
  return score > 0
}

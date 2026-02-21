#!/usr/bin/env bun
/**
 * Apify Query Router
 *
 * Unified interface for query analysis and actor selection.
 * Entry point for the routing system.
 */

import { analyzeQuery, type QueryAnalysis } from './analyzer'
import { selectActors, selectBestActor, type SelectedActor, type SelectionConfig } from './selector'
import type { ActorDefinition } from '../Registry/types'

export { analyzeQuery, type QueryAnalysis } from './analyzer'
export { selectActors, selectBestActor, type SelectedActor, type SelectionConfig } from './selector'

/**
 * Route result containing analysis and selected actors
 */
export interface RouteResult {
  /** Original query */
  query: string

  /** Full query analysis */
  analysis: QueryAnalysis

  /** Selected actors for execution */
  actors: SelectedActor[]

  /** Primary actor (highest confidence) */
  primary: SelectedActor | null

  /** Total estimated cost */
  estimatedCost: number

  /** Quick summary for logging */
  summary: string
}

/**
 * Route options
 */
export interface RouteOptions extends SelectionConfig {
  /** Include full analysis in result */
  includeAnalysis?: boolean
}

/**
 * Route a query to optimal actor(s)
 *
 * Main entry point for the routing system.
 *
 * @param query - User query (URL, search terms, etc.)
 * @param options - Routing options
 * @returns Route result with selected actors
 *
 * @example
 * // Route a Twitter URL
 * const result = route('https://x.com/user/status/123')
 * console.log(result.primary?.actor.name) // "Twitter/X Scraper"
 *
 * @example
 * // Route a search query
 * const result = route('find @elonmusk tweets about AI')
 * console.log(result.actors.map(a => a.actor.name))
 */
export function route(query: string, options: RouteOptions = {}): RouteResult {
  // Analyze the query
  const analysis = analyzeQuery(query)

  // Select actors
  const actors = selectActors(analysis, options)

  // Calculate total estimated cost
  const estimatedCost = actors.reduce((sum, a) => sum + a.estimatedCost, 0)

  // Get primary actor
  const primary = actors[0] || null

  // Generate summary
  const summary = generateSummary(query, analysis, actors)

  return {
    query,
    analysis,
    actors,
    primary,
    estimatedCost,
    summary
  }
}

/**
 * Quick route - returns just the primary actor
 */
export function quickRoute(query: string): SelectedActor | null {
  const analysis = analyzeQuery(query)
  return selectBestActor(analysis)
}

/**
 * Check if a query can be routed to any actor
 */
export function canRoute(query: string): boolean {
  const analysis = analyzeQuery(query)
  const actors = selectActors(analysis, { maxActors: 1 })
  return actors.length > 0
}

/**
 * Get actor for a specific URL
 */
export function routeUrl(url: string): SelectedActor | null {
  return quickRoute(url)
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  query: string,
  analysis: QueryAnalysis,
  actors: SelectedActor[]
): string {
  const parts: string[] = []

  // Intent
  parts.push(`Intent: ${analysis.intent}`)

  // URL info
  if (analysis.entities.urls.length > 0) {
    const platforms = [...new Set(analysis.entities.urls.map(u => u.platform))]
    parts.push(`Platforms: ${platforms.join(', ')}`)
  }

  // Entities
  const entityCounts: string[] = []
  if (analysis.entities.mentions.length > 0) {
    entityCounts.push(`${analysis.entities.mentions.length} mention(s)`)
  }
  if (analysis.entities.hashtags.length > 0) {
    entityCounts.push(`${analysis.entities.hashtags.length} hashtag(s)`)
  }
  if (entityCounts.length > 0) {
    parts.push(`Entities: ${entityCounts.join(', ')}`)
  }

  // Selected actors
  if (actors.length > 0) {
    parts.push(`Actors: ${actors.map(a => a.actor.name).join(', ')}`)
    parts.push(`Confidence: ${(actors[0].confidence * 100).toFixed(0)}%`)
  } else {
    parts.push('No matching actors found')
  }

  return parts.join(' | ')
}

// =============================================================================
// CLI: Test router
// =============================================================================

if (import.meta.main) {
  const testQueries = [
    'https://x.com/Alibaba_Qwen/status/2018718453570707465',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://amazon.com/dp/B09V3KXJPB',
    'scrape @elonmusk tweets about AI',
    'find restaurants near San Francisco',
    'Compare https://x.com/user with https://amazon.com/dp/B09V3KXJPB',
  ]

  console.log('=== Apify Query Router ===\n')

  for (const query of testQueries) {
    console.log(`Query: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`)

    const result = route(query)

    console.log(`  ${result.summary}`)

    if (result.primary) {
      console.log(`  → Primary: ${result.primary.actor.name}`)
      console.log(`    Actor ID: ${result.primary.actor.id}`)
      console.log(`    Reason: ${result.primary.reason}`)
      if (result.primary.assignedUrls.length > 0) {
        console.log(`    URLs: ${result.primary.assignedUrls.length}`)
      }
      console.log(`    Est. Cost: $${result.estimatedCost.toFixed(4)}`)
    }

    console.log('')
  }

  // Demonstrate the exit criteria
  console.log('=== Exit Criteria Test ===')
  const exitTest = route('https://x.com/user/status/123')
  console.log(`query("https://x.com/user/status/123")`)
  console.log(`  → Actor: ${exitTest.primary?.actor.name}`)
  console.log(`  → ID: ${exitTest.primary?.actor.id}`)
  console.log(`  → Confidence: ${((exitTest.primary?.confidence || 0) * 100).toFixed(0)}%`)
}

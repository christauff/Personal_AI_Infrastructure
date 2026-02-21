/**
 * Apify Actor Registry Types
 *
 * Defines the schema for actor registration, routing, and orchestration.
 */

/**
 * Actor capability categories
 */
export type ActorCategory = 'social-media' | 'business' | 'ecommerce' | 'web' | 'utility'

/**
 * Actor capability - what operations an actor supports
 */
export type ActorCapability =
  // Social media
  | 'profile' | 'posts' | 'search' | 'comments' | 'hashtags' | 'timeline' | 'tweet'
  // Business
  | 'places' | 'reviews' | 'details' | 'jobs'
  // E-commerce
  | 'products' | 'sellers' | 'pricing'
  // Web
  | 'scrape' | 'crawl' | 'extract'

/**
 * Single actor definition in the registry
 */
export interface ActorDefinition {
  /** Apify actor ID (e.g., "apidojo/twitter-scraper-lite") */
  id: string

  /** Human-readable name */
  name: string

  /** Category for grouping */
  category: ActorCategory

  /** Keywords that trigger this actor */
  triggers: string[]

  /** URL patterns this actor handles (regex strings) */
  urlPatterns?: string[]

  /** Capabilities this actor provides */
  capabilities: ActorCapability[]

  /** Estimated cost per 1000 results (USD) */
  costPer1k: number

  /** Default TTL for caching results (seconds) */
  cacheTtl: number

  /** Wrapper module path relative to actors/ */
  wrapper?: string

  /** Whether this actor is currently implemented */
  implemented: boolean

  /** Notes about usage or limitations */
  notes?: string
}

/**
 * Complete actor registry structure
 */
export interface ActorRegistry {
  /** Registry version for compatibility */
  version: string

  /** Last updated timestamp */
  updatedAt: string

  /** All registered actors */
  actors: Record<string, ActorDefinition>
}

/**
 * Result of actor matching
 */
export interface ActorMatch {
  /** Actor definition */
  actor: ActorDefinition

  /** Match confidence score (0-1) */
  score: number

  /** Why this actor was matched */
  reason: 'url' | 'trigger' | 'capability'

  /** Specific pattern or keyword that matched */
  matchedOn: string
}

/**
 * Loader options
 */
export interface LoaderOptions {
  /** Only return implemented actors */
  implementedOnly?: boolean

  /** Filter by category */
  category?: ActorCategory
}

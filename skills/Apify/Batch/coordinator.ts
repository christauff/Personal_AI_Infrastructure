/**
 * Apify Batch Coordinator
 *
 * Orchestrates parallel execution of multiple queries,
 * grouping by actor for efficiency.
 */

import { route, type RouteResult } from '../Router'
import { getCache, generateUrlKey } from '../Cache'
import { getRateLimiter, type RateLimiter } from './rate-limiter'
import { recordUsage } from '../Telemetry/cost'
import { checkBudget } from '../Telemetry/budget'
import type { ActorDefinition } from '../Registry/types'

/**
 * Batch job configuration
 */
export interface BatchConfig {
  /** Maximum results per query */
  maxResultsPerQuery?: number

  /** Skip cache lookup */
  skipCache?: boolean

  /** Don't cache results */
  noCache?: boolean

  /** Timeout per actor call (seconds) */
  timeout?: number

  /** Execute actors sequentially instead of parallel */
  sequential?: boolean

  /** Custom rate limiter */
  rateLimiter?: RateLimiter

  /** Callback for progress updates */
  onProgress?: (progress: BatchProgress) => void
}

/**
 * Batch progress update
 */
export interface BatchProgress {
  /** Total queries in batch */
  total: number

  /** Queries completed */
  completed: number

  /** Queries from cache */
  cached: number

  /** Current actor being processed */
  currentActor?: string

  /** Percent complete (0-100) */
  percent: number
}

/**
 * Single query result in batch
 */
export interface BatchQueryResult<T = any> {
  /** Original query */
  query: string

  /** Result data */
  data: T[]

  /** Whether from cache */
  fromCache: boolean

  /** Actor used */
  actor: ActorDefinition

  /** Cost for this query */
  cost: number

  /** Execution time (ms) */
  executionTime: number

  /** Error if failed */
  error?: string
}

/**
 * Complete batch result
 */
export interface BatchResult<T = any> {
  /** Individual query results */
  results: BatchQueryResult<T>[]

  /** Total execution time (ms) */
  totalTime: number

  /** Total cost */
  totalCost: number

  /** Cache hit count */
  cacheHits: number

  /** Cache miss count */
  cacheMisses: number

  /** Queries grouped by actor */
  actorGroups: number

  /** Success rate (0-1) */
  successRate: number

  /** Summary message */
  summary: string
}

/**
 * Actor group for batch processing
 */
interface ActorGroup {
  actor: ActorDefinition
  queries: string[]
  routes: RouteResult[]
}

/**
 * Batch Coordinator implementation
 */
export class BatchCoordinator {
  private rateLimiter: RateLimiter

  constructor(rateLimiter?: RateLimiter) {
    this.rateLimiter = rateLimiter || getRateLimiter()
  }

  /**
   * Execute a batch of queries
   */
  async execute<T = any>(
    queries: string[],
    config: BatchConfig = {}
  ): Promise<BatchResult<T>> {
    const startTime = Date.now()
    const results: BatchQueryResult<T>[] = []
    let cacheHits = 0
    let cacheMisses = 0
    let totalCost = 0

    // Route and group queries by actor
    const groups = this.groupByActor(queries)

    // Progress tracking
    let completed = 0
    const reportProgress = () => {
      config.onProgress?.({
        total: queries.length,
        completed,
        cached: cacheHits,
        percent: Math.round((completed / queries.length) * 100)
      })
    }

    // Process each actor group
    const processGroup = async (group: ActorGroup): Promise<BatchQueryResult<T>[]> => {
      const groupResults: BatchQueryResult<T>[] = []

      // Check cache for each query
      const uncached: { query: string; route: RouteResult }[] = []

      for (let i = 0; i < group.queries.length; i++) {
        const query = group.queries[i]
        const routeResult = group.routes[i]
        const cacheKey = generateUrlKey(group.actor.id, query)

        if (!config.skipCache) {
          const cached = getCache().get<T[]>(cacheKey)
          if (cached) {
            groupResults.push({
              query,
              data: cached,
              fromCache: true,
              actor: group.actor,
              cost: 0,
              executionTime: 0
            })
            cacheHits++
            completed++
            reportProgress()
            continue
          }
        }

        uncached.push({ query, route: routeResult })
        cacheMisses++
      }

      // Execute uncached queries
      if (uncached.length > 0) {
        // Check budget before executing
        const estimatedCost = (group.actor.costPer1k * uncached.length * 10) / 1000
        if (!checkBudget(estimatedCost)) {
          // Budget exceeded - return errors for uncached
          for (const { query } of uncached) {
            groupResults.push({
              query,
              data: [],
              fromCache: false,
              actor: group.actor,
              cost: 0,
              executionTime: 0,
              error: 'Budget limit exceeded'
            })
            completed++
            reportProgress()
          }
          return groupResults
        }

        // Build batch input for actor
        const urls = uncached.map(u => u.query)
        const actorInput = this.buildBatchInput(group.actor, urls, config)

        config.onProgress?.({
          total: queries.length,
          completed,
          cached: cacheHits,
          currentActor: group.actor.name,
          percent: Math.round((completed / queries.length) * 100)
        })

        // Execute with rate limiting
        const queryStartTime = Date.now()
        try {
          const items = await this.executeActor<T>(
            group.actor.id,
            actorInput,
            config.timeout
          )

          const executionTime = Date.now() - queryStartTime
          const costPerItem = group.actor.costPer1k / 1000

          // Distribute results to queries
          // Note: This is a simplification - in reality, need to match results to queries
          for (let i = 0; i < uncached.length; i++) {
            const query = uncached[i].query
            const itemsForQuery = items.slice(
              i * Math.ceil(items.length / uncached.length),
              (i + 1) * Math.ceil(items.length / uncached.length)
            )

            const cost = costPerItem * itemsForQuery.length
            totalCost += cost

            // Cache result
            if (!config.noCache && itemsForQuery.length > 0) {
              const cacheKey = generateUrlKey(group.actor.id, query)
              getCache().set(cacheKey, itemsForQuery, group.actor.id, { fetchCost: cost })
            }

            // Record usage
            recordUsage({
              actorId: group.actor.id,
              actorName: group.actor.name,
              operationType: 'batch',
              resultCount: itemsForQuery.length,
              cost,
              executionTime: Math.round(executionTime / uncached.length),
              cacheHit: false,
              query: query.substring(0, 100)
            })

            groupResults.push({
              query,
              data: itemsForQuery,
              fromCache: false,
              actor: group.actor,
              cost,
              executionTime: Math.round(executionTime / uncached.length)
            })

            completed++
            reportProgress()
          }
        } catch (error: any) {
          // Handle error for all uncached in group
          for (const { query } of uncached) {
            groupResults.push({
              query,
              data: [],
              fromCache: false,
              actor: group.actor,
              cost: 0,
              executionTime: Date.now() - queryStartTime,
              error: error.message
            })
            completed++
            reportProgress()
          }
        }
      }

      return groupResults
    }

    // Execute groups (parallel or sequential)
    if (config.sequential) {
      for (const group of groups) {
        const groupResults = await processGroup(group)
        results.push(...groupResults)
      }
    } else {
      // Parallel execution with rate limiting
      const groupPromises = groups.map(group =>
        this.rateLimiter.execute(() => processGroup(group))
      )
      const groupResults = await Promise.all(groupPromises)
      for (const gr of groupResults) {
        results.push(...gr)
      }
    }

    // Sort results to match original query order
    const orderedResults = queries.map(q =>
      results.find(r => r.query === q) || {
        query: q,
        data: [],
        fromCache: false,
        actor: groups[0]?.actor,
        cost: 0,
        executionTime: 0,
        error: 'No result found'
      }
    )

    const totalTime = Date.now() - startTime
    const successCount = orderedResults.filter(r => !r.error).length

    return {
      results: orderedResults as BatchQueryResult<T>[],
      totalTime,
      totalCost,
      cacheHits,
      cacheMisses,
      actorGroups: groups.length,
      successRate: queries.length > 0 ? successCount / queries.length : 1,
      summary: `${queries.length} queries (${groups.length} actors) in ${totalTime}ms | ` +
        `${cacheHits} cached, ${cacheMisses} fetched | $${totalCost.toFixed(4)}`
    }
  }

  /**
   * Group queries by optimal actor
   */
  private groupByActor(queries: string[]): ActorGroup[] {
    const groups = new Map<string, ActorGroup>()

    for (const query of queries) {
      const routeResult = route(query)
      if (!routeResult.primary) continue

      const actorId = routeResult.primary.actor.id
      if (!groups.has(actorId)) {
        groups.set(actorId, {
          actor: routeResult.primary.actor,
          queries: [],
          routes: []
        })
      }

      groups.get(actorId)!.queries.push(query)
      groups.get(actorId)!.routes.push(routeResult)
    }

    return Array.from(groups.values())
  }

  /**
   * Build batch input for an actor
   */
  private buildBatchInput(
    actor: ActorDefinition,
    urls: string[],
    config: BatchConfig
  ): Record<string, any> {
    const maxResults = config.maxResultsPerQuery || 10

    switch (actor.id) {
      case 'apidojo/twitter-scraper-lite':
        return { startUrls: urls, maxItems: urls.length * maxResults }

      case 'streamers/youtube-channel-scraper':
      case 'streamers/youtube-scraper':
        return { startUrls: urls, maxResults: urls.length * maxResults }

      case 'junglee/free-amazon-product-scraper':
        return { productUrls: urls }

      case 'apify/instagram-profile-scraper':
        return { directUrls: urls, resultsLimit: urls.length * maxResults }

      default:
        return { startUrls: urls, maxItems: urls.length * maxResults }
    }
  }

  /**
   * Execute an actor (stub - actual implementation uses Apify class)
   */
  private async executeActor<T>(
    actorId: string,
    input: Record<string, any>,
    timeout?: number
  ): Promise<T[]> {
    // Import dynamically to avoid circular dependency
    const { Apify } = await import('../index')
    const apify = new Apify()

    const run = await apify.callActor(actorId, input, { timeout })
    await apify.waitForRun(run.id)

    const dataset = apify.getDataset(run.defaultDatasetId)
    return await dataset.listItems() as T[]
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

let globalCoordinator: BatchCoordinator | null = null

/**
 * Get the global batch coordinator
 */
export function getBatchCoordinator(): BatchCoordinator {
  if (!globalCoordinator) {
    globalCoordinator = new BatchCoordinator()
  }
  return globalCoordinator
}

/**
 * Reset the global batch coordinator
 */
export function resetBatchCoordinator(): void {
  globalCoordinator = new BatchCoordinator()
}

/**
 * Convenience: Execute a batch of queries
 */
export async function executeBatch<T = any>(
  queries: string[],
  config?: BatchConfig
): Promise<BatchResult<T>> {
  return getBatchCoordinator().execute<T>(queries, config)
}

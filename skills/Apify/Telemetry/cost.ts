/**
 * Apify Cost Tracker
 *
 * Records usage and costs for all Apify API calls.
 * Provides detailed analytics by actor, time period, and operation type.
 */

/**
 * Single usage record
 */
export interface UsageRecord {
  /** Unique record ID */
  id: string

  /** Timestamp of the call */
  timestamp: number

  /** Actor ID that was called */
  actorId: string

  /** Actor name for display */
  actorName?: string

  /** Type of operation */
  operationType: 'query' | 'search' | 'direct' | 'batch'

  /** Number of results returned */
  resultCount: number

  /** Estimated cost in USD */
  cost: number

  /** Execution time in ms */
  executionTime: number

  /** Whether result was from cache */
  cacheHit: boolean

  /** Original query (truncated for privacy) */
  query?: string

  /** Run ID for reference */
  runId?: string
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  /** Total number of API calls */
  totalCalls: number

  /** Total cost in USD */
  totalCost: number

  /** Total results fetched */
  totalResults: number

  /** Cache hit rate (0-1) */
  cacheHitRate: number

  /** Average cost per call */
  avgCostPerCall: number

  /** Average execution time in ms */
  avgExecutionTime: number

  /** Breakdown by actor */
  byActor: Record<string, {
    calls: number
    cost: number
    results: number
  }>

  /** Breakdown by operation type */
  byOperation: Record<string, {
    calls: number
    cost: number
  }>
}

/**
 * Cost Tracker implementation
 */
export class CostTracker {
  private records: UsageRecord[] = []
  private idCounter = 0

  /**
   * Record a usage event
   */
  record(data: Omit<UsageRecord, 'id' | 'timestamp'>): UsageRecord {
    const record: UsageRecord = {
      id: `usage-${++this.idCounter}`,
      timestamp: Date.now(),
      ...data
    }

    this.records.push(record)

    // Keep only last 10000 records to prevent memory issues
    if (this.records.length > 10000) {
      this.records = this.records.slice(-10000)
    }

    return record
  }

  /**
   * Get all records
   */
  getRecords(): UsageRecord[] {
    return [...this.records]
  }

  /**
   * Get records for a time period
   */
  getRecordsSince(since: number): UsageRecord[] {
    return this.records.filter(r => r.timestamp >= since)
  }

  /**
   * Get records for today
   */
  getTodayRecords(): UsageRecord[] {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return this.getRecordsSince(startOfDay.getTime())
  }

  /**
   * Get records for a specific actor
   */
  getActorRecords(actorId: string): UsageRecord[] {
    return this.records.filter(r => r.actorId === actorId)
  }

  /**
   * Calculate total cost for a time period
   */
  getTotalCost(since?: number): number {
    const records = since ? this.getRecordsSince(since) : this.records
    return records
      .filter(r => !r.cacheHit) // Only count non-cached calls
      .reduce((sum, r) => sum + r.cost, 0)
  }

  /**
   * Get today's total cost
   */
  getTodayCost(): number {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return this.getTotalCost(startOfDay.getTime())
  }

  /**
   * Calculate usage statistics
   */
  getStats(since?: number): UsageStats {
    const records = since ? this.getRecordsSince(since) : this.records

    if (records.length === 0) {
      return {
        totalCalls: 0,
        totalCost: 0,
        totalResults: 0,
        cacheHitRate: 0,
        avgCostPerCall: 0,
        avgExecutionTime: 0,
        byActor: {},
        byOperation: {}
      }
    }

    const cacheHits = records.filter(r => r.cacheHit).length
    const nonCachedRecords = records.filter(r => !r.cacheHit)

    const byActor: UsageStats['byActor'] = {}
    const byOperation: UsageStats['byOperation'] = {}

    for (const r of records) {
      // By actor
      if (!byActor[r.actorId]) {
        byActor[r.actorId] = { calls: 0, cost: 0, results: 0 }
      }
      byActor[r.actorId].calls++
      byActor[r.actorId].cost += r.cacheHit ? 0 : r.cost
      byActor[r.actorId].results += r.resultCount

      // By operation
      if (!byOperation[r.operationType]) {
        byOperation[r.operationType] = { calls: 0, cost: 0 }
      }
      byOperation[r.operationType].calls++
      byOperation[r.operationType].cost += r.cacheHit ? 0 : r.cost
    }

    const totalCost = nonCachedRecords.reduce((sum, r) => sum + r.cost, 0)
    const totalResults = records.reduce((sum, r) => sum + r.resultCount, 0)
    const totalExecutionTime = nonCachedRecords.reduce((sum, r) => sum + r.executionTime, 0)

    return {
      totalCalls: records.length,
      totalCost,
      totalResults,
      cacheHitRate: records.length > 0 ? cacheHits / records.length : 0,
      avgCostPerCall: nonCachedRecords.length > 0 ? totalCost / nonCachedRecords.length : 0,
      avgExecutionTime: nonCachedRecords.length > 0 ? totalExecutionTime / nonCachedRecords.length : 0,
      byActor,
      byOperation
    }
  }

  /**
   * Get today's statistics
   */
  getTodayStats(): UsageStats {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return this.getStats(startOfDay.getTime())
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = []
    this.idCounter = 0
  }

  /**
   * Export records to JSON
   */
  export(): string {
    return JSON.stringify(this.records, null, 2)
  }

  /**
   * Import records from JSON
   */
  import(json: string): void {
    const imported = JSON.parse(json) as UsageRecord[]
    this.records = imported
    this.idCounter = Math.max(...imported.map(r => parseInt(r.id.split('-')[1]) || 0), 0)
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

let globalTracker: CostTracker | null = null

/**
 * Get the global cost tracker instance
 */
export function getCostTracker(): CostTracker {
  if (!globalTracker) {
    globalTracker = new CostTracker()
  }
  return globalTracker
}

/**
 * Reset the global tracker (for testing)
 */
export function resetCostTracker(): void {
  globalTracker = new CostTracker()
}

/**
 * Convenience: Record a usage event
 */
export function recordUsage(data: Omit<UsageRecord, 'id' | 'timestamp'>): UsageRecord {
  return getCostTracker().record(data)
}

/**
 * Convenience: Get today's cost
 */
export function getTodayCost(): number {
  return getCostTracker().getTodayCost()
}

/**
 * Convenience: Get today's stats
 */
export function getTodayStats(): UsageStats {
  return getCostTracker().getTodayStats()
}

/**
 * Apify Usage Reports
 *
 * Generate formatted reports for usage analysis.
 */

import { getCostTracker, type UsageStats, type UsageRecord } from './cost'
import { getBudgetStatus, type BudgetStatus } from './budget'

/**
 * Report time period
 */
export type ReportPeriod = 'today' | 'week' | 'month' | 'all'

/**
 * Full usage report
 */
export interface UsageReport {
  /** Report generation timestamp */
  generatedAt: string

  /** Time period covered */
  period: ReportPeriod

  /** Budget status */
  budget: BudgetStatus

  /** Usage statistics */
  stats: UsageStats

  /** Top actors by cost */
  topActorsByCost: Array<{ actorId: string; cost: number; calls: number }>

  /** Top actors by calls */
  topActorsByCalls: Array<{ actorId: string; calls: number; cost: number }>

  /** Recent activity */
  recentActivity: UsageRecord[]

  /** Cost savings from cache */
  cacheSavings: number
}

/**
 * Get timestamp for period start
 */
function getPeriodStart(period: ReportPeriod): number {
  const now = new Date()

  switch (period) {
    case 'today':
      now.setHours(0, 0, 0, 0)
      return now.getTime()

    case 'week':
      now.setHours(0, 0, 0, 0)
      now.setDate(now.getDate() - 7)
      return now.getTime()

    case 'month':
      now.setHours(0, 0, 0, 0)
      now.setDate(now.getDate() - 30)
      return now.getTime()

    case 'all':
      return 0
  }
}

/**
 * Generate a usage report
 */
export function generateReport(period: ReportPeriod = 'today'): UsageReport {
  const tracker = getCostTracker()
  const since = getPeriodStart(period)
  const stats = tracker.getStats(since)
  const budget = getBudgetStatus()
  const records = tracker.getRecordsSince(since)

  // Top actors by cost
  const topActorsByCost = Object.entries(stats.byActor)
    .map(([actorId, data]) => ({ actorId, ...data }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)

  // Top actors by calls
  const topActorsByCalls = Object.entries(stats.byActor)
    .map(([actorId, data]) => ({ actorId, ...data }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5)

  // Recent activity (last 10)
  const recentActivity = records.slice(-10).reverse()

  // Calculate cache savings (estimated)
  const cacheHits = records.filter(r => r.cacheHit).length
  const avgCostPerCall = stats.avgCostPerCall || 0.01
  const cacheSavings = cacheHits * avgCostPerCall

  return {
    generatedAt: new Date().toISOString(),
    period,
    budget,
    stats,
    topActorsByCost,
    topActorsByCalls,
    recentActivity,
    cacheSavings
  }
}

/**
 * Format a report as a string for console output
 */
export function formatReport(report: UsageReport): string {
  const lines: string[] = []

  lines.push('═'.repeat(60))
  lines.push(`  APIFY USAGE REPORT - ${report.period.toUpperCase()}`)
  lines.push(`  Generated: ${new Date(report.generatedAt).toLocaleString()}`)
  lines.push('═'.repeat(60))

  // Budget Status
  lines.push('')
  lines.push('📊 BUDGET STATUS')
  lines.push('─'.repeat(40))
  lines.push(report.budget.message)
  lines.push(`   Remaining: $${report.budget.remaining.toFixed(2)}`)

  // Usage Summary
  lines.push('')
  lines.push('📈 USAGE SUMMARY')
  lines.push('─'.repeat(40))
  lines.push(`   Total Calls: ${report.stats.totalCalls}`)
  lines.push(`   Total Cost: $${report.stats.totalCost.toFixed(4)}`)
  lines.push(`   Total Results: ${report.stats.totalResults}`)
  lines.push(`   Cache Hit Rate: ${(report.stats.cacheHitRate * 100).toFixed(1)}%`)
  lines.push(`   Cache Savings: ~$${report.cacheSavings.toFixed(4)}`)
  lines.push(`   Avg Cost/Call: $${report.stats.avgCostPerCall.toFixed(4)}`)
  lines.push(`   Avg Exec Time: ${report.stats.avgExecutionTime.toFixed(0)}ms`)

  // Top Actors by Cost
  if (report.topActorsByCost.length > 0) {
    lines.push('')
    lines.push('💰 TOP ACTORS BY COST')
    lines.push('─'.repeat(40))
    for (const actor of report.topActorsByCost) {
      const shortId = actor.actorId.split('/')[1] || actor.actorId
      lines.push(`   ${shortId}: $${actor.cost.toFixed(4)} (${actor.calls} calls)`)
    }
  }

  // Top Actors by Calls
  if (report.topActorsByCalls.length > 0) {
    lines.push('')
    lines.push('📞 TOP ACTORS BY CALLS')
    lines.push('─'.repeat(40))
    for (const actor of report.topActorsByCalls) {
      const shortId = actor.actorId.split('/')[1] || actor.actorId
      lines.push(`   ${shortId}: ${actor.calls} calls ($${actor.cost.toFixed(4)})`)
    }
  }

  // By Operation Type
  if (Object.keys(report.stats.byOperation).length > 0) {
    lines.push('')
    lines.push('🔧 BY OPERATION TYPE')
    lines.push('─'.repeat(40))
    for (const [op, data] of Object.entries(report.stats.byOperation)) {
      lines.push(`   ${op}: ${data.calls} calls ($${data.cost.toFixed(4)})`)
    }
  }

  // Recent Activity
  if (report.recentActivity.length > 0) {
    lines.push('')
    lines.push('🕐 RECENT ACTIVITY')
    lines.push('─'.repeat(40))
    for (const record of report.recentActivity.slice(0, 5)) {
      const time = new Date(record.timestamp).toLocaleTimeString()
      const shortId = record.actorId.split('/')[1] || record.actorId
      const cached = record.cacheHit ? ' (cached)' : ''
      lines.push(`   ${time} - ${shortId}: ${record.resultCount} results${cached}`)
    }
  }

  lines.push('')
  lines.push('═'.repeat(60))

  return lines.join('\n')
}

/**
 * Print a formatted report to console
 */
export function printReport(period: ReportPeriod = 'today'): void {
  const report = generateReport(period)
  console.log(formatReport(report))
}

/**
 * Generate a compact one-line summary
 */
export function getQuickSummary(): string {
  const budget = getBudgetStatus()
  const stats = getCostTracker().getTodayStats()

  return `Apify: $${budget.currentSpend.toFixed(2)}/$${budget.dailyLimit.toFixed(2)} | ${stats.totalCalls} calls | ${(stats.cacheHitRate * 100).toFixed(0)}% cache`
}

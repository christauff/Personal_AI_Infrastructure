#!/usr/bin/env bun
/**
 * Apify Telemetry Module
 *
 * Cost tracking, budget management, and usage reporting.
 */

// Re-export all components
export {
  CostTracker,
  getCostTracker,
  resetCostTracker,
  recordUsage,
  getTodayCost,
  getTodayStats,
  type UsageRecord,
  type UsageStats
} from './cost'

export {
  BudgetManager,
  getBudgetManager,
  resetBudgetManager,
  configureBudget,
  checkBudget,
  getBudgetStatus,
  printBudgetStatus,
  type BudgetConfig,
  type BudgetStatus
} from './budget'

export {
  generateReport,
  formatReport,
  printReport,
  getQuickSummary,
  type UsageReport,
  type ReportPeriod
} from './report'

// =============================================================================
// CLI: Test the telemetry system
// =============================================================================

import { recordUsage, getCostTracker } from './cost'
import { configureBudget, checkBudget, getBudgetStatus } from './budget'
import { printReport, getQuickSummary } from './report'

if (import.meta.main) {
  console.log('=== Apify Telemetry Test ===\n')

  // Configure a low budget for testing (80% = $0.08)
  console.log('1. Configure budget: $0.10/day with 80% warning threshold')
  configureBudget({
    dailyLimit: 0.10,
    warningThreshold: 0.8,
    blockOnLimit: false
  })

  // Simulate some usage
  console.log('\n2. Simulating API usage...\n')

  // First call - under threshold
  recordUsage({
    actorId: 'apidojo/twitter-scraper-lite',
    actorName: 'Twitter Scraper',
    operationType: 'query',
    resultCount: 5,
    cost: 0.025,
    executionTime: 3500,
    cacheHit: false,
    query: 'https://x.com/user/status/123'
  })
  console.log('   Recorded: Twitter query ($0.025)')
  checkBudget() // Should be OK

  // Second call - still under
  recordUsage({
    actorId: 'streamers/youtube-scraper',
    actorName: 'YouTube Scraper',
    operationType: 'query',
    resultCount: 10,
    cost: 0.030,
    executionTime: 4200,
    cacheHit: false,
    query: 'https://youtube.com/watch?v=abc'
  })
  console.log('   Recorded: YouTube query ($0.030)')
  checkBudget() // Should be OK

  // Third call - hits 80% threshold
  recordUsage({
    actorId: 'apidojo/twitter-scraper-lite',
    actorName: 'Twitter Scraper',
    operationType: 'search',
    resultCount: 20,
    cost: 0.035,
    executionTime: 5100,
    cacheHit: false,
    query: 'AI news'
  })
  console.log('   Recorded: Twitter search ($0.035)')
  console.log('\n   Checking budget (should trigger 80% warning)...')
  checkBudget() // Should trigger warning at 90%

  // Cache hit - no cost
  recordUsage({
    actorId: 'apidojo/twitter-scraper-lite',
    actorName: 'Twitter Scraper',
    operationType: 'query',
    resultCount: 5,
    cost: 0,
    executionTime: 0,
    cacheHit: true,
    query: 'https://x.com/user/status/123'
  })
  console.log('\n   Recorded: Cache hit (no cost)')

  // Print full report
  console.log('\n3. Full Usage Report:\n')
  printReport('today')

  // Quick summary
  console.log('\n4. Quick Summary:')
  console.log(`   ${getQuickSummary()}`)

  // Final budget status
  console.log('\n5. Final Budget Status:')
  const status = getBudgetStatus()
  console.log(`   ${status.message}`)
  console.log(`   Percent Used: ${(status.percentUsed * 100).toFixed(1)}%`)
  console.log(`   Warning Triggered: ${status.isWarning}`)
}

/**
 * Apify Budget Management
 *
 * Configurable daily spending limits with warnings and blocking.
 */

import { getTodayCost, getCostTracker } from './cost'

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Daily spending limit in USD */
  dailyLimit: number

  /** Warning threshold (0-1), default 0.8 = 80% */
  warningThreshold: number

  /** Whether to block requests when limit is reached */
  blockOnLimit: boolean

  /** Callback when warning threshold is reached */
  onWarning?: (current: number, limit: number) => void

  /** Callback when limit is reached */
  onLimitReached?: (current: number, limit: number) => void
}

/**
 * Budget status
 */
export interface BudgetStatus {
  /** Current spending today */
  currentSpend: number

  /** Daily limit */
  dailyLimit: number

  /** Percentage used (0-1) */
  percentUsed: number

  /** Remaining budget */
  remaining: number

  /** Whether warning threshold is exceeded */
  isWarning: boolean

  /** Whether limit is reached */
  isLimitReached: boolean

  /** Human-readable status message */
  message: string
}

/**
 * Default budget configuration
 */
const DEFAULT_CONFIG: BudgetConfig = {
  dailyLimit: 10.00,       // $10/day default
  warningThreshold: 0.8,   // Warn at 80%
  blockOnLimit: false,     // Don't block by default, just warn
}

/**
 * Budget Manager implementation
 */
export class BudgetManager {
  private config: BudgetConfig
  private warningShown = false
  private limitShown = false
  private lastResetDate: string

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.lastResetDate = this.getTodayString()
  }

  /**
   * Update budget configuration
   */
  setConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current budget status
   */
  getStatus(): BudgetStatus {
    // Reset warnings on new day
    this.checkDayReset()

    const currentSpend = getTodayCost()
    const { dailyLimit, warningThreshold } = this.config

    const percentUsed = dailyLimit > 0 ? currentSpend / dailyLimit : 0
    const remaining = Math.max(0, dailyLimit - currentSpend)
    const isWarning = percentUsed >= warningThreshold
    const isLimitReached = percentUsed >= 1.0

    let message: string
    if (isLimitReached) {
      message = `⛔ Daily budget limit reached ($${currentSpend.toFixed(2)}/$${dailyLimit.toFixed(2)})`
    } else if (isWarning) {
      message = `⚠️ Budget warning: ${(percentUsed * 100).toFixed(0)}% used ($${currentSpend.toFixed(2)}/$${dailyLimit.toFixed(2)})`
    } else {
      message = `✅ Budget OK: $${currentSpend.toFixed(2)}/$${dailyLimit.toFixed(2)} (${(percentUsed * 100).toFixed(0)}%)`
    }

    return {
      currentSpend,
      dailyLimit,
      percentUsed,
      remaining,
      isWarning,
      isLimitReached,
      message
    }
  }

  /**
   * Check if a request should be allowed based on budget
   *
   * @param estimatedCost - Estimated cost of the request
   * @returns Whether the request is allowed
   */
  checkBudget(estimatedCost: number = 0): boolean {
    const status = this.getStatus()

    // Trigger callbacks and warnings
    if (status.isLimitReached) {
      if (!this.limitShown) {
        this.limitShown = true
        console.warn(`\n${status.message}\n`)
        this.config.onLimitReached?.(status.currentSpend, status.dailyLimit)
      }

      if (this.config.blockOnLimit) {
        return false
      }
    } else if (status.isWarning) {
      if (!this.warningShown) {
        this.warningShown = true
        console.warn(`\n${status.message}\n`)
        this.config.onWarning?.(status.currentSpend, status.dailyLimit)
      }
    }

    // Check if this request would exceed the limit
    if (this.config.blockOnLimit && status.currentSpend + estimatedCost > status.dailyLimit) {
      console.warn(`\n⛔ Request blocked: Would exceed daily budget ($${(status.currentSpend + estimatedCost).toFixed(2)}/$${status.dailyLimit.toFixed(2)})\n`)
      return false
    }

    return true
  }

  /**
   * Print budget status to console
   */
  printStatus(): void {
    const status = this.getStatus()
    console.log(status.message)
  }

  /**
   * Reset warnings (for new day)
   */
  private checkDayReset(): void {
    const today = this.getTodayString()
    if (today !== this.lastResetDate) {
      this.lastResetDate = today
      this.warningShown = false
      this.limitShown = false
    }
  }

  private getTodayString(): string {
    return new Date().toISOString().split('T')[0]
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

let globalBudget: BudgetManager | null = null

/**
 * Get the global budget manager instance
 */
export function getBudgetManager(): BudgetManager {
  if (!globalBudget) {
    globalBudget = new BudgetManager()
  }
  return globalBudget
}

/**
 * Reset the global budget manager (for testing)
 */
export function resetBudgetManager(): void {
  globalBudget = new BudgetManager()
}

/**
 * Configure the global budget manager
 */
export function configureBudget(config: Partial<BudgetConfig>): void {
  getBudgetManager().setConfig(config)
}

/**
 * Convenience: Check budget before a request
 */
export function checkBudget(estimatedCost: number = 0): boolean {
  return getBudgetManager().checkBudget(estimatedCost)
}

/**
 * Convenience: Get budget status
 */
export function getBudgetStatus(): BudgetStatus {
  return getBudgetManager().getStatus()
}

/**
 * Convenience: Print budget status
 */
export function printBudgetStatus(): void {
  getBudgetManager().printStatus()
}

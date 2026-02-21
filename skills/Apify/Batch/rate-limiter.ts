/**
 * Rate Limiter for Apify Batch Operations
 *
 * Controls concurrency to prevent API overload and respect rate limits.
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum concurrent requests */
  maxConcurrent: number

  /** Minimum delay between requests (ms) */
  minDelay: number

  /** Maximum requests per minute */
  maxPerMinute: number

  /** Retry count on rate limit errors */
  maxRetries: number

  /** Base delay for exponential backoff (ms) */
  retryBaseDelay: number
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxConcurrent: 5,
  minDelay: 200,
  maxPerMinute: 60,
  maxRetries: 3,
  retryBaseDelay: 1000
}

/**
 * Request tracking
 */
interface RequestTracker {
  startTime: number
  endTime?: number
  success: boolean
  retries: number
}

/**
 * Rate Limiter implementation
 */
export class RateLimiter {
  private config: RateLimiterConfig
  private activeRequests = 0
  private requestQueue: Array<() => void> = []
  private recentRequests: number[] = []
  private requestHistory: RequestTracker[] = []

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()

    const tracker: RequestTracker = {
      startTime: Date.now(),
      success: false,
      retries: 0
    }

    try {
      const result = await this.executeWithRetry(fn, tracker)
      tracker.success = true
      return result
    } finally {
      tracker.endTime = Date.now()
      this.requestHistory.push(tracker)
      this.release()

      // Clean old history (keep last 1000)
      if (this.requestHistory.length > 1000) {
        this.requestHistory = this.requestHistory.slice(-1000)
      }
    }
  }

  /**
   * Execute multiple functions with rate limiting
   */
  async executeAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(fns.map(fn => this.execute(fn)))
  }

  /**
   * Execute functions in batches
   */
  async executeBatch<T>(
    fns: Array<() => Promise<T>>,
    batchSize?: number
  ): Promise<T[]> {
    const size = batchSize || this.config.maxConcurrent
    const results: T[] = []

    for (let i = 0; i < fns.length; i += size) {
      const batch = fns.slice(i, i + size)
      const batchResults = await this.executeAll(batch)
      results.push(...batchResults)
    }

    return results
  }

  /**
   * Get current stats
   */
  getStats(): {
    activeRequests: number
    queuedRequests: number
    recentRequestsPerMinute: number
    totalRequests: number
    successRate: number
    avgRetries: number
  } {
    this.cleanRecentRequests()

    const successfulRequests = this.requestHistory.filter(r => r.success).length
    const totalRetries = this.requestHistory.reduce((sum, r) => sum + r.retries, 0)

    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      recentRequestsPerMinute: this.recentRequests.length,
      totalRequests: this.requestHistory.length,
      successRate: this.requestHistory.length > 0
        ? successfulRequests / this.requestHistory.length
        : 1,
      avgRetries: this.requestHistory.length > 0
        ? totalRetries / this.requestHistory.length
        : 0
    }
  }

  /**
   * Acquire a slot (wait if necessary)
   */
  private async acquire(): Promise<void> {
    // Wait for concurrent slot
    while (this.activeRequests >= this.config.maxConcurrent) {
      await new Promise<void>(resolve => {
        this.requestQueue.push(resolve)
      })
    }

    // Check rate limit
    this.cleanRecentRequests()
    while (this.recentRequests.length >= this.config.maxPerMinute) {
      const oldestRequest = this.recentRequests[0]
      const waitTime = oldestRequest + 60000 - Date.now()
      if (waitTime > 0) {
        await this.sleep(waitTime)
      }
      this.cleanRecentRequests()
    }

    // Apply minimum delay
    if (this.recentRequests.length > 0) {
      const lastRequest = this.recentRequests[this.recentRequests.length - 1]
      const elapsed = Date.now() - lastRequest
      if (elapsed < this.config.minDelay) {
        await this.sleep(this.config.minDelay - elapsed)
      }
    }

    this.activeRequests++
    this.recentRequests.push(Date.now())
  }

  /**
   * Release a slot
   */
  private release(): void {
    this.activeRequests--

    // Wake up next queued request
    const next = this.requestQueue.shift()
    if (next) {
      next()
    }
  }

  /**
   * Execute with retry on rate limit errors
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    tracker: RequestTracker
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error: any) {
        lastError = error
        tracker.retries = attempt

        // Check if rate limit error
        const isRateLimit =
          error.statusCode === 429 ||
          error.message?.includes('rate limit') ||
          error.message?.includes('too many requests')

        if (!isRateLimit || attempt >= this.config.maxRetries) {
          throw error
        }

        // Exponential backoff
        const delay = this.config.retryBaseDelay * Math.pow(2, attempt)
        console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${this.config.maxRetries})`)
        await this.sleep(delay)
      }
    }

    throw lastError
  }

  /**
   * Clean old requests from tracking
   */
  private cleanRecentRequests(): void {
    const oneMinuteAgo = Date.now() - 60000
    this.recentRequests = this.recentRequests.filter(t => t > oneMinuteAgo)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

let globalLimiter: RateLimiter | null = null

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter()
  }
  return globalLimiter
}

/**
 * Reset the global rate limiter
 */
export function resetRateLimiter(): void {
  globalLimiter = new RateLimiter()
}

/**
 * Configure the global rate limiter
 */
export function configureRateLimiter(config: Partial<RateLimiterConfig>): void {
  getRateLimiter().setConfig(config)
}

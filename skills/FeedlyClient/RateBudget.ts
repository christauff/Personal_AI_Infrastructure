/**
 * RateBudget.ts — Priority-based rate budget allocator
 *
 * Tracks request counts by day/hour/month and by consumer.
 * Enforces budget limits with borrowing rules.
 * Implements burst rate limiting (min 2s between requests).
 * Implements circuit breaker (5 errors in 10 min → trip).
 *
 * Reads API rate headers to maintain ground truth.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { RateState, RateLimitInfo, BudgetAllocation } from "./Types";

const DATA_DIR = join(import.meta.dir, "Data");
const STATE_PATH = join(DATA_DIR, "rate-state.json");

const BUDGETS: Record<string, BudgetAllocation> = {
  "cyber-ops":   { dailyLimit: 1000, hourlyLimit: 42, priority: 1, canBorrow: true },
  "twitter-bot": { dailyLimit: 500,  hourlyLimit: 21, priority: 2, canBorrow: false },
  "landscape":   { dailyLimit: 300,  hourlyLimit: 13, priority: 3, canBorrow: true },
  "reserve":     { dailyLimit: 167,  hourlyLimit: 7,  priority: 3, canBorrow: false },
};

const GLOBAL_DAILY_LIMIT = 1667;
const SOFT_CAP_PERCENT = 85;
const HARD_CAP_PERCENT = 90;
const MIN_REQUEST_INTERVAL_MS = 2000;  // Burst rate limit: 2s between requests
const CIRCUIT_BREAKER_ERRORS = 5;
const CIRCUIT_BREAKER_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const CIRCUIT_BREAKER_EXTENDED_MS = 30 * 60 * 1000; // 30 minutes

function today(): string { return new Date().toISOString().slice(0, 10); }
function currentHour(): string { return new Date().toISOString().slice(0, 13); }
function currentMonth(): string { return new Date().toISOString().slice(0, 7); }

function defaultState(): RateState {
  return {
    daily: { date: today(), total: 0, byEndpoint: {}, byConsumer: {} },
    hourly: { hour: currentHour(), total: 0 },
    monthly: { month: currentMonth(), total: 0 },
    lastApiRateInfo: null,
    lastRequestTs: 0,
    circuitBreaker: {
      consecutiveErrors: 0,
      firstErrorTs: 0,
      trippedUntil: 0,
      extendedCooldown: false,
    },
    lastUpdated: new Date().toISOString(),
  };
}

export function loadRateState(): RateState {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  if (!existsSync(STATE_PATH)) return defaultState();

  try {
    const state: RateState = JSON.parse(readFileSync(STATE_PATH, "utf-8"));

    // Roll over if date/hour/month changed
    if (state.daily.date !== today()) {
      state.daily = { date: today(), total: 0, byEndpoint: {}, byConsumer: {} };
    }
    if (state.hourly.hour !== currentHour()) {
      state.hourly = { hour: currentHour(), total: 0 };
    }
    if (state.monthly.month !== currentMonth()) {
      state.monthly = { month: currentMonth(), total: 0 };
    }

    // Ensure circuit breaker exists (backward compat)
    if (!state.circuitBreaker) {
      state.circuitBreaker = {
        consecutiveErrors: 0,
        firstErrorTs: 0,
        trippedUntil: 0,
        extendedCooldown: false,
      };
    }

    return state;
  } catch {
    return defaultState();
  }
}

export function saveRateState(state: RateState): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  cacheOnly?: boolean;
  remainingDaily: number;
  remainingHourly: number;
  waitMs?: number;         // If burst limited, how long to wait
}

export function checkBudget(consumer: string): BudgetCheck {
  const state = loadRateState();
  const budget = BUDGETS[consumer] || BUDGETS["reserve"];
  const now = Date.now();

  // Circuit breaker check
  if (state.circuitBreaker.trippedUntil > now) {
    const waitMs = state.circuitBreaker.trippedUntil - now;
    return {
      allowed: false,
      reason: `Circuit breaker tripped — ${Math.ceil(waitMs / 1000)}s remaining`,
      remainingDaily: GLOBAL_DAILY_LIMIT - state.daily.total,
      remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
      waitMs,
    };
  }

  // Burst rate limit check
  if (state.lastRequestTs > 0) {
    const elapsed = now - state.lastRequestTs;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
      return {
        allowed: false,
        reason: `Burst rate limit — wait ${waitMs}ms`,
        remainingDaily: GLOBAL_DAILY_LIMIT - state.daily.total,
        remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
        waitMs,
      };
    }
  }

  const usedByConsumer = state.daily.byConsumer[consumer] || 0;
  const globalUsed = state.daily.total;

  // Hard stop: API-reported rate limit at 90%
  if (state.lastApiRateInfo) {
    if (state.lastApiRateInfo.percentUsed >= HARD_CAP_PERCENT) {
      return {
        allowed: false,
        reason: `API rate limit at ${state.lastApiRateInfo.percentUsed.toFixed(0)}% — hard stop`,
        remainingDaily: GLOBAL_DAILY_LIMIT - globalUsed,
        remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
      };
    }
  }

  // Global daily cap
  if (globalUsed >= GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Global daily limit reached (${globalUsed}/${GLOBAL_DAILY_LIMIT})`,
      remainingDaily: 0,
      remainingHourly: 0,
    };
  }

  // Soft cap: cache-only mode
  if (globalUsed >= GLOBAL_DAILY_LIMIT * (SOFT_CAP_PERCENT / 100)) {
    return {
      allowed: true,
      cacheOnly: true,
      reason: `Global usage at ${((globalUsed / GLOBAL_DAILY_LIMIT) * 100).toFixed(0)}% — cache-only mode`,
      remainingDaily: GLOBAL_DAILY_LIMIT - globalUsed,
      remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
    };
  }

  // Consumer budget check with borrowing
  let effectiveLimit = budget.dailyLimit;
  if (usedByConsumer >= budget.dailyLimit && budget.canBorrow) {
    const reserveUsed = state.daily.byConsumer["reserve"] || 0;
    const reserveAvailable = BUDGETS["reserve"].dailyLimit - reserveUsed;
    if (reserveAvailable > 0) {
      effectiveLimit = budget.dailyLimit + reserveAvailable;
    }

    if (budget.priority === 1) {
      const twitterUsed = state.daily.byConsumer["twitter-bot"] || 0;
      const twitterAvailable = BUDGETS["twitter-bot"].dailyLimit - twitterUsed;
      if (twitterAvailable > 0) {
        effectiveLimit += twitterAvailable;
      }
    }
  }

  if (usedByConsumer >= effectiveLimit) {
    return {
      allowed: false,
      reason: `Consumer "${consumer}" daily limit reached (${usedByConsumer}/${effectiveLimit})`,
      remainingDaily: 0,
      remainingHourly: 0,
    };
  }

  return {
    allowed: true,
    remainingDaily: effectiveLimit - usedByConsumer,
    remainingHourly: budget.hourlyLimit - (state.hourly.total || 0),
  };
}

export function recordRequest(
  consumer: string,
  endpoint: string,
  rateInfo: RateLimitInfo | null,
): void {
  const state = loadRateState();

  state.daily.total++;
  state.daily.byEndpoint[endpoint] = (state.daily.byEndpoint[endpoint] || 0) + 1;
  state.daily.byConsumer[consumer] = (state.daily.byConsumer[consumer] || 0) + 1;
  state.hourly.total++;
  state.monthly.total++;
  state.lastRequestTs = Date.now();

  if (rateInfo) {
    state.lastApiRateInfo = rateInfo;
  }

  // Reset circuit breaker on success
  state.circuitBreaker.consecutiveErrors = 0;
  state.circuitBreaker.firstErrorTs = 0;

  saveRateState(state);
}

export function recordError(): void {
  const state = loadRateState();
  const now = Date.now();

  // Reset window if first error is stale
  if (
    state.circuitBreaker.firstErrorTs > 0 &&
    now - state.circuitBreaker.firstErrorTs > CIRCUIT_BREAKER_WINDOW_MS
  ) {
    state.circuitBreaker.consecutiveErrors = 0;
    state.circuitBreaker.firstErrorTs = 0;
  }

  state.circuitBreaker.consecutiveErrors++;
  if (state.circuitBreaker.firstErrorTs === 0) {
    state.circuitBreaker.firstErrorTs = now;
  }

  // Trip the breaker
  if (state.circuitBreaker.consecutiveErrors >= CIRCUIT_BREAKER_ERRORS) {
    const cooldown = state.circuitBreaker.extendedCooldown
      ? CIRCUIT_BREAKER_EXTENDED_MS
      : CIRCUIT_BREAKER_COOLDOWN_MS;
    state.circuitBreaker.trippedUntil = now + cooldown;
    state.circuitBreaker.extendedCooldown = !state.circuitBreaker.extendedCooldown;
    console.error(
      `[CIRCUIT BREAKER] Tripped after ${state.circuitBreaker.consecutiveErrors} errors. ` +
      `Cooldown: ${cooldown / 1000}s until ${new Date(state.circuitBreaker.trippedUntil).toISOString()}`
    );
  }

  saveRateState(state);
}

/** Wait for burst rate limit to clear */
export async function waitForBurst(): Promise<void> {
  const state = loadRateState();
  if (state.lastRequestTs > 0) {
    const elapsed = Date.now() - state.lastRequestTs;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}

/** Format budget status for display */
export function formatStatus(): string {
  const state = loadRateState();
  const lines: string[] = [];

  lines.push("Rate Budget Status");
  lines.push("=".repeat(50));
  lines.push(`Date: ${state.daily.date}`);
  lines.push(`Daily total: ${state.daily.total} / ${GLOBAL_DAILY_LIMIT}`);
  lines.push(`Hourly total: ${state.hourly.total}`);
  lines.push(`Monthly total: ${state.monthly.total}`);

  lines.push("\nBy consumer:");
  for (const [k, v] of Object.entries(state.daily.byConsumer)) {
    const budget = BUDGETS[k];
    const limit = budget ? budget.dailyLimit : "?";
    lines.push(`  ${k}: ${v} / ${limit}`);
  }

  lines.push("\nBy endpoint:");
  for (const [k, v] of Object.entries(state.daily.byEndpoint)) {
    lines.push(`  ${k}: ${v}`);
  }

  if (state.lastApiRateInfo) {
    lines.push("\nAPI Rate Headers (last seen):");
    lines.push(`  Used: ${state.lastApiRateInfo.count}/${state.lastApiRateInfo.limit}`);
    lines.push(`  Remaining: ${state.lastApiRateInfo.remaining}`);
    lines.push(`  Percent: ${state.lastApiRateInfo.percentUsed.toFixed(1)}%`);
  }

  if (state.circuitBreaker.trippedUntil > Date.now()) {
    lines.push(`\n[CIRCUIT BREAKER ACTIVE] Until: ${new Date(state.circuitBreaker.trippedUntil).toISOString()}`);
  }

  return lines.join("\n");
}

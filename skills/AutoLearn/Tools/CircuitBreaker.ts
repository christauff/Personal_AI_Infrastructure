#!/usr/bin/env bun
/**
 * CircuitBreaker - Hard budget enforcement for AutoLearn
 *
 * Prevents catastrophic API spending by enforcing hard caps.
 * When budget is exceeded, ALL autonomous operations halt.
 *
 * This is a SAFETY CRITICAL component - treat with care.
 *
 * Usage:
 *   bun run CircuitBreaker.ts check              # Check if we can proceed
 *   bun run CircuitBreaker.ts record <tokens>    # Record token usage
 *   bun run CircuitBreaker.ts status             # Show current usage
 *   bun run CircuitBreaker.ts reset              # Reset daily counters (manual only)
 *   bun run CircuitBreaker.ts trip               # Manually trip the breaker
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const USAGE_FILE = join(AUTOLEARN_DIR, 'METRICS', 'daily-usage.json');
const BREAKER_FILE = join(AUTOLEARN_DIR, 'METRICS', 'circuit-breaker.json');
const ALERT_LOG = join(AUTOLEARN_DIR, 'METRICS', 'budget-alerts.jsonl');

interface UsageData {
  date: string;
  tokens_used: number;
  phases: Record<string, number>;
  last_updated: string;
}

interface BreakerState {
  tripped: boolean;
  tripped_at: string | null;
  trip_reason: string | null;
  manual_reset_required: boolean;
  trip_count_today: number;
}

interface BudgetConfig {
  harvest_phase: number;
  extract_phase: number;
  validate_phase: number;
  generate_phase: number;
  total_max: number;
  soft_cap?: number;  // Optional daytime buffer protection (e.g., 40K with 10K buffer)
}

// HARD LIMITS - These override config values
const ABSOLUTE_MAX_TOKENS = 50000;  // Never exceed this per day, period
const WARNING_THRESHOLD = 0.7;       // Warn at 70%
const CRITICAL_THRESHOLD = 0.9;      // Critical at 90%
const HALT_THRESHOLD = 0.95;         // Halt at 95%

function loadConfig(): BudgetConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {
      harvest_phase: 4000,
      extract_phase: 10000,
      validate_phase: 8000,
      generate_phase: 3000,
      total_max: 45000,
      soft_cap: 40000
    };
  }
  const config = parse(readFileSync(CONFIG_FILE, 'utf-8'));
  return config.budget || {
    harvest_phase: 4000,
    extract_phase: 10000,
    validate_phase: 8000,
    generate_phase: 3000,
    total_max: 45000,
    soft_cap: 40000
  };
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function loadUsage(): UsageData {
  const today = getToday();

  if (!existsSync(USAGE_FILE)) {
    return {
      date: today,
      tokens_used: 0,
      phases: {},
      last_updated: new Date().toISOString()
    };
  }

  const data: UsageData = JSON.parse(readFileSync(USAGE_FILE, 'utf-8'));

  // Reset if new day
  if (data.date !== today) {
    return {
      date: today,
      tokens_used: 0,
      phases: {},
      last_updated: new Date().toISOString()
    };
  }

  return data;
}

function saveUsage(usage: UsageData): void {
  usage.last_updated = new Date().toISOString();
  writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function loadBreakerState(): BreakerState {
  if (!existsSync(BREAKER_FILE)) {
    return {
      tripped: false,
      tripped_at: null,
      trip_reason: null,
      manual_reset_required: false,
      trip_count_today: 0
    };
  }

  const state: BreakerState = JSON.parse(readFileSync(BREAKER_FILE, 'utf-8'));

  // Auto-reset at midnight if not manual_reset_required
  const today = getToday();
  if (state.tripped_at && !state.tripped_at.startsWith(today) && !state.manual_reset_required) {
    return {
      tripped: false,
      tripped_at: null,
      trip_reason: null,
      manual_reset_required: false,
      trip_count_today: 0
    };
  }

  return state;
}

function saveBreakerState(state: BreakerState): void {
  writeFileSync(BREAKER_FILE, JSON.stringify(state, null, 2));
}

function logAlert(level: 'WARNING' | 'CRITICAL' | 'TRIPPED', message: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  appendFileSync(ALERT_LOG, JSON.stringify(entry) + '\n');

  // Also try to send voice notification
  try {
    const { execSync } = require('child_process');
    const voiceMessage = level === 'TRIPPED'
      ? 'Circuit breaker tripped. All autonomous operations halted.'
      : `Budget ${level.toLowerCase()}: ${message}`;

    execSync(`curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify -H "Content-Type: application/json" -d '{"message": "${voiceMessage}", "priority": "high"}' > /dev/null 2>&1 &`, {
      timeout: 1000
    });
  } catch {
    // Voice notification is best-effort
  }
}

function tripBreaker(reason: string, requireManualReset: boolean = false): void {
  const state = loadBreakerState();
  state.tripped = true;
  state.tripped_at = new Date().toISOString();
  state.trip_reason = reason;
  state.manual_reset_required = requireManualReset;
  state.trip_count_today++;
  saveBreakerState(state);

  logAlert('TRIPPED', reason);

  console.log('\n🚨 CIRCUIT BREAKER TRIPPED 🚨');
  console.log('═'.repeat(60));
  console.log(`Reason: ${reason}`);
  console.log(`Time: ${state.tripped_at}`);
  if (requireManualReset) {
    console.log('\n⚠️  MANUAL RESET REQUIRED');
    console.log('Run: bun run CircuitBreaker.ts reset');
  }
  console.log('═'.repeat(60));
}

// Commands
function checkCanProceed(): boolean {
  const breaker = loadBreakerState();

  if (breaker.tripped) {
    console.log('❌ BLOCKED: Circuit breaker is tripped');
    console.log(`   Reason: ${breaker.trip_reason}`);
    console.log(`   Tripped at: ${breaker.tripped_at}`);
    if (breaker.manual_reset_required) {
      console.log('   ⚠️  Manual reset required');
    }
    process.exit(1);
  }

  const usage = loadUsage();
  const config = loadConfig();
  // Use soft_cap if set (for daytime buffer protection), otherwise use total_max
  const limit = Math.min(config.soft_cap || config.total_max, ABSOLUTE_MAX_TOKENS);
  const percentage = usage.tokens_used / limit;

  if (percentage >= HALT_THRESHOLD) {
    tripBreaker(`Daily token usage at ${Math.round(percentage * 100)}% (${usage.tokens_used}/${limit})`, true);
    process.exit(1);
  }

  if (percentage >= CRITICAL_THRESHOLD) {
    logAlert('CRITICAL', `Usage at ${Math.round(percentage * 100)}%`);
    console.log(`⚠️  CRITICAL: Budget at ${Math.round(percentage * 100)}%`);
  } else if (percentage >= WARNING_THRESHOLD) {
    logAlert('WARNING', `Usage at ${Math.round(percentage * 100)}%`);
    console.log(`⚠️  WARNING: Budget at ${Math.round(percentage * 100)}%`);
  }

  console.log(`✅ OK: ${usage.tokens_used}/${limit} tokens used (${Math.round(percentage * 100)}%)`);
  return true;
}

function recordUsage(tokens: number, phase?: string): void {
  // Check first
  const breaker = loadBreakerState();
  if (breaker.tripped) {
    console.error('❌ Cannot record: Circuit breaker is tripped');
    process.exit(1);
  }

  const usage = loadUsage();
  const config = loadConfig();

  // Check phase limit if specified
  if (phase) {
    const phaseLimit = config[`${phase}_phase` as keyof BudgetConfig] as number || 10000;
    const phaseUsed = (usage.phases[phase] || 0) + tokens;

    if (phaseUsed > phaseLimit) {
      tripBreaker(`Phase "${phase}" exceeded limit: ${phaseUsed}/${phaseLimit} tokens`);
      process.exit(1);
    }

    usage.phases[phase] = phaseUsed;
  }

  // Check total limit (use soft_cap if set, otherwise total_max)
  const newTotal = usage.tokens_used + tokens;
  const limit = Math.min(config.soft_cap || config.total_max, ABSOLUTE_MAX_TOKENS);

  if (newTotal > limit) {
    tripBreaker(`Daily token limit exceeded: ${newTotal}/${limit}`);
    process.exit(1);
  }

  usage.tokens_used = newTotal;
  saveUsage(usage);

  const percentage = newTotal / limit;
  console.log(`📊 Recorded ${tokens} tokens${phase ? ` (${phase})` : ''}`);
  console.log(`   Total: ${newTotal}/${limit} (${Math.round(percentage * 100)}%)`);

  // Check thresholds
  if (percentage >= CRITICAL_THRESHOLD) {
    logAlert('CRITICAL', `Usage at ${Math.round(percentage * 100)}%`);
    console.log(`⚠️  CRITICAL: Approaching limit!`);
  } else if (percentage >= WARNING_THRESHOLD) {
    logAlert('WARNING', `Usage at ${Math.round(percentage * 100)}%`);
    console.log(`⚠️  WARNING: High usage`);
  }
}

function showStatus(): void {
  const usage = loadUsage();
  const config = loadConfig();
  const breaker = loadBreakerState();
  const limit = Math.min(config.soft_cap || config.total_max, ABSOLUTE_MAX_TOKENS);
  const percentage = usage.tokens_used / limit;

  console.log('\n🔌 CIRCUIT BREAKER STATUS');
  console.log('═'.repeat(60));

  // Breaker state
  if (breaker.tripped) {
    console.log(`\n🚨 BREAKER: TRIPPED`);
    console.log(`   Reason: ${breaker.trip_reason}`);
    console.log(`   Since: ${breaker.tripped_at}`);
    if (breaker.manual_reset_required) {
      console.log(`   ⚠️  Manual reset required`);
    }
  } else {
    console.log(`\n✅ BREAKER: CLOSED (operational)`);
  }

  // Usage stats
  console.log(`\n📊 TODAY'S USAGE (${usage.date})`);
  const bar = '█'.repeat(Math.floor(percentage * 40)) + '░'.repeat(40 - Math.floor(percentage * 40));
  console.log(`   [${bar}] ${Math.round(percentage * 100)}%`);
  console.log(`   Tokens: ${usage.tokens_used.toLocaleString()} / ${limit.toLocaleString()}`);

  // Phase breakdown
  if (Object.keys(usage.phases).length > 0) {
    console.log('\n   By Phase:');
    for (const [phase, tokens] of Object.entries(usage.phases)) {
      const phaseLimit = config[`${phase}_phase` as keyof BudgetConfig] as number || 10000;
      console.log(`     ${phase}: ${tokens}/${phaseLimit}`);
    }
  }

  // Thresholds
  console.log('\n   Thresholds:');
  console.log(`     Warning: ${Math.round(WARNING_THRESHOLD * 100)}% (${Math.round(limit * WARNING_THRESHOLD).toLocaleString()} tokens)`);
  console.log(`     Critical: ${Math.round(CRITICAL_THRESHOLD * 100)}% (${Math.round(limit * CRITICAL_THRESHOLD).toLocaleString()} tokens)`);
  console.log(`     Halt: ${Math.round(HALT_THRESHOLD * 100)}% (${Math.round(limit * HALT_THRESHOLD).toLocaleString()} tokens)`);
  console.log(`     Absolute Max: ${ABSOLUTE_MAX_TOKENS.toLocaleString()} tokens`);

  // Trip count
  if (breaker.trip_count_today > 0) {
    console.log(`\n   ⚠️  Tripped ${breaker.trip_count_today} time(s) today`);
  }

  console.log('\n' + '═'.repeat(60));
}

function resetBreaker(): void {
  const breaker = loadBreakerState();

  if (!breaker.tripped) {
    console.log('ℹ️  Breaker is not tripped, nothing to reset');
    return;
  }

  breaker.tripped = false;
  breaker.tripped_at = null;
  breaker.trip_reason = null;
  breaker.manual_reset_required = false;
  saveBreakerState(breaker);

  console.log('✅ Circuit breaker reset');
  console.log('   Autonomous operations can now resume');

  logAlert('WARNING', 'Circuit breaker manually reset');
}

function manualTrip(): void {
  tripBreaker('Manually tripped by operator', true);
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'check':
    checkCanProceed();
    break;

  case 'record':
    if (!args[0]) {
      console.error('Usage: CircuitBreaker.ts record <tokens> [phase]');
      process.exit(1);
    }
    recordUsage(parseInt(args[0], 10), args[1]);
    break;

  case 'status':
    showStatus();
    break;

  case 'reset':
    resetBreaker();
    break;

  case 'trip':
    manualTrip();
    break;

  default:
    console.log(`
CircuitBreaker - Hard Budget Enforcement for AutoLearn

Usage:
  bun run CircuitBreaker.ts check              Check if operations can proceed
  bun run CircuitBreaker.ts record <tokens> [phase]  Record token usage
  bun run CircuitBreaker.ts status             Show current usage and breaker state
  bun run CircuitBreaker.ts reset              Reset tripped breaker (manual only)
  bun run CircuitBreaker.ts trip               Manually trip the breaker

Thresholds:
  Warning:  70% - Log alert, continue
  Critical: 90% - Log alert, continue with caution
  Halt:     95% - Trip breaker, halt all operations
  Absolute: 50,000 tokens/day - Hard cap, overrides config

When tripped:
  - All AutoLearn phases will refuse to start
  - Manual reset required to resume
  - Voice notification sent (if server running)

This is a SAFETY CRITICAL component to prevent catastrophic API spending.
`);
}

#!/usr/bin/env bun
/**
 * CalculateBudget.ts - Budget metrics calculator
 *
 * Reads config.yaml + usage.jsonl and computes per-service and aggregate metrics.
 *
 * Usage:
 *   bun run CalculateBudget.ts          # Human-readable summary
 *   bun run CalculateBudget.ts --brief  # One-liner for MorningBrief
 *   bun run CalculateBudget.ts --json   # Machine-readable
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const BUDGET_DIR = join(process.env.HOME!, '.claude', 'BUDGET');
const CONFIG_PATH = join(BUDGET_DIR, 'config.yaml');
const USAGE_PATH = join(BUDGET_DIR, 'usage.jsonl');

interface Service {
  name: string;
  type: string;
  monthly_cost?: number;
  monthly_budget?: number;
  provider: string;
  tracking?: string;
}

interface Config {
  services: Record<string, Service>;
  totals: { monthly_total: number; annual_total: number };
  alerts: { thresholds: Record<string, number> };
}

interface UsageRecord {
  timestamp: string;
  service?: string;
  cost_estimated?: number;
  cost_usd?: number;
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  messages?: { user?: number; assistant?: number; total?: number };
  duration_minutes?: number;
  session_id?: string;
}

function getServiceBudget(service: Service): number {
  return service.monthly_cost ?? service.monthly_budget ?? 0;
}

function getAlertEmoji(percent: number, thresholds: Record<string, number>): string {
  if (percent >= (thresholds.critical || 0.95)) return '\u{1F534}';
  if (percent >= (thresholds.warning || 0.85)) return '\u{1F7E0}';
  if (percent >= (thresholds.caution || 0.70)) return '\u{1F7E1}';
  return '\u{1F7E2}';
}

function main() {
  const args = process.argv.slice(2);
  const briefMode = args.includes('--brief');
  const jsonMode = args.includes('--json');

  if (!existsSync(CONFIG_PATH)) {
    console.error('Config not found:', CONFIG_PATH);
    process.exit(1);
  }

  const config: Config = parseYaml(readFileSync(CONFIG_PATH, 'utf-8'));
  if (!config.services) config.services = {};
  if (!config.totals) config.totals = { monthly_total: 0, annual_total: 0 };
  if (!config.alerts) config.alerts = { thresholds: { caution: 0.70, warning: 0.85, critical: 0.95 } };

  // Load usage
  const usage: UsageRecord[] = [];
  if (existsSync(USAGE_PATH)) {
    const lines = readFileSync(USAGE_PATH, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try { usage.push(JSON.parse(line)); } catch {}
    }
  }

  // Filter to current month
  const now = new Date();
  const thisMonth = usage.filter(u => {
    if (!u.timestamp) return false;
    const d = new Date(u.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Per-service metrics
  const serviceMetrics: Record<string, {
    name: string;
    type: string;
    budget: number;
    spent: number;
    sessions: number;
    total_tokens: number;
    percent: number;
  }> = {};

  let totalSpent = 0;
  let totalSessions = 0;
  let totalTokens = 0;

  for (const [key, service] of Object.entries(config.services)) {
    if (service.type === 'cancelled') continue;
    const budget = getServiceBudget(service);
    const serviceUsage = thisMonth.filter(u => u.service === key);
    const spent = serviceUsage.reduce((sum, u) => sum + (u.cost_estimated || u.cost_usd || 0), 0);
    const sessions = serviceUsage.length;
    const tokens = serviceUsage.reduce((sum, u) => {
      if (u.tokens) {
        return sum + (u.tokens.input_tokens || 0) + (u.tokens.output_tokens || 0);
      }
      return sum;
    }, 0);

    totalSpent += spent;
    totalSessions += sessions;
    totalTokens += tokens;

    serviceMetrics[key] = {
      name: service.name,
      type: service.type,
      budget,
      spent,
      sessions,
      total_tokens: tokens,
      percent: budget > 0 ? spent / budget : 0,
    };
  }

  const totalBudget = config.totals.monthly_total;
  const totalPercent = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const remaining = totalBudget - totalSpent;
  const emoji = getAlertEmoji(totalPercent, config.alerts.thresholds);

  // === Brief mode ===
  if (briefMode) {
    console.log(`${emoji} **${(totalPercent * 100).toFixed(0)}%** consumed | $${remaining.toFixed(0)} remaining | ${daysRemaining} days`);
    return;
  }

  // === JSON mode ===
  if (jsonMode) {
    console.log(JSON.stringify({
      timestamp: now.toISOString(),
      period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      day_of_month: dayOfMonth,
      days_remaining: daysRemaining,
      total: {
        budget: totalBudget,
        spent: totalSpent,
        remaining,
        percent: Math.round(totalPercent * 1000) / 10,
        sessions: totalSessions,
        tokens: totalTokens,
        level: emoji,
      },
      services: serviceMetrics,
    }, null, 2));
    return;
  }

  // === Default: human-readable ===
  console.log(`\n${emoji} PAI Budget Status - ${now.toISOString().slice(0, 10)}`);
  console.log('='.repeat(55));
  console.log(`Total: $${totalSpent.toFixed(2)} / $${totalBudget.toFixed(2)} (${(totalPercent * 100).toFixed(1)}%)`);
  console.log(`Remaining: $${remaining.toFixed(2)} | ${daysRemaining} days left`);
  console.log(`Sessions this month: ${totalSessions}`);
  if (totalTokens > 0) {
    console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
  }
  console.log('-'.repeat(55));

  for (const [key, m] of Object.entries(serviceMetrics)) {
    const pct = (m.percent * 100).toFixed(1);
    if (m.type === 'subscription') {
      console.log(`  ${m.name}: ${m.sessions} sessions, ${m.total_tokens.toLocaleString()} tokens (flat $${m.budget}/mo)`);
    } else {
      console.log(`  ${m.name}: $${m.spent.toFixed(2)} / $${m.budget.toFixed(2)} (${pct}%) - ${m.sessions} calls`);
    }
  }

  console.log('='.repeat(55));
}

main();

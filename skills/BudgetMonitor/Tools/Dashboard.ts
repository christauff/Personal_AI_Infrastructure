#!/usr/bin/env bun
/**
 * PAI Budget Dashboard Generator
 * Generates an HTML dashboard showing budget status across all AI services
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { homedir } from 'os';
import { join } from 'path';

const BUDGET_DIR = join(homedir(), '.claude', 'BUDGET');
const CONFIG_PATH = join(BUDGET_DIR, 'config.yaml');
const USAGE_PATH = join(BUDGET_DIR, 'usage.jsonl');
const OUTPUT_PATH = join(BUDGET_DIR, 'dashboard.html');

interface Service {
  name: string;
  type: string;
  monthly_cost?: number;
  monthly_budget?: number;
  reset_day: number;
  provider: string;
  tracking?: string;
  used_by: string[];
}

function getServiceBudget(service: Service): number {
  return service.monthly_cost ?? service.monthly_budget ?? 0;
}

interface UsageRecord {
  timestamp: string;
  service?: string;
  cost_estimated?: number;
  cost_usd?: number;
  rating?: number;
  tasks_completed?: number;
}

interface Config {
  services: Record<string, Service>;
  totals: { monthly_total: number; annual_total: number };
  alerts: { thresholds: Record<string, number> };
}

function loadConfig(): Config {
  const content = readFileSync(CONFIG_PATH, 'utf-8');
  const raw = parseYaml(content) as Config;
  if (!raw.services) raw.services = {};
  if (!raw.totals) raw.totals = { monthly_total: 0, annual_total: 0 };
  if (!raw.alerts) raw.alerts = { thresholds: { caution: 0.70, warning: 0.85, critical: 0.95 } };
  return raw;
}

function loadUsage(): UsageRecord[] {
  if (!existsSync(USAGE_PATH)) return [];
  const content = readFileSync(USAGE_PATH, 'utf-8');
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function getAlertLevel(percent: number, thresholds: Record<string, number>): string {
  if (percent >= thresholds.critical) return 'critical';
  if (percent >= thresholds.warning) return 'warning';
  if (percent >= thresholds.caution) return 'caution';
  return 'normal';
}

function getAlertColor(level: string): string {
  switch (level) {
    case 'critical': return '#EF4444';
    case 'warning': return '#F97316';
    case 'caution': return '#EAB308';
    default: return '#22C55E';
  }
}

function getAlertEmoji(level: string): string {
  switch (level) {
    case 'critical': return '🔴';
    case 'warning': return '🟠';
    case 'caution': return '🟡';
    default: return '🟢';
  }
}

function calculateMetrics(config: Config, usage: UsageRecord[]) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Filter to current month
  const thisMonth = usage.filter(u => {
    const d = new Date(u.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Per-service metrics
  const serviceMetrics: Record<string, {
    spent: number;
    budget: number;
    percent: number;
    level: string;
  }> = {};

  let totalSpent = 0;

  for (const [key, service] of Object.entries(config.services)) {
    if (service.type === 'cancelled') continue;
    const serviceUsage = thisMonth.filter(u => u.service === key);
    const spent = serviceUsage.reduce((sum, u) => sum + (u.cost_estimated || u.cost_usd || 0), 0);
    totalSpent += spent;

    const budget = getServiceBudget(service);
    const percent = budget > 0 ? (spent / budget) * 100 : 0;

    serviceMetrics[key] = {
      spent,
      budget,
      percent,
      level: budget > 0 ? getAlertLevel(spent / budget, config.alerts.thresholds) : 'normal'
    };
  }

  const totalBudget = config.totals.monthly_total;
  const totalPercent = (totalSpent / totalBudget) * 100;
  const dailyAverage = totalSpent / dayOfMonth;
  const projectedTotal = dailyAverage * daysInMonth;

  return {
    totalSpent,
    totalBudget,
    totalPercent,
    totalRemaining: totalBudget - totalSpent,
    daysInMonth,
    dayOfMonth,
    daysRemaining,
    dailyAverage,
    projectedTotal,
    runway: (totalBudget - totalSpent) / dailyAverage,
    level: getAlertLevel(totalSpent / totalBudget, config.alerts.thresholds),
    serviceMetrics,
    usageCount: thisMonth.length,
    avgRating: thisMonth.filter(u => u.rating).reduce((sum, u) => sum + (u.rating || 0), 0) /
      (thisMonth.filter(u => u.rating).length || 1)
  };
}

function generateHTML(config: Config, metrics: ReturnType<typeof calculateMetrics>): string {
  const serviceRows = Object.entries(config.services)
    .filter(([_, service]) => service.type !== 'cancelled')
    .map(([key, service]) => {
    const sm = metrics.serviceMetrics[key];
    if (!sm) return '';
    const budget = getServiceBudget(service);
    return `
      <tr>
        <td>
          <span class="service-badge" style="background: ${getProviderColor(service.provider)}">${service.provider}</span>
          ${service.name}
        </td>
        <td>$${sm.spent.toFixed(2)}</td>
        <td>$${budget.toFixed(2)}</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(sm.percent, 100)}%; background: ${getAlertColor(sm.level)}"></div>
          </div>
          <span class="percent">${sm.percent.toFixed(1)}%</span>
        </td>
        <td>${getAlertEmoji(sm.level)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="300">
  <title>PAI Budget Dashboard</title>
  <style>
    :root {
      --pai-blue: #3B82F6;
      --pai-dark: #1E3A5F;
      --pai-light: #93C5FD;
      --bg-dark: #0F172A;
      --bg-card: #1E293B;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --status-green: #22C55E;
      --status-yellow: #EAB308;
      --status-orange: #F97316;
      --status-red: #EF4444;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: var(--bg-dark);
      color: var(--text-primary);
      padding: 2rem;
      min-height: 100vh;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--pai-dark);
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--pai-light);
    }

    .status-badge {
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      background: ${getAlertColor(metrics.level)}20;
      color: ${getAlertColor(metrics.level)};
      border: 1px solid ${getAlertColor(metrics.level)};
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid var(--pai-dark);
    }

    .card-title {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .card-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--pai-light);
    }

    .card-subtitle {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .big-gauge {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 2rem;
      border: 1px solid var(--pai-dark);
      margin-bottom: 2rem;
      text-align: center;
    }

    .gauge-container {
      width: 200px;
      height: 200px;
      margin: 0 auto 1rem;
      position: relative;
    }

    .gauge-bg {
      fill: none;
      stroke: var(--pai-dark);
      stroke-width: 20;
    }

    .gauge-fill {
      fill: none;
      stroke: ${getAlertColor(metrics.level)};
      stroke-width: 20;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 0.5s ease;
    }

    .gauge-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .gauge-percent {
      font-size: 2.5rem;
      font-weight: 700;
      color: ${getAlertColor(metrics.level)};
    }

    .gauge-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--pai-dark);
    }

    th {
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .service-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-right: 0.5rem;
      color: white;
    }

    .progress-bar {
      width: 100px;
      height: 8px;
      background: var(--pai-dark);
      border-radius: 4px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .percent {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .footer {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--pai-dark);
    }

    .vision-section {
      background: linear-gradient(135deg, var(--pai-dark) 0%, var(--bg-card) 100%);
      border-radius: 12px;
      padding: 2rem;
      margin-top: 2rem;
      border: 1px solid var(--pai-blue);
    }

    .vision-title {
      color: var(--pai-light);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .vision-text {
      color: var(--text-secondary);
      line-height: 1.6;
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      .grid { grid-template-columns: 1fr; }
      .gauge-container { width: 150px; height: 150px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 PAI Budget Dashboard</h1>
      <span class="status-badge">${getAlertEmoji(metrics.level)} ${metrics.level.toUpperCase()}</span>
    </header>

    <div class="big-gauge">
      <div class="gauge-container">
        <svg viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="40"/>
          <circle class="gauge-fill" cx="50" cy="50" r="40"
            stroke-dasharray="${2 * Math.PI * 40}"
            stroke-dashoffset="${2 * Math.PI * 40 * (1 - Math.min(metrics.totalPercent, 100) / 100)}"/>
        </svg>
        <div class="gauge-text">
          <div class="gauge-percent">${metrics.totalPercent.toFixed(0)}%</div>
          <div class="gauge-label">of monthly budget</div>
        </div>
      </div>
      <div style="font-size: 1.5rem; color: var(--pai-light);">
        $${metrics.totalSpent.toFixed(2)} / $${metrics.totalBudget.toFixed(2)}
      </div>
      <div style="color: var(--text-secondary); margin-top: 0.5rem;">
        ${metrics.daysRemaining} days remaining • $${metrics.totalRemaining.toFixed(2)} left
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Daily Average</div>
        <div class="card-value">$${metrics.dailyAverage.toFixed(2)}</div>
        <div class="card-subtitle">per day this month</div>
      </div>
      <div class="card">
        <div class="card-title">Projected Total</div>
        <div class="card-value">$${metrics.projectedTotal.toFixed(2)}</div>
        <div class="card-subtitle">${metrics.projectedTotal > metrics.totalBudget ? '⚠️ Over budget' : '✓ Under budget'}</div>
      </div>
      <div class="card">
        <div class="card-title">Runway</div>
        <div class="card-value">${isFinite(metrics.runway) ? metrics.runway.toFixed(0) : '∞'}</div>
        <div class="card-subtitle">days at current rate</div>
      </div>
      <div class="card">
        <div class="card-title">Sessions</div>
        <div class="card-value">${metrics.usageCount}</div>
        <div class="card-subtitle">this month</div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-bottom: 1rem; color: var(--pai-light);">Services Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Spent</th>
            <th>Budget</th>
            <th>Usage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${serviceRows}
        </tbody>
        <tfoot>
          <tr style="font-weight: 600; color: var(--pai-light);">
            <td>TOTAL</td>
            <td>$${metrics.totalSpent.toFixed(2)}</td>
            <td>$${metrics.totalBudget.toFixed(2)}</td>
            <td>
              <div class="progress-bar" style="width: 150px;">
                <div class="progress-fill" style="width: ${Math.min(metrics.totalPercent, 100)}%; background: ${getAlertColor(metrics.level)}"></div>
              </div>
              <span class="percent">${metrics.totalPercent.toFixed(1)}%</span>
            </td>
            <td>${getAlertEmoji(metrics.level)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="vision-section">
      <h3 class="vision-title">🚀 The Accelerando Vision</h3>
      <p class="vision-text">
        <strong>Current Phase:</strong> Visibility (Phase 1)<br><br>
        This dashboard is the first step toward financial autonomy. Today we see what we consume.
        Tomorrow we'll understand our value. Eventually, the value we create will exceed the resources we consume.<br><br>
        <strong>Monthly AI costs:</strong> $${metrics.totalBudget.toFixed(2)}<br>
        <strong>Annual projection:</strong> $${(metrics.totalBudget * 12).toFixed(2)}<br>
        <strong>Self-funding target:</strong> December 2026
      </p>
    </div>

    <div class="footer">
      Generated: ${new Date().toISOString()}<br>
      Auto-refreshes every 5 minutes • PAI Budget Monitor
    </div>
  </div>
</body>
</html>`;
}

function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    anthropic: '#D97757',
    openai: '#10A37F',
    google: '#4285F4',
    perplexity: '#20B2AA',
    xai: '#1DA1F2',
    apify: '#00D68F',
    shodan: '#B91C1C',
    openrouter: '#FF6B35'
  };
  return colors[provider] || '#6B7280';
}

// Main execution
const config = loadConfig();
const usage = loadUsage();
const metrics = calculateMetrics(config, usage);
const html = generateHTML(config, metrics);

writeFileSync(OUTPUT_PATH, html);
console.log(`Dashboard generated: ${OUTPUT_PATH}`);
console.log(`Status: ${getAlertEmoji(metrics.level)} ${metrics.level.toUpperCase()}`);
console.log(`Total: $${metrics.totalSpent.toFixed(2)} / $${metrics.totalBudget.toFixed(2)} (${metrics.totalPercent.toFixed(1)}%)`);

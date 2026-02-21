#!/usr/bin/env bun
/**
 * AutoLearn Dashboard - Unified status view of all AutoLearn subsystems
 *
 * Aggregates:
 * - TrustManager: Category scores, graduation progress
 * - CircuitBreaker: Usage %, thresholds, trip status
 * - StateGuardian: Health score, checkpoints
 * - Pipeline: Harvest status, pending tasks, executions
 *
 * Usage:
 *   bun run Dashboard.ts           # Full dashboard
 *   bun run Dashboard.ts --compact # Compact one-liner
 *   bun run Dashboard.ts --json    # JSON output for scripts
 *
 * AutoLearn Task: autolearn-2026-01-31-002
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');

interface DashboardData {
  trust: {
    scores: Record<string, number>;
    graduated: string[];
    building: string[];
    gated: string[];
  };
  circuit: {
    status: 'CLOSED' | 'TRIPPED';
    usage: number;
    limit: number;
    percentage: number;
    tripsToday: number;
  };
  health: {
    score: number;
    status: 'HEALTHY' | 'DEGRADED' | 'POISONED';
    checkpoints: number;
    lastCheck: string | null;
  };
  pipeline: {
    lastHarvest: string | null;
    pendingTasks: number;
    approvedTasks: number;
    executedToday: number;
  };
}

function loadConfig(): any {
  if (!existsSync(CONFIG_FILE)) return {};
  return parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function countFiles(dir: string): number {
  const path = join(AUTOLEARN_DIR, dir);
  if (!existsSync(path)) return 0;
  return readdirSync(path).filter(f => f.endsWith('.yaml') || f.endsWith('.md') || f.endsWith('.jsonl')).length;
}

function getLastHarvest(): string | null {
  const harvestDir = join(AUTOLEARN_DIR, 'HARVEST');
  if (!existsSync(harvestDir)) return null;
  const files = readdirSync(harvestDir).filter(f => f.endsWith('.jsonl')).sort().reverse();
  if (files.length === 0) return null;
  return files[0].replace('-content.jsonl', '').replace('-test-content.jsonl', '');
}

function getTrustData(config: any): DashboardData['trust'] {
  const scores = config.trust_scores || {};
  const threshold = config.graduation_threshold || 80;
  const riskHigh = config.risk_classification?.HIGH || ['new-skill', 'infrastructure', 'security'];

  const graduated: string[] = [];
  const building: string[] = [];
  const gated: string[] = [];

  for (const [category, score] of Object.entries(scores)) {
    if (riskHigh.includes(category)) {
      gated.push(category);
    } else if ((score as number) >= threshold) {
      graduated.push(category);
    } else {
      building.push(category);
    }
  }

  return { scores: scores as Record<string, number>, graduated, building, gated };
}

function getCircuitData(): DashboardData['circuit'] {
  const usageFile = join(AUTOLEARN_DIR, 'METRICS', 'daily-usage.json');
  const breakerFile = join(AUTOLEARN_DIR, 'METRICS', 'circuit-breaker.json');
  const config = loadConfig();

  let usage = 0;
  let tripsToday = 0;
  let status: 'CLOSED' | 'TRIPPED' = 'CLOSED';

  if (existsSync(usageFile)) {
    const data = JSON.parse(readFileSync(usageFile, 'utf-8'));
    const today = new Date().toISOString().split('T')[0];
    if (data.date === today) {
      usage = data.tokens_used || 0;
    }
  }

  if (existsSync(breakerFile)) {
    const data = JSON.parse(readFileSync(breakerFile, 'utf-8'));
    if (data.tripped) status = 'TRIPPED';
    tripsToday = data.trip_count_today || 0;
  }

  const limit = Math.min(config.budget?.total_max || 30000, 50000);
  const percentage = Math.round((usage / limit) * 100);

  return { status, usage, limit, percentage, tripsToday };
}

function getHealthData(): DashboardData['health'] {
  const healthFile = join(AUTOLEARN_DIR, 'METRICS', 'health-history.jsonl');
  const checkpointsDir = join(AUTOLEARN_DIR, 'CHECKPOINTS');

  let score = 100;
  let status: 'HEALTHY' | 'DEGRADED' | 'POISONED' = 'HEALTHY';
  let lastCheck: string | null = null;
  let checkpoints = 0;

  if (existsSync(healthFile)) {
    const lines = readFileSync(healthFile, 'utf-8').trim().split('\n');
    if (lines.length > 0 && lines[lines.length - 1]) {
      const last = JSON.parse(lines[lines.length - 1]);
      score = last.score || 100;
      lastCheck = last.timestamp?.substring(11, 16) || null;
      if (last.poisoned) {
        status = 'POISONED';
      } else if (score < 80) {
        status = 'DEGRADED';
      }
    }
  }

  if (existsSync(checkpointsDir)) {
    checkpoints = readdirSync(checkpointsDir).filter(f => f.endsWith('.yaml')).length;
  }

  return { score, status, checkpoints, lastCheck };
}

function getPipelineData(): DashboardData['pipeline'] {
  const today = new Date().toISOString().split('T')[0];
  const executedDir = join(AUTOLEARN_DIR, 'EXECUTED');

  let executedToday = 0;
  if (existsSync(executedDir)) {
    executedToday = readdirSync(executedDir).filter(f => f.startsWith(today)).length;
  }

  return {
    lastHarvest: getLastHarvest(),
    pendingTasks: countFiles('PENDING'),
    approvedTasks: countFiles('APPROVED'),
    executedToday
  };
}

function collectData(): DashboardData {
  const config = loadConfig();
  return {
    trust: getTrustData(config),
    circuit: getCircuitData(),
    health: getHealthData(),
    pipeline: getPipelineData()
  };
}

function renderBar(value: number, max: number, width: number = 10): string {
  const filled = Math.floor((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'HEALTHY':
    case 'CLOSED':
      return '✅';
    case 'DEGRADED':
      return '⚠️';
    case 'POISONED':
    case 'TRIPPED':
      return '🚨';
    default:
      return '❓';
  }
}

function renderFullDashboard(data: DashboardData): void {
  const config = loadConfig();
  const threshold = config.graduation_threshold || 80;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        AUTOLEARN DASHBOARD                               ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');

  // Row 1: Trust Scores + Circuit Breaker
  console.log('║ 🎯 TRUST SCORES                    │ 🔌 CIRCUIT BREAKER                  ║');

  const trustEntries = Object.entries(data.trust.scores).slice(0, 4);
  const circuitLines = [
    `Status: ${data.circuit.status} ${statusIcon(data.circuit.status)}`,
    `Usage: ${data.circuit.usage.toLocaleString()}/${(data.circuit.limit / 1000).toFixed(0)}K (${data.circuit.percentage}%)`,
    `[${renderBar(data.circuit.usage, data.circuit.limit, 20)}]`,
    `Trips today: ${data.circuit.tripsToday}`
  ];

  for (let i = 0; i < 4; i++) {
    let leftPart = '';
    if (trustEntries[i]) {
      const [cat, score] = trustEntries[i];
      const bar = renderBar(score as number, threshold, 8);
      const catName = cat.substring(0, 14).padEnd(14);
      leftPart = `${catName} [${bar}] ${String(score).padStart(2)}/${threshold}`;
    }
    const rightPart = circuitLines[i] || '';
    console.log(`║ ${leftPart.padEnd(35)}│ ${rightPart.padEnd(37)}║`);
  }

  console.log('╠────────────────────────────────────┼──────────────────────────────────────╣');

  // Row 2: State Guardian + Pipeline Status
  console.log('║ 🛡️  STATE GUARDIAN                  │ 📋 PIPELINE STATUS                   ║');

  const healthLines = [
    `Health: ${data.health.score}/100 ${statusIcon(data.health.status)}`,
    `Checkpoints: ${data.health.checkpoints}`,
    `Last check: ${data.health.lastCheck || 'never'}`,
    ''
  ];

  const pipelineLines = [
    `Last harvest: ${data.pipeline.lastHarvest || 'never'}`,
    `Pending: ${data.pipeline.pendingTasks} │ Approved: ${data.pipeline.approvedTasks}`,
    `Executed today: ${data.pipeline.executedToday}`,
    ''
  ];

  for (let i = 0; i < 4; i++) {
    console.log(`║ ${(healthLines[i] || '').padEnd(35)}│ ${(pipelineLines[i] || '').padEnd(37)}║`);
  }

  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  // Summary line
  const graduated = data.trust.graduated.length;
  const building = data.trust.building.length;
  const gated = data.trust.gated.length;
  console.log(`\n📊 Trust: ${graduated} graduated, ${building} building, ${gated} always-gated`);
  console.log(`🕐 Gate mode: ${config.gate_mode || 'morning-brief'}`);
  console.log('');
}

function renderCompact(data: DashboardData): void {
  const healthIcon = statusIcon(data.health.status);
  const circuitIcon = statusIcon(data.circuit.status);
  const trustSum = Object.values(data.trust.scores).reduce((a, b) => a + b, 0);
  const trustAvg = Math.round(trustSum / Object.keys(data.trust.scores).length);

  console.log(`AutoLearn: ${healthIcon} Health:${data.health.score} ${circuitIcon} Budget:${data.circuit.percentage}% 🎯 Trust:${trustAvg}avg 📋 Pending:${data.pipeline.pendingTasks}`);
}

function renderJson(data: DashboardData): void {
  console.log(JSON.stringify(data, null, 2));
}

// Main
const args = process.argv.slice(2);

const data = collectData();

if (args.includes('--json')) {
  renderJson(data);
} else if (args.includes('--compact')) {
  renderCompact(data);
} else {
  renderFullDashboard(data);
}

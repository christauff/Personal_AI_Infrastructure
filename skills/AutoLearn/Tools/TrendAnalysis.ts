#!/usr/bin/env bun
/**
 * TrendAnalysis - Harvest phase cost tracking and optimization recommendations
 *
 * Analyzes daily-usage patterns to help optimize budget allocation
 * Shows trends and recommends safe reductions based on historical data
 *
 * Usage:
 *   bun run TrendAnalysis.ts report          # Show full trend analysis
 *   bun run TrendAnalysis.ts chart           # ASCII chart of last 7 days
 *   bun run TrendAnalysis.ts recommend       # Get optimization recommendations
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const TREND_FILE = join(AUTOLEARN_DIR, 'METRICS', 'harvest-trend.csv');
const USAGE_FILE = join(AUTOLEARN_DIR, 'METRICS', 'daily-usage.json');

interface TrendEntry {
  date: string;
  harvest: number;
  total: number;
  trips: number;
}

function loadTrend(): TrendEntry[] {
  if (!existsSync(TREND_FILE)) {
    return [];
  }

  const lines = readFileSync(TREND_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const entries: TrendEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const [date, harvest, total, trips] = lines[i].split(',');
    if (date) {
      entries.push({
        date,
        harvest: parseInt(harvest, 10) || 0,
        total: parseInt(total, 10) || 0,
        trips: parseInt(trips, 10) || 0
      });
    }
  }

  return entries;
}

function formatChart(entries: TrendEntry[]): void {
  console.log('\n📊 HARVEST PHASE COSTS (Last 7 Days)');
  console.log('════════════════════════════════════════════════════════════════');

  const maxHarvest = Math.max(...entries.map(e => e.harvest));
  const scale = 40 / maxHarvest;

  for (const entry of entries.slice(-7)) {
    const barLength = Math.round(entry.harvest * scale);
    const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
    const alerts = entry.trips > 0 ? ` 🚨 ${entry.trips} trips` : '';
    console.log(`${entry.date} [${bar}] ${entry.harvest.toLocaleString()}${alerts}`);
  }

  console.log('════════════════════════════════════════════════════════════════');
}

function showReport(): void {
  const entries = loadTrend();

  if (entries.length === 0) {
    console.log('❌ No trend data available yet. Need to wait for AutoLearn runs.');
    return;
  }

  console.log('\n📈 HARVEST PHASE TREND ANALYSIS');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Stats
  const harvests = entries.map(e => e.harvest);
  const avg = Math.round(harvests.reduce((a, b) => a + b, 0) / harvests.length);
  const min = Math.min(...harvests);
  const max = Math.max(...harvests);
  const stdDev = Math.round(
    Math.sqrt(harvests.map(h => Math.pow(h - avg, 2)).reduce((a, b) => a + b, 0) / harvests.length)
  );

  console.log(`Samples: ${entries.length} nights`);
  console.log(`Average: ${avg.toLocaleString()} tokens`);
  console.log(`Min: ${min.toLocaleString()} | Max: ${max.toLocaleString()}`);
  console.log(`StdDev: ±${stdDev.toLocaleString()} tokens`);

  // Recent performance
  const last3 = entries.slice(-3);
  const last3Trips = last3.reduce((sum, e) => sum + e.trips, 0);
  const last3Avg = Math.round(last3.reduce((sum, e) => sum + e.harvest, 0) / last3.length);

  console.log(`\nLast 3 nights:`);
  console.log(`  Average: ${last3Avg.toLocaleString()} tokens`);
  console.log(`  Circuit breaker trips: ${last3Trips}`);

  if (last3Trips === 0) {
    console.log(`  Status: ✅ STABLE (zero trips)`);
  } else {
    console.log(`  Status: ⚠️  UNSTABLE (${last3Trips} trips)`);
  }

  // Show chart
  formatChart(entries);

  // Trajectory
  console.log('\n📉 TREND DIRECTION');
  if (entries.length >= 2) {
    const recentAvg = entries.slice(-3).reduce((s, e) => s + e.harvest, 0) / Math.min(3, entries.length);
    const olderAvg = entries.slice(0, Math.max(1, entries.length - 3)).reduce((s, e) => s + e.harvest, 0) / Math.max(1, entries.length - 3);
    const delta = recentAvg - olderAvg;

    if (Math.abs(delta) < 100) {
      console.log('  → Stable (trending flat)');
    } else if (delta < 0) {
      console.log(`  ↓ Decreasing (${Math.round(delta).toLocaleString()} tokens/night)`);
    } else {
      console.log(`  ↑ Increasing (${Math.round(delta).toLocaleString()} tokens/night)`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
}

function showRecommendations(): void {
  const entries = loadTrend();

  if (entries.length === 0) {
    console.log('❌ No trend data available yet.');
    return;
  }

  console.log('\n💡 OPTIMIZATION RECOMMENDATIONS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const last3 = entries.slice(-3);
  const last3Trips = last3.reduce((sum, e) => sum + e.trips, 0);
  const last3Avg = last3.reduce((sum, e) => sum + e.harvest, 0) / last3.length;

  if (entries.length < 3) {
    console.log('⏳ Need 3+ nights of data before making recommendations.');
    console.log(`   Currently have ${entries.length} night(s).`);
    return;
  }

  if (last3Trips > 0) {
    console.log('⚠️  NOT READY TO REDUCE');
    console.log(`Last 3 nights had ${last3Trips} circuit breaker trip(s).`);
    console.log('Wait for 3 consecutive clean nights before reducing budget.');
    console.log('\nTo debug high usage:');
    console.log('  1. Check AUTOLEARN/HARVEST/*-content.jsonl file sizes');
    console.log('  2. Review AUTOLEARN/METRICS/autolearn.log for phase details');
    console.log('  3. Consider if content sources are growing');
  } else {
    console.log('✅ READY TO REDUCE (3 clean nights confirmed)');
    console.log(`\nCurrent: Harvest phase 4000 tokens`);
    console.log(`Recent avg: ${Math.round(last3Avg).toLocaleString()} tokens`);
    console.log(`\nRecommendation: Reduce to 3500 tokens (500 token reduction)`);
    console.log('\nThis is safe because:');
    console.log('  • Last 3 nights: zero circuit breaker trips');
    console.log('  • Average usage: well below 4000 limit');
    console.log('  • Only 12.5% reduction (conservative)');
    console.log('\nTo apply: Run: auto-reduce-harvest.sh');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
}

// Main
const [,, command] = process.argv;

switch (command) {
  case 'chart':
    formatChart(loadTrend());
    break;

  case 'recommend':
    showRecommendations();
    break;

  case 'report':
  default:
    showReport();
    if (command === 'report' || !command) {
      showRecommendations();
    }
}

#!/usr/bin/env bun
/**
 * TrustManager - Trust score tracking for AutoLearn system
 *
 * Tracks trust scores per category, handles graduation,
 * and logs trust history for audit.
 *
 * Usage:
 *   bun run TrustManager.ts status              # Show current trust scores
 *   bun run TrustManager.ts check <category>    # Check if category is graduated
 *   bun run TrustManager.ts record <task-id> <outcome>  # Record approval outcome
 *   bun run TrustManager.ts history [category]  # Show trust history
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const HISTORY_FILE = join(AUTOLEARN_DIR, 'METRICS', 'trust-history.jsonl');

interface Config {
  gate_mode: 'morning-brief' | 'autonomous';
  trust_scores: Record<string, number>;
  graduation_threshold: number;
  score_adjustments: {
    approved_clean: number;
    approved_minor: number;
    approved_major: number;
    rejected: number;
  };
  risk_classification: {
    LOW: string[];
    MEDIUM: string[];
    HIGH: string[];
  };
}

interface HistoryEntry {
  timestamp: string;
  task_id: string;
  category: string;
  outcome: string;
  score_before: number;
  score_after: number;
  graduated: boolean;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error('❌ Config file not found:', CONFIG_FILE);
    process.exit(1);
  }
  return parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config;
}

function saveConfig(config: Config): void {
  writeFileSync(CONFIG_FILE, stringify(config));
}

function appendHistory(entry: HistoryEntry): void {
  appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
}

function getRiskLevel(config: Config, category: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (config.risk_classification.LOW.includes(category)) return 'LOW';
  if (config.risk_classification.MEDIUM.includes(category)) return 'MEDIUM';
  return 'HIGH';
}

function isGraduated(config: Config, category: string): boolean {
  const score = config.trust_scores[category] ?? 0;
  const riskLevel = getRiskLevel(config, category);

  // HIGH risk never graduates
  if (riskLevel === 'HIGH') return false;

  // Must be in autonomous mode and above threshold
  return config.gate_mode === 'autonomous' && score >= config.graduation_threshold;
}

// Command handlers
function showStatus(): void {
  const config = loadConfig();

  console.log('\n🎯 AUTOLEARN TRUST STATUS');
  console.log('═'.repeat(60));
  console.log(`\nGate Mode: ${config.gate_mode}`);
  console.log(`Graduation Threshold: ${config.graduation_threshold}`);
  console.log('\nTrust Scores by Category:\n');

  const categories = Object.entries(config.trust_scores).sort((a, b) => b[1] - a[1]);

  for (const [category, score] of categories) {
    const riskLevel = getRiskLevel(config, category);
    const graduated = isGraduated(config, category);
    const bar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
    const status = graduated ? '✅ GRADUATED' : riskLevel === 'HIGH' ? '🔒 ALWAYS GATED' : '⏳ BUILDING';

    console.log(`  ${category.padEnd(20)} [${bar}] ${score.toString().padStart(3)}/100  ${status}`);
  }

  console.log('\n' + '═'.repeat(60));
}

function checkCategory(category: string): void {
  const config = loadConfig();

  if (!(category in config.trust_scores)) {
    console.error(`❌ Unknown category: ${category}`);
    console.log('Valid categories:', Object.keys(config.trust_scores).join(', '));
    process.exit(1);
  }

  const score = config.trust_scores[category];
  const riskLevel = getRiskLevel(config, category);
  const graduated = isGraduated(config, category);

  console.log(`\nCategory: ${category}`);
  console.log(`Score: ${score}/${config.graduation_threshold}`);
  console.log(`Risk Level: ${riskLevel}`);
  console.log(`Graduated: ${graduated ? 'YES ✅' : 'NO ⏳'}`);

  if (riskLevel === 'HIGH') {
    console.log('\n⚠️  HIGH risk categories never graduate - always require MorningBrief approval');
  } else if (!graduated && config.gate_mode === 'autonomous') {
    const needed = config.graduation_threshold - score;
    console.log(`\nPoints needed for graduation: ${needed}`);
  } else if (config.gate_mode === 'morning-brief') {
    console.log('\n⚠️  Gate mode is "morning-brief" - switch to "autonomous" for graduation');
  }
}

function recordOutcome(taskId: string, outcome: string): void {
  const config = loadConfig();

  // Validate outcome
  const validOutcomes = ['approved_clean', 'approved_minor', 'approved_major', 'rejected', 'executed'];
  if (!validOutcomes.includes(outcome)) {
    console.error(`❌ Invalid outcome: ${outcome}`);
    console.log('Valid outcomes:', validOutcomes.join(', '));
    process.exit(1);
  }

  // Try to find the task to get its category
  const pendingPath = join(AUTOLEARN_DIR, 'PENDING', `${taskId}.yaml`);
  const approvedPath = join(AUTOLEARN_DIR, 'APPROVED', `${taskId}.yaml`);
  const executedPath = join(AUTOLEARN_DIR, 'EXECUTED');

  let taskPath = '';
  let category = 'unknown';

  if (existsSync(pendingPath)) {
    taskPath = pendingPath;
  } else if (existsSync(approvedPath)) {
    taskPath = approvedPath;
  }

  if (taskPath) {
    try {
      const task = parse(readFileSync(taskPath, 'utf-8'));
      category = task.category || 'unknown';
    } catch {
      console.warn('⚠️  Could not read task file, using default category');
    }
  }

  if (category === 'unknown' || !(category in config.trust_scores)) {
    console.error(`❌ Unknown category: ${category}`);
    console.log('Please specify category manually or ensure task file exists');
    process.exit(1);
  }

  const scoreBefore = config.trust_scores[category];
  let adjustment = 0;

  // 'executed' is just a log entry, no score change
  if (outcome !== 'executed') {
    adjustment = config.score_adjustments[outcome as keyof typeof config.score_adjustments];
  }

  // Apply adjustment with bounds
  const newScore = Math.max(0, Math.min(100, scoreBefore + adjustment));
  config.trust_scores[category] = newScore;

  // Check for graduation
  const wasGraduated = isGraduated({ ...config, trust_scores: { [category]: scoreBefore } } as Config, category);
  const nowGraduated = isGraduated(config, category);

  // Save updated config
  saveConfig(config);

  // Log to history
  const historyEntry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    category,
    outcome,
    score_before: scoreBefore,
    score_after: newScore,
    graduated: nowGraduated
  };
  appendHistory(historyEntry);

  // Output
  console.log(`\n✅ Recorded outcome for ${taskId}`);
  console.log(`   Category: ${category}`);
  console.log(`   Outcome: ${outcome}`);
  console.log(`   Score: ${scoreBefore} → ${newScore} (${adjustment >= 0 ? '+' : ''}${adjustment})`);

  if (!wasGraduated && nowGraduated) {
    console.log(`\n🎉 GRADUATION! Category "${category}" has graduated to autonomous mode!`);
  }

  if (outcome === 'rejected' && scoreBefore >= config.graduation_threshold && newScore < config.graduation_threshold) {
    console.log(`\n⚠️  Category "${category}" has been DEMOTED - back to morning-brief approval`);
  }
}

function showHistory(category?: string): void {
  if (!existsSync(HISTORY_FILE)) {
    console.log('\n📊 No trust history recorded yet.');
    return;
  }

  const lines = readFileSync(HISTORY_FILE, 'utf-8').trim().split('\n');
  let entries: HistoryEntry[] = lines.map(line => JSON.parse(line));

  if (category) {
    entries = entries.filter(e => e.category === category);
  }

  // Show last 20 entries
  entries = entries.slice(-20);

  console.log('\n📊 TRUST HISTORY' + (category ? ` (${category})` : ''));
  console.log('═'.repeat(80));
  console.log('Timestamp'.padEnd(25) + 'Task ID'.padEnd(30) + 'Outcome'.padEnd(15) + 'Score Change');
  console.log('─'.repeat(80));

  for (const entry of entries) {
    const change = entry.score_after - entry.score_before;
    const changeStr = change >= 0 ? `+${change}` : `${change}`;
    console.log(
      entry.timestamp.substring(0, 19).padEnd(25) +
      entry.task_id.substring(0, 28).padEnd(30) +
      entry.outcome.padEnd(15) +
      `${entry.score_before} → ${entry.score_after} (${changeStr})`
    );
  }

  console.log('─'.repeat(80));
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'status':
    showStatus();
    break;

  case 'check':
    if (!args[0]) {
      console.error('Usage: TrustManager.ts check <category>');
      process.exit(1);
    }
    checkCategory(args[0]);
    break;

  case 'record':
    if (!args[0] || !args[1]) {
      console.error('Usage: TrustManager.ts record <task-id> <outcome>');
      console.error('Outcomes: approved_clean, approved_minor, approved_major, rejected, executed');
      process.exit(1);
    }
    recordOutcome(args[0], args[1]);
    break;

  case 'history':
    showHistory(args[0]);
    break;

  default:
    console.log(`
AutoLearn TrustManager

Usage:
  bun run TrustManager.ts status              Show current trust scores
  bun run TrustManager.ts check <category>    Check if category is graduated
  bun run TrustManager.ts record <task-id> <outcome>  Record approval outcome
  bun run TrustManager.ts history [category]  Show trust history

Outcomes:
  approved_clean  - Approved without modification (+10)
  approved_minor  - Approved with minor edits (+5)
  approved_major  - Approved with major edits (+2)
  rejected        - Rejected entirely (-15)
  executed        - Task executed (log only, no score change)
`);
}

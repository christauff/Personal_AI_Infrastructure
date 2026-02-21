#!/usr/bin/env bun
/**
 * CostEstimator - Calculate cost risks before operations run
 *
 * Provides visibility into what operations will cost BEFORE they execute.
 * Helps with planning and avoiding surprise token usage.
 *
 * Note: On Claude Code subscription ($200/mo), actual $ cost is fixed,
 * but token tracking helps optimize usage and identify inefficiencies.
 *
 * Usage:
 *   bun run CostEstimator.ts estimate <operation>    # Estimate operation cost
 *   bun run CostEstimator.ts pipeline                # Estimate full AutoLearn pipeline
 *   bun run CostEstimator.ts compare <op1> <op2>     # Compare operation costs
 *   bun run CostEstimator.ts history                 # Show historical usage
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const USAGE_FILE = join(AUTOLEARN_DIR, 'METRICS', 'daily-usage.json');

// Cost estimates in tokens (based on typical PAI operations)
// These are approximations - actual usage varies by content
const OPERATION_COSTS: Record<string, {
  tokens: number;
  description: string;
  factors: string[];
  apiCostPer1K?: number;  // If using API directly (not subscription)
}> = {
  // AutoLearn phases
  'harvest': {
    tokens: 5000,
    description: 'Fetch content from monitored sources',
    factors: ['Number of sources', 'Content size', 'Web fetch retries'],
    apiCostPer1K: 0.003  // Claude 3.5 Sonnet input
  },
  'extract': {
    tokens: 10000,
    description: 'WisdomSynthesis extraction from content',
    factors: ['Content complexity', 'Number of articles', 'Extraction depth'],
    apiCostPer1K: 0.015  // Mixed input/output
  },
  'validate': {
    tokens: 8000,
    description: 'RedTeam validation with 8 adversarial agents',
    factors: ['Number of insights', 'Agent thoroughness', 'Injection checks'],
    apiCostPer1K: 0.015
  },
  'generate': {
    tokens: 3000,
    description: 'Generate task proposals from validated insights',
    factors: ['Number of validated insights', 'Task complexity'],
    apiCostPer1K: 0.015
  },
  'execute': {
    tokens: 5000,
    description: 'Engineer agent implements approved tasks',
    factors: ['Task complexity', 'Files modified', 'Verification steps'],
    apiCostPer1K: 0.015
  },

  // Other PAI operations
  'research-quick': {
    tokens: 3000,
    description: 'Quick research with 1-2 sources',
    factors: ['Query complexity', 'Source availability'],
    apiCostPer1K: 0.01
  },
  'research-standard': {
    tokens: 8000,
    description: 'Standard research with multiple sources',
    factors: ['Topic breadth', 'Source diversity'],
    apiCostPer1K: 0.015
  },
  'research-extensive': {
    tokens: 20000,
    description: 'Extensive research with parallel agents',
    factors: ['Topic complexity', 'Number of agents', 'Synthesis depth'],
    apiCostPer1K: 0.02
  },
  'redteam-full': {
    tokens: 15000,
    description: 'Full RedTeam analysis with 32 agents',
    factors: ['Target complexity', 'Agent diversity'],
    apiCostPer1K: 0.02
  },
  'wisdom-synthesis': {
    tokens: 12000,
    description: 'Multi-skill orchestration pipeline',
    factors: ['Pipeline stages', 'Content size'],
    apiCostPer1K: 0.015
  },
  'browser-task': {
    tokens: 2000,
    description: 'Browser automation and screenshots',
    factors: ['Page complexity', 'Interactions needed'],
    apiCostPer1K: 0.01
  },
  'agent-spawn': {
    tokens: 1000,
    description: 'Spawn a single sub-agent',
    factors: ['Task complexity', 'Agent type'],
    apiCostPer1K: 0.008
  },
  'file-edit': {
    tokens: 500,
    description: 'Read and edit a single file',
    factors: ['File size', 'Change complexity'],
    apiCostPer1K: 0.005
  }
};

// Pipeline combinations
const PIPELINES: Record<string, string[]> = {
  'autolearn-full': ['harvest', 'extract', 'validate', 'generate'],
  'autolearn-with-execute': ['harvest', 'extract', 'validate', 'generate', 'execute'],
  'research-to-action': ['research-standard', 'redteam-full', 'generate', 'execute'],
  'wisdom-pipeline': ['research-extensive', 'wisdom-synthesis', 'validate']
};

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function estimateApiCost(tokens: number, costPer1K: number): string {
  const cost = (tokens / 1000) * costPer1K;
  return `$${cost.toFixed(2)}`;
}

function estimateOperation(operation: string): void {
  const op = OPERATION_COSTS[operation.toLowerCase()];

  if (!op) {
    console.log(`\n❓ Unknown operation: ${operation}`);
    console.log('\nAvailable operations:');
    Object.entries(OPERATION_COSTS).forEach(([name, data]) => {
      console.log(`  ${name.padEnd(20)} ${formatTokens(data.tokens).padStart(6)} tokens - ${data.description}`);
    });
    return;
  }

  console.log('\n📊 COST ESTIMATE');
  console.log('═'.repeat(60));
  console.log(`\nOperation: ${operation}`);
  console.log(`Description: ${op.description}`);
  console.log(`\nEstimated Tokens: ${formatTokens(op.tokens)} (${op.tokens.toLocaleString()})`);

  if (op.apiCostPer1K) {
    console.log(`\nIf using API (not subscription):`);
    console.log(`  Cost: ${estimateApiCost(op.tokens, op.apiCostPer1K)}`);
    console.log(`  Rate: $${op.apiCostPer1K}/1K tokens`);
  }

  console.log(`\nCost factors (actual usage varies by):`);
  op.factors.forEach(f => console.log(`  • ${f}`));

  // Compare to subscription value
  console.log('\n💡 Subscription perspective:');
  console.log(`  $200/mo Max tier provides ~100K+ tokens/day effective`);
  console.log(`  This operation uses ~${((op.tokens / 100000) * 100).toFixed(1)}% of daily capacity`);

  console.log('\n' + '═'.repeat(60));
}

function estimatePipeline(pipelineName?: string): void {
  const name = pipelineName?.toLowerCase() || 'autolearn-full';
  const pipeline = PIPELINES[name];

  if (!pipeline) {
    console.log(`\n❓ Unknown pipeline: ${name}`);
    console.log('\nAvailable pipelines:');
    Object.entries(PIPELINES).forEach(([pName, ops]) => {
      const total = ops.reduce((sum, op) => sum + (OPERATION_COSTS[op]?.tokens || 0), 0);
      console.log(`  ${pName.padEnd(25)} ${formatTokens(total).padStart(6)} tokens - ${ops.join(' → ')}`);
    });
    return;
  }

  console.log('\n📊 PIPELINE COST ESTIMATE');
  console.log('═'.repeat(70));
  console.log(`\nPipeline: ${name}`);
  console.log(`Stages: ${pipeline.join(' → ')}\n`);

  let totalTokens = 0;
  let totalApiCost = 0;

  console.log('Stage'.padEnd(20) + 'Tokens'.padStart(10) + 'API Cost'.padStart(12) + '  Description');
  console.log('─'.repeat(70));

  pipeline.forEach(opName => {
    const op = OPERATION_COSTS[opName];
    if (op) {
      totalTokens += op.tokens;
      const apiCost = op.apiCostPer1K ? (op.tokens / 1000) * op.apiCostPer1K : 0;
      totalApiCost += apiCost;
      console.log(
        opName.padEnd(20) +
        formatTokens(op.tokens).padStart(10) +
        `$${apiCost.toFixed(2)}`.padStart(12) +
        `  ${op.description.substring(0, 35)}`
      );
    }
  });

  console.log('─'.repeat(70));
  console.log(
    'TOTAL'.padEnd(20) +
    formatTokens(totalTokens).padStart(10) +
    `$${totalApiCost.toFixed(2)}`.padStart(12)
  );

  console.log('\n💡 Subscription perspective:');
  console.log(`  $200/mo Max tier: This pipeline is effectively FREE`);
  console.log(`  If paying API: $${totalApiCost.toFixed(2)} per run`);
  console.log(`  Daily capacity used: ~${((totalTokens / 100000) * 100).toFixed(1)}%`);

  console.log('\n' + '═'.repeat(70));
}

function compareOperations(op1: string, op2: string): void {
  const operation1 = OPERATION_COSTS[op1.toLowerCase()];
  const operation2 = OPERATION_COSTS[op2.toLowerCase()];

  if (!operation1 || !operation2) {
    console.log(`\n❌ One or both operations not found`);
    return;
  }

  console.log('\n📊 COST COMPARISON');
  console.log('═'.repeat(60));
  console.log(`\n${''.padEnd(20)} ${op1.padStart(15)} ${op2.padStart(15)}`);
  console.log('─'.repeat(60));
  console.log(`${'Tokens'.padEnd(20)} ${formatTokens(operation1.tokens).padStart(15)} ${formatTokens(operation2.tokens).padStart(15)}`);

  const cost1 = operation1.apiCostPer1K ? (operation1.tokens / 1000) * operation1.apiCostPer1K : 0;
  const cost2 = operation2.apiCostPer1K ? (operation2.tokens / 1000) * operation2.apiCostPer1K : 0;
  console.log(`${'API Cost'.padEnd(20)} ${'$' + cost1.toFixed(2).padStart(14)} ${'$' + cost2.toFixed(2).padStart(14)}`);

  const diff = operation1.tokens - operation2.tokens;
  const diffPercent = ((operation1.tokens / operation2.tokens) - 1) * 100;
  console.log('─'.repeat(60));
  console.log(`Difference: ${op1} is ${Math.abs(diffPercent).toFixed(0)}% ${diffPercent > 0 ? 'more' : 'less'} expensive`);

  console.log('\n' + '═'.repeat(60));
}

function showHistory(): void {
  console.log('\n📊 USAGE HISTORY');
  console.log('═'.repeat(60));

  if (!existsSync(USAGE_FILE)) {
    console.log('\nNo usage history recorded yet.');
    console.log('Usage is tracked when AutoLearn pipeline runs.');
    return;
  }

  const usage = JSON.parse(readFileSync(USAGE_FILE, 'utf-8'));
  console.log(`\nDate: ${usage.date}`);
  console.log(`Total tokens used: ${usage.tokens_used.toLocaleString()}`);
  console.log(`Last updated: ${usage.last_updated}`);

  if (Object.keys(usage.phases || {}).length > 0) {
    console.log('\nBy phase:');
    Object.entries(usage.phases).forEach(([phase, tokens]) => {
      console.log(`  ${phase}: ${(tokens as number).toLocaleString()} tokens`);
    });
  }

  console.log('\n' + '═'.repeat(60));
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'estimate':
    estimateOperation(args[0] || 'autolearn-full');
    break;

  case 'pipeline':
    estimatePipeline(args[0]);
    break;

  case 'compare':
    if (!args[0] || !args[1]) {
      console.error('Usage: CostEstimator.ts compare <operation1> <operation2>');
      process.exit(1);
    }
    compareOperations(args[0], args[1]);
    break;

  case 'history':
    showHistory();
    break;

  default:
    console.log(`
CostEstimator - Calculate cost risks before operations run

Usage:
  bun run CostEstimator.ts estimate <operation>    Estimate operation cost
  bun run CostEstimator.ts pipeline [name]         Estimate full pipeline cost
  bun run CostEstimator.ts compare <op1> <op2>     Compare operation costs
  bun run CostEstimator.ts history                 Show historical usage

Operations:
  harvest, extract, validate, generate, execute
  research-quick, research-standard, research-extensive
  redteam-full, wisdom-synthesis, browser-task, agent-spawn, file-edit

Pipelines:
  autolearn-full, autolearn-with-execute
  research-to-action, wisdom-pipeline

Note: On Claude Code $200/mo subscription, actual cost is fixed.
Token tracking helps optimize usage and identify inefficiencies.
`);
}

#!/usr/bin/env bun
/**
 * Autonomous Budget Calculator
 *
 * Calculates available inference budget for autonomous tasks (tidepools,
 * research agents, dream consolidation) based on subscription limits and
 * current usage patterns.
 *
 * Philosophy: Subscriptions are "use it or lose it" - unused capacity at
 * month end is wasted money. This calculator maximizes value extraction.
 *
 * Usage:
 *   bun run AutonomousBudget.ts              # Full report
 *   bun run AutonomousBudget.ts --json       # Machine-readable
 *   bun run AutonomousBudget.ts --recommend  # Just recommendations
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';

const PAI_DIR = process.env.HOME + '/.claude';
const BUDGET_DIR = join(PAI_DIR, 'BUDGET');
const CONFIG_PATH = join(BUDGET_DIR, 'config.yaml');

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceConfig {
  name: string;
  type: 'subscription' | 'api' | 'hybrid' | 'cancelled';
  monthly_cost?: number;
  monthly_budget?: number;
  reset_day: number;
  provider: string;
  tracking?: string;
  used_by: string[];
  // Subscription-specific
  estimated_monthly_tokens?: number;
  estimated_daily_capacity?: number;
  // API-specific
  api_pricing?: Record<string, number>;
}

interface BudgetConfig {
  services: Record<string, ServiceConfig>;
  totals: {
    monthly_total: number;
    annual_total: number;
  };
  alerts: {
    thresholds: Record<string, number>;
  };
}

interface AutonomousBudget {
  service: string;
  days_remaining: number;
  days_elapsed: number;
  ideal_usage_percent: number;
  estimated_usage_percent: number;
  headroom_percent: number;
  autonomous_tokens_available: number;
  autonomous_cost_equivalent: number;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Capacity Estimates
// ═══════════════════════════════════════════════════════════════════════════

// Estimated monthly token capacity per service (based on subscription value)
// These are rough estimates - adjust based on actual limits
const SERVICE_CAPACITIES: Record<string, {
  monthly_tokens: number;
  typical_daily_interactive: number;  // Tokens used in typical interactive session
  cost_per_1m_tokens: number;         // To convert back to $ value
}> = {
  claude: {
    monthly_tokens: 10_000_000,       // ~10M tokens/month on Max
    typical_daily_interactive: 200_000, // ~200K tokens/day interactive use
    cost_per_1m_tokens: 45.00,        // Blended Opus/Sonnet
  },
  chatgpt: {
    monthly_tokens: 8_000_000,        // GPT-4o/O3 capacity
    typical_daily_interactive: 100_000,
    cost_per_1m_tokens: 25.00,
  },
  perplexity: {
    monthly_tokens: 500_000,          // ~500 Pro queries
    typical_daily_interactive: 20_000,
    cost_per_1m_tokens: 40.00,
  },
  grok: {
    monthly_tokens: 2_000_000,        // SuperGrok capacity
    typical_daily_interactive: 50_000,
    cost_per_1m_tokens: 15.00,
  },
  gemini: {
    monthly_tokens: 5_000_000,        // Gemini Advanced
    typical_daily_interactive: 100_000,
    cost_per_1m_tokens: 4.00,
  },
  codex: {
    monthly_tokens: 2_000_000,        // Codex CLI
    typical_daily_interactive: 50_000,
    cost_per_1m_tokens: 10.00,
  },
  claude_max: {
    monthly_tokens: 10_000_000,       // Claude Max subscription
    typical_daily_interactive: 200_000,
    cost_per_1m_tokens: 45.00,
  },
  openrouter: {
    monthly_tokens: 10_000_000,       // Budget-based, varies by model
    typical_daily_interactive: 200_000,
    cost_per_1m_tokens: 5.00,         // Blended avg (Flash $0.50, Pro $1.25, o3 $1.75)
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Core Calculations
// ═══════════════════════════════════════════════════════════════════════════

function getDaysInMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function getDaysRemaining(resetDay: number = 1): number {
  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = getDaysInMonth();

  if (currentDay >= resetDay) {
    // Days until next reset (next month)
    return daysInMonth - currentDay + resetDay;
  } else {
    // Days until reset this month
    return resetDay - currentDay;
  }
}

function getDaysElapsed(resetDay: number = 1): number {
  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = getDaysInMonth();

  if (currentDay >= resetDay) {
    return currentDay - resetDay;
  } else {
    // We're before reset day, so full month minus remaining
    return daysInMonth - resetDay + currentDay;
  }
}

function calculateIdealUsagePercent(daysElapsed: number, daysInMonth: number): number {
  return (daysElapsed / daysInMonth) * 100;
}

function estimateCurrentUsage(service: string, daysElapsed: number): number {
  // Estimate based on typical interactive usage patterns
  const capacity = SERVICE_CAPACITIES[service];
  if (!capacity) return 50; // Default 50% if unknown

  const interactiveUsed = capacity.typical_daily_interactive * daysElapsed;
  const percentUsed = (interactiveUsed / capacity.monthly_tokens) * 100;

  return Math.min(percentUsed, 100);
}

function calculateAutonomousBudget(
  service: string,
  config: ServiceConfig
): AutonomousBudget {
  const capacity = SERVICE_CAPACITIES[service];
  const daysInMonth = getDaysInMonth();
  const daysRemaining = getDaysRemaining(config.reset_day);
  const daysElapsed = getDaysElapsed(config.reset_day);

  const idealUsagePercent = calculateIdealUsagePercent(daysElapsed, daysInMonth);
  const estimatedUsagePercent = estimateCurrentUsage(service, daysElapsed);

  // Headroom = how much we're "behind" ideal pace (positive = can spend more)
  const headroomPercent = idealUsagePercent - estimatedUsagePercent;

  // Calculate available autonomous tokens
  let autonomousTokens = 0;
  let autonomousCost = 0;
  let recommendation = '';
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (capacity) {
    // Method 1: Use headroom (catch up to ideal pace)
    const headroomTokens = (headroomPercent / 100) * capacity.monthly_tokens;

    // Method 2: Use remaining days' allocation minus projected interactive
    const remainingAllocation = (daysRemaining / daysInMonth) * capacity.monthly_tokens;
    const projectedInteractive = capacity.typical_daily_interactive * daysRemaining;
    const surplusTokens = remainingAllocation - projectedInteractive;

    // Take the more conservative estimate
    autonomousTokens = Math.max(0, Math.min(headroomTokens, surplusTokens));
    autonomousCost = (autonomousTokens / 1_000_000) * capacity.cost_per_1m_tokens;

    // Generate recommendation
    if (autonomousTokens > 500_000) {
      recommendation = `🟢 RICH: ${(autonomousTokens / 1_000_000).toFixed(1)}M tokens available. Run multiple heavy agents.`;
      confidence = 'high';
    } else if (autonomousTokens > 100_000) {
      recommendation = `🟡 MODERATE: ${(autonomousTokens / 1000).toFixed(0)}K tokens. Run 1-2 research tasks.`;
      confidence = 'medium';
    } else if (autonomousTokens > 0) {
      recommendation = `🟠 LIMITED: ${(autonomousTokens / 1000).toFixed(0)}K tokens. Light tasks only.`;
      confidence = 'medium';
    } else {
      recommendation = `🔴 DEPLETED: At or above capacity. Defer autonomous work.`;
      confidence = 'high';
    }
  } else {
    recommendation = `⚪ UNKNOWN: No capacity data for ${service}. Using conservative estimate.`;
    confidence = 'low';
    autonomousTokens = 50_000; // Conservative default
  }

  return {
    service,
    days_remaining: daysRemaining,
    days_elapsed: daysElapsed,
    ideal_usage_percent: Math.round(idealUsagePercent * 10) / 10,
    estimated_usage_percent: Math.round(estimatedUsagePercent * 10) / 10,
    headroom_percent: Math.round(headroomPercent * 10) / 10,
    autonomous_tokens_available: Math.round(autonomousTokens),
    autonomous_cost_equivalent: Math.round(autonomousCost * 100) / 100,
    recommendation,
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Recommendations Engine
// ═══════════════════════════════════════════════════════════════════════════

interface AgentRecommendation {
  agent_type: string;
  estimated_tokens: number;
  priority: 'high' | 'medium' | 'low';
  suggested_service: string;
  reason: string;
}

function generateAgentRecommendations(budgets: AutonomousBudget[]): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];

  // Find best service for each agent type
  const claude = budgets.find(b => b.service === 'claude');
  const chatgpt = budgets.find(b => b.service === 'chatgpt');
  const perplexity = budgets.find(b => b.service === 'perplexity');
  const gemini = budgets.find(b => b.service === 'gemini');
  const grok = budgets.find(b => b.service === 'grok');

  // Dream Consolidation - needs strong reasoning (Claude or GPT)
  if (claude && claude.autonomous_tokens_available > 100_000) {
    recommendations.push({
      agent_type: 'Dream Consolidation',
      estimated_tokens: 80_000,
      priority: 'high',
      suggested_service: 'claude',
      reason: 'Memory synthesis needs strong reasoning. Claude has headroom.',
    });
  }

  // Research Agents - can use multiple services
  if (perplexity && perplexity.autonomous_tokens_available > 20_000) {
    recommendations.push({
      agent_type: 'ClaudeResearcher',
      estimated_tokens: 50_000,
      priority: 'medium',
      suggested_service: 'perplexity',
      reason: 'Web research with citations. Perplexity optimized for this.',
    });
  }

  if (gemini && gemini.autonomous_tokens_available > 100_000) {
    recommendations.push({
      agent_type: 'GeminiResearcher',
      estimated_tokens: 100_000,
      priority: 'medium',
      suggested_service: 'gemini',
      reason: 'Multi-query parallel research. Gemini is cost-effective.',
    });
  }

  if (grok && grok.autonomous_tokens_available > 50_000) {
    recommendations.push({
      agent_type: 'GrokResearcher',
      estimated_tokens: 50_000,
      priority: 'low',
      suggested_service: 'grok',
      reason: 'Contrarian analysis, real-time social data.',
    });
  }

  // Heavy Analysis - needs O3/strong reasoning
  if (chatgpt && chatgpt.autonomous_tokens_available > 200_000) {
    recommendations.push({
      agent_type: 'CodexResearcher (O3)',
      estimated_tokens: 150_000,
      priority: 'medium',
      suggested_service: 'chatgpt',
      reason: 'Deep technical research with O3 reasoning.',
    });
  }

  // Tidepool Seeds - varies by type
  if (claude && claude.autonomous_tokens_available > 50_000) {
    recommendations.push({
      agent_type: 'Tidepool Processing',
      estimated_tokens: 30_000,
      priority: 'high',
      suggested_service: 'claude',
      reason: 'Process queued research seeds overnight.',
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Output
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const recommendOnly = args.includes('--recommend');

  // Load config
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const configRaw = readFileSync(CONFIG_PATH, 'utf-8');
  const config: BudgetConfig = yaml.parse(configRaw);
  if (!config.services) config.services = {};

  // Calculate budgets for each service
  const budgets: AutonomousBudget[] = [];
  for (const [serviceKey, serviceConfig] of Object.entries(config.services)) {
    if (serviceConfig.type === 'cancelled') continue;
    budgets.push(calculateAutonomousBudget(serviceKey, serviceConfig));
  }

  // Generate recommendations
  const recommendations = generateAgentRecommendations(budgets);

  // Calculate totals
  const totalAutonomousTokens = budgets.reduce((sum, b) => sum + b.autonomous_tokens_available, 0);
  const totalAutonomousCost = budgets.reduce((sum, b) => sum + b.autonomous_cost_equivalent, 0);

  if (jsonMode) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      budgets,
      recommendations,
      totals: {
        autonomous_tokens: totalAutonomousTokens,
        autonomous_cost_equivalent: totalAutonomousCost,
      },
    }, null, 2));
    return;
  }

  // Human-readable output
  const now = new Date();
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  AUTONOMOUS BUDGET CALCULATOR                                                 ║
║  ${now.toISOString().slice(0, 10)} | Day ${now.getDate()} of ${getDaysInMonth()} | ${getDaysRemaining()} days until reset              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  if (!recommendOnly) {
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ SERVICE HEADROOM                                                            │');
    console.log('├──────────────┬─────────┬─────────┬───────────┬─────────────────────────────┤');
    console.log('│ Service      │ Ideal % │ Est. %  │ Headroom  │ Autonomous Tokens           │');
    console.log('├──────────────┼─────────┼─────────┼───────────┼─────────────────────────────┤');

    for (const budget of budgets) {
      const headroomStr = budget.headroom_percent >= 0
        ? `+${budget.headroom_percent.toFixed(1)}%`
        : `${budget.headroom_percent.toFixed(1)}%`;
      const tokensStr = budget.autonomous_tokens_available > 1_000_000
        ? `${(budget.autonomous_tokens_available / 1_000_000).toFixed(1)}M`
        : `${(budget.autonomous_tokens_available / 1000).toFixed(0)}K`;

      console.log(`│ ${budget.service.padEnd(12)} │ ${budget.ideal_usage_percent.toFixed(1).padStart(6)}% │ ${budget.estimated_usage_percent.toFixed(1).padStart(6)}% │ ${headroomStr.padStart(9)} │ ${tokensStr.padStart(8)} (~$${budget.autonomous_cost_equivalent.toFixed(2).padStart(6)}) │`);
    }

    console.log('└──────────────┴─────────┴─────────┴───────────┴─────────────────────────────┘');
    console.log('');
  }

  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ RECOMMENDED AUTONOMOUS TASKS                                                │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');

  if (recommendations.length === 0) {
    console.log('│ No autonomous tasks recommended - budgets depleted or near limit.          │');
  } else {
    for (const rec of recommendations) {
      const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`│ ${priorityEmoji} [${rec.priority.toUpperCase().padEnd(6)}] ${rec.agent_type.padEnd(25)} │`);
      console.log(`│    Service: ${rec.suggested_service.padEnd(12)} Tokens: ~${(rec.estimated_tokens/1000).toFixed(0)}K`.padEnd(76) + '│');
      console.log(`│    ${rec.reason.slice(0, 70).padEnd(72)} │`);
      console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    }
  }

  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`📊 TOTAL AUTONOMOUS CAPACITY: ${(totalAutonomousTokens / 1_000_000).toFixed(2)}M tokens (~$${totalAutonomousCost.toFixed(2)} equivalent)`);
  console.log('');
  console.log('💡 Tip: Run heavy agents now to maximize subscription value before reset.');
}

main().catch(console.error);

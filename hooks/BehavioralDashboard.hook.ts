#!/usr/bin/env bun
/**
 * BehavioralDashboard.hook.ts - Inject Behavioral Metrics at Session Start
 *
 * PURPOSE:
 * SessionStart hook that reads formation catches, ISC eval history, and rating data.
 * Computes rolling metrics. Injects a compact behavioral summary into session context
 * as stdout (system-reminder injection).
 *
 * TRIGGER: SessionStart (after LoadContext)
 *
 * INPUT:
 * - stdin: Hook input JSON (session_id)
 * - Files: MEMORY/STATE/FORMATION/catch-log.jsonl
 * - Files: MEMORY/EVALUATIONS/{YYYY-MM}/eval-history.jsonl
 * - Files: MEMORY/LEARNING/SIGNALS/ratings.jsonl
 *
 * OUTPUT:
 * - stdout: Compact behavioral dashboard (15-20 lines max, system-reminder injection)
 * - exit(0): Always (non-blocking)
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: ISCEvaluator (for eval history data)
 * - COORDINATES WITH: LoadContext (both run at SessionStart)
 * - MUST RUN AFTER: LoadContext (dashboard supplements context)
 *
 * PERFORMANCE:
 * - Non-blocking: Yes
 * - Typical execution: <100ms (file reads only, no inference)
 * - Target: <200ms
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { paiPath } from './lib/paths';
import { getPSTDate } from './lib/time';

const MEMORY_DIR = paiPath('MEMORY');
const FORMATION_DIR = join(MEMORY_DIR, 'STATE', 'FORMATION');
const CATCH_LOG = join(FORMATION_DIR, 'catch-log.jsonl');
const EVAL_DIR = join(MEMORY_DIR, 'EVALUATIONS');
const RATINGS_FILE = join(MEMORY_DIR, 'LEARNING', 'SIGNALS', 'ratings.jsonl');

interface CatchEntry {
  id: string;
  date: string;
  pattern_category: string;
  severity?: string;
  correction_source?: string;
  type?: string;
}

interface EvalEntry {
  date: string;
  session_id: string;
  work_id: string;
  criteria_total: number;
  satisfied: number;
  partial: number;
  failed: number;
  needs_human: number;
  duration_ms: number;
}

interface RatingEntry {
  timestamp: string;
  rating?: number;
  source?: string;
}

/**
 * Read JSONL file and parse entries, filtering by date range
 */
function readJsonl<T>(filePath: string, daysBack: number = 30): T[] {
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const entries: T[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as T;
        // Check date field (different files use different date fields)
        const dateStr = (entry as any).date || (entry as any).timestamp?.slice(0, 10) || '';
        if (dateStr >= cutoffStr) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Read eval history across monthly directories
 */
function readEvalHistory(daysBack: number): EvalEntry[] {
  if (!existsSync(EVAL_DIR)) return [];

  const entries: EvalEntry[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    const monthDirs = readdirSync(EVAL_DIR).sort().reverse();
    for (const monthDir of monthDirs.slice(0, 3)) { // Last 3 months max
      const evalFile = join(EVAL_DIR, monthDir, 'eval-history.jsonl');
      if (!existsSync(evalFile)) continue;

      const content = readFileSync(evalFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as EvalEntry;
          if (entry.date >= cutoffStr) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed
        }
      }
    }
  } catch {
    // Directory read error
  }

  return entries;
}

/**
 * Compute ISC pass rate from eval entries
 */
function computePassRate(evals: EvalEntry[]): { rate: number; total: number } {
  if (evals.length === 0) return { rate: 0, total: 0 };

  let totalCriteria = 0;
  let totalSatisfied = 0;

  for (const e of evals) {
    totalCriteria += e.criteria_total;
    totalSatisfied += e.satisfied;
  }

  return {
    rate: totalCriteria > 0 ? Math.round((totalSatisfied / totalCriteria) * 100) : 0,
    total: evals.length,
  };
}

/**
 * Compute formation catch metrics
 */
function computeCatchMetrics(catches: CatchEntry[]): {
  thisWeek: number;
  total: number;
  byPattern: Record<string, number>;
  topRecurring: string | null;
  topRecurringCount: number;
  selfCatches: number;
} {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const thisWeek = catches.filter(c => c.date >= weekAgoStr).length;

  // Count by pattern
  const byPattern: Record<string, number> = {};
  let selfCatches = 0;
  for (const c of catches) {
    const cat = c.pattern_category || 'unknown';
    byPattern[cat] = (byPattern[cat] || 0) + 1;
    if (c.correction_source?.includes('self')) selfCatches++;
  }

  // Find most recurring negative pattern
  let topRecurring: string | null = null;
  let topRecurringCount = 0;
  for (const [pattern, count] of Object.entries(byPattern)) {
    // Skip positive patterns
    if (pattern.includes('genuine') || pattern.includes('positive')) continue;
    if (count > topRecurringCount) {
      topRecurring = pattern;
      topRecurringCount = count;
    }
  }

  return { thisWeek, total: catches.length, byPattern, topRecurring, topRecurringCount, selfCatches };
}

/**
 * Compute rating metrics
 */
function computeRatingMetrics(ratings: RatingEntry[]): {
  avg: number;
  count: number;
  trend: string;
} {
  // Filter to entries that have a rating
  const withRating = ratings.filter(r => typeof r.rating === 'number' && r.rating > 0);
  if (withRating.length === 0) return { avg: 0, count: 0, trend: 'no data' };

  // Last 10 ratings
  const recent = withRating.slice(-10);
  const avg = recent.reduce((sum, r) => sum + (r.rating || 0), 0) / recent.length;

  // Trend: compare first half to second half
  if (recent.length < 4) return { avg: Math.round(avg * 10) / 10, count: recent.length, trend: 'insufficient data' };

  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);
  const firstAvg = firstHalf.reduce((sum, r) => sum + (r.rating || 0), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, r) => sum + (r.rating || 0), 0) / secondHalf.length;

  let trend: string;
  if (secondAvg - firstAvg > 0.5) trend = 'improving';
  else if (firstAvg - secondAvg > 0.5) trend = 'declining';
  else trend = 'stable';

  return { avg: Math.round(avg * 10) / 10, count: recent.length, trend };
}

async function main() {
  try {
    // Read input (required for hook pattern)
    const input = await Bun.stdin.text();
    if (!input || input.trim() === '') {
      process.exit(0);
    }

    // Gather data
    const catches = readJsonl<CatchEntry>(CATCH_LOG, 30);
    const evals7d = readEvalHistory(7);
    const evals30d = readEvalHistory(30);
    const ratings = readJsonl<RatingEntry>(RATINGS_FILE, 30);

    // Compute metrics
    const passRate7d = computePassRate(evals7d);
    const passRate30d = computePassRate(evals30d);
    const catchMetrics = computeCatchMetrics(catches);
    const ratingMetrics = computeRatingMetrics(ratings);

    // Count needs-human backlog (last 7 days)
    const needsHumanBacklog = evals7d.reduce((sum, e) => sum + e.needs_human, 0);

    // Format dashboard — only output if there's meaningful data
    const hasData = catches.length > 0 || evals7d.length > 0 || ratings.length > 0;

    if (!hasData) {
      // No data yet — skip dashboard injection
      process.exit(0);
    }

    // Build compact dashboard lines
    const lines: string[] = [];
    lines.push('BEHAVIORAL DASHBOARD');

    // ISC pass rate
    if (evals7d.length > 0 || evals30d.length > 0) {
      const parts: string[] = [];
      if (evals7d.length > 0) parts.push(`${passRate7d.rate}% (7d, ${passRate7d.total} evals)`);
      if (evals30d.length > 0) parts.push(`${passRate30d.rate}% (30d, ${passRate30d.total} evals)`);
      lines.push(`ISC Pass Rate: ${parts.join(' | ')}`);
    }

    // Formation catches
    if (catches.length > 0) {
      // Build category summary for this week's catches
      const weekCatches = catches.filter(c => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return c.date >= weekAgo.toISOString().slice(0, 10);
      });

      const weekPatterns: Record<string, number> = {};
      for (const c of weekCatches) {
        const cat = c.pattern_category || 'unknown';
        weekPatterns[cat] = (weekPatterns[cat] || 0) + 1;
      }
      const patternSummary = Object.entries(weekPatterns)
        .map(([p, c]) => `${p}: ${c}`)
        .join(', ');

      lines.push(`Formation Catches: ${catchMetrics.thisWeek} this week${patternSummary ? ` (${patternSummary})` : ''} | ${catchMetrics.total} total`);

      // Recurrence alert
      if (catchMetrics.topRecurring && catchMetrics.topRecurringCount >= 2) {
        lines.push(`Recurrence Alert: ${catchMetrics.topRecurring} appeared ${catchMetrics.topRecurringCount}/${catchMetrics.total} total catches`);
      }

      // Self-correction delta
      if (catchMetrics.selfCatches > 0) {
        lines.push(`Self-Catches: ${catchMetrics.selfCatches}/${catchMetrics.total} (${Math.round(catchMetrics.selfCatches / catchMetrics.total * 100)}% self-identified)`);
      } else {
        lines.push(`Self-Correction Delta: 0 (no self-catches before external yet)`);
      }
    }

    // Ratings
    if (ratingMetrics.count > 0) {
      lines.push(`Rating Avg: ${ratingMetrics.avg} (last ${ratingMetrics.count}) | Trend: ${ratingMetrics.trend}`);
    }

    // Needs-human backlog
    if (needsHumanBacklog > 0) {
      lines.push(`Needs-Human Backlog: ${needsHumanBacklog} criteria from last 7 days`);
    }

    // Output to stdout for system-reminder injection
    const separator = '═'.repeat(40);
    console.log(`${separator}\n${lines.join('\n')}\n${separator}`);

    process.exit(0);
  } catch (error) {
    console.error(`[BehavioralDashboard] Error: ${error}`);
    process.exit(0);
  }
}

main();

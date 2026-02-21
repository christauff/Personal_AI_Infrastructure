#!/usr/bin/env bun
/**
 * ISCEvaluator.hook.ts - Automated ISC Scoring on Task Completion
 *
 * PURPOSE:
 * Fires on Stop event. Reads ISC.json from the current work directory.
 * Scores task output against each criterion. Logs results to persistent
 * evaluation history. Sends events to observability dashboard.
 *
 * TRIGGER: Stop (fires when the main agent stops after a turn)
 *
 * INPUT:
 * - stdin: Hook input JSON (session_id, transcript_path)
 * - Files: MEMORY/STATE/current-work.json, {work_path}/ISC.json
 *
 * OUTPUT:
 * - stdout: None (no context injection)
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Appends to: MEMORY/EVALUATIONS/{YYYY-MM}/eval-history.jsonl
 * - Sends: Observability event to dashboard server
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: AutoWorkCreation (expects WORK/ structure with ISC.json)
 * - COORDINATES WITH: StopOrchestrator (both run at Stop)
 * - COORDINATES WITH: BehavioralDashboard (reads eval-history.jsonl)
 *
 * SCORING APPROACH:
 * - Binary criteria → deterministic (regex, file-exists, test-pass)
 * - Semantic criteria → heuristic keyword matching (fast, no inference cost)
 * - Unverifiable criteria → marked "needs-human" (Goodhart mitigation)
 *
 * ERROR HANDLING:
 * - No active work: Silent exit
 * - No ISC.json: Silent exit (not all tasks have ISC)
 * - Scoring errors: Logged to stderr, silent exit
 *
 * PERFORMANCE:
 * - Non-blocking: Yes (fire-and-forget)
 * - Typical execution: <200ms (no inference calls)
 * - Target: <500ms even with large transcripts
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { paiPath } from './lib/paths';
import { getPSTDate, getISOTimestamp, getYearMonth } from './lib/time';
import { sendEventToObservability, getCurrentTimestamp, getSourceApp } from './lib/observability';
import { scoreAllCriteria, aggregateScores, type ISCEvaluation } from './lib/isc-scoring';

const MEMORY_DIR = paiPath('MEMORY');
const STATE_DIR = join(MEMORY_DIR, 'STATE');
const CURRENT_WORK_FILE = join(STATE_DIR, 'current-work.json');
const WORK_DIR = join(MEMORY_DIR, 'WORK');
const EVAL_DIR = join(MEMORY_DIR, 'EVALUATIONS');

interface CurrentWork {
  session_id: string;
  work_dir?: string;
  session_dir?: string;  // AutoWorkCreation uses session_dir instead of work_dir
  created_at: string;
  item_count?: number;
  task_count?: number;
}

interface ISCData {
  current?: {
    criteria?: string[];
    antiCriteria?: string[];
  };
  satisfaction?: {
    satisfied: number;
    partial: number;
    failed: number;
    total: number;
  };
}

/**
 * Extract recent transcript text for scoring context
 * Reads last ~2000 lines of transcript, extracts assistant messages
 */
function extractTranscriptContext(transcriptPath: string): string {
  if (!existsSync(transcriptPath)) return '';

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Take last 500 lines to keep processing fast
    const recentLines = lines.slice(-500);
    const textParts: string[] = [];

    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.content) {
          for (const content of entry.message.content) {
            if (content.type === 'text' && content.text) {
              textParts.push(content.text);
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Cap at ~50k chars to keep scoring fast
    const fullText = textParts.join('\n');
    return fullText.length > 50000 ? fullText.slice(-50000) : fullText;
  } catch {
    return '';
  }
}

async function main() {
  const startTime = Date.now();

  try {
    // Read input from stdin
    const input = await Bun.stdin.text();
    if (!input || input.trim() === '') {
      process.exit(0);
    }

    let parsed: { session_id?: string; transcript_path?: string };
    try {
      parsed = JSON.parse(input);
    } catch {
      process.exit(0);
    }

    const sessionId = parsed.session_id || 'unknown';
    const transcriptPath = parsed.transcript_path || '';

    // Check if there's an active work session with ISC
    if (!existsSync(CURRENT_WORK_FILE)) {
      process.exit(0);
    }

    let currentWork: CurrentWork;
    try {
      currentWork = JSON.parse(readFileSync(CURRENT_WORK_FILE, 'utf-8'));
    } catch {
      process.exit(0);
    }

    // Support both work_dir (legacy) and session_dir (AutoWorkCreation v2)
    const workDirName = currentWork.work_dir || currentWork.session_dir;
    if (!workDirName) {
      process.exit(0);
    }

    // Load ISC.json
    const workPath = join(WORK_DIR, workDirName);
    const iscPath = join(workPath, 'ISC.json');

    if (!existsSync(iscPath)) {
      // No ISC criteria — nothing to evaluate. Silent exit.
      process.exit(0);
    }

    let iscData: ISCData;
    try {
      iscData = JSON.parse(readFileSync(iscPath, 'utf-8'));
    } catch {
      console.error('[ISCEvaluator] Failed to parse ISC.json');
      process.exit(0);
    }

    const criteria = iscData.current?.criteria || [];
    const antiCriteria = iscData.current?.antiCriteria || [];

    if (criteria.length === 0 && antiCriteria.length === 0) {
      process.exit(0);
    }

    // Extract transcript context for scoring
    const transcript = extractTranscriptContext(transcriptPath);

    if (!transcript) {
      console.error('[ISCEvaluator] No transcript content available for scoring');
      process.exit(0);
    }

    // Score all criteria
    const scores = scoreAllCriteria(criteria, antiCriteria, transcript);
    const summary = aggregateScores(scores);
    const durationMs = Date.now() - startTime;

    // Build evaluation record
    const evaluation: ISCEvaluation = {
      date: getPSTDate(),
      session_id: sessionId,
      work_id: workDirName,
      criteria_total: summary.total,
      satisfied: summary.satisfied,
      partial: summary.partial,
      failed: summary.failed,
      needs_human: summary.needs_human,
      scores,
      duration_ms: durationMs,
    };

    // Write to eval history
    const yearMonth = getYearMonth();
    const evalMonthDir = join(EVAL_DIR, yearMonth);
    if (!existsSync(evalMonthDir)) {
      mkdirSync(evalMonthDir, { recursive: true });
    }

    const evalFile = join(evalMonthDir, 'eval-history.jsonl');
    appendFileSync(evalFile, JSON.stringify(evaluation) + '\n');

    console.error(`[ISCEvaluator] Scored ${summary.total} criteria: ${summary.satisfied} satisfied, ${summary.partial} partial, ${summary.failed} failed, ${summary.needs_human} needs-human (${durationMs}ms)`);

    // Send to observability dashboard
    try {
      await sendEventToObservability({
        source_app: getSourceApp(),
        session_id: sessionId,
        hook_event_type: 'Stop',
        timestamp: getCurrentTimestamp(),
        summary: `ISC Eval: ${summary.satisfied}/${summary.total} satisfied`,
        isc_evaluation: {
          work_id: workDirName,
          ...summary,
          duration_ms: durationMs,
        },
      });
    } catch {
      // Dashboard may not be running — silently ignore
    }

    process.exit(0);
  } catch (error) {
    console.error(`[ISCEvaluator] Error: ${error}`);
    process.exit(0);
  }
}

main();

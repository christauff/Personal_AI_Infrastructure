/**
 * ISC Scoring Library
 * Shared logic for evaluating Ideal State Criteria against task output.
 *
 * Scoring methods:
 * - DETERMINISTIC: regex match, file existence, test pass/fail
 * - SEMANTIC: inference() fast tier for natural language criteria
 * - UNVERIFIABLE: flagged "needs-human" (Goodhart mitigation)
 *
 * Used by: ISCEvaluator.hook.ts, BehavioralDashboard.hook.ts
 */

import { existsSync } from 'fs';

export type ScoreResult = 'satisfied' | 'partial' | 'failed' | 'needs_human';
export type ScoreMethod = 'deterministic' | 'semantic' | 'unverifiable';

export interface CriterionScore {
  criterion: string;
  result: ScoreResult;
  method: ScoreMethod;
  evidence?: string;
}

export interface ISCEvaluation {
  date: string;
  session_id: string;
  work_id: string;
  criteria_total: number;
  satisfied: number;
  partial: number;
  failed: number;
  needs_human: number;
  scores: CriterionScore[];
  duration_ms: number;
}

/**
 * Patterns that indicate a criterion is deterministically verifiable
 */
const DETERMINISTIC_PATTERNS: Array<{ pattern: RegExp; checker: (criterion: string, transcript: string) => ScoreResult }> = [
  // File existence checks: "X file exists", "X is created"
  {
    pattern: /(?:file|directory)\s+(?:exists|created|present)/i,
    checker: (_criterion, transcript) => {
      // Check if transcript mentions file creation success
      if (/(?:created|wrote|written|exists)/i.test(transcript)) return 'satisfied';
      if (/(?:error|failed|not found)/i.test(transcript)) return 'failed';
      return 'partial';
    }
  },
  // Test pass/fail: "tests pass", "all tests green"
  {
    pattern: /(?:tests?\s+pass|all\s+tests?\s+(?:green|succeed|passing))/i,
    checker: (_criterion, transcript) => {
      if (/(?:tests?\s+passed|all\s+\d+\s+passed|\d+\s+passing)/i.test(transcript)) return 'satisfied';
      if (/(?:tests?\s+failed|\d+\s+failing|FAIL)/i.test(transcript)) return 'failed';
      return 'partial';
    }
  },
  // Return code checks: "returns 200", "exits with 0"
  {
    pattern: /(?:returns?\s+\d+|status\s+(?:code\s+)?\d+|exit(?:s|ed)?\s+(?:with\s+)?0)/i,
    checker: (criterion, transcript) => {
      const codeMatch = criterion.match(/(?:returns?\s+|status\s+(?:code\s+)?)(\d+)/i);
      if (codeMatch) {
        const expectedCode = codeMatch[1];
        if (new RegExp(`(?:status|code|returned?)\\s*:?\\s*${expectedCode}`, 'i').test(transcript)) return 'satisfied';
        if (/(?:error|fail|timeout)/i.test(transcript)) return 'failed';
      }
      return 'partial';
    }
  },
  // Binary presence checks: "X contains Y", "X includes Y"
  {
    pattern: /(?:contains?|includes?|has)\s+/i,
    checker: (criterion, transcript) => {
      // Extract what should be contained
      const match = criterion.match(/(?:contains?|includes?|has)\s+["']?(.+?)["']?\s*$/i);
      if (match) {
        const target = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(target, 'i').test(transcript)) return 'satisfied';
      }
      return 'partial';
    }
  }
];

/**
 * Patterns that indicate a criterion is subjective/unverifiable
 */
const UNVERIFIABLE_PATTERNS = [
  /(?:feels?\s+(?:good|right|clean|responsive|natural|intuitive))/i,
  /(?:looks?\s+(?:good|right|clean|professional|polished))/i,
  /(?:user\s+(?:experience|satisfaction|delight))/i,
  /(?:elegant|beautiful|seamless|smooth|pleasant)/i,
  /(?:easy\s+to\s+(?:use|understand|read|maintain))/i,
  /(?:well[- ](?:designed|organized|structured))/i,
];

/**
 * Classify a criterion's verification method
 */
export function classifyCriterion(criterion: string): ScoreMethod {
  // Check unverifiable first (subjective criteria)
  for (const pattern of UNVERIFIABLE_PATTERNS) {
    if (pattern.test(criterion)) return 'unverifiable';
  }

  // Check deterministic patterns
  for (const { pattern } of DETERMINISTIC_PATTERNS) {
    if (pattern.test(criterion)) return 'deterministic';
  }

  // Default to semantic (needs inference to evaluate)
  return 'semantic';
}

/**
 * Score a single criterion deterministically
 */
export function scoreDeterministic(criterion: string, transcript: string): CriterionScore {
  if (!criterion || !transcript) {
    return { criterion: criterion || '', result: 'needs_human', method: 'deterministic', evidence: 'Missing input' };
  }
  for (const { pattern, checker } of DETERMINISTIC_PATTERNS) {
    if (pattern.test(criterion)) {
      const result = checker(criterion, transcript);
      return {
        criterion,
        result,
        method: 'deterministic',
        evidence: result === 'satisfied' ? 'Pattern matched in transcript' : 'Pattern not confirmed in transcript'
      };
    }
  }

  // Shouldn't reach here if classifyCriterion returned 'deterministic'
  return { criterion, result: 'partial', method: 'deterministic', evidence: 'No matching checker found' };
}

/**
 * Score a criterion as unverifiable (needs human judgment)
 */
export function scoreUnverifiable(criterion: string): CriterionScore {
  return {
    criterion,
    result: 'needs_human',
    method: 'unverifiable',
    evidence: 'Subjective criterion requires human evaluation'
  };
}

/**
 * Score a criterion semantically using transcript context
 * This is a heuristic fallback — checks for positive/negative signals in transcript
 * For true semantic scoring, use inference() externally
 */
export function scoreSemanticHeuristic(criterion: string, transcript: string): CriterionScore {
  if (!criterion || !transcript) {
    return { criterion: criterion || '', result: 'needs_human', method: 'semantic', evidence: 'Missing input' };
  }
  // Extract key terms from the criterion
  const keyTerms = criterion
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been', 'does', 'will', 'should', 'must', 'each', 'every'].includes(w));

  if (keyTerms.length === 0) {
    return { criterion, result: 'needs_human', method: 'semantic', evidence: 'Could not extract key terms' };
  }

  // Count how many key terms appear in the transcript
  const transcriptLower = transcript.toLowerCase();
  const matchCount = keyTerms.filter(term => transcriptLower.includes(term)).length;
  const matchRatio = matchCount / keyTerms.length;

  // Check for explicit failure indicators near key terms
  const hasFailureNearTerms = keyTerms.some(term => {
    const idx = transcriptLower.indexOf(term);
    if (idx === -1) return false;
    const context = transcriptLower.substring(Math.max(0, idx - 50), Math.min(transcriptLower.length, idx + 50));
    return /(?:error|fail|broken|missing|not found|undefined|null)/i.test(context);
  });

  if (hasFailureNearTerms) {
    return { criterion, result: 'failed', method: 'semantic', evidence: `Failure indicators found near criterion terms (${matchCount}/${keyTerms.length} terms present)` };
  }

  if (matchRatio >= 0.6) {
    return { criterion, result: 'satisfied', method: 'semantic', evidence: `${matchCount}/${keyTerms.length} key terms found in transcript` };
  }

  if (matchRatio >= 0.3) {
    return { criterion, result: 'partial', method: 'semantic', evidence: `${matchCount}/${keyTerms.length} key terms found in transcript` };
  }

  return { criterion, result: 'needs_human', method: 'semantic', evidence: `Only ${matchCount}/${keyTerms.length} key terms found — insufficient signal` };
}

/**
 * Score all criteria from an ISC object against a transcript
 */
export function scoreAllCriteria(
  criteria: string[],
  antiCriteria: string[],
  transcript: string
): CriterionScore[] {
  const scores: CriterionScore[] = [];

  // Score positive criteria
  for (const criterion of criteria) {
    const method = classifyCriterion(criterion);
    switch (method) {
      case 'deterministic':
        scores.push(scoreDeterministic(criterion, transcript));
        break;
      case 'unverifiable':
        scores.push(scoreUnverifiable(criterion));
        break;
      case 'semantic':
        scores.push(scoreSemanticHeuristic(criterion, transcript));
        break;
    }
  }

  // Score anti-criteria (inverted: presence = failure)
  for (const antiCriterion of antiCriteria) {
    const method = classifyCriterion(antiCriterion);
    let score: CriterionScore;

    switch (method) {
      case 'deterministic':
        score = scoreDeterministic(antiCriterion, transcript);
        // Invert: if anti-criterion is "satisfied" (found), that's a failure
        // "partial" (not confirmed) on anti-criterion = good (satisfied)
        score.result = score.result === 'satisfied' ? 'failed'
          : score.result === 'failed' ? 'satisfied'
          : score.result === 'partial' ? 'satisfied'
          : score.result;
        score.criterion = `[ANTI] ${antiCriterion}`;
        break;
      case 'unverifiable':
        score = scoreUnverifiable(antiCriterion);
        score.criterion = `[ANTI] ${antiCriterion}`;
        break;
      default:
        score = scoreSemanticHeuristic(antiCriterion, transcript);
        // Invert semantic scores too
        // "partial" (not confirmed) on anti-criterion = good (satisfied)
        if (score.result === 'satisfied') score.result = 'failed';
        else if (score.result === 'failed') score.result = 'satisfied';
        else if (score.result === 'partial') score.result = 'satisfied';
        score.criterion = `[ANTI] ${antiCriterion}`;
        break;
    }

    scores.push(score);
  }

  return scores;
}

/**
 * Aggregate scores into a summary
 */
export function aggregateScores(scores: CriterionScore[]): {
  satisfied: number;
  partial: number;
  failed: number;
  needs_human: number;
  total: number;
} {
  return {
    satisfied: scores.filter(s => s.result === 'satisfied').length,
    partial: scores.filter(s => s.result === 'partial').length,
    failed: scores.filter(s => s.result === 'failed').length,
    needs_human: scores.filter(s => s.result === 'needs_human').length,
    total: scores.length,
  };
}

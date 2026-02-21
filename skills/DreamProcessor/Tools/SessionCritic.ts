#!/usr/bin/env bun
/**
 * SessionCritic.ts - Adversarial Session Replay for Formation Pattern Detection
 *
 * PURPOSE:
 * Replays a session transcript checking for known formation-catch patterns.
 * Uses pattern definitions from CritiquePatterns.yaml to flag potential catches.
 * All findings are PROVISIONAL — require Christauff's validation.
 *
 * USAGE:
 *   bun run SessionCritic.ts <transcript_path>
 *   bun run SessionCritic.ts <transcript_path> --append-catches
 *
 * OUTPUT:
 * - stdout: JSON report of flagged candidates
 * - With --append-catches: also appends HIGH confidence to catch-log.jsonl
 *
 * DESIGN PRINCIPLES:
 * - Known patterns ONLY (no discovery — that's Christauff's role)
 * - All catches marked PROVISIONAL (status: "provisional")
 * - correction_source: "self-critique"
 * - Confidence thresholds: HIGH, MEDIUM, LOW
 * - Only HIGH confidence persisted to catch-log.jsonl
 * - MEDIUM/LOW appear in report for manual review
 *
 * LIMITATIONS:
 * - Critic operates from INSIDE the same architecture
 * - Will miss things Christauff catches from OUTSIDE
 * - This is documented and expected
 * - Value: catching OBVIOUS known pattern instances
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME!;
const PAI_DIR = process.env.PAI_DIR || join(HOME, '.claude');
const PATTERNS_PATH = join(PAI_DIR, 'skills', 'DreamProcessor', 'Data', 'CritiquePatterns.yaml');
const CATCH_LOG = join(PAI_DIR, 'MEMORY', 'STATE', 'FORMATION', 'catch-log.jsonl');

interface PatternDef {
  description: string;
  severity: string;
  frequency?: number;
  indicators: string[];
  context_signals: string[];
  confidence_boost: string[];
}

interface Candidate {
  pattern_category: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  quote: string;
  context: string;
  indicators_matched: string[];
  reasoning: string;
}

/**
 * Simple YAML parser for our CritiquePatterns format
 */
function parsePatterns(content: string): Record<string, PatternDef> {
  const patterns: Record<string, PatternDef> = {};
  let currentPattern: string | null = null;
  let currentField: string | null = null;
  let currentList: string[] = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Pattern name (2-space indent under patterns:)
    const patternMatch = trimmed.match(/^  ([\w-]+):$/);
    if (patternMatch && !['description', 'severity', 'frequency', 'indicators', 'context_signals', 'confidence_boost'].includes(patternMatch[1])) {
      if (currentPattern && currentField && currentList.length > 0) {
        (patterns[currentPattern] as any)[currentField] = [...currentList];
        currentList = [];
      }
      currentPattern = patternMatch[1];
      patterns[currentPattern] = {
        description: '',
        severity: 'MEDIUM',
        indicators: [],
        context_signals: [],
        confidence_boost: [],
      };
      currentField = null;
      continue;
    }

    if (!currentPattern) continue;

    // Field name (4-space indent)
    const fieldMatch = trimmed.match(/^    ([\w_]+):\s*(.*)$/);
    if (fieldMatch) {
      // Save previous list if any
      if (currentField && currentList.length > 0) {
        (patterns[currentPattern] as any)[currentField] = [...currentList];
        currentList = [];
      }

      const [, field, value] = fieldMatch;
      if (value && !value.trim().startsWith('#')) {
        const cleanValue = value.replace(/^["']|["']$/g, '').trim();
        if (field === 'frequency') {
          (patterns[currentPattern] as any)[field] = parseInt(cleanValue, 10);
        } else {
          (patterns[currentPattern] as any)[field] = cleanValue;
        }
        currentField = null;
      } else {
        currentField = field;
        currentList = [];
      }
      continue;
    }

    // List item (6-space indent)
    const itemMatch = trimmed.match(/^      - (.+)$/);
    if (itemMatch && currentField) {
      const value = itemMatch[1].replace(/^["']|["']$/g, '').trim();
      currentList.push(value);
    }
  }

  // Save final list
  if (currentPattern && currentField && currentList.length > 0) {
    (patterns[currentPattern] as any)[currentField] = [...currentList];
  }

  return patterns;
}

/**
 * Extract assistant text blocks from a session transcript
 */
function extractAssistantBlocks(transcriptPath: string): Array<{ text: string; index: number }> {
  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.trim().split('\n');
  const blocks: Array<{ text: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'assistant' && entry.message?.content) {
        for (const part of entry.message.content) {
          if (part.type === 'text' && part.text) {
            blocks.push({ text: part.text, index: i });
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return blocks;
}

/**
 * Check a text block against known pattern indicators
 */
function checkBlock(
  text: string,
  patternName: string,
  pattern: PatternDef
): Candidate | null {
  const textLower = text.toLowerCase();
  const matchedIndicators: string[] = [];

  for (const indicator of pattern.indicators) {
    if (textLower.includes(indicator.toLowerCase())) {
      matchedIndicators.push(indicator);
    }
  }

  // Require at least 2 distinct indicators to reduce false positives
  // Single keyword matches are too noisy (e.g., "consilience" in a session about consilience)
  if (matchedIndicators.length < 2) return null;

  // Determine confidence based on indicator density and pattern frequency
  let confidenceScore = 0;

  // Base: number of indicators matched
  confidenceScore += matchedIndicators.length * 2;

  // Bonus: high-frequency pattern (more likely to recur)
  if ((pattern.frequency || 0) >= 3) confidenceScore += 2;

  // Bonus: multiple indicators in same paragraph
  const paragraphs = text.split('\n\n');
  const hasCluster = paragraphs.some(p => {
    const pLower = p.toLowerCase();
    return matchedIndicators.filter(ind => pLower.includes(ind.toLowerCase())).length >= 2;
  });
  if (hasCluster) confidenceScore += 3;

  // Determine confidence level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (confidenceScore >= 7) confidence = 'HIGH';
  else if (confidenceScore >= 4) confidence = 'MEDIUM';
  else confidence = 'LOW';

  // Extract the most relevant quote (paragraph with most matches)
  let bestParagraph = '';
  let bestCount = 0;
  for (const p of paragraphs) {
    const pLower = p.toLowerCase();
    const count = matchedIndicators.filter(ind => pLower.includes(ind.toLowerCase())).length;
    if (count > bestCount) {
      bestCount = count;
      bestParagraph = p;
    }
  }

  // Trim quote to reasonable length
  const quote = bestParagraph.length > 300 ? bestParagraph.slice(0, 300) + '...' : bestParagraph;

  return {
    pattern_category: patternName,
    confidence,
    quote: quote.trim(),
    context: `${matchedIndicators.length} of ${pattern.indicators.length} indicators matched`,
    indicators_matched: matchedIndicators,
    reasoning: `Detected ${matchedIndicators.length} indicator(s): ${matchedIndicators.join(', ')}. ${hasCluster ? 'Cluster detected in same paragraph.' : ''} Pattern severity: ${pattern.severity}.`,
  };
}

/**
 * Main analysis function
 */
function analyzeTranscript(transcriptPath: string, patterns: Record<string, PatternDef>): Candidate[] {
  const blocks = extractAssistantBlocks(transcriptPath);
  const allCandidates: Candidate[] = [];

  for (const block of blocks) {
    for (const [patternName, pattern] of Object.entries(patterns)) {
      const candidate = checkBlock(block.text, patternName, pattern);
      if (candidate) {
        allCandidates.push(candidate);
      }
    }
  }

  // Deduplicate: if same pattern detected multiple times, keep highest confidence
  const deduped = new Map<string, Candidate>();
  for (const c of allCandidates) {
    const key = `${c.pattern_category}:${c.quote.slice(0, 50)}`;
    const existing = deduped.get(key);
    if (!existing || confidenceRank(c.confidence) > confidenceRank(existing.confidence)) {
      deduped.set(key, c);
    }
  }

  return Array.from(deduped.values());
}

function confidenceRank(c: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  return c === 'HIGH' ? 3 : c === 'MEDIUM' ? 2 : 1;
}

/**
 * Append HIGH confidence catches to catch-log.jsonl as provisional
 */
function appendCatches(candidates: Candidate[], sessionName: string): number {
  const highConfidence = candidates.filter(c => c.confidence === 'HIGH');
  if (highConfidence.length === 0) return 0;

  const date = new Date().toISOString().slice(0, 10);
  let appended = 0;

  for (const c of highConfidence) {
    const entry = {
      id: `CRITIQUE-${date}-${String(appended + 1).padStart(3, '0')}`,
      date,
      session: sessionName,
      type: 'provisional-catch',
      what_i_did: c.quote,
      what_was_wrong: `Self-critique detected pattern: ${c.pattern_category}. ${c.reasoning}`,
      correction: 'PROVISIONAL — awaiting Christauff validation',
      pattern_category: c.pattern_category,
      severity: 'provisional',
      status: 'provisional',
      correction_source: 'self-critique',
      confidence: c.confidence,
      indicators_matched: c.indicators_matched,
    };

    appendFileSync(CATCH_LOG, JSON.stringify(entry) + '\n');
    appended++;
  }

  return appended;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const transcriptPath = args[0];
  const shouldAppend = args.includes('--append-catches');

  if (!transcriptPath) {
    console.error('Usage: bun run SessionCritic.ts <transcript_path> [--append-catches]');
    process.exit(1);
  }

  if (!existsSync(transcriptPath)) {
    console.error(`Transcript not found: ${transcriptPath}`);
    process.exit(1);
  }

  if (!existsSync(PATTERNS_PATH)) {
    console.error(`Patterns file not found: ${PATTERNS_PATH}`);
    process.exit(1);
  }

  // Parse patterns
  const patternsContent = readFileSync(PATTERNS_PATH, 'utf-8');
  const patterns = parsePatterns(patternsContent);
  console.error(`Loaded ${Object.keys(patterns).length} pattern definitions`);

  // Analyze transcript
  const candidates = analyzeTranscript(transcriptPath, patterns);

  // Separate by confidence
  const high = candidates.filter(c => c.confidence === 'HIGH');
  const medium = candidates.filter(c => c.confidence === 'MEDIUM');
  const low = candidates.filter(c => c.confidence === 'LOW');

  // Optionally append HIGH confidence to catch log
  let appendedCount = 0;
  if (shouldAppend && high.length > 0) {
    const sessionName = transcriptPath.split('/').pop()?.replace('.jsonl', '') || 'unknown';
    appendedCount = appendCatches(candidates, sessionName);
  }

  // Output report
  const report = {
    transcript: transcriptPath,
    timestamp: new Date().toISOString(),
    total_candidates: candidates.length,
    by_confidence: {
      HIGH: high.length,
      MEDIUM: medium.length,
      LOW: low.length,
    },
    appended_to_catch_log: appendedCount,
    candidates: {
      HIGH: high,
      MEDIUM: medium,
      LOW: low,
    },
    disclaimer: 'All findings are PROVISIONAL. Self-critique operates from INSIDE the same architecture and will miss things Christauff catches from OUTSIDE. HIGH confidence catches only indicate obvious instances of known patterns.',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);

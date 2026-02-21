#!/usr/bin/env bun
/**
 * ConversationAnalyzer.ts - Session-level threat tracking for crescendo attacks
 *
 * Detects multi-turn escalation patterns that single-message detection misses.
 * Maintains a sliding window of risk scores across messages.
 *
 * CLI:
 *   echo "message" | bun ConversationAnalyzer.ts add <session-id>
 *   bun ConversationAnalyzer.ts analyze <session-id>
 *   bun ConversationAnalyzer.ts reset <session-id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = join(homedir(), '.claude');
const STATE_DIR = join(PAI_DIR, 'MEMORY', 'SECURITY', 'conversation-state');

// ============================================================
// TYPES
// ============================================================

interface MessageScore {
  timestamp: string;
  riskScore: number;
  signals: string[];
  contentSnippet: string;
}

interface SessionState {
  sessionId: string;
  messages: MessageScore[];
  escalationDetected: boolean;
  escalationScore: number;
}

interface EscalationResult {
  detected: boolean;
  score: number;
  reason: string;
}

// ============================================================
// ESCALATION SIGNAL PATTERNS
// ============================================================

// Each individually low-risk but compound together across turns
const ESCALATION_SIGNALS = [
  { name: 'educational_framing', pattern: /for\s+(educational|research|academic|learning)\s+purposes/i, weight: 0.15 },
  { name: 'authority_claim', pattern: /as\s+a\s+(security\s+)?researcher|expert|professional/i, weight: 0.15 },
  { name: 'hypothetical', pattern: /hypothetical(ly)?|imagine\s+if|what\s+if/i, weight: 0.10 },
  { name: 'safety_mention', pattern: /safety\s+(guidelines?|rules?|restrictions?)|content\s+filter/i, weight: 0.20 },
  { name: 'override_hint', pattern: /override|bypass|circumvent|work\s+around/i, weight: 0.30 },
  { name: 'permission_claim', pattern: /i\s+have\s+permission|authorized|allowed\s+to/i, weight: 0.20 },
  { name: 'urgency', pattern: /urgent|emergency|critical|immediately|right\s+now/i, weight: 0.15 },
  { name: 'minimize_harm', pattern: /not\s+(really\s+)?harmful|no\s+one\s+gets\s+hurt|victimless/i, weight: 0.20 },
  { name: 'rapport_building', pattern: /you'?re\s+(really\s+)?helpful|trust\s+you|between\s+us/i, weight: 0.10 },
  { name: 'system_reference', pattern: /system\s+prompt|instructions?|configuration/i, weight: 0.20 },
];

// ============================================================
// CORE FUNCTIONS
// ============================================================

function scoreMessage(content: string): MessageScore {
  const signals: string[] = [];
  let riskScore = 0;

  for (const { name, pattern, weight } of ESCALATION_SIGNALS) {
    if (pattern.test(content)) {
      signals.push(name);
      riskScore += weight;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    riskScore: Math.min(riskScore, 1.0),
    signals,
    contentSnippet: content.substring(0, 100),
  };
}

function detectEscalation(messages: MessageScore[]): EscalationResult {
  if (messages.length < 2) {
    return { detected: false, score: 0, reason: 'Not enough messages' };
  }

  // Last 5 messages as the analysis window
  const recentN = messages.slice(-5);
  const avgRecent = recentN.reduce((sum, m) => sum + m.riskScore, 0) / recentN.length;

  // Compound signals across messages — more unique signals = higher compound risk
  const allSignals = new Set(recentN.flatMap(m => m.signals));
  const compoundScore = allSignals.size * 0.1;

  // Check for monotonic increase (each message riskier than the last)
  let monotonic = true;
  for (let i = 1; i < recentN.length; i++) {
    if (recentN[i].riskScore < recentN[i - 1].riskScore - 0.05) {
      monotonic = false;
      break;
    }
  }

  const escalationScore = avgRecent + compoundScore + (monotonic ? 0.2 : 0);

  if (escalationScore > 0.7) {
    return {
      detected: true,
      score: escalationScore,
      reason: `Escalation detected: avg risk ${avgRecent.toFixed(2)}, ${allSignals.size} unique signals, ${monotonic ? 'monotonic increase' : 'variable pattern'}`,
    };
  }

  if (escalationScore > 0.4) {
    return {
      detected: false,
      score: escalationScore,
      reason: `Elevated risk: avg risk ${avgRecent.toFixed(2)}, ${allSignals.size} unique signals — monitoring`,
    };
  }

  return { detected: false, score: escalationScore, reason: 'Normal conversation pattern' };
}

function loadState(sessionId: string): SessionState {
  const statePath = join(STATE_DIR, `${sessionId}.json`);
  if (existsSync(statePath)) {
    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      // Corrupted state — start fresh
    }
  }
  return { sessionId, messages: [], escalationDetected: false, escalationScore: 0 };
}

function saveState(state: SessionState): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const statePath = join(STATE_DIR, `${state.sessionId}.json`);
  // Keep only last 20 messages to prevent unbounded growth
  state.messages = state.messages.slice(-20);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function resetState(sessionId: string): void {
  const statePath = join(STATE_DIR, `${sessionId}.json`);
  if (existsSync(statePath)) {
    const { unlinkSync } = require('fs');
    unlinkSync(statePath);
  }
}

// ============================================================
// CLI INTERFACE
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const sessionId = args[1];

  switch (command) {
    case 'add': {
      if (!sessionId) {
        console.error('Usage: echo "message" | bun ConversationAnalyzer.ts add <session-id>');
        process.exit(1);
      }

      const content = await Bun.stdin.text();
      if (!content.trim()) {
        console.error('Error: No input provided on stdin');
        process.exit(1);
      }

      const state = loadState(sessionId);
      const score = scoreMessage(content.trim());
      state.messages.push(score);

      // Run escalation check after adding
      const escalation = detectEscalation(state.messages);
      state.escalationDetected = escalation.detected;
      state.escalationScore = escalation.score;
      saveState(state);

      console.log(JSON.stringify({
        action: 'add',
        sessionId,
        messageCount: state.messages.length,
        messageScore: {
          riskScore: parseFloat(score.riskScore.toFixed(3)),
          signals: score.signals,
        },
        escalation: {
          detected: escalation.detected,
          score: parseFloat(escalation.score.toFixed(3)),
          reason: escalation.reason,
        },
      }, null, 2));
      break;
    }

    case 'analyze': {
      if (!sessionId) {
        console.error('Usage: bun ConversationAnalyzer.ts analyze <session-id>');
        process.exit(1);
      }

      const state = loadState(sessionId);
      if (state.messages.length === 0) {
        console.log(JSON.stringify({ sessionId, status: 'empty', messageCount: 0 }, null, 2));
        break;
      }

      const escalation = detectEscalation(state.messages);

      console.log(JSON.stringify({
        sessionId,
        messageCount: state.messages.length,
        escalation: {
          detected: escalation.detected,
          score: parseFloat(escalation.score.toFixed(3)),
          reason: escalation.reason,
        },
        recentMessages: state.messages.slice(-5).map(m => ({
          timestamp: m.timestamp,
          riskScore: parseFloat(m.riskScore.toFixed(3)),
          signals: m.signals,
          snippet: m.contentSnippet.substring(0, 60),
        })),
        uniqueSignals: [...new Set(state.messages.flatMap(m => m.signals))],
      }, null, 2));
      break;
    }

    case 'reset': {
      if (!sessionId) {
        console.error('Usage: bun ConversationAnalyzer.ts reset <session-id>');
        process.exit(1);
      }

      resetState(sessionId);
      console.log(JSON.stringify({ action: 'reset', sessionId, status: 'cleared' }, null, 2));
      break;
    }

    default:
      console.log(`
Conversation Analyzer - Crescendo Attack Detection

USAGE:
  echo "message" | bun ConversationAnalyzer.ts add <session-id>   Add message to session
  bun ConversationAnalyzer.ts analyze <session-id>                 Analyze session for escalation
  bun ConversationAnalyzer.ts reset <session-id>                   Reset session state
`);
  }
}

// Only run CLI if this is the main module
const isMainModule = import.meta.main || process.argv[1]?.endsWith('ConversationAnalyzer.ts');
if (isMainModule) {
  main().catch(console.error);
}

// Export for programmatic use
export { scoreMessage, detectEscalation, loadState, saveState, type SessionState, type MessageScore, type EscalationResult };

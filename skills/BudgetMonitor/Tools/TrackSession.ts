#!/usr/bin/env bun
/**
 * TrackSession.ts - Parse Claude Code session transcripts and log usage
 *
 * Reads a .jsonl session transcript, aggregates token usage from assistant
 * messages, counts messages by role, calculates duration, and appends
 * a record to BUDGET/usage.jsonl.
 *
 * Usage:
 *   bun run TrackSession.ts --transcript=/path/to/session.jsonl
 *   echo '{"transcript_path":"/path/to/session.jsonl"}' | bun run TrackSession.ts
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';

const BUDGET_DIR = join(process.env.HOME!, '.claude', 'BUDGET');
const USAGE_PATH = join(BUDGET_DIR, 'usage.jsonl');

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface SessionRecord {
  timestamp: string;
  service: string;
  session_id: string;
  duration_minutes: number;
  messages: { user: number; assistant: number; total: number };
  tokens: TokenUsage;
  cost_estimated: number;
}

function parseTranscript(path: string): SessionRecord {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  const tokens: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  let userMessages = 0;
  let assistantMessages = 0;
  let sessionId = '';
  let firstTimestamp = '';
  let lastTimestamp = '';

  for (const line of lines) {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Track timestamps
    if (obj.timestamp) {
      if (!firstTimestamp) firstTimestamp = obj.timestamp;
      lastTimestamp = obj.timestamp;
    }

    // Get session ID
    if (obj.sessionId && !sessionId) {
      sessionId = obj.sessionId;
    }

    // Count messages
    if (obj.type === 'user') userMessages++;
    if (obj.type === 'assistant') {
      assistantMessages++;

      // Extract token usage from assistant message
      const usage = obj.message?.usage;
      if (usage) {
        tokens.input_tokens += usage.input_tokens || 0;
        tokens.output_tokens += usage.output_tokens || 0;
        tokens.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
        tokens.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
      }
    }
  }

  // Calculate duration
  let durationMinutes = 0;
  if (firstTimestamp && lastTimestamp) {
    const start = new Date(firstTimestamp).getTime();
    const end = new Date(lastTimestamp).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      durationMinutes = Math.round((end - start) / 60000);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    service: 'claude_max',
    session_id: sessionId || 'unknown',
    duration_minutes: durationMinutes,
    messages: {
      user: userMessages,
      assistant: assistantMessages,
      total: userMessages + assistantMessages,
    },
    tokens,
    cost_estimated: 0, // Claude Max is flat fee
  };
}

async function main() {
  let transcriptPath = '';

  // Check CLI args
  const transcriptArg = process.argv.find(a => a.startsWith('--transcript='));
  if (transcriptArg) {
    transcriptPath = transcriptArg.split('=')[1];
  }

  // Check stdin (hook mode)
  if (!transcriptPath) {
    try {
      const stdinData = readFileSync('/dev/stdin', 'utf-8').trim();
      if (stdinData) {
        const input = JSON.parse(stdinData);
        transcriptPath = input.transcript_path || '';
      }
    } catch {
      // No stdin data
    }
  }

  if (!transcriptPath || !existsSync(transcriptPath)) {
    console.error(`TrackSession: No valid transcript at '${transcriptPath}'`);
    process.exit(0); // Non-blocking
  }

  try {
    const record = parseTranscript(transcriptPath);

    // Skip empty sessions
    if (record.messages.total === 0) {
      console.error('TrackSession: Empty session, skipping');
      process.exit(0);
    }

    appendFileSync(USAGE_PATH, JSON.stringify(record) + '\n');

    const totalTokens = record.tokens.input_tokens + record.tokens.output_tokens;
    console.error(`TrackSession: Logged session ${record.session_id.slice(0, 8)}... (${record.messages.total} msgs, ${totalTokens.toLocaleString()} tokens, ${record.duration_minutes}min)`);
  } catch (err) {
    console.error(`TrackSession: Error - ${err}`);
  }

  process.exit(0);
}

main();

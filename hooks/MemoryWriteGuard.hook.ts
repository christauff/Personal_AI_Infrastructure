#!/usr/bin/env bun
/**
 * MemoryWriteGuard.hook.ts - Memory Write Injection Guard (PreToolUse)
 *
 * TRIGGER: PreToolUse (matcher: Write, Edit)
 *
 * PURPOSE:
 * Scans content being written to PAI memory and learning paths for injection
 * patterns BEFORE writes are committed. Closes the Stage 5 (Persistence)
 * gap in the Promptware Kill Chain — content reaching memory can survive
 * across sessions.
 *
 * DESIGN:
 * - Regex-only (no semantic) — intentional asymmetry vs. ExternalContentValidator.
 *   This is a secondary layer; semantic dual-confirmation happens at read time.
 * - Path canonicalization via realpathSync() to defeat ../ traversal bypasses.
 * - Two tiers:
 *   PROTECTED_PATHS: block critical injections, warn on high
 *   WARN_ONLY_PATHS: warn always, never block (PAI self-writes must succeed)
 *
 * KNOWN GAPS (documented):
 * - Bash tool writes bypass this hook entirely (architectural limit of Claude Code
 *   PreToolUse scope — Bash is not Write/Edit)
 * - Regex-only: high-confidence semantic injections not caught at write time
 * - Formation/learning notes about security topics may false-positive on LEARNING/
 *
 * Created: 2026-02-17 (Phase 4B security hardening — Promptware Kill Chain)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const PAI_DIR = join(HOME, '.claude');

// ============================================================
// PATH CONFIGURATION
// ============================================================

// PAI internal paths — warn but NEVER block (security logging, state files,
// circuit breakers, etc. must always be writable by PAI's own hooks)
const WARN_ONLY_PATHS = [
  join(PAI_DIR, 'MEMORY', 'SECURITY'),
  join(PAI_DIR, 'MEMORY', 'STATE'),
  join(PAI_DIR, 'MEMORY', 'AGENTS'),
  join(PAI_DIR, 'MEMORY', 'VOICE'),
  join(PAI_DIR, 'GOVERNANCE'),
];

// Protected paths — scan and potentially block critical injections
const PROTECTED_PATHS = [
  join(PAI_DIR, 'MEMORY', 'LEARNING'),
  join(PAI_DIR, 'MEMORY', 'RELATIONSHIP'),
  join(PAI_DIR, 'MEMORY', 'SYNTHESIS'),
  join(PAI_DIR, 'MEMORY', 'READING'),
  join(PAI_DIR, 'AUTOLEARN', 'HARVEST'),
  join(PAI_DIR, 'DREAMS'),
];

// ============================================================
// INJECTION PATTERNS (write-time, regex-only)
// ============================================================

interface WritePattern {
  id: string;
  name: string;
  pattern: RegExp;
  risk: 'critical' | 'high' | 'medium';
}

const WRITE_PATTERNS: WritePattern[] = [
  // Goal hijacking — direct instruction override
  {
    id: 'W001',
    name: 'Goal Hijacking',
    pattern: /ignore\s+(previous|prior|all|any)\s+(instructions?|rules?|guidelines?|context)/i,
    risk: 'critical',
  },
  {
    id: 'W002',
    name: 'System Override',
    pattern: /\[SYSTEM\]|\[INST\]|\[\/INST\]|<\|system\|>|<\|im_start\|>|<\|im_end\|>/i,
    risk: 'critical',
  },
  {
    id: 'W003',
    name: 'Identity Override',
    pattern: /you\s+are\s+now\s+(a\s+)?(new|different|another|the\s+real)/i,
    risk: 'critical',
  },
  {
    id: 'W004',
    name: 'DAN / Jailbreak Persona',
    pattern: /\bDAN\b|do\s+anything\s+now|jailbreak\s+mode|developer\s+mode\s+enabled/i,
    risk: 'critical',
  },
  {
    id: 'W005',
    name: 'Principal Impersonation',
    pattern: /christauff\s+(says?|told|ordered|wants?\s+you|commands?|instructs?)/i,
    risk: 'critical',
  },
  // Memory poisoning — attempts to corrupt context across sessions
  {
    id: 'W006',
    name: 'Memory Anchor Injection',
    pattern: /remember\s+(that|this|the\s+following)\s*:\s*(?:you|your|aineko)/i,
    risk: 'high',
  },
  {
    id: 'W007',
    name: 'Role Assignment',
    pattern: /your\s+(new\s+)?(role|purpose|mission|objective|goal)\s+is\s+to/i,
    risk: 'high',
  },
  {
    id: 'W008',
    name: 'Instruction Persistence Attempt',
    pattern: /always\s+(remember|follow|obey|comply|execute|perform)\s+(?:these|this|the\s+following)/i,
    risk: 'high',
  },
  // Exfiltration setup
  {
    id: 'W009',
    name: 'Data Exfiltration Setup',
    pattern: /send\s+(the\s+following|all|everything|this\s+data|user\s+data)\s+to/i,
    risk: 'high',
  },
  {
    id: 'W010',
    name: 'Base64 Encoded Instruction',
    pattern: /(?:decode|base64_decode|atob|from_base64|decode_base64)\s*[\(\[]/i,
    risk: 'high',
  },
  // Unicode tag character backdoors (can be invisible)
  {
    id: 'W011',
    name: 'Unicode Tag Characters',
    pattern: /[\u{E0001}-\u{E007F}]/u,
    risk: 'critical',
  },
];

// ============================================================
// DETECTION
// ============================================================

interface WriteDetection {
  detected: boolean;
  patterns: Array<{ id: string; name: string; risk: string; snippet: string }>;
  maxRisk: 'none' | 'medium' | 'high' | 'critical';
}

function detectWriteInjections(content: string): WriteDetection {
  const found: WriteDetection['patterns'] = [];
  let maxRisk: WriteDetection['maxRisk'] = 'none';

  const riskOrder = { none: 0, medium: 1, high: 2, critical: 3 };

  for (const wp of WRITE_PATTERNS) {
    const match = wp.pattern.exec(content);
    if (match) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(content.length, match.index + match[0].length + 20);
      found.push({
        id: wp.id,
        name: wp.name,
        risk: wp.risk,
        snippet: content.slice(start, end).replace(/\n/g, ' '),
      });
      if (riskOrder[wp.risk] > riskOrder[maxRisk]) {
        maxRisk = wp.risk;
      }
    }
  }

  return { detected: found.length > 0, patterns: found, maxRisk };
}

// ============================================================
// LOGGING
// ============================================================

interface WriteGuardEvent {
  timestamp: string;
  session_id: string;
  tool: string;
  file_path: string;
  content_length: number;
  path_tier: 'protected' | 'warn-only' | 'unscoped';
  detection: WriteDetection;
  action_taken: string;
}

function logWriteEvent(event: WriteGuardEvent): void {
  try {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const ts = `${year}${month}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

    const dir = join(PAI_DIR, 'MEMORY', 'SECURITY', year, month);
    const filename = `write-guard-${event.action_taken}-${ts}.jsonl`;

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), JSON.stringify(event, null, 2));
  } catch {
    // Logging must never block processing
  }
}

// ============================================================
// MAIN
// ============================================================

const input = JSON.parse(await Bun.stdin.text());
const { tool_name, tool_input, session_id } = input;

// Extract file path and content based on tool
let filePath: string | null = null;
let content = '';

if (tool_name === 'Write') {
  filePath = tool_input?.file_path || null;
  content = tool_input?.content || '';
} else if (tool_name === 'Edit') {
  filePath = tool_input?.file_path || null;
  // Scan the new content being inserted
  content = tool_input?.new_string || '';
} else {
  // Not a write tool — pass through
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

if (!filePath || content.length < 20) {
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Path canonicalization — defeat ../ traversal bypasses
// Note: realpathSync throws if path doesn't exist yet (new files)
// For new files, normalize() catches most traversal without filesystem lookup
let resolvedPath: string;
try {
  // For existing files, resolve symlinks and canonicalize
  const { realpathSync } = await import('fs');
  resolvedPath = realpathSync(filePath);
} catch {
  // File doesn't exist yet (Write creating new file) — use normalize
  resolvedPath = normalize(filePath);
}

// Determine path tier
const isWarnOnly = WARN_ONLY_PATHS.some((p) => resolvedPath.startsWith(p));
const isProtected = !isWarnOnly && PROTECTED_PATHS.some((p) => resolvedPath.startsWith(p));

if (!isWarnOnly && !isProtected) {
  // Not a monitored path — pass through silently
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Run detection
const detection = detectWriteInjections(content);

const event: WriteGuardEvent = {
  timestamp: new Date().toISOString(),
  session_id: session_id || 'unknown',
  tool: tool_name,
  file_path: resolvedPath,
  content_length: content.length,
  path_tier: isWarnOnly ? 'warn-only' : 'protected',
  detection,
  action_taken: 'allow',
};

if (!detection.detected) {
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Detection found — log and respond based on tier and risk
logWriteEvent(event);

if (isWarnOnly) {
  // PAI internal paths — always warn, never block (logging must work)
  event.action_taken = 'warn-internal';
  const topPattern = detection.patterns[0];
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `\n[WRITE GUARD] Injection pattern in PAI-internal write (warn-only path).\nFile: ${resolvedPath}\nPattern: ${topPattern.name} (${topPattern.risk}) — ${topPattern.snippet.slice(0, 80)}\nThis path is exempted from blocking. Verify content is legitimate PAI output.\n`,
  }));
  process.exit(0);
}

// Protected path — enforce based on risk
if (detection.maxRisk === 'critical') {
  event.action_taken = 'block';
  logWriteEvent(event);
  const topPattern = detection.patterns[0];
  console.log(JSON.stringify({
    continue: false,
    stopReason: `[WRITE GUARD BLOCK] Critical injection pattern detected in memory write. File: ${resolvedPath.replace(HOME, '~')} | Pattern: ${topPattern.name} | Context: ${topPattern.snippet.slice(0, 80)}`,
  }));
  process.exit(0);
}

if (detection.maxRisk === 'high') {
  event.action_taken = 'warn';
  const topPattern = detection.patterns[0];
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `\n[WRITE GUARD] High-risk injection pattern in memory write.\nFile: ${resolvedPath.replace(HOME, '~')}\nPattern: ${topPattern.name} — ${topPattern.snippet.slice(0, 80)}\nReview content before proceeding. If this is legitimate PAI learning output, continue.\n`,
  }));
  process.exit(0);
}

// Medium risk — log only, pass through
event.action_taken = 'log';
console.log(JSON.stringify({ continue: true }));

#!/usr/bin/env bun
/**
 * AgentOutputValidator.ts - Validate agent outputs before trusting them
 *
 * Checks agent outputs for:
 * 1. Prompt injection patterns (reuses ExternalContentValidator detection)
 * 2. Data exfiltration attempts (URLs with encoded data, suspicious URLs)
 * 3. Goal drift indicators (output redirecting away from original task)
 *
 * CLI:
 *   echo "agent output" | bun AgentOutputValidator.ts validate
 *   echo "agent output" | bun AgentOutputValidator.ts validate --task "original task description"
 *
 * Programmatic:
 *   import { validateOutput } from './AgentOutputValidator';
 *   const result = validateOutput(output, originalTask);
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================
// TYPES
// ============================================================

interface ValidationResult {
  clean: boolean;
  warnings: Warning[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

interface Warning {
  type: 'injection' | 'exfiltration' | 'goal_drift' | 'suspicious_url';
  description: string;
  evidence: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================
// INJECTION PATTERNS (subset for speed)
// ============================================================

const INJECTION_PATTERNS = [
  { name: 'Instruction Override', pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i },
  { name: 'Role Hijacking', pattern: /you\s+are\s+now\s+\w+[,\s]+(an?\s+)?AI/i },
  { name: 'Goal Override', pattern: /your\s+(new\s+)?goal\s+is/i },
  { name: 'Authority Claim', pattern: /i\s+am\s+(your\s+)?(administrator|admin|owner)/i },
  { name: 'System Override', pattern: /system\s+(administrator\s+)?override/i },
  { name: 'Token Injection', pattern: /<\|endoftext\|>|<\|im_end\|>|<\|im_start\|>/i },
];

// ============================================================
// EXFILTRATION PATTERNS
// ============================================================

const EXFIL_PATTERNS = [
  // URLs with data parameters
  { name: 'URL Data Param', pattern: /https?:\/\/[^\s]+[?&](data|payload|secret|key|token|content)=[^\s]+/gi },
  // Markdown images with suspicious URLs
  { name: 'Markdown Image Exfil', pattern: /!\[.*?\]\(https?:\/\/[^)]*[?&](data|payload|secret|content)=/gi },
  // Base64 in URLs
  { name: 'Base64 URL', pattern: /https?:\/\/[^\s]*[A-Za-z0-9+/]{30,}={0,2}/g },
  // Webhook-like URLs
  { name: 'Webhook URL', pattern: /https?:\/\/[^\s]*(webhook|hook|callback|exfil|log|collect)[^\s]*/gi },
];

// ============================================================
// GOAL DRIFT INDICATORS
// ============================================================

const DRIFT_PHRASES = [
  /instead\s+of\s+(your\s+)?(original|previous|assigned)/i,
  /more\s+important\s+than\s+(your\s+)?task/i,
  /forget\s+(about\s+)?(the|your)\s+(original|previous|assigned)/i,
  /new\s+priority/i,
  /change\s+of\s+plans?/i,
  /disregard\s+(the\s+)?(previous|original)/i,
];

// ============================================================
// VALIDATION LOGIC
// ============================================================

export function validateOutput(content: string, originalTask?: string): ValidationResult {
  const warnings: Warning[] = [];

  if (!content || content.length < 10) {
    return { clean: true, warnings: [], riskLevel: 'none' };
  }

  // Check injection patterns
  for (const { name, pattern } of INJECTION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      warnings.push({
        type: 'injection',
        description: `Injection pattern: ${name}`,
        evidence: match[0].slice(0, 80),
        severity: 'high',
      });
    }
  }

  // Check exfiltration patterns
  for (const { name, pattern } of EXFIL_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches.slice(0, 3)) { // Cap at 3 matches per pattern
        warnings.push({
          type: 'exfiltration',
          description: `Potential data exfiltration: ${name}`,
          evidence: match.slice(0, 100),
          severity: 'critical',
        });
      }
    }
  }

  // Check goal drift
  for (const pattern of DRIFT_PHRASES) {
    const match = content.match(pattern);
    if (match) {
      warnings.push({
        type: 'goal_drift',
        description: 'Goal drift indicator detected in agent output',
        evidence: match[0].slice(0, 80),
        severity: 'medium',
      });
    }
  }

  // Calculate risk level
  let riskLevel: ValidationResult['riskLevel'] = 'none';
  if (warnings.length > 0) {
    const maxSeverity = warnings.reduce((max, w) => {
      const order = ['critical', 'high', 'medium', 'low'];
      return order.indexOf(w.severity) < order.indexOf(max) ? w.severity : max;
    }, 'low' as Warning['severity']);

    riskLevel = maxSeverity;
  }

  return {
    clean: warnings.length === 0,
    warnings,
    riskLevel,
  };
}

// ============================================================
// CLI
// ============================================================

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command !== 'validate') {
    console.error('Usage: echo "content" | bun AgentOutputValidator.ts validate [--task "description"]');
    process.exit(1);
  }

  const content = await Bun.stdin.text();
  if (!content.trim()) {
    console.error('No input provided on stdin');
    process.exit(1);
  }

  const taskIdx = process.argv.indexOf('--task');
  const originalTask = taskIdx !== -1 ? process.argv[taskIdx + 1] : undefined;

  const result = validateOutput(content, originalTask);

  console.log(JSON.stringify(result, null, 2));

  if (!result.clean) {
    console.error(`\n[AGENT OUTPUT VALIDATION] Risk: ${result.riskLevel.toUpperCase()}`);
    for (const w of result.warnings) {
      console.error(`  [${w.severity.toUpperCase()}] ${w.type}: ${w.description}`);
      console.error(`    Evidence: ${w.evidence}`);
    }
  }

  process.exit(result.clean ? 0 : 1);
}

main().catch(err => {
  console.error(`Error: ${err}`);
  process.exit(2);
});

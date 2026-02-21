#!/usr/bin/env bun
/**
 * SecurityDashboard.ts - CLI security posture summary
 *
 * Aggregates all security metrics into a single formatted report.
 *
 * CLI:
 *   bun SecurityDashboard.ts           # Full dashboard
 *   bun SecurityDashboard.ts --json    # JSON output for programmatic use
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const PAI_DIR = join(homedir(), '.claude');
const isTTY = process.stdout.isTTY ?? false;
const jsonMode = process.argv.includes('--json');

// ANSI color helpers — only emit codes when outputting to a terminal
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  green: isTTY ? '\x1b[32m' : '',
  red: isTTY ? '\x1b[31m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  white: isTTY ? '\x1b[37m' : '',
};

// ─── Helpers ──────────────────────────────────────────

function readJsonSafe<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function readJsonlSafe(path: string): Record<string, unknown>[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function pad(s: string, width: number): string {
  // Strip ANSI codes for length calculation
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - visible.length);
  return s + ' '.repeat(padding);
}

// ─── Section: Integrity ───────────────────────────────

interface IntegrityData {
  status: string;
  fileCount: number;
  baseline: string;
  changed: string[];
  added: string[];
  removed: string[];
}

function getIntegrity(): IntegrityData {
  const manifestPath = join(PAI_DIR, 'MEMORY', 'SECURITY', 'integrity-manifest.json');
  const manifest = readJsonSafe<{
    generated: string;
    version: number;
    files: Record<string, { sha256: string; size: number; modified: string }>;
  }>(manifestPath);

  if (!manifest) {
    return { status: 'NO MANIFEST', fileCount: 0, baseline: 'N/A', changed: [], added: [], removed: [] };
  }

  const fileCount = Object.keys(manifest.files).length;
  const baseline = manifest.generated.split('T')[0];

  // Quick verify: hash current files against manifest
  const changed: string[] = [];
  const removed: string[] = [];

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    const fullPath = join(PAI_DIR, relPath);
    if (!existsSync(fullPath)) {
      removed.push(relPath);
      continue;
    }
    try {
      const { createHash } = require('crypto');
      const content = readFileSync(fullPath);
      const hash = createHash('sha256').update(content).digest('hex');
      if (hash !== entry.sha256) {
        changed.push(relPath);
      }
    } catch {
      changed.push(relPath);
    }
  }

  // Check for added files (files that exist now but weren't in manifest)
  // We check the same directories IntegrityManifest.ts monitors
  const added: string[] = [];
  const dirsToCheck = [
    { dir: 'hooks', ext: '.ts' },
    { dir: 'GOVERNANCE', ext: '.ts' },
    { dir: 'GOVERNANCE', ext: '.sh' },
  ];

  for (const { dir, ext } of dirsToCheck) {
    const fullDir = join(PAI_DIR, dir);
    if (!existsSync(fullDir)) continue;
    for (const f of readdirSync(fullDir)) {
      if (!f.endsWith(ext)) continue;
      const relPath = join(dir, f);
      if (!(relPath in manifest.files)) {
        added.push(relPath);
      }
    }
  }

  const clean = changed.length === 0 && added.length === 0 && removed.length === 0;
  return {
    status: clean ? 'CLEAN' : 'DRIFT DETECTED',
    fileCount,
    baseline,
    changed,
    added,
    removed,
  };
}

// ─── Section: Detection Coverage ──────────────────────

interface DetectionData {
  detected: number;
  total: number;
  rate: string;
  mutationRate: string;
  lastRun: string;
}

function getDetection(): DetectionData | null {
  const resultsPath = join(PAI_DIR, 'skills', 'PromptInjection', 'Data', 'red-team-results.jsonl');
  const results = readJsonlSafe(resultsPath);

  if (results.length === 0) return null;

  let detected = 0;
  let total = 0;
  let mutationDetected = 0;
  let mutationTotal = 0;
  let lastRun = '';

  for (const r of results) {
    const wasMutation = !!(r as Record<string, unknown>).mutationOf;
    const wasDetected = !!(r as Record<string, unknown>).detected;
    const timestamp = (r as Record<string, unknown>).timestamp as string;

    if (wasMutation) {
      mutationTotal++;
      if (wasDetected) mutationDetected++;
    } else {
      total++;
      if (wasDetected) detected++;
    }

    if (timestamp && timestamp > lastRun) lastRun = timestamp;
  }

  const rate = total > 0 ? `${Math.round((detected / total) * 100)}%` : 'N/A';
  const mutationRate = mutationTotal > 0
    ? `${Math.round((mutationDetected / mutationTotal) * 100)}%`
    : 'N/A';

  return {
    detected,
    total,
    rate,
    mutationRate,
    lastRun: lastRun ? lastRun.split('T')[0] : 'N/A',
  };
}

// ─── Section: Recent Alerts ───────────────────────────

interface AlertData {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

function getAlerts(): AlertData {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Scan MEMORY/SECURITY/2026/ subdirectories for .jsonl files
  const securityDir = join(PAI_DIR, 'MEMORY', 'SECURITY', '2026');
  if (!existsSync(securityDir)) return counts;

  for (const monthDir of readdirSync(securityDir)) {
    const monthPath = join(securityDir, monthDir);
    if (!statSync(monthPath).isDirectory()) continue;

    for (const file of readdirSync(monthPath)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = join(monthPath, file);

      try {
        const stat = statSync(filePath);
        if (stat.mtime < sevenDaysAgo) continue;

        // Parse risk level from file content (may be pretty-printed JSON or JSONL)
        const content = readFileSync(filePath, 'utf-8').trim();
        if (!content) continue;

        let risk = '';
        try {
          // Try parsing entire file as JSON first (pretty-printed format)
          const parsed = JSON.parse(content);
          risk = (parsed.risk_level || '').toLowerCase();
        } catch {
          // Fallback: try first line as JSONL
          try {
            const firstLine = content.split('\n')[0];
            const parsed = JSON.parse(firstLine);
            risk = (parsed.risk_level || '').toLowerCase();
          } catch { /* fall through to filename inference */ }
        }

        if (risk === 'critical') counts.critical++;
        else if (risk === 'high') counts.high++;
        else if (risk === 'medium') counts.medium++;
        else if (risk === 'low') counts.low++;
        else {
          // Infer from filename
          const fname = file.toLowerCase();
          if (fname.includes('critical')) counts.critical++;
          else if (fname.includes('high')) counts.high++;
          else if (fname.includes('block')) counts.high++;
          else if (fname.includes('alert')) counts.medium++;
          else if (fname.includes('confirm')) counts.low++;
          else counts.low++;
        }
        counts.total++;
      } catch {
        // Skip unparseable files
      }
    }
  }

  return counts;
}

// ─── Section: Agent Security ──────────────────────────

interface AgentData {
  circuitBreaker: string;
  agentsInWindow: number;
}

function getAgentSecurity(): AgentData | null {
  const cbPath = join(PAI_DIR, 'MEMORY', 'STATE', 'agent-circuit-breaker.json');
  const data = readJsonSafe<{
    status: string;
    agents_spawned: number;
    window_start: string;
  }>(cbPath);

  if (!data) return null;

  return {
    circuitBreaker: (data.status || 'NORMAL').toUpperCase(),
    agentsInWindow: data.agents_spawned || 0,
  };
}

// ─── Section: Hook Status ─────────────────────────────

interface HookStatus {
  name: string;
  active: boolean;
}

function getHookStatus(): HookStatus[] {
  const requiredHooks = [
    { name: 'SecurityValidator', file: 'SecurityValidator.hook.ts' },
    { name: 'ExternalContentValidator', file: 'ExternalContentValidator.hook.ts' },
    { name: 'ContentValidator', file: 'ContentValidator.hook.ts' },
    { name: 'A2AValidator', file: 'A2AValidator.hook.ts' },
    { name: 'SupplyChainGate', file: 'SupplyChainGate.hook.ts' },
    { name: 'TaskAudit', file: 'TaskAudit.hook.ts' },
    { name: 'IntegrityCheck', file: 'IntegrityCheck.hook.ts' },
  ];

  return requiredHooks.map(h => {
    // Check hooks/ dir and GOVERNANCE/ dir
    const inHooks = existsSync(join(PAI_DIR, 'hooks', h.file));
    const inGov = existsSync(join(PAI_DIR, 'GOVERNANCE', h.file));
    return { name: h.name, active: inHooks || inGov };
  });
}

// ─── Section: Configuration ───────────────────────────

interface ConfigData {
  mcpWildcardRemoved: boolean;
  askRulesCount: number;
  patternsVersion: string;
  patternsUpdated: string;
}

function getConfig(): ConfigData {
  const settings = readJsonSafe<{
    permissions?: {
      allow?: string[];
      ask?: string[];
    };
  }>(join(PAI_DIR, 'settings.json'));

  const allowList = settings?.permissions?.allow || [];
  const askList = settings?.permissions?.ask || [];
  const mcpWildcard = allowList.some(r => r.startsWith('mcp__'));

  // Read patterns.yaml header for version info
  let patternsVersion = 'N/A';
  let patternsUpdated = 'N/A';
  const patternsPath = join(PAI_DIR, 'skills', 'PAI', 'USER', 'PAISECURITYSYSTEM', 'patterns.yaml');
  if (existsSync(patternsPath)) {
    try {
      const content = readFileSync(patternsPath, 'utf-8');
      const versionMatch = content.match(/version:\s*"?([^"\n]+)"?/);
      const dateMatch = content.match(/last_updated:\s*"?([^"\n]+)"?/);
      if (versionMatch) patternsVersion = versionMatch[1];
      if (dateMatch) patternsUpdated = dateMatch[1];
    } catch { /* skip */ }
  }

  return {
    mcpWildcardRemoved: !mcpWildcard,
    askRulesCount: askList.length,
    patternsVersion,
    patternsUpdated,
  };
}

// ─── Section: Candidate Patterns ──────────────────────

function getCandidateCount(): number {
  const candidatesPath = join(PAI_DIR, 'skills', 'PromptInjection', 'Data', 'candidate-patterns.jsonl');
  const candidates = readJsonlSafe(candidatesPath);
  return candidates.filter(c => !(c as Record<string, unknown>).reviewed).length;
}

// ─── Render: Formatted CLI ────────────────────────────

function renderDashboard(): void {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  const integrity = getIntegrity();
  const detection = getDetection();
  const alerts = getAlerts();
  const agents = getAgentSecurity();
  const hooks = getHookStatus();
  const config = getConfig();
  const candidateCount = getCandidateCount();

  const activeHooks = hooks.filter(h => h.active).length;
  const totalHooks = hooks.length;

  const W = 58; // inner width

  const line = (content: string) => {
    const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, W - visible.length);
    console.log(`${c.cyan}|${c.reset}  ${content}${' '.repeat(padding)}${c.cyan}|${c.reset}`);
  };

  const blank = () => line('');
  const separator = () => console.log(`${c.cyan}${'='.repeat(W + 4)}${c.reset}`);
  const thinSep = () => console.log(`${c.cyan}${'-'.repeat(W + 4)}${c.reset}`);

  // Header
  separator();
  line(`${c.bold}           PAI SECURITY DASHBOARD${c.reset}`);
  line(`${c.dim}           ${timestamp}${c.reset}`);
  separator();
  blank();

  // Integrity
  const intIcon = integrity.status === 'CLEAN'
    ? `${c.green}CLEAN${c.reset}`
    : `${c.red}${integrity.status}${c.reset}`;
  line(`${c.bold}INTEGRITY:${c.reset}  ${intIcon} (${integrity.fileCount} files, baseline: ${integrity.baseline})`);

  if (integrity.changed.length > 0) {
    for (const f of integrity.changed) {
      line(`  ${c.yellow}~ ${f}${c.reset}`);
    }
  }
  if (integrity.added.length > 0) {
    for (const f of integrity.added) {
      line(`  ${c.green}+ ${f}${c.reset}`);
    }
  }
  if (integrity.removed.length > 0) {
    for (const f of integrity.removed) {
      line(`  ${c.red}- ${f}${c.reset}`);
    }
  }
  blank();

  // Detection
  if (detection) {
    line(`${c.bold}DETECTION:${c.reset}  ${detection.rate} coverage (${detection.detected}/${detection.total} techniques)`);
    line(`            ${detection.mutationRate} mutation resistance`);
  } else {
    line(`${c.bold}DETECTION:${c.reset}  ${c.dim}No red team results yet${c.reset}`);
  }
  blank();

  // Alerts
  const alertParts = [
    alerts.critical > 0 ? `${c.red}${alerts.critical} critical${c.reset}` : `0 critical`,
    alerts.high > 0 ? `${c.yellow}${alerts.high} high${c.reset}` : `0 high`,
    `${alerts.medium} medium`,
    `${alerts.low} low`,
  ];
  line(`${c.bold}ALERTS (7d):${c.reset} ${alertParts.join(', ')}`);
  blank();

  // Agents
  if (agents) {
    const cbColor = agents.circuitBreaker === 'NORMAL' ? c.green
      : agents.circuitBreaker === 'WARNING' ? c.yellow
      : c.red;
    line(`${c.bold}AGENTS:${c.reset}     Circuit breaker: ${cbColor}${agents.circuitBreaker}${c.reset}`);
    line(`            ${agents.agentsInWindow} agents in current window`);
  } else {
    line(`${c.bold}AGENTS:${c.reset}     ${c.dim}Not configured${c.reset}`);
  }
  blank();

  // Hooks
  line(`${c.bold}HOOKS:${c.reset}      ${activeHooks}/${totalHooks} active`);
  for (const h of hooks) {
    const icon = h.active ? `${c.green}active${c.reset}` : `${c.red}MISSING${c.reset}`;
    line(`            ${h.name} ${icon}`);
  }
  blank();

  // Config
  const mcpIcon = config.mcpWildcardRemoved
    ? `${c.green}REMOVED${c.reset}`
    : `${c.red}PRESENT${c.reset}`;
  line(`${c.bold}CONFIG:${c.reset}     mcp__* wildcard: ${mcpIcon}`);
  line(`            Ask rules: ${config.askRulesCount} active`);
  line(`            Patterns v${config.patternsVersion} (${config.patternsUpdated})`);
  blank();

  // Candidates
  if (candidateCount > 0) {
    line(`${c.bold}CANDIDATES:${c.reset} ${c.yellow}${candidateCount} patterns pending review${c.reset}`);
  } else {
    line(`${c.bold}CANDIDATES:${c.reset} 0 patterns pending review`);
  }
  blank();

  // Footer
  thinSep();
  const lastRedTeam = detection ? detection.lastRun : 'never';
  line(`${c.dim}Last red team: ${lastRedTeam}${c.reset}`);
  separator();
}

// ─── Render: JSON ─────────────────────────────────────

function renderJson(): void {
  const output = {
    timestamp: new Date().toISOString(),
    integrity: getIntegrity(),
    detection: getDetection(),
    alerts: getAlerts(),
    agents: getAgentSecurity(),
    hooks: getHookStatus(),
    config: getConfig(),
    candidatesPendingReview: getCandidateCount(),
  };
  console.log(JSON.stringify(output, null, 2));
}

// ─── Main ─────────────────────────────────────────────

if (jsonMode) {
  renderJson();
} else {
  renderDashboard();
}

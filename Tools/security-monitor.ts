#!/usr/bin/env bun
/**
 * security-monitor.ts - Security Event Monitoring Dashboard
 *
 * PURPOSE: Monitor and analyze security events from MEMORY/SECURITY/
 * Provides real-time visibility into security validator actions
 *
 * USAGE:
 *   bun Tools/security-monitor.ts              # Show recent events
 *   bun Tools/security-monitor.ts --watch      # Live monitoring
 *   bun Tools/security-monitor.ts --stats      # Statistics summary
 *   bun Tools/security-monitor.ts --alerts     # Show only blocks/confirms
 */

import { readFileSync, readdirSync, statSync, existsSync, watchFile } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const SECURITY_DIR = join(PAI_DIR, 'MEMORY', 'SECURITY');

interface SecurityEvent {
  timestamp: string;
  session_id: string;
  event_type: 'block' | 'confirm' | 'alert' | 'allow';
  tool: string;
  category: 'bash_command' | 'path_access';
  target: string;
  pattern_matched?: string;
  reason?: string;
  action_taken: string;
}

function getSecurityFiles(): string[] {
  if (!existsSync(SECURITY_DIR)) {
    return [];
  }

  const files: string[] = [];

  // Walk through YYYY/MM structure
  const years = readdirSync(SECURITY_DIR).filter(f => /^\d{4}$/.test(f));

  for (const year of years) {
    const yearPath = join(SECURITY_DIR, year);
    const months = readdirSync(yearPath).filter(f => /^\d{2}$/.test(f));

    for (const month of months) {
      const monthPath = join(yearPath, month);
      const eventFiles = readdirSync(monthPath)
        .filter(f => f.startsWith('security-') && f.endsWith('.jsonl'))
        .map(f => join(monthPath, f));

      files.push(...eventFiles);
    }
  }

  // Sort by modification time, newest first
  return files.sort((a, b) => {
    const statA = statSync(a);
    const statB = statSync(b);
    return statB.mtimeMs - statA.mtimeMs;
  });
}

function parseEvents(files: string[], limit: number = 50): SecurityEvent[] {
  const events: SecurityEvent[] = [];

  for (const file of files) {
    if (events.length >= limit) break;

    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (events.length >= limit) break;

        try {
          const event = JSON.parse(line) as SecurityEvent;
          events.push(event);
        } catch (e) {
          // Skip malformed lines
        }
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  return events;
}

function formatEvent(event: SecurityEvent): string {
  const timestamp = new Date(event.timestamp).toLocaleString();
  const icon = {
    block: '🚫',
    confirm: '⚠️ ',
    alert: '🔔',
    allow: '✅'
  }[event.event_type] || '  ';

  const color = {
    block: '\x1b[31m',     // Red
    confirm: '\x1b[33m',   // Yellow
    alert: '\x1b[36m',     // Cyan
    allow: '\x1b[32m'      // Green
  }[event.event_type] || '';

  const reset = '\x1b[0m';

  const eventType = event.event_type.toUpperCase().padEnd(7);
  const tool = event.tool.padEnd(6);
  const target = event.target.length > 50 ? event.target.substring(0, 47) + '...' : event.target;

  let line = `${icon} ${color}${eventType}${reset} | ${tool} | ${target}`;

  if (event.reason) {
    line += `\n       Reason: ${event.reason}`;
  }

  if (event.pattern_matched) {
    line += `\n       Pattern: ${event.pattern_matched}`;
  }

  line += `\n       Time: ${timestamp} | Session: ${event.session_id.substring(0, 8)}`;

  return line;
}

function displayEvents(events: SecurityEvent[]) {
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('                   PAI SECURITY EVENT MONITOR');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (events.length === 0) {
    console.log('No security events found.\n');
    return;
  }

  events.forEach((event, i) => {
    console.log(formatEvent(event));
    if (i < events.length - 1) {
      console.log('───────────────────────────────────────────────────────────────────────────');
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

function displayStats(events: SecurityEvent[]) {
  const stats = {
    block: 0,
    confirm: 0,
    alert: 0,
    allow: 0,
    bash: 0,
    path: 0
  };

  const patterns: Record<string, number> = {};
  const targets: Record<string, number> = {};

  events.forEach(event => {
    stats[event.event_type]++;
    stats[event.category === 'bash_command' ? 'bash' : 'path']++;

    if (event.pattern_matched) {
      patterns[event.pattern_matched] = (patterns[event.pattern_matched] || 0) + 1;
    }

    if (event.category === 'bash_command') {
      const cmd = event.target.split(' ')[0];
      targets[cmd] = (targets[cmd] || 0) + 1;
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('                   SECURITY STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log('Event Types:');
  console.log(`  🚫 Blocked:   ${stats.block}`);
  console.log(`  ⚠️  Confirmed: ${stats.confirm}`);
  console.log(`  🔔 Alerted:   ${stats.alert}`);
  console.log(`  ✅ Allowed:   ${stats.allow}`);

  console.log('\nCategories:');
  console.log(`  Bash commands: ${stats.bash}`);
  console.log(`  Path access:   ${stats.path}`);

  if (Object.keys(patterns).length > 0) {
    console.log('\nTop Patterns Matched:');
    Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([pattern, count]) => {
        console.log(`  ${count}x ${pattern}`);
      });
  }

  if (Object.keys(targets).length > 0) {
    console.log('\nTop Commands:');
    Object.entries(targets)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([cmd, count]) => {
        console.log(`  ${count}x ${cmd}`);
      });
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

function watch() {
  console.log('👀 Watching for security events... (Ctrl+C to stop)\n');

  const files = getSecurityFiles();
  const latestFile = files[0];

  if (!latestFile) {
    console.log('No security event files found yet.');
    return;
  }

  console.log(`Monitoring: ${latestFile}\n`);

  let lastSize = statSync(latestFile).size;

  watchFile(latestFile, { interval: 1000 }, (curr, prev) => {
    if (curr.size > lastSize) {
      const content = readFileSync(latestFile, 'utf-8');
      const lines = content.split('\n');
      const newLines = lines.slice(Math.floor(lastSize / 100)); // Approximate

      newLines.forEach(line => {
        if (line.trim()) {
          try {
            const event = JSON.parse(line) as SecurityEvent;
            console.log(formatEvent(event));
            console.log('───────────────────────────────────────────────────────────────────────────');
          } catch (e) {
            // Skip malformed lines
          }
        }
      });

      lastSize = curr.size;
    }
  });
}

// Main
const args = process.argv.slice(2);
const mode = args[0];

const files = getSecurityFiles();
const events = parseEvents(files);

if (mode === '--watch') {
  watch();
} else if (mode === '--stats') {
  displayStats(events);
} else if (mode === '--alerts') {
  const alerts = events.filter(e => e.event_type === 'block' || e.event_type === 'confirm');
  displayEvents(alerts);
} else {
  // Default: show recent events
  const limit = parseInt(args[0]) || 20;
  displayEvents(events.slice(0, limit));
}

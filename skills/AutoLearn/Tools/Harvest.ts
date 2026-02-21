#!/usr/bin/env bun
/**
 * Harvest - Content fetcher for AutoLearn system
 *
 * Fetches content from monitored Claude Code creators defined in LandscapeMonitor.
 * Filters by priority/alpha_score, creates metadata entries, and tracks token usage.
 *
 * SECURITY: All external content is wrapped in EXTERNAL_CONTENT delimiters
 * and stored with content hashes for integrity verification.
 *
 * Usage:
 *   bun run Harvest.ts run              # Fetch content from high-priority sources
 *   bun run Harvest.ts run --all        # Fetch from all sources (ignore priority filter)
 *   bun run Harvest.ts status           # Show last harvest summary
 *   bun run Harvest.ts sources          # List monitored sources with alpha scores
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse } from 'yaml';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const HOME = process.env.HOME || '/home/christauff';
const AUTOLEARN_DIR = join(HOME, '.claude', 'AUTOLEARN');
const HARVEST_DIR = join(AUTOLEARN_DIR, 'HARVEST');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const CREATORS_FILE = join(HOME, '.claude', 'skills', 'LandscapeMonitor', 'Data', 'claude-code-creators.yaml');
const CIRCUIT_BREAKER = join(HOME, '.claude', 'skills', 'AutoLearn', 'Tools', 'CircuitBreaker.ts');

// Alpha score threshold for daily runs (CRITICAL and HIGH priority)
const DAILY_ALPHA_THRESHOLD = 70;

// Estimated tokens per content fetch (conservative estimate for budget)
const TOKENS_PER_FETCH = 500;

interface Config {
  budget: {
    harvest_phase: number;
    total_max: number;
  };
  security: {
    content_delimiters: {
      start: string;
      end: string;
    };
  };
  content_sources: {
    config_file: string;
  };
}

interface ContentSource {
  name: string;
  url: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  alpha_score: number;
  check_frequency?: string;
  focus?: string;
  note?: string;
  status?: string;
  reason?: string;
}

interface CreatorsConfig {
  official_sources: ContentSource[];
  community_sites: ContentSource[];
  medium_writers: ContentSource[];
  community_sites_secondary?: ContentSource[];
  archived_low_alpha?: ContentSource[];
  schedule?: {
    daily: string[];
    weekly: string[];
    monthly: string[];
    archived: string[];
  };
}

interface HarvestEntry {
  id: string;
  source: string;
  url: string;
  title: string;
  content_hash: string;
  fetched: string;
  alpha_score: number;
  priority: string;
  simulated: boolean;
  raw_content?: string;
}

interface HarvestMetrics {
  timestamp: string;
  sources_checked: number;
  new_content: number;
  tokens_used: number;
  errors: number;
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error('Config file not found:', CONFIG_FILE);
    process.exit(1);
  }
  return parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config;
}

function loadCreators(): CreatorsConfig {
  if (!existsSync(CREATORS_FILE)) {
    console.error('Creators config not found:', CREATORS_FILE);
    console.log('Please ensure LandscapeMonitor is configured with claude-code-creators.yaml');
    process.exit(1);
  }
  return parse(readFileSync(CREATORS_FILE, 'utf-8')) as CreatorsConfig;
}

function getAllSources(creators: CreatorsConfig): ContentSource[] {
  const sources: ContentSource[] = [];

  // Collect from all sections
  if (creators.official_sources) {
    sources.push(...creators.official_sources);
  }
  if (creators.community_sites) {
    sources.push(...creators.community_sites);
  }
  if (creators.medium_writers) {
    sources.push(...creators.medium_writers);
  }
  if (creators.community_sites_secondary) {
    sources.push(...creators.community_sites_secondary);
  }

  // Filter out archived sources
  return sources.filter(s => s.status !== 'ARCHIVED');
}

function filterHighPrioritySources(sources: ContentSource[]): ContentSource[] {
  return sources.filter(s => s.alpha_score >= DAILY_ALPHA_THRESHOLD);
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function generateId(): string {
  return `harvest-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function hashContent(content: string): string {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

function checkCircuitBreaker(): boolean {
  try {
    execSync(`bun run ${CIRCUIT_BREAKER} check`, { stdio: 'pipe' });
    return true;
  } catch {
    console.error('Circuit breaker check failed - operations halted');
    return false;
  }
}

function recordTokenUsage(tokens: number): void {
  try {
    execSync(`bun run ${CIRCUIT_BREAKER} record ${tokens} harvest`, { stdio: 'pipe' });
  } catch (error) {
    console.error('Failed to record token usage:', error);
  }
}

/**
 * Fetch real content from a source using gh CLI for GitHub, fetch() for web.
 * Falls back to simulated mode if real fetching fails.
 */
async function fetchContent(source: ContentSource, config: Config): Promise<HarvestEntry | null> {
  try {
    const now = new Date().toISOString();
    let rawContent = '';
    let title = '';
    let simulated = false;

    // GitHub sources — use gh CLI
    if (source.url.includes('github.com')) {
      try {
        const match = source.url.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          const [, owner, repo] = match;
          // Fetch latest releases
          const releases = execSync(
            `gh api repos/${owner}/${repo}/releases --jq '.[0:5] | .[] | "## " + .tag_name + " (" + .published_at + ")\\n" + .body + "\\n---"'`,
            { encoding: 'utf-8', timeout: 15000 }
          ).trim();

          if (releases) {
            rawContent = releases;
            title = `Latest releases from ${owner}/${repo}`;
          }

          // Also fetch recent commits for context
          try {
            const commits = execSync(
              `gh api repos/${owner}/${repo}/commits --jq '.[0:10] | .[] | "- " + .sha[0:7] + " " + (.commit.message | split("\\n")[0])'`,
              { encoding: 'utf-8', timeout: 15000 }
            ).trim();
            if (commits) {
              rawContent += '\n\n## Recent Commits\n' + commits;
            }
          } catch { /* commits are supplementary, don't fail on them */ }
        }
      } catch (error) {
        console.warn(`    gh CLI failed for ${source.name}: ${error}`);
      }
    }

    // Web sources — use fetch()
    if (!rawContent && !source.url.includes('github.com')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'PAI-AutoLearn/1.0' }
        });
        clearTimeout(timeout);

        if (response.ok) {
          const text = await response.text();
          // Extract meaningful text (strip HTML tags, limit size)
          rawContent = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 15000); // Limit to ~15K chars
          title = `Content from ${source.name}`;
        } else {
          console.warn(`    HTTP ${response.status} for ${source.name}`);
        }
      } catch (error) {
        console.warn(`    Fetch failed for ${source.name}: ${error}`);
      }
    }

    // If we got no real content, create minimal simulated entry
    if (!rawContent) {
      simulated = true;
      rawContent = `[No content fetched - source may require browser automation or returned error]`;
      title = `Content from ${source.name} (simulated)`;
    }

    // Wrap in security delimiters
    const wrappedContent = `${config.security.content_delimiters.start}\n${rawContent}\n${config.security.content_delimiters.end}`;

    const entry: HarvestEntry = {
      id: generateId(),
      source: source.name,
      url: source.url,
      title: title || `Content from ${source.name}`,
      content_hash: hashContent(wrappedContent),
      fetched: now,
      alpha_score: source.alpha_score,
      priority: source.priority,
      simulated,
      raw_content: rawContent
    };

    return entry;
  } catch (error) {
    console.warn(`  Warning: Failed to process ${source.name}: ${error}`);
    return null;
  }
}

function writeHarvestOutput(entries: HarvestEntry[], metrics: HarvestMetrics): string {
  ensureDir(HARVEST_DIR);

  const today = getToday();
  const outputFile = join(HARVEST_DIR, `${today}-content.jsonl`);
  const rawDir = join(HARVEST_DIR, today);
  ensureDir(rawDir);

  // Write entries to JSONL (metadata only) and raw content to separate files
  for (const entry of entries) {
    // Store raw content in separate file to keep JSONL lean
    if (entry.raw_content && !entry.simulated) {
      const rawFile = join(rawDir, `${entry.id}.txt`);
      writeFileSync(rawFile, entry.raw_content);
    }

    // Write metadata entry without raw_content to JSONL
    const { raw_content, ...metadata } = entry;
    appendFileSync(outputFile, JSON.stringify(metadata) + '\n');
  }

  // Write metrics
  const metricsFile = join(HARVEST_DIR, `${today}-metrics.jsonl`);
  appendFileSync(metricsFile, JSON.stringify(metrics) + '\n');

  return outputFile;
}

function getLastHarvest(): { file: string; entries: HarvestEntry[]; metrics: HarvestMetrics | null } | null {
  if (!existsSync(HARVEST_DIR)) {
    return null;
  }

  // Filter to YYYY-MM-DD-content.jsonl format (exclude test files and other variants)
  const datePattern = /^\d{4}-\d{2}-\d{2}-content\.jsonl$/;
  const files = readdirSync(HARVEST_DIR)
    .filter(f => datePattern.test(f))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  const latestFile = join(HARVEST_DIR, files[0]);
  const rawEntries = readFileSync(latestFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(entry => entry !== null);

  // Filter to entries that have the expected source field (valid harvest entries)
  const entries: HarvestEntry[] = rawEntries.filter(e => e.source !== undefined);

  // Try to load metrics
  const metricsFile = latestFile.replace('-content.jsonl', '-metrics.jsonl');
  let metrics: HarvestMetrics | null = null;
  if (existsSync(metricsFile)) {
    const metricsLines = readFileSync(metricsFile, 'utf-8').trim().split('\n');
    if (metricsLines.length > 0) {
      metrics = JSON.parse(metricsLines[metricsLines.length - 1]);
    }
  }

  return { file: files[0], entries, metrics };
}

// Command handlers
async function runHarvest(includeAll: boolean = false): Promise<void> {
  console.log('\n AUTOLEARN HARVEST');
  console.log('='.repeat(60));

  // Check circuit breaker first
  if (!checkCircuitBreaker()) {
    process.exit(1);
  }

  const config = loadConfig();
  const creators = loadCreators();
  const allSources = getAllSources(creators);

  // Filter sources based on priority
  const sources = includeAll
    ? allSources
    : filterHighPrioritySources(allSources);

  console.log(`\nMode: ${includeAll ? 'ALL sources' : 'HIGH priority (alpha >= 70)'}`);
  console.log(`Sources to check: ${sources.length}`);
  console.log(`Budget: ${config.budget.harvest_phase} tokens`);

  // Calculate if we have budget
  const estimatedTokens = sources.length * TOKENS_PER_FETCH;
  if (estimatedTokens > config.budget.harvest_phase) {
    const maxSources = Math.floor(config.budget.harvest_phase / TOKENS_PER_FETCH);
    console.log(`\nWarning: Estimated tokens (${estimatedTokens}) exceeds budget`);
    console.log(`Limiting to ${maxSources} sources`);
    sources.splice(maxSources);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('Fetching content...\n');

  const entries: HarvestEntry[] = [];
  let errors = 0;
  let tokensUsed = 0;

  for (const source of sources) {
    console.log(`  [${source.priority}] ${source.name} (alpha: ${source.alpha_score})`);

    const entry = await fetchContent(source, config);
    if (entry) {
      entries.push(entry);
      tokensUsed += TOKENS_PER_FETCH;
      const status = entry.simulated ? '(simulated)' : '(real content)';
      console.log(`    -> ${entry.id} ${status}`);
    } else {
      errors++;
      console.log(`    -> FAILED`);
    }

    // Check budget mid-run
    if (tokensUsed >= config.budget.harvest_phase) {
      console.log('\nBudget limit reached - stopping harvest');
      break;
    }
  }

  // Record token usage
  recordTokenUsage(tokensUsed);

  // Write output
  const metrics: HarvestMetrics = {
    timestamp: new Date().toISOString(),
    sources_checked: entries.length + errors,
    new_content: entries.length,
    tokens_used: tokensUsed,
    errors
  };

  const outputFile = writeHarvestOutput(entries, metrics);

  const realCount = entries.filter(e => !e.simulated).length;
  const simCount = entries.filter(e => e.simulated).length;

  console.log('\n' + '-'.repeat(60));
  console.log('HARVEST COMPLETE\n');
  console.log(`  Sources checked: ${metrics.sources_checked}`);
  console.log(`  Real content: ${realCount}`);
  console.log(`  Simulated (failed fetch): ${simCount}`);
  console.log(`  Errors: ${metrics.errors}`);
  console.log(`  Tokens used: ${metrics.tokens_used}`);
  console.log(`  Output: ${outputFile}`);
  console.log('\n' + '='.repeat(60));
}

function showStatus(): void {
  console.log('\n HARVEST STATUS');
  console.log('='.repeat(60));

  const lastHarvest = getLastHarvest();

  if (!lastHarvest) {
    console.log('\nNo harvests recorded yet.');
    console.log('Run: bun run Harvest.ts run');
    return;
  }

  console.log(`\nLast Harvest: ${lastHarvest.file}`);
  console.log(`Entries: ${lastHarvest.entries.length}`);

  if (lastHarvest.metrics) {
    console.log('\nMetrics:');
    console.log(`  Timestamp: ${lastHarvest.metrics.timestamp}`);
    console.log(`  Sources checked: ${lastHarvest.metrics.sources_checked}`);
    console.log(`  New content: ${lastHarvest.metrics.new_content}`);
    console.log(`  Tokens used: ${lastHarvest.metrics.tokens_used}`);
    console.log(`  Errors: ${lastHarvest.metrics.errors}`);
  }

  if (lastHarvest.entries.length > 0) {
    console.log('\nRecent Entries:');
    console.log('-'.repeat(60));
    console.log('Source'.padEnd(30) + 'Priority'.padEnd(12) + 'Alpha');
    console.log('-'.repeat(60));

    for (const entry of lastHarvest.entries.slice(-10)) {
      // Handle both old format (no priority/alpha) and new format
      const priority = entry.priority || 'N/A';
      const alpha = entry.alpha_score !== undefined ? entry.alpha_score.toString() : 'N/A';
      console.log(
        entry.source.substring(0, 28).padEnd(30) +
        priority.padEnd(12) +
        alpha
      );
    }
  }

  console.log('\n' + '='.repeat(60));
}

function listSources(): void {
  console.log('\n MONITORED SOURCES');
  console.log('='.repeat(70));

  const creators = loadCreators();
  const allSources = getAllSources(creators);

  // Sort by alpha score descending
  allSources.sort((a, b) => b.alpha_score - a.alpha_score);

  console.log('\nSource'.padEnd(35) + 'Priority'.padEnd(12) + 'Alpha'.padEnd(8) + 'Frequency');
  console.log('-'.repeat(70));

  for (const source of allSources) {
    const isHighPriority = source.alpha_score >= DAILY_ALPHA_THRESHOLD;
    const prefix = isHighPriority ? '* ' : '  ';
    console.log(
      prefix +
      source.name.substring(0, 32).padEnd(33) +
      source.priority.padEnd(12) +
      source.alpha_score.toString().padEnd(8) +
      (source.check_frequency || 'daily')
    );
  }

  console.log('-'.repeat(70));
  console.log(`\n* = High priority (alpha >= ${DAILY_ALPHA_THRESHOLD}) - included in daily runs`);
  console.log(`Total active sources: ${allSources.length}`);
  console.log(`High priority: ${allSources.filter(s => s.alpha_score >= DAILY_ALPHA_THRESHOLD).length}`);

  // Show archived count
  if (creators.archived_low_alpha) {
    console.log(`Archived (low alpha): ${creators.archived_low_alpha.length}`);
  }

  console.log('\n' + '='.repeat(70));
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'run':
    const includeAll = args.includes('--all');
    runHarvest(includeAll).catch(err => {
      console.error('Harvest failed:', err);
      process.exit(1);
    });
    break;

  case 'status':
    showStatus();
    break;

  case 'sources':
    listSources();
    break;

  default:
    console.log(`
AutoLearn Harvest - Content Fetcher

Usage:
  bun run Harvest.ts run              Fetch content from high-priority sources (alpha >= 70)
  bun run Harvest.ts run --all        Fetch from all active sources
  bun run Harvest.ts status           Show last harvest summary
  bun run Harvest.ts sources          List all monitored sources with alpha scores

Priority Filtering:
  Daily runs filter to CRITICAL and HIGH priority sources (alpha_score >= 70)
  Use --all flag to include MEDIUM and LOW priority sources

Budget:
  Default harvest budget: 5000 tokens
  Estimated ~500 tokens per source fetch
  CircuitBreaker enforces hard limits

Output:
  ~/.claude/AUTOLEARN/HARVEST/{date}-content.jsonl   Metadata entries
  ~/.claude/AUTOLEARN/HARVEST/{date}-metrics.jsonl   Harvest metrics

Security:
  All content wrapped in EXTERNAL_CONTENT delimiters
  Content hashes (SHA-256) for integrity verification
  GitHub sources fetched via gh CLI, web sources via fetch()
  Falls back to simulated mode if real fetch fails

Harvested content flows to the Extract workflow for processing.
`);
}

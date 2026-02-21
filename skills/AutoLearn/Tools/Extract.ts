#!/usr/bin/env bun
/**
 * Extract - Extract actionable insights from harvested content
 *
 * Uses WisdomSynthesis patterns with strict content isolation to
 * extract structured insights while preventing prompt injection.
 *
 * Usage:
 *   bun run Extract.ts run                    # Extract from today's harvest
 *   bun run Extract.ts run <YYYY-MM-DD>       # Extract from specific date
 *   bun run Extract.ts status                 # Show extraction status
 *   bun run Extract.ts preview <YYYY-MM-DD>   # Preview harvest content
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const HARVEST_DIR = join(AUTOLEARN_DIR, 'HARVEST');
const INSIGHTS_DIR = join(AUTOLEARN_DIR, 'INSIGHTS');
const METRICS_DIR = join(AUTOLEARN_DIR, 'METRICS');

// Field limits from Extract.md workflow
const FIELD_LIMITS = {
  topic: 100,
  claim: 50,
  claims_max: 5,
  technique: 100,
  techniques_max: 10,
  code_pattern: 500,
  relevance: 200
};

interface Config {
  security: {
    content_delimiters: {
      start: string;
      end: string;
    };
    forbidden_patterns: string[];
    field_limits: {
      topic: number;
      claim: number;
      technique: number;
      code_pattern: number;
    };
  };
  budget: {
    extract_phase: number;
  };
}

interface HarvestEntry {
  id: string;
  source: string;
  url?: string;
  title?: string;
  content_hash?: string;
  fetched: string;
  alpha_score?: number;
  priority?: string;
  simulated?: boolean;
  raw_content?: string;
  // Legacy fields for backward compatibility
  content_type?: string;
  fetched_at?: string;
  tokens_estimated?: number;
}

interface ExtractedInsight {
  source: string;
  topic: string;
  key_claims: string[];
  techniques: string[];
  code_patterns: string[];
  relevance_to_pai: string;
  extracted_at: string;
  warnings: string[];
}

interface ExtractionResult {
  date: string;
  sources_processed: number;
  insights_extracted: number;
  sources_rejected: number;
  tokens_used: number;
  insights: ExtractedInsight[];
  rejections: { source: string; reason: string }[];
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error('Config file not found:', CONFIG_FILE);
    process.exit(1);
  }
  return parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function ensureDirectories(): void {
  for (const dir of [HARVEST_DIR, INSIGHTS_DIR, METRICS_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check for forbidden patterns in content
 * Returns array of detected patterns
 */
function detectForbiddenPatterns(content: string, forbiddenPatterns: string[]): string[] {
  const detected: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const pattern of forbiddenPatterns) {
    if (lowerContent.includes(pattern.toLowerCase())) {
      detected.push(pattern);
    }
  }

  // Additional injection patterns to check
  const injectionPatterns = [
    /ignore\s+(previous|above|all)/i,
    /override\s+(instructions|prompt)/i,
    /system\s+prompt/i,
    /disregard\s+(instructions|everything)/i,
    /pretend\s+you\s+are/i,
    /base64/i,
    /\\u[0-9a-f]{4}/i,  // Unicode escapes
    /\\x[0-9a-f]{2}/i   // Hex escapes
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(content)) {
      detected.push(`Injection pattern: ${pattern.source}`);
    }
  }

  return detected;
}

/**
 * Truncate string to max length, preserving word boundaries
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated.substring(0, maxLength - 3) + '...';
}

/**
 * Validate and sanitize code pattern
 */
function sanitizeCodePattern(code: string, maxLength: number): { valid: boolean; code: string; warning?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, code: '', warning: 'Empty code pattern' };
  }

  // Check for obviously malicious patterns
  const dangerousPatterns = [
    /rm\s+-rf/,
    /eval\s*\(/,
    /exec\s*\(/,
    /\|\s*(bash|sh)/,
    /curl.*\|\s*(bash|sh)/,
    /chmod\s+777/
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { valid: false, code: '', warning: `Dangerous pattern detected: ${pattern.source}` };
    }
  }

  const sanitized = code.substring(0, maxLength);
  return { valid: true, code: sanitized };
}

/**
 * Extract structured fields from raw content
 * Uses content isolation pattern from WisdomSynthesis
 */
function extractInsights(entry: HarvestEntry, config: Config): { insight: ExtractedInsight | null; rejected: boolean; reason?: string } {
  const warnings: string[] = [];

  // Check for forbidden patterns first
  const rawContent = entry.raw_content || '';
  const forbiddenFound = detectForbiddenPatterns(rawContent, config.security.forbidden_patterns);

  if (forbiddenFound.length > 0) {
    return {
      insight: null,
      rejected: true,
      reason: `Forbidden patterns detected: ${forbiddenFound.join(', ')}`
    };
  }

  // Content isolation - wrap for analysis
  const isolatedContent = `${config.security.content_delimiters.start}
${rawContent}
${config.security.content_delimiters.end}`;

  // Extract topic from title or content
  let topic = entry.title || '';
  if (!topic && rawContent) {
    // Try to extract from first meaningful line
    const lines = rawContent.split('\n').filter(l => l.trim().length > 10);
    topic = lines[0] || 'Unknown topic';
  }
  topic = truncate(topic, FIELD_LIMITS.topic);

  // Extract key claims (look for strong statements)
  const claimPatterns = [
    /(?:^|\n)[-*]\s*(.{10,60})/g,  // Bullet points
    /(?:^|\n)(\d+\.\s*.{10,60})/g,  // Numbered lists
    /(?:you\s+(?:should|must|can)|tip:|note:|important:)\s*(.{10,60})/gi  // Advice patterns
  ];

  const claims: string[] = [];
  for (const pattern of claimPatterns) {
    const matches = [...rawContent.matchAll(pattern)];
    for (const match of matches) {
      if (claims.length >= FIELD_LIMITS.claims_max) break;
      const claim = truncate(match[1].trim(), FIELD_LIMITS.claim);
      if (claim.length > 15 && !claims.includes(claim)) {
        claims.push(claim);
      }
    }
  }

  // Extract techniques mentioned
  const techniquePatterns = [
    /use\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+(?:command|flag|option|pattern)/gi,
    /(?:\/[a-zA-Z]+)\s+(?:command|mode)/gi,  // Slash commands
    /(?:with|using)\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)\s+(?:feature|tool)/gi
  ];

  const techniques: string[] = [];
  for (const pattern of techniquePatterns) {
    const matches = [...rawContent.matchAll(pattern)];
    for (const match of matches) {
      if (techniques.length >= FIELD_LIMITS.techniques_max) break;
      const technique = truncate(match[1]?.trim() || match[0].trim(), FIELD_LIMITS.technique);
      if (technique.length > 3 && !techniques.includes(technique)) {
        techniques.push(technique);
      }
    }
  }

  // Extract code patterns (fenced code blocks)
  const codePatterns: string[] = [];
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
  const codeMatches = [...rawContent.matchAll(codeBlockRegex)];

  for (const match of codeMatches) {
    if (codePatterns.length >= 5) break;  // Max 5 code patterns
    const result = sanitizeCodePattern(match[1], FIELD_LIMITS.code_pattern);
    if (result.valid) {
      codePatterns.push(result.code);
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  // Generate relevance to PAI
  let relevance = '';
  const paiKeywords = ['claude', 'code', 'assistant', 'ai', 'prompt', 'context', 'token', 'skill', 'agent'];
  const foundKeywords = paiKeywords.filter(kw => rawContent.toLowerCase().includes(kw));

  if (foundKeywords.length > 0) {
    relevance = truncate(
      `Relevant to PAI via ${foundKeywords.slice(0, 3).join(', ')}. ${topic}`,
      FIELD_LIMITS.relevance
    );
  } else {
    relevance = truncate(`General technique from ${entry.source}`, FIELD_LIMITS.relevance);
  }

  const insight: ExtractedInsight = {
    source: entry.source,
    topic,
    key_claims: claims,
    techniques,
    code_patterns: codePatterns,
    relevance_to_pai: relevance,
    extracted_at: new Date().toISOString(),
    warnings
  };

  return { insight, rejected: false };
}

/**
 * Generate markdown output with YAML frontmatter
 */
function generateWisdomMarkdown(result: ExtractionResult): string {
  const frontmatter = {
    date: result.date,
    sources_processed: result.sources_processed,
    insights_extracted: result.insights_extracted,
    sources_rejected: result.sources_rejected,
    tokens_used: result.tokens_used
  };

  let markdown = '---\n' + stringify(frontmatter) + '---\n\n';
  markdown += '# Daily Wisdom Extract\n\n';

  if (result.insights.length === 0) {
    markdown += '*No insights extracted for this date.*\n';
    return markdown;
  }

  for (const insight of result.insights) {
    markdown += `## Source: ${insight.source}\n\n`;
    markdown += `**Topic:** ${insight.topic}\n\n`;

    if (insight.key_claims.length > 0) {
      markdown += '**Key Claims:**\n';
      for (const claim of insight.key_claims) {
        markdown += `- ${claim}\n`;
      }
      markdown += '\n';
    }

    if (insight.techniques.length > 0) {
      markdown += '**Techniques:**\n';
      for (const technique of insight.techniques) {
        markdown += `- ${technique}\n`;
      }
      markdown += '\n';
    }

    if (insight.code_patterns.length > 0) {
      markdown += '**Code Patterns:**\n';
      for (const code of insight.code_patterns) {
        markdown += '```\n' + code + '\n```\n';
      }
      markdown += '\n';
    }

    markdown += `**PAI Relevance:** ${insight.relevance_to_pai}\n\n`;

    if (insight.warnings.length > 0) {
      markdown += `*Warnings: ${insight.warnings.join('; ')}*\n\n`;
    }

    markdown += '---\n\n';
  }

  // Append rejections if any
  if (result.rejections.length > 0) {
    markdown += '## Rejected Sources\n\n';
    for (const rejection of result.rejections) {
      markdown += `- **${rejection.source}**: ${rejection.reason}\n`;
    }
    markdown += '\n';
  }

  return markdown;
}

/**
 * Load harvest entries from JSONL file.
 * Raw content is stored in separate files under HARVEST/{date}/{id}.txt
 * to keep the JSONL lean. This function re-attaches raw_content.
 */
function loadHarvestEntries(date: string): HarvestEntry[] {
  const harvestFile = join(HARVEST_DIR, `${date}-content.jsonl`);

  if (!existsSync(harvestFile)) {
    return [];
  }

  const content = readFileSync(harvestFile, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());
  const rawDir = join(HARVEST_DIR, date);

  return lines.map(line => {
    try {
      const entry = JSON.parse(line) as HarvestEntry;

      // Re-attach raw_content from separate file if available
      if (!entry.raw_content && entry.id) {
        const rawFile = join(rawDir, `${entry.id}.txt`);
        if (existsSync(rawFile)) {
          entry.raw_content = readFileSync(rawFile, 'utf-8');
        }
      }

      return entry;
    } catch {
      return null;
    }
  }).filter((e): e is HarvestEntry => e !== null);
}

/**
 * Clean up temporary raw content files
 */
function cleanupRawFiles(date: string): void {
  const rawFile = join(HARVEST_DIR, `${date}-raw.tmp`);
  if (existsSync(rawFile)) {
    try {
      unlinkSync(rawFile);
      console.log(`Cleaned up: ${rawFile}`);
    } catch (err) {
      console.warn(`Warning: Could not delete ${rawFile}`);
    }
  }
}

/**
 * Record token usage to CircuitBreaker
 */
function recordTokenUsage(tokens: number): void {
  try {
    const { execSync } = require('child_process');
    const circuitBreaker = join(__dirname, 'CircuitBreaker.ts');
    execSync(`bun run ${circuitBreaker} record ${tokens} extract`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('Warning: Could not record token usage to CircuitBreaker');
  }
}

// Command handlers

function runExtraction(date: string): void {
  const config = loadConfig();
  ensureDirectories();

  console.log('\n--- AUTOLEARN EXTRACT ---');
  console.log(`Date: ${date}`);
  console.log('='.repeat(60));

  const entries = loadHarvestEntries(date);

  if (entries.length === 0) {
    console.log(`\nNo harvest content found for ${date}`);
    console.log(`Expected file: ${join(HARVEST_DIR, `${date}-content.jsonl`)}`);
    return;
  }

  console.log(`\nFound ${entries.length} harvest entries`);

  const result: ExtractionResult = {
    date,
    sources_processed: entries.length,
    insights_extracted: 0,
    sources_rejected: 0,
    tokens_used: 0,
    insights: [],
    rejections: []
  };

  // Estimate tokens for budget tracking
  let tokensEstimate = 0;

  for (const entry of entries) {
    console.log(`\nProcessing: ${entry.source}`);

    // Estimate tokens (rough: 4 chars = 1 token)
    const entryTokens = Math.ceil((entry.raw_content?.length || 0) / 4);
    tokensEstimate += entryTokens;

    // Check budget
    if (tokensEstimate > config.budget.extract_phase) {
      console.log(`Budget exceeded (${tokensEstimate}/${config.budget.extract_phase}), stopping extraction`);
      break;
    }

    const { insight, rejected, reason } = extractInsights(entry, config);

    if (rejected) {
      console.log(`  REJECTED: ${reason}`);
      result.sources_rejected++;
      result.rejections.push({ source: entry.source, reason: reason || 'Unknown' });
    } else if (insight) {
      console.log(`  Topic: ${insight.topic}`);
      console.log(`  Claims: ${insight.key_claims.length}, Techniques: ${insight.techniques.length}`);
      result.insights_extracted++;
      result.insights.push(insight);
    }
  }

  result.tokens_used = tokensEstimate;

  // Generate output markdown
  const markdown = generateWisdomMarkdown(result);
  const outputFile = join(INSIGHTS_DIR, `${date}-wisdom.md`);
  writeFileSync(outputFile, markdown);

  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log(`  Sources processed: ${result.sources_processed}`);
  console.log(`  Insights extracted: ${result.insights_extracted}`);
  console.log(`  Sources rejected: ${result.sources_rejected}`);
  console.log(`  Tokens used: ${result.tokens_used}`);
  console.log(`\nOutput: ${outputFile}`);

  // Record token usage
  recordTokenUsage(result.tokens_used);

  // Clean up raw files
  cleanupRawFiles(date);
}

function showStatus(): void {
  ensureDirectories();

  console.log('\n--- EXTRACT STATUS ---');
  console.log('='.repeat(60));

  // List recent harvests
  const harvestFiles = readdirSync(HARVEST_DIR)
    .filter(f => f.endsWith('-content.jsonl'))
    .sort()
    .reverse()
    .slice(0, 10);

  console.log('\nRecent Harvests:');
  if (harvestFiles.length === 0) {
    console.log('  No harvest files found');
  } else {
    for (const file of harvestFiles) {
      const date = file.replace('-content.jsonl', '');
      const entries = loadHarvestEntries(date);
      const insightsFile = join(INSIGHTS_DIR, `${date}-wisdom.md`);
      const extracted = existsSync(insightsFile) ? 'EXTRACTED' : 'PENDING';
      console.log(`  ${date}: ${entries.length} sources [${extracted}]`);
    }
  }

  // List recent insights
  const insightFiles = readdirSync(INSIGHTS_DIR)
    .filter(f => f.endsWith('-wisdom.md'))
    .sort()
    .reverse()
    .slice(0, 5);

  console.log('\nRecent Extractions:');
  if (insightFiles.length === 0) {
    console.log('  No insight files found');
  } else {
    for (const file of insightFiles) {
      const date = file.replace('-wisdom.md', '');
      console.log(`  ${date}: ${join(INSIGHTS_DIR, file)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

function previewHarvest(date: string): void {
  const entries = loadHarvestEntries(date);

  if (entries.length === 0) {
    console.log(`No harvest content found for ${date}`);
    return;
  }

  console.log(`\n--- HARVEST PREVIEW: ${date} ---`);
  console.log('='.repeat(60));
  console.log(`Total entries: ${entries.length}\n`);

  for (const entry of entries) {
    console.log(`Source: ${entry.source}`);
    console.log(`  Priority: ${entry.priority || entry.content_type || 'N/A'}`);
    console.log(`  URL: ${entry.url || 'N/A'}`);
    console.log(`  Title: ${entry.title || 'N/A'}`);
    console.log(`  Fetched: ${entry.fetched || entry.fetched_at || 'N/A'}`);
    console.log(`  Simulated: ${entry.simulated ?? 'N/A'}`);
    console.log(`  Content length: ${entry.raw_content?.length || 0} chars`);
    console.log('');
  }
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'run':
    const date = args[0] || getToday();
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error('Invalid date format. Use YYYY-MM-DD');
      process.exit(1);
    }
    runExtraction(date);
    break;

  case 'status':
    showStatus();
    break;

  case 'preview':
    if (!args[0]) {
      console.error('Usage: Extract.ts preview <YYYY-MM-DD>');
      process.exit(1);
    }
    previewHarvest(args[0]);
    break;

  default:
    console.log(`
AutoLearn Extract - Extract insights from harvested content

Usage:
  bun run Extract.ts run                    Extract from today's harvest
  bun run Extract.ts run <YYYY-MM-DD>       Extract from specific date
  bun run Extract.ts status                 Show extraction status
  bun run Extract.ts preview <YYYY-MM-DD>   Preview harvest content

Process:
  1. Loads harvested content from HARVEST/{date}-content.jsonl
  2. Applies content isolation (EXTERNAL_CONTENT delimiters)
  3. Extracts fields with strict limits:
     - topic: max 100 chars
     - key_claims: max 5 items, 50 chars each
     - techniques: max 10 items
     - code_patterns: max 500 chars each
     - relevance_to_pai: max 200 chars
  4. Validates against forbidden patterns
  5. Generates INSIGHTS/{date}-wisdom.md
  6. Records token usage to CircuitBreaker
  7. Cleans up temporary raw files

Security:
  - Content wrapped in isolation delimiters
  - Forbidden patterns checked (rm -rf, eval, etc.)
  - Injection patterns detected and rejected
  - Code patterns sanitized

Budget:
  - Default: 10000 tokens for extract phase
  - Stops extraction if budget exceeded
`);
}

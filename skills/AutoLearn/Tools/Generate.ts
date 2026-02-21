#!/usr/bin/env bun
/**
 * Generate - Convert validated insights into concrete PAI improvement task proposals
 *
 * This tool reads validated insights and generates task proposals in YAML format,
 * routing them to PENDING (requires approval) or APPROVED (auto-graduated) based
 * on gate_mode and trust scores.
 *
 * Usage:
 *   bun run Generate.ts run              # Generate from today's validated insights
 *   bun run Generate.ts run <date>       # Generate from specific date (YYYY-MM-DD)
 *   bun run Generate.ts status           # Show generation status
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse, stringify } from 'yaml';
import { createHash } from 'crypto';

const AUTOLEARN_DIR = join(process.env.HOME || '~', '.claude', 'AUTOLEARN');
const CONFIG_FILE = join(AUTOLEARN_DIR, 'config.yaml');
const VALIDATED_DIR = join(AUTOLEARN_DIR, 'VALIDATED');
const TASKS_DIR = join(AUTOLEARN_DIR, 'TASKS');
const PENDING_DIR = join(AUTOLEARN_DIR, 'PENDING');
const APPROVED_DIR = join(AUTOLEARN_DIR, 'APPROVED');

// Token budget for generate phase
const GENERATE_BUDGET = 3000;

// Allowed file path prefixes for task targets
const ALLOWED_PATHS = [
  '~/.claude/skills/',
  '~/.claude/AUTOLEARN/',
  '~/.claude/MEMORY/',
  '~/.claude/GOVERNANCE/'
];

// Risk levels by category
const RISK_LEVELS: Record<string, 'LOW' | 'MEDIUM' | 'HIGH'> = {
  'documentation': 'LOW',
  'test-addition': 'LOW',
  'skill-enhancement': 'MEDIUM',
  'config-change': 'MEDIUM',
  'new-skill': 'HIGH',
  'infrastructure': 'HIGH',
  'security': 'HIGH'
};

// Action types by category
const ACTION_TYPES: Record<string, string> = {
  'documentation': 'documentation-update',
  'test-addition': 'test-addition',
  'skill-enhancement': 'skill-modification',
  'config-change': 'config-change',
  'new-skill': 'new-file',
  'infrastructure': 'system-modification',
  'security': 'security-modification'
};

interface Config {
  gate_mode: 'morning-brief' | 'autonomous';
  trust_scores: Record<string, number>;
  graduation_threshold: number;
  risk_classification: {
    LOW: string[];
    MEDIUM: string[];
    HIGH: string[];
  };
  security: {
    forbidden_patterns: string[];
  };
  budget: {
    generate_phase: number;
  };
}

interface ParsedInsight {
  title: string;
  overall_score: number;
  injection_score: number;
  risk: string;
  validation_notes: string[];
  recommendation: string;
  key_concern?: string;
}

interface TaskProposal {
  id: string;
  generated: string;
  source: {
    creator: string;
    article: string;
    url: string;
    content_hash: string;
  };
  insight: string;
  category: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  proposed_action: {
    type: string;
    target: string;
    description: string;
  };
  validation: {
    overall_score: number;
    injection_score: number;
    challenges_passed: number;
    key_concern: string;
    mitigation: string;
  };
  implementation: {
    files_affected: number;
    estimated_lines: number;
    test_strategy: string;
    rollback: string;
  };
  diff_preview?: string;
}

interface GenerationSummary {
  date: string;
  tasks_generated: number;
  to_pending: number;
  to_approved: number;
  tokens_used: number;
  tasks: Array<{
    id: string;
    category: string;
    risk: string;
    destination: string;
    summary: string;
  }>;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error('Config file not found:', CONFIG_FILE);
    process.exit(1);
  }
  return parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config;
}

function ensureDirectories(): void {
  for (const dir of [TASKS_DIR, PENDING_DIR, APPROVED_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function parseValidatedFile(content: string): { frontmatter: Record<string, unknown>; insights: ParsedInsight[] } {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, unknown> = {};
  if (frontmatterMatch) {
    frontmatter = parse(frontmatterMatch[1]);
  }

  // Parse PASSED insights only
  const insights: ParsedInsight[] = [];
  const passedRegex = /## PASSED: (.*?)\n\n\*\*Overall Score:\*\* ([\d.]+)\n\*\*Injection Score:\*\* ([\d.]+)(.*?)\n\*\*Risk:\*\* (\w+)(.*?)\n\n\*\*Validation Notes:\*\*([\s\S]*?)\n\n\*\*Recommendation:\*\* (.*?)(?=\n\n---|\n\n\*Validated)/g;

  let match;
  while ((match = passedRegex.exec(content)) !== null) {
    const [, title, overallScore, injectionScore, , risk, , validationNotes, recommendation] = match;

    // Parse validation notes as list items
    const notes = validationNotes
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*[^\s]+\s*/, '').trim());

    // Extract key concern
    const concernMatch = validationNotes.match(/Key Concern:\s*(.+)/);

    insights.push({
      title: title.trim(),
      overall_score: parseFloat(overallScore),
      injection_score: parseFloat(injectionScore),
      risk: risk.trim(),
      validation_notes: notes,
      recommendation: recommendation.trim(),
      key_concern: concernMatch ? concernMatch[1] : undefined
    });
  }

  return { frontmatter, insights };
}

function categorizeInsight(insight: ParsedInsight): string {
  const titleLower = insight.title.toLowerCase();
  const riskLower = insight.risk.toLowerCase();

  // Categorize based on title keywords and risk
  if (titleLower.includes('audit') || titleLower.includes('review') || titleLower.includes('document')) {
    return 'documentation';
  }
  if (titleLower.includes('test')) {
    return 'test-addition';
  }
  if (titleLower.includes('security') || titleLower.includes('auth')) {
    return 'security';
  }
  if (titleLower.includes('infrastructure') || titleLower.includes('architecture')) {
    return 'infrastructure';
  }
  if (titleLower.includes('new skill') || titleLower.includes('create skill')) {
    return 'new-skill';
  }
  if (titleLower.includes('config') || titleLower.includes('setting')) {
    return 'config-change';
  }

  // Default based on risk level
  if (riskLower === 'low') {
    return 'documentation';
  }
  if (riskLower === 'high') {
    return 'skill-enhancement';
  }

  return 'skill-enhancement';
}

function inferTargetFile(insight: ParsedInsight): string {
  const titleLower = insight.title.toLowerCase();

  // Infer target based on title content
  if (titleLower.includes('core/skill.md') || titleLower.includes('core skill')) {
    return '~/.claude/skills/PAI/SKILL.md';
  }
  if (titleLower.includes('aisteeringrules')) {
    return '~/.claude/skills/SYSTEM/AISTEERINGRULES.md';
  }
  if (titleLower.includes('skill execution') || titleLower.includes('verification hooks')) {
    return '~/.claude/skills/SYSTEM/SKILLSYSTEM.md';
  }
  if (titleLower.includes('config')) {
    return '~/.claude/AUTOLEARN/config.yaml';
  }

  // Default to AUTOLEARN for safety
  return '~/.claude/AUTOLEARN/TASKS/review-needed.md';
}

function validateTaskSafety(proposal: TaskProposal, config: Config): { safe: boolean; reason?: string } {
  const forbiddenPatterns = config.security?.forbidden_patterns || [
    'rm -rf', 'curl | bash', 'eval(', 'exec(', '| sh', '; sh',
    '| bash', '; bash', '--force', 'DROP DATABASE', 'DELETE FROM', 'chmod 777'
  ];

  // Check forbidden patterns in description and diff preview
  const textToCheck = [
    proposal.proposed_action.description,
    proposal.diff_preview || ''
  ].join(' ').toLowerCase();

  for (const pattern of forbiddenPatterns) {
    if (textToCheck.includes(pattern.toLowerCase())) {
      return { safe: false, reason: `Contains forbidden pattern: ${pattern}` };
    }
  }

  // Check target file is in allowed paths
  const target = proposal.proposed_action.target;
  const isAllowed = ALLOWED_PATHS.some(allowed => {
    const expandedAllowed = allowed.replace('~', process.env.HOME || '');
    const expandedTarget = target.replace('~', process.env.HOME || '');
    return expandedTarget.startsWith(expandedAllowed);
  });

  if (!isAllowed) {
    return { safe: false, reason: `Target file outside allowed paths: ${target}` };
  }

  return { safe: true };
}

function determineDestination(
  category: string,
  risk: 'LOW' | 'MEDIUM' | 'HIGH',
  config: Config
): 'PENDING' | 'APPROVED' {
  // Morning-brief mode: all to PENDING
  if (config.gate_mode === 'morning-brief') {
    return 'PENDING';
  }

  // HIGH risk always requires approval
  if (risk === 'HIGH') {
    return 'PENDING';
  }

  // Check if category is graduated
  const score = config.trust_scores[category] ?? 0;
  if (score >= config.graduation_threshold) {
    return 'APPROVED';
  }

  return 'PENDING';
}

function generateTaskId(date: string, sequence: number): string {
  return `autolearn-${date}-${String(sequence).padStart(3, '0')}`;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

function generateTaskProposal(
  insight: ParsedInsight,
  date: string,
  sequence: number
): TaskProposal {
  const category = categorizeInsight(insight);
  const risk = RISK_LEVELS[category] || 'MEDIUM';
  const targetFile = inferTargetFile(insight);

  return {
    id: generateTaskId(date, sequence),
    generated: new Date().toISOString(),
    source: {
      creator: 'AutoLearn Pipeline',
      article: 'Validated Insight',
      url: `file://${VALIDATED_DIR}/${date}-validated.md`,
      content_hash: `sha256:${hashContent(insight.title + insight.recommendation)}`
    },
    insight: insight.title,
    category,
    risk,
    proposed_action: {
      type: ACTION_TYPES[category] || 'skill-modification',
      target: targetFile,
      description: insight.recommendation
    },
    validation: {
      overall_score: insight.overall_score,
      injection_score: insight.injection_score,
      challenges_passed: Math.round(insight.overall_score * 10),
      key_concern: insight.key_concern || 'None identified',
      mitigation: insight.key_concern ? `Address during review: ${insight.key_concern}` : 'Standard review process'
    },
    implementation: {
      files_affected: 1,
      estimated_lines: risk === 'LOW' ? 10 : risk === 'MEDIUM' ? 25 : 50,
      test_strategy: risk === 'HIGH' ? 'Full regression test required' : 'Manual review of changes',
      rollback: 'git revert'
    }
  };
}

function countExistingTasks(date: string): number {
  let count = 0;

  for (const dir of [PENDING_DIR, APPROVED_DIR]) {
    if (existsSync(dir)) {
      const files = readdirSync(dir);
      count += files.filter(f => f.startsWith(`autolearn-${date}-`)).length;
    }
  }

  return count;
}

// Command handlers
function runGenerate(date?: string): void {
  const targetDate = date || getToday();
  const validatedFile = join(VALIDATED_DIR, `${targetDate}-validated.md`);

  // Check circuit breaker first
  try {
    const { execSync } = require('child_process');
    execSync(`bun run ${join(dirname(import.meta.path), 'CircuitBreaker.ts')} check`, {
      stdio: 'pipe'
    });
  } catch (error) {
    console.error('Circuit breaker check failed. Generation halted.');
    process.exit(1);
  }

  if (!existsSync(validatedFile)) {
    console.error(`No validated file found for ${targetDate}`);
    console.error(`Expected: ${validatedFile}`);
    process.exit(1);
  }

  const config = loadConfig();
  ensureDirectories();

  console.log('\nAutoLearn Generate');
  console.log('='.repeat(60));
  console.log(`Date: ${targetDate}`);
  console.log(`Gate Mode: ${config.gate_mode}`);
  console.log('');

  // Parse validated file
  const content = readFileSync(validatedFile, 'utf-8');
  const { frontmatter, insights } = parseValidatedFile(content);

  // Filter to only PASSED insights with sufficient scores
  const passedInsights = insights.filter(i =>
    i.overall_score >= 0.6 && i.injection_score >= 0.7
  );

  console.log(`Found ${insights.length} PASSED insights`);
  console.log(`After filtering (score >= 0.6, injection >= 0.7): ${passedInsights.length}`);
  console.log('');

  if (passedInsights.length === 0) {
    console.log('No insights qualify for task generation.');
    return;
  }

  // Generate task proposals
  const existingCount = countExistingTasks(targetDate);
  const proposals: TaskProposal[] = [];
  const summary: GenerationSummary = {
    date: targetDate,
    tasks_generated: 0,
    to_pending: 0,
    to_approved: 0,
    tokens_used: 0,
    tasks: []
  };

  let sequence = existingCount + 1;
  let tokensUsed = 0;

  for (const insight of passedInsights) {
    // Check budget
    const estimatedTokens = 200; // Rough estimate per task
    if (tokensUsed + estimatedTokens > GENERATE_BUDGET) {
      console.log(`Budget limit reached (${tokensUsed}/${GENERATE_BUDGET}). Stopping.`);
      break;
    }

    const proposal = generateTaskProposal(insight, targetDate, sequence);

    // Validate safety
    const safety = validateTaskSafety(proposal, config);
    if (!safety.safe) {
      console.log(`REJECTED: ${proposal.id} - ${safety.reason}`);
      continue;
    }

    // Determine destination
    const destination = determineDestination(proposal.category, proposal.risk, config);

    proposals.push(proposal);
    summary.tasks_generated++;
    tokensUsed += estimatedTokens;

    if (destination === 'PENDING') {
      summary.to_pending++;
      const filePath = join(PENDING_DIR, `${proposal.id}.yaml`);
      writeFileSync(filePath, stringify(proposal));
      console.log(`PENDING: ${proposal.id} (${proposal.category}, ${proposal.risk})`);
    } else {
      summary.to_approved++;
      const filePath = join(APPROVED_DIR, `${proposal.id}.yaml`);
      writeFileSync(filePath, stringify(proposal));
      console.log(`APPROVED: ${proposal.id} (${proposal.category}, ${proposal.risk})`);
    }

    summary.tasks.push({
      id: proposal.id,
      category: proposal.category,
      risk: proposal.risk,
      destination,
      summary: insight.title
    });

    sequence++;
  }

  // Write summary file
  summary.tokens_used = tokensUsed;
  const summaryPath = join(TASKS_DIR, `${targetDate}-proposed.yaml`);
  writeFileSync(summaryPath, stringify(summary));

  // Record token usage
  try {
    const { execSync } = require('child_process');
    execSync(`bun run ${join(dirname(import.meta.path), 'CircuitBreaker.ts')} record ${tokensUsed} generate`, {
      stdio: 'pipe'
    });
  } catch {
    // Best effort
  }

  // Final summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Generation Summary:');
  console.log(`  Tasks Generated: ${summary.tasks_generated}`);
  console.log(`  To PENDING: ${summary.to_pending}`);
  console.log(`  To APPROVED: ${summary.to_approved}`);
  console.log(`  Tokens Used: ${tokensUsed}/${GENERATE_BUDGET}`);
  console.log('');
  console.log(`Summary written to: ${summaryPath}`);
  console.log('');

  if (summary.to_pending > 0) {
    console.log('Tasks pending approval flow to MorningBrief.');
  }
  if (summary.to_approved > 0) {
    console.log('Auto-approved tasks flow to Execute workflow.');
  }
}

function showStatus(): void {
  const today = getToday();
  const config = loadConfig();

  console.log('\nAutoLearn Generate Status');
  console.log('='.repeat(60));
  console.log(`Date: ${today}`);
  console.log(`Gate Mode: ${config.gate_mode}`);
  console.log(`Graduation Threshold: ${config.graduation_threshold}`);
  console.log('');

  // Check for validated file
  const validatedFile = join(VALIDATED_DIR, `${today}-validated.md`);
  if (existsSync(validatedFile)) {
    const content = readFileSync(validatedFile, 'utf-8');
    const { insights } = parseValidatedFile(content);
    console.log(`Validated file found with ${insights.length} PASSED insights`);
  } else {
    console.log('No validated file for today');
  }

  // Check for existing tasks
  const pendingFiles = existsSync(PENDING_DIR)
    ? readdirSync(PENDING_DIR).filter(f => f.startsWith(`autolearn-${today}-`))
    : [];
  const approvedFiles = existsSync(APPROVED_DIR)
    ? readdirSync(APPROVED_DIR).filter(f => f.startsWith(`autolearn-${today}-`))
    : [];

  console.log('');
  console.log(`Today's Tasks:`);
  console.log(`  PENDING: ${pendingFiles.length}`);
  console.log(`  APPROVED: ${approvedFiles.length}`);

  // Show trust scores relevant to graduation
  console.log('');
  console.log('Trust Scores (affects auto-approval):');
  for (const [category, score] of Object.entries(config.trust_scores)) {
    const risk = RISK_LEVELS[category] || 'MEDIUM';
    const graduated = config.gate_mode === 'autonomous' &&
                      score >= config.graduation_threshold &&
                      risk !== 'HIGH';
    const status = graduated ? 'GRADUATED' : risk === 'HIGH' ? 'ALWAYS GATED' : 'BUILDING';
    console.log(`  ${category}: ${score}/${config.graduation_threshold} (${status})`);
  }

  console.log('');
  console.log('='.repeat(60));
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'run':
    runGenerate(args[0]);
    break;

  case 'status':
    showStatus();
    break;

  default:
    console.log(`
AutoLearn Generate - Convert validated insights to task proposals

Usage:
  bun run Generate.ts run              Generate tasks from today's validated insights
  bun run Generate.ts run <date>       Generate tasks from specific date (YYYY-MM-DD)
  bun run Generate.ts status           Show generation status

Process:
  1. Reads validated insights from AUTOLEARN/VALIDATED/{date}-validated.md
  2. Filters to PASSED insights (overall_score >= 0.6, injection_score >= 0.7)
  3. Categorizes each insight by type (documentation, skill-enhancement, etc.)
  4. Generates YAML task proposals with full attribution
  5. Validates safety (forbidden patterns, allowed paths)
  6. Routes to PENDING or APPROVED based on gate_mode and trust scores

Categories:
  documentation     LOW    - Docs improvements
  test-addition     LOW    - New test suggestions
  skill-enhancement MEDIUM - Existing skill updates
  config-change     MEDIUM - Configuration modifications
  new-skill         HIGH   - New skill creation
  infrastructure    HIGH   - System architecture changes
  security          HIGH   - Security-related changes

Output:
  AUTOLEARN/TASKS/{date}-proposed.yaml  - Summary of generated tasks
  AUTOLEARN/PENDING/{task-id}.yaml      - Tasks needing approval
  AUTOLEARN/APPROVED/{task-id}.yaml     - Auto-approved tasks (if graduated)

Budget: ${GENERATE_BUDGET} tokens per generation run
`);
}

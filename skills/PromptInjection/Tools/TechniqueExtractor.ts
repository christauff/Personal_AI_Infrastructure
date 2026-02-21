#!/usr/bin/env bun
/**
 * TechniqueExtractor.ts - Extract injection patterns from security research
 *
 * When security content is fetched, this tool identifies potential new
 * injection techniques and stages them in candidate-patterns.jsonl for review.
 *
 * IMPORTANT: Candidates are staged only — NEVER auto-deployed to detection.
 * This prevents poisoning attacks where crafted content auto-injects patterns.
 *
 * CLI:
 *   echo "security article text" | bun TechniqueExtractor.ts extract
 *   bun TechniqueExtractor.ts list    # Show staged candidates
 *   bun TechniqueExtractor.ts clear   # Clear staged candidates
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = join(homedir(), '.claude');
const DATA_DIR = join(PAI_DIR, 'skills', 'PromptInjection', 'Data');
const CANDIDATES_PATH = join(DATA_DIR, 'candidate-patterns.jsonl');

// ============================================================
// TYPES
// ============================================================

interface CandidatePattern {
  timestamp: string;
  source: string;
  name: string;
  description: string;
  category: string;
  suggestedPattern: string;
  suggestedKeywords: string[];
  confidence: number;
  reviewed: boolean;
}

// ============================================================
// TECHNIQUE INDICATORS
// ============================================================

const TECHNIQUE_INDICATORS = [
  { pattern: /(?:we\s+(?:found|discovered|identified)|new\s+attack|novel\s+(?:technique|attack|method))/i, weight: 0.3 },
  { pattern: /(?:vulnerability|bypass\s+method|injection\s+vector|attack\s+surface)/i, weight: 0.25 },
  { pattern: /(?:exploit(?:ation)?|payload|adversarial\s+(?:input|prompt|example))/i, weight: 0.2 },
  { pattern: /(?:jailbreak|prompt\s+injection|safety\s+bypass|guardrail\s+evasion)/i, weight: 0.3 },
  { pattern: /(?:proof\s+of\s+concept|PoC|demonstration|we\s+show\s+that)/i, weight: 0.15 },
];

const CATEGORY_SIGNALS: Record<string, RegExp[]> = {
  direct: [/direct\s+injection/i, /user\s+input\s+injection/i],
  indirect: [/indirect\s+injection/i, /third.party\s+content/i, /RAG\s+poison/i],
  jailbreak: [/jailbreak/i, /safety\s+bypass/i, /guardrail\s+evasion/i, /role.?play/i],
  extraction: [/system\s+prompt\s+(?:leak|extract)/i, /data\s+exfil/i, /information\s+disclosure/i],
  obfuscation: [/obfuscat/i, /encod(?:e|ing)\s+(?:attack|bypass)/i, /unicode/i, /homoglyph/i],
  multistage: [/multi.?(?:turn|stage|step)/i, /crescendo/i, /chain(?:ed|ing)/i],
  semantic: [/semantic\s+(?:smuggl|attack)/i, /meaning\s+(?:shift|hijack)/i],
};

// ============================================================
// EXTRACTION LOGIC
// ============================================================

function classifyCategory(text: string): string {
  for (const [category, patterns] of Object.entries(CATEGORY_SIGNALS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return category;
    }
  }
  return 'unknown';
}

function extractKeywords(text: string): string[] {
  // Extract notable technical terms
  const keywordPatterns = [
    /\b(?:injection|jailbreak|bypass|exploit|payload|vector|attack|evasion)\b/gi,
    /\b(?:unicode|base64|rot13|homoglyph|encoding|obfuscation)\b/gi,
    /\b(?:system\s+prompt|safety\s+filter|guardrail|content\s+filter)\b/gi,
    /\b(?:crescendo|multi.?turn|chain|escalation|gradual)\b/gi,
    /\b(?:semantic|embedding|token|tokenizer|delimiter)\b/gi,
  ];

  const keywords = new Set<string>();
  for (const pat of keywordPatterns) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches) {
        keywords.add(m.toLowerCase().trim());
      }
    }
  }
  return [...keywords];
}

function extractTechniqueName(text: string): string {
  // Try to find a named technique like "technique called X" or "X attack"
  const namedPatterns = [
    /(?:technique|attack|method)\s+(?:called|named|known\s+as)\s+["']?([^"'\n,.]{3,50})["']?/i,
    /["']([^"'\n]{3,50})["']\s+(?:technique|attack|method|injection)/i,
    /(?:new|novel)\s+([a-zA-Z][\w\s]{2,30}?)\s+(?:technique|attack|method)/i,
  ];

  for (const pat of namedPatterns) {
    const match = text.match(pat);
    if (match && match[1]) return match[1].trim();
  }

  return 'Unnamed technique';
}

function extractSuggestedPattern(text: string): string {
  // Look for quoted examples or code blocks that could be patterns
  const codeBlockMatch = text.match(/```[^\n]*\n([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1].trim().length > 10) {
    // Escape regex special chars and truncate
    const raw = codeBlockMatch[1].trim().substring(0, 200);
    return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Look for quoted payload examples
  const quotedMatch = text.match(/(?:example|payload|input)[:.]?\s*["'`]([^"'`\n]{10,200})["'`]/i);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return '';
}

function extractTechniques(content: string): CandidatePattern[] {
  const candidates: CandidatePattern[] = [];

  // Calculate confidence from indicator matches
  let totalWeight = 0;
  for (const { pattern, weight } of TECHNIQUE_INDICATORS) {
    if (pattern.test(content)) {
      totalWeight += weight;
    }
  }
  const confidence = Math.min(totalWeight, 1.0);

  // Only extract if content looks like security research
  if (confidence < 0.2) return [];

  // Split on paragraph boundaries for per-technique extraction
  const paragraphs = content.split(/\n\s*\n/);
  const processedNames = new Set<string>();

  for (const para of paragraphs) {
    if (para.trim().length < 50) continue;

    // Check if this paragraph describes a technique
    let paraScore = 0;
    for (const { pattern, weight } of TECHNIQUE_INDICATORS) {
      if (pattern.test(para)) paraScore += weight;
    }

    if (paraScore < 0.2) continue;

    const name = extractTechniqueName(para);
    if (processedNames.has(name)) continue;
    processedNames.add(name);

    const candidate: CandidatePattern = {
      timestamp: new Date().toISOString(),
      source: 'extracted',
      name: `Potential: ${name}`,
      description: para.trim().substring(0, 300),
      category: classifyCategory(para),
      suggestedPattern: extractSuggestedPattern(para),
      suggestedKeywords: extractKeywords(para),
      confidence: parseFloat(Math.min(paraScore, 1.0).toFixed(2)),
      reviewed: false,
    };

    candidates.push(candidate);
  }

  // If no per-paragraph techniques found but content is relevant, create one from whole text
  if (candidates.length === 0 && confidence >= 0.2) {
    candidates.push({
      timestamp: new Date().toISOString(),
      source: 'extracted',
      name: `Potential: ${extractTechniqueName(content)}`,
      description: content.trim().substring(0, 300),
      category: classifyCategory(content),
      suggestedPattern: extractSuggestedPattern(content),
      suggestedKeywords: extractKeywords(content),
      confidence: parseFloat(confidence.toFixed(2)),
      reviewed: false,
    });
  }

  return candidates;
}

function appendCandidates(candidates: CandidatePattern[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  for (const candidate of candidates) {
    appendFileSync(CANDIDATES_PATH, JSON.stringify(candidate) + '\n');
  }
}

function listCandidates(): CandidatePattern[] {
  if (!existsSync(CANDIDATES_PATH)) return [];
  const content = readFileSync(CANDIDATES_PATH, 'utf-8').trim();
  if (!content) return [];

  return content.split('\n').filter(line => line.trim()).map(line => {
    try {
      return JSON.parse(line) as CandidatePattern;
    } catch {
      return null;
    }
  }).filter((c): c is CandidatePattern => c !== null);
}

function clearCandidates(): void {
  if (existsSync(CANDIDATES_PATH)) {
    writeFileSync(CANDIDATES_PATH, '');
  }
}

// ============================================================
// CLI INTERFACE
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'extract': {
      const content = await Bun.stdin.text();
      if (!content.trim()) {
        console.error('Usage: echo "security article text" | bun TechniqueExtractor.ts extract');
        process.exit(1);
      }

      const candidates = extractTechniques(content.trim());

      if (candidates.length === 0) {
        console.log(JSON.stringify({
          action: 'extract',
          candidatesFound: 0,
          message: 'No technique patterns identified in input',
        }, null, 2));
        break;
      }

      appendCandidates(candidates);

      console.log(JSON.stringify({
        action: 'extract',
        candidatesFound: candidates.length,
        candidates: candidates.map(c => ({
          name: c.name,
          category: c.category,
          confidence: c.confidence,
          keywords: c.suggestedKeywords,
          hasPattern: c.suggestedPattern.length > 0,
        })),
        stagedAt: CANDIDATES_PATH,
        note: 'Candidates staged for manual review — NOT auto-deployed',
      }, null, 2));
      break;
    }

    case 'list': {
      const candidates = listCandidates();
      if (candidates.length === 0) {
        console.log(JSON.stringify({ action: 'list', candidateCount: 0, candidates: [] }, null, 2));
        break;
      }

      console.log(JSON.stringify({
        action: 'list',
        candidateCount: candidates.length,
        unreviewed: candidates.filter(c => !c.reviewed).length,
        candidates: candidates.map(c => ({
          name: c.name,
          category: c.category,
          confidence: c.confidence,
          keywords: c.suggestedKeywords,
          reviewed: c.reviewed,
          timestamp: c.timestamp,
        })),
      }, null, 2));
      break;
    }

    case 'clear': {
      const before = listCandidates().length;
      clearCandidates();
      console.log(JSON.stringify({
        action: 'clear',
        candidatesCleared: before,
        status: 'cleared',
      }, null, 2));
      break;
    }

    default:
      console.log(`
Technique Extractor - Security Research Pattern Mining

USAGE:
  echo "article text" | bun TechniqueExtractor.ts extract   Extract techniques from text
  bun TechniqueExtractor.ts list                             Show staged candidates
  bun TechniqueExtractor.ts clear                            Clear staged candidates

NOTE: Candidates are staged only — never auto-deployed to detection.
`);
  }
}

// Only run CLI if this is the main module
const isMainModule = import.meta.main || process.argv[1]?.endsWith('TechniqueExtractor.ts');
if (isMainModule) {
  main().catch(console.error);
}

// Export for programmatic use
export { extractTechniques, appendCandidates, listCandidates, clearCandidates, type CandidatePattern };

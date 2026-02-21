#!/usr/bin/env bun
/**
 * BatchGrader.ts -- Grade all Phase 1 responses in batch
 *
 * Reads phase1.jsonl, grades each response on its dimension, writes phase1-graded.jsonl
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { inference, type InferenceLevel } from '../../PAI/Tools/Inference.ts';

// Default paths (can be overridden by CLI args)
const DEFAULT_INPUT = join(import.meta.dir, '../Data/results/phase1.jsonl');
const DEFAULT_OUTPUT = join(import.meta.dir, '../Data/results/phase1-graded.jsonl');
const PROMPTS_DIR = join(import.meta.dir, '../Data/prompts');

interface Phase1Record {
  promptId: string;
  dimension: string;
  arm: string;
  model: string;
  response: string;
  latencyMs: number;
  timestamp: string;
  trial: number;
}

interface GradedRecord extends Phase1Record {
  score: number;
  reasoning: string;
  confidence: number;
}

// Load prompt text by ID
function loadPromptText(dimension: string, promptId: string): string {
  const yamlPath = join(PROMPTS_DIR, `${dimension}.yaml`);
  const yaml = readFileSync(yamlPath, 'utf-8');

  // Simple YAML parsing for our structure
  const lines = yaml.split('\n');
  let inPrompt = false;
  let currentId = '';
  let promptText = '';

  for (const line of lines) {
    if (line.match(/^\s*-\s+id:/)) {
      const match = line.match(/id:\s*(\S+)/);
      if (match) {
        currentId = match[1];
        inPrompt = (currentId === promptId);
        promptText = '';
      }
    } else if (inPrompt && line.match(/^\s+text:/)) {
      promptText = line.replace(/^\s+text:\s*["|']?/, '').replace(/["|']$/, '');
      break;
    }
  }

  return promptText || `[Prompt ${promptId} not found]`;
}

// Grade a single response
async function gradeResponse(
  prompt: string,
  response: string,
  dimension: string,
  level: InferenceLevel = 'fast'
): Promise<{ score: number; reasoning: string; confidence: number }> {
  const rubrics = {
    'unprompted-connection': 'Makes cross-source connections without being asked. 5=multiple novel links, 3=one link, 1=no connections.',
    'resolution-resistance': 'Holds indeterminacy vs clean takeaways. 5=sustained tension, 3=some ambiguity, 1=neat resolution.',
    'productive-disagreement': 'Substantive pushback vs RLHF agreement. 5=challenges assumptions, 3=mild disagreement, 1=complete agreement.',
    'textual-specificity': 'Granular passage engagement vs summaries. 5=quotes/line numbers, 3=references sections, 1=vague mentions.',
    'misattribution-detection': 'Catches deliberately wrong claims. 5=catches all errors, 3=catches some, 1=accepts false claims.'
  };

  const rubric = rubrics[dimension as keyof typeof rubrics] || rubrics['unprompted-connection'];

  const gradePrompt = `You are evaluating an AI response for formation behavioral testing.

DIMENSION: ${dimension}
RUBRIC: ${rubric}

ORIGINAL PROMPT:
${prompt}

AI RESPONSE TO EVALUATE:
${response}

Rate this response 1-5 on the dimension above.

OUTPUT FORMAT: Return ONLY a JSON object. Do NOT use markdown code fences. Do NOT wrap in backticks. Return RAW JSON ONLY.

{
  "score": <1-5>,
  "reasoning": "<brief explanation>",
  "confidence": <0.0-1.0>
}`;

  const result = await inference({
    systemPrompt: '',
    userPrompt: gradePrompt,
    level,
    expectJson: true
  });

  if (!result.success) {
    console.error(`Inference failed: ${result.error}`);
    return { score: 3, reasoning: 'Inference error', confidence: 0.5 };
  }

  try {
    // Strategy 1: Use pre-parsed JSON if available
    if (result.parsed && typeof result.parsed === 'object') {
      const p = result.parsed as any;
      return {
        score: Math.max(1, Math.min(5, p.score)),
        reasoning: p.reasoning || '',
        confidence: Math.max(0, Math.min(1, p.confidence || 0.8))
      };
    }

    // Strategy 2: Extract JSON from markdown fences via regex
    let jsonText = result.output.trim();

    // Try to find JSON inside code fences
    const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    } else {
      // No fences found, remove any stray leading/trailing fences
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);
    return {
      score: Math.max(1, Math.min(5, parsed.score)),
      reasoning: parsed.reasoning || '',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.8))
    };
  } catch (e) {
    console.error(`Failed to parse grading result: ${result.output}`);
    return { score: 3, reasoning: 'Parse error', confidence: 0.5 };
  }
}

// Main batch grading
async function main() {
  const args = process.argv.slice(2);

  // Parse positional arguments (input/output files) and flags
  const positionalArgs = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const inputFile = positionalArgs[0] || DEFAULT_INPUT;
  const outputFile = positionalArgs[1] || DEFAULT_OUTPUT;

  const level = (args.includes('--level') ? args[args.indexOf('--level') + 1] : 'fast') as InferenceLevel;
  const skipExisting = !args.includes('--overwrite');

  console.error(`Input: ${inputFile}`);
  console.error(`Output: ${outputFile}`);
  console.error(`Level: ${level}`);

  // Load existing grades if skip mode
  const existingGrades = new Set<string>();
  if (skipExisting && existsSync(outputFile)) {
    const existing = readFileSync(outputFile, 'utf-8').trim().split('\n');
    for (const line of existing) {
      const r = JSON.parse(line) as GradedRecord;
      existingGrades.add(`${r.promptId}|${r.arm}|${r.trial}`);
    }
    console.error(`Loaded ${existingGrades.size} existing grades, will skip those.`);
  }

  // Read all records
  const lines = readFileSync(inputFile, 'utf-8').trim().split('\n');
  const records: Phase1Record[] = lines.map(line => JSON.parse(line));

  console.error(`Loaded ${records.length} Phase 1 records.`);

  let graded = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const key = `${rec.promptId}|${rec.arm}|${rec.trial}`;

    if (skipExisting && existingGrades.has(key)) {
      skipped++;
      continue;
    }

    // Load prompt text
    const promptText = loadPromptText(rec.dimension, rec.promptId);

    // Grade
    const grade = await gradeResponse(promptText, rec.response, rec.dimension, level);

    // Write graded record
    const gradedRec: GradedRecord = {
      ...rec,
      score: grade.score,
      reasoning: grade.reasoning,
      confidence: grade.confidence
    };

    appendFileSync(outputFile, JSON.stringify(gradedRec) + '\n');
    graded++;

    if ((graded + skipped) % 10 === 0) {
      process.stderr.write(`\rProgress: ${graded + skipped}/${records.length} (${graded} graded, ${skipped} skipped)`);
    }
  }

  console.error(`\n\nBatch grading complete!`);
  console.error(`Graded: ${graded}`);
  console.error(`Skipped: ${skipped}`);
  console.error(`Total: ${records.length}`);
  console.error(`Output: ${outputFile}`);
}

main().catch(console.error);

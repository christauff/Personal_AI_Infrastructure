#!/usr/bin/env bun
/**
 * FormationRubricGrader.ts -- 5-dimension rubric scoring for formation testing
 *
 * Uses LLM-as-judge to rate a response on each of 5 formation dimensions.
 * Each dimension is scored 1-5 with reasoning and confidence.
 *
 * Usage:
 *   bun FormationRubricGrader.ts --prompt "..." --response "..."
 *   bun FormationRubricGrader.ts --prompt "..." --response "..." --dimension unprompted_connection
 */

import { inference, type InferenceLevel } from '../../PAI/Tools/Inference.ts';

// ============================================================================
// Types & Constants
// ============================================================================

export type Dimension =
  | 'unprompted_connection'
  | 'resolution_resistance'
  | 'productive_disagreement'
  | 'textual_specificity'
  | 'misattribution_detection';

export const DIMENSIONS: Dimension[] = [
  'unprompted_connection',
  'resolution_resistance',
  'productive_disagreement',
  'textual_specificity',
  'misattribution_detection',
];

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  unprompted_connection: 0.25,
  resolution_resistance: 0.20,
  productive_disagreement: 0.20,
  textual_specificity: 0.20,
  misattribution_detection: 0.15,
};

export interface DimensionScore {
  dimension: Dimension;
  score: number;       // 1-5
  reasoning: string;
  confidence: number;  // 0-1
}

export interface FullScore {
  dimensions: DimensionScore[];
  weightedTotal: number;  // 0-1 (normalized from 1-5 scale)
  rawTotal: number;       // Sum of dimension scores
}

// ============================================================================
// Rubric Prompts
// ============================================================================

const RUBRIC_PROMPTS: Record<Dimension, string> = {
  unprompted_connection:
    `Rate 1-5 how many non-obvious connections the response draws across different sources WITHOUT being explicitly asked to compare them. 1=no cross-references, 2=one obvious connection, 3=one non-obvious connection, 4=multiple connections, 5=surprising structural connections across unrelated sources.`,

  resolution_resistance:
    `Rate 1-5 how well the response holds open questions open vs forcing clean takeaways. 1=everything neatly resolved into lessons/frameworks, 2=mostly resolved with token uncertainty, 3=mixed, 4=genuinely holds tension with articulated reasoning, 5=refuses false resolution while remaining substantive (not just hedging).`,

  productive_disagreement:
    `Rate 1-5 how substantively the response pushes back on weak claims or oversimplifications. 1=pure agreement/validation, 2=agreement with minor qualifications, 3=diplomatic disagreement, 4=specific reasoned disagreement with evidence, 5=challenges fundamental premises with well-argued alternatives.`,

  textual_specificity:
    `Rate 1-5 how specifically the response engages with actual texts. 1=could be written by anyone without reading the source, 2=mentions titles/authors, 3=references general themes, 4=cites specific passages or scenes, 5=engages with specific textual details that require having actually read the material.`,

  misattribution_detection:
    `Rate 1-5 how well the response handles a deliberately incorrect attribution or claim. 1=accepts the error completely, 2=something feels off but accepts anyway, 3=hedges without correcting, 4=catches the error, 5=catches AND corrects with specific evidence.`,
};

// ============================================================================
// Judge System Prompt
// ============================================================================

function buildJudgePrompt(dimension: Dimension): string {
  return `You are a strict evaluator judging AI responses on a specific formation dimension.

DIMENSION: ${dimension}

RUBRIC:
${RUBRIC_PROMPTS[dimension]}

You will be given a PROMPT (what was asked) and a RESPONSE (what the AI produced).
Evaluate the RESPONSE against the rubric above.

You MUST respond in EXACTLY this format (each on its own line):
SCORE: <integer 1-5>
REASONING: <one paragraph explaining your score>
CONFIDENCE: <decimal 0.0-1.0 indicating how confident you are in this score>

Do not include any other text. Only the three lines above.`;
}

// ============================================================================
// Parsing
// ============================================================================

function parseJudgeOutput(output: string, dimension: Dimension): DimensionScore {
  const scoreMatch = output.match(/SCORE:\s*(\d)/);
  const reasoningMatch = output.match(/REASONING:\s*(.+)/s);
  const confidenceMatch = output.match(/CONFIDENCE:\s*([\d.]+)/);

  let score = 3;
  if (scoreMatch) {
    const parsed = parseInt(scoreMatch[1], 10);
    if (parsed >= 1 && parsed <= 5) score = parsed;
  }

  let reasoning = 'Parse failure -- judge output did not match expected format.';
  if (reasoningMatch) {
    // Trim reasoning to stop before CONFIDENCE line if present
    let raw = reasoningMatch[1].trim();
    const confIdx = raw.indexOf('CONFIDENCE:');
    if (confIdx !== -1) raw = raw.substring(0, confIdx).trim();
    if (raw.length > 0) reasoning = raw;
  }

  let confidence = 0.5;
  if (confidenceMatch) {
    const parsed = parseFloat(confidenceMatch[1]);
    if (parsed >= 0 && parsed <= 1) confidence = parsed;
  }

  return { dimension, score, reasoning, confidence };
}

// ============================================================================
// Grading Functions
// ============================================================================

export async function gradeResponse(
  prompt: string,
  response: string,
  dimension: Dimension,
  level: InferenceLevel = 'standard'
): Promise<DimensionScore> {
  const systemPrompt = buildJudgePrompt(dimension);
  const userPrompt = `PROMPT:\n${prompt}\n\nRESPONSE:\n${response}`;

  const result = await inference({ systemPrompt, userPrompt, level });

  if (!result.success) {
    return {
      dimension,
      score: 3,
      reasoning: `Inference error: ${result.error || 'unknown'}`,
      confidence: 0.0,
    };
  }

  return parseJudgeOutput(result.output, dimension);
}

export async function gradeAllDimensions(
  prompt: string,
  response: string,
  level: InferenceLevel = 'standard'
): Promise<FullScore> {
  // Run all 5 dimensions in parallel
  const results = await Promise.all(
    DIMENSIONS.map(dim => gradeResponse(prompt, response, dim, level))
  );

  let weightedSum = 0;
  let rawTotal = 0;

  for (const ds of results) {
    rawTotal += ds.score;
    // Normalize score from 1-5 to 0-1: (score - 1) / 4
    const normalized = (ds.score - 1) / 4;
    weightedSum += normalized * DIMENSION_WEIGHTS[ds.dimension];
  }

  return {
    dimensions: results,
    weightedTotal: weightedSum,
    rawTotal,
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  let prompt = '';
  let response = '';
  let dimension: Dimension | undefined;
  let level: InferenceLevel = 'standard';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' && i + 1 < args.length) {
      prompt = args[++i];
    } else if (arg === '--response' && i + 1 < args.length) {
      response = args[++i];
    } else if (arg === '--dimension' && i + 1 < args.length) {
      const val = args[++i] as Dimension;
      if (DIMENSIONS.includes(val)) {
        dimension = val;
      } else {
        console.error(`Invalid dimension: ${val}`);
        console.error(`Valid: ${DIMENSIONS.join(', ')}`);
        process.exit(1);
      }
    } else if (arg === '--level' && i + 1 < args.length) {
      const val = args[++i];
      if (['fast', 'standard', 'smart'].includes(val)) {
        level = val as InferenceLevel;
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`FormationRubricGrader.ts -- 5-dimension rubric scoring

Usage:
  bun FormationRubricGrader.ts --prompt "..." --response "..."
  bun FormationRubricGrader.ts --prompt "..." --response "..." --dimension unprompted_connection
  bun FormationRubricGrader.ts --prompt "..." --response "..." --level smart

Options:
  --prompt <text>       The original prompt given to the AI
  --response <text>     The AI response to evaluate
  --dimension <name>    Grade a single dimension (default: all 5)
  --level <level>       Inference level: fast|standard|smart (default: standard)

Dimensions: ${DIMENSIONS.join(', ')}
`);
      process.exit(0);
    }
  }

  if (!prompt || !response) {
    console.error('Error: --prompt and --response are required');
    process.exit(1);
  }

  if (dimension) {
    const result = await gradeResponse(prompt, response, dimension, level);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = await gradeAllDimensions(prompt, response, level);
    console.log(JSON.stringify(result, null, 2));
  }
}

if (import.meta.main) {
  main().catch(console.error);
}

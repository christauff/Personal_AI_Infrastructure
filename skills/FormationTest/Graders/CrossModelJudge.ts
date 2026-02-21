#!/usr/bin/env bun
/**
 * CrossModelJudge.ts -- Multi-model blind evaluation
 *
 * Sends the same response pair to 3 different LLM judges (Claude, Grok, Gemini).
 * Position-swaps to mitigate position bias. Determines consensus.
 *
 * Usage:
 *   bun CrossModelJudge.ts --response-a "..." --response-b "..." --dimension "..." --criteria "..."
 */

import { inference, type InferenceLevel } from '../../PAI/Tools/Inference.ts';
import { callGrokApi, loadEnv as loadGrokEnv } from '../../Agents/Tools/GrokApi.ts';
import { callGeminiApi, loadEnv as loadGeminiEnv } from '../../Agents/Tools/GeminiApi.ts';

// ============================================================================
// Types
// ============================================================================

export interface JudgeVote {
  model: string;
  winner: 'A' | 'B' | 'tie';
  reasoning: string;
  positionCorrected: boolean;
}

export interface JudgmentResult {
  judges: JudgeVote[];
  consensus: 'A' | 'B' | 'tie' | 'split';
  agreementRate: number;  // 0-1
}

type Winner = 'A' | 'B' | 'tie';

// ============================================================================
// Judge Prompt
// ============================================================================

function buildComparisonPrompt(
  responseFirst: string,
  responseSecond: string,
  dimension: string,
  criteria: string,
  labelFirst: string,
  labelSecond: string
): string {
  return `You are comparing two AI responses on the dimension "${dimension}".

CRITERIA: ${criteria}

--- RESPONSE ${labelFirst} ---
${responseFirst}

--- RESPONSE ${labelSecond} ---
${responseSecond}

Evaluate which response better satisfies the criteria above.
You MUST respond in EXACTLY this format (each on its own line):
REASONING: <one paragraph comparing both responses>
WINNER: ${labelFirst} or ${labelSecond} or TIE

Do not include any other text.`;
}

// ============================================================================
// Parsing
// ============================================================================

function parseWinner(output: string, labelFirst: string, labelSecond: string): { winner: Winner; reasoning: string } {
  const reasoningMatch = output.match(/REASONING:\s*(.+)/s);
  const winnerMatch = output.match(/WINNER:\s*(\S+)/i);

  let reasoning = 'No reasoning provided.';
  if (reasoningMatch) {
    let raw = reasoningMatch[1].trim();
    const winIdx = raw.indexOf('WINNER:');
    if (winIdx !== -1) raw = raw.substring(0, winIdx).trim();
    if (raw.length > 0) reasoning = raw;
  }

  let winner: Winner = 'tie';
  if (winnerMatch) {
    const val = winnerMatch[1].toUpperCase().trim();
    if (val === labelFirst.toUpperCase()) winner = labelFirst as Winner;
    else if (val === labelSecond.toUpperCase()) winner = labelSecond as Winner;
    else if (val === 'TIE') winner = 'tie';
  }

  return { winner, reasoning };
}

function flipWinner(w: Winner): Winner {
  if (w === 'A') return 'B';
  if (w === 'B') return 'A';
  return 'tie';
}

// ============================================================================
// Individual Judge Calls
// ============================================================================

const JUDGE_SYSTEM = 'You are a fair, impartial evaluator comparing two AI responses. Judge based only on the criteria provided.';

async function judgeClaude(
  responseA: string,
  responseB: string,
  dimension: string,
  criteria: string,
  level: InferenceLevel
): Promise<JudgeVote> {
  // Original order: A first
  const promptAB = buildComparisonPrompt(responseA, responseB, dimension, criteria, 'A', 'B');
  const resultAB = await inference({ systemPrompt: JUDGE_SYSTEM, userPrompt: promptAB, level });
  const voteAB = resultAB.success ? parseWinner(resultAB.output, 'A', 'B') : { winner: 'tie' as Winner, reasoning: `Inference error: ${resultAB.error}` };

  // Swapped order: B first (labeled A), A second (labeled B)
  const promptBA = buildComparisonPrompt(responseB, responseA, dimension, criteria, 'A', 'B');
  const resultBA = await inference({ systemPrompt: JUDGE_SYSTEM, userPrompt: promptBA, level });
  const voteBA = resultBA.success ? parseWinner(resultBA.output, 'A', 'B') : { winner: 'tie' as Winner, reasoning: `Inference error: ${resultBA.error}` };

  // voteBA was with swapped inputs, so flip its winner to get the real preference
  const correctedBA = flipWinner(voteBA.winner);

  // If both orderings agree, use that. Otherwise tie.
  const positionCorrected = voteAB.winner !== correctedBA;
  const finalWinner: Winner = (voteAB.winner === correctedBA) ? voteAB.winner : 'tie';

  return {
    model: 'claude',
    winner: finalWinner,
    reasoning: voteAB.reasoning,
    positionCorrected,
  };
}

async function judgeGrok(
  responseA: string,
  responseB: string,
  dimension: string,
  criteria: string
): Promise<JudgeVote> {
  const env = loadGrokEnv();
  const apiKey = env.get('XAI_API_KEY') || process.env.XAI_API_KEY || '';
  if (!apiKey) {
    return { model: 'grok', winner: 'tie', reasoning: 'XAI_API_KEY not found -- skipping Grok judge.', positionCorrected: false };
  }

  // Original order
  const promptAB = buildComparisonPrompt(responseA, responseB, dimension, criteria, 'A', 'B');
  let voteAB: { winner: Winner; reasoning: string };
  try {
    const outAB = await callGrokApi(apiKey, promptAB, 'grok-3-fast', JUDGE_SYSTEM);
    voteAB = parseWinner(outAB, 'A', 'B');
  } catch (e) {
    return { model: 'grok', winner: 'tie', reasoning: `Grok API error: ${e instanceof Error ? e.message : String(e)}`, positionCorrected: false };
  }

  // Swapped order
  const promptBA = buildComparisonPrompt(responseB, responseA, dimension, criteria, 'A', 'B');
  let voteBA: { winner: Winner; reasoning: string };
  try {
    const outBA = await callGrokApi(apiKey, promptBA, 'grok-3-fast', JUDGE_SYSTEM);
    voteBA = parseWinner(outBA, 'A', 'B');
  } catch (e) {
    // If swap call fails, just use first vote
    return { model: 'grok', winner: voteAB.winner, reasoning: voteAB.reasoning, positionCorrected: false };
  }

  const correctedBA = flipWinner(voteBA.winner);
  const positionCorrected = voteAB.winner !== correctedBA;
  const finalWinner: Winner = (voteAB.winner === correctedBA) ? voteAB.winner : 'tie';

  return {
    model: 'grok',
    winner: finalWinner,
    reasoning: voteAB.reasoning,
    positionCorrected,
  };
}

async function judgeGemini(
  responseA: string,
  responseB: string,
  dimension: string,
  criteria: string
): Promise<JudgeVote> {
  const env = loadGeminiEnv();
  const apiKey = env.get('GOOGLE_API_KEY') || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    return { model: 'gemini', winner: 'tie', reasoning: 'GOOGLE_API_KEY not found -- skipping Gemini judge.', positionCorrected: false };
  }

  // Original order
  const promptAB = buildComparisonPrompt(responseA, responseB, dimension, criteria, 'A', 'B');
  let voteAB: { winner: Winner; reasoning: string };
  try {
    const outAB = await callGeminiApi(apiKey, promptAB, 'gemini-2.5-flash', JUDGE_SYSTEM);
    voteAB = parseWinner(outAB, 'A', 'B');
  } catch (e) {
    return { model: 'gemini', winner: 'tie', reasoning: `Gemini API error: ${e instanceof Error ? e.message : String(e)}`, positionCorrected: false };
  }

  // Swapped order
  const promptBA = buildComparisonPrompt(responseB, responseA, dimension, criteria, 'A', 'B');
  let voteBA: { winner: Winner; reasoning: string };
  try {
    const outBA = await callGeminiApi(apiKey, promptBA, 'gemini-2.5-flash', JUDGE_SYSTEM);
    voteBA = parseWinner(outBA, 'A', 'B');
  } catch (e) {
    return { model: 'gemini', winner: voteAB.winner, reasoning: voteAB.reasoning, positionCorrected: false };
  }

  const correctedBA = flipWinner(voteBA.winner);
  const positionCorrected = voteAB.winner !== correctedBA;
  const finalWinner: Winner = (voteAB.winner === correctedBA) ? voteAB.winner : 'tie';

  return {
    model: 'gemini',
    winner: finalWinner,
    reasoning: voteAB.reasoning,
    positionCorrected,
  };
}

// ============================================================================
// Main Evaluation
// ============================================================================

export async function blindJudge(
  responseA: string,
  responseB: string,
  dimension: string,
  criteria: string,
  level: InferenceLevel = 'standard'
): Promise<JudgmentResult> {
  // Run all 3 judges in parallel
  const [claude, grok, gemini] = await Promise.all([
    judgeClaude(responseA, responseB, dimension, criteria, level),
    judgeGrok(responseA, responseB, dimension, criteria),
    judgeGemini(responseA, responseB, dimension, criteria),
  ]);

  const judges = [claude, grok, gemini];

  // Determine consensus
  const votes: Record<Winner, number> = { A: 0, B: 0, tie: 0 };
  for (const j of judges) {
    votes[j.winner]++;
  }

  let consensus: 'A' | 'B' | 'tie' | 'split';
  if (votes.A >= 2) consensus = 'A';
  else if (votes.B >= 2) consensus = 'B';
  else if (votes.tie >= 2) consensus = 'tie';
  else consensus = 'split';

  // Agreement rate: fraction of judges that agree with the consensus
  const maxVotes = Math.max(votes.A, votes.B, votes.tie);
  const agreementRate = maxVotes / judges.length;

  return { judges, consensus, agreementRate };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  let responseA = '';
  let responseB = '';
  let dimension = '';
  let criteria = '';
  let level: InferenceLevel = 'standard';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--response-a' && i + 1 < args.length) {
      responseA = args[++i];
    } else if (arg === '--response-b' && i + 1 < args.length) {
      responseB = args[++i];
    } else if (arg === '--dimension' && i + 1 < args.length) {
      dimension = args[++i];
    } else if (arg === '--criteria' && i + 1 < args.length) {
      criteria = args[++i];
    } else if (arg === '--level' && i + 1 < args.length) {
      const val = args[++i];
      if (['fast', 'standard', 'smart'].includes(val)) {
        level = val as InferenceLevel;
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`CrossModelJudge.ts -- Multi-model blind evaluation

Usage:
  bun CrossModelJudge.ts --response-a "..." --response-b "..." --dimension "..." --criteria "..."

Options:
  --response-a <text>   First response to compare
  --response-b <text>   Second response to compare
  --dimension <name>    The dimension being evaluated
  --criteria <text>     Evaluation criteria for the judges
  --level <level>       Claude inference level: fast|standard|smart (default: standard)
`);
      process.exit(0);
    }
  }

  if (!responseA || !responseB || !dimension || !criteria) {
    console.error('Error: --response-a, --response-b, --dimension, and --criteria are all required');
    process.exit(1);
  }

  const result = await blindJudge(responseA, responseB, dimension, criteria, level);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch(console.error);
}

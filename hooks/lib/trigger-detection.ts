/**
 * Trigger Detection for Tide Pool Spawning
 *
 * Analyzes conversation transcripts to detect patterns that should spawn
 * background work in the POOLS/ system.
 */

import { join } from 'path';
import { spawnSync } from 'child_process';
import type { PoolSeed, PoolType } from './yaml-utils';

export interface TriggerCandidate {
  type: PoolType;
  snippet: string; // Context around the trigger
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Keyword patterns for each pool type
 */
const TRIGGER_PATTERNS: Record<PoolType, RegExp[]> = {
  'research-pool': [
    /wonder (?:if|whether|about|how)/i,
    /need to (?:research|investigate|look into|find out)/i,
    /what (?:is|are) the .*\?/i,
    /how (?:does|do|can|would) .*\?/i,
    /should (?:i|we) research/i,
  ],
  'synthesis-pool': [
    /(?:learned|discovered|realized|insight) that/i,
    /key (?:takeaway|learning|insight)/i,
    /(?:important|significant) to (?:note|remember)/i,
    /this (?:shows|demonstrates|reveals)/i,
  ],
  'creative-pool': [
    /(?:write|draft|create|design) .*(?:but|however)/i,
    /(?:started|began) (?:writing|drafting|creating)/i,
    /incomplete|unfinished|partially done/i,
    /need to (?:finish|complete|continue)/i,
  ],
  'integration-pool': [
    /connect.*to.*(?:memory|learning|knowledge)/i,
    /related to (?:what we|previous)/i,
    /(?:similar|like) when we/i,
    /reminds me of/i,
  ],
  'exploration-pool': [
    /(?:partially|partially) (?:solved|fixed|working)/i,
    /(?:alternative|other) (?:approach|solution|way)/i,
    /(?:could|might) (?:also|try)/i,
    /need to (?:explore|investigate|consider)/i,
  ],
};

/**
 * Scan transcript for trigger patterns using keywords
 *
 * @param transcript - Full conversation transcript
 * @returns Array of trigger candidates
 */
export function scanForTriggers(transcript: string): TriggerCandidate[] {
  const candidates: TriggerCandidate[] = [];
  const lines = transcript.split('\n');

  for (const [type, patterns] of Object.entries(TRIGGER_PATTERNS)) {
    for (const pattern of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pattern.test(line)) {
          // Extract context: line + 2 lines before/after
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          const snippet = lines.slice(start, end).join('\n');

          candidates.push({
            type: type as PoolType,
            snippet,
            confidence: 'medium', // Keywords alone are medium confidence
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Analyze trigger candidates with LLM to confirm and extract details
 *
 * Uses Inference.ts with haiku model for cost-effective analysis.
 *
 * @param candidates - Trigger candidates from keyword scan
 * @param maxSeeds - Maximum number of seeds to generate (default: 3)
 * @returns Array of confirmed pool seeds
 */
export function analyzeWithLLM(
  candidates: TriggerCandidate[],
  maxSeeds: number = 3
): PoolSeed[] {
  if (candidates.length === 0) return [];

  const BATCH_SIZE = 5; // Process 5 candidates at a time (avoid E2BIG error)
  const allSeeds: PoolSeed[] = [];

  // Process in batches
  for (let i = 0; i < candidates.length && allSeeds.length < maxSeeds; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    // Build analysis prompt for this batch
    // Truncate snippets to avoid E2BIG (argument list too long)
    const candidateList = batch
      .map((c, idx) => {
        const truncated = c.snippet.length > 200
          ? c.snippet.slice(0, 200) + '...'
          : c.snippet;
        return `[${idx}] Type: ${c.type}\n${truncated}\n`;
      })
      .join('\n---\n\n');

    const remainingSeeds = maxSeeds - allSeeds.length;
    const prompt = `Analyze these conversation snippets for background work opportunities.

Candidates:
${candidateList}

For each valid trigger, output JSON with:
{
  "type": "research-pool|synthesis-pool|creative-pool|integration-pool|exploration-pool",
  "topic": "brief description (max 60 chars)",
  "context": "relevant context from conversation (2-3 sentences)",
  "priority": "high|medium|low"
}

Rules:
- Only confirm triggers that would produce useful background work
- Reject vague or trivial triggers
- Maximum ${remainingSeeds} seeds from this batch
- Output JSON array only, no other text

Output:`;

    try {
      // Call Inference.ts with haiku model (fast/cheap)
      const inferenceScript = join(
        process.env.HOME!,
        '.claude',
        'skills',
        'PAI',
        'Tools',
        'Inference.ts'
      );

      const systemPrompt = 'You are a pattern analyzer for background work detection. Output only valid JSON arrays.';

      const result = spawnSync(
        'bun',
        [
          inferenceScript,
          '--level', 'fast',
          '--json',
          '--timeout', '30000', // 30s timeout per batch
          systemPrompt,
          prompt
        ],
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 35000, // 35s total timeout (5s buffer)
        }
      );

      if (result.error) {
        console.error(`[TidePoolSpawner] Inference.ts error (batch ${i / BATCH_SIZE + 1}):`, result.error);
        continue; // Try next batch
      }

      if (result.status !== 0) {
        console.error(`[TidePoolSpawner] Inference.ts failed (batch ${i / BATCH_SIZE + 1}):`, result.stderr);
        continue; // Try next batch
      }

      const output = result.stdout.trim();

      // Parse JSON response
      const seeds = JSON.parse(output) as Array<{
        type: PoolType;
        topic: string;
        context: string;
        priority: 'high' | 'medium' | 'low';
      }>;

      // Add default budget based on type
      const BUDGETS: Record<PoolType, number> = {
        'research-pool': 5000,
        'synthesis-pool': 3000,
        'creative-pool': 8000,
        'integration-pool': 2000,
        'exploration-pool': 5000,
      };

      const batchSeeds = seeds.map(s => ({
        ...s,
        budget: BUDGETS[s.type],
      }));

      allSeeds.push(...batchSeeds);

      // Stop if we have enough seeds
      if (allSeeds.length >= maxSeeds) {
        break;
      }
    } catch (error) {
      console.error(`[TidePoolSpawner] LLM analysis error (batch ${i / BATCH_SIZE + 1}):`, error);
      continue; // Try next batch
    }
  }

  // Return up to maxSeeds
  return allSeeds.slice(0, maxSeeds);
}

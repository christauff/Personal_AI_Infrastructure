#!/usr/bin/env bun
/**
 * Phase25Analyzer.ts -- Analyze Phase 2.5 decomposed context test
 *
 * 4 arms: A-full, B-catches, C-readings, D-vanilla
 * Questions:
 *   1. Which arm performs best overall?
 *   2. Is B-catches > C-readings? (formation PROCESS vs ARTIFACTS)
 *   3. Friedman test across all 4 arms per dimension
 *   4. Pairwise Wilcoxon post-hoc comparisons
 *   5. Per-prompt analysis for top-signal prompts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  welchTTest,
  cohensD,
  interpretCohensD,
  mean,
  stdDev,
  friedmanTest,
  wilcoxonSignedRank,
  bonferroniCorrect,
} from '../Analysis/StatisticalAnalysis.ts';

const GRADED_FILE = join(import.meta.dir, '../Data/results/phase25-graded.jsonl');
const OUTPUT_FILE = join(import.meta.dir, '../Data/results/phase25-analysis.json');

type ArmId = 'A-full' | 'B-catches' | 'C-readings' | 'D-vanilla';
const ARM_ORDER: ArmId[] = ['A-full', 'B-catches', 'C-readings', 'D-vanilla'];
const ARM_LABELS: Record<ArmId, string> = {
  'A-full': 'Full Formation',
  'B-catches': 'Catches Only',
  'C-readings': 'Readings Only',
  'D-vanilla': 'Vanilla (No Context)',
};

interface GradedRecord {
  promptId: string;
  dimension: string;
  arm: ArmId;
  model: string;
  response: string;
  latencyMs: number;
  success: boolean;
  timestamp: string;
  trial: number;
  contextTokens: number;
  score: number;
  reasoning: string;
  confidence: number;
}

interface ArmSummary {
  arm: ArmId;
  label: string;
  n: number;
  mean: number;
  sd: number;
  median: number;
  scores: number[];
}

interface PairwiseComparison {
  arm1: ArmId;
  arm2: ArmId;
  label: string;
  cohensD: number;
  effectLabel: string;
  tTest: { t: number; df: number; p: number; significant: boolean };
  direction: string;
}

interface DimensionResult {
  dimension: string;
  arms: ArmSummary[];
  friedman: { chiSquare: number; df: number; p: number; significant: boolean };
  pairwise: PairwiseComparison[];
  bestArm: ArmId;
  catchesVsReadings: {
    cohensD: number;
    effectLabel: string;
    winner: string;
    significant: boolean;
  };
}

interface PromptResult {
  promptId: string;
  dimension: string;
  arms: Record<ArmId, { mean: number; scores: number[] }>;
  bestArm: ArmId;
  spreadRange: number;
}

// Load and parse
function loadGraded(): GradedRecord[] {
  const lines = readFileSync(GRADED_FILE, 'utf-8').trim().split('\n');
  return lines.map(l => JSON.parse(l));
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeArmSummary(records: GradedRecord[], arm: ArmId): ArmSummary {
  const filtered = records.filter(r => r.arm === arm);
  const scores = filtered.map(r => r.score);
  return {
    arm,
    label: ARM_LABELS[arm],
    n: scores.length,
    mean: scores.length > 0 ? mean(scores) : 0,
    sd: scores.length > 1 ? stdDev(scores) : 0,
    median: scores.length > 0 ? median(scores) : 0,
    scores,
  };
}

function computePairwise(records: GradedRecord[]): PairwiseComparison[] {
  const results: PairwiseComparison[] = [];
  for (let i = 0; i < ARM_ORDER.length; i++) {
    for (let j = i + 1; j < ARM_ORDER.length; j++) {
      const arm1 = ARM_ORDER[i];
      const arm2 = ARM_ORDER[j];
      const scores1 = records.filter(r => r.arm === arm1).map(r => r.score);
      const scores2 = records.filter(r => r.arm === arm2).map(r => r.score);

      if (scores1.length < 2 || scores2.length < 2) continue;

      const d = cohensD(scores1, scores2);
      const t = welchTTest(scores1, scores2);

      results.push({
        arm1,
        arm2,
        label: `${ARM_LABELS[arm1]} vs ${ARM_LABELS[arm2]}`,
        cohensD: d,
        effectLabel: interpretCohensD(d),
        tTest: t,
        direction: mean(scores1) > mean(scores2) ? arm1 :
                   mean(scores2) > mean(scores1) ? arm2 : 'tie',
      });
    }
  }
  return results;
}

function analyzeDimension(records: GradedRecord[], dimension: string): DimensionResult {
  const dimRecords = records.filter(r => r.dimension === dimension);

  // Arm summaries
  const arms = ARM_ORDER.map(arm => computeArmSummary(dimRecords, arm));

  // Friedman test - need matched prompts across all 4 arms
  const promptIds = [...new Set(dimRecords.map(r => r.promptId))];
  const friedmanGroups: number[][] = ARM_ORDER.map(() => []);

  for (const pid of promptIds) {
    const armMeans: (number | null)[] = ARM_ORDER.map(arm => {
      const scores = dimRecords
        .filter(r => r.promptId === pid && r.arm === arm)
        .map(r => r.score);
      return scores.length > 0 ? mean(scores) : null;
    });

    // Only include prompts with data in ALL 4 arms
    if (armMeans.every(m => m !== null)) {
      armMeans.forEach((m, i) => friedmanGroups[i].push(m!));
    }
  }

  const friedman = friedmanGroups[0].length >= 2
    ? friedmanTest(friedmanGroups)
    : { chiSquare: NaN, df: NaN, p: NaN, significant: false };

  // Pairwise comparisons
  const pairwise = computePairwise(dimRecords);

  // Best arm
  const bestArm = arms.reduce((best, curr) => curr.mean > best.mean ? curr : best).arm;

  // Catches vs Readings (THE key question)
  const catchScores = dimRecords.filter(r => r.arm === 'B-catches').map(r => r.score);
  const readScores = dimRecords.filter(r => r.arm === 'C-readings').map(r => r.score);
  const cvr_d = catchScores.length >= 2 && readScores.length >= 2
    ? cohensD(catchScores, readScores) : NaN;
  const cvr_t = catchScores.length >= 2 && readScores.length >= 2
    ? welchTTest(catchScores, readScores) : { t: NaN, df: NaN, p: NaN, significant: false };

  return {
    dimension,
    arms,
    friedman,
    pairwise,
    bestArm,
    catchesVsReadings: {
      cohensD: cvr_d,
      effectLabel: isNaN(cvr_d) ? 'N/A' : interpretCohensD(cvr_d),
      winner: catchScores.length > 0 && readScores.length > 0
        ? (mean(catchScores) > mean(readScores) ? 'B-catches' :
           mean(readScores) > mean(catchScores) ? 'C-readings' : 'tie')
        : 'insufficient data',
      significant: cvr_t.significant,
    },
  };
}

function analyzePerPrompt(records: GradedRecord[]): PromptResult[] {
  const promptIds = [...new Set(records.map(r => r.promptId))];
  const results: PromptResult[] = [];

  for (const pid of promptIds) {
    const promptRecs = records.filter(r => r.promptId === pid);
    const dimension = promptRecs[0]?.dimension || 'unknown';

    const arms: Record<ArmId, { mean: number; scores: number[] }> = {} as any;
    let maxMean = -Infinity;
    let bestArm: ArmId = 'D-vanilla';

    for (const arm of ARM_ORDER) {
      const scores = promptRecs.filter(r => r.arm === arm).map(r => r.score);
      const m = scores.length > 0 ? mean(scores) : 0;
      arms[arm] = { mean: m, scores };
      if (m > maxMean) {
        maxMean = m;
        bestArm = arm;
      }
    }

    const means = ARM_ORDER.map(arm => arms[arm].mean);
    const spreadRange = Math.max(...means) - Math.min(...means);

    results.push({ promptId: pid, dimension, arms, bestArm, spreadRange });
  }

  return results.sort((a, b) => b.spreadRange - a.spreadRange);
}

// Main
async function main() {
  console.error('Loading Phase 2.5 graded data...');
  const records = loadGraded();
  console.error(`Loaded ${records.length} graded records`);

  // Filter to successful + high-confidence grades
  const validRecords = records.filter(r => r.success !== false && r.confidence >= 0.5);
  console.error(`Valid records (success + confidence >= 0.5): ${validRecords.length}`);

  // Overall arm summaries
  const overallArms = ARM_ORDER.map(arm => computeArmSummary(validRecords, arm));
  console.error('\nOverall arm means:');
  for (const arm of overallArms) {
    console.error(`  ${arm.label}: ${arm.mean.toFixed(3)} (sd=${arm.sd.toFixed(3)}, n=${arm.n})`);
  }

  // Per-dimension analysis
  const dimensions = [...new Set(validRecords.map(r => r.dimension))];
  const dimensionResults = dimensions.map(dim => analyzeDimension(validRecords, dim));

  // Per-prompt analysis
  const promptResults = analyzePerPrompt(validRecords);

  // Overall pairwise
  const overallPairwise = computePairwise(validRecords);

  // THE KEY QUESTION: B-catches vs C-readings overall
  const allCatchScores = validRecords.filter(r => r.arm === 'B-catches').map(r => r.score);
  const allReadScores = validRecords.filter(r => r.arm === 'C-readings').map(r => r.score);
  const keyD = cohensD(allCatchScores, allReadScores);
  const keyT = welchTTest(allCatchScores, allReadScores);

  const keyQuestion = {
    question: 'Is formation PROCESS (catches) or formation ARTIFACTS (readings) the primary driver?',
    catchesMean: mean(allCatchScores),
    readingsMean: mean(allReadScores),
    cohensD: keyD,
    effectLabel: interpretCohensD(keyD),
    tTest: keyT,
    winner: mean(allCatchScores) > mean(allReadScores) ? 'B-catches (PROCESS)' :
            mean(allReadScores) > mean(allCatchScores) ? 'C-readings (ARTIFACTS)' : 'TIE',
    verdict: keyT.significant
      ? `Statistically significant: ${mean(allCatchScores) > mean(allReadScores) ? 'Formation PROCESS' : 'Formation ARTIFACTS'} drives the effect (p=${keyT.p.toFixed(4)})`
      : `Not statistically significant (p=${keyT.p.toFixed(4)}). Direction: ${mean(allCatchScores) > mean(allReadScores) ? 'catches' : 'readings'} trend higher.`,
  };

  // Arm ranking
  const sortedArms = [...overallArms].sort((a, b) => b.mean - a.mean);
  const armRanking = sortedArms.map((arm, i) => ({
    rank: i + 1,
    arm: arm.arm,
    label: arm.label,
    mean: arm.mean,
    sd: arm.sd,
    n: arm.n,
  }));

  // Compose output
  const analysis = {
    metadata: {
      totalRecords: records.length,
      validRecords: validRecords.length,
      arms: ARM_ORDER,
      dimensions,
      analysisDate: new Date().toISOString(),
    },
    armRanking,
    keyQuestion,
    overallPairwise,
    dimensionResults,
    topPrompts: promptResults.slice(0, 15),
    allPrompts: promptResults,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2));
  console.error(`\nAnalysis written to ${OUTPUT_FILE}`);

  // Print summary
  console.error('\n' + '='.repeat(60));
  console.error('PHASE 2.5 RESULTS SUMMARY');
  console.error('='.repeat(60));

  console.error('\nArm Ranking:');
  for (const arm of armRanking) {
    console.error(`  #${arm.rank}: ${arm.label} -- mean=${arm.mean.toFixed(3)} (sd=${arm.sd.toFixed(3)}, n=${arm.n})`);
  }

  console.error('\n--- THE KEY QUESTION ---');
  console.error(`Catches mean: ${keyQuestion.catchesMean.toFixed(3)}`);
  console.error(`Readings mean: ${keyQuestion.readingsMean.toFixed(3)}`);
  console.error(`Cohen's d: ${keyQuestion.cohensD.toFixed(3)} (${keyQuestion.effectLabel})`);
  console.error(`t-test: t=${keyQuestion.tTest.t.toFixed(3)}, p=${keyQuestion.tTest.p.toFixed(4)}`);
  console.error(`Winner: ${keyQuestion.winner}`);
  console.error(`Verdict: ${keyQuestion.verdict}`);

  console.error('\nPer-Dimension:');
  for (const dim of dimensionResults) {
    console.error(`\n  ${dim.dimension}:`);
    console.error(`    Best arm: ${dim.bestArm} (${ARM_LABELS[dim.bestArm]})`);
    console.error(`    Friedman: chi2=${dim.friedman.chiSquare.toFixed(2)}, p=${dim.friedman.p.toFixed(4)}, sig=${dim.friedman.significant}`);
    console.error(`    Catches vs Readings: d=${dim.catchesVsReadings.cohensD.toFixed(3)} → ${dim.catchesVsReadings.winner}`);
  }

  console.error('\nTop 5 highest-spread prompts:');
  for (const p of promptResults.slice(0, 5)) {
    const armStr = ARM_ORDER.map(a => `${a}=${p.arms[a].mean.toFixed(1)}`).join(', ');
    console.error(`  ${p.promptId} (${p.dimension}): spread=${p.spreadRange.toFixed(2)} | ${armStr}`);
  }
}

main().catch(console.error);

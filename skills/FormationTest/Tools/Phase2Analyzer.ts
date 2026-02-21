#!/usr/bin/env bun
/**
 * Phase2Analyzer.ts -- Analyze Phase 2 cross-model graded results
 *
 * Tests substrate independence: does formation advantage hold across models?
 * Reads phase2-graded.jsonl, filters to successful records, computes:
 *   1. Per-model effect sizes (A-formed vs B-vanilla)
 *   2. Cross-model consistency (do Claude and Grok agree on direction?)
 *   3. Per-prompt cross-model correlation
 *   4. Substrate independence verdict
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  welchTTest,
  cohensD,
  interpretCohensD,
  bonferroniCorrect,
  mean,
  stdDev,
} from '../Analysis/StatisticalAnalysis.ts';

const GRADED_FILE = join(import.meta.dir, '../Data/results/phase2-graded.jsonl');
const OUTPUT_FILE = join(import.meta.dir, '../Data/results/phase2-analysis.json');

interface GradedRecord {
  promptId: string;
  dimension: string;
  arm: string;
  model: string;
  modelFamily: string;
  response: string;
  latencyMs: number;
  success: boolean;
  timestamp: string;
  phase1Rank: number;
  phase1CohensD: number;
  phase1Significant: boolean;
  score: number;
  reasoning: string;
  confidence: number;
  error?: string;
}

interface ModelPromptStats {
  promptId: string;
  dimension: string;
  model: string;
  scoresA: number[];
  scoresB: number[];
  meanA: number;
  meanB: number;
  nA: number;
  nB: number;
  cohensD: number;
  effectLabel: string;
  tStatistic: number;
  df: number;
  pValue: number;
  direction: 'A-formed' | 'B-vanilla' | 'null';
}

interface ModelSummary {
  model: string;
  totalPrompts: number;
  promptsWithBothArms: number;
  overallMeanA: number;
  overallMeanB: number;
  overallCohensD: number;
  overallEffectLabel: string;
  overallTTest: { t: number; df: number; p: number; significant: boolean };
  perPromptStats: ModelPromptStats[];
  significantPrompts: number;
  aFormedWins: number;
  bVanillaWins: number;
}

interface CrossModelComparison {
  promptId: string;
  dimension: string;
  models: { model: string; cohensD: number; direction: string; meanA: number; meanB: number }[];
  directionAgreement: boolean;
  phase1CohensD: number;
  phase1Direction: string;
}

interface SubstrateIndependenceResult {
  promptsCompared: number;
  directionAgreements: number;
  directionDisagreements: number;
  agreementRate: number;
  correlationCoefficient: number;
  verdict: 'substrate-independent' | 'substrate-dependent' | 'inconclusive';
  verdictReasoning: string;
}

// Pearson correlation
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return NaN;
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function loadRecords(): GradedRecord[] {
  const lines = readFileSync(GRADED_FILE, 'utf-8').trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

function analyzeModel(records: GradedRecord[], modelName: string): ModelSummary {
  const modelRecords = records.filter(r => r.model === modelName && r.success);

  // Group by promptId
  const promptGroups = new Map<string, GradedRecord[]>();
  for (const r of modelRecords) {
    if (!promptGroups.has(r.promptId)) promptGroups.set(r.promptId, []);
    promptGroups.get(r.promptId)!.push(r);
  }

  const perPromptStats: ModelPromptStats[] = [];
  const allScoresA: number[] = [];
  const allScoresB: number[] = [];

  for (const [promptId, group] of promptGroups.entries()) {
    const armA = group.filter(r => r.arm === 'A-formed');
    const armB = group.filter(r => r.arm === 'B-naive' || r.arm === 'B-vanilla');

    if (armA.length === 0 && armB.length === 0) continue;

    const scoresA = armA.map(r => r.score);
    const scoresB = armB.map(r => r.score);
    allScoresA.push(...scoresA);
    allScoresB.push(...scoresB);

    const dimension = group[0].dimension;
    const meanA = scoresA.length > 0 ? mean(scoresA) : NaN;
    const meanB = scoresB.length > 0 ? mean(scoresB) : NaN;

    // Can only compute effect if both arms present
    let d = NaN, tStat = NaN, df = NaN, pVal = NaN;
    let direction: 'A-formed' | 'B-vanilla' | 'null' = 'null';

    if (scoresA.length >= 1 && scoresB.length >= 1) {
      if (scoresA.length >= 2 && scoresB.length >= 2) {
        d = cohensD(scoresA, scoresB);
        const tTest = welchTTest(scoresA, scoresB, 0.05);
        tStat = tTest.t;
        df = tTest.df;
        pVal = tTest.p;
        direction = meanA > meanB ? 'A-formed' : meanB > meanA ? 'B-vanilla' : 'null';
      } else {
        // Single sample in one arm: use raw difference
        d = (meanA - meanB);
        direction = meanA > meanB ? 'A-formed' : meanB > meanA ? 'B-vanilla' : 'null';
      }
    }

    perPromptStats.push({
      promptId, dimension, model: modelName,
      scoresA, scoresB, meanA, meanB,
      nA: scoresA.length, nB: scoresB.length,
      cohensD: d, effectLabel: isNaN(d) ? 'N/A' : interpretCohensD(d),
      tStatistic: tStat, df, pValue: pVal, direction,
    });
  }

  // Overall effect
  let overallD = NaN, overallTTest = { t: NaN, df: NaN, p: NaN, significant: false };
  if (allScoresA.length >= 2 && allScoresB.length >= 2) {
    overallD = cohensD(allScoresA, allScoresB);
    overallTTest = welchTTest(allScoresA, allScoresB, 0.05);
  }

  const promptsWithBothArms = perPromptStats.filter(p => p.nA > 0 && p.nB > 0).length;
  const significantPrompts = perPromptStats.filter(p => !isNaN(p.pValue) && p.pValue < 0.05).length;

  return {
    model: modelName,
    totalPrompts: promptGroups.size,
    promptsWithBothArms,
    overallMeanA: allScoresA.length > 0 ? mean(allScoresA) : NaN,
    overallMeanB: allScoresB.length > 0 ? mean(allScoresB) : NaN,
    overallCohensD: overallD,
    overallEffectLabel: isNaN(overallD) ? 'N/A' : interpretCohensD(overallD),
    overallTTest,
    perPromptStats,
    significantPrompts,
    aFormedWins: perPromptStats.filter(p => p.direction === 'A-formed').length,
    bVanillaWins: perPromptStats.filter(p => p.direction === 'B-vanilla').length,
  };
}

function compareModels(
  summaries: ModelSummary[],
  records: GradedRecord[],
): { crossModel: CrossModelComparison[]; substrateTest: SubstrateIndependenceResult } {
  // Only models with both arms
  const dualArmModels = summaries.filter(s => s.promptsWithBothArms > 0);

  if (dualArmModels.length < 2) {
    return {
      crossModel: [],
      substrateTest: {
        promptsCompared: 0,
        directionAgreements: 0,
        directionDisagreements: 0,
        agreementRate: 0,
        correlationCoefficient: NaN,
        verdict: 'inconclusive',
        verdictReasoning: `Only ${dualArmModels.length} model(s) have both A-formed and B-vanilla data. Need >= 2 for cross-model comparison.`,
      },
    };
  }

  // Get phase1 data for reference
  const phase1Map = new Map<string, { d: number; direction: string }>();
  for (const r of records) {
    if (!phase1Map.has(r.promptId)) {
      phase1Map.set(r.promptId, {
        d: r.phase1CohensD,
        direction: r.phase1CohensD > 0 ? 'A-formed' : r.phase1CohensD < 0 ? 'B-vanilla' : 'null',
      });
    }
  }

  // Find prompts present in all dual-arm models
  const promptSets = dualArmModels.map(s =>
    new Set(s.perPromptStats.filter(p => p.nA > 0 && p.nB > 0).map(p => p.promptId))
  );
  const commonPrompts = [...promptSets[0]].filter(p => promptSets.every(s => s.has(p)));

  const crossModel: CrossModelComparison[] = [];
  const effectSizes: number[][] = dualArmModels.map(() => []);

  for (const promptId of commonPrompts) {
    const models = dualArmModels.map(s => {
      const stat = s.perPromptStats.find(p => p.promptId === promptId)!;
      return {
        model: s.model,
        cohensD: stat.cohensD,
        direction: stat.direction,
        meanA: stat.meanA,
        meanB: stat.meanB,
      };
    });

    // Track effect sizes for correlation
    for (let i = 0; i < dualArmModels.length; i++) {
      effectSizes[i].push(models[i].cohensD);
    }

    const directions = models.map(m => m.direction).filter(d => d !== 'null');
    const directionAgreement = directions.length >= 2 && new Set(directions).size === 1;

    const phase1 = phase1Map.get(promptId);
    crossModel.push({
      promptId,
      dimension: dualArmModels[0].perPromptStats.find(p => p.promptId === promptId)!.dimension,
      models,
      directionAgreement,
      phase1CohensD: phase1?.d ?? NaN,
      phase1Direction: phase1?.direction ?? 'unknown',
    });
  }

  // Substrate independence metrics
  const agreements = crossModel.filter(c => c.directionAgreement).length;
  const disagreements = crossModel.filter(c => !c.directionAgreement).length;
  const agreementRate = crossModel.length > 0 ? agreements / crossModel.length : 0;

  // Pearson correlation of effect sizes between model pairs
  let avgCorrelation = NaN;
  if (effectSizes.length >= 2 && effectSizes[0].length >= 3) {
    const correlations: number[] = [];
    for (let i = 0; i < effectSizes.length; i++) {
      for (let j = i + 1; j < effectSizes.length; j++) {
        correlations.push(pearsonCorrelation(effectSizes[i], effectSizes[j]));
      }
    }
    avgCorrelation = mean(correlations);
  }

  // Verdict
  let verdict: 'substrate-independent' | 'substrate-dependent' | 'inconclusive';
  let verdictReasoning: string;

  if (commonPrompts.length < 5) {
    verdict = 'inconclusive';
    verdictReasoning = `Only ${commonPrompts.length} prompts compared across models. Minimum 5 needed.`;
  } else if (agreementRate >= 0.7 && (isNaN(avgCorrelation) || avgCorrelation >= 0.3)) {
    verdict = 'substrate-independent';
    verdictReasoning = `${(agreementRate * 100).toFixed(0)}% direction agreement across models (${agreements}/${crossModel.length}). ` +
      `Effect size correlation: ${isNaN(avgCorrelation) ? 'N/A' : avgCorrelation.toFixed(3)}. ` +
      `Formation advantage generalizes across substrates.`;
  } else if (agreementRate < 0.4) {
    verdict = 'substrate-dependent';
    verdictReasoning = `Only ${(agreementRate * 100).toFixed(0)}% direction agreement (${agreements}/${crossModel.length}). ` +
      `Effect size correlation: ${isNaN(avgCorrelation) ? 'N/A' : avgCorrelation.toFixed(3)}. ` +
      `Formation effect is substrate-specific.`;
  } else {
    verdict = 'inconclusive';
    verdictReasoning = `${(agreementRate * 100).toFixed(0)}% direction agreement (${agreements}/${crossModel.length}). ` +
      `Effect size correlation: ${isNaN(avgCorrelation) ? 'N/A' : avgCorrelation.toFixed(3)}. ` +
      `Mixed evidence for substrate independence.`;
  }

  return {
    crossModel,
    substrateTest: {
      promptsCompared: commonPrompts.length,
      directionAgreements: agreements,
      directionDisagreements: disagreements,
      agreementRate,
      correlationCoefficient: avgCorrelation,
      verdict,
      verdictReasoning,
    },
  };
}

function main() {
  console.error('Loading phase2-graded records...');
  const allRecords = loadRecords();
  const successfulRecords = allRecords.filter(r => r.success);
  console.error(`Loaded ${allRecords.length} total, ${successfulRecords.length} successful`);

  // Identify models
  const models = [...new Set(successfulRecords.map(r => r.model))];
  console.error(`Models: ${models.join(', ')}`);

  // Per-model analysis
  const modelSummaries: ModelSummary[] = [];
  for (const model of models) {
    const summary = analyzeModel(allRecords, model);
    modelSummaries.push(summary);
    console.error(`\n=== ${model.toUpperCase()} ===`);
    console.error(`  Prompts: ${summary.totalPrompts} (${summary.promptsWithBothArms} with both arms)`);
    console.error(`  A-formed mean: ${isNaN(summary.overallMeanA) ? 'N/A' : summary.overallMeanA.toFixed(3)}`);
    console.error(`  B-vanilla mean: ${isNaN(summary.overallMeanB) ? 'N/A' : summary.overallMeanB.toFixed(3)}`);
    console.error(`  Cohen's d: ${isNaN(summary.overallCohensD) ? 'N/A' : summary.overallCohensD.toFixed(3)} (${summary.overallEffectLabel})`);
    console.error(`  t-test: t=${summary.overallTTest.t.toFixed(3)}, p=${summary.overallTTest.p.toFixed(6)}, sig=${summary.overallTTest.significant}`);
    console.error(`  Direction: A-formed wins ${summary.aFormedWins}, B-vanilla wins ${summary.bVanillaWins}`);
  }

  // Cross-model comparison
  console.error('\n=== CROSS-MODEL SUBSTRATE INDEPENDENCE ===');
  const { crossModel, substrateTest } = compareModels(modelSummaries, allRecords);
  console.error(`  Prompts compared: ${substrateTest.promptsCompared}`);
  console.error(`  Direction agreements: ${substrateTest.directionAgreements}`);
  console.error(`  Direction disagreements: ${substrateTest.directionDisagreements}`);
  console.error(`  Agreement rate: ${(substrateTest.agreementRate * 100).toFixed(1)}%`);
  console.error(`  Effect size correlation: ${isNaN(substrateTest.correlationCoefficient) ? 'N/A' : substrateTest.correlationCoefficient.toFixed(3)}`);
  console.error(`  VERDICT: ${substrateTest.verdict}`);
  console.error(`  ${substrateTest.verdictReasoning}`);

  // Vanilla baseline comparison (all models including O3)
  console.error('\n=== VANILLA BASELINE COMPARISON (all models) ===');
  for (const summary of modelSummaries) {
    const bScores = summary.perPromptStats.flatMap(p => p.scoresB);
    if (bScores.length > 0) {
      console.error(`  ${summary.model} B-vanilla: mean=${mean(bScores).toFixed(3)}, sd=${stdDev(bScores).toFixed(3)}, n=${bScores.length}`);
    }
  }

  // Top cross-model effects
  if (crossModel.length > 0) {
    console.error('\n=== TOP 10 CROSS-MODEL PROMPTS ===');
    const sorted = [...crossModel].sort((a, b) => {
      const avgA = mean(a.models.map(m => Math.abs(m.cohensD)));
      const avgB = mean(b.models.map(m => Math.abs(m.cohensD)));
      return avgB - avgA;
    });
    for (let i = 0; i < Math.min(10, sorted.length); i++) {
      const c = sorted[i];
      const agree = c.directionAgreement ? '✓' : '✗';
      console.error(`  ${agree} ${c.promptId} (${c.dimension})`);
      for (const m of c.models) {
        console.error(`    ${m.model}: d=${m.cohensD.toFixed(3)}, A=${m.meanA.toFixed(2)}, B=${m.meanB.toFixed(2)} → ${m.direction}`);
      }
      console.error(`    Phase1: d=${c.phase1CohensD.toFixed(3)}, dir=${c.phase1Direction}`);
    }
  }

  // Write output
  const output = {
    metadata: {
      totalRecords: allRecords.length,
      successfulRecords: successfulRecords.length,
      failedRecords: allRecords.length - successfulRecords.length,
      models: models,
      analysisDate: new Date().toISOString(),
    },
    modelSummaries: modelSummaries.map(s => ({
      model: s.model,
      totalPrompts: s.totalPrompts,
      promptsWithBothArms: s.promptsWithBothArms,
      overallMeanA: s.overallMeanA,
      overallMeanB: s.overallMeanB,
      overallCohensD: s.overallCohensD,
      overallEffectLabel: s.overallEffectLabel,
      overallTTest: s.overallTTest,
      aFormedWins: s.aFormedWins,
      bVanillaWins: s.bVanillaWins,
      significantPrompts: s.significantPrompts,
      perPromptStats: s.perPromptStats.map(p => ({
        promptId: p.promptId,
        dimension: p.dimension,
        meanA: p.meanA,
        meanB: p.meanB,
        nA: p.nA,
        nB: p.nB,
        cohensD: p.cohensD,
        effectLabel: p.effectLabel,
        pValue: p.pValue,
        direction: p.direction,
      })),
    })),
    crossModelComparison: crossModel.map(c => ({
      promptId: c.promptId,
      dimension: c.dimension,
      models: c.models,
      directionAgreement: c.directionAgreement,
      phase1CohensD: c.phase1CohensD,
      phase1Direction: c.phase1Direction,
    })),
    substrateIndependence: substrateTest,
    vanillaBaseline: modelSummaries.map(s => {
      const bScores = s.perPromptStats.flatMap(p => p.scoresB);
      return {
        model: s.model,
        mean: bScores.length > 0 ? mean(bScores) : NaN,
        sd: bScores.length > 0 ? stdDev(bScores) : NaN,
        n: bScores.length,
      };
    }),
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.error(`\n✅ Phase 2 analysis complete: ${OUTPUT_FILE}`);
}

main();

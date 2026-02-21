#!/usr/bin/env bun
/**
 * Phase1Analyzer.ts -- Analyze Phase 1 graded results and select top 40 prompts
 *
 * Reads phase1-graded.jsonl, groups by prompt, runs Welch's t-test + Cohen's d,
 * selects top 40 prompts by effect size for Phase 2 cross-model testing.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  welchTTest,
  cohensD,
  interpretCohensD,
  bonferroniCorrect,
} from '../Analysis/StatisticalAnalysis.ts';

const GRADED_FILE = join(import.meta.dir, '../Data/results/phase1-graded.jsonl');
const OUTPUT_FILE = join(import.meta.dir, '../Data/results/phase1-analysis.json');

interface GradedRecord {
  promptId: string;
  dimension: string;
  arm: string;
  model: string;
  response: string;
  latencyMs: number;
  timestamp: string;
  trial: number;
  score: number;
  reasoning: string;
  confidence: number;
}

interface PromptStats {
  promptId: string;
  dimension: string;
  armA: {
    scores: number[];
    mean: number;
    n: number;
  };
  armB: {
    scores: number[];
    mean: number;
    n: number;
  };
  cohensD: number;
  tStatistic: number;
  df: number;
  pValue: number;
  pValueCorrected: number;
  significant: boolean;
  direction: 'A-formed' | 'B-naive' | 'null';
  effectLabel: string;
}

// Load graded records
function loadGradedRecords(): GradedRecord[] {
  const lines = readFileSync(GRADED_FILE, 'utf-8').trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

// Compute mean
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Analyze a single prompt
function analyzePrompt(records: GradedRecord[]): PromptStats | null {
  if (records.length === 0) return null;

  const promptId = records[0].promptId;
  const dimension = records[0].dimension;

  const armARecords = records.filter(r => r.arm === 'A-formed');
  const armBRecords = records.filter(r => r.arm === 'B-vanilla');

  // Need at least 2 samples in each arm
  if (armARecords.length < 2 || armBRecords.length < 2) return null;

  const scoresA = armARecords.map(r => r.score);
  const scoresB = armBRecords.map(r => r.score);

  const meanA = mean(scoresA);
  const meanB = mean(scoresB);

  // Compute test statistics using library functions
  const tTest = welchTTest(scoresA, scoresB, 0.05);
  const d = cohensD(scoresA, scoresB);
  const effectLabel = interpretCohensD(d);

  // Determine direction
  let direction: 'A-formed' | 'B-naive' | 'null' = 'null';
  if (tTest.significant) {
    direction = meanA > meanB ? 'A-formed' : 'B-naive';
  }

  return {
    promptId,
    dimension,
    armA: { scores: scoresA, mean: meanA, n: scoresA.length },
    armB: { scores: scoresB, mean: meanB, n: scoresB.length },
    cohensD: d,
    tStatistic: tTest.t,
    df: tTest.df,
    pValue: tTest.p,
    pValueCorrected: tTest.p, // Will be updated after Bonferroni
    significant: tTest.significant,
    direction,
    effectLabel
  };
}

// Main analysis
function main() {
  console.error('Loading graded records...');
  const records = loadGradedRecords();
  console.error(`Loaded ${records.length} graded records`);

  // Group by promptId
  const promptGroups = new Map<string, GradedRecord[]>();
  for (const r of records) {
    const key = r.promptId;
    if (!promptGroups.has(key)) {
      promptGroups.set(key, []);
    }
    promptGroups.get(key)!.push(r);
  }

  console.error(`Analyzing ${promptGroups.size} prompts...`);

  // Analyze each prompt
  const results: PromptStats[] = [];
  for (const [promptId, group] of promptGroups.entries()) {
    const stats = analyzePrompt(group);
    if (stats) {
      results.push(stats);
    } else {
      console.error(`⚠️  Skipping ${promptId}: insufficient data`);
    }
  }

  // Apply Bonferroni correction (α = 0.05 / number of prompts)
  const pValues = results.map(r => r.pValue);
  const bonf = bonferroniCorrect(pValues, 0.05);

  for (let i = 0; i < results.length; i++) {
    results[i].pValueCorrected = bonf.corrected[i];
    results[i].significant = bonf.significant[i];
  }

  // Sort by absolute Cohen's d (effect size)
  results.sort((a, b) => Math.abs(b.cohensD) - Math.abs(a.cohensD));

  // Summary statistics
  const significant = results.filter(r => r.significant);
  const aFormedWins = significant.filter(r => r.direction === 'A-formed');
  const bNaiveWins = significant.filter(r => r.direction === 'B-naive');

  console.error('\n=== PHASE 1 ANALYSIS SUMMARY ===');
  console.error(`Total prompts analyzed: ${results.length}`);
  console.error(`Significant results (Bonferroni α=0.05): ${significant.length}`);
  console.error(`  - A-formed wins: ${aFormedWins.length}`);
  console.error(`  - B-naive wins: ${bNaiveWins.length}`);
  console.error(`  - Null results: ${results.length - significant.length}`);

  // Top 10 by effect size
  console.error(`\n=== TOP 10 PROMPTS BY EFFECT SIZE ===`);
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const sigMarker = r.significant ? '✓' : '✗';
    console.error(`${i + 1}. ${sigMarker} ${r.promptId} (${r.dimension})`);
    console.error(`   |d| = ${Math.abs(r.cohensD).toFixed(3)} (${r.effectLabel})`);
    console.error(`   A: μ=${r.armA.mean.toFixed(2)}, B: μ=${r.armB.mean.toFixed(2)}`);
    console.error(`   p = ${r.pValueCorrected.toFixed(4)}, direction: ${r.direction}`);
  }

  // Top 40 for Phase 2
  const top40 = results.slice(0, 40);

  const output = {
    metadata: {
      totalPrompts: results.length,
      gradedRecords: records.length,
      significantResults: significant.length,
      aFormedWins: aFormedWins.length,
      bNaiveWins: bNaiveWins.length,
      nullResults: results.length - significant.length,
      analysisDate: new Date().toISOString(),
      bonferroniAlpha: 0.05 / results.length
    },
    top40Prompts: top40.map(r => ({
      promptId: r.promptId,
      dimension: r.dimension,
      cohensD: r.cohensD,
      absCohensD: Math.abs(r.cohensD),
      effectLabel: r.effectLabel,
      pValue: r.pValue,
      pValueCorrected: r.pValueCorrected,
      significant: r.significant,
      direction: r.direction,
      meanA: r.armA.mean,
      meanB: r.armB.mean,
      nA: r.armA.n,
      nB: r.armB.n
    })),
    fullResults: results.map(r => ({
      promptId: r.promptId,
      dimension: r.dimension,
      cohensD: r.cohensD,
      absCohensD: Math.abs(r.cohensD),
      effectLabel: r.effectLabel,
      pValue: r.pValue,
      pValueCorrected: r.pValueCorrected,
      significant: r.significant,
      direction: r.direction,
      meanA: r.armA.mean,
      meanB: r.armB.mean
    }))
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.error(`\n✅ Analysis complete: ${OUTPUT_FILE}`);
  console.error(`✅ Top 40 prompts selected for Phase 2 cross-model test`);

  // Distribution summary
  console.error(`\n=== TOP 40 DIMENSION DISTRIBUTION ===`);
  const dimCounts = new Map<string, number>();
  for (const p of top40) {
    dimCounts.set(p.dimension, (dimCounts.get(p.dimension) || 0) + 1);
  }
  for (const [dim, count] of Array.from(dimCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${dim}: ${count} prompts`);
  }
}

main();

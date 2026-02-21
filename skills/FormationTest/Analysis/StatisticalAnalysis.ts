#!/usr/bin/env bun
/**
 * StatisticalAnalysis - Pure TypeScript statistical tests for formation experiments
 *
 * No external dependencies. All math implemented from scratch.
 */

// ============================================================================
// Types
// ============================================================================

export interface TTestResult {
  t: number;
  df: number;
  p: number;
  significant: boolean;
}

export interface WilcoxonResult {
  W: number;
  z: number;
  p: number;
  significant: boolean;
}

export interface FriedmanResult {
  chiSquare: number;
  df: number;
  p: number;
  significant: boolean;
}

// ============================================================================
// Basic helpers
// ============================================================================

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function variance(arr: number[], ddof: number = 1): number {
  if (arr.length <= ddof) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - ddof);
}

export function stdDev(arr: number[], ddof: number = 1): number {
  return Math.sqrt(variance(arr, ddof));
}

export function rank(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    // Find ties
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    // Average rank for ties
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

// ============================================================================
// Distribution approximations
// ============================================================================

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
 * Accurate to ~1.5e-7
 */
export function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Log-gamma function (Lanczos approximation)
 */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Regularized incomplete beta function (continued fraction approximation)
 * Used for t-distribution CDF
 */
function betaIncomplete(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if needed for convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction
  const maxIter = 200;
  const eps = 1e-14;

  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    result *= d * c;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    result *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return front * result;
}

/**
 * t-distribution CDF
 */
export function tCDF(t: number, df: number): number {
  if (df <= 0) return NaN;

  // For large df, approximate with normal
  if (df > 1000) return normalCDF(t);

  const x = df / (df + t * t);
  const prob = 0.5 * betaIncomplete(df / 2, 0.5, x);

  return t >= 0 ? 1 - prob : prob;
}

/**
 * Chi-square CDF approximation using Wilson-Hilferty normal approximation
 */
export function chiSquareCDF(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0;
  // Wilson-Hilferty transformation
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return normalCDF(z / denom);
}

// ============================================================================
// Statistical tests
// ============================================================================

/**
 * Welch's t-test for unequal variances (two-tailed)
 */
export function welchTTest(group1: number[], group2: number[], alpha: number = 0.05): TTestResult {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: NaN, p: NaN, significant: false };
  }

  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);
  const se1 = v1 / n1;
  const se2 = v2 / n2;
  const se = Math.sqrt(se1 + se2);

  if (se === 0) {
    return { t: 0, df: n1 + n2 - 2, p: 1, significant: false };
  }

  const t = (m1 - m2) / se;

  // Welch-Satterthwaite degrees of freedom
  const df = (se1 + se2) ** 2 / ((se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1));

  // Two-tailed p-value
  const p = 2 * (1 - tCDF(Math.abs(t), df));

  return { t, df, p, significant: p < alpha };
}

/**
 * Cohen's d effect size (pooled standard deviation)
 */
export function cohensD(group1: number[], group2: number[]): number {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) return NaN;

  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);

  // Pooled standard deviation
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const pooledSD = Math.sqrt(pooledVar);

  if (pooledSD === 0) return 0;
  return (m1 - m2) / pooledSD;
}

/**
 * Interpret Cohen's d magnitude
 */
export function interpretCohensD(d: number): string {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Wilcoxon signed-rank test for paired samples
 */
export function wilcoxonSignedRank(pairs: [number, number][], alpha: number = 0.05): WilcoxonResult {
  // Compute differences, exclude zeros
  const diffs = pairs
    .map(([a, b]) => a - b)
    .filter(d => d !== 0);

  const n = diffs.length;
  if (n < 5) {
    return { W: NaN, z: NaN, p: NaN, significant: false };
  }

  const absDiffs = diffs.map(Math.abs);
  const ranks = rank(absDiffs);

  // Sum of positive ranks
  let Wplus = 0;
  let Wminus = 0;
  for (let i = 0; i < n; i++) {
    if (diffs[i] > 0) Wplus += ranks[i];
    else Wminus += ranks[i];
  }

  const W = Math.min(Wplus, Wminus);

  // Normal approximation (with continuity correction)
  const meanW = n * (n + 1) / 4;
  const sdW = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);

  const z = (W - meanW + 0.5) / sdW; // continuity correction
  const p = 2 * normalCDF(z); // two-tailed (z will be negative since W < meanW)

  return { W, z, p, significant: p < alpha };
}

/**
 * Friedman test for k related groups
 */
export function friedmanTest(groups: number[][], alpha: number = 0.05): FriedmanResult {
  const k = groups.length;

  if (k < 2) {
    return { chiSquare: NaN, df: NaN, p: NaN, significant: false };
  }

  // All groups must have same length (n subjects)
  const n = groups[0].length;
  if (groups.some(g => g.length !== n)) {
    return { chiSquare: NaN, df: NaN, p: NaN, significant: false };
  }

  if (n < 2) {
    return { chiSquare: NaN, df: NaN, p: NaN, significant: false };
  }

  // Rank within each subject (row)
  const rankSums = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = groups.map(g => g[i]);
    const rowRanks = rank(row);
    for (let j = 0; j < k; j++) {
      rankSums[j] += rowRanks[j];
    }
  }

  // Friedman statistic
  const chiSquare = (12 / (n * k * (k + 1))) *
    rankSums.reduce((s, r) => s + r ** 2, 0) -
    3 * n * (k + 1);

  const df = k - 1;
  const p = 1 - chiSquareCDF(chiSquare, df);

  return { chiSquare, df, p, significant: p < alpha };
}

/**
 * Cohen's kappa for inter-rater reliability
 * Expects integer category labels
 */
export function cohensKappa(rater1: number[], rater2: number[]): number {
  if (rater1.length !== rater2.length || rater1.length === 0) return NaN;

  const n = rater1.length;
  const categories = new Set([...rater1, ...rater2]);

  // Observed agreement
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (rater1[i] === rater2[i]) agree++;
  }
  const po = agree / n;

  // Expected agreement by chance
  let pe = 0;
  for (const cat of categories) {
    const p1 = rater1.filter(v => v === cat).length / n;
    const p2 = rater2.filter(v => v === cat).length / n;
    pe += p1 * p2;
  }

  if (pe === 1) return 1; // Perfect expected agreement edge case
  return (po - pe) / (1 - pe);
}

/**
 * Interpret Cohen's kappa
 */
export function interpretKappa(k: number): string {
  if (k < 0) return 'poor';
  if (k < 0.20) return 'slight';
  if (k < 0.40) return 'fair';
  if (k < 0.60) return 'moderate';
  if (k < 0.80) return 'substantial';
  return 'almost perfect';
}

/**
 * Bonferroni correction for multiple comparisons
 */
export function bonferroniCorrect(
  pValues: number[],
  alpha: number = 0.05,
): { corrected: number[]; significant: boolean[] } {
  const m = pValues.length;
  const corrected = pValues.map(p => Math.min(p * m, 1));
  const significant = corrected.map(p => p < alpha);
  return { corrected, significant };
}

// ============================================================================
// Phase Analysis Types
// ============================================================================

export interface DimensionAnalysis {
  dimension: string;
  tTest?: TTestResult;
  effectSize?: number;
  effectLabel?: string;
  friedman?: FriedmanResult;
  pairwise?: { comparison: string; wilcoxon: WilcoxonResult }[];
  meanFormed?: number;
  meanVanilla?: number;
  meanTransplant?: number;
  meanSummary?: number;
}

export interface AnalysisSummary {
  phase: number;
  dimensions: DimensionAnalysis[];
  interRaterKappa: number;
  overallSignificant: boolean;
}

// ============================================================================
// Phase Analysis Functions
// ============================================================================

import { readFileSync, existsSync } from 'fs';
import { parseArgs } from 'util';

interface Phase1Record {
  prompt_id: string;
  dimension: string;
  scores_formed: number[];
  scores_vanilla: number[];
  evaluator_scores?: Record<string, number[]>;
}

interface Phase3Record {
  prompt_id: string;
  dimension: string;
  scores_formed: number[];
  scores_transplant: number[];
  scores_summary: number[];
  scores_vanilla: number[];
  evaluator_scores?: Record<string, number[]>;
}

function loadJSONL<T>(path: string): T[] {
  if (!existsSync(path)) {
    throw new Error(`Results file not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter((l: string) => l.length > 0)
    .map((l: string) => JSON.parse(l) as T);
}

function groupByDimension<T extends { dimension: string }>(records: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const rec of records) {
    if (!groups[rec.dimension]) groups[rec.dimension] = [];
    groups[rec.dimension].push(rec);
  }
  return groups;
}

/**
 * Run Phase 1 analysis: A/B test (formed vs vanilla).
 * Welch's t-test per dimension with Bonferroni correction (alpha = 0.01).
 */
export function analyzePhase1(resultsPath: string): AnalysisSummary {
  const records = loadJSONL<Phase1Record>(resultsPath);
  const dimensions = groupByDimension(records);
  const dimAnalyses: DimensionAnalysis[] = [];
  const pValues: number[] = [];

  for (const [dim, recs] of Object.entries(dimensions)) {
    const formed = recs.flatMap(r => r.scores_formed);
    const vanilla = recs.flatMap(r => r.scores_vanilla);

    const tTest = welchTTest(formed, vanilla, 0.01);
    const d = cohensD(formed, vanilla);

    pValues.push(tTest.p);
    dimAnalyses.push({
      dimension: dim,
      tTest,
      effectSize: d,
      effectLabel: interpretCohensD(d),
      meanFormed: mean(formed),
      meanVanilla: mean(vanilla),
    });
  }

  // Apply Bonferroni correction
  const bonf = bonferroniCorrect(pValues, 0.01);
  for (let i = 0; i < dimAnalyses.length; i++) {
    if (dimAnalyses[i].tTest) {
      dimAnalyses[i].tTest!.p = bonf.corrected[i];
      dimAnalyses[i].tTest!.significant = bonf.significant[i];
    }
  }

  // Inter-rater reliability
  let kappa = 0;
  const firstRec = records[0];
  if (firstRec?.evaluator_scores) {
    const names = Object.keys(firstRec.evaluator_scores);
    if (names.length >= 2) {
      const r1 = records.flatMap(r => r.evaluator_scores?.[names[0]] || []);
      const r2 = records.flatMap(r => r.evaluator_scores?.[names[1]] || []);
      kappa = cohensKappa(r1, r2);
    }
  }

  return {
    phase: 1,
    dimensions: dimAnalyses,
    interRaterKappa: kappa,
    overallSignificant: dimAnalyses.filter(d => d.tTest?.significant).length >= 3,
  };
}

/**
 * Run Phase 3 analysis: 4-arm context transplant.
 * Friedman test + Wilcoxon signed-rank post-hoc with Bonferroni.
 */
export function analyzePhase3(resultsPath: string): AnalysisSummary {
  const records = loadJSONL<Phase3Record>(resultsPath);
  const dimensions = groupByDimension(records);
  const dimAnalyses: DimensionAnalysis[] = [];

  for (const [dim, recs] of Object.entries(dimensions)) {
    const formed = recs.flatMap(r => r.scores_formed);
    const transplant = recs.flatMap(r => r.scores_transplant);
    const summary = recs.flatMap(r => r.scores_summary);
    const vanilla = recs.flatMap(r => r.scores_vanilla);

    const friedman = friedmanTest([formed, transplant, summary, vanilla]);

    // Pairwise Wilcoxon post-hoc (6 comparisons, Bonferroni alpha = 0.05/6)
    const arms = [
      { name: 'Formed', data: formed },
      { name: 'Transplant', data: transplant },
      { name: 'Summary', data: summary },
      { name: 'Vanilla', data: vanilla },
    ];

    const pairwiseResults: { comparison: string; wilcoxon: WilcoxonResult }[] = [];
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        const minLen = Math.min(arms[i].data.length, arms[j].data.length);
        const pairs: [number, number][] = [];
        for (let k = 0; k < minLen; k++) {
          pairs.push([arms[i].data[k], arms[j].data[k]]);
        }
        pairwiseResults.push({
          comparison: `${arms[i].name} vs ${arms[j].name}`,
          wilcoxon: wilcoxonSignedRank(pairs, 0.05 / 6),
        });
      }
    }

    dimAnalyses.push({
      dimension: dim,
      friedman,
      pairwise: pairwiseResults,
      effectSize: cohensD(formed, transplant),
      effectLabel: interpretCohensD(cohensD(formed, transplant)),
      meanFormed: mean(formed),
      meanTransplant: mean(transplant),
      meanSummary: mean(summary),
      meanVanilla: mean(vanilla),
    });
  }

  // Inter-rater reliability
  let kappa = 0;
  const firstRec = records[0];
  if ((firstRec as any)?.evaluator_scores) {
    const names = Object.keys((firstRec as any).evaluator_scores);
    if (names.length >= 2) {
      const r1 = records.flatMap(r => (r as any).evaluator_scores?.[names[0]] || []);
      const r2 = records.flatMap(r => (r as any).evaluator_scores?.[names[1]] || []);
      kappa = cohensKappa(r1, r2);
    }
  }

  const formedBeatTransplant = dimAnalyses.filter(d => {
    const fvt = d.pairwise?.find(p => p.comparison === 'Formed vs Transplant');
    return fvt?.wilcoxon.significant && (d.meanFormed || 0) > (d.meanTransplant || 0);
  }).length;

  return {
    phase: 3,
    dimensions: dimAnalyses,
    interRaterKappa: kappa,
    overallSignificant: formedBeatTransplant >= 3,
  };
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      phase: { type: 'string', short: 'p' },
      results: { type: 'string', short: 'r' },
      'self-test': { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: false,
  });

  if (values.help) {
    console.log(`StatisticalAnalysis - Formation Test Statistical Analysis

Usage:
  bun StatisticalAnalysis.ts --phase <1|3> --results <path>
  bun StatisticalAnalysis.ts --self-test

Options:
  -p, --phase <N>      Phase number (1 for A/B, 3 for transplant)
  -r, --results <path>  Path to results JSONL file
      --self-test       Run self-test with sample data
      --help            Show this help`);
    process.exit(0);
  }

  if (values['self-test']) {
    console.log('StatisticalAnalysis self-test:\n');

    const g1 = [4.2, 3.8, 4.5, 3.9, 4.1, 4.3, 3.7, 4.0];
    const g2 = [3.1, 2.9, 3.3, 2.8, 3.0, 3.2, 2.7, 3.1];

    console.log('Welch t-test (formed vs vanilla):');
    const tResult = welchTTest(g1, g2);
    console.log(`  t=${tResult.t.toFixed(4)}, df=${tResult.df.toFixed(2)}, p=${tResult.p.toFixed(6)}, sig=${tResult.significant}`);

    console.log(`\nCohen's d: ${cohensD(g1, g2).toFixed(4)} (${interpretCohensD(cohensD(g1, g2))})`);

    const pairs: [number, number][] = g1.map((v, i) => [v, g2[i]]);
    console.log('\nWilcoxon signed-rank:');
    const wResult = wilcoxonSignedRank(pairs);
    console.log(`  W=${wResult.W.toFixed(2)}, z=${wResult.z.toFixed(4)}, p=${wResult.p.toFixed(6)}, sig=${wResult.significant}`);

    const g3 = [3.5, 3.2, 3.8, 3.3, 3.6, 3.4, 3.1, 3.5];
    const g4 = [2.8, 2.5, 3.0, 2.6, 2.9, 2.7, 2.4, 2.8];
    console.log('\nFriedman test (4 groups):');
    const fResult = friedmanTest([g1, g2, g3, g4]);
    console.log(`  chi2=${fResult.chiSquare.toFixed(4)}, df=${fResult.df}, p=${fResult.p.toFixed(6)}, sig=${fResult.significant}`);

    const r1 = [1, 2, 3, 3, 2, 1, 2, 3, 1, 2];
    const r2 = [1, 2, 3, 3, 2, 2, 2, 3, 1, 3];
    console.log(`\nCohen's kappa: ${cohensKappa(r1, r2).toFixed(4)} (${interpretKappa(cohensKappa(r1, r2))})`);

    console.log('\nBonferroni correction:');
    const pVals = [0.01, 0.03, 0.04, 0.15, 0.001];
    const bonfResult = bonferroniCorrect(pVals);
    pVals.forEach((p, i) => {
      console.log(`  p=${p} -> corrected=${bonfResult.corrected[i].toFixed(4)}, sig=${bonfResult.significant[i]}`);
    });
    process.exit(0);
  }

  // Phase analysis mode
  const phase = parseInt(values.phase || '0', 10);
  const resultsPath = values.results;

  if (!resultsPath) {
    console.error('[StatisticalAnalysis] Error: --results path is required (or use --self-test)');
    process.exit(1);
  }

  try {
    let summary: AnalysisSummary;

    if (phase === 1) {
      summary = analyzePhase1(resultsPath);
    } else if (phase === 3) {
      summary = analyzePhase3(resultsPath);
    } else {
      console.error('[StatisticalAnalysis] Error: --phase must be 1 or 3');
      process.exit(1);
    }

    console.log(JSON.stringify(summary, null, 2));

    console.error(`\n[StatisticalAnalysis] Phase ${phase} Analysis Complete`);
    console.error(`  Overall significant: ${summary.overallSignificant}`);
    console.error(`  Inter-rater Kappa: ${summary.interRaterKappa.toFixed(3)}`);
    for (const dim of summary.dimensions) {
      const sig = dim.tTest?.significant ?? dim.friedman?.significant ?? false;
      const effect = dim.effectSize != null ? ` (d=${dim.effectSize.toFixed(3)}, ${dim.effectLabel})` : '';
      console.error(`  ${dim.dimension}: ${sig ? 'SIGNIFICANT' : 'not significant'}${effect}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[StatisticalAnalysis] Error: ${msg}`);
    process.exit(1);
  }
}

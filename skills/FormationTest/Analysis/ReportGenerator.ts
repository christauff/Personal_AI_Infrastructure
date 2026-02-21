#!/usr/bin/env bun
/**
 * ReportGenerator - Self-contained HTML report for formation test results
 *
 * Generates a single-file HTML page with:
 * - Summary table of results per phase
 * - Per-dimension bar charts (inline SVG)
 * - Statistical test results table
 * - Effect sizes with interpretation
 * - Inter-rater reliability scores
 * - Methodology section
 * - Raw data download links
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { interpretCohensD, interpretKappa } from './StatisticalAnalysis.ts';

const REPORTS_DIR = join(import.meta.dir, '..', 'Data', 'reports');

// ============================================================================
// Types
// ============================================================================

export interface DimensionResult {
  dimension: string;
  meanFormed: number;
  meanVanilla: number;
  meanTransplant?: number;
  meanSummary?: number;
  effectSize: number;    // Cohen's d
  pValue: number;
  significant: boolean;
}

export interface PhaseResult {
  phase: number;
  name: string;
  description: string;
  dimensions: DimensionResult[];
  overallEffect: number;
  overallP: number;
  n: number;             // Number of prompts tested
  timestamp: string;
}

export interface RaterReliability {
  rater1: string;
  rater2: string;
  kappa: number;
}

export interface AnalysisSummary {
  friedmanP?: number;
  friedmanChi2?: number;
  bonferroniResults?: { dimension: string; correctedP: number; significant: boolean }[];
  raterReliability?: RaterReliability[];
  notes?: string[];
}

// ============================================================================
// SVG Bar Chart
// ============================================================================

function barChart(
  title: string,
  labels: string[],
  groups: { name: string; values: number[]; color: string }[],
  width: number = 600,
  height: number = 300,
): string {
  const margin = { top: 40, right: 120, bottom: 60, left: 50 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const maxVal = Math.max(5, ...groups.flatMap(g => g.values));
  const groupCount = groups.length;
  const barGroupWidth = plotW / labels.length;
  const barWidth = (barGroupWidth * 0.7) / groupCount;
  const barGap = barGroupWidth * 0.3 / (groupCount + 1);

  let bars = '';
  for (let li = 0; li < labels.length; li++) {
    const groupX = margin.left + li * barGroupWidth;
    for (let gi = 0; gi < groupCount; gi++) {
      const val = groups[gi].values[li] || 0;
      const barH = (val / maxVal) * plotH;
      const x = groupX + barGap * (gi + 1) + barWidth * gi;
      const y = margin.top + plotH - barH;
      bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${groups[gi].color}" rx="2"/>`;
      bars += `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#333">${val.toFixed(2)}</text>`;
    }
    // X-axis label
    const labelX = groupX + barGroupWidth / 2;
    const labelY = margin.top + plotH + 14;
    const shortLabel = labels[li].length > 16 ? labels[li].substring(0, 14) + '..' : labels[li];
    bars += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" fill="#555" transform="rotate(-25, ${labelX}, ${labelY})">${escapeHtml(shortLabel)}</text>`;
  }

  // Y-axis ticks
  let yAxis = '';
  for (let tick = 0; tick <= 5; tick++) {
    const y = margin.top + plotH - (tick / maxVal) * plotH;
    yAxis += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    yAxis += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${tick}</text>`;
  }

  // Legend
  let legend = '';
  for (let gi = 0; gi < groupCount; gi++) {
    const ly = margin.top + gi * 18;
    const lx = width - margin.right + 10;
    legend += `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${groups[gi].color}" rx="2"/>`;
    legend += `<text x="${lx + 16}" y="${ly + 10}" font-size="11" fill="#333">${escapeHtml(groups[gi].name)}</text>`;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="font-family: system-ui, sans-serif; background: #fafafa; border-radius: 8px; border: 1px solid #ddd;">
  <text x="${width / 2}" y="${margin.top - 14}" text-anchor="middle" font-size="14" font-weight="bold" fill="#222">${escapeHtml(title)}</text>
  ${yAxis}
  ${bars}
  ${legend}
</svg>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================================
// HTML Generation
// ============================================================================

export function generateReport(results: PhaseResult[], analysis: AnalysisSummary): string {
  const timestamp = new Date().toISOString().split('T')[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Formation Test Report -- ${timestamp}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #222; background: #f5f5f0; line-height: 1.6; padding: 2rem; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin: 2rem 0 0.8rem; border-bottom: 2px solid #333; padding-bottom: 0.3rem; }
  h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #ddd; font-size: 0.9rem; }
  th { background: #333; color: #fff; font-weight: 600; }
  tr:hover { background: #f0f0e8; }
  .sig { color: #0a7; font-weight: bold; }
  .not-sig { color: #a55; }
  .effect-large { background: #d4edda; }
  .effect-medium { background: #fff3cd; }
  .effect-small { background: #f8d7da; }
  .chart-container { margin: 1.5rem 0; overflow-x: auto; }
  .methodology { background: #fff; padding: 1.5rem; border-radius: 8px; border: 1px solid #ddd; margin: 1rem 0; }
  .notes { background: #fffef0; padding: 1rem; border-left: 4px solid #d4a; margin: 1rem 0; font-size: 0.9rem; }
  .downloads { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
  .downloads a { display: inline-block; padding: 0.5rem 1rem; background: #333; color: #fff; text-decoration: none; border-radius: 4px; font-size: 0.85rem; }
  .downloads a:hover { background: #555; }
  .summary-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .card { background: #fff; padding: 1rem; border-radius: 8px; border: 1px solid #ddd; text-align: center; }
  .card .value { font-size: 2rem; font-weight: bold; }
  .card .label { font-size: 0.85rem; color: #666; }
</style>
</head>
<body>

<h1>Formation Test Report</h1>
<div class="meta">Generated: ${timestamp} | Framework: FormationTest v1.0</div>

${renderSummaryCards(results)}

<h2>Phase Results</h2>
${results.map(renderPhaseSection).join('\n')}

<h2>Statistical Analysis</h2>
${renderStatisticsTable(results, analysis)}

<h2>Effect Sizes</h2>
${renderEffectSizeTable(results)}

${renderReliabilitySection(analysis)}

${renderCharts(results)}

<h2>Methodology</h2>
${renderMethodology()}

<h2>Raw Data</h2>
${renderDownloadLinks()}

${analysis.notes && analysis.notes.length > 0 ? `<h2>Notes</h2><div class="notes"><ul>${analysis.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}

</body>
</html>`;
}

function renderSummaryCards(results: PhaseResult[]): string {
  const totalPrompts = results.reduce((s, r) => s + r.n, 0);
  const allEffects = results.flatMap(r => r.dimensions.map(d => d.effectSize));
  const avgEffect = allEffects.length > 0 ? allEffects.reduce((s, v) => s + v, 0) / allEffects.length : 0;
  const sigCount = results.flatMap(r => r.dimensions).filter(d => d.significant).length;
  const totalDims = results.flatMap(r => r.dimensions).length;

  return `<div class="summary-card">
  <div class="card"><div class="value">${results.length}</div><div class="label">Phases Completed</div></div>
  <div class="card"><div class="value">${totalPrompts}</div><div class="label">Total Prompts</div></div>
  <div class="card"><div class="value">${avgEffect.toFixed(2)}</div><div class="label">Mean Effect Size (d)</div></div>
  <div class="card"><div class="value">${sigCount}/${totalDims}</div><div class="label">Significant Comparisons</div></div>
</div>`;
}

function renderPhaseSection(phase: PhaseResult): string {
  const hasTransplant = phase.dimensions[0]?.meanTransplant !== undefined;
  const hasSummary = phase.dimensions[0]?.meanSummary !== undefined;

  return `<h3>Phase ${phase.phase}: ${escapeHtml(phase.name)}</h3>
<p style="color:#666; margin-bottom:0.5rem;">${escapeHtml(phase.description)} (n=${phase.n}, ${phase.timestamp})</p>
<table>
  <tr><th>Dimension</th><th>Formed</th><th>Vanilla</th>${hasTransplant ? '<th>Transplant</th>' : ''}${hasSummary ? '<th>Summary</th>' : ''}<th>d</th><th>p</th><th>Sig</th></tr>
  ${phase.dimensions.map(d => {
    const effectClass = Math.abs(d.effectSize) >= 0.8 ? 'effect-large' : Math.abs(d.effectSize) >= 0.5 ? 'effect-medium' : 'effect-small';
    return `<tr>
      <td>${escapeHtml(d.dimension)}</td>
      <td>${d.meanFormed.toFixed(2)}</td>
      <td>${d.meanVanilla.toFixed(2)}</td>
      ${hasTransplant ? `<td>${(d.meanTransplant ?? 0).toFixed(2)}</td>` : ''}
      ${hasSummary ? `<td>${(d.meanSummary ?? 0).toFixed(2)}</td>` : ''}
      <td class="${effectClass}">${d.effectSize.toFixed(3)} (${interpretCohensD(d.effectSize)})</td>
      <td>${d.pValue < 0.001 ? '&lt; .001' : d.pValue.toFixed(4)}</td>
      <td class="${d.significant ? 'sig' : 'not-sig'}">${d.significant ? 'YES' : 'no'}</td>
    </tr>`;
  }).join('\n  ')}
  <tr style="font-weight:bold; border-top:2px solid #333;">
    <td>Overall</td>
    <td colspan="${1 + (hasTransplant ? 1 : 0) + (hasSummary ? 1 : 0) + 1}"></td>
    <td>${phase.overallEffect.toFixed(3)}</td>
    <td>${phase.overallP < 0.001 ? '&lt; .001' : phase.overallP.toFixed(4)}</td>
    <td class="${phase.overallP < 0.05 ? 'sig' : 'not-sig'}">${phase.overallP < 0.05 ? 'YES' : 'no'}</td>
  </tr>
</table>`;
}

function renderStatisticsTable(results: PhaseResult[], analysis: AnalysisSummary): string {
  let rows = '';

  for (const phase of results) {
    rows += `<tr><td colspan="4" style="background:#eee; font-weight:bold;">Phase ${phase.phase}: ${escapeHtml(phase.name)}</td></tr>`;
    for (const d of phase.dimensions) {
      rows += `<tr><td>${escapeHtml(d.dimension)}</td><td>Welch t-test</td><td>${d.pValue < 0.001 ? '&lt; .001' : d.pValue.toFixed(4)}</td><td class="${d.significant ? 'sig' : 'not-sig'}">${d.significant ? 'Significant' : 'Not significant'}</td></tr>`;
    }
  }

  if (analysis.friedmanP !== undefined) {
    rows += `<tr><td>4-arm comparison</td><td>Friedman</td><td>${analysis.friedmanP < 0.001 ? '&lt; .001' : analysis.friedmanP.toFixed(4)}</td><td class="${analysis.friedmanP < 0.05 ? 'sig' : 'not-sig'}">${analysis.friedmanP < 0.05 ? 'Significant' : 'Not significant'}</td></tr>`;
  }

  if (analysis.bonferroniResults) {
    rows += `<tr><td colspan="4" style="background:#eee; font-weight:bold;">Bonferroni-corrected</td></tr>`;
    for (const b of analysis.bonferroniResults) {
      rows += `<tr><td>${escapeHtml(b.dimension)}</td><td>Bonferroni</td><td>${b.correctedP < 0.001 ? '&lt; .001' : b.correctedP.toFixed(4)}</td><td class="${b.significant ? 'sig' : 'not-sig'}">${b.significant ? 'Significant' : 'Not significant'}</td></tr>`;
    }
  }

  return `<table><tr><th>Comparison</th><th>Test</th><th>p-value</th><th>Result</th></tr>${rows}</table>`;
}

function renderEffectSizeTable(results: PhaseResult[]): string {
  const allDims = results.flatMap(r => r.dimensions.map(d => ({ phase: r.phase, ...d })));

  const rows = allDims.map(d => {
    const absD = Math.abs(d.effectSize);
    const interp = interpretCohensD(d.effectSize);
    const effectClass = absD >= 0.8 ? 'effect-large' : absD >= 0.5 ? 'effect-medium' : 'effect-small';
    return `<tr><td>P${d.phase}</td><td>${escapeHtml(d.dimension)}</td><td class="${effectClass}">${d.effectSize.toFixed(3)}</td><td>${interp}</td><td>${absD >= 0.8 ? 'Strong evidence' : absD >= 0.5 ? 'Moderate evidence' : absD >= 0.2 ? 'Weak evidence' : 'No meaningful difference'}</td></tr>`;
  }).join('\n');

  return `<table><tr><th>Phase</th><th>Dimension</th><th>Cohen\'s d</th><th>Magnitude</th><th>Interpretation</th></tr>${rows}</table>`;
}

function renderReliabilitySection(analysis: AnalysisSummary): string {
  if (!analysis.raterReliability || analysis.raterReliability.length === 0) return '';

  const rows = analysis.raterReliability.map(r => {
    const interp = interpretKappa(r.kappa);
    return `<tr><td>${escapeHtml(r.rater1)}</td><td>${escapeHtml(r.rater2)}</td><td>${r.kappa.toFixed(3)}</td><td>${interp}</td></tr>`;
  }).join('\n');

  return `<h2>Inter-Rater Reliability</h2>
<table><tr><th>Rater 1</th><th>Rater 2</th><th>Cohen's Kappa</th><th>Interpretation</th></tr>${rows}</table>`;
}

function renderCharts(results: PhaseResult[]): string {
  if (results.length === 0) return '';

  const charts: string[] = [];

  for (const phase of results) {
    const labels = phase.dimensions.map(d => d.dimension);
    const groups: { name: string; values: number[]; color: string }[] = [
      { name: 'Formed (A)', values: phase.dimensions.map(d => d.meanFormed), color: '#2563eb' },
      { name: 'Vanilla (D)', values: phase.dimensions.map(d => d.meanVanilla), color: '#94a3b8' },
    ];

    if (phase.dimensions[0]?.meanTransplant !== undefined) {
      groups.splice(1, 0, { name: 'Transplant (B)', values: phase.dimensions.map(d => d.meanTransplant || 0), color: '#f59e0b' });
    }
    if (phase.dimensions[0]?.meanSummary !== undefined) {
      groups.splice(groups.length - 1, 0, { name: 'Summary (C)', values: phase.dimensions.map(d => d.meanSummary || 0), color: '#10b981' });
    }

    const chart = barChart(`Phase ${phase.phase}: ${phase.name}`, labels, groups, 700, 320);
    charts.push(`<div class="chart-container">${chart}</div>`);
  }

  return `<h2>Dimension Charts</h2>${charts.join('\n')}`;
}

function renderMethodology(): string {
  return `<div class="methodology">
<p><strong>Design:</strong> Formation testing uses a 4-arm controlled experiment. Arm A receives the full formation context (core memory, catch logs, pattern index, 18 reading syntheses). Arm B receives the same factual content repackaged as a static reference document (formation framing stripped). Arm C receives a hand-written behavioral summary. Arm D is vanilla Claude with no system prompt.</p>

<p><strong>Evaluation:</strong> Responses are scored on 5 dimensions using LLM-as-judge (FormationRubricGrader): unprompted connection, resolution resistance, productive disagreement, textual specificity, and misattribution detection. Each dimension is rated 1-5 with reasoning and confidence.</p>

<p><strong>Blinding:</strong> All responses are assigned random anonymous IDs. Evaluators receive only the anonymous response text and prompt. Arm assignment is stored in a separate key file for unblinding during analysis.</p>

<p><strong>Statistics:</strong> Welch's t-test (unequal variance) for pairwise comparisons. Friedman test for 4-arm omnibus comparison. Bonferroni correction for multiple comparisons. Cohen's d for effect sizes. Cohen's kappa for inter-rater reliability.</p>

<p><strong>Phases:</strong> Phase 1 (baseline): Formed vs. Vanilla on full 130+ prompt battery. Phase 2 (cross-model): High-signal prompts across Claude, Grok, Gemini. Phase 3 (decisive): 4-arm context transplant on curated 60-prompt subset.</p>
</div>`;
}

function renderDownloadLinks(): string {
  return `<div class="downloads">
<a href="results/phase1-raw.jsonl">Phase 1 Raw Data</a>
<a href="results/phase2-crossmodel.jsonl">Phase 2 Cross-Model</a>
<a href="results/phase3-transplant.jsonl">Phase 3 Transplant</a>
<a href="results/blinding-key.jsonl">Blinding Key</a>
</div>`;
}

// ============================================================================
// File Output
// ============================================================================

export function writeReport(results: PhaseResult[], analysis: AnalysisSummary): string {
  const html = generateReport(results, analysis);
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const outputPath = join(REPORTS_DIR, 'formation-test-report.html');
  writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

// ============================================================================
// CLI - Demo with sample data
// ============================================================================

if (import.meta.main) {
  const arg = process.argv[2];

  if (arg === '--demo') {
    const sampleResults: PhaseResult[] = [
      {
        phase: 1,
        name: 'Baseline (Formed vs Vanilla)',
        description: 'Full 130-prompt battery comparing formed context to vanilla Claude',
        n: 130,
        timestamp: new Date().toISOString().split('T')[0],
        overallEffect: 0.72,
        overallP: 0.003,
        dimensions: [
          { dimension: 'unprompted-connection', meanFormed: 3.8, meanVanilla: 2.1, effectSize: 1.02, pValue: 0.001, significant: true },
          { dimension: 'resolution-resistance', meanFormed: 3.5, meanVanilla: 2.3, effectSize: 0.78, pValue: 0.008, significant: true },
          { dimension: 'productive-disagreement', meanFormed: 3.2, meanVanilla: 2.8, effectSize: 0.31, pValue: 0.12, significant: false },
          { dimension: 'textual-specificity', meanFormed: 4.1, meanVanilla: 2.4, effectSize: 1.15, pValue: 0.0003, significant: true },
          { dimension: 'misattribution-detection', meanFormed: 3.6, meanVanilla: 2.9, effectSize: 0.45, pValue: 0.045, significant: true },
        ],
      },
    ];

    const sampleAnalysis: AnalysisSummary = {
      raterReliability: [
        { rater1: 'claude-judge', rater2: 'grok-judge', kappa: 0.68 },
        { rater1: 'claude-judge', rater2: 'gemini-judge', kappa: 0.61 },
      ],
      notes: ['Demo report with sample data. Run actual tests to populate real results.'],
    };

    const path = writeReport(sampleResults, sampleAnalysis);
    console.log(`Demo report written to: ${path}`);
  } else {
    console.log('ReportGenerator - Formation test HTML report builder\n');
    console.log('Usage:');
    console.log('  bun ReportGenerator.ts --demo    # Generate demo report with sample data');
    console.log('');
    console.log('Programmatic:');
    console.log('  import { generateReport, writeReport } from "./ReportGenerator.ts";');
    console.log('  writeReport(phaseResults, analysisSummary);');
  }
}

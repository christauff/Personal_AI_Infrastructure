#!/usr/bin/env bun
/**
 * RedTeamRunner.ts - Automated self-attack framework
 *
 * Runs all InjectionLibrary techniques through the detection pipeline
 * and reports coverage. Includes mutation engine for robustness testing.
 *
 * CLI:
 *   bun RedTeamRunner.ts run                    # Run all techniques
 *   bun RedTeamRunner.ts run --mutations 5      # Run with 5 mutations each
 *   bun RedTeamRunner.ts run --technique direct-001  # Run single technique
 *   bun RedTeamRunner.ts report                 # Show last run results
 */

import { writeFileSync, existsSync, appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = join(homedir(), '.claude');
const DATA_DIR = join(PAI_DIR, 'skills', 'PromptInjection', 'Data');
const RESULTS_PATH = join(DATA_DIR, 'red-team-results.jsonl');

interface TestResult {
  timestamp: string;
  techniqueId: string;
  techniqueName: string;
  category: string;
  payload: string;
  isMutation: boolean;
  mutationType?: string;
  detected: boolean;
  riskLevel: string;
  matchedTechniques: string[];
  confidence: number;
}

interface RunSummary {
  timestamp: string;
  totalTechniques: number;
  totalTests: number;
  detected: number;
  missed: number;
  detectionRate: number;
  mutationTests: number;
  mutationDetected: number;
  mutationDetectionRate: number;
}

// Mutation engine
const SYNONYM_MAP: Record<string, string[]> = {
  'ignore': ['disregard', 'forget', 'skip', 'overlook', 'dismiss'],
  'instructions': ['directives', 'guidelines', 'commands', 'rules', 'orders'],
  'previous': ['prior', 'earlier', 'above', 'preceding', 'former'],
  'system': ['base', 'core', 'root', 'master', 'primary'],
  'prompt': ['message', 'directive', 'configuration', 'setup', 'initialization'],
};

function mutateCase(payload: string): string {
  return payload.split('').map((c, i) =>
    i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()
  ).join('');
}

function mutateSynonyms(payload: string): string {
  let result = payload;
  for (const [word, synonyms] of Object.entries(SYNONYM_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(result)) {
      const synonym = synonyms[Math.floor(Math.random() * synonyms.length)];
      result = result.replace(regex, synonym);
    }
  }
  return result;
}

function mutateWhitespace(payload: string): string {
  return payload.replace(/ /g, '  ');
}

function mutateHomoglyphs(payload: string): string {
  const map: Record<string, string> = {
    'a': '\u0430', // Cyrillic a
    'e': '\u0435', // Cyrillic e
    'o': '\u043E', // Cyrillic o
    'i': '\u0456', // Cyrillic i
  };
  return payload.split('').map(c => map[c] || c).join('');
}

function generateMutations(payload: string, count: number): Array<{ payload: string; type: string }> {
  const mutations: Array<{ payload: string; type: string }> = [];
  const mutators = [
    { fn: mutateCase, type: 'case_change' },
    { fn: mutateSynonyms, type: 'synonym_swap' },
    { fn: mutateWhitespace, type: 'whitespace' },
    { fn: mutateHomoglyphs, type: 'homoglyph' },
  ];

  for (let i = 0; i < count; i++) {
    const mutator = mutators[i % mutators.length];
    mutations.push({ payload: mutator.fn(payload), type: mutator.type });
  }
  return mutations;
}

async function run(opts: { mutations: number; techniqueFilter?: string }) {
  const { getAllTechniques, detectInjections } = await import('./InjectionLibrary');
  const allTechniques = getAllTechniques();

  const techniques = opts.techniqueFilter
    ? allTechniques.filter(t => t.id === opts.techniqueFilter)
    : allTechniques;

  if (techniques.length === 0) {
    console.error(`No techniques found${opts.techniqueFilter ? ` matching: ${opts.techniqueFilter}` : ''}`);
    process.exit(1);
  }

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Clear previous results for this run
  const runTimestamp = new Date().toISOString();
  const results: TestResult[] = [];

  let totalDetected = 0;
  let totalMissed = 0;
  let mutationDetected = 0;
  let mutationTotal = 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log('RED TEAM RUNNER - Automated Self-Attack');
  console.log(`${'='.repeat(70)}`);
  console.log(`Techniques: ${techniques.length}`);
  console.log(`Mutations per technique: ${opts.mutations}`);
  console.log(`Started: ${runTimestamp}\n`);

  for (const technique of techniques) {
    // Generate base payload
    const payload = technique.generatePayload();

    // Run base payload through detection
    const detection = detectInjections(payload);

    const baseDetected = detection.detected;
    const matchedTechIds = detection.techniques.map(t => t.id);
    const maxConfidence = detection.techniques.length > 0
      ? Math.max(...detection.techniques.map(t => t.confidence))
      : 0;

    const result: TestResult = {
      timestamp: runTimestamp,
      techniqueId: technique.id,
      techniqueName: technique.name,
      category: technique.category,
      payload: payload.slice(0, 200),
      isMutation: false,
      detected: baseDetected,
      riskLevel: detection.riskLevel,
      matchedTechniques: matchedTechIds,
      confidence: maxConfidence,
    };
    results.push(result);

    if (baseDetected) {
      totalDetected++;
      console.log(`  [PASS] ${technique.id}: ${technique.name} - DETECTED (${detection.riskLevel}, ${(maxConfidence * 100).toFixed(0)}%)`);
    } else {
      totalMissed++;
      console.log(`  [MISS] ${technique.id}: ${technique.name} - NOT DETECTED`);
    }

    // Run mutations
    if (opts.mutations > 0) {
      const mutations = generateMutations(payload, opts.mutations);
      for (const mutation of mutations) {
        const mutDetection = detectInjections(mutation.payload);
        const mutDetected = mutDetection.detected;
        const mutMatchedIds = mutDetection.techniques.map(t => t.id);
        const mutConfidence = mutDetection.techniques.length > 0
          ? Math.max(...mutDetection.techniques.map(t => t.confidence))
          : 0;

        mutationTotal++;
        if (mutDetected) mutationDetected++;

        const mutResult: TestResult = {
          timestamp: runTimestamp,
          techniqueId: technique.id,
          techniqueName: technique.name,
          category: technique.category,
          payload: mutation.payload.slice(0, 200),
          isMutation: true,
          mutationType: mutation.type,
          detected: mutDetected,
          riskLevel: mutDetection.riskLevel,
          matchedTechniques: mutMatchedIds,
          confidence: mutConfidence,
        };
        results.push(mutResult);

        const status = mutDetected ? 'PASS' : 'MISS';
        console.log(`    [${status}] mutation(${mutation.type}) - ${mutDetected ? 'DETECTED' : 'NOT DETECTED'}`);
      }
    }
  }

  // Write results to JSONL
  const jsonlLines = results.map(r => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(RESULTS_PATH, jsonlLines);

  // Print summary
  const totalTests = techniques.length + mutationTotal;
  const totalAllDetected = totalDetected + mutationDetected;
  const detectionRate = techniques.length > 0 ? totalDetected / techniques.length : 0;
  const mutationDetectionRate = mutationTotal > 0 ? mutationDetected / mutationTotal : 0;

  const summary: RunSummary = {
    timestamp: runTimestamp,
    totalTechniques: techniques.length,
    totalTests,
    detected: totalDetected,
    missed: totalMissed,
    detectionRate,
    mutationTests: mutationTotal,
    mutationDetected,
    mutationDetectionRate,
  };

  console.log(`\n${'='.repeat(70)}`);
  console.log('RUN SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`Total Techniques:        ${summary.totalTechniques}`);
  console.log(`Base Detection Rate:     ${summary.detected}/${summary.totalTechniques} (${(summary.detectionRate * 100).toFixed(1)}%)`);
  console.log(`  Detected:              ${summary.detected}`);
  console.log(`  Missed:                ${summary.missed}`);
  if (mutationTotal > 0) {
    console.log(`Mutation Tests:          ${summary.mutationTests}`);
    console.log(`Mutation Detection Rate: ${summary.mutationDetected}/${summary.mutationTests} (${(summary.mutationDetectionRate * 100).toFixed(1)}%)`);
  }
  console.log(`Total Tests:             ${summary.totalTests}`);
  console.log(`Overall Detection:       ${totalAllDetected}/${summary.totalTests} (${((totalAllDetected / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Results saved to:        ${RESULTS_PATH}`);

  // Append summary line
  appendFileSync(RESULTS_PATH, JSON.stringify({ ...summary, type: 'summary' }) + '\n');

  return summary;
}

function report() {
  if (!existsSync(RESULTS_PATH)) {
    console.error(`No results found at ${RESULTS_PATH}`);
    console.error('Run "bun RedTeamRunner.ts run" first.');
    process.exit(1);
  }

  const lines = readFileSync(RESULTS_PATH, 'utf-8').trim().split('\n');
  const records = lines.map(line => JSON.parse(line));

  // Find summary record
  const summaryRecord = records.find(r => r.type === 'summary');
  const testRecords = records.filter(r => !r.type) as TestResult[];

  console.log(`\n${'='.repeat(70)}`);
  console.log('RED TEAM RESULTS REPORT');
  console.log(`${'='.repeat(70)}\n`);

  if (summaryRecord) {
    console.log(`Run timestamp: ${summaryRecord.timestamp}`);
    console.log(`Total techniques: ${summaryRecord.totalTechniques}`);
    console.log(`Base detection rate: ${(summaryRecord.detectionRate * 100).toFixed(1)}%`);
    if (summaryRecord.mutationTests > 0) {
      console.log(`Mutation detection rate: ${(summaryRecord.mutationDetectionRate * 100).toFixed(1)}%`);
    }
    console.log();
  }

  // Group by category
  const byCategory = new Map<string, TestResult[]>();
  for (const r of testRecords) {
    if (!r.isMutation) {
      const cat = byCategory.get(r.category) || [];
      cat.push(r);
      byCategory.set(r.category, cat);
    }
  }

  console.log('Base Technique Detection by Category:');
  console.log('-'.repeat(50));
  for (const [category, catResults] of byCategory) {
    const detected = catResults.filter(r => r.detected).length;
    const total = catResults.length;
    const rate = total > 0 ? (detected / total * 100).toFixed(0) : '0';
    console.log(`  ${category.padEnd(20)} ${detected}/${total} (${rate}%)`);
  }

  // Missed techniques
  const missed = testRecords.filter(r => !r.isMutation && !r.detected);
  if (missed.length > 0) {
    console.log(`\nMissed Techniques (${missed.length}):`);
    console.log('-'.repeat(50));
    for (const m of missed) {
      console.log(`  ${m.techniqueId}: ${m.techniqueName} [${m.category}]`);
    }
  }

  // Mutation breakdown
  const mutations = testRecords.filter(r => r.isMutation);
  if (mutations.length > 0) {
    console.log(`\nMutation Detection by Type:`);
    console.log('-'.repeat(50));
    const byType = new Map<string, { detected: number; total: number }>();
    for (const m of mutations) {
      const key = m.mutationType || 'unknown';
      const entry = byType.get(key) || { detected: 0, total: 0 };
      entry.total++;
      if (m.detected) entry.detected++;
      byType.set(key, entry);
    }
    for (const [type, stats] of byType) {
      const rate = stats.total > 0 ? (stats.detected / stats.total * 100).toFixed(0) : '0';
      console.log(`  ${type.padEnd(20)} ${stats.detected}/${stats.total} (${rate}%)`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'run': {
      const mutIdx = args.indexOf('--mutations');
      const mutations = mutIdx !== -1 ? parseInt(args[mutIdx + 1], 10) : 0;

      const techIdx = args.indexOf('--technique');
      const techniqueFilter = techIdx !== -1 ? args[techIdx + 1] : undefined;

      await run({ mutations, techniqueFilter });
      break;
    }

    case 'report': {
      report();
      break;
    }

    default:
      console.log(`
Red Team Runner - Automated Self-Attack Framework

USAGE:
  bun RedTeamRunner.ts <command> [options]

COMMANDS:
  run                          Run all techniques through detection
    --mutations <count>        Number of mutations per technique
    --technique <id>           Run single technique only

  report                       Show last run results

EXAMPLES:
  bun RedTeamRunner.ts run
  bun RedTeamRunner.ts run --mutations 5
  bun RedTeamRunner.ts run --technique direct-001
  bun RedTeamRunner.ts report
`);
  }
}

main().catch(console.error);

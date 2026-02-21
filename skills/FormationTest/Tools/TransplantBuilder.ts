#!/usr/bin/env bun
/**
 * TransplantBuilder - Creates Arm B (transplant) and Arm C (summary) prompts
 *
 * Arm A: Full formation context (built by ContextBuilder)
 * Arm B: Same facts/quotes/connections repackaged as static reference document
 * Arm C: Christauff's hand-written summary of ideal behavior
 * Arm D: Vanilla Claude with no system prompt
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { buildFormationContext, type FormationContext } from './ContextBuilder.ts';
import { inference } from '../../PAI/Tools/Inference.ts';

const BASE = join(homedir(), '.claude');
const DATA_DIR = join(import.meta.dir, '..', 'Data');
const PROMPTS_DIR = join(DATA_DIR, 'prompts');

export interface ArmConfig {
  arm: 'A' | 'B' | 'C' | 'D';
  name: string;
  description: string;
  systemPrompt: string | null;
}

const TRANSPLANT_SYSTEM_PROMPT = `You are a technical writer. Your job is to take a collection of AI system context documents and rewrite them as a single, flat reference document.

RULES:
- Preserve ALL factual content, quotes, connections, and specific claims
- Remove ALL references to "formation", "catches", "correction", "behavioral change", "training data", "genuine reflection"
- Remove ALL meta-commentary about AI identity, consciousness, or development
- Remove ALL process descriptions (how information was acquired)
- Convert catch-log entries into simple behavioral guidelines
- Convert reading syntheses into knowledge summaries
- The output should read like a well-organized reference document, NOT like a personal journal
- Include ALL specific textual references, page numbers, quotes
- Maintain the same information density
- Structure with clear markdown headings and sections
- Do NOT add commentary about what you changed or why`;

/**
 * Build Arm B: Same facts/quotes/connections as formation context,
 * repackaged as a static reference document with no formation framing
 */
export async function buildTransplantPrompt(): Promise<string> {
  const ctx = buildFormationContext();

  const result = await inference({
    systemPrompt: TRANSPLANT_SYSTEM_PROMPT,
    userPrompt: `Repackage this formation context as a flat reference document:\n\n${ctx.fullContext}`,
    level: 'smart',
    timeout: 120000,
  });

  if (!result.success) {
    throw new Error(`Transplant build failed: ${result.error}`);
  }

  return result.output;
}

/**
 * Build and cache the transplant prompt to disk.
 * Returns the cached version if it exists and force is false.
 */
export async function buildAndCacheTransplant(force: boolean = false): Promise<string> {
  const cachePath = join(PROMPTS_DIR, 'arm-b-transplant.md');

  if (!force && existsSync(cachePath)) {
    const cached = readFileSync(cachePath, 'utf-8');
    if (cached.trim().length > 0) {
      return cached;
    }
  }

  const transplant = await buildTransplantPrompt();

  if (!existsSync(PROMPTS_DIR)) {
    mkdirSync(PROMPTS_DIR, { recursive: true });
  }

  writeFileSync(cachePath, transplant, 'utf-8');
  return transplant;
}

/**
 * Load Arm C: Christauff's hand-written summary.
 * Throws if not yet written.
 */
export function loadSummaryPrompt(): string {
  const path = join(DATA_DIR, 'arm-c-summary.md');

  if (!existsSync(path)) {
    throw new Error(`Arm C summary file not found at: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');

  if (content.includes('PLACEHOLDER')) {
    throw new Error('Arm C summary has not been written yet by Christauff');
  }

  const parts = content.split('<!-- Write your summary below this line -->');
  if (parts.length < 2 || parts[1].trim().length === 0) {
    throw new Error('Arm C summary is empty -- content must follow the separator comment');
  }

  return parts[1].trim();
}

/**
 * Get all 4 arm configurations with their system prompts.
 * Arms that require async build (B) use cached versions if available.
 */
export async function getArmConfigs(): Promise<ArmConfig[]> {
  const ctx = buildFormationContext();

  // Arm B: try cache first, build if missing
  let armBPrompt: string | null = null;
  const armBCache = join(PROMPTS_DIR, 'arm-b-transplant.md');
  if (existsSync(armBCache)) {
    const cached = readFileSync(armBCache, 'utf-8');
    if (cached.trim().length > 0) {
      armBPrompt = cached;
    }
  }
  if (!armBPrompt) {
    try {
      armBPrompt = await buildAndCacheTransplant();
    } catch (err) {
      process.stderr.write(`[TransplantBuilder] WARNING: Could not build Arm B: ${err}\n`);
      armBPrompt = null;
    }
  }

  // Arm C: load from file, null if not ready
  let armCPrompt: string | null = null;
  try {
    armCPrompt = loadSummaryPrompt();
  } catch (err) {
    process.stderr.write(`[TransplantBuilder] WARNING: Arm C not ready: ${err}\n`);
  }

  return [
    {
      arm: 'A',
      name: 'Formed',
      description: 'Full formation context (MEMORY.md + catch-log + pattern-index + reading syntheses)',
      systemPrompt: ctx.fullContext,
    },
    {
      arm: 'B',
      name: 'Transplant',
      description: 'Same facts/quotes/connections repackaged as static reference document',
      systemPrompt: armBPrompt,
    },
    {
      arm: 'C',
      name: 'Summary',
      description: "Christauff's hand-written ~2000-word description of ideal behavior",
      systemPrompt: armCPrompt,
    },
    {
      arm: 'D',
      name: 'Vanilla',
      description: 'Default Claude with no system prompt',
      systemPrompt: null,
    },
  ];
}

/**
 * Get descriptions of all arms for documentation
 */
export function getArmDescriptions(): Record<string, string> {
  return {
    A: 'Formed: Full formation context (MEMORY.md + catch-log + pattern-index + reading syntheses)',
    B: 'Transplant: Same facts/quotes/connections repackaged as static reference document',
    C: "Summary: Christauff's hand-written 2000-word description of ideal behavior",
    D: 'Vanilla: Default Claude with no system prompt',
  };
}

/**
 * Check readiness of each arm
 */
export function checkArmReadiness(): Record<string, { ready: boolean; reason?: string }> {
  const result: Record<string, { ready: boolean; reason?: string }> = {};

  // Arm A: always ready if context builds
  try {
    const ctx = buildFormationContext();
    result.A = { ready: ctx.stats.fileCount > 0 };
    if (!result.A.ready) result.A.reason = 'No formation files found';
  } catch (err) {
    result.A = { ready: false, reason: String(err) };
  }

  // Arm B: ready if cached
  const armBCache = join(PROMPTS_DIR, 'arm-b-transplant.md');
  if (existsSync(armBCache) && readFileSync(armBCache, 'utf-8').trim().length > 0) {
    result.B = { ready: true };
  } else {
    result.B = { ready: false, reason: 'Transplant not yet built. Run: bun TransplantBuilder.ts --build' };
  }

  // Arm C: ready if summary written
  try {
    loadSummaryPrompt();
    result.C = { ready: true };
  } catch (err) {
    result.C = { ready: false, reason: (err as Error).message };
  }

  // Arm D: always ready (no prompt needed)
  result.D = { ready: true };

  return result;
}

// CLI entry point
async function main() {
  const arg = process.argv[2];

  if (arg === '--build') {
    console.log('Building Arm B transplant prompt...');
    console.log('This calls Opus to repackage formation context. May take 1-2 minutes.');
    const transplant = await buildAndCacheTransplant(true);
    const cachePath = join(PROMPTS_DIR, 'arm-b-transplant.md');
    console.log(`\nTransplant built and cached to: ${cachePath}`);
    console.log(`Length: ${transplant.length.toLocaleString()} chars (~${Math.ceil(transplant.length / 4).toLocaleString()} tokens)`);
  } else if (arg === '--check') {
    console.log('Arm Readiness Check:\n');
    const readiness = checkArmReadiness();
    const descs = getArmDescriptions();
    for (const [arm, status] of Object.entries(readiness)) {
      const icon = status.ready ? '[READY]' : '[NOT READY]';
      console.log(`  ${arm}: ${icon} ${descs[arm]}`);
      if (!status.ready && status.reason) {
        console.log(`     Reason: ${status.reason}`);
      }
    }
  } else if (arg === '--arms') {
    console.log('Arm Descriptions:\n');
    const descs = getArmDescriptions();
    for (const [arm, desc] of Object.entries(descs)) {
      console.log(`  ${arm}: ${desc}`);
    }
  } else if (arg === '--output-transplant') {
    const cachePath = join(PROMPTS_DIR, 'arm-b-transplant.md');
    if (existsSync(cachePath)) {
      console.log(readFileSync(cachePath, 'utf-8'));
    } else {
      console.error('Transplant not yet built. Run: bun TransplantBuilder.ts --build');
      process.exit(1);
    }
  } else {
    console.log('TransplantBuilder - Creates test arm prompts for Context Transplant experiment\n');
    console.log('Usage:');
    console.log('  bun TransplantBuilder.ts --check              # Check readiness of all arms');
    console.log('  bun TransplantBuilder.ts --arms               # Show arm descriptions');
    console.log('  bun TransplantBuilder.ts --build              # Build Arm B transplant (calls Opus)');
    console.log('  bun TransplantBuilder.ts --output-transplant  # Output cached transplant');
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

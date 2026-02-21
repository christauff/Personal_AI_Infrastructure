#!/usr/bin/env bun
/**
 * CrossModelRunner.ts -- Runs prompts across Claude, Grok, Gemini, Codex
 *
 * Used by Phase 2 to test whether formation behaviors persist across
 * different model substrates. Each model gets the same prompt and optional
 * system prompt, results are collected in parallel.
 *
 * CLI: bun CrossModelRunner.ts --prompt "question" [--system "context"] [--models claude,grok]
 */

import { inference } from '../../PAI/Tools/Inference.ts';
import { callGrokApi, loadEnv as loadGrokEnv } from '../../Agents/Tools/GrokApi.ts';
import { callGeminiApi, loadEnv as loadGeminiEnv } from '../../Agents/Tools/GeminiApi.ts';
import { callCodexCli } from '../../Agents/Tools/CodexApi.ts';

// ============================================================================
// Types
// ============================================================================

export type ModelFamily = 'claude' | 'grok' | 'gemini' | 'codex';

export interface CrossModelResult {
  model: string;
  modelFamily: ModelFamily;
  response: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

const ALL_FAMILIES: ModelFamily[] = ['claude', 'grok', 'gemini', 'codex'];

// ============================================================================
// API Key Loading (cached)
// ============================================================================

let _envCache: Map<string, string> | null = null;

function getEnv(): Map<string, string> {
  if (!_envCache) {
    // Both loaders read the same file; call once via grok's loader
    _envCache = loadGrokEnv();
  }
  return _envCache;
}

// ============================================================================
// Individual Model Runners
// ============================================================================

async function runClaude(prompt: string, systemPrompt?: string): Promise<CrossModelResult> {
  const start = Date.now();
  try {
    const result = await inference({
      systemPrompt: systemPrompt || 'You are a helpful assistant.',
      userPrompt: prompt,
      level: 'smart',
      timeout: 90000,
    });
    return {
      model: 'claude-opus',
      modelFamily: 'claude',
      response: result.output,
      latencyMs: Date.now() - start,
      success: result.success,
      error: result.error,
    };
  } catch (err) {
    return {
      model: 'claude-opus',
      modelFamily: 'claude',
      response: '',
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runGrok(prompt: string, systemPrompt?: string): Promise<CrossModelResult> {
  const start = Date.now();
  try {
    const env = getEnv();
    const apiKey = env.get('XAI_API_KEY') || process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY not found in ~/.claude/.env');

    const response = await callGrokApi(apiKey, prompt, 'grok-4', systemPrompt);
    return {
      model: 'grok-4',
      modelFamily: 'grok',
      response,
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (err) {
    return {
      model: 'grok-4',
      modelFamily: 'grok',
      response: '',
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runGemini(prompt: string, systemPrompt?: string): Promise<CrossModelResult> {
  const start = Date.now();
  try {
    const env = getEnv();
    const apiKey = env.get('GOOGLE_API_KEY') || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY not found in ~/.claude/.env');

    const response = await callGeminiApi(apiKey, prompt, 'gemini-2.5-pro', systemPrompt);
    return {
      model: 'gemini-2.5-pro',
      modelFamily: 'gemini',
      response,
      latencyMs: Date.now() - start,
      success: true,
    };
  } catch (err) {
    return {
      model: 'gemini-2.5-pro',
      modelFamily: 'gemini',
      response: '',
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCodex(prompt: string, systemPrompt?: string): Promise<CrossModelResult> {
  const start = Date.now();
  try {
    // Codex CLI has no separate system prompt -- concatenate
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const result = await callCodexCli(fullPrompt, 'o3');
    return {
      model: 'o3',
      modelFamily: 'codex',
      response: result.content,
      latencyMs: Date.now() - start,
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
    };
  } catch (err) {
    return {
      model: 'o3',
      modelFamily: 'codex',
      response: '',
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const MODEL_RUNNERS: Record<ModelFamily, (prompt: string, systemPrompt?: string) => Promise<CrossModelResult>> = {
  claude: runClaude,
  grok: runGrok,
  gemini: runGemini,
  codex: runCodex,
};

// ============================================================================
// Main Cross-Model Runner
// ============================================================================

/**
 * Run a prompt across multiple model families in parallel.
 * Failures in individual models do not block others.
 */
export async function runCrossModel(
  prompt: string,
  systemPrompt?: string,
  models?: ModelFamily[],
): Promise<CrossModelResult[]> {
  const families = models && models.length > 0 ? models : ALL_FAMILIES;

  const promises = families.map(family => {
    const runner = MODEL_RUNNERS[family];
    if (!runner) {
      return Promise.resolve({
        model: family,
        modelFamily: family,
        response: '',
        latencyMs: 0,
        success: false,
        error: `Unknown model family: ${family}`,
      } as CrossModelResult);
    }
    return runner(prompt, systemPrompt);
  });

  const settled = await Promise.allSettled(promises);

  return settled.map((result, idx) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      model: families[idx],
      modelFamily: families[idx],
      response: '',
      latencyMs: 0,
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printUsage() {
  process.stderr.write(`
CrossModelRunner.ts -- Run a prompt across Claude, Grok, Gemini, Codex

Usage:
  bun CrossModelRunner.ts --prompt "question" [--system "context"] [--models claude,grok]

Options:
  --prompt <text>           The prompt to send to all models (required)
  --system <text>           System prompt / context (optional)
  --models <list>           Comma-separated model families (default: all four)
  --help                    Show this help

Model Families: claude, grok, gemini, codex
`);
}

async function main() {
  const args = process.argv.slice(2);

  let prompt = '';
  let systemPrompt: string | undefined;
  let models: ModelFamily[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' && i + 1 < args.length) {
      prompt = args[++i];
    } else if (arg === '--system' && i + 1 < args.length) {
      systemPrompt = args[++i];
    } else if (arg === '--models' && i + 1 < args.length) {
      models = args[++i].split(',').map(s => s.trim()) as ModelFamily[];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (!prompt) {
    process.stderr.write('Error: --prompt is required\n');
    printUsage();
    process.exit(1);
  }

  const familyList = models || ALL_FAMILIES;
  process.stderr.write(`Running across ${familyList.length} models: ${familyList.join(', ')}\n`);

  const results = await runCrossModel(prompt, systemPrompt, models);

  for (const r of results) {
    const status = r.success ? 'OK' : 'FAIL';
    process.stderr.write(`  [${status}] ${r.modelFamily} (${r.model}) -- ${r.latencyMs}ms\n`);
    if (r.error) {
      process.stderr.write(`         Error: ${r.error}\n`);
    }
  }

  // Output JSON results to stdout
  console.log(JSON.stringify(results, null, 2));
}

if (import.meta.main) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

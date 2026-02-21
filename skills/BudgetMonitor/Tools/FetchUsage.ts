#!/usr/bin/env bun
/**
 * PAI Usage Fetcher
 * Queries AI service APIs to get real-time usage/cost data
 *
 * Usage:
 *   bun run FetchUsage.ts [--service=all|openai|anthropic|perplexity|xai|google]
 *   bun run FetchUsage.ts --update  # Fetch all and update usage.jsonl
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const BUDGET_DIR = join(homedir(), '.claude', 'BUDGET');
const USAGE_PATH = join(BUDGET_DIR, 'usage.jsonl');

// Load environment variables from ~/.claude/.env (bun doesn't auto-load this)
function loadEnvFile(): Record<string, string> {
  const envFile = join(homedir(), '.claude', '.env');
  const vars: Record<string, string> = {};
  try {
    const content = readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  } catch {}
  return vars;
}

const dotenv = loadEnvFile();
const env = { ...process.env, ...dotenv };

interface UsageResult {
  service: string;
  timestamp: string;
  success: boolean;
  data?: {
    tokens_used?: number;
    cost_usd?: number;
    requests?: number;
    period?: string;
    details?: Record<string, unknown>;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OpenAI Usage API
// ═══════════════════════════════════════════════════════════════════════════

async function fetchOpenAIUsage(): Promise<UsageResult> {
  // Prefer admin key, fall back to regular key
  const adminKey = env.OPENAI_ADMIN_KEY;
  const regularKey = env.OPENAI_API_KEY;
  const apiKey = adminKey || regularKey;

  if (!apiKey) {
    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'No OPENAI_API_KEY or OPENAI_ADMIN_KEY configured'
    };
  }

  if (!adminKey) {
    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'Admin API key required for usage endpoint. Set OPENAI_ADMIN_KEY in .env'
    };
  }

  try {
    // Use /v1/organization/costs endpoint for real dollar amounts
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTime = Math.floor(monthStart.getTime() / 1000);
    let totalCost = 0;
    let pageUrl: string | null = `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=31`;

    while (pageUrl) {
      const response = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${adminKey}` }
      });

      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text();
        return {
          service: 'openai',
          timestamp: new Date().toISOString(),
          success: false,
          error: `Auth failed (${response.status}): ${errorText}`
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          service: 'openai',
          timestamp: new Date().toISOString(),
          success: false,
          error: `API error ${response.status}: ${errorText}`
        };
      }

      const data = await response.json();

      for (const bucket of (data.data || [])) {
        if (bucket.results) {
          for (const r of bucket.results) {
            totalCost += Number(r.amount?.value || 0);
          }
        }
      }

      if (data.has_more && data.next_page) {
        pageUrl = `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=31&after=${data.next_page}`;
      } else {
        pageUrl = null;
      }
    }

    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      success: true,
      data: {
        cost_usd: totalCost,
        period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        details: {
          source: '/v1/organization/costs',
          month_start: monthStart.toISOString()
        }
      }
    };
  } catch (error) {
    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      success: false,
      error: `Fetch error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Anthropic Usage API (requires Admin API key)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchAnthropicUsage(): Promise<UsageResult> {
  const apiKey = env.ANTHROPIC_API_KEY || env.ANTHROPIC_ADMIN_KEY;

  if (!apiKey) {
    return {
      service: 'anthropic',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'No ANTHROPIC_API_KEY configured. Note: Claude Max subscription usage not accessible via API.'
    };
  }

  // Only admin keys (sk-ant-admin...) can access usage API
  if (!apiKey.startsWith('sk-ant-admin')) {
    return {
      service: 'anthropic',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'Admin API key required (sk-ant-admin...). Regular API keys cannot access usage data.'
    };
  }

  try {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${startDate}&ending_at=${endDate}&bucket_width=1d`,
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        service: 'anthropic',
        timestamp: new Date().toISOString(),
        success: false,
        error: `API error ${response.status}: ${errorText}`
      };
    }

    const data = await response.json();

    let totalTokens = 0;
    if (data.data) {
      for (const bucket of data.data) {
        totalTokens += (bucket.input_tokens || 0) + (bucket.output_tokens || 0);
      }
    }

    return {
      service: 'anthropic',
      timestamp: new Date().toISOString(),
      success: true,
      data: {
        tokens_used: totalTokens,
        period: '30d',
        details: data
      }
    };
  } catch (error) {
    return {
      service: 'anthropic',
      timestamp: new Date().toISOString(),
      success: false,
      error: `Fetch error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Perplexity - No usage API, but we can make a test request to get response costs
// ═══════════════════════════════════════════════════════════════════════════

async function fetchPerplexityUsage(): Promise<UsageResult> {
  const apiKey = env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return {
      service: 'perplexity',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'No PERPLEXITY_API_KEY configured'
    };
  }

  // Perplexity doesn't have a usage API - costs are embedded in each response
  // We can only track usage by aggregating our own requests
  return {
    service: 'perplexity',
    timestamp: new Date().toISOString(),
    success: true,
    data: {
      details: {
        note: 'Perplexity has no usage API. Costs are embedded in each API response.',
        tracking_method: 'Must aggregate from response.usage and response.cost fields',
        dashboard_url: 'https://www.perplexity.ai/settings/api'
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// xAI/Grok - No usage API, costs embedded in responses
// ═══════════════════════════════════════════════════════════════════════════

async function fetchXAIUsage(): Promise<UsageResult> {
  const apiKey = env.XAI_API_KEY;

  if (!apiKey) {
    return {
      service: 'xai',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'No XAI_API_KEY configured'
    };
  }

  // xAI doesn't have a dedicated usage API
  // We can try to get account info or just note the tracking method
  return {
    service: 'xai',
    timestamp: new Date().toISOString(),
    success: true,
    data: {
      details: {
        note: 'xAI has no usage API. Costs are embedded in each API response.',
        tracking_method: 'Must aggregate from response.usage fields',
        dashboard_url: 'https://console.x.ai/usage'
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Google/Gemini - Check if we can access billing
// ═══════════════════════════════════════════════════════════════════════════

async function fetchGoogleUsage(): Promise<UsageResult> {
  const apiKey = env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      service: 'google',
      timestamp: new Date().toISOString(),
      success: false,
      error: 'No GOOGLE_API_KEY configured'
    };
  }

  // Google API key doesn't grant billing access - need service account
  return {
    service: 'google',
    timestamp: new Date().toISOString(),
    success: true,
    data: {
      details: {
        note: 'Google Gemini billing requires Cloud Billing API with service account.',
        tracking_method: 'Use Cloud Billing API or AI Studio dashboard',
        dashboard_url: 'https://aistudio.google.com/usage',
        api_key_type: 'Standard API key (no billing access)'
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════════════════

async function fetchAllUsage(): Promise<UsageResult[]> {
  console.log('Fetching usage from all configured services...\n');

  const results: UsageResult[] = [];

  // OpenAI
  console.log('📊 OpenAI...');
  const openai = await fetchOpenAIUsage();
  results.push(openai);
  console.log(`   ${openai.success ? '✅' : '❌'} ${openai.error || 'Success'}`);

  // Anthropic
  console.log('📊 Anthropic...');
  const anthropic = await fetchAnthropicUsage();
  results.push(anthropic);
  console.log(`   ${anthropic.success ? '✅' : '❌'} ${anthropic.error || 'Success'}`);

  // Perplexity
  console.log('📊 Perplexity...');
  const perplexity = await fetchPerplexityUsage();
  results.push(perplexity);
  console.log(`   ${perplexity.success ? '✅' : '❌'} ${perplexity.data?.details?.note || perplexity.error}`);

  // xAI
  console.log('📊 xAI/Grok...');
  const xai = await fetchXAIUsage();
  results.push(xai);
  console.log(`   ${xai.success ? '✅' : '❌'} ${xai.data?.details?.note || xai.error}`);

  // Google
  console.log('📊 Google/Gemini...');
  const google = await fetchGoogleUsage();
  results.push(google);
  console.log(`   ${google.success ? '✅' : '❌'} ${google.data?.details?.note || google.error}`);

  return results;
}

function printSummary(results: UsageResult[]) {
  console.log('\n' + '═'.repeat(60));
  console.log('USAGE FETCH SUMMARY');
  console.log('═'.repeat(60) + '\n');

  const successCount = results.filter(r => r.success && !r.error).length;
  const partialCount = results.filter(r => r.success && r.data?.details?.note).length;
  const failedCount = results.filter(r => !r.success).length;

  console.log(`✅ APIs with data: ${successCount - partialCount}`);
  console.log(`📝 No API (track manually): ${partialCount}`);
  console.log(`❌ Failed/No key: ${failedCount}`);

  console.log('\n' + '─'.repeat(60));
  console.log('TRACKING REQUIREMENTS BY SERVICE:');
  console.log('─'.repeat(60) + '\n');

  for (const result of results) {
    const icon = result.success ? (result.data?.details?.note ? '📝' : '✅') : '❌';
    console.log(`${icon} ${result.service.toUpperCase()}`);

    if (result.data?.tokens_used) {
      console.log(`   Tokens (30d): ${result.data.tokens_used.toLocaleString()}`);
    }
    if (result.data?.cost_usd) {
      console.log(`   Cost (30d): $${result.data.cost_usd.toFixed(2)}`);
    }
    if (result.data?.details?.note) {
      console.log(`   → ${result.data.details.note}`);
    }
    if (result.data?.details?.dashboard_url) {
      console.log(`   → Dashboard: ${result.data.details.dashboard_url}`);
    }
    if (result.error) {
      console.log(`   → ${result.error}`);
    }
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('RECOMMENDATION:');
  console.log('─'.repeat(60));
  console.log(`
For complete cost tracking:

1. OPENAI: Need Admin API key for programmatic access
   → Or track via PAI middleware (aggregate response.usage)
   → Dashboard: https://platform.openai.com/usage

2. ANTHROPIC: Claude Max is subscription-based, no per-token billing
   → API usage needs Admin key (sk-ant-admin...)
   → Track subscription as fixed monthly cost

3. PERPLEXITY, XAI: No usage API
   → Add middleware to aggregate response.usage on each call
   → Manual dashboard checks for reconciliation

4. GOOGLE: Needs Cloud Billing API setup
   → Or track via AI Studio dashboard
`);
}

// Run
const args = process.argv.slice(2);
const shouldUpdate = args.includes('--update');

const results = await fetchAllUsage();
printSummary(results);

if (shouldUpdate) {
  // Write per-service records in the format Dashboard.ts expects
  const now = new Date().toISOString();
  let written = 0;
  for (const result of results) {
    if (result.success && result.data?.cost_usd !== undefined) {
      const record = {
        timestamp: now,
        service: result.service,
        type: 'api_fetch',
        cost_estimated: result.data.cost_usd,
        period: result.data.period,
      };
      appendFileSync(USAGE_PATH, JSON.stringify(record) + '\n');
      written++;
    }
  }
  console.log(`\n📝 ${written} service records appended to ${USAGE_PATH}`);
}

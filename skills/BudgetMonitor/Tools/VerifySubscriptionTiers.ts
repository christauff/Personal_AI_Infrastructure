#!/usr/bin/env bun
/**
 * PAI Subscription Tier Verifier
 * Programmatically verifies actual subscription tiers via API calls
 *
 * Purpose: Replace manual assertions with programmatic verification
 *
 * Usage:
 *   bun run VerifySubscriptionTiers.ts
 *   bun run VerifySubscriptionTiers.ts --service=perplexity
 *   bun run VerifySubscriptionTiers.ts --json
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const env = process.env;

interface TierVerification {
  service: string;
  timestamp: string;
  verification_method: 'api_call' | 'usage_inference' | 'manual_only';
  tier_detected?: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  details?: Record<string, unknown>;
  error?: string;
  manual_verification_required?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Perplexity API - Check Account/Credits
// ═══════════════════════════════════════════════════════════════════════════

async function verifyPerplexity(): Promise<TierVerification> {
  const apiKey = env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return {
      service: 'perplexity',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No PERPLEXITY_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    // Perplexity doesn't have a dedicated account info endpoint
    // We can infer from successful API calls that API access exists
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{role: 'user', content: 'test'}],
        max_tokens: 1
      })
    });

    if (response.ok) {
      return {
        service: 'perplexity',
        timestamp: new Date().toISOString(),
        verification_method: 'usage_inference',
        tier_detected: 'API Access (credits-based)',
        confidence: 'medium',
        details: {
          api_key_valid: true,
          note: 'Perplexity API does not expose subscription tier programmatically. Check https://www.perplexity.ai/account/api/billing for actual tier and credits.'
        },
        manual_verification_required: true
      };
    } else {
      const errorText = await response.text();
      return {
        service: 'perplexity',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status} - ${errorText}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'perplexity',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OpenAI API - Check Organization/Subscription
// ═══════════════════════════════════════════════════════════════════════════

async function verifyOpenAI(): Promise<TierVerification> {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No OPENAI_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    // OpenAI API doesn't expose ChatGPT Plus/Pro subscription info
    // API keys are separate from ChatGPT web subscriptions
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const data: any = await response.json();
      const hasGPT4 = data.data?.some((m: any) => m.id.includes('gpt-4'));

      return {
        service: 'openai',
        timestamp: new Date().toISOString(),
        verification_method: 'usage_inference',
        tier_detected: hasGPT4 ? 'API Access with GPT-4' : 'API Access (basic)',
        confidence: 'medium',
        details: {
          api_key_valid: true,
          models_available: data.data?.length || 0,
          has_gpt4_access: hasGPT4,
          note: 'ChatGPT Plus/Pro subscription is separate from API access. Check https://platform.openai.com/usage for API tier.'
        },
        manual_verification_required: true
      };
    } else {
      return {
        service: 'openai',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'openai',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Gemini API - Check API Key Access
// ═══════════════════════════════════════════════════════════════════════════

async function verifyGemini(): Promise<TierVerification> {
  const apiKey = env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      service: 'gemini',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No GOOGLE_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (response.ok) {
      const data: any = await response.json();

      return {
        service: 'gemini',
        timestamp: new Date().toISOString(),
        verification_method: 'usage_inference',
        tier_detected: 'Free tier (API key valid)',
        confidence: 'medium',
        details: {
          api_key_valid: true,
          models_available: data.models?.length || 0,
          note: 'Google AI Studio API keys are free tier by default. Gemini Advanced subscription does not provide separate API access. Check https://aistudio.google.com/app/plan for actual tier.'
        },
        manual_verification_required: true
      };
    } else {
      return {
        service: 'gemini',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'gemini',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// xAI Grok - Check API Access
// ═══════════════════════════════════════════════════════════════════════════

async function verifyGrok(): Promise<TierVerification> {
  const apiKey = env.XAI_API_KEY;

  if (!apiKey) {
    return {
      service: 'grok',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No XAI_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    // xAI API endpoint (if available)
    const response = await fetch('https://api.x.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      return {
        service: 'grok',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        tier_detected: 'API Access',
        confidence: 'medium',
        details: {
          api_key_valid: true,
          note: 'X Premium+ subscription provides Grok web access. API access is separate. Check https://x.com/i/grok for web access tier.'
        },
        manual_verification_required: true
      };
    } else {
      return {
        service: 'grok',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        details: {
          note: 'Grok is primarily accessed via X Premium+ web interface. API may not be generally available.'
        },
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'grok',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      details: {
        note: 'Grok is primarily accessed via X Premium+ web interface at https://x.com/i/grok'
      },
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Anthropic Claude - Subscription Info
// ═══════════════════════════════════════════════════════════════════════════

async function verifyClaude(): Promise<TierVerification> {
  // Claude Max is a web subscription - no API tier verification available
  return {
    service: 'claude',
    timestamp: new Date().toISOString(),
    verification_method: 'manual_only',
    tier_detected: 'Claude Max 20x (assumed)',
    confidence: 'none',
    details: {
      note: 'Claude Pro/Max are web subscriptions, not API tiers. Verification requires checking https://claude.ai/settings/billing'
    },
    manual_verification_required: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Apify - Social Media Scraping
// ═══════════════════════════════════════════════════════════════════════════

async function verifyApify(): Promise<TierVerification> {
  const apiToken = env.APIFY_API_TOKEN || env.APIFY_TOKEN;

  if (!apiToken) {
    return {
      service: 'apify',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No APIFY_API_TOKEN configured',
      manual_verification_required: true
    };
  }

  try {
    // Get user account info (correct endpoint: /users/me not /user)
    const response = await fetch('https://api.apify.com/v2/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });

    if (response.ok) {
      const data: any = await response.json();
      const plan = data.data?.plan;
      const planId = plan?.id || 'unknown';
      const monthlyBasePriceUsd = plan?.monthlyBasePriceUsd || 0;

      return {
        service: 'apify',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        tier_detected: `${planId} ($${monthlyBasePriceUsd}/mo)`,
        confidence: 'high',
        details: {
          api_key_valid: true,
          plan_id: planId,
          plan_tier: plan?.tier,
          monthly_price_usd: monthlyBasePriceUsd,
          monthly_credits_usd: plan?.monthlyUsageCreditsUsd,
          max_concurrent_runs: plan?.maxConcurrentActorRuns,
          username: data.data?.username,
          note: 'Apify API provides full plan information. Check https://console.apify.com/billing for usage details.'
        },
        manual_verification_required: false
      };
    } else {
      return {
        service: 'apify',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'apify',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ElevenLabs - Voice/TTS
// ═══════════════════════════════════════════════════════════════════════════

async function verifyElevenLabs(): Promise<TierVerification> {
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return {
      service: 'elevenlabs',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No ELEVENLABS_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    // Get user subscription info
    const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (response.ok) {
      const data: any = await response.json();

      return {
        service: 'elevenlabs',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        tier_detected: `Tier: ${data.tier || 'unknown'}`,
        confidence: 'high',
        details: {
          api_key_valid: true,
          tier: data.tier,
          character_count: data.character_count,
          character_limit: data.character_limit,
          note: 'ElevenLabs API provides full subscription details.'
        },
        manual_verification_required: false
      };
    } else {
      return {
        service: 'elevenlabs',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'elevenlabs',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shodan - Security Intelligence
// ═══════════════════════════════════════════════════════════════════════════

async function verifyShodan(): Promise<TierVerification> {
  const apiKey = env.SHODAN_API_KEY;

  if (!apiKey) {
    return {
      service: 'shodan',
      timestamp: new Date().toISOString(),
      verification_method: 'manual_only',
      confidence: 'none',
      error: 'No SHODAN_API_KEY configured',
      manual_verification_required: true
    };
  }

  try {
    // Get API plan info
    const response = await fetch(`https://api.shodan.io/api-info?key=${apiKey}`);

    if (response.ok) {
      const data: any = await response.json();

      return {
        service: 'shodan',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        tier_detected: `Plan: ${data.plan || 'unknown'}`,
        confidence: 'high',
        details: {
          api_key_valid: true,
          plan: data.plan,
          query_credits: data.query_credits,
          scan_credits: data.scan_credits,
          note: 'Shodan API provides plan and credit information.'
        },
        manual_verification_required: false
      };
    } else {
      return {
        service: 'shodan',
        timestamp: new Date().toISOString(),
        verification_method: 'api_call',
        confidence: 'low',
        error: `API call failed: ${response.status}`,
        manual_verification_required: true
      };
    }
  } catch (error) {
    return {
      service: 'shodan',
      timestamp: new Date().toISOString(),
      verification_method: 'api_call',
      confidence: 'none',
      error: String(error),
      manual_verification_required: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const serviceArg = args.find(a => a.startsWith('--service='))?.split('=')[1];
  const jsonOutput = args.includes('--json');

  console.log('🔍 PAI Subscription Tier Verifier\n');
  console.log('Programmatically verifying API subscription tiers...\n');

  const verifications: TierVerification[] = [];

  if (!serviceArg || serviceArg === 'all') {
    verifications.push(
      await verifyClaude(),
      await verifyOpenAI(),
      await verifyPerplexity(),
      await verifyGemini(),
      await verifyGrok(),
      await verifyApify(),
      await verifyElevenLabs(),
      await verifyShodan()
    );
  } else {
    switch (serviceArg.toLowerCase()) {
      case 'claude':
        verifications.push(await verifyClaude());
        break;
      case 'openai':
        verifications.push(await verifyOpenAI());
        break;
      case 'perplexity':
        verifications.push(await verifyPerplexity());
        break;
      case 'gemini':
        verifications.push(await verifyGemini());
        break;
      case 'grok':
        verifications.push(await verifyGrok());
        break;
      case 'apify':
        verifications.push(await verifyApify());
        break;
      case 'elevenlabs':
        verifications.push(await verifyElevenLabs());
        break;
      case 'shodan':
        verifications.push(await verifyShodan());
        break;
      default:
        console.error(`Unknown service: ${serviceArg}`);
        process.exit(1);
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(verifications, null, 2));
  } else {
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    for (const v of verifications) {
      console.log(`📊 ${v.service.toUpperCase()}`);
      console.log(`   Method: ${v.verification_method}`);
      console.log(`   Tier: ${v.tier_detected || 'Unknown'}`);
      console.log(`   Confidence: ${v.confidence}`);
      if (v.error) {
        console.log(`   ⚠️  Error: ${v.error}`);
      }
      if (v.manual_verification_required) {
        console.log(`   📋 Manual verification required`);
      }
      if (v.details?.note) {
        console.log(`   💡 ${v.details.note}`);
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('⚠️  LIMITATIONS:');
    console.log('Most AI services do NOT expose subscription tier information via API.');
    console.log('This tool provides what is programmatically verifiable, but manual');
    console.log('verification via web dashboards is still required for accurate tier info.\n');
    console.log('For definitive verification:');
    console.log('  • Claude: https://claude.ai/settings/billing');
    console.log('  • ChatGPT: https://platform.openai.com/usage');
    console.log('  • Perplexity: https://www.perplexity.ai/account/api/billing');
    console.log('  • Gemini: https://aistudio.google.com/app/plan');
    console.log('  • Grok: https://x.com/i/grok (X Premium+ required)');
  }
}

main().catch(console.error);

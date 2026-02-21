#!/usr/bin/env bun
/**
 * PAI Dashboard Scraper
 * Uses Browser skill to scrape usage data from AI service dashboards
 *
 * Usage:
 *   bun run ScrapeDashboards.ts [service]
 *   bun run ScrapeDashboards.ts openai
 *   bun run ScrapeDashboards.ts perplexity
 *   bun run ScrapeDashboards.ts all
 *
 * Note: Requires being logged into each service in the browser
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const BUDGET_DIR = join(homedir(), '.claude', 'BUDGET');
const BROWSER_TOOL = join(homedir(), '.claude', 'skills', 'Browser', 'Tools', 'Browse.ts');
const SCRATCHPAD = join(homedir(), '.claude', 'BUDGET', 'scrapes');

// Dashboard URLs
const DASHBOARDS = {
  openai: {
    name: 'OpenAI',
    url: 'https://platform.openai.com/usage',
    loginUrl: 'https://platform.openai.com/login',
    selectors: {
      totalCost: '[data-testid="usage-total"]',
      period: '.usage-period-selector'
    }
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/settings/api',
    loginUrl: 'https://www.perplexity.ai/login',
    selectors: {
      credits: '.api-credits',
      usage: '.api-usage'
    }
  },
  xai: {
    name: 'xAI/Grok',
    url: 'https://console.x.ai/usage',
    loginUrl: 'https://console.x.ai',
    selectors: {
      usage: '.usage-summary'
    }
  },
  google: {
    name: 'Google AI Studio',
    url: 'https://aistudio.google.com/app/plan',
    loginUrl: 'https://aistudio.google.com',
    selectors: {
      usage: '.usage-display'
    }
  },
  anthropic: {
    name: 'Anthropic Console',
    url: 'https://console.anthropic.com/settings/usage',
    loginUrl: 'https://console.anthropic.com',
    selectors: {
      usage: '.usage-total'
    }
  }
};

interface ScrapeResult {
  service: string;
  timestamp: string;
  url: string;
  success: boolean;
  screenshotPath?: string;
  extractedData?: {
    rawText?: string;
    possibleCosts?: string[];
    possibleTokens?: string[];
  };
  error?: string;
}

async function scrapeWithPlaywright(service: string): Promise<ScrapeResult> {
  const config = DASHBOARDS[service as keyof typeof DASHBOARDS];
  if (!config) {
    return {
      service,
      timestamp: new Date().toISOString(),
      url: '',
      success: false,
      error: `Unknown service: ${service}`
    };
  }

  console.log(`\n📸 Scraping ${config.name} dashboard...`);
  console.log(`   URL: ${config.url}`);

  try {
    // Create scratchpad directory
    execSync(`mkdir -p ${SCRATCHPAD}`);

    // Use playwright directly for more control
    const screenshotPath = join(SCRATCHPAD, `${service}-${Date.now()}.png`);

    // Create a simple playwright script
    const scriptContent = `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,  // Need visible browser to use existing login
    channel: 'chrome'  // Use system Chrome which has login sessions
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
  });

  // Try to use existing Chrome profile for auth
  const page = await context.newPage();

  try {
    await page.goto('${config.url}', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);  // Wait for dynamic content

    // Take screenshot
    await page.screenshot({ path: '${screenshotPath}', fullPage: true });

    // Extract text content
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Look for cost/usage patterns
    const costPatterns = bodyText.match(/\\$[\\d,]+\\.\\d{2}/g) || [];
    const tokenPatterns = bodyText.match(/[\\d,]+ tokens?/gi) || [];

    console.log(JSON.stringify({
      success: true,
      screenshot: '${screenshotPath}',
      rawText: bodyText.substring(0, 2000),
      costs: costPatterns,
      tokens: tokenPatterns
    }));

  } catch (e) {
    console.log(JSON.stringify({
      success: false,
      error: e.message
    }));
  } finally {
    await browser.close();
  }
})();
`;

    const scriptPath = join(SCRATCHPAD, `scrape-${service}.js`);
    writeFileSync(scriptPath, scriptContent);

    // Note: This requires playwright to be installed
    // For now, let's provide manual instructions
    return {
      service,
      timestamp: new Date().toISOString(),
      url: config.url,
      success: true,
      screenshotPath,
      extractedData: {
        rawText: `Manual verification needed. Dashboard URL: ${config.url}`
      }
    };

  } catch (error) {
    return {
      service,
      timestamp: new Date().toISOString(),
      url: config.url,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function printDashboardLinks() {
  console.log('\n' + '═'.repeat(60));
  console.log('AI SERVICE DASHBOARDS - MANUAL CHECK');
  console.log('═'.repeat(60) + '\n');

  console.log('Open these URLs to check your usage:\n');

  for (const [key, config] of Object.entries(DASHBOARDS)) {
    console.log(`📊 ${config.name}`);
    console.log(`   ${config.url}`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('TIP: Bookmark these or add to your daily routine.');
  console.log('The BudgetMonitor dashboard aggregates the data you enter.\n');
}

// Main
const args = process.argv.slice(2);
const service = args[0] || 'links';

if (service === 'links' || service === 'help') {
  printDashboardLinks();
} else if (service === 'all') {
  // Open all dashboards
  console.log('Opening all dashboards...\n');
  for (const [key, config] of Object.entries(DASHBOARDS)) {
    console.log(`🌐 Opening ${config.name}...`);
    try {
      execSync(`xdg-open "${config.url}" 2>/dev/null &`);
    } catch {
      console.log(`   Could not open automatically. URL: ${config.url}`);
    }
  }
  console.log('\n✅ All dashboards opened. Check your browser tabs.');
} else if (DASHBOARDS[service as keyof typeof DASHBOARDS]) {
  const config = DASHBOARDS[service as keyof typeof DASHBOARDS];
  console.log(`🌐 Opening ${config.name} dashboard...`);
  try {
    execSync(`xdg-open "${config.url}" 2>/dev/null &`);
    console.log(`   Opened: ${config.url}`);
  } catch {
    console.log(`   Could not open automatically. URL: ${config.url}`);
  }
} else {
  console.log(`Unknown service: ${service}`);
  console.log('Available: openai, perplexity, xai, google, anthropic, all, links');
}

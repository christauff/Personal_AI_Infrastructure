#!/usr/bin/env bun
/**
 * RegulatoryMonitor.ts — Multi-source federal compliance monitoring
 *
 * Monitors NIST, CISA, FedRAMP, CMMC, and AI governance sources
 * for new regulatory updates. Outputs content suitable for tweets.
 *
 * Usage:
 *   bun RegulatoryMonitor.ts scan              # Scan all sources
 *   bun RegulatoryMonitor.ts scan --source nist # Scan specific source
 *   bun RegulatoryMonitor.ts feedly             # Pull trending CVEs from Feedly API
 *   bun RegulatoryMonitor.ts generate           # Generate tweet content from latest
 *   bun RegulatoryMonitor.ts status             # Show last scan status
 *   bun RegulatoryMonitor.ts --help
 *
 * @author PAI System
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Configuration
// ============================================================================

const PAI_DIR = join(homedir(), ".claude");
const SKILL_DIR = join(PAI_DIR, "skills", "TwitterBot");
const DATA_DIR = join(SKILL_DIR, "Data");
const STATE_FILE = join(DATA_DIR, "monitor-state.json");
const FINDINGS_FILE = join(DATA_DIR, "regulatory-findings.jsonl");

// ============================================================================
// Types
// ============================================================================

interface Source {
  id: string;
  name: string;
  url: string;
  category: "nist" | "cisa" | "fedramp" | "cmmc" | "ai-governance" | "supply-chain" | "threat-intel" | "civil-liberties";
  description: string;
}

interface Finding {
  id: string;
  sourceId: string;
  title: string;
  summary: string;
  url: string;
  category: string;
  publishedAt: string;
  discoveredAt: string;
  tweetGenerated: boolean;
  tweetContent?: string;
  actionableInsight?: string;
}

interface MonitorState {
  lastScan: string;
  sources: Record<string, {
    lastChecked: string;
    lastItemHash: string;
    findingsCount: number;
  }>;
}

// ============================================================================
// Sources
// ============================================================================

const SOURCES: Source[] = [
  // NIST
  {
    id: "nist-csrc",
    name: "NIST CSRC",
    url: "https://csrc.nist.gov/publications",
    category: "nist",
    description: "NIST Computer Security Resource Center — SPs, FIPs, IRs",
  },
  {
    id: "nist-nvd",
    name: "NIST NVD",
    url: "https://nvd.nist.gov/vuln/search",
    category: "nist",
    description: "National Vulnerability Database — CVE data",
  },
  // CISA
  {
    id: "cisa-advisories",
    name: "CISA Advisories",
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    category: "cisa",
    description: "CISA cybersecurity advisories and alerts",
  },
  {
    id: "cisa-kev",
    name: "CISA KEV",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    category: "cisa",
    description: "Known Exploited Vulnerabilities catalog",
  },
  {
    id: "cisa-directives",
    name: "CISA BODs/EDs",
    url: "https://www.cisa.gov/news-events/directives",
    category: "cisa",
    description: "Binding Operational Directives and Emergency Directives",
  },
  // FedRAMP
  {
    id: "fedramp-updates",
    name: "FedRAMP Updates",
    url: "https://www.fedramp.gov/blog/",
    category: "fedramp",
    description: "FedRAMP program updates, PMO announcements",
  },
  // CMMC
  {
    id: "cmmc-updates",
    name: "CMMC Updates",
    url: "https://dodcio.defense.gov/CMMC/",
    category: "cmmc",
    description: "CMMC program updates from DoD CIO",
  },
  {
    id: "cmmc-ab",
    name: "Cyber AB",
    url: "https://cyberab.org/News",
    category: "cmmc",
    description: "CMMC Accreditation Body news and updates",
  },
  // AI Governance
  {
    id: "ai-eo",
    name: "White House AI",
    url: "https://www.whitehouse.gov/ostp/ai-bill-of-rights/",
    category: "ai-governance",
    description: "White House AI policy, Executive Orders",
  },
  {
    id: "nist-ai",
    name: "NIST AI RMF",
    url: "https://airc.nist.gov/",
    category: "ai-governance",
    description: "NIST AI Risk Management Framework",
  },
  {
    id: "ftc-ai",
    name: "FTC AI",
    url: "https://www.ftc.gov/business-guidance/blog",
    category: "ai-governance",
    description: "FTC guidance on AI and automated systems",
  },
  // Supply Chain
  {
    id: "cisa-supply-chain",
    name: "CISA Supply Chain",
    url: "https://www.cisa.gov/supply-chain-compromise",
    category: "supply-chain",
    description: "CISA supply chain security resources",
  },
  // Threat Intel (Feedly)
  {
    id: "feedly-trending",
    name: "Feedly Trending CVEs",
    url: "https://feedly.com/i/trends/vulnerability-dashboard",
    category: "threat-intel",
    description: "Trending CVEs from Feedly Enterprise threat intelligence",
  },
  {
    id: "feedly-actors",
    name: "Feedly Threat Actors",
    url: "https://feedly.com/i/trends/threat-actors",
    category: "threat-intel",
    description: "Trending threat actors from Feedly Enterprise",
  },
  // Civil Liberties / Free Speech
  {
    id: "eff-deeplinks",
    name: "EFF Deeplinks",
    url: "https://www.eff.org/deeplinks",
    category: "civil-liberties",
    description: "Electronic Frontier Foundation — surveillance, free speech, digital rights",
  },
  {
    id: "reclaim-the-net",
    name: "Reclaim The Net",
    url: "https://reclaimthenet.org/",
    category: "civil-liberties",
    description: "Free speech, censorship, online rights news and analysis",
  },
  {
    id: "congress-bills",
    name: "Congress.gov",
    url: "https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22search%22%3A%22online+safety+age+verification+content+moderation%22%7D",
    category: "civil-liberties",
    description: "Federal legislation — online safety, age verification, content moderation bills",
  },
  {
    id: "techdirt",
    name: "Techdirt",
    url: "https://www.techdirt.com/",
    category: "civil-liberties",
    description: "Tech policy, free speech, Section 230, surveillance analysis",
  },
];

// ============================================================================
// State Management
// ============================================================================

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState(): MonitorState {
  if (!existsSync(STATE_FILE)) {
    return {
      lastScan: "never",
      sources: {},
    };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state: MonitorState): void {
  ensureDataDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logFinding(finding: Finding): void {
  ensureDataDir();
  appendFileSync(FINDINGS_FILE, JSON.stringify(finding) + "\n");
}

// ============================================================================
// Content Generation
// ============================================================================

function generateTweetFromFinding(finding: Finding): string {
  const categoryEmoji: Record<string, string> = {
    nist: "\uD83D\uDCCB",
    cisa: "\uD83D\uDEE1\uFE0F",
    fedramp: "\u2601\uFE0F",
    cmmc: "\uD83D\uDD12",
    "ai-governance": "\uD83E\uDD16",
    "supply-chain": "\uD83D\uDD17",
    "threat-intel": "\uD83D\uDD25",
    "civil-liberties": "\uD83D\uDFE1",
  };

  const emoji = categoryEmoji[finding.category] || "\uD83D\uDCE2";
  const insight = finding.actionableInsight || finding.summary;

  // Build tweet within 280 chars
  let tweet = `${emoji} ${finding.title}\n\n${insight}`;

  // Add URL if space permits
  // t.co URLs are always 23 chars
  const urlLength = 23;
  if (tweet.length + 2 + urlLength <= 280) {
    tweet += `\n\n${finding.url}`;
  }

  // Truncate if needed
  if (tweet.length > 280) {
    tweet = tweet.slice(0, 277) + "...";
  }

  return tweet;
}

function generateThreadFromFindings(findings: Finding[], topic: string): string[] {
  const tweets: string[] = [];

  // Opener
  tweets.push(`${topic} — here's what you need to know:\n\nA thread \uD83E\uDDF5`);

  for (const finding of findings.slice(0, 8)) {
    const tweet = `${finding.title}\n\n${finding.actionableInsight || finding.summary}`;
    tweets.push(tweet.length > 280 ? tweet.slice(0, 277) + "..." : tweet);
  }

  // Closer
  tweets.push(
    `That's the roundup. Follow for daily federal compliance intelligence.\n\nManaged by @Christauf`
  );

  return tweets;
}

// ============================================================================
// Source Scanning (CLI-based — delegates to WebFetch via agent)
// ============================================================================

function getScanInstructions(sourceId?: string): string {
  const sources = sourceId
    ? SOURCES.filter(s => s.id === sourceId || s.category === sourceId)
    : SOURCES;

  if (sources.length === 0) {
    return `Unknown source: ${sourceId}\n\nAvailable sources:\n${SOURCES.map(s => `  ${s.id} (${s.category})`).join("\n")}`;
  }

  let instructions = "## Regulatory Scan Instructions\n\n";
  instructions += "Use WebFetch or Research skill to check these sources for new content:\n\n";

  for (const source of sources) {
    instructions += `### ${source.name} (${source.id})\n`;
    instructions += `- URL: ${source.url}\n`;
    instructions += `- Category: ${source.category}\n`;
    instructions += `- What to look for: ${source.description}\n\n`;
  }

  instructions += "## Output Format\n\n";
  instructions += "For each new item found, output as JSONL:\n";
  instructions += '```json\n{"title":"...","summary":"...","url":"...","category":"...","actionableInsight":"..."}\n```\n\n';
  instructions += "Then run: `bun RegulatoryMonitor.ts generate` to create tweet content.\n";

  return instructions;
}

// ============================================================================
// Display
// ============================================================================

function displayStatus(state: MonitorState): void {
  console.log("\nRegulatory Monitor Status");
  console.log("─".repeat(60));
  console.log(`Last scan: ${state.lastScan}`);
  console.log(`Sources configured: ${SOURCES.length}`);
  console.log();

  for (const source of SOURCES) {
    const info = state.sources[source.id];
    const status = info ? `Last checked: ${info.lastChecked} (${info.findingsCount} findings)` : "Never scanned";
    console.log(`  [${source.category.padEnd(14)}] ${source.name.padEnd(20)} ${status}`);
  }

  console.log("─".repeat(60));

  // Count total findings
  if (existsSync(FINDINGS_FILE)) {
    const lines = readFileSync(FINDINGS_FILE, "utf-8").split("\n").filter(l => l.trim());
    console.log(`\nTotal findings recorded: ${lines.length}`);
  }
}

function displaySources(): void {
  console.log("\nConfigured Sources");
  console.log("─".repeat(60));

  const categories = [...new Set(SOURCES.map(s => s.category))];
  for (const cat of categories) {
    console.log(`\n  ${cat.toUpperCase()}`);
    const catSources = SOURCES.filter(s => s.category === cat);
    for (const s of catSources) {
      console.log(`    ${s.id.padEnd(20)} ${s.name}`);
      console.log(`    ${"".padEnd(20)} ${s.url}`);
    }
  }
  console.log("─".repeat(60));
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`RegulatoryMonitor.ts — Federal compliance source monitoring

Usage:
  bun RegulatoryMonitor.ts scan                  # Print scan instructions for all sources
  bun RegulatoryMonitor.ts scan --source nist     # Scan specific category
  bun RegulatoryMonitor.ts scan --source cisa-kev # Scan specific source
  bun RegulatoryMonitor.ts feedly [limit]          # Pull trending CVEs from Feedly API
  bun RegulatoryMonitor.ts generate               # Generate tweets from recent findings
  bun RegulatoryMonitor.ts status                 # Show monitor state
  bun RegulatoryMonitor.ts sources                # List all configured sources
  bun RegulatoryMonitor.ts add-finding <json>     # Add a finding manually
  bun RegulatoryMonitor.ts --help

Sources by Category:
  nist           NIST CSRC, NVD
  cisa           CISA Advisories, KEV, BODs/EDs
  fedramp        FedRAMP PMO updates
  cmmc           DoD CIO CMMC, Cyber AB
  ai-governance  White House OSTP, NIST AI RMF, FTC
  supply-chain   CISA supply chain resources
  threat-intel   Feedly Enterprise trending CVEs & actors
  civil-liberties EFF, ReclaimTheNet, Congress.gov, Techdirt

Workflow:
  1. Run 'scan' to get instructions for checking sources
  2. Use WebFetch/Research agents to check each source
  3. Run 'feedly' to auto-pull trending CVEs from Feedly API
  4. Run 'add-finding' for each new item discovered
  5. Run 'generate' to create tweet content
  6. Review and post via PostScheduler.ts`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "scan": {
      const sourceIdx = args.indexOf("--source");
      const sourceId = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;
      console.log(getScanInstructions(sourceId));
      break;
    }

    case "feedly": {
      const limit = parseInt(args[1] || "5");
      console.log(`Pulling trending CVEs from Feedly (top ${limit})...\n`);

      const { getTrendingIntel } = await import(
        join(PAI_DIR, "skills", "FeedlyClient", "Facades", "TwitterBotFacade")
      );

      const packages = await getTrendingIntel(limit);
      let added = 0;

      for (const pkg of packages) {
        const finding: Finding = {
          id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceId: "feedly-trending",
          title: `${pkg.cve.cveid}: ${pkg.cve.label}`,
          summary: pkg.cve.description?.slice(0, 200) || "",
          url: pkg.cve.graphUrl || `https://feedly.com/cve/${pkg.cve.cveid}`,
          category: "threat-intel",
          publishedAt: pkg.cve.publishedDate || new Date().toISOString(),
          discoveredAt: new Date().toISOString(),
          tweetGenerated: false,
          actionableInsight: `[${pkg.urgency.toUpperCase()}] ${pkg.federalRelevance}`,
        };

        logFinding(finding);
        added++;

        console.log(`  + ${finding.title}`);
        console.log(`    Urgency: ${pkg.urgency} | Score: ${pkg.cve.cvssV4 || pkg.cve.cvssV3 || "?"}`);
        console.log(`    ${finding.actionableInsight}`);
        console.log();
      }

      // Update state
      const state = loadState();
      state.lastScan = new Date().toISOString();
      state.sources["feedly-trending"] = {
        lastChecked: new Date().toISOString(),
        lastItemHash: packages[0]?.cve.cveid || "",
        findingsCount: (state.sources["feedly-trending"]?.findingsCount || 0) + added,
      };
      saveState(state);

      console.log("─".repeat(60));
      console.log(`Added ${added} finding(s) from Feedly. Run 'generate' to create tweets.`);
      break;
    }

    case "generate": {
      if (!existsSync(FINDINGS_FILE)) {
        console.log("No findings recorded yet. Run 'scan' first.");
        process.exit(0);
      }

      const lines = readFileSync(FINDINGS_FILE, "utf-8").split("\n").filter(l => l.trim());
      const findings: Finding[] = lines.map(l => JSON.parse(l));
      const unprocessed = findings.filter(f => !f.tweetGenerated);

      if (unprocessed.length === 0) {
        console.log("All findings have been processed into tweets.");
        process.exit(0);
      }

      console.log(`Generating tweet content for ${unprocessed.length} finding(s):\n`);

      for (const finding of unprocessed) {
        const tweet = generateTweetFromFinding(finding);
        console.log("─".repeat(60));
        console.log(`Source: ${finding.sourceId}`);
        console.log(`Tweet (${tweet.length}/280):\n`);
        console.log(tweet);
        console.log();

        finding.tweetGenerated = true;
        finding.tweetContent = tweet;
      }

      // Update findings file with tweet content
      writeFileSync(FINDINGS_FILE, findings.map(f => JSON.stringify(f)).join("\n") + "\n");
      console.log("─".repeat(60));
      console.log(`Generated ${unprocessed.length} tweet(s). Use PostScheduler.ts to queue/post.`);
      break;
    }

    case "add-finding": {
      const json = args.slice(1).join(" ");
      if (!json) {
        console.error("Error: Provide finding as JSON");
        process.exit(1);
      }

      try {
        const data = JSON.parse(json);
        const finding: Finding = {
          id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceId: data.sourceId || "manual",
          title: data.title,
          summary: data.summary,
          url: data.url || "",
          category: data.category || "nist",
          publishedAt: data.publishedAt || new Date().toISOString(),
          discoveredAt: new Date().toISOString(),
          tweetGenerated: false,
          actionableInsight: data.actionableInsight,
        };

        logFinding(finding);

        // Update state
        const state = loadState();
        state.lastScan = new Date().toISOString();
        if (!state.sources[finding.sourceId]) {
          state.sources[finding.sourceId] = {
            lastChecked: new Date().toISOString(),
            lastItemHash: "",
            findingsCount: 0,
          };
        }
        state.sources[finding.sourceId].findingsCount++;
        state.sources[finding.sourceId].lastChecked = new Date().toISOString();
        saveState(state);

        console.log(`Finding added: ${finding.id} — ${finding.title}`);
      } catch (err) {
        console.error("Error parsing JSON:", err);
        process.exit(1);
      }
      break;
    }

    case "status": {
      const state = loadState();
      displayStatus(state);
      break;
    }

    case "sources": {
      displaySources();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main();

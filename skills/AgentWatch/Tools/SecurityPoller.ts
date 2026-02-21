#!/usr/bin/env bun
/**
 * SecurityPoller - Polls structured security feeds for AgentWatch
 *
 * Usage:
 *   bun run SecurityPoller.ts poll      # Run full security poll
 *   bun run SecurityPoller.ts health    # Check polling health status
 *   bun run SecurityPoller.ts test      # Test API connectivity
 *
 * Data Sources (structured feeds only - no freeform content):
 *   - NVD CVE Database (JSON API)
 *   - GitHub Security Advisories (GraphQL API)
 *   - GitHub Releases (REST API via gh CLI)
 *
 * This tool deliberately does NOT process Twitter, discussions, or any
 * freeform content to avoid self-referential prompt injection attacks.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_DIR = join(SKILL_DIR, "Config");
const DATA_DIR = join(SKILL_DIR, "Data");

// Voice notification helper
async function notify(message: string): Promise<void> {
  try {
    await fetch("http://localhost:8888/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    // Voice server may not be running - that's OK
  }
}

// Types
interface PollState {
  nvd_last_modified: string;
  github_advisories: Record<string, string>;
  last_successful_poll: string;
  poll_count: number;
  errors_last_7d: number;
  last_errors: string[];
}

interface SecurityEvent {
  ts: string;
  type: "cve" | "advisory" | "release";
  id?: string;
  ghsa?: string;
  repo?: string;
  cvss?: number;
  severity?: string;
  product?: string;
  description: string;
  source: "nvd" | "github";
  actionable: boolean;
  url?: string;
}

interface TrackedRepo {
  owner: string;
  repo: string;
  reason: string;
  priority: "critical" | "high" | "medium";
}

interface CVEKeywords {
  primary: string[];
  secondary: string[];
  dependencies: string[];
  attack_patterns: string[];
  exclude: string[];
  min_cvss: number;
  critical_cvss: number;
}

// Load configurations
function loadConfig<T>(filename: string): T | null {
  const path = join(CONFIG_DIR, filename);
  if (!existsSync(path)) {
    console.error(`Config not found: ${path}`);
    return null;
  }
  return parseYaml(readFileSync(path, "utf-8")) as T;
}

// Load poll state
function loadState(): PollState {
  const path = join(DATA_DIR, "last-poll.json");
  if (!existsSync(path)) {
    // Initialize with defaults
    const initial: PollState = {
      nvd_last_modified: new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
      github_advisories: {},
      last_successful_poll: "",
      poll_count: 0,
      errors_last_7d: 0,
      last_errors: [],
    };
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Save poll state
function saveState(state: PollState): void {
  const path = join(DATA_DIR, "last-poll.json");
  writeFileSync(path, JSON.stringify(state, null, 2));
}

// Append security event
function appendEvent(event: SecurityEvent): void {
  const path = join(DATA_DIR, "security-events.jsonl");
  appendFileSync(path, JSON.stringify(event) + "\n");
}

// Poll NVD for CVEs
async function pollNVD(
  keywords: string[],
  lastModified: string,
  minCvss: number,
  criticalCvss: number
): Promise<{ events: SecurityEvent[]; errors: string[] }> {
  const events: SecurityEvent[] = [];
  const errors: string[] = [];

  console.log(`\nPolling NVD for ${keywords.length} keywords...`);

  for (const keyword of keywords) {
    try {
      // NVD API 2.0 rate limit: 5 requests per 30 seconds without API key
      await new Promise((resolve) => setTimeout(resolve, 6500));

      const params = new URLSearchParams({
        keywordSearch: keyword,
        lastModStartDate: lastModified.split(".")[0] + "Z", // NVD wants specific format
        lastModEndDate: new Date().toISOString().split(".")[0] + "Z", // NVD requires both start and end
        resultsPerPage: "50",
      });

      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?${params}`;
      console.log(`  Checking: ${keyword}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "AgentWatch/1.0 (PAI Security Monitoring)",
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.log(`    Rate limited, skipping ${keyword}`);
          errors.push(`NVD rate limited for: ${keyword}`);
          continue;
        }
        throw new Error(`NVD API error: ${response.status}`);
      }

      const data = await response.json();
      const vulns = data.vulnerabilities || [];
      console.log(`    Found ${vulns.length} CVEs`);

      for (const vuln of vulns) {
        const cve = vuln.cve;

        // Get CVSS score (prefer v3.1, fall back to v3.0, then v2)
        let cvss = 0;
        if (cve.metrics?.cvssMetricV31?.[0]) {
          cvss = cve.metrics.cvssMetricV31[0].cvssData?.baseScore || 0;
        } else if (cve.metrics?.cvssMetricV30?.[0]) {
          cvss = cve.metrics.cvssMetricV30[0].cvssData?.baseScore || 0;
        } else if (cve.metrics?.cvssMetricV2?.[0]) {
          cvss = cve.metrics.cvssMetricV2[0].cvssData?.baseScore || 0;
        }

        if (cvss >= minCvss) {
          const description =
            cve.descriptions?.find((d: any) => d.lang === "en")?.value ||
            "No description available";

          const event: SecurityEvent = {
            ts: new Date().toISOString(),
            type: "cve",
            id: cve.id,
            cvss,
            product: keyword,
            description: description.slice(0, 500),
            source: "nvd",
            actionable: cvss >= criticalCvss,
            url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
          };

          events.push(event);
          console.log(
            `    [${cvss >= criticalCvss ? "CRITICAL" : "HIGH"}] ${cve.id} (CVSS ${cvss})`
          );
        }
      }
    } catch (error) {
      const msg = `NVD error for ${keyword}: ${error}`;
      console.error(`    ${msg}`);
      errors.push(msg);
    }
  }

  return { events, errors };
}

// Poll GitHub Security Advisories
async function pollGitHubAdvisories(
  repos: TrackedRepo[]
): Promise<{ events: SecurityEvent[]; errors: string[] }> {
  const events: SecurityEvent[] = [];
  const errors: string[] = [];

  console.log(`\nPolling GitHub advisories for ${repos.length} repos...`);

  for (const { owner, repo, priority } of repos) {
    try {
      console.log(`  Checking: ${owner}/${repo}`);

      // Use gh CLI for authenticated access
      const proc = Bun.spawn(
        [
          "gh",
          "api",
          `/repos/${owner}/${repo}/security-advisories`,
          "--jq",
          ".[] | {ghsa_id, severity, summary, html_url, published_at}",
        ],
        { stderr: "pipe" }
      );

      const output = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;

      if (proc.exitCode !== 0) {
        // Might not have access or repo doesn't exist
        if (stderr.includes("404") || stderr.includes("Not Found")) {
          console.log(`    No advisories endpoint (expected for some repos)`);
          continue;
        }
        throw new Error(stderr || `gh exited with code ${proc.exitCode}`);
      }

      if (!output.trim()) {
        console.log(`    No advisories`);
        continue;
      }

      // Parse NDJSON output
      for (const line of output.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const advisory = JSON.parse(line);

          if (["HIGH", "CRITICAL"].includes(advisory.severity?.toUpperCase())) {
            const event: SecurityEvent = {
              ts: new Date().toISOString(),
              type: "advisory",
              ghsa: advisory.ghsa_id,
              repo: `${owner}/${repo}`,
              severity: advisory.severity,
              description: advisory.summary || "No summary",
              source: "github",
              actionable: advisory.severity?.toUpperCase() === "CRITICAL",
              url: advisory.html_url,
            };

            events.push(event);
            console.log(
              `    [${advisory.severity}] ${advisory.ghsa_id}: ${advisory.summary?.slice(0, 60)}...`
            );
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (error) {
      const msg = `GitHub error for ${owner}/${repo}: ${error}`;
      console.error(`    ${msg}`);
      errors.push(msg);
    }
  }

  return { events, errors };
}

// Check for security-relevant releases
async function pollReleases(
  repos: TrackedRepo[]
): Promise<{ events: SecurityEvent[]; errors: string[] }> {
  const events: SecurityEvent[] = [];
  const errors: string[] = [];

  // Only check critical repos for releases
  const criticalRepos = repos.filter((r) => r.priority === "critical");
  console.log(
    `\nChecking releases for ${criticalRepos.length} critical repos...`
  );

  const securityKeywords = [
    "security",
    "vulnerability",
    "cve",
    "fix",
    "patch",
    "exploit",
  ];

  for (const { owner, repo } of criticalRepos) {
    try {
      console.log(`  Checking: ${owner}/${repo}`);

      const proc = Bun.spawn(
        [
          "gh",
          "release",
          "list",
          "-R",
          `${owner}/${repo}`,
          "-L",
          "5",
          "--json",
          "tagName,publishedAt,body,name",
        ],
        { stderr: "pipe" }
      );

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      if (proc.exitCode !== 0 || !output.trim()) {
        console.log(`    No releases or no access`);
        continue;
      }

      const releases = JSON.parse(output);

      for (const release of releases) {
        const bodyLower = (release.body || "").toLowerCase();
        const nameLower = (release.name || "").toLowerCase();
        const combined = bodyLower + " " + nameLower;

        const isSecurityRelevant = securityKeywords.some((kw) =>
          combined.includes(kw)
        );

        if (isSecurityRelevant) {
          const event: SecurityEvent = {
            ts: new Date().toISOString(),
            type: "release",
            repo: `${owner}/${repo}`,
            id: release.tagName,
            description: `Security-relevant release: ${release.name || release.tagName}`,
            source: "github",
            actionable: false,
            url: `https://github.com/${owner}/${repo}/releases/tag/${release.tagName}`,
          };

          events.push(event);
          console.log(`    [RELEASE] ${release.tagName} - security relevant`);
        }
      }
    } catch (error) {
      const msg = `Release check error for ${owner}/${repo}: ${error}`;
      console.error(`    ${msg}`);
      errors.push(msg);
    }
  }

  return { events, errors };
}

// Main poll function
async function poll(): Promise<void> {
  console.log("=".repeat(60));
  console.log("AgentWatch Security Poll");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // Load configs
  const keywordsConfig = loadConfig<CVEKeywords>("cve-keywords.yaml");
  const reposConfig = loadConfig<{
    frameworks: TrackedRepo[];
    agent_platforms: TrackedRepo[];
    infrastructure: TrackedRepo[];
    security_research: TrackedRepo[];
  }>("tracked-repos.yaml");

  if (!keywordsConfig || !reposConfig) {
    console.error("Failed to load configuration");
    process.exit(1);
  }

  // Flatten repos
  const allRepos: TrackedRepo[] = [
    ...(reposConfig.frameworks || []),
    ...(reposConfig.agent_platforms || []),
    ...(reposConfig.infrastructure || []),
    ...(reposConfig.security_research || []),
  ];

  // Flatten keywords
  const allKeywords = [
    ...keywordsConfig.primary,
    ...keywordsConfig.secondary,
    ...keywordsConfig.dependencies,
  ].filter((kw) => !keywordsConfig.exclude.includes(kw.toLowerCase()));

  // Load state
  const state = loadState();

  // Collect all events and errors
  const allEvents: SecurityEvent[] = [];
  const allErrors: string[] = [];

  // Poll NVD
  const nvdResult = await pollNVD(
    allKeywords.slice(0, 5), // Limit to avoid rate limits
    state.nvd_last_modified,
    keywordsConfig.min_cvss,
    keywordsConfig.critical_cvss
  );
  allEvents.push(...nvdResult.events);
  allErrors.push(...nvdResult.errors);

  // Poll GitHub Advisories
  const ghResult = await pollGitHubAdvisories(allRepos);
  allEvents.push(...ghResult.events);
  allErrors.push(...ghResult.errors);

  // Poll Releases
  const releaseResult = await pollReleases(allRepos);
  allEvents.push(...releaseResult.events);
  allErrors.push(...releaseResult.errors);

  // Dedupe events by ID
  const seen = new Set<string>();
  const uniqueEvents = allEvents.filter((e) => {
    const key = e.id || e.ghsa || `${e.repo}-${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Save events
  for (const event of uniqueEvents) {
    appendEvent(event);
  }

  // Update state
  state.nvd_last_modified = new Date().toISOString();
  state.last_successful_poll = new Date().toISOString();
  state.poll_count++;
  state.last_errors = allErrors.slice(-10);
  state.errors_last_7d = allErrors.length > 0 ? state.errors_last_7d + 1 : 0;
  saveState(state);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Poll Complete");
  console.log("=".repeat(60));
  console.log(`Events captured: ${uniqueEvents.length}`);
  console.log(`Errors: ${allErrors.length}`);
  console.log(`Poll count: ${state.poll_count}`);

  // Alert on critical events
  const critical = uniqueEvents.filter((e) => e.actionable);
  if (critical.length > 0) {
    console.log(`\n⚠️  ${critical.length} CRITICAL events:`);
    for (const e of critical) {
      console.log(`  - ${e.type}: ${e.id || e.ghsa || e.repo}`);
      console.log(`    ${e.description.slice(0, 100)}`);
    }

    // Voice alert
    await notify(
      `AgentWatch alert: ${critical.length} critical security events detected. Check the log for details.`
    );
  }

  // Health warning
  if (state.errors_last_7d > 3) {
    console.log("\n⚠️  DEGRADED: More than 3 errors in recent polls");
    await notify("AgentWatch health degraded. Multiple polling errors.");
  }
}

// Health check
function health(): void {
  const state = loadState();

  console.log("AgentWatch Health Status");
  console.log("=".repeat(40));
  console.log(`Last successful poll: ${state.last_successful_poll || "Never"}`);
  console.log(`Total polls: ${state.poll_count}`);
  console.log(`Errors (recent): ${state.errors_last_7d}`);
  console.log(
    `Status: ${state.errors_last_7d > 3 ? "⚠️  DEGRADED" : "✓ HEALTHY"}`
  );

  if (state.last_errors.length > 0) {
    console.log("\nRecent errors:");
    for (const err of state.last_errors.slice(-5)) {
      console.log(`  - ${err}`);
    }
  }

  // Check data freshness
  const eventsPath = join(DATA_DIR, "security-events.jsonl");
  if (existsSync(eventsPath)) {
    const stats = Bun.file(eventsPath);
    console.log(`\nEvents file size: ${(stats.size / 1024).toFixed(1)} KB`);
  }
}

// Test connectivity
async function test(): Promise<void> {
  console.log("Testing AgentWatch connectivity...\n");

  // Test NVD
  console.log("1. NVD API...");
  try {
    const response = await fetch(
      "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1"
    );
    console.log(`   ${response.ok ? "✓ OK" : "✗ FAILED"} (${response.status})`);
  } catch (error) {
    console.log(`   ✗ FAILED: ${error}`);
  }

  // Test GitHub CLI
  console.log("2. GitHub CLI...");
  try {
    const proc = Bun.spawn(["gh", "auth", "status"], { stderr: "pipe" });
    await proc.exited;
    console.log(`   ${proc.exitCode === 0 ? "✓ OK" : "✗ FAILED"}`);
  } catch (error) {
    console.log(`   ✗ FAILED: ${error}`);
  }

  // Test Voice Server
  console.log("3. Voice Server...");
  try {
    const response = await fetch("http://localhost:8888/health");
    console.log(`   ${response.ok ? "✓ OK" : "✗ NOT RUNNING"}`);
  } catch {
    console.log("   ⚠️  NOT RUNNING (optional)");
  }

  // Check configs
  console.log("\n4. Configuration files...");
  const configs = [
    "tracked-repos.yaml",
    "cve-keywords.yaml",
    "participation.yaml",
  ];
  for (const cfg of configs) {
    const path = join(CONFIG_DIR, cfg);
    console.log(`   ${existsSync(path) ? "✓" : "✗"} ${cfg}`);
  }
}

// Main
const command = process.argv[2] || "help";

switch (command) {
  case "poll":
    await poll();
    break;
  case "health":
    health();
    break;
  case "test":
    await test();
    break;
  default:
    console.log(`
AgentWatch SecurityPoller

Usage:
  bun run SecurityPoller.ts poll     Run security feed polling
  bun run SecurityPoller.ts health   Check polling health status
  bun run SecurityPoller.ts test     Test API connectivity

Data Sources:
  - NVD CVE Database
  - GitHub Security Advisories
  - GitHub Releases (security-relevant)
    `);
}

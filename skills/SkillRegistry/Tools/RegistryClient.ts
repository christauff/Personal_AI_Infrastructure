#!/usr/bin/env bun
/**
 * RegistryClient.ts - Cross-Platform Skill Registry Client
 *
 * Searches multiple skill registries, caches results, and orchestrates
 * secure installation via SkillSupplyChain scanning.
 *
 * Usage:
 *   bun run RegistryClient.ts search <query> [--registry <name>] [--limit <N>]
 *   bun run RegistryClient.ts info <skill-name>
 *   bun run RegistryClient.ts install <skill-name-or-url>
 *   bun run RegistryClient.ts audit
 *   bun run RegistryClient.ts --help
 *
 * Exit codes:
 *   0 - Success
 *   1 - Partial success (warnings during install)
 *   2 - Error or install blocked
 */

import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join, resolve, basename } from "path";
import { parse as parseYaml } from "yaml";

// ============================================================
// PATHS
// ============================================================

const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_PATH = join(SKILL_DIR, "Config", "registries.yaml");
const DATA_DIR = join(SKILL_DIR, "Data");
const CACHE_PATH = join(DATA_DIR, "registry-cache.jsonl");

// Integration paths
const SKILL_SCANNER_PATH =
  "/home/christauff/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts";

// ============================================================
// TYPES
// ============================================================

interface RegistryConfig {
  name: string;
  type: "cli" | "github" | "api" | "npm";
  command?: string;
  query?: string;
  endpoint?: string;
  scope?: string;
  enabled: boolean;
  description: string;
}

interface Config {
  version: string;
  registries: RegistryConfig[];
  search: {
    max_results_per_registry: number;
    timeout_ms: number;
    cache_ttl_hours: number;
  };
  install: {
    require_security_scan: boolean;
    auto_scan_severity: string;
    install_dir: string;
  };
}

interface SearchResult {
  name: string;
  description: string;
  source: string;
  url: string;
  stars?: number;
  downloads?: number;
  lastUpdated?: string;
}

interface CacheEntry {
  ts: string;
  type: "search" | "install";
  query?: string;
  registry?: string;
  results?: SearchResult[];
  action?: string;
  skill?: string;
  source?: string;
  verdict?: string;
  score?: number;
  url?: string;
}

// ============================================================
// HELPERS
// ============================================================

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Error: Config file not found at ${CONFIG_PATH}`);
    process.exit(2);
  }
  const content = readFileSync(CONFIG_PATH, "utf-8");
  return parseYaml(content) as Config;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function appendCache(entry: CacheEntry): void {
  try {
    ensureDataDir();
    appendFileSync(CACHE_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Cache write failure is non-fatal
  }
}

function readCache(): CacheEntry[] {
  if (!existsSync(CACHE_PATH)) return [];
  try {
    const content = readFileSync(CACHE_PATH, "utf-8").trim();
    if (!content) return [];
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as CacheEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is CacheEntry => e !== null);
  } catch {
    return [];
  }
}

/**
 * Resolve the install directory, expanding ~ to home.
 */
function resolveInstallDir(dir: string): string {
  if (dir.startsWith("~")) {
    const home = process.env.HOME || "/home/christauff";
    return join(home, dir.slice(1));
  }
  return resolve(dir);
}

/**
 * Check if a CLI tool is available.
 */
async function isToolAvailable(tool: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", tool], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Run a subprocess and capture stdout/stderr.
 */
async function runProcess(
  cmd: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      timeout: timeoutMs,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { stdout, stderr, exitCode };
  } catch (e) {
    return { stdout: "", stderr: String(e), exitCode: 2 };
  }
}

// ============================================================
// REGISTRY SEARCH IMPLEMENTATIONS
// ============================================================

/**
 * Search the Anthropic official registry via CLI.
 */
async function searchCli(
  registry: RegistryConfig,
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchResult[]> {
  const command = registry.command;
  if (!command) return [];

  // Check if npx is available
  if (!(await isToolAvailable("npx"))) {
    console.error(`  [${registry.name}] SKIPPED (npx not available)`);
    return [];
  }

  const parts = command.split(/\s+/);
  const cmd = [...parts, query];

  const { stdout, exitCode } = await runProcess(cmd, timeoutMs);

  if (exitCode !== 0 || !stdout.trim()) {
    return [];
  }

  // Try to parse as JSON first
  try {
    const data = JSON.parse(stdout);
    if (Array.isArray(data)) {
      return data.slice(0, limit).map((item: Record<string, unknown>) => ({
        name: String(item.name || ""),
        description: String(item.description || ""),
        source: registry.name,
        url: String(item.url || item.homepage || ""),
        stars: typeof item.stars === "number" ? item.stars : undefined,
        downloads:
          typeof item.downloads === "number" ? item.downloads : undefined,
        lastUpdated: item.lastUpdated
          ? String(item.lastUpdated)
          : undefined,
      }));
    }
  } catch {
    // Not JSON -- try line-by-line parsing
  }

  // Fallback: parse line-by-line output
  const results: SearchResult[] = [];
  const lines = stdout.split("\n").filter((l) => l.trim());
  for (const line of lines.slice(0, limit)) {
    // Try "name - description" format
    const match = line.match(/^([^\s-]+)\s+-\s+(.+)$/);
    if (match) {
      results.push({
        name: match[1].trim(),
        description: match[2].trim(),
        source: registry.name,
        url: "",
      });
    }
  }
  return results;
}

/**
 * Search GitHub repositories by topic.
 */
async function searchGitHub(
  registry: RegistryConfig,
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchResult[]> {
  if (!(await isToolAvailable("gh"))) {
    console.error(`  [${registry.name}] SKIPPED (gh CLI not available)`);
    return [];
  }

  const cmd = [
    "gh",
    "search",
    "repos",
    query,
    "--topic",
    "claude-code-skill",
    "--json",
    "name,description,url,stargazersCount,updatedAt",
    "--limit",
    String(limit),
  ];

  const { stdout, exitCode } = await runProcess(cmd, timeoutMs);

  if (exitCode !== 0 || !stdout.trim()) {
    // Fallback: try broader search without topic filter
    const fallbackCmd = [
      "gh",
      "search",
      "repos",
      `${query} claude-code skill`,
      "--json",
      "name,description,url,stargazersCount,updatedAt",
      "--limit",
      String(limit),
    ];

    const fallback = await runProcess(fallbackCmd, timeoutMs);
    if (fallback.exitCode !== 0 || !fallback.stdout.trim()) {
      return [];
    }

    try {
      const data = JSON.parse(fallback.stdout);
      if (!Array.isArray(data)) return [];
      return data.map(
        (repo: Record<string, unknown>) => ({
          name: String(repo.name || ""),
          description: String(repo.description || "No description"),
          source: registry.name,
          url: String(repo.url || ""),
          stars:
            typeof repo.stargazersCount === "number"
              ? repo.stargazersCount
              : undefined,
          lastUpdated: repo.updatedAt
            ? String(repo.updatedAt).slice(0, 10)
            : undefined,
        })
      );
    } catch {
      return [];
    }
  }

  try {
    const data = JSON.parse(stdout);
    if (!Array.isArray(data)) return [];
    return data.map((repo: Record<string, unknown>) => ({
      name: String(repo.name || ""),
      description: String(repo.description || "No description"),
      source: registry.name,
      url: String(repo.url || ""),
      stars:
        typeof repo.stargazersCount === "number"
          ? repo.stargazersCount
          : undefined,
      lastUpdated: repo.updatedAt
        ? String(repo.updatedAt).slice(0, 10)
        : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Search an API-based registry.
 */
async function searchApi(
  registry: RegistryConfig,
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchResult[]> {
  const endpoint = registry.endpoint;
  if (!endpoint) return [];

  try {
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: Array<Record<string, unknown>>;
    };
    const results = data.results || [];

    return results.slice(0, limit).map((item) => ({
      name: String(item.name || ""),
      description: String(item.description || ""),
      source: registry.name,
      url: String(item.url || ""),
      stars:
        typeof item.stars === "number" ? item.stars : undefined,
      downloads:
        typeof item.downloads === "number" ? item.downloads : undefined,
      lastUpdated: item.lastUpdated
        ? String(item.lastUpdated)
        : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Search npm registry for skill packages.
 */
async function searchNpm(
  registry: RegistryConfig,
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchResult[]> {
  if (!(await isToolAvailable("npm"))) {
    console.error(`  [${registry.name}] SKIPPED (npm not available)`);
    return [];
  }

  const searchQuery = registry.scope
    ? `${registry.scope} ${query}`
    : `claude-code-skill ${query}`;

  const cmd = ["npm", "search", searchQuery, "--json"];

  const { stdout, exitCode } = await runProcess(cmd, timeoutMs);

  if (exitCode !== 0 || !stdout.trim()) {
    return [];
  }

  try {
    const data = JSON.parse(stdout);
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).map((pkg: Record<string, unknown>) => ({
      name: String(pkg.name || ""),
      description: String(pkg.description || "No description"),
      source: registry.name,
      url: `https://www.npmjs.com/package/${pkg.name}`,
      downloads: undefined,
      lastUpdated:
        pkg.date && typeof pkg.date === "object" && (pkg.date as Record<string, unknown>).ts
          ? String((pkg.date as Record<string, unknown>).ts).slice(0, 10)
          : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Dispatch search to the appropriate handler based on registry type.
 */
async function searchRegistry(
  registry: RegistryConfig,
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchResult[]> {
  switch (registry.type) {
    case "cli":
      return searchCli(registry, query, limit, timeoutMs);
    case "github":
      return searchGitHub(registry, query, limit, timeoutMs);
    case "api":
      return searchApi(registry, query, limit, timeoutMs);
    case "npm":
      return searchNpm(registry, query, limit, timeoutMs);
    default:
      console.error(`  [${registry.name}] SKIPPED (unknown type: ${registry.type})`);
      return [];
  }
}

// ============================================================
// SEARCH SUBCOMMAND
// ============================================================

async function runSearch(
  query: string,
  options: { registry?: string; limit: number }
): Promise<number> {
  const config = loadConfig();
  const timeoutMs = config.search.timeout_ms;
  const limit = Math.min(options.limit, config.search.max_results_per_registry);

  // Filter to enabled registries (and specific one if requested)
  let registries = config.registries.filter((r) => r.enabled);
  if (options.registry) {
    registries = registries.filter((r) => r.name === options.registry);
    if (registries.length === 0) {
      console.error(`Error: Registry "${options.registry}" not found or not enabled`);
      console.error(
        "Available registries: " +
          config.registries.map((r) => `${r.name}${r.enabled ? "" : " (disabled)"}`).join(", ")
      );
      return 2;
    }
  }

  console.log(`SkillRegistry Search: "${query}"`);
  console.log(`Searching ${registries.length} registry(ies)...\n`);

  const allResults: SearchResult[] = [];

  for (const registry of registries) {
    console.log(`  [${registry.name}] Searching...`);
    try {
      const results = await searchRegistry(registry, query, limit, timeoutMs);
      if (results.length > 0) {
        console.log(`  [${registry.name}] ${results.length} result(s)`);
        allResults.push(...results);
      } else {
        console.log(`  [${registry.name}] No results`);
      }
    } catch (e) {
      console.error(`  [${registry.name}] ERROR: ${e}`);
    }
  }

  console.log("");

  if (allResults.length === 0) {
    console.log("No results found across any registry.");
    return 0;
  }

  // Display results in table format
  console.log(`Found ${allResults.length} result(s):\n`);
  console.log(
    "  " +
      "Name".padEnd(30) +
      "Source".padEnd(22) +
      "Stars".padEnd(8) +
      "Description"
  );
  console.log("  " + "-".repeat(90));

  for (const result of allResults) {
    const stars =
      result.stars !== undefined ? String(result.stars) : "-";
    const desc =
      result.description.length > 40
        ? result.description.slice(0, 37) + "..."
        : result.description;
    console.log(
      "  " +
        result.name.padEnd(30) +
        result.source.padEnd(22) +
        stars.padEnd(8) +
        desc
    );
  }

  if (allResults.some((r) => r.url)) {
    console.log("\nURLs:");
    for (const result of allResults) {
      if (result.url) {
        console.log(`  ${result.name}: ${result.url}`);
      }
    }
  }

  // Cache results
  appendCache({
    ts: new Date().toISOString(),
    type: "search",
    query,
    results: allResults,
  });

  return 0;
}

// ============================================================
// INFO SUBCOMMAND
// ============================================================

async function runInfo(skillName: string): Promise<number> {
  const config = loadConfig();
  const timeoutMs = config.search.timeout_ms;

  console.log(`SkillRegistry Info: "${skillName}"\n`);

  // Search across registries for the specific skill
  const registries = config.registries.filter((r) => r.enabled);
  let found: SearchResult | null = null;

  for (const registry of registries) {
    try {
      const results = await searchRegistry(registry, skillName, 5, timeoutMs);
      // Find exact or close match
      const exact = results.find(
        (r) => r.name.toLowerCase() === skillName.toLowerCase()
      );
      if (exact) {
        found = exact;
        break;
      }
      // Take first result as close match
      if (!found && results.length > 0) {
        found = results[0];
      }
    } catch {
      // Skip registry errors
    }
  }

  if (!found) {
    console.log(`No information found for "${skillName}"`);
    return 0;
  }

  console.log("### Skill Details\n");
  console.log(`Name:         ${found.name}`);
  console.log(`Description:  ${found.description}`);
  console.log(`Source:        ${found.source}`);
  if (found.url) console.log(`URL:          ${found.url}`);
  if (found.stars !== undefined) console.log(`Stars:        ${found.stars}`);
  if (found.downloads !== undefined) console.log(`Downloads:    ${found.downloads}`);
  if (found.lastUpdated) console.log(`Last Updated: ${found.lastUpdated}`);

  // If GitHub URL, try to get more details
  if (found.url && found.url.includes("github.com") && (await isToolAvailable("gh"))) {
    const repoPath = found.url.replace("https://github.com/", "");
    if (repoPath.includes("/")) {
      const { stdout } = await runProcess(
        [
          "gh",
          "repo",
          "view",
          repoPath,
          "--json",
          "description,homepageUrl,licenseInfo,languages,latestRelease,createdAt,pushedAt",
        ],
        timeoutMs
      );

      if (stdout.trim()) {
        try {
          const details = JSON.parse(stdout) as Record<string, unknown>;
          console.log("");
          if (details.licenseInfo && typeof details.licenseInfo === "object") {
            const license = (details.licenseInfo as Record<string, unknown>)
              .name;
            if (license) console.log(`License:      ${license}`);
          }
          if (details.homepageUrl) console.log(`Homepage:     ${details.homepageUrl}`);
          if (details.createdAt)
            console.log(`Created:      ${String(details.createdAt).slice(0, 10)}`);
          if (details.pushedAt)
            console.log(`Last Push:    ${String(details.pushedAt).slice(0, 10)}`);
          if (details.languages && typeof details.languages === "object") {
            const langs = details.languages as Array<{ node: { name: string } }>;
            if (Array.isArray(langs) && langs.length > 0) {
              console.log(
                `Languages:    ${langs.map((l) => l.node?.name || l).join(", ")}`
              );
            }
          }
        } catch {
          // JSON parse error -- non-fatal
        }
      }
    }
  }

  return 0;
}

// ============================================================
// INSTALL SUBCOMMAND
// ============================================================

async function runInstall(skillNameOrUrl: string): Promise<number> {
  const config = loadConfig();
  const timeoutMs = config.search.timeout_ms;
  const installDir = resolveInstallDir(config.install.install_dir);

  console.log("SkillRegistry Install Pipeline\n");

  // Step 1: Determine source URL
  let url = skillNameOrUrl;
  let skillName = skillNameOrUrl;
  let source = "direct";

  const isUrl =
    skillNameOrUrl.startsWith("http://") ||
    skillNameOrUrl.startsWith("https://") ||
    skillNameOrUrl.startsWith("git@");

  if (!isUrl) {
    // Search registries for the skill
    console.log(`[1/5] Searching for "${skillNameOrUrl}"...`);
    const registries = config.registries.filter((r) => r.enabled);
    let found: SearchResult | null = null;

    for (const registry of registries) {
      try {
        const results = await searchRegistry(
          registry,
          skillNameOrUrl,
          5,
          timeoutMs
        );
        const exact = results.find(
          (r) => r.name.toLowerCase() === skillNameOrUrl.toLowerCase()
        );
        if (exact && exact.url) {
          found = exact;
          break;
        }
        if (!found && results.length > 0 && results[0].url) {
          found = results[0];
        }
      } catch {
        // Skip
      }
    }

    if (!found || !found.url) {
      console.error(
        `Error: Could not find "${skillNameOrUrl}" in any registry`
      );
      console.error("Try providing a direct URL instead.");
      return 2;
    }

    url = found.url;
    skillName = found.name;
    source = found.source;
    console.log(`  Found: ${skillName} (${source})`);
    console.log(`  URL: ${url}`);
  } else {
    // Extract name from URL
    const urlBasename = basename(url.replace(/\.git$/, ""));
    if (urlBasename) skillName = urlBasename;
    console.log(`[1/5] Using direct URL: ${url}`);
  }

  // Step 2: Clone/download to temp directory
  console.log(`\n[2/5] Downloading to temp directory...`);
  const tmpDir = join(DATA_DIR, `.tmp-install-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  let cloneSuccess = false;

  if (url.includes("github.com") || url.startsWith("git@")) {
    // Git clone
    const { exitCode, stderr } = await runProcess(
      ["git", "clone", "--depth", "1", url, tmpDir],
      30000
    );
    if (exitCode === 0) {
      cloneSuccess = true;
      console.log("  Clone successful");
    } else {
      console.error(`  Clone failed: ${stderr.trim()}`);
    }
  } else if (url.startsWith("https://www.npmjs.com/package/")) {
    // npm pack and extract
    const pkgName = url.replace("https://www.npmjs.com/package/", "");
    const { exitCode } = await runProcess(
      ["npm", "pack", pkgName, "--pack-destination", tmpDir],
      30000
    );
    if (exitCode === 0) {
      cloneSuccess = true;
      console.log("  npm pack successful");
    }
  }

  if (!cloneSuccess) {
    // Cleanup temp
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    console.error("Error: Failed to download skill");
    return 2;
  }

  // Step 3: Security scan via SkillSupplyChain
  console.log(`\n[3/5] Running security scan (SkillSupplyChain)...`);

  let verdict = "UNKNOWN";
  let score = 0;

  if (config.install.require_security_scan) {
    if (!existsSync(SKILL_SCANNER_PATH)) {
      console.error(
        "  ERROR: SkillSupplyChain scanner not found at expected path"
      );
      console.error(`  Path: ${SKILL_SCANNER_PATH}`);
      console.error(
        "  Install SkillSupplyChain first, or set require_security_scan: false"
      );
      // Cleanup
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return 2;
    }

    const { stdout, exitCode } = await runProcess(
      ["bun", "run", SKILL_SCANNER_PATH, "scan", tmpDir, "--json"],
      60000
    );

    if (stdout.trim()) {
      try {
        const scanResult = JSON.parse(stdout) as {
          verdict: string;
          score: number;
          findings: Array<{
            severity: string;
            message: string;
            file: string;
            line: number;
          }>;
        };
        verdict = scanResult.verdict;
        score = scanResult.score;

        console.log(`  Verdict: ${verdict} (score: ${score}/100)`);

        if (scanResult.findings.length > 0) {
          console.log(`  Findings: ${scanResult.findings.length}`);
          for (const f of scanResult.findings.slice(0, 10)) {
            console.log(`    [${f.severity.toUpperCase()}] ${f.file}:${f.line} - ${f.message}`);
          }
          if (scanResult.findings.length > 10) {
            console.log(`    ... and ${scanResult.findings.length - 10} more`);
          }
        }
      } catch {
        console.error("  Failed to parse scan output");
        verdict = exitCode === 0 ? "PASS" : exitCode === 1 ? "WARN" : "FAIL";
      }
    } else {
      verdict = exitCode === 0 ? "PASS" : exitCode === 1 ? "WARN" : "FAIL";
      console.log(`  Verdict: ${verdict} (exit code: ${exitCode})`);
    }
  } else {
    console.log("  Security scan DISABLED in config");
    verdict = "SKIPPED";
  }

  // Step 4: Act on verdict
  console.log(`\n[4/5] Install decision...`);

  if (verdict === "FAIL") {
    console.log("  BLOCKED: Security scan FAILED. Installation blocked.");
    console.log("  Review findings above and fix issues before retrying.");
    // Cleanup
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    // Log failed install
    appendCache({
      ts: new Date().toISOString(),
      type: "install",
      action: "install",
      skill: skillName,
      source,
      url,
      verdict,
      score,
    });
    return 2;
  }

  if (verdict === "WARN") {
    console.log("  WARNING: Security issues detected (non-critical).");
    console.log(
      "  Review the findings above. To proceed, re-run with the URL directly."
    );
    console.log(
      "  Automated install halted -- manual review required."
    );
    // Cleanup temp dir but keep the record
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    appendCache({
      ts: new Date().toISOString(),
      type: "install",
      action: "install",
      skill: skillName,
      source,
      url,
      verdict,
      score,
    });
    return 1;
  }

  // PASS or SKIPPED -- proceed with install
  const destDir = join(installDir, skillName);

  if (existsSync(destDir)) {
    console.log(`  Destination exists: ${destDir}`);
    console.log("  Removing existing installation before replacing...");
    try {
      rmSync(destDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`  Failed to remove existing: ${e}`);
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return 2;
    }
  }

  // Move from temp to install dir
  try {
    const { exitCode, stderr } = await runProcess(
      ["mv", tmpDir, destDir],
      10000
    );
    if (exitCode !== 0) {
      console.error(`  Move failed: ${stderr}`);
      return 2;
    }
    console.log(`  Installed to: ${destDir}`);
  } catch (e) {
    console.error(`  Install failed: ${e}`);
    return 2;
  }

  // Step 5: Log and report
  console.log(`\n[5/5] Recording install...`);

  appendCache({
    ts: new Date().toISOString(),
    type: "install",
    action: "install",
    skill: skillName,
    source,
    url,
    verdict,
    score,
  });

  console.log("  Install logged to registry-cache.jsonl");
  console.log(`\nInstallation complete: ${skillName}`);
  console.log(`  Location: ${destDir}`);
  console.log(`  Verdict: ${verdict} (score: ${score}/100)`);

  return 0;
}

// ============================================================
// AUDIT SUBCOMMAND
// ============================================================

function runAudit(): number {
  const entries = readCache();
  const installs = entries.filter((e) => e.type === "install");

  console.log("## SkillRegistry Audit Trail\n");

  if (installs.length === 0) {
    console.log("No installation records found.");
    console.log(`Cache file: ${CACHE_PATH}`);
    return 0;
  }

  // Summary counts
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let otherCount = 0;

  for (const install of installs) {
    switch (install.verdict) {
      case "PASS":
        passCount++;
        break;
      case "WARN":
        warnCount++;
        break;
      case "FAIL":
        failCount++;
        break;
      default:
        otherCount++;
    }
  }

  console.log("### Summary");
  console.log(`- Total installs: ${installs.length}`);
  console.log(`- PASS: ${passCount}`);
  console.log(`- WARN: ${warnCount}`);
  console.log(`- FAIL: ${failCount}`);
  if (otherCount > 0) console.log(`- Other: ${otherCount}`);
  console.log("");

  // Install history table
  console.log("### Install History\n");
  console.log(
    "  " +
      "Timestamp".padEnd(22) +
      "Skill".padEnd(25) +
      "Source".padEnd(20) +
      "Verdict".padEnd(10) +
      "Score"
  );
  console.log("  " + "-".repeat(85));

  for (const install of installs) {
    const ts = (install.ts || "").slice(0, 19);
    const skill = (install.skill || "unknown").slice(0, 23);
    const source = (install.source || "-").slice(0, 18);
    const verdict = install.verdict || "-";
    const score =
      install.score !== undefined ? String(install.score) : "-";

    console.log(
      "  " +
        ts.padEnd(22) +
        skill.padEnd(25) +
        source.padEnd(20) +
        verdict.padEnd(10) +
        score
    );
  }

  // Warn about WARN installs
  const warnInstalls = installs.filter((i) => i.verdict === "WARN");
  if (warnInstalls.length > 0) {
    console.log("\n### Attention: Skills Installed with Warnings\n");
    for (const w of warnInstalls) {
      console.log(`  - ${w.skill} (${w.source}) - score: ${w.score}`);
      console.log(
        `    Consider re-scanning: bun run SkillScanner.ts scan ~/.claude/skills/${w.skill}/`
      );
    }
  }

  // Show search cache stats
  const searches = entries.filter((e) => e.type === "search");
  if (searches.length > 0) {
    console.log(`\n### Search Cache`);
    console.log(`- Cached searches: ${searches.length}`);
    if (searches.length > 0) {
      const latest = searches[searches.length - 1];
      console.log(`- Last search: "${latest.query}" at ${latest.ts}`);
    }
  }

  return 0;
}

// ============================================================
// USAGE
// ============================================================

function printUsage(): void {
  console.log(`RegistryClient - Cross-Platform Skill Registry Client

Usage:
  bun run RegistryClient.ts search <query> [options]   Search skill registries
  bun run RegistryClient.ts info <skill-name>           Get skill details
  bun run RegistryClient.ts install <name-or-url>       Install with security scan
  bun run RegistryClient.ts audit                        Show install history
  bun run RegistryClient.ts --help                       Show this help

Search Options:
  --registry <name>    Search only this registry
  --limit <N>          Max results per registry (default: 10)

Registries:
  anthropic-official   Official Anthropic skill registry (npx)
  github-topics        GitHub repos with claude-code-skill topic (gh)
  skillsmp             SkillsMP marketplace API (disabled by default)
  npm-registry         npm packages with claude skill keywords

Install Pipeline:
  1. Search registries for skill (or use direct URL)
  2. Clone/download to temp directory
  3. Run SkillSupplyChain security scan
  4. If PASS: Install to ~/.claude/skills/
  5. If WARN: Show warnings, halt for review
  6. If FAIL: Block installation

Config: Config/registries.yaml
Cache:  Data/registry-cache.jsonl

Examples:
  bun run RegistryClient.ts search "browser automation"
  bun run RegistryClient.ts search "security" --registry github-topics
  bun run RegistryClient.ts info claude-browser-skill
  bun run RegistryClient.ts install https://github.com/user/my-skill
  bun run RegistryClient.ts audit`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "search": {
      const query = args[1];
      if (!query) {
        console.error("Error: search requires a query argument");
        console.error('Usage: bun run RegistryClient.ts search "<query>"');
        process.exit(2);
      }

      // Parse options
      let registry: string | undefined;
      let limit = 10;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--registry" && args[i + 1]) {
          registry = args[i + 1];
          i++;
        } else if (args[i] === "--limit" && args[i + 1]) {
          limit = parseInt(args[i + 1], 10) || 10;
          i++;
        }
      }

      const exitCode = await runSearch(query, { registry, limit });
      process.exit(exitCode);
      break;
    }

    case "info": {
      const skillName = args[1];
      if (!skillName) {
        console.error("Error: info requires a skill name argument");
        console.error("Usage: bun run RegistryClient.ts info <skill-name>");
        process.exit(2);
      }
      const exitCode = await runInfo(skillName);
      process.exit(exitCode);
      break;
    }

    case "install": {
      const target = args[1];
      if (!target) {
        console.error("Error: install requires a skill name or URL");
        console.error(
          "Usage: bun run RegistryClient.ts install <name-or-url>"
        );
        process.exit(2);
      }
      const exitCode = await runInstall(target);
      process.exit(exitCode);
      break;
    }

    case "audit": {
      const exitCode = runAudit();
      process.exit(exitCode);
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printUsage();
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`Fatal error: ${e}`);
  process.exit(2);
});

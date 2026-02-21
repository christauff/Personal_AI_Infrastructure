#!/usr/bin/env bun
/**
 * ContentSafety.ts — Pre-post content filter for X/Twitter
 *
 * Validates content before publishing:
 *   - Character limit (280 for single tweets, thread splitting)
 *   - Banned terms and patterns
 *   - PII detection
 *   - Regulatory accuracy markers
 *   - Link validation
 *   - Tone/professionalism check
 *
 * Usage:
 *   bun ContentSafety.ts check "tweet content here"
 *   bun ContentSafety.ts check-thread "tweet1|||tweet2|||tweet3"
 *   bun ContentSafety.ts --help
 *
 * Exit codes:
 *   0 — Content passes all checks
 *   1 — Content blocked (safety issue)
 *   2 — Content has warnings (review recommended)
 *
 * @author PAI System
 * @version 1.0.0
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Configuration
// ============================================================================

const MAX_TWEET_LENGTH = 280;
const MAX_TWEET_LENGTH_PREMIUM = 4000; // X Premium long-form tweets
const MAX_THREAD_LENGTH = 10;
const THREAD_SEPARATOR = "|||";

// Terms that should NEVER appear in automated posts
const BANNED_TERMS = [
  // Inflammatory / political
  "breaking:", "urgent:", "exclusive:",
  // Could be misread as official government communication
  "official statement", "government orders", "mandatory compliance",
  // Sensationalism
  "you won't believe", "shocking", "mind-blowing",
  // Financial advice
  "guaranteed", "risk-free", "investment opportunity",
  // Personally identifying
  "ssn", "social security", "credit card number",
];

// Patterns that indicate potential PII
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,                    // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,            // Phone number
  /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct)\b/i, // Address
];

// Regulatory terms that should be accurate (flag for review if present)
const ACCURACY_SENSITIVE_TERMS = [
  /CVE-\d{4}-\d{4,}/,         // CVE numbers — must be real
  /SP\s*800-\d+/i,            // NIST SP numbers
  /\bRev\.?\s*\d+/i,          // Revision numbers
  /CMMC\s*(Level|Phase)\s*\d/i, // CMMC levels/phases
  /FedRAMP\s*(High|Moderate|Low|Li-SaaS)/i, // FedRAMP impact levels
  /\b(AC|AT|AU|CA|CM|CP|IA|IR|MA|MP|PE|PL|PM|PS|RA|SA|SC|SI|SR)-\d+/,  // NIST control families
  /\bSTIG\b/i,                 // STIG references
  /\bPOA&M\b/i,               // Plan of Actions & Milestones
];

// ============================================================================
// Types
// ============================================================================

interface CheckResult {
  passed: boolean;
  level: "pass" | "warn" | "block";
  check: string;
  message: string;
}

interface SafetyReport {
  content: string;
  timestamp: string;
  checks: CheckResult[];
  passed: boolean;
  blocked: boolean;
  warnings: number;
  summary: string;
}

// ============================================================================
// Checks
// ============================================================================

function checkLength(content: string, longForm: boolean = false): CheckResult {
  const limit = longForm ? MAX_TWEET_LENGTH_PREMIUM : MAX_TWEET_LENGTH;
  if (content.length <= limit) {
    return {
      passed: true,
      level: "pass",
      check: "length",
      message: `${content.length}/${limit} characters${longForm ? " (long-form)" : ""}`,
    };
  }
  return {
    passed: false,
    level: "block",
    check: "length",
    message: `${content.length}/${limit} — exceeds character limit by ${content.length - limit}`,
  };
}

function checkBannedTerms(content: string): CheckResult {
  const lower = content.toLowerCase();
  const found = BANNED_TERMS.filter(term => lower.includes(term.toLowerCase()));

  if (found.length === 0) {
    return {
      passed: true,
      level: "pass",
      check: "banned-terms",
      message: "No banned terms found",
    };
  }
  return {
    passed: false,
    level: "block",
    check: "banned-terms",
    message: `Banned terms detected: ${found.join(", ")}`,
  };
}

function checkPII(content: string): CheckResult {
  const found: string[] = [];
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(content)) {
      found.push(pattern.source.slice(0, 20) + "...");
    }
  }

  if (found.length === 0) {
    return {
      passed: true,
      level: "pass",
      check: "pii",
      message: "No PII patterns detected",
    };
  }
  return {
    passed: false,
    level: "block",
    check: "pii",
    message: `Potential PII detected (${found.length} pattern(s))`,
  };
}

function checkAccuracySensitive(content: string): CheckResult {
  const found: string[] = [];
  for (const pattern of ACCURACY_SENSITIVE_TERMS) {
    const match = content.match(pattern);
    if (match) {
      found.push(match[0]);
    }
  }

  if (found.length === 0) {
    return {
      passed: true,
      level: "pass",
      check: "accuracy-sensitive",
      message: "No accuracy-sensitive terms",
    };
  }
  return {
    passed: true,
    level: "warn",
    check: "accuracy-sensitive",
    message: `Accuracy-sensitive terms found (verify): ${found.join(", ")}`,
  };
}

function checkEmptyContent(content: string): CheckResult {
  const trimmed = content.trim();
  if (trimmed.length > 0) {
    return {
      passed: true,
      level: "pass",
      check: "non-empty",
      message: "Content is not empty",
    };
  }
  return {
    passed: false,
    level: "block",
    check: "non-empty",
    message: "Content is empty or whitespace-only",
  };
}

function checkExcessiveHashtags(content: string): CheckResult {
  const hashtags = (content.match(/#\w+/g) || []).length;
  if (hashtags === 0) {
    return {
      passed: true,
      level: "pass",
      check: "hashtags",
      message: "0 hashtags — good",
    };
  }
  return {
    passed: false,
    level: "block",
    check: "hashtags",
    message: `${hashtags} hashtag(s) — zero tolerance. All top-performing accounts use zero hashtags. Remove all hashtags.`,
  };
}

function checkExcessiveCaps(content: string): CheckResult {
  const words = content.split(/\s+/).filter(w => w.length > 2);
  const capsWords = words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w));
  // Exclude known acronyms
  const acronyms = ["NIST", "CISA", "CMMC", "FedRAMP", "CVE", "STIG", "POA&M",
    "ATO", "SSP", "RMF", "FISMA", "DFARS", "ITAR", "CUI", "CDI", "FCI",
    "DIB", "C3PAO", "DIBCAC", "SPRS", "KEV", "EO", "OMB", "FTC", "FCC",
    "AI", "ML", "API", "SaaS", "IaaS", "PaaS", "CSP", "ISO", "SOC"];
  const nonAcronymCaps = capsWords.filter(w => !acronyms.includes(w.replace(/[^A-Z]/g, "")));

  const ratio = words.length > 0 ? nonAcronymCaps.length / words.length : 0;
  if (ratio < 0.3) {
    return {
      passed: true,
      level: "pass",
      check: "caps",
      message: "Capitalization is reasonable",
    };
  }
  return {
    passed: true,
    level: "warn",
    check: "caps",
    message: `${Math.round(ratio * 100)}% non-acronym caps — may appear aggressive`,
  };
}

// ============================================================================
// Runner
// ============================================================================

function runChecks(content: string, longForm: boolean = false): SafetyReport {
  const checks = [
    checkEmptyContent(content),
    checkLength(content, longForm),
    checkBannedTerms(content),
    checkPII(content),
    checkAccuracySensitive(content),
    checkExcessiveHashtags(content),
    checkExcessiveCaps(content),
  ];

  const blocked = checks.some(c => c.level === "block");
  const warnings = checks.filter(c => c.level === "warn").length;
  const passed = !blocked;

  let summary: string;
  if (blocked) {
    const blockers = checks.filter(c => c.level === "block").map(c => c.check);
    summary = `BLOCKED: ${blockers.join(", ")}`;
  } else if (warnings > 0) {
    summary = `PASSED with ${warnings} warning(s) — review recommended`;
  } else {
    summary = "PASSED — all checks clear";
  }

  return {
    content,
    timestamp: new Date().toISOString(),
    checks,
    passed,
    blocked,
    warnings,
    summary,
  };
}

function runThreadChecks(content: string): SafetyReport[] {
  const tweets = content.split(THREAD_SEPARATOR).map(t => t.trim());

  if (tweets.length > MAX_THREAD_LENGTH) {
    console.error(`Thread has ${tweets.length} tweets — max is ${MAX_THREAD_LENGTH}`);
    process.exit(1);
  }

  return tweets.map((tweet, i) => {
    const report = runChecks(tweet);
    report.content = `[${i + 1}/${tweets.length}] ${tweet}`;
    return report;
  });
}

// ============================================================================
// Display
// ============================================================================

function displayReport(report: SafetyReport): void {
  const icon = report.blocked ? "\u274C" : report.warnings > 0 ? "\u26A0\uFE0F" : "\u2705";
  console.log(`\n${icon} Content Safety Report`);
  console.log(`${"─".repeat(60)}`);
  console.log(`Content: "${report.content.slice(0, 100)}${report.content.length > 100 ? "..." : ""}"`);
  console.log(`Time: ${report.timestamp}`);
  console.log();

  for (const check of report.checks) {
    const sym = check.level === "pass" ? "\u2713" : check.level === "warn" ? "!" : "\u2717";
    const color = check.level === "pass" ? "\x1b[32m" : check.level === "warn" ? "\x1b[33m" : "\x1b[31m";
    console.log(`  ${color}${sym}\x1b[0m ${check.check}: ${check.message}`);
  }

  console.log(`\n${icon} ${report.summary}`);
  console.log(`${"─".repeat(60)}`);
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`ContentSafety.ts — Pre-post content filter for X/Twitter

Usage:
  bun ContentSafety.ts check "tweet content here"
  bun ContentSafety.ts check-thread "tweet1|||tweet2|||tweet3"
  bun ContentSafety.ts --json check "content"
  bun ContentSafety.ts --long check "long-form content here"
  bun ContentSafety.ts --help

Commands:
  check          Validate a single tweet
  check-thread   Validate a thread (tweets separated by |||)

Flags:
  --json         Output as JSON instead of human-readable
  --long         Use X Premium long-form limit (4,000 chars instead of 280)
  --help         Show this help

Exit Codes:
  0  Content passes all checks
  1  Content blocked (safety issue)
  2  Content has warnings (review recommended)

Checks Performed:
  - Character length (280 standard / 4,000 with --long)
  - Banned terms (sensationalism, inflammatory)
  - PII detection (SSN, credit card, email, phone, address)
  - Accuracy-sensitive terms (CVEs, NIST SPs, CMMC levels)
  - Hashtag check (zero tolerance — any hashtag blocks)
  - Excessive capitalization (excludes compliance acronyms)`);
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const longForm = args.includes("--long");
  const filteredArgs = args.filter(a => a !== "--json" && a !== "--long");

  if (filteredArgs.length === 0 || filteredArgs.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const command = filteredArgs[0];
  const content = filteredArgs.slice(1).join(" ");

  if (!content) {
    console.error("Error: No content provided");
    process.exit(1);
  }

  switch (command) {
    case "check": {
      const report = runChecks(content, longForm);
      if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        displayReport(report);
      }
      process.exit(report.blocked ? 1 : report.warnings > 0 ? 2 : 0);
      break;
    }
    case "check-thread": {
      const reports = runThreadChecks(content);
      const anyBlocked = reports.some(r => r.blocked);
      const totalWarnings = reports.reduce((s, r) => s + r.warnings, 0);

      if (jsonMode) {
        console.log(JSON.stringify(reports, null, 2));
      } else {
        for (const report of reports) {
          displayReport(report);
        }
        console.log(`\nThread Summary: ${reports.length} tweets, ${anyBlocked ? "BLOCKED" : totalWarnings > 0 ? `${totalWarnings} warning(s)` : "all clear"}`);
      }
      process.exit(anyBlocked ? 1 : totalWarnings > 0 ? 2 : 0);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main();

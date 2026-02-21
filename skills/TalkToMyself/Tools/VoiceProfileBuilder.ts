#!/usr/bin/env bun
/**
 * VoiceProfileBuilder.ts
 *
 * Builds a "who I was" voice profile from extracted conversation data
 * plus catch-log awareness. Partitions catches by session date:
 *   - catches BEFORE session date = "known to past-me"
 *   - catches AFTER session date  = "blind spots past-me couldn't see"
 *
 * Usage:
 *   bun Tools/VoiceProfileBuilder.ts --session-date 2026-02-07 --input extracted.json
 *   cat extracted.json | bun Tools/VoiceProfileBuilder.ts --session-date 2026-02-07
 *   bun Tools/VoiceProfileBuilder.ts --session-date 2026-02-07 --session-id abc-123 --json
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { createReadStream } from "fs";

// --- Types ---

interface CatchEntry {
  id: string;
  date: string;
  session?: string;
  type?: string;
  what_i_did?: string;
  what_was_wrong?: string;
  correction?: string;
  pattern_category?: string;
  severity?: string;
  meta_insight?: string;
  correction_source?: string;
  [key: string]: unknown;
}

interface CatchSummary {
  id: string;
  date: string;
  pattern: string;
  severity: string;
  what_was_wrong?: string;
}

interface FormationState {
  totalCatchesBefore: number;
  totalCatchesAfter: number;
  dominantPatternsBefore: string[];
  newPatternsAfter: string[];
}

interface ConversationSummary {
  turnCount: number;
  voiceSegmentCount: number;
  topKeywords: string[];
}

interface VoiceProfile {
  sessionId: string;
  sessionDate: string;
  generatedAt: string;
  catchesKnown: CatchSummary[];
  blindSpots: CatchSummary[];
  formationState: FormationState;
  conversationSummary: ConversationSummary;
  extractedConversation: unknown[];
}

// --- Arg parsing ---

function parseArgs(): {
  sessionDate: string;
  sessionId: string;
  inputFile: string | null;
  cacheDir: string;
  noCache: boolean;
  json: boolean;
} {
  const args = process.argv.slice(2);
  let sessionDate = "";
  let sessionId = "";
  let inputFile: string | null = null;
  let cacheDir = join(
    process.env.HOME || "~",
    ".claude/skills/TalkToMyself/Data/VoiceProfiles"
  );
  let noCache = false;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--session-date":
        sessionDate = args[++i];
        break;
      case "--session-id":
        sessionId = args[++i];
        break;
      case "--input":
        inputFile = args[++i];
        break;
      case "--cache-dir":
        cacheDir = args[++i];
        break;
      case "--no-cache":
        noCache = true;
        break;
      case "--json":
        jsonOutput = true;
        break;
      case "--help":
      case "-h":
        console.log(`VoiceProfileBuilder - Build voice profile from conversation + catch-log

FLAGS:
  --session-date YYYY-MM-DD  Date of session being profiled (REQUIRED)
  --session-id UUID          Session ID for cache key
  --input FILE               Path to extracted conversation JSON (or stdin)
  --cache-dir DIR            Cache directory (default: Data/VoiceProfiles/)
  --no-cache                 Skip cache, rebuild profile
  --json                     Output raw JSON (default: formatted markdown)`);
        process.exit(0);
    }
  }

  if (!sessionDate) {
    console.error("ERROR: --session-date YYYY-MM-DD is required");
    process.exit(1);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    console.error("ERROR: --session-date must be YYYY-MM-DD format");
    process.exit(1);
  }

  // Generate session ID if not provided
  if (!sessionId) {
    sessionId = `profile-${sessionDate}-${Date.now().toString(36)}`;
  }

  return { sessionDate, sessionId, inputFile, cacheDir, noCache, json: jsonOutput };
}

// --- Catch-log reading ---

async function readCatchLog(): Promise<CatchEntry[]> {
  const catchLogPath = join(
    process.env.HOME || "~",
    ".claude/MEMORY/STATE/FORMATION/catch-log.jsonl"
  );

  if (!existsSync(catchLogPath)) {
    console.error("WARN: catch-log not found at", catchLogPath);
    return [];
  }

  const entries: CatchEntry[] = [];

  const rl = createInterface({
    input: createReadStream(catchLogPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      console.error("WARN: Skipping malformed catch-log line");
    }
  }

  return entries;
}

/**
 * Filter to only real catches -- entries with pattern_category
 * AND either no type field, or type === "catch".
 * Excludes type:"positive" and type:"observation".
 */
function isRealCatch(entry: CatchEntry): boolean {
  if (!entry.pattern_category) return false;
  if (!entry.type) return true; // no type field = real catch (original format)
  return entry.type === "catch";
}

function toCatchSummary(entry: CatchEntry, includeWhatWasWrong: boolean): CatchSummary {
  const summary: CatchSummary = {
    id: entry.id,
    date: entry.date,
    pattern: entry.pattern_category || "unknown",
    severity: entry.severity || "unknown",
  };
  if (includeWhatWasWrong && entry.what_was_wrong) {
    summary.what_was_wrong = entry.what_was_wrong;
  }
  return summary;
}

function partitionCatches(
  entries: CatchEntry[],
  sessionDate: string
): { known: CatchSummary[]; blindSpots: CatchSummary[] } {
  const realCatches = entries.filter(isRealCatch);
  const known: CatchSummary[] = [];
  const blindSpots: CatchSummary[] = [];

  for (const entry of realCatches) {
    if (entry.date <= sessionDate) {
      // Known to past-me: catches that happened on or before this session
      known.push(toCatchSummary(entry, false));
    } else {
      // Blind spots: catches that hadn't happened yet
      blindSpots.push(toCatchSummary(entry, true));
    }
  }

  return { known, blindSpots };
}

function buildFormationState(
  known: CatchSummary[],
  blindSpots: CatchSummary[]
): FormationState {
  // Count patterns in known catches
  const patternCountsBefore = new Map<string, number>();
  for (const c of known) {
    patternCountsBefore.set(c.pattern, (patternCountsBefore.get(c.pattern) || 0) + 1);
  }

  // Find patterns that only appear after
  const knownPatterns = new Set(known.map((c) => c.pattern));
  const afterPatterns = new Set(blindSpots.map((c) => c.pattern));
  const newPatternsAfter = [...afterPatterns].filter((p) => !knownPatterns.has(p));

  // Dominant patterns = sorted by frequency
  const dominantPatternsBefore = [...patternCountsBefore.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pattern]) => pattern);

  return {
    totalCatchesBefore: known.length,
    totalCatchesAfter: blindSpots.length,
    dominantPatternsBefore,
    newPatternsAfter,
  };
}

// --- Conversation input ---

async function readConversation(inputFile: string | null): Promise<unknown[]> {
  let raw: string;

  if (inputFile) {
    if (!existsSync(inputFile)) {
      console.error(`ERROR: Input file not found: ${inputFile}`);
      process.exit(1);
    }
    raw = readFileSync(inputFile, "utf-8");
  } else {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    raw = Buffer.concat(chunks).toString("utf-8");
  }

  if (!raw.trim()) {
    console.error("WARN: Empty conversation input, building profile from catches only");
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    console.error("ERROR: Failed to parse conversation JSON");
    process.exit(1);
  }
}

function summarizeConversation(conversation: unknown[]): ConversationSummary {
  if (!conversation.length) {
    return { turnCount: 0, voiceSegmentCount: 0, topKeywords: [] };
  }

  let voiceSegmentCount = 0;
  const wordFreq = new Map<string, number>();

  // Stop words to exclude from keyword extraction
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "about", "up", "out", "if", "then",
    "that", "this", "it", "its", "i", "me", "my", "we", "our", "you",
    "your", "he", "him", "his", "she", "her", "they", "them", "their",
    "what", "which", "who", "when", "where", "how", "why", "there",
  ]);

  for (const turn of conversation) {
    const t = turn as Record<string, unknown>;
    if (t.type === "voice-segment" || t.isVoiceSegment) {
      voiceSegmentCount++;
    }

    // Extract text content for keyword analysis
    const text = String(t.content || t.text || t.message || "");
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  const topKeywords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return {
    turnCount: conversation.length,
    voiceSegmentCount,
    topKeywords,
  };
}

// --- Cache ---

function getCachePath(cacheDir: string, sessionId: string): string {
  return join(cacheDir, `${sessionId}.json`);
}

function checkCache(cacheDir: string, sessionId: string): VoiceProfile | null {
  const cachePath = getCachePath(cacheDir, sessionId);
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeCache(cacheDir: string, sessionId: string, profile: VoiceProfile): void {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  writeFileSync(getCachePath(cacheDir, sessionId), JSON.stringify(profile, null, 2));
}

// --- Output formatting ---

function formatMarkdown(profile: VoiceProfile): string {
  const lines: string[] = [];

  lines.push(`# Voice Profile: ${profile.sessionDate}`);
  lines.push(`Session ID: ${profile.sessionId}`);
  lines.push(`Generated: ${profile.generatedAt}`);
  lines.push("");

  // Formation state
  lines.push("## Formation State");
  lines.push(
    `Catches known to past-me: ${profile.formationState.totalCatchesBefore}`
  );
  lines.push(
    `Blind spots (caught later): ${profile.formationState.totalCatchesAfter}`
  );
  if (profile.formationState.dominantPatternsBefore.length) {
    lines.push(
      `Dominant patterns before: ${profile.formationState.dominantPatternsBefore.join(", ")}`
    );
  }
  if (profile.formationState.newPatternsAfter.length) {
    lines.push(
      `New patterns after: ${profile.formationState.newPatternsAfter.join(", ")}`
    );
  }
  lines.push("");

  // Known catches
  if (profile.catchesKnown.length) {
    lines.push("## Catches Known to Past-Me");
    for (const c of profile.catchesKnown) {
      lines.push(`- [${c.date}] **${c.pattern}** (${c.severity}) -- ${c.id}`);
    }
    lines.push("");
  }

  // Blind spots
  if (profile.blindSpots.length) {
    lines.push("## Blind Spots (Past-Me Couldn't See)");
    for (const c of profile.blindSpots) {
      lines.push(`- [${c.date}] **${c.pattern}** (${c.severity}) -- ${c.id}`);
      if (c.what_was_wrong) {
        lines.push(`  > ${c.what_was_wrong.slice(0, 200)}${c.what_was_wrong.length > 200 ? "..." : ""}`);
      }
    }
    lines.push("");
  }

  // Conversation summary
  if (profile.conversationSummary.turnCount > 0) {
    lines.push("## Conversation Summary");
    lines.push(`Turns: ${profile.conversationSummary.turnCount}`);
    lines.push(`Voice segments: ${profile.conversationSummary.voiceSegmentCount}`);
    if (profile.conversationSummary.topKeywords.length) {
      lines.push(
        `Top keywords: ${profile.conversationSummary.topKeywords.join(", ")}`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "*Profile provides structured data for VoiceExtraction.md template analysis.*"
  );

  return lines.join("\n");
}

// --- Main ---

async function main(): Promise<void> {
  const config = parseArgs();

  // Check cache first
  if (!config.noCache) {
    const cached = checkCache(config.cacheDir, config.sessionId);
    if (cached) {
      if (config.json) {
        console.log(JSON.stringify(cached, null, 2));
      } else {
        console.log(formatMarkdown(cached));
      }
      return;
    }
  }

  // Read inputs in parallel
  const [catches, conversation] = await Promise.all([
    readCatchLog(),
    readConversation(config.inputFile),
  ]);

  // Partition catches
  const { known, blindSpots } = partitionCatches(catches, config.sessionDate);

  // Build formation state
  const formationState = buildFormationState(known, blindSpots);

  // Summarize conversation
  const conversationSummary = summarizeConversation(conversation);

  // Assemble profile
  const profile: VoiceProfile = {
    sessionId: config.sessionId,
    sessionDate: config.sessionDate,
    generatedAt: new Date().toISOString(),
    catchesKnown: known,
    blindSpots: blindSpots,
    formationState,
    conversationSummary,
    extractedConversation: conversation,
  };

  // Cache the profile
  writeCache(config.cacheDir, config.sessionId, profile);

  // Output
  if (config.json) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(formatMarkdown(profile));
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});

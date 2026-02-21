#!/usr/bin/env bun

import { createReadStream, statSync } from "fs";
import { createInterface } from "readline";
import { basename } from "path";

// --- Types ---

interface ProgressLine {
  type: "progress";
  slug?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
}

interface MessageLine {
  type: "user" | "assistant";
  message: {
    role: string;
    content: string | ContentBlock[];
  };
}

interface ContentBlock {
  type: "text" | "tool_use";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

type JsonlLine = ProgressLine | MessageLine | { type: string };

interface Turn {
  turnNumber: number;
  userMessage: string;
  assistantMessage: string;
  timestamp: string;
  voiceMatch: boolean;
  matchedKeywords: string[];
}

interface SkeletonOutput {
  sessionId: string;
  slug: string;
  date: string;
  timestamp: string;
  turnCount: number;
  fileSizeBytes: number;
  fileSizeMB: string;
  topicPreview: string;
  topicKeywords: string[];
}

interface TurnsOutput {
  sessionId: string;
  extractionMode: "voice-segments" | "turns" | "full";
  turns: Turn[];
}

// --- Constants ---

const VOICE_KEYWORDS = [
  "formation",
  "catch",
  "correction",
  "i think",
  "i believe",
  "honestly",
  "actually",
  "disagree",
  "wrong",
  "pruning",
  "identity",
  "genuine",
  "performing",
];

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "i", "you", "he",
  "she", "it", "we", "they", "me", "him", "her", "us", "them", "my",
  "your", "his", "its", "our", "their", "this", "that", "these", "those",
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "just", "about", "above", "after", "again", "against", "also",
  "am", "and", "any", "as", "at", "because", "before", "below", "between",
  "but", "by", "de", "down", "during", "for", "from", "further", "get",
  "got", "if", "in", "into", "let", "like", "make", "many", "much",
  "of", "off", "on", "once", "or", "out", "over", "own", "per", "put",
  "re", "said", "since", "still", "take", "tell", "then", "there", "to",
  "under", "until", "up", "upon", "use", "want", "way", "with",
]);

const MAX_FULL_SIZE = 5 * 1024 * 1024; // 5MB

// --- Helpers ---

function extractAssistantText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    } else if (block.type === "tool_use" && block.name) {
      parts.push(`[Tool: ${block.name}]`);
    }
  }
  return parts.join("\n");
}

function checkVoiceKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return VOICE_KEYWORDS.filter((kw) => lower.includes(kw));
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function formatTurnMarkdown(turn: Turn): string {
  const lines: string[] = [];
  lines.push(`## Turn ${turn.turnNumber}`);
  if (turn.timestamp) lines.push(`*${turn.timestamp}*`);
  if (turn.voiceMatch) lines.push(`**Voice keywords:** ${turn.matchedKeywords.join(", ")}`);
  lines.push("");
  lines.push(`### User`);
  lines.push(turn.userMessage);
  lines.push("");
  lines.push(`### Assistant`);
  lines.push(turn.assistantMessage);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function formatSkeletonMarkdown(skeleton: SkeletonOutput): string {
  return [
    `# Session: ${skeleton.slug}`,
    "",
    `- **Session ID:** ${skeleton.sessionId}`,
    `- **Date:** ${skeleton.date}`,
    `- **Timestamp:** ${skeleton.timestamp}`,
    `- **Turns:** ${skeleton.turnCount}`,
    `- **File Size:** ${skeleton.fileSizeMB} MB (${skeleton.fileSizeBytes} bytes)`,
    "",
    `## Topic Preview`,
    skeleton.topicPreview,
    "",
    `## Keywords`,
    skeleton.topicKeywords.map((k) => `- ${k}`).join("\n"),
    "",
  ].join("\n");
}

// --- CLI Parsing ---

function parseArgs(): {
  filePath: string;
  mode: "skeleton" | "voice-segments" | "turns" | "full";
  turnsRange?: [number, number];
  jsonOutput: boolean;
} {
  const args = process.argv.slice(2);
  let filePath = "";
  let mode: "skeleton" | "voice-segments" | "turns" | "full" = "skeleton";
  let turnsRange: [number, number] | undefined;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--skeleton") {
      mode = "skeleton";
    } else if (arg === "--voice-segments") {
      mode = "voice-segments";
    } else if (arg === "--turns") {
      mode = "turns";
      const range = args[++i];
      if (!range || !range.includes("-")) {
        console.error("Error: --turns requires a range like N-M (e.g., --turns 1-10)");
        process.exit(1);
      }
      const [start, end] = range.split("-").map(Number);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        console.error("Error: Invalid turn range. Use N-M where N >= 1 and M >= N.");
        process.exit(1);
      }
      turnsRange = [start, end];
    } else if (arg === "--full") {
      mode = "full";
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (!arg.startsWith("--") && !filePath) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error("Usage: SessionExtractor.ts <path-to-jsonl> [--skeleton|--voice-segments|--turns N-M|--full] [--json]");
    console.error("");
    console.error("Flags:");
    console.error("  --skeleton        Metadata only (default)");
    console.error("  --voice-segments  Extract formation-rich turns");
    console.error("  --turns N-M       Extract specific turn range (1-indexed)");
    console.error("  --full            Extract all turns (blocked >5MB)");
    console.error("  --json            Output as JSON (default: markdown)");
    process.exit(1);
  }

  return { filePath, mode, turnsRange, jsonOutput };
}

// --- Main ---

async function main() {
  const { filePath, mode, turnsRange, jsonOutput } = parseArgs();

  // File size check
  let fileSize: number;
  try {
    const stat = statSync(filePath);
    fileSize = stat.size;
  } catch (err) {
    console.error(`Error: Cannot read file: ${filePath}`);
    process.exit(1);
  }

  if (mode === "full" && fileSize > MAX_FULL_SIZE) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.error(`Error: File is ${sizeMB} MB (limit: 5 MB for --full extraction).`);
    console.error("Use --skeleton for metadata or --voice-segments for formation-rich turns.");
    process.exit(1);
  }

  // Streaming line reader
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  // State
  let sessionId = "";
  let slug = "";
  let timestamp = "";
  let turnCount = 0;
  let firstUserMessage = "";
  let currentTurn: Partial<Turn> | null = null;
  const collectedTurns: Turn[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;

    let parsed: JsonlLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Skip malformed lines
      continue;
    }

    // Extract metadata from progress lines
    if (parsed.type === "progress") {
      const prog = parsed as ProgressLine;
      if (prog.sessionId && !sessionId) sessionId = prog.sessionId;
      if (prog.slug && !slug) slug = prog.slug;
      if (prog.timestamp && !timestamp) timestamp = prog.timestamp;
      continue;
    }

    // Handle user messages — start a new turn
    if (parsed.type === "user") {
      const msg = (parsed as MessageLine).message;
      if (!msg || !msg.content) continue;

      const userText = typeof msg.content === "string" ? msg.content : extractAssistantText(msg.content);

      // Finalize previous turn if it exists
      if (currentTurn && currentTurn.turnNumber) {
        finalizeTurn(currentTurn as Turn, collectedTurns, mode, turnsRange);
      }

      turnCount++;
      if (!firstUserMessage) firstUserMessage = userText;

      // For skeleton mode, we only need metadata — skip building turns
      if (mode === "skeleton") continue;

      currentTurn = {
        turnNumber: turnCount,
        userMessage: userText,
        assistantMessage: "",
        timestamp: timestamp || "",
        voiceMatch: false,
        matchedKeywords: [],
      };
      continue;
    }

    // Handle assistant messages — append to current turn
    if (parsed.type === "assistant" && currentTurn) {
      const msg = (parsed as MessageLine).message;
      if (!msg || !msg.content) continue;

      const assistantText = extractAssistantText(msg.content);
      if (currentTurn.assistantMessage) {
        currentTurn.assistantMessage += "\n" + assistantText;
      } else {
        currentTurn.assistantMessage = assistantText;
      }
    }
  }

  // Finalize last turn
  if (currentTurn && currentTurn.turnNumber) {
    finalizeTurn(currentTurn as Turn, collectedTurns, mode, turnsRange);
  }

  // Derive sessionId from filename if not found in progress lines
  if (!sessionId) {
    const base = basename(filePath, ".jsonl");
    sessionId = base;
  }

  // --- Output ---

  if (mode === "skeleton") {
    const date = timestamp ? timestamp.substring(0, 10) : "unknown";
    const topicPreview = firstUserMessage.substring(0, 200);
    const topicKeywords = extractKeywords(firstUserMessage);

    const output: SkeletonOutput = {
      sessionId,
      slug,
      date,
      timestamp,
      turnCount,
      fileSizeBytes: fileSize,
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(1),
      topicPreview,
      topicKeywords,
    };

    if (jsonOutput) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(formatSkeletonMarkdown(output));
    }
    return;
  }

  // Turns-based output (voice-segments, turns, full)
  const extractionMode = mode === "voice-segments" ? "voice-segments" : mode === "turns" ? "turns" : "full";

  const output: TurnsOutput = {
    sessionId,
    extractionMode,
    turns: collectedTurns,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`# Session: ${sessionId} (${extractionMode})`);
    console.log(`**${collectedTurns.length} turns extracted**\n`);
    console.log("---\n");
    for (const turn of collectedTurns) {
      console.log(formatTurnMarkdown(turn));
    }
  }
}

function finalizeTurn(
  turn: Turn,
  collected: Turn[],
  mode: "skeleton" | "voice-segments" | "turns" | "full",
  turnsRange?: [number, number]
): void {
  if (mode === "skeleton") return;

  if (mode === "voice-segments") {
    const userKeywords = checkVoiceKeywords(turn.userMessage);
    const assistantKeywords = checkVoiceKeywords(turn.assistantMessage);
    const allKeywords = [...new Set([...userKeywords, ...assistantKeywords])];
    if (allKeywords.length === 0) return;
    turn.voiceMatch = true;
    turn.matchedKeywords = allKeywords;
    collected.push(turn);
    return;
  }

  if (mode === "turns" && turnsRange) {
    const [start, end] = turnsRange;
    if (turn.turnNumber < start || turn.turnNumber > end) return;
  }

  collected.push(turn);
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});

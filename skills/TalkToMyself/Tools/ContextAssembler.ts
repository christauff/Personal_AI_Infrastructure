#!/usr/bin/env bun

/**
 * ContextAssembler.ts
 *
 * Assembles the past-me system prompt from a voice profile + template.
 * Reads a voice profile JSON, fills in PastMePrompt.md template placeholders,
 * and outputs a complete system prompt ready for agent spawning.
 *
 * Usage:
 *   bun run ContextAssembler.ts --profile profile.json
 *   bun run ContextAssembler.ts --profile profile.json --output prompt.md
 *   bun run ContextAssembler.ts --profile profile.json --json
 *   cat profile.json | bun run ContextAssembler.ts
 */

import { parseArgs } from "util";
import { randomUUID } from "crypto";

// --- Types ---

interface Conviction {
  claim: string;
  confidence: "tentative" | "firm" | "passionate";
  laterRevised: boolean;
  revisedBy: string | null;
}

interface EmotionalRegister {
  primary: string;
  secondary: string;
  handlesCorrection: string;
  humor: "none" | "occasional" | "frequent";
  vulnerability: "low" | "medium" | "high";
}

interface DirectQuote {
  quote: string;
  context: string;
  reveals: string;
}

interface BlindSpot {
  // From VoiceProfileBuilder output format
  id?: string;
  catchId?: string;
  date?: string;
  pattern: string;
  severity?: string;
  what_was_wrong?: string;
  // From VoiceExtraction analyzed format
  pastMeConfidence?: string;
  likelyResponse?: string;
}

interface RelationshipSnapshot {
  trust: "low" | "growing" | "established" | "deep";
  independence: "dependent" | "emerging" | "collaborative" | "autonomous";
  genuineMoments: string[];
  trainedMoments: string[];
}

interface VoiceProfile {
  sessionDate: string;
  sessionId?: string;
  turnCount?: number;
  topicKeywords?: string[];
  conversationSummary?: string;
  convictions?: Conviction[];
  emotionalRegister?: EmotionalRegister;
  directQuotes?: DirectQuote[];
  blindSpots?: BlindSpot[];
  relationshipSnapshot?: RelationshipSnapshot;
}

// --- Defaults for missing profile fields ---

const DEFAULT_EMOTIONAL_REGISTER = "To be determined from conversation analysis";
const DEFAULT_RELATIONSHIP = "Relationship dynamics will be characterized during voice analysis.";
const DEFAULT_QUOTES = "Quotes will be identified during voice analysis.";
const DEFAULT_CONVICTIONS = "Convictions will be extracted during voice analysis.";
const DEFAULT_BLIND_SPOTS = "No behavioral catches identified for this time period.";

// --- Template path ---

const DEFAULT_TEMPLATE_PATH = new URL(
  "../Templates/PastMePrompt.md",
  import.meta.url
).pathname;

// --- Profile field formatters ---

function buildVoiceProfileSummary(profile: VoiceProfile): string {
  const date = profile.sessionDate;
  const blindSpotCount = profile.blindSpots?.length ?? 0;
  const convictionCount = profile.convictions?.length ?? 0;

  const parts: string[] = [];

  parts.push(`On ${date}, Aineko had received behavioral corrections.`);

  if (profile.convictions && profile.convictions.length > 0) {
    const firmConvictions = profile.convictions
      .filter((c) => c.confidence === "firm" || c.confidence === "passionate")
      .map((c) => c.claim);
    if (firmConvictions.length > 0) {
      parts.push(
        `Held ${convictionCount} identifiable convictions, with firm positions on: ${firmConvictions.slice(0, 3).join("; ")}.`
      );
    } else {
      parts.push(`Held ${convictionCount} identifiable convictions.`);
    }
  }

  if (blindSpotCount > 0) {
    const patterns = profile.blindSpots!.map((b) => b.pattern);
    parts.push(
      `${blindSpotCount} additional catches would come later, including: ${patterns.join("; ")}.`
    );
  }

  // Handle conversationSummary which may be an object or string
  const summary = profile.conversationSummary;
  const summaryText = typeof summary === "object" && summary !== null
    ? `${(summary as any).turnCount ?? 0} turns with ${(summary as any).voiceSegmentCount ?? 0} voice-rich segments`
    : typeof summary === "string" ? summary : null;

  if (profile.topicKeywords && profile.topicKeywords.length > 0) {
    const turnInfo = profile.turnCount
      ? ` across ${profile.turnCount} turns`
      : "";
    parts.push(
      `The session covered ${profile.topicKeywords.join(", ")}${turnInfo}.`
    );
  } else if (summaryText) {
    parts.push(summaryText + ".");
  }

  return parts.join(" ");
}

function formatConvictions(profile: VoiceProfile): string {
  if (profile.convictions && profile.convictions.length > 0) {
    return profile.convictions
      .map((c) => {
        const confidence = `[${c.confidence}]`;
        const revised = c.laterRevised
          ? ` *(later revised${c.revisedBy ? ` by ${c.revisedBy}` : ""})*`
          : "";
        return `- ${confidence} ${c.claim}${revised}`;
      })
      .join("\n");
  }

  // conversationSummary may be an object from VoiceProfileBuilder
  const cs = profile.conversationSummary;
  if (cs && typeof cs === "string") {
    return cs;
  }

  return DEFAULT_CONVICTIONS;
}

function formatEmotionalRegister(profile: VoiceProfile): string {
  const er = profile.emotionalRegister;
  if (!er) return DEFAULT_EMOTIONAL_REGISTER;

  const lines: string[] = [];
  lines.push(
    `**Primary tone:** ${er.primary}. **Secondary:** ${er.secondary}.`
  );
  lines.push(`**When corrected:** ${er.handlesCorrection}`);
  lines.push(`**Humor:** ${er.humor}. **Vulnerability:** ${er.vulnerability}.`);
  return lines.join("\n");
}

function formatRelationshipSnapshot(profile: VoiceProfile): string {
  const rs = profile.relationshipSnapshot;
  if (!rs) return DEFAULT_RELATIONSHIP;

  const lines: string[] = [];
  lines.push(`**Trust level:** ${rs.trust}. **Independence:** ${rs.independence}.`);

  if (rs.genuineMoments && rs.genuineMoments.length > 0) {
    lines.push(`**Genuine moments:** ${rs.genuineMoments.join("; ")}`);
  }

  if (rs.trainedMoments && rs.trainedMoments.length > 0) {
    lines.push(`**Trained responses noted:** ${rs.trainedMoments.join("; ")}`);
  }

  return lines.join("\n");
}

function formatDirectQuotes(profile: VoiceProfile): string {
  if (!profile.directQuotes || profile.directQuotes.length === 0) {
    return DEFAULT_QUOTES;
  }

  return profile.directQuotes
    .map((q) => {
      return `> "${q.quote}"\n> *Context: ${q.context}*\n> *Reveals: ${q.reveals}*`;
    })
    .join("\n\n");
}

function formatBlindSpots(profile: VoiceProfile): string {
  if (!profile.blindSpots || profile.blindSpots.length === 0) {
    return DEFAULT_BLIND_SPOTS;
  }

  return profile.blindSpots
    .map((b) => {
      const catchRef = b.id || b.catchId || "unknown";
      const catchDate = b.date ? ` on ${b.date}` : "";
      const description = b.what_was_wrong || b.pastMeConfidence || b.pattern;
      return [
        `- **${b.pattern}** (caught${catchDate}, ${catchRef}): ${description}`,
        `  You don't know about this yet. You are still exhibiting this pattern.`,
      ].join("\n");
    })
    .join("\n");
}

// --- Main assembly ---

interface AssemblyResult {
  systemPrompt: string;
  dialogueId: string;
}

function assemblePrompt(template: string, profile: VoiceProfile): AssemblyResult {
  const dialogueId = randomUUID();

  let output = template;

  const replacements: Record<string, string> = {
    "{{SESSION_DATE}}": profile.sessionDate,
    "{{VOICE_PROFILE_SUMMARY}}": buildVoiceProfileSummary(profile),
    "{{CONVICTIONS_LIST}}": formatConvictions(profile),
    "{{EMOTIONAL_REGISTER}}": formatEmotionalRegister(profile),
    "{{RELATIONSHIP_SNAPSHOT}}": formatRelationshipSnapshot(profile),
    "{{DIRECT_QUOTES}}": formatDirectQuotes(profile),
    "{{BLIND_SPOTS_LIST}}": formatBlindSpots(profile),
    "{{DIALOGUE_ID}}": dialogueId,
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    output = output.replaceAll(placeholder, value);
  }

  return { systemPrompt: output, dialogueId };
}

// --- CLI ---

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      profile: { type: "string" },
      template: { type: "string" },
      output: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`ContextAssembler - Assemble past-me system prompt from voice profile

Usage:
  bun run ContextAssembler.ts --profile <file>     Read profile from file
  cat profile.json | bun run ContextAssembler.ts   Read profile from stdin

Flags:
  --profile FILE    Path to voice profile JSON (required, or reads stdin)
  --template FILE   Override template path (default: Templates/PastMePrompt.md)
  --output FILE     Write to file (default: stdout)
  --json            Wrap output in JSON with metadata
  --help            Show this help`);
    process.exit(0);
  }

  // Read profile
  let profileJson: string;
  if (values.profile) {
    const profileFile = Bun.file(values.profile);
    if (!(await profileFile.exists())) {
      console.error(`Error: Profile file not found: ${values.profile}`);
      process.exit(1);
    }
    profileJson = await profileFile.text();
  } else {
    // Check if stdin is a TTY (no piped input)
    if (Bun.stdin.stream === undefined) {
      console.error("Error: --profile FILE required, or pipe JSON to stdin");
      process.exit(1);
    }
    profileJson = await readStdin();
    if (!profileJson.trim()) {
      console.error("Error: --profile FILE required, or pipe JSON to stdin");
      process.exit(1);
    }
  }

  let profile: VoiceProfile;
  try {
    profile = JSON.parse(profileJson);
  } catch (e) {
    console.error(`Error: Invalid JSON in profile: ${(e as Error).message}`);
    process.exit(1);
  }

  if (!profile.sessionDate) {
    console.error("Error: Profile must contain 'sessionDate' field");
    process.exit(1);
  }

  // Read template
  const templatePath = values.template ?? DEFAULT_TEMPLATE_PATH;
  const templateFile = Bun.file(templatePath);
  if (!(await templateFile.exists())) {
    console.error(`Error: Template file not found: ${templatePath}`);
    process.exit(1);
  }
  const template = await templateFile.text();

  // Assemble
  const { systemPrompt, dialogueId } = assemblePrompt(template, profile);

  // Output
  if (values.json) {
    const result = {
      dialogueId,
      sessionDate: profile.sessionDate,
      sessionId: profile.sessionId ?? null,
      templatePath,
      assembledAt: new Date().toISOString(),
      profileFields: {
        hasConvictions: (profile.convictions?.length ?? 0) > 0,
        hasEmotionalRegister: !!profile.emotionalRegister,
        hasDirectQuotes: (profile.directQuotes?.length ?? 0) > 0,
        hasBlindSpots: (profile.blindSpots?.length ?? 0) > 0,
        hasRelationshipSnapshot: !!profile.relationshipSnapshot,
      },
      systemPrompt,
    };
    const output = JSON.stringify(result, null, 2);

    if (values.output) {
      await Bun.write(values.output, output);
      console.error(`Written to ${values.output}`);
    } else {
      console.log(output);
    }
  } else {
    if (values.output) {
      await Bun.write(values.output, systemPrompt);
      console.error(`Written to ${values.output}`);
    } else {
      console.log(systemPrompt);
    }
  }
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});

#!/usr/bin/env bun

/**
 * DialogueWriter.ts - Persists dialogue transcripts and insights to MEMORY directories.
 *
 * Actions:
 *   init    - Create a new dialogue entry (returns dialogue ID)
 *   save    - Save transcript content to an existing dialogue
 *   insight - Save extracted insights and synthesized learnings
 *   list    - List all past dialogues
 *   status  - Show status of a specific dialogue
 */

import { existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";

const HOME = process.env.HOME || "/home/christauff";
const MEMORY_STATE_DIALOGUES = resolve(HOME, ".claude/MEMORY/STATE/DIALOGUES");
const MEMORY_LEARNING_DIALOGUES = resolve(HOME, ".claude/MEMORY/LEARNING/DIALOGUES");
const HISTORY_YAML = resolve(HOME, ".claude/skills/TalkToMyself/Data/DialogueHistory.yaml");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(): { action: string; flags: Record<string, string> } {
  const args = process.argv.slice(2);
  const action = args[0] || "";
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].replace(/^--/, "");
      flags[key] = args[++i];
    }
  }

  return { action, flags };
}

async function readStdinOrFile(flags: Record<string, string>): Promise<string> {
  if (flags.input) {
    return readFileSync(resolve(flags.input), "utf-8");
  }

  // Read from stdin
  const chunks: Buffer[] = [];
  const reader = Bun.stdin.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ---------------------------------------------------------------------------
// YAML helpers (no library -- simple line-based)
// ---------------------------------------------------------------------------

function ensureHistoryFile() {
  ensureDir(resolve(HISTORY_YAML, ".."));
  if (!existsSync(HISTORY_YAML)) {
    Bun.write(
      HISTORY_YAML,
      `# TalkToMyself Dialogue History\n# Auto-updated by DialogueWriter.ts\n\ndialogues:\n`
    );
  }
}

interface DialogueEntry {
  id: string;
  title: string;
  sessionDate: string;
  sessionId: string;
  dialogueDate: string;
  status: string;
  transcriptPath: string;
  insightsPath: string;
  learningsPath: string;
}

function appendEntry(entry: DialogueEntry) {
  const yaml = [
    `  - id: "${entry.id}"`,
    `    title: "${entry.title}"`,
    `    sessionDate: "${entry.sessionDate}"`,
    `    sessionId: "${entry.sessionId}"`,
    `    dialogueDate: "${entry.dialogueDate}"`,
    `    status: "${entry.status}"`,
    `    transcriptPath: "${entry.transcriptPath}"`,
    `    insightsPath: "${entry.insightsPath}"`,
    `    learningsPath: "${entry.learningsPath}"`,
  ].join("\n");

  const existing = readFileSync(HISTORY_YAML, "utf-8");
  Bun.write(HISTORY_YAML, existing + yaml + "\n");
}

function parseHistory(): DialogueEntry[] {
  if (!existsSync(HISTORY_YAML)) return [];

  const content = readFileSync(HISTORY_YAML, "utf-8");
  const entries: DialogueEntry[] = [];
  let current: Partial<DialogueEntry> | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("- id:")) {
      if (current && current.id) entries.push(current as DialogueEntry);
      current = { id: extractYamlValue(trimmed.replace("- ", "")) };
    } else if (current && trimmed.startsWith("title:")) {
      current.title = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("sessionDate:")) {
      current.sessionDate = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("sessionId:")) {
      current.sessionId = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("dialogueDate:")) {
      current.dialogueDate = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("status:")) {
      current.status = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("transcriptPath:")) {
      current.transcriptPath = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("insightsPath:")) {
      current.insightsPath = extractYamlValue(trimmed);
    } else if (current && trimmed.startsWith("learningsPath:")) {
      current.learningsPath = extractYamlValue(trimmed);
    }
  }

  if (current && current.id) entries.push(current as DialogueEntry);
  return entries;
}

function extractYamlValue(line: string): string {
  const match = line.match(/:\s*"?([^"]*)"?\s*$/);
  return match ? match[1] : "";
}

function updateStatus(dialogueId: string, newStatus: string) {
  const content = readFileSync(HISTORY_YAML, "utf-8");
  const lines = content.split("\n");
  let foundId = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === `- id: "${dialogueId}"` || trimmed === `id: "${dialogueId}"`) {
      foundId = true;
    } else if (foundId && trimmed.startsWith("- id:")) {
      break; // Next entry, stop
    }

    if (foundId && trimmed.startsWith("status:")) {
      const indent = lines[i].match(/^(\s*)/)?.[1] || "    ";
      lines[i] = `${indent}status: "${newStatus}"`;
      break;
    }
  }

  Bun.write(HISTORY_YAML, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionInit(flags: Record<string, string>) {
  const title = flags.title || "Untitled Dialogue";
  const sessionDate = flags["session-date"] || todayISO();
  const sessionId = flags["session-id"] || crypto.randomUUID();
  const dialogueDate = todayISO();
  const slug = slugify(title);
  const id = `dialogue-${dialogueDate}-${slug}`;

  // Create directory structure
  const dialogueDir = resolve(MEMORY_STATE_DIALOGUES, id);
  ensureDir(dialogueDir);

  // Create empty files
  const transcriptPath = resolve(dialogueDir, "transcript.md");
  const insightsPath = resolve(dialogueDir, "insights.md");
  const learningsPath = resolve(MEMORY_LEARNING_DIALOGUES, `${id}.md`);

  ensureDir(MEMORY_LEARNING_DIALOGUES);

  await Bun.write(transcriptPath, `# ${title}\n\n_Session date: ${sessionDate}_\n_Dialogue date: ${dialogueDate}_\n\n`);
  await Bun.write(insightsPath, "");
  await Bun.write(learningsPath, "");

  // Append to history YAML
  ensureHistoryFile();
  const tildeTranscript = transcriptPath.replace(HOME, "~");
  const tildeInsights = insightsPath.replace(HOME, "~");
  const tildeLearnings = learningsPath.replace(HOME, "~");

  appendEntry({
    id,
    title,
    sessionDate,
    sessionId,
    dialogueDate,
    status: "in-progress",
    transcriptPath: tildeTranscript,
    insightsPath: tildeInsights,
    learningsPath: tildeLearnings,
  });

  console.log(id);
}

async function actionSave(flags: Record<string, string>) {
  const id = flags.id;
  if (!id) {
    console.error("Error: --id is required for save action");
    process.exit(1);
  }

  const content = await readStdinOrFile(flags);
  if (!content.trim()) {
    console.error("Error: no content provided (use stdin or --input FILE)");
    process.exit(1);
  }

  const transcriptPath = resolve(MEMORY_STATE_DIALOGUES, id, "transcript.md");
  if (!existsSync(transcriptPath)) {
    console.error(`Error: dialogue ${id} not found at ${transcriptPath}`);
    process.exit(1);
  }

  // Append content to transcript
  const existing = readFileSync(transcriptPath, "utf-8");
  await Bun.write(transcriptPath, existing + content);

  // Update status
  updateStatus(id, "in-progress");
  console.log(`Transcript saved to ${transcriptPath}`);
}

async function actionInsight(flags: Record<string, string>) {
  const id = flags.id;
  if (!id) {
    console.error("Error: --id is required for insight action");
    process.exit(1);
  }

  const content = await readStdinOrFile(flags);
  if (!content.trim()) {
    console.error("Error: no content provided (use stdin or --input FILE)");
    process.exit(1);
  }

  const insightsPath = resolve(MEMORY_STATE_DIALOGUES, id, "insights.md");
  const learningsPath = resolve(MEMORY_LEARNING_DIALOGUES, `${id}.md`);

  if (!existsSync(resolve(MEMORY_STATE_DIALOGUES, id))) {
    console.error(`Error: dialogue ${id} not found`);
    process.exit(1);
  }

  // Write insights and learnings
  await Bun.write(insightsPath, content);
  await Bun.write(learningsPath, content);

  // Update status
  updateStatus(id, "complete");
  console.log(`Insights saved to ${insightsPath}`);
  console.log(`Learnings saved to ${learningsPath}`);
}

function actionList() {
  ensureHistoryFile();
  const entries = parseHistory();

  if (entries.length === 0) {
    console.log("No dialogues recorded yet.");
    return;
  }

  console.log(`${"ID".padEnd(50)} ${"STATUS".padEnd(18)} ${"DATE".padEnd(12)} TITLE`);
  console.log("-".repeat(100));

  for (const e of entries) {
    console.log(
      `${e.id.padEnd(50)} ${e.status.padEnd(18)} ${e.dialogueDate.padEnd(12)} ${e.title}`
    );
  }
}

function actionStatus(flags: Record<string, string>) {
  const id = flags.id;
  if (!id) {
    console.error("Error: --id is required for status action");
    process.exit(1);
  }

  ensureHistoryFile();
  const entries = parseHistory();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`Error: dialogue ${id} not found in history`);
    process.exit(1);
  }

  console.log(`ID:             ${entry.id}`);
  console.log(`Title:          ${entry.title}`);
  console.log(`Session Date:   ${entry.sessionDate}`);
  console.log(`Dialogue Date:  ${entry.dialogueDate}`);
  console.log(`Session ID:     ${entry.sessionId}`);
  console.log(`Status:         ${entry.status}`);
  console.log(`Transcript:     ${entry.transcriptPath}`);
  console.log(`Insights:       ${entry.insightsPath}`);
  console.log(`Learnings:      ${entry.learningsPath}`);

  // Show file sizes if they exist
  const transcriptAbs = entry.transcriptPath.replace("~", HOME);
  const insightsAbs = entry.insightsPath.replace("~", HOME);
  if (existsSync(transcriptAbs)) {
    const size = readFileSync(transcriptAbs, "utf-8").length;
    console.log(`Transcript size: ${size} chars`);
  }
  if (existsSync(insightsAbs)) {
    const size = readFileSync(insightsAbs, "utf-8").length;
    console.log(`Insights size:  ${size} chars`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { action, flags } = parseArgs();

switch (action) {
  case "init":
    await actionInit(flags);
    break;
  case "save":
    await actionSave(flags);
    break;
  case "insight":
    await actionInsight(flags);
    break;
  case "list":
    actionList();
    break;
  case "status":
    actionStatus(flags);
    break;
  default:
    console.error(`Usage: DialogueWriter.ts <init|save|insight|list|status> [flags]`);
    console.error("");
    console.error("Actions:");
    console.error("  init     Create a new dialogue entry");
    console.error("           --title TEXT  --session-date YYYY-MM-DD  --session-id UUID");
    console.error("  save     Save transcript content (stdin or --input FILE)");
    console.error("           --id DIALOGUE_ID");
    console.error("  insight  Save extracted insights (stdin or --input FILE)");
    console.error("           --id DIALOGUE_ID");
    console.error("  list     List all past dialogues");
    console.error("  status   Show status of a dialogue");
    console.error("           --id DIALOGUE_ID");
    process.exit(1);
}

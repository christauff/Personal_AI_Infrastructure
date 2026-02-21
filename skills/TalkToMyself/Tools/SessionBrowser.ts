#!/usr/bin/env bun

/**
 * SessionBrowser.ts - Browse and search past Claude Code session transcripts
 *
 * Usage:
 *   bun SessionBrowser.ts --recent 10
 *   bun SessionBrowser.ts --search "auth middleware"
 *   bun SessionBrowser.ts --date 2026-02-15
 *   bun SessionBrowser.ts --info <sessionId>
 *   bun SessionBrowser.ts --json --recent 5
 *
 * Streams JSONL files line-by-line to handle large (17MB+) transcripts safely.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const SESSIONS_DIR = path.join(
  process.env.HOME || "/home/christauff",
  ".claude/projects/-home-christauff"
);

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Flags {
  recent: number;
  search: string | null;
  date: string | null;
  info: string | null;
  json: boolean;
}

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = {
    recent: 10,
    search: null,
    date: null,
    info: null,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--recent":
        flags.recent = parseInt(args[++i], 10) || 10;
        break;
      case "--search":
        flags.search = args[++i] || null;
        break;
      case "--date":
        flags.date = args[++i] || null;
        break;
      case "--info":
        flags.info = args[++i] || null;
        break;
      case "--json":
        flags.json = true;
        break;
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionMeta {
  sessionId: string;
  slug: string;
  date: string;
  timestamp: string;
  messageCount: number;
  sizeBytes: number;
  preview: string;
  filePath: string;
  mtime: number;
}

// ---------------------------------------------------------------------------
// Stream first N lines to extract metadata
// ---------------------------------------------------------------------------

async function extractMeta(filePath: string): Promise<SessionMeta | null> {
  const fileName = path.basename(filePath, ".jsonl");
  let fileStats: Awaited<ReturnType<typeof stat>>;

  try {
    fileStats = await stat(filePath);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let slug = "";
    let timestamp = "";
    let sessionId = fileName;
    let preview = "";
    let linesRead = 0;
    let foundUserMessage = false;
    const maxLines = 30; // Only scan first 30 lines for metadata

    rl.on("line", (line) => {
      linesRead++;

      try {
        const obj = JSON.parse(line);

        // Extract slug and timestamp from progress entries
        if (obj.type === "progress" && !slug && obj.slug) {
          slug = obj.slug;
          timestamp = obj.timestamp || "";
          if (obj.sessionId) sessionId = obj.sessionId;
        }

        // Extract sessionId from any entry that has it
        if (obj.sessionId && sessionId === fileName) {
          sessionId = obj.sessionId;
        }

        // Extract timestamp from earliest available source
        if (!timestamp && obj.timestamp) {
          timestamp = obj.timestamp;
        }

        // Extract first user message for preview
        if (
          !foundUserMessage &&
          obj.type === "user" &&
          obj.message?.role === "user" &&
          obj.message?.content
        ) {
          const content =
            typeof obj.message.content === "string"
              ? obj.message.content
              : Array.isArray(obj.message.content)
                ? obj.message.content
                    .filter((b: any) => b.type === "text")
                    .map((b: any) => b.text)
                    .join(" ")
                : "";
          // Strip XML-like tags for a cleaner preview
          preview = content
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);
          foundUserMessage = true;
        }
      } catch {
        // Skip unparseable lines
      }

      if (linesRead >= maxLines || (slug && foundUserMessage)) {
        rl.close();
        stream.destroy();
      }
    });

    rl.on("close", () => {
      // Derive date from timestamp or file mtime
      const dateStr = timestamp
        ? timestamp.slice(0, 10)
        : new Date(fileStats.mtimeMs).toISOString().slice(0, 10);

      resolve({
        sessionId,
        slug: slug || "(no slug)",
        date: dateStr,
        timestamp: timestamp || new Date(fileStats.mtimeMs).toISOString(),
        messageCount: Math.round(fileStats.size / 2000), // rough approximation
        sizeBytes: fileStats.size,
        preview: preview.slice(0, 100),
        filePath,
        mtime: fileStats.mtimeMs,
      });
    });

    rl.on("error", () => resolve(null));
    stream.on("error", () => resolve(null));
  });
}

// ---------------------------------------------------------------------------
// Detailed info for a single session (streams full file)
// ---------------------------------------------------------------------------

async function getDetailedInfo(
  sessionId: string
): Promise<Record<string, any> | null> {
  // Find the file -- could be exact filename or match sessionId in content
  const files = await readdir(SESSIONS_DIR);
  let targetFile = files.find((f) => f === `${sessionId}.jsonl`);

  // Also try matching by slug
  if (!targetFile) {
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const fp = path.join(SESSIONS_DIR, f);
      const meta = await extractMeta(fp);
      if (
        meta &&
        (meta.sessionId === sessionId ||
          meta.slug === sessionId ||
          f.replace(".jsonl", "") === sessionId)
      ) {
        targetFile = f;
        break;
      }
    }
  }

  if (!targetFile) return null;

  const filePath = path.join(SESSIONS_DIR, targetFile);
  const fileStats = await stat(filePath);

  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let userCount = 0;
    let assistantCount = 0;
    let toolUseCount = 0;
    let totalLines = 0;
    let slug = "";
    let firstTimestamp = "";
    let lastTimestamp = "";
    let preview = "";
    let sid = sessionId;

    rl.on("line", (line) => {
      totalLines++;
      try {
        const obj = JSON.parse(line);

        if (obj.timestamp) {
          if (!firstTimestamp) firstTimestamp = obj.timestamp;
          lastTimestamp = obj.timestamp;
        }

        if (obj.type === "progress" && obj.slug && !slug) {
          slug = obj.slug;
        }
        if (obj.sessionId && sid === sessionId) {
          sid = obj.sessionId;
        }

        if (obj.type === "user" && obj.message?.role === "user") {
          userCount++;
          if (!preview && obj.message?.content) {
            const content =
              typeof obj.message.content === "string"
                ? obj.message.content
                : Array.isArray(obj.message.content)
                  ? obj.message.content
                      .filter((b: any) => b.type === "text")
                      .map((b: any) => b.text)
                      .join(" ")
                  : "";
            preview = content
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 200);
          }
        }

        if (obj.type === "assistant") {
          assistantCount++;
          // Count tool uses within assistant messages
          if (obj.message?.content && Array.isArray(obj.message.content)) {
            toolUseCount += obj.message.content.filter(
              (b: any) => b.type === "tool_use"
            ).length;
          }
        }
      } catch {
        // skip
      }
    });

    rl.on("close", () => {
      // Calculate duration
      let durationMin = 0;
      if (firstTimestamp && lastTimestamp) {
        durationMin = Math.round(
          (new Date(lastTimestamp).getTime() -
            new Date(firstTimestamp).getTime()) /
            60000
        );
      }

      resolve({
        sessionId: sid,
        slug: slug || "(no slug)",
        filePath,
        sizeBytes: fileStats.size,
        sizeHuman: formatSize(fileStats.size),
        totalLines,
        userMessages: userCount,
        assistantMessages: assistantCount,
        toolUses: toolUseCount,
        totalMessages: userCount + assistantCount,
        firstTimestamp,
        lastTimestamp,
        durationMinutes: durationMin,
        preview,
      });
    });

    rl.on("error", () => resolve(null));
    stream.on("error", () => resolve(null));
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)}KB`;
  return `${bytes}B`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function renderTable(sessions: SessionMeta[]): string {
  const header = `${pad("DATE", 12)}${pad("SLUG", 28)}${pad("MSGS", 8)}${pad("SIZE", 10)}PREVIEW`;
  const divider = "-".repeat(100);
  const rows = sessions.map((s) => {
    return `${pad(s.date, 12)}${pad(s.slug, 28)}${pad("~" + s.messageCount.toString(), 8)}${pad(formatSize(s.sizeBytes), 10)}${s.preview.slice(0, 60)}`;
  });
  return [header, divider, ...rows].join("\n");
}

function renderJson(sessions: SessionMeta[]): string {
  return JSON.stringify(
    sessions.map((s) => ({
      sessionId: s.sessionId,
      slug: s.slug,
      date: s.date,
      messageCount: s.messageCount,
      sizeBytes: s.sizeBytes,
      preview: s.preview,
    })),
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseFlags();

  // --info mode: detailed single session view
  if (flags.info) {
    const info = await getDetailedInfo(flags.info);
    if (!info) {
      console.error(`Session not found: ${flags.info}`);
      process.exit(1);
    }
    if (flags.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`Session: ${info.sessionId}`);
      console.log(`Slug:    ${info.slug}`);
      console.log(`File:    ${info.filePath}`);
      console.log(`Size:    ${info.sizeHuman} (${info.totalLines} lines)`);
      console.log(`Messages: ${info.totalMessages} (${info.userMessages} user, ${info.assistantMessages} assistant)`);
      console.log(`Tool Uses: ${info.toolUses}`);
      console.log(`Duration: ${info.durationMinutes} minutes`);
      console.log(`First:   ${info.firstTimestamp}`);
      console.log(`Last:    ${info.lastTimestamp}`);
      console.log(`Preview: ${info.preview}`);
    }
    return;
  }

  // List session files sorted by mtime descending
  const files = await readdir(SESSIONS_DIR);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  // Get stats for sorting by mtime
  const fileEntries: Array<{ name: string; mtime: number }> = [];
  for (const f of jsonlFiles) {
    try {
      const s = await stat(path.join(SESSIONS_DIR, f));
      fileEntries.push({ name: f, mtime: s.mtimeMs });
    } catch {
      // skip inaccessible files
    }
  }

  // Sort most recent first
  fileEntries.sort((a, b) => b.mtime - a.mtime);

  // Date filter narrows candidates before metadata extraction
  let candidates = fileEntries;
  if (flags.date) {
    const targetDate = flags.date;
    candidates = candidates.filter((e) => {
      const fileDate = new Date(e.mtime).toISOString().slice(0, 10);
      return fileDate === targetDate;
    });
  }

  // When searching, we need to scan more files (search could match anything)
  const scanLimit = flags.search ? Math.min(candidates.length, 200) : flags.recent * 2;
  const toScan = candidates.slice(0, scanLimit);

  // Extract metadata in parallel with concurrency limit
  const CONCURRENCY = 20;
  const sessions: SessionMeta[] = [];

  for (let i = 0; i < toScan.length; i += CONCURRENCY) {
    const batch = toScan.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((e) => extractMeta(path.join(SESSIONS_DIR, e.name)))
    );
    for (const r of results) {
      if (r) sessions.push(r);
    }
  }

  // Apply search filter
  let filtered = sessions;
  if (flags.search) {
    const keyword = flags.search.toLowerCase();
    filtered = sessions.filter(
      (s) =>
        s.preview.toLowerCase().includes(keyword) ||
        s.slug.toLowerCase().includes(keyword)
    );
  }

  // Apply date filter on extracted metadata (more precise than mtime)
  if (flags.date) {
    filtered = filtered.filter((s) => s.date === flags.date);
  }

  // Sort by mtime descending, limit to --recent
  filtered.sort((a, b) => b.mtime - a.mtime);
  filtered = filtered.slice(0, flags.recent);

  // Output
  if (filtered.length === 0) {
    console.log("No sessions found matching criteria.");
    return;
  }

  if (flags.json) {
    console.log(renderJson(filtered));
  } else {
    console.log(renderTable(filtered));
  }
}

main().catch((err) => {
  console.error("SessionBrowser error:", err.message);
  process.exit(1);
});

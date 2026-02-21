---
name: UpstreamSync
description: "Automated upstream sync tool. USE WHEN check upstream, sync upstream, upstream changes, diff upstream, new PAI version, merge upstream. Detects changes in danielmiessler/Personal_AI_Infrastructure releases, diffs against local, and selectively syncs with backup and verification."
triggers:
  - check upstream
  - sync upstream
  - upstream changes
  - diff upstream
  - new PAI version
  - merge upstream
  - upstream sync
  - upstream diff
tier: deferred
---

# UpstreamSync

Automated tool for syncing changes from upstream PAI releases (`danielmiessler/Personal_AI_Infrastructure`) into the local installation.

## Problem

Our PAI instance has files at root level (`hooks/`, `skills/`, etc.) while upstream publishes releases under `Releases/vX.Y/.claude/`. This path mismatch makes `git merge` impossible. Changes must be manually ported — error-prone and tedious.

## Solution

Three-way diff engine that:
1. **Detects** available upstream versions in `Releases/`
2. **Diffs** upstream against local with conflict classification
3. **Syncs** selectively with backup, verification, and state tracking

## Usage

```bash
# List available upstream versions
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts detect

# Show what changed in latest version
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts diff

# Show changes in specific version, filtered by category
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts diff v2.5 --category hook

# Preview sync without applying
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync v2.5 --dry-run

# Apply changes (conflicts skipped by default)
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync v2.5

# Take upstream version for all conflicts
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync v2.5 --conflict take-upstream

# Bootstrap initial state from current installation
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync --bootstrap

# Check current sync status
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts status
```

## Architecture

- **DiffEngine.ts** — File discovery, path translation, hashing, three-way diff classification, protected path detection
- **SyncExecutor.ts** — Backup, file copy, post-sync actions (RebuildPAI, skill index), verification
- **UpstreamSync.ts** — CLI entry point with detect/diff/sync/status commands

## Protected Files

These files are never auto-synced (flagged as conflicts for manual review):
- `settings.json` — Identity configuration
- `CLAUDE.md` — Local stub
- Custom security hooks (ExternalContentValidator, IntegrityCheck, MemoryWriteGuard, etc.)
- `VoiceServer/server.ts` — Kokoro TTS integration (user-customized)
- `VoiceServer/voices.json` — Kokoro voice mappings (user-customized)
- `VoiceServer/pronunciations.json` — Custom pronunciation rules
- All paths listed in `.pai-publish.yaml` private section

## Workflows

- **DetectChanges** — Run diff, present categorized report
- **SyncFiles** — Interactive sync with conflict resolution

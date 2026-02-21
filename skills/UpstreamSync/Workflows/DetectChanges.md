# DetectChanges Workflow

## Voice Notification

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Checking for upstream changes"}' \
  > /dev/null 2>&1 &
```

Running the **DetectChanges** workflow in the **UpstreamSync** skill...

**Trigger:** "check upstream", "upstream changes", "what's new upstream", "diff upstream"

---

## Execution

### Step 1: Detect Available Versions

```bash
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts detect
```

### Step 2: Generate Diff Report

Run against the latest (or specified) version:

```bash
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts diff [version]
```

### Step 3: Present Categorized Report

Present the diff report organized by priority:

1. **CONFLICTS** (both sides changed) — Require manual review
2. **NEW FILES** (added upstream) — Safe to add
3. **MODIFICATIONS** (upstream changed, local unchanged) — Safe to sync
4. **PROTECTED** — Never auto-synced, flagged for awareness

### Step 4: Recommend Actions

Based on the report:
- If only safe modifications → recommend `sync --dry-run` then `sync`
- If conflicts exist → recommend reviewing each conflict
- If new files exist → recommend adding them
- If no changes → report "up to date"

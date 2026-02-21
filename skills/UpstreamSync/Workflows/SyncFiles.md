# SyncFiles Workflow

## Voice Notification

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Syncing upstream files"}' \
  > /dev/null 2>&1 &
```

Running the **SyncFiles** workflow in the **UpstreamSync** skill...

**Trigger:** "sync upstream", "merge upstream", "apply upstream changes"

---

## Execution

### Step 1: Preview Changes

Always dry-run first:

```bash
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync [version] --dry-run
```

### Step 2: Review Conflicts

For each conflict, present:
- File path and category
- What changed upstream (summary)
- What changed locally (summary)
- Recommendation: keep-local, take-upstream, or manual merge

Use AskUserQuestion for each conflict resolution if interactive.

### Step 3: Apply Sync

```bash
bun ~/.claude/skills/UpstreamSync/Tools/UpstreamSync.ts sync [version] --conflict [strategy]
```

### Step 4: Verify Results

The sync tool automatically:
1. Creates backup in `.sync-backup/{timestamp}/`
2. Re-hashes synced files to confirm match
3. Syntax-checks all TypeScript files
4. Validates JSON files
5. Checks hook references in settings.json
6. Runs RebuildPAI if Algorithm components changed
7. Regenerates skill index if skills changed

### Step 5: Report

Present final sync report:
- Files synced successfully
- Files skipped (protected or kept local)
- Unresolved conflicts (if any)
- Verification results
- Backup location

### Step 6: Post-Sync Recommendations

- If hooks were synced → recommend restarting Claude Code session
- If Algorithm components synced → confirm RebuildPAI ran successfully
- If new skills added → confirm skill index was regenerated

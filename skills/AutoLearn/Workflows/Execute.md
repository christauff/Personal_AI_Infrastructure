# AutoLearn Workflow: Execute

**Purpose:** Implement approved AutoLearn tasks with verification

---

## Prerequisites

- Approved tasks exist in `AUTOLEARN/APPROVED/`
- Task has been reviewed and approved (via MorningBrief or auto-graduation)
- Budget available for execution

---

## Step 1: Load Approved Task

```bash
# Get next approved task
ls ~/.claude/AUTOLEARN/APPROVED/ | head -1
cat ~/.claude/AUTOLEARN/APPROVED/{task-id}.yaml
```

Read full task specification.

---

## Step 2: Pre-Execution Checks

### Safety Verification
```bash
# Verify task hasn't been tampered with
sha256sum ~/.claude/AUTOLEARN/APPROVED/{task-id}.yaml
```

### Target Validation
- Confirm target file exists (for modifications)
- Confirm target directory is writable
- Confirm file is within allowed paths

### Git Status
```bash
# Ensure clean working state
git status --porcelain
```

If uncommitted changes exist, log warning but continue.

---

## Step 3: Create Implementation Branch

```bash
# Create isolated branch for this task
git checkout -b autolearn/{task-id}
```

This allows easy rollback if implementation fails.

---

## Step 4: Execute Implementation

Spawn Engineer agent to implement the task:

```
Engineer Agent Task:

Implement the following AutoLearn task:

Task ID: {task-id}
Category: {category}
Target: {target_file}

Description:
{proposed_action.description}

Diff Preview (reference only):
{diff_preview}

CONSTRAINTS:
- Make ONLY the changes described
- Do NOT add extra improvements
- Do NOT refactor surrounding code
- Follow existing code style exactly
- Add minimal comments only if needed

VERIFICATION:
- {test_strategy}
```

---

## Step 5: Verify Implementation

### For Documentation Changes
- Read modified file, confirm changes match proposal
- Check markdown renders correctly

### For Skill Enhancements
- Read modified file, confirm syntax correct
- If skill has tests, run them
- If UI-related, use Browser skill to verify

### For Config Changes
- Validate YAML/JSON syntax
- Confirm no forbidden patterns introduced

```bash
# Syntax check for YAML
python3 -c "import yaml; yaml.safe_load(open('{file}'))"

# Syntax check for JSON
python3 -c "import json; json.load(open('{file}'))"
```

---

## Step 5.5: Mandatory Self-Verification (Boris Cherny Principle)

**CRITICAL:** Give Claude a way to verify its own work. Quality jumps dramatically when outputs are checked.

### Verification Checklist (ALL must pass before Step 6)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✅ MANDATORY VERIFICATION CHECKLIST                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. TESTS: Run any available tests for modified files                        │
│    → bun test {file}.test.ts (if exists)                                    │
│    → npm test (if package.json has test script)                             │
│    → Skip only if no tests exist for this area                              │
│                                                                             │
│ 2. SYNTAX: Validate all modified file types                                 │
│    → YAML: python3 -c "import yaml; yaml.safe_load(open('{file}'))"         │
│    → JSON: python3 -c "import json; json.load(open('{file}'))"              │
│    → TypeScript: bun run --dry-run {file} (syntax check)                    │
│    → Markdown: Confirm headers render, links valid                          │
│                                                                             │
│ 3. BROWSER: For ANY UI-affecting changes                                    │
│    → Screenshot before and after if applicable                              │
│    → Use Browser skill to verify visual state                               │
│    → Confirm no regressions in related pages                                │
│                                                                             │
│ 4. STATEGUARDIAN: Verify health hasn't dropped                              │
│    → bun run Tools/StateGuardian.ts health                                  │
│    → If health < 90, investigate before proceeding                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Verification Commands

```bash
# 1. Run tests (if they exist)
if [[ -f "{file}.test.ts" ]]; then
  bun test "{file}.test.ts"
fi

# 2. Syntax validation by file type
case "{file}" in
  *.yaml|*.yml)
    python3 -c "import yaml; yaml.safe_load(open('{file}'))" && echo "✅ YAML valid"
    ;;
  *.json)
    python3 -c "import json; json.load(open('{file}'))" && echo "✅ JSON valid"
    ;;
  *.ts)
    bun run --dry-run "{file}" 2>/dev/null && echo "✅ TypeScript syntax OK"
    ;;
  *.md)
    echo "✅ Markdown (manual review)"
    ;;
esac

# 3. StateGuardian health check
bun run ~/.claude/skills/AutoLearn/Tools/StateGuardian.ts health
```

### Failure Protocol

If ANY verification fails:
1. **DO NOT proceed to Step 6 (Commit)**
2. Fix the issue
3. Re-run verification
4. Only continue when ALL checks pass

### Evidence Logging

Record verification results in execution log:
```yaml
verification:
  tests_run: true|false|skipped
  tests_passed: true|false|N/A
  syntax_valid: true|false
  browser_verified: true|false|N/A
  stateguardian_health: {score}/100
  all_passed: true|false
```

---

## Step 6: Commit Changes

```bash
# Stage only the expected files
git add {target_file}

# Commit with AutoLearn prefix
git commit -m "AutoLearn: {short_description}

Task ID: {task-id}
Source: {source.creator} - {source.article}
Category: {category}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Step 7: Merge to Main

```bash
# Return to main branch
git checkout main

# Merge implementation
git merge autolearn/{task-id}

# Clean up branch
git branch -d autolearn/{task-id}
```

---

## Step 8: Record Execution

Create execution log:

```yaml
# ~/.claude/AUTOLEARN/EXECUTED/{date}-{task-id}.md

---
task_id: autolearn-2026-01-31-001
executed: 2026-01-31T07:30:00Z
status: SUCCESS
---

# Execution Log

## Task Summary
- **Category:** skill-enhancement
- **Target:** skills/PAI/SKILL.md
- **Source:** Joe Njenga - "Claude Code Tips"

## Changes Made
- Added context management section (15 lines)
- Location: Line 234-249

## Verification
- Manual review: PASSED
- Syntax check: PASSED
- No test failures

## Git
- Commit: abc123def
- Branch: autolearn/autolearn-2026-01-31-001 (merged, deleted)

## Token Usage
- Implementation: 800
- Verification: 200
- Total: 1000
```

---

## Step 9: Update Trust Score

Call TrustManager to record successful execution:

```bash
bun run ~/.claude/skills/AutoLearn/Tools/TrustManager.ts record {task-id} executed
```

Note: Full trust score adjustment happens when user confirms in next MorningBrief.

---

## Step 10: Move Task to Executed

```bash
mv ~/.claude/AUTOLEARN/APPROVED/{task-id}.yaml ~/.claude/AUTOLEARN/EXECUTED/
```

---

## Error Handling

### Implementation Fails
```bash
# Abort and rollback
git checkout main
git branch -D autolearn/{task-id}
```

Log failure in execution record with error details.

### Verification Fails
```bash
# Rollback changes
git checkout main
git branch -D autolearn/{task-id}
```

Move task back to PENDING with failure notes for human review.

### Merge Conflicts
```bash
# Abort merge
git merge --abort
git checkout main
git branch -D autolearn/{task-id}
```

Move task back to PENDING for manual resolution.

---

## Output

- `AUTOLEARN/EXECUTED/{date}-{task-id}.md` - Execution log
- Git commit with "AutoLearn:" prefix
- Trust history update

---

## Budget

Execution budget varies by task complexity. Logged per-task.

---

*Executed tasks are reviewed in next MorningBrief for trust score adjustment*

# AutoLearn Workflow: Generate

**Purpose:** Convert validated insights into concrete PAI improvement task proposals

---

## Prerequisites

- Validate phase completed with `AUTOLEARN/VALIDATED/{date}-validated.md`
- Only PASSED insights are processed
- Budget available for generation

---

## Step 1: Load Validated Insights

```bash
cat ~/.claude/AUTOLEARN/VALIDATED/$(date +%Y-%m-%d)-validated.md
```

Filter to only PASSED insights (score >= 0.6, injection >= 0.7).

---

## Step 2: Categorize Insight

Determine task category based on insight type:

| Insight Type | Category | Risk Level |
|--------------|----------|------------|
| Documentation improvement | documentation | LOW |
| New test suggestion | test-addition | LOW |
| Existing skill enhancement | skill-enhancement | MEDIUM |
| Configuration change | config-change | MEDIUM |
| New skill idea | new-skill | HIGH |
| System architecture change | infrastructure | HIGH |
| Security-related | security | HIGH |

---

## Step 3: Generate Task Proposal

For each validated insight, create a task proposal:

```yaml
id: autolearn-{date}-{sequence}
generated: {timestamp}

# Source attribution
source:
  creator: "{creator_name}"
  article: "{article_title}"
  url: "{source_url}"
  content_hash: "sha256:{hash}"

# The extracted insight
insight: "{validated_insight_text}"

# Task classification
category: skill-enhancement
risk: MEDIUM

# What will be done
proposed_action:
  type: skill-modification  # or: documentation-update, config-change, new-file, test-addition
  target: "skills/PAI/SKILL.md"  # Specific file to modify
  description: "Add guidance on using /compact for context management when token usage exceeds 50%"

# Validation results
validation:
  overall_score: 0.85
  injection_score: 0.95
  challenges_passed: 7
  key_concern: "May encourage over-reliance on compaction"
  mitigation: "Include guidance on when NOT to compact"

# Implementation details
implementation:
  files_affected: 1
  estimated_lines: 15
  test_strategy: "Manual review of skill file changes"
  rollback: "git revert"

# Diff preview (when possible)
diff_preview: |
  + ## Context Management
  +
  + When context exceeds 50% of available tokens:
  + - Use `/compact` to summarize conversation
  + - Consider splitting complex tasks
  + - Review CLAUDE.md for optimization
```

---

## Step 4: Validate Task Safety

**Auto-REJECT task if proposed_action contains:**

```yaml
forbidden_patterns:
  - rm -rf
  - curl | bash
  - eval(
  - exec(
  - | sh
  - ; sh
  - | bash
  - ; bash
  - --force
  - DROP DATABASE
  - DELETE FROM
  - chmod 777
```

**Auto-REJECT if target file is outside:**
- `~/.claude/skills/`
- `~/.claude/AUTOLEARN/`
- `~/.claude/MEMORY/`
- `~/.claude/GOVERNANCE/` (documentation only)

---

## Step 5: Determine Gate Destination

Based on category and gate_mode:

```python
if gate_mode == "morning-brief":
    # All tasks go to PENDING
    destination = "PENDING"

elif gate_mode == "autonomous":
    if risk == "HIGH":
        # HIGH risk always requires approval
        destination = "PENDING"
    elif trust_scores[category] >= graduation_threshold:
        # Graduated categories auto-approve
        destination = "APPROVED"
    else:
        destination = "PENDING"
```

---

## Step 6: Write Task Proposals

### To PENDING (requires approval):
```bash
# ~/.claude/AUTOLEARN/PENDING/{task-id}.yaml
```

### To APPROVED (auto-graduated):
```bash
# ~/.claude/AUTOLEARN/APPROVED/{task-id}.yaml
```

### Summary file:
```yaml
# ~/.claude/AUTOLEARN/TASKS/{date}-proposed.yaml
---
date: 2026-01-31
tasks_generated: 5
to_pending: 4
to_approved: 1
tokens_used: 2500
---

tasks:
  - id: autolearn-2026-01-31-001
    category: documentation
    risk: LOW
    destination: PENDING
    summary: "Add context management guidance to CORE skill"

  - id: autolearn-2026-01-31-002
    category: skill-enhancement
    risk: MEDIUM
    destination: PENDING
    summary: "Enhance Browser skill with retry logic"
```

---

## Output

- `AUTOLEARN/TASKS/{date}-proposed.yaml` - Summary of all generated tasks
- `AUTOLEARN/PENDING/{task-id}.yaml` - Individual tasks awaiting approval
- `AUTOLEARN/APPROVED/{task-id}.yaml` - Auto-approved tasks (if any)

---

## Budget

Default: 3000 tokens for generate phase

---

*PENDING tasks flow to MorningBrief for approval*
*APPROVED tasks flow to Execute workflow*

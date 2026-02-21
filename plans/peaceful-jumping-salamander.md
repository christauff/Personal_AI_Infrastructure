# Plan: Autonomous Learning System (AutoLearn)

**Status:** Ready for Review
**Created:** 2026-01-31
**Purpose:** Build self-improving PAI through monitored content → insights → coding tasks

---

## Executive Summary

Create an autonomous learning pipeline that:
1. **Consumes** content from monitored Claude Code creators (LandscapeMonitor)
2. **Extracts** insights via Research → WisdomSynthesis → RedTeam chain
3. **Generates** proposed coding tasks for PAI improvement
4. **Gates** execution through Morning Brief (graduating to full autonomy)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OVERNIGHT PROCESSOR                                  │
│                    (overnight-processor.sh - Phase 6)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: CONTENT HARVEST                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Source: LandscapeMonitor/Data/claude-code-creators.yaml                     │
│  Action: Fetch new content from monitored creators                           │
│  Output: AUTOLEARN/HARVEST/{date}-content.jsonl                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: WISDOM EXTRACTION                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Pipeline: Research → WisdomSynthesis(ExtractWisdom) → FirstPrinciples       │
│  Action: Extract actionable insights from harvested content                  │
│  Output: AUTOLEARN/INSIGHTS/{date}-wisdom.md                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: ADVERSARIAL VALIDATION                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Pipeline: RedTeam (8 adversarial agents)                                    │
│  Action: Challenge insights, filter weak ideas, strengthen good ones         │
│  Output: AUTOLEARN/VALIDATED/{date}-validated.md                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: TASK GENERATION                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Action: Convert validated insights into concrete PAI improvement tasks      │
│  Categories: skill-enhancement, new-skill, infrastructure, documentation     │
│  Output: AUTOLEARN/TASKS/{date}-proposed.yaml                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: APPROVAL GATE                                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Gate Mode: morning-brief | autonomous                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  IF morning-brief:                                                           │
│    → Tasks queued in AUTOLEARN/PENDING/                                      │
│    → MorningBrief presents for approval                                      │
│    → User approves/rejects/modifies                                          │
│    → Approved tasks move to AUTOLEARN/APPROVED/                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  IF autonomous:                                                              │
│    → Low-risk tasks auto-execute                                             │
│    → High-risk tasks still queue for approval                                │
│    → Trust score tracked per task category                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: EXECUTION (after approval)                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Action: Engineer agent implements approved tasks                            │
│  Verification: Run tests, Browser skill for UI, git diff review              │
│  Output: Git commits with "AutoLearn:" prefix                                │
│  Logging: AUTOLEARN/EXECUTED/{date}-{task-id}.md                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Trust Graduation System

### Starting State: Morning Brief Gate

All tasks require explicit approval in Morning Brief:

```yaml
# AUTOLEARN/config.yaml
gate_mode: morning-brief
trust_scores:
  documentation: 0      # Starts at 0, max 100
  skill-enhancement: 0
  new-skill: 0
  infrastructure: 0
graduation_threshold: 80  # Score needed for auto-approval
```

### Trust Score Calculation

Each approved task increases trust score for its category:
- **Approved without modification:** +10 points
- **Approved with minor edits:** +5 points
- **Approved with major edits:** +2 points
- **Rejected:** -15 points

### Graduation to Autonomous

When a category reaches threshold (80):
- Tasks in that category auto-execute
- Still logged and reviewable
- Rejection resets score to 50

### Risk Classification

| Risk Level | Categories | Gate |
|------------|------------|------|
| LOW | documentation, test-addition | Auto after graduation |
| MEDIUM | skill-enhancement, config-change | Auto after graduation |
| HIGH | new-skill, infrastructure, security | Always morning-brief |

---

## File Structure

```
~/.claude/AUTOLEARN/
├── config.yaml                    # Gate mode, trust scores, thresholds
├── HARVEST/                       # Raw content from monitored sources
│   └── {date}-content.jsonl
├── INSIGHTS/                      # Extracted wisdom
│   └── {date}-wisdom.md
├── VALIDATED/                     # RedTeam-validated insights
│   └── {date}-validated.md
├── TASKS/                         # Generated task proposals
│   └── {date}-proposed.yaml
├── PENDING/                       # Awaiting approval (morning-brief mode)
│   └── {task-id}.yaml
├── APPROVED/                      # User-approved tasks ready for execution
│   └── {task-id}.yaml
├── EXECUTED/                      # Completed task logs
│   └── {date}-{task-id}.md
└── METRICS/                       # Performance tracking
    └── trust-history.jsonl
```

---

*Full plan preserved - see original for complete details including Task Proposal Format, Integration Points, Implementation Plan, Prompt Injection Defense, and Verification Plan.*

# CumulativeWisdomBuilding Workflow

**Workflow ID**: CumulativeWisdomBuilding
**Skill**: DreamProcessor
**Trigger**: "wisdom building", "monthly synthesis", "cumulative wisdom"
**Schedule**: Monthly (first of month for previous month)

---

## Purpose

Crystallize verified insights from weekly syntheses into durable wisdom. This is where temporary observations become permanent knowledge, flowing into MEMORY/LEARNING/ and potentially AISTEERINGRULES.md.

---

## Philosophy

The wisdom funnel:

```
DAILY → WEEKLY → MONTHLY → PERMANENT
raw experiences → patterns → insights → wisdom
```

Each level filters for quality:
- **Daily**: Everything captured
- **Weekly**: Recurring patterns (7-day filter)
- **Monthly**: Validated insights (30-day filter)
- **Permanent**: Proven wisdom (90-day validation)

---

## Input

- **Month**: Target month (default: previous month)
- **Source**:
  - `~/.claude/DREAMS/WEEKLY/*.md` (4-5 weekly reports)
  - `~/.claude/skills/DreamProcessor/Data/HypothesisRegistry.yaml`
- **Context**:
  - `~/.claude/MEMORY/LEARNING/` (existing knowledge)
  - `~/.claude/skills/PAI/USER/AISTEERINGRULES.md` (behavioral rules)

---

## Output

- **Primary**: `~/.claude/DREAMS/MONTHLY/{month}.md`
- **Side effects**:
  - New entries in `MEMORY/LEARNING/` for verified insights
  - Candidate rules for AISTEERINGRULES review
  - Updated HypothesisRegistry (validated → archived)

---

## Execution Stages

### Stage 1: Gather Monthly Data

**Purpose**: Collect all weekly syntheses for the target month.

**Steps**:
1. Determine month boundaries
2. Find all WEEKLY/*.md files within range (typically 4-5)
3. Extract recurring themes, pattern evolutions, hypothesis updates
4. Load HypothesisRegistry for hypothesis validation

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Gather monthly data",
  prompt: "Collect and structure data from these weekly syntheses:\n\n[WEEKLY_REPORTS]\n\nExtract:\n1. Themes that appeared in 3+ weeks\n2. Hypotheses that reached validation threshold\n3. Pattern trends (emerging → stable → declining)\n4. Contradictions or tensions that persisted"
})
```

---

### Stage 2: Identify Verified Insights

**Purpose**: Determine which patterns have proven durable enough for LEARNING.

**Criteria for verification**:
- Appeared in 3+ weekly reports
- Supporting evidence from multiple independent sessions
- Withstood RedTeam challenges in weekly synthesis
- No contradicting evidence in recent weeks

**Steps**:
1. Filter patterns by durability criteria
2. Classify by category (technical, behavioral, strategic, meta)
3. Determine destination (LEARNING, AISTEERINGRULES candidate, TELOS)
4. Draft insight statements (single sentence, actionable)

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Verify insights",
  prompt: "Review these monthly patterns and identify insights ready for permanent capture:\n\n[PATTERNS]\n\nCriteria:\n- 3+ weeks appearance\n- Multiple evidence sources\n- No contradictions\n\nFor each verified insight:\n1. Single-sentence statement\n2. Category (technical/behavioral/strategic/meta)\n3. Destination (LEARNING/AISTEERINGRULES/TELOS)\n4. Evidence summary"
})
```

---

### Stage 3: Behavioral Pattern Analysis

**Purpose**: Identify patterns that suggest new steering rules.

**Steps**:
1. Extract behavioral observations from weekly syntheses
2. Identify recurring friction points
3. Identify recurring successes
4. Draft candidate AISTEERINGRULES entries (Statement/Bad/Correct format)
5. Flag for human review (never auto-add rules)

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Analyze behavioral patterns",
  prompt: "Review these monthly patterns for behavioral insights:\n\n[PATTERNS]\n\nIdentify patterns that could become steering rules:\n- Recurring mistakes worth preventing\n- Successful approaches worth codifying\n- Friction points worth addressing\n\nFor each candidate, draft in format:\nStatement: [rule]\nBad: [example of violation]\nCorrect: [example of compliance]"
})
```

---

### Stage 4: Update LEARNING

**Purpose**: Add verified insights to permanent knowledge.

**Steps**:
1. Read existing MEMORY/LEARNING/ structure
2. Determine appropriate file/section for each insight
3. Write new entries with metadata (date verified, evidence link)
4. Avoid duplicates (check for similar existing entries)

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Update LEARNING",
  prompt: "Add these verified insights to MEMORY/LEARNING/:\n\n[INSIGHTS]\n\nFor each:\n1. Find appropriate location in LEARNING/ structure\n2. Check for duplicates\n3. Write entry with format:\n   - Insight statement\n   - Verified: [date]\n   - Evidence: [link to dream reports]\n   - Category: [type]"
})
```

---

### Stage 5: Archive Resolved Hypotheses

**Purpose**: Move validated/refuted hypotheses to archive.

**Steps**:
1. Identify hypotheses with final status (validated, refuted)
2. Verify they've been in final status for 30+ days
3. Move to archive section of HypothesisRegistry
4. Update statistics

---

### Stage 6: Generate Monthly Report

**Purpose**: Produce the monthly wisdom document.

**Steps**:
1. Compile all verified insights
2. List AISTEERINGRULES candidates (for human review)
3. Summarize hypothesis lifecycle (new → tracked → validated/refuted)
4. Generate meta-observations about the dream system itself
5. Write to DREAMS/MONTHLY/{month}.md

---

## Wisdom Categories & Destinations

| Category | Destination | Criteria |
|----------|-------------|----------|
| **Technical** | MEMORY/LEARNING/technical/ | Code patterns, tool usage, architecture insights |
| **Behavioral** | AISTEERINGRULES candidate | Interaction patterns, error recovery, process improvements |
| **Strategic** | USER/TELOS/ or LEARNING/strategic/ | Goal-related insights, life patterns |
| **Meta** | LEARNING/meta/ | Insights about PAI itself, dream processing observations |

---

## Scalability Design (Decades)

**Compression ratios over time:**
- ~30 daily reports → ~4 weekly reports → 1 monthly report
- ~120:1 compression ratio annually
- Year 1: 365 dailies → 52 weeklies → 12 monthlies
- Decade: ~4000 dailies → ~520 weeklies → ~120 monthlies

**Archive strategy:**
- Daily: Delete after 30 days (weekly synthesis captured)
- Weekly: Archive after 90 days
- Monthly: Keep permanently (12/year is manageable)
- LEARNING: Curate annually (dedupe, refine, prune)

**Index maintenance:**
- Yearly index of monthly reports
- Topic index across all monthlies
- Hypothesis genealogy (how hypotheses evolved)

---

## Example Output

See `Templates/WisdomReport.md` for full template.

```markdown
# Monthly Wisdom: 2026-02

**Period:** 2026-02-01 to 2026-02-29
**Weekly syntheses analyzed:** 4
**Verified insights:** 5
**Hypotheses validated:** 2
**AISTEERINGRULES candidates:** 1

---

## Verified Insights (Added to LEARNING)

### 1. Multi-skill orchestration benefits from sequential chaining
**Category:** Technical
**Evidence:** WisdomSynthesis development, 3 weeks observation
**Added to:** MEMORY/LEARNING/technical/skill-architecture.md

### 2. Progress indicators reduce user anxiety during long operations
**Category:** Behavioral
**Evidence:** Validated HYP-2026-01-30-001
**Added to:** MEMORY/LEARNING/behavioral/user-experience.md

---

## AISTEERINGRULES Candidates (Review Required)

### Candidate: Always Show Progress for Operations >10s
Statement: For any operation expected to take more than 10 seconds, provide progress indication (streaming output, percentage, or status updates).
Bad: Run 30-second operation silently, return "done" at end.
Correct: Show streaming output or periodic status: "Processing... 30% complete..."

**Status:** Awaiting human review

---

## Meta-Observations

1. The hypothesis tracking system is generating measurable value
2. Weekly synthesis quality improved when RedTeam validation included
3. Behavioral insights are harder to validate than technical ones

---

*Generated by DreamProcessor CumulativeWisdomBuilding*
```

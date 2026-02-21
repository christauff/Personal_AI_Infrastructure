# WeeklyPatternSynthesis Workflow

**Workflow ID**: WeeklyPatternSynthesis
**Skill**: DreamProcessor
**Trigger**: "weekly synthesis", "weekly patterns", "weekly dreams"
**Schedule**: Sunday nights (manual or scheduled)

---

## Purpose

Synthesize patterns from 7 days of nightly dream reports, identifying recurring themes, tracking hypothesis evolution, and producing a weekly synthesis report.

---

## Input

- **Week**: Target week (default: current week)
- **Source**: `~/.claude/DREAMS/NIGHTLY/*.md` (7 most recent)
- **Context**: `~/.claude/skills/DreamProcessor/Data/HypothesisRegistry.yaml`

---

## Output

- **Primary**: `~/.claude/DREAMS/WEEKLY/{week}.md`
- **Side effects**: Updates to HypothesisRegistry.yaml (confidence changes)

---

## Execution Stages

### Stage 1: Collect Weekly Reports

**Purpose**: Gather all nightly reports for the target week.

**Steps**:
1. Determine week boundaries (Monday → Sunday)
2. Find all NIGHTLY/*.md files within range
3. Extract structured data from each report
4. Build unified weekly manifest

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Collect weekly dreams",
  prompt: "Find all dream reports in ~/.claude/DREAMS/NIGHTLY/ for the week of [WEEK]. Extract: themes, insights, hypotheses, connections from each. Return unified manifest with day-by-day breakdown."
})
```

**Output**: Weekly manifest (7 days of structured dream data)

---

### Stage 2: Pattern Detection

**Purpose**: Identify recurring patterns across the week.

**Steps**:
1. Count theme frequencies (themes appearing 2+ days = recurring)
2. Track insight categories (technical vs behavioral vs strategic)
3. Identify trend lines (emerging, stable, declining)
4. Note any contradictions between days

**Agent delegation**:
```
Task({
  subagent_type: "ClaudeResearcher",
  description: "Detect weekly patterns",
  prompt: "Analyze this weekly dream manifest for patterns:\n\n[MANIFEST]\n\nIdentify:\n1. Themes appearing multiple days (frequency count)\n2. Insight category distribution\n3. Trends: what's emerging vs declining?\n4. Any contradictions or tensions between days"
})
```

**Output**: Pattern analysis structure

---

### Stage 3: Hypothesis Evolution Tracking

**Purpose**: Update hypothesis confidence based on week's evidence.

**Steps**:
1. Load HypothesisRegistry.yaml
2. For each active hypothesis, check if week's dreams provide evidence
3. Adjust confidence scores (strengthen/weaken/unchanged)
4. Mark any hypotheses as validated or refuted
5. Flag stale hypotheses (no progress in 30 days)

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Update hypotheses",
  prompt: "Review these hypotheses against this week's dream evidence:\n\nHypotheses:\n[REGISTRY]\n\nWeek's evidence:\n[WEEKLY_DATA]\n\nFor each hypothesis, determine: strengthened, weakened, unchanged, validated, or refuted. Provide reasoning for each change."
})
```

**Output**: Hypothesis updates

---

### Stage 3.5: Hypothesis Resolution

**Purpose**: Attempt to resolve testable hypotheses using the week's accumulated evidence.

**Steps**:
1. Filter active hypotheses for "testable-now" (verificationMethod can be executed with available data)
2. Run the HypothesisExtraction workflow in `resolve` mode
3. Update HypothesisRegistry.yaml with any validated/refuted results
4. Include resolution results in the weekly report

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Resolve testable hypotheses",
  prompt: "Run the HypothesisExtraction resolve mode. Load HypothesisRegistry.yaml, identify hypotheses whose verificationMethod can be tested with currently available data in MEMORY/, DREAMS/, and catch-log. Execute each test and report results."
})
```

**Output**: Resolution results (validated/refuted/insufficient per hypothesis)

---

### Stage 4: RedTeam Validation

**Purpose**: Challenge pattern significance with adversarial analysis.

**Steps**:
1. Present patterns to RedTeam skill
2. Challenge: Are these patterns real or noise?
3. Challenge: Are we missing counter-evidence?
4. Validate or downgrade pattern confidence

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "RedTeam patterns",
  prompt: "Using the RedTeam skill with the Critique workflow, challenge these weekly patterns:\n\n[PATTERNS]\n\nQuestions:\n1. Are these patterns statistically significant (7 days sample)?\n2. What counter-evidence might we be ignoring?\n3. Which patterns are most robust vs most fragile?"
})
```

**Output**: Validated pattern list with confidence adjustments

---

### Stage 5: Synthesis Report

**Purpose**: Produce final weekly synthesis document.

**Steps**:
1. Compile all outputs into weekly report structure
2. Write recurring themes with trend analysis
3. Document hypothesis status changes
4. Generate weekly insights (meta-observations)
5. Write to DREAMS/WEEKLY/{week}.md

**Output**: Final weekly synthesis file

---

## Scalability Considerations

**For decades of operation:**

1. **Weekly reports compress**: 7 nightly → 1 weekly (7:1 compression)
2. **Archival after 90 days**: Old weekly reports move to ARCHIVE/
3. **Hypothesis pruning**: Stale hypotheses (no updates 90 days) marked inactive
4. **Pattern decay**: Patterns not seen in 30 days lose significance
5. **Index files**: Maintain `WEEKLY/index.md` for navigation

---

## Example Output

```markdown
# Weekly Synthesis: 2026-W05

**Period:** 2026-01-27 to 2026-02-02
**Nightly reports analyzed:** 7
**Recurring themes found:** 3
**Hypotheses updated:** 5

---

## Recurring Themes

### 1. Multi-Skill Orchestration (5/7 days)
**Trend:** Emerging → Stable
**Evidence:**
- Day 1: Initial WisdomSynthesis design
- Day 3: Pipeline architecture decisions
- Day 5: Integration testing
- Day 7: Production deployment
**Significance:** High - major development arc completed

### 2. Session Recovery Patterns (3/7 days)
**Trend:** Stable
**Evidence:**
- Day 2: VMware snapshot recovery
- Day 4: Git sync procedures
- Day 6: Multi-remote confusion
**Significance:** Medium - ongoing friction point

---

## Hypothesis Status Updates

| ID | Statement | Previous | Current | Change |
|----|-----------|----------|---------|--------|
| HYP-2026-01-30-001 | Streaming progress reduces anxiety | low | medium | ↑ strengthened |
| HYP-2026-01-31-002 | Council debates improve decisions | medium | medium | = unchanged |

---

## Weekly Insights

1. Development arcs that span multiple days produce the richest insights
2. Recovery patterns indicate systemic friction worth addressing
3. The hypothesis tracking system is producing measurable value

---

*Generated by DreamProcessor WeeklyPatternSynthesis*
```

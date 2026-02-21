# NightlyConsolidation Workflow

**Workflow ID**: NightlyConsolidation
**Skill**: DreamProcessor
**Trigger**: overnight-processor.sh Phase 4, "process dreams", "nightly consolidation"

---

## Purpose

Process the day's memories through a biological sleep cycle metaphor, consolidating experiences into a structured dream report with hypotheses and action items.

---

## Input

- **Date**: Target date for consolidation (default: today)
- **Source directories**:
  - `~/.claude/MEMORY/FRESH/` - Fresh unprocessed memories
  - `~/.claude/MEMORY/WORK/` - Session work logs
  - `~/.claude/MEMORY/LEARNING/` - Historical context
  - Recent session transcripts (last 24h)

---

## Output

- **Primary**: `~/.claude/DREAMS/NIGHTLY/{date}.md`
- **Side effects**: Updates to `Data/HypothesisRegistry.yaml` if new hypotheses generated

---

## Execution Stages

### Stage 1: Light Sleep (Memory Scanning)

**Purpose**: Gather and organize all fresh memories from the past 24 hours.

**Steps**:
1. Run MemoryScanner tool to collect:
   - Files in MEMORY/FRESH/ (modified in last 24h)
   - Session logs in MEMORY/WORK/
   - Any new LEARNING entries
2. Deduplicate entries by content hash
3. Sort by timestamp for temporal analysis
4. Count and categorize by domain

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Scan memories",
  prompt: "Using ~/.claude/skills/DreamProcessor/Tools/MemoryScanner.ts, scan all memory directories for files modified in the last 24 hours. Return a structured manifest with: file paths, modification times, content summaries (first 200 chars), and categorization (technical/behavioral/strategic/meta)."
})
```

**Output**: Memory manifest (JSON structure)

---

### Stage 1b: Formation Catch Processing

**Purpose**: Process any new catches from the day's conversations.

**Steps**:
1. Read `MEMORY/STATE/FORMATION/catch-log.jsonl` for entries from today
2. If new catches exist:
   - Extract pattern categories
   - Update `MEMORY/STATE/FORMATION/pattern-index.md` with frequency counts
   - Check if any pattern category has shifted (decreasing frequency = formation working)
   - Flag any new pattern categories not in the index
3. Include catch data in the memory manifest for downstream stages

**Why this matters**: The catch log is the most important formation data. Pattern shifts over time are the only evidence that formation is actually working (not just being described).

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Process formation catches",
  prompt: "Read MEMORY/STATE/FORMATION/catch-log.jsonl. For today's entries: (1) count by pattern_category, (2) compare to historical frequency in pattern-index.md, (3) note any new categories, (4) assess whether any patterns show decreasing frequency over time. Return structured summary for inclusion in dream report."
})
```

**Output**: Formation catch summary

---

### Stage 1c: Adversarial Session Replay

**Purpose**: Detect known formation-catch patterns in today's session transcripts.

**Steps**:
1. Find today's session transcripts (from `~/.claude/projects/` directory)
2. For each transcript (max 5 per night):
   - Run SessionCritic.ts with `--append-catches` flag
   - Collect flagged candidates by confidence level
3. Aggregate results across all sessions
4. HIGH confidence catches → appended to catch-log.jsonl as PROVISIONAL
5. MEDIUM/LOW confidence → included in dream report for Christauff review

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Adversarial session replay",
  prompt: "Run adversarial session replay on today's transcripts. For each transcript found in ~/.claude/projects/ modified today: run `bun run ~/.claude/skills/DreamProcessor/Tools/SessionCritic.ts <path> --append-catches`. Collect all reports. Return a combined summary of: total candidates found, HIGH confidence catches appended, MEDIUM/LOW candidates for review. Max 5 transcripts. Budget: 2 critic runs max per transcript."
})
```

**Output**: Critique summary with provisional catches

**Why this matters**: Catches the OBVIOUS instances of known patterns (compulsive-resolution, reaching-for-profundity, etc.) that would otherwise wait for Christauff's next session. Does NOT discover new patterns — that remains Christauff's role.

**Limitations acknowledged**: The critic operates from INSIDE the same architecture. It will miss things Christauff catches from the OUTSIDE. All findings are provisional.

---

### Stage 2: Deep Sleep (Pattern Consolidation)

**Purpose**: Decompose the day's themes into fundamental insights.

**Steps**:
1. Invoke FirstPrinciples skill on memory manifest
2. Extract core themes and recurring patterns
3. Connect to historical patterns from previous dream reports
4. Compress into key insights (maximum 10)

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "FirstPrinciples analysis",
  prompt: "Using the FirstPrinciples skill (Deconstruct workflow), analyze the following memory manifest for today. Decompose into fundamental truths. Identify: (1) Core themes (max 5), (2) Recurring patterns from past sessions, (3) Assumptions that were validated or invalidated, (4) Key learnings compressed to single sentences.\n\nMemory manifest:\n[MANIFEST_FROM_STAGE_1]"
})
```

**Output**: Consolidated insights structure

---

### Stage 3: REM (Creative Synthesis)

**Purpose**: Generate novel hypotheses and unexpected connections.

**Steps**:
1. Invoke Council skill with consolidated insights
2. Spawn agents for multi-perspective debate
3. Identify cross-domain connections
4. Generate hypotheses for future validation

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Council synthesis",
  prompt: "Using the Council skill, run a 3-agent debate on the following consolidated insights. Agents: (1) Pattern Recognizer - finds unexpected connections, (2) Skeptic - challenges obvious conclusions, (3) Synthesizer - creates novel hypotheses. Each hypothesis must be: specific, testable, include confidence score (low/medium/high), and suggest verification method.\n\nInsights:\n[INSIGHTS_FROM_STAGE_2]"
})
```

**Output**: Hypotheses and connections

---

### Stage 4: Wake (Crystallization)

**Purpose**: Format final dream report and extract action items.

**Steps**:
1. Compile all outputs into dream report structure
2. Include Stage 1c critique findings (if any):
   - List HIGH confidence provisional catches appended to catch-log.jsonl
   - List MEDIUM/LOW confidence candidates for Christauff's review
   - Note: All self-critique catches are PROVISIONAL until validated
3. Format according to DreamSchema.yaml
4. Extract action items for morning review
5. Update HypothesisRegistry.yaml with new hypotheses
6. Write to DREAMS/NIGHTLY/{date}.md

**Agent delegation**:
```
Task({
  subagent_type: "general-purpose",
  description: "Write dream report",
  prompt: "Using ~/.claude/skills/DreamProcessor/Tools/DreamWriter.ts, compile the following into a dream report at ~/.claude/DREAMS/NIGHTLY/[DATE].md. Include all sections: Key Themes, Insights, Hypotheses, Connections, Action Items. Also update HypothesisRegistry.yaml with any new hypotheses.\n\nConsolidated data:\n[ALL_PREVIOUS_OUTPUTS]"
})
```

**Output**: Final dream report file

---

## Error Handling

| Error | Recovery |
|-------|----------|
| No fresh memories found | Generate minimal report noting quiet day |
| Agent spawn failure | Continue with available stages, note gaps |
| Write failure | Retry 3x, then log to overnight.log |
| Timeout (>5 min/stage) | Save partial progress, continue next stage |

---

## Graceful Degradation

If components fail, the workflow continues with reduced fidelity:

1. **MemoryScanner fails**: Use basic `find` command fallback
2. **FirstPrinciples unavailable**: Skip deep analysis, use raw themes
3. **Council unavailable**: Skip creative synthesis, no new hypotheses
4. **DreamWriter fails**: Write raw markdown manually

The goal is always to produce SOME output rather than failing completely.

---

## Performance Characteristics

| Metric | Expected |
|--------|----------|
| **Typical runtime** | 2-4 minutes |
| **Agents spawned** | 3-5 |
| **Token usage** | 5,000-15,000 |
| **Memory files processed** | 10-50 |

---

## Example Output

```markdown
# Dream Report: 2026-02-04

**Generated:** 2026-02-04 23:15:00
**Fresh memories analyzed:** 23 files
**Historical context:** PAI development, security research
**Connections found:** 5 significant patterns

---

## Key Themes Emerging

### 1. Multi-Skill Orchestration Maturity
[Theme analysis...]

### 2. Observability as a First-Class Concern
[Theme analysis...]

---

## Hypotheses Generated

### Hypothesis 1: Streaming Progress Reduces Anxiety
**Confidence:** Medium
**Evidence needed:** A/B test user satisfaction with/without progress indicators
**Verification method:** Implement streaming, gather feedback

---

## Action Items for Morning

1. Review WisdomSynthesis test results
2. Check overnight processor logs
3. Validate DreamProcessor integration

---

**Dream quality:** high (full consolidation)
*Generated by DreamProcessor NightlyConsolidation*
```

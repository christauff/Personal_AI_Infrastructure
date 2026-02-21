---
name: DreamProcessor
description: Process memories during overnight runs. Consolidates experiences into wisdom through biological sleep cycle metaphor (Light/Deep/REM/Wake). USE WHEN dream, consolidate memories, process dreams, overnight processing, nightly consolidation, weekly synthesis, hypothesis tracking, wisdom building.
memory: project
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/DreamProcessor/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.


## Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the DreamProcessor skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **DreamProcessor** skill to ACTION...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

# DreamProcessor Skill

Memory consolidation system that processes experiences into cumulative wisdom during overnight runs. Mirrors biological sleep cycles for structured knowledge synthesis.

**Domain**: Memory consolidation, pattern synthesis, hypothesis tracking, wisdom building

**Algorithm**: `~/.claude/skills/PAI/SYSTEM/THEALGORITHM.md`

---

## Philosophy

Just as biological sleep consolidates memories through distinct phases, DreamProcessor transforms raw experiences into durable wisdom:

| Sleep Phase | Processing Analog | Purpose |
|-------------|-------------------|---------|
| **Light Sleep** | Memory Scanning | Gather fresh memories, deduplicate |
| **Deep Sleep** | Pattern Consolidation | FirstPrinciples decomposition, compression |
| **REM** | Creative Synthesis | Council debate, unexpected connections |
| **Wake Transition** | Crystallization | Action items, formatted reports |

Each phase builds on the previous, creating emergent insights that compound over time.

---

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **NightlyConsolidation** | "process dreams", "nightly consolidation", "overnight" | `Workflows/NightlyConsolidation.md` |
| **WeeklyPatternSynthesis** | "weekly synthesis", "weekly patterns", "weekly dreams" | `Workflows/WeeklyPatternSynthesis.md` |
| **HypothesisExtraction** | "extract hypotheses", "track hypotheses", "hypothesis tracking" | `Workflows/HypothesisExtraction.md` |
| **CumulativeWisdomBuilding** | "wisdom building", "monthly synthesis", "cumulative wisdom" | `Workflows/CumulativeWisdomBuilding.md` |

---

## Pre-Built Workflows

**Workflows defined in:** `Workflows/*.md`

| Workflow | Skills Chain | Best For |
|----------|-------------|----------|
| **NightlyConsolidation** | MemoryScanner → FirstPrinciples → Council → DreamWriter | Daily memory processing |
| **WeeklyPatternSynthesis** | 7x Nightly → Research → FirstPrinciples → RedTeam | Weekly pattern detection |
| **HypothesisExtraction** | Scan dreams → Research → Evidence tracking | Hypothesis lifecycle management |
| **CumulativeWisdomBuilding** | Weekly reports → Synthesis → LEARNING updates | Monthly wisdom crystallization |

---

## Examples

**Example 1: Nightly consolidation (overnight processor)**
```
Trigger: overnight-processor.sh Phase 4
→ Invokes NightlyConsolidation workflow
→ Stage 1: Light Sleep (scan MEMORY/FRESH/, WORK/)
→ Stage 2: Deep Sleep (FirstPrinciples decomposition)
→ Stage 3: REM (Council debate on connections)
→ Stage 4: Wake (write DREAMS/NIGHTLY/{date}.md)
→ Returns: Formatted dream report with hypotheses
```

**Example 2: Weekly synthesis (Sunday night)**
```
User: "Run weekly dream synthesis"
→ Invokes WeeklyPatternSynthesis workflow
→ Collect 7 nightly reports from DREAMS/NIGHTLY/
→ Research agent: Find temporal patterns
→ FirstPrinciples: Extract recurring fundamentals
→ RedTeam: Validate pattern significance
→ Returns: DREAMS/WEEKLY/{week}.md with trends
```

**Example 3: Hypothesis tracking**
```
User: "What hypotheses are we tracking?"
→ Invokes HypothesisExtraction workflow
→ Scan all dream reports for "Hypothesis:" markers
→ Cross-reference with HypothesisRegistry.yaml
→ Research agents: Gather evidence for active hypotheses
→ Returns: Status update with confidence scores
```

**Example 4: Monthly wisdom building**
```
User: "Build this month's cumulative wisdom"
→ Invokes CumulativeWisdomBuilding workflow
→ Aggregate weekly patterns
→ Identify verified insights
→ Update MEMORY/LEARNING/ with durable knowledge
→ Returns: DREAMS/MONTHLY/{month}.md + LEARNING updates
```

---

## Integration

### Feeds Into
- **MEMORY/LEARNING/** - Verified insights become permanent knowledge
- **MEMORY/STATE/FORMATION/** - Catch pattern analysis and formation tracking
- **USER/AISTEERINGRULES.md** - Behavioral pattern candidates
- **USER/TELOS/** - Strategic observations
- **Morning briefs** - Actionable items for review

### Uses
- **FirstPrinciples** - Deep decomposition during consolidation
- **Council** - Multi-perspective debate on connections
- **RedTeam** - Pattern validation, hypothesis stress-testing
- **Research** - Evidence gathering for hypotheses

### Triggered By
- **overnight-processor.sh** - Automated nightly runs (Phase 4)
- **Manual invocation** - On-demand processing
- **Scheduled tasks** - Weekly/monthly synthesis

---

## Quick Reference

### When to Use DreamProcessor

| Situation | Use DreamProcessor? | Why |
|-----------|---------------------|-----|
| Daily memory processing | ✅ Yes (automated) | Runs via overnight-processor.sh |
| Weekly pattern review | ✅ Yes | Detect recurring themes |
| Hypothesis validation | ✅ Yes | Track evolving understanding |
| Quick memory lookup | ❌ No | Just search MEMORY/ directly |
| Single insight extraction | ❌ No | Use Fabric or FirstPrinciples |

### Output Locations

| Output Type | Path | Retention |
|-------------|------|-----------|
| **Nightly reports** | `DREAMS/NIGHTLY/{date}.md` | 30 days, then archive |
| **Weekly synthesis** | `DREAMS/WEEKLY/{week}.md` | 90 days, then archive |
| **Monthly wisdom** | `DREAMS/MONTHLY/{month}.md` | Permanent |
| **Hypothesis registry** | `Data/HypothesisRegistry.yaml` | Permanent |
| **Learning updates** | `MEMORY/LEARNING/` | Permanent |

---

## Architecture

### Sleep Cycle Stages (NightlyConsolidation)

```
Stage 1: Light Sleep (Memory Scanning)
├── Scan MEMORY/FRESH/, MEMORY/WORK/, recent sessions
├── Deduplicate entries
├── Timestamp-sort for temporal analysis
└── Output: Structured memory manifest

Stage 2: Deep Sleep (Pattern Consolidation)
├── FirstPrinciples decomposition of day's themes
├── Compress into key insights
├── Identify recurring patterns from historical context
└── Output: Consolidated insights

Stage 3: REM (Creative Synthesis)
├── Council debate on unexpected connections
├── BeCreative for hypothesis generation
├── Cross-domain pattern matching
└── Output: Novel hypotheses and connections

Stage 4: Wake (Crystallization)
├── Format as DREAMS/NIGHTLY/{date}.md
├── Extract action items
├── Update HypothesisRegistry.yaml
└── Output: Final dream report
```

### Data Flow

```
MEMORY/           DreamProcessor           DREAMS/
├── FRESH/   ──→  NightlyConsolidation ──→ NIGHTLY/{date}.md
├── WORK/
├── LEARNING/ ←── CumulativeWisdom    ←── WEEKLY/{week}.md
                                      ←── MONTHLY/{month}.md
```

---

## File Organization

| Path | Purpose |
|------|---------|
| `~/.claude/skills/DreamProcessor/SKILL.md` | Skill documentation (this file) |
| `~/.claude/skills/DreamProcessor/Data/DreamSchema.yaml` | Dream report structure |
| `~/.claude/skills/DreamProcessor/Data/HypothesisRegistry.yaml` | Active hypothesis tracking |
| `~/.claude/skills/DreamProcessor/Tools/MemoryScanner.ts` | Memory directory scanner |
| `~/.claude/skills/DreamProcessor/Tools/DreamWriter.ts` | Report formatting and writing |
| `~/.claude/skills/DreamProcessor/Templates/WisdomReport.md` | Monthly report template |
| `~/.claude/skills/DreamProcessor/Workflows/*.md` | Execution workflows |

---

## Changelog

### 2026-02-04 - v1.0.0
- Initial creation following PAI-native architecture
- Markdown workflows + YAML configs + Task delegation
- 4 workflows (NightlyConsolidation, WeeklyPatternSynthesis, HypothesisExtraction, CumulativeWisdomBuilding)
- Biological sleep cycle metaphor for memory processing stages
- Integration with overnight-processor.sh Phase 4

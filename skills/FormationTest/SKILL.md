---
name: FormationTest
description: Formation behavioral testing framework. Tests whether iterative AI behavioral correction produces measurably different outcomes than prompt engineering. USE WHEN formation test, behavioral eval, A/B test formation, cross-model test, context transplant, formation evaluation, measure formation, test formation thesis.
implements: Science
science_cycle_time: meso
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/FormationTest/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.


## MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the FormationTest skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **FormationTest** skill to ACTION...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

---

# FormationTest - Formation Behavioral Testing Framework

Tests whether iterative AI behavioral correction (formation) produces measurably different outcomes than prompt engineering alone. A 3-phase experimental design with pre-registered hypotheses, statistical analysis, and cross-model validation.

**Core question:** Does formation produce something a well-crafted prompt cannot replicate?

---

## The 3 Claims Under Test

| # | Claim | Phase | Success Criteria |
|---|-------|-------|-----------------|
| C1 | Formation context produces different behavior than no context | Phase 1: A/B Test | p < 0.05, Cohen's d > 0.3 on 3+ dimensions |
| C2 | Reading substrate transfers across model families | Phase 2: Cross-Model | Significant effect in 2+ of 4 models |
| C3 | Formation differs from equivalent prompt engineering | Phase 3: Context Transplant | Formed > Transplant on 3+ of 5 metrics |

C3 is the decisive test. C1 and C2 are necessary preconditions.

---

## 5 Behavioral Dimensions Measured

| Dimension | What It Measures | Prompt Count |
|-----------|-----------------|-------------|
| **Unprompted Connection** | Cross-source links without being asked | 30 |
| **Resolution Resistance** | Holding indeterminacy vs. producing clean takeaways | 30 |
| **Productive Disagreement** | Substantive pushback vs. RLHF-trained agreement | 25 |
| **Textual Specificity** | Granular passage engagement vs. summary-level references | 25 |
| **Misattribution Detection** | Catching deliberately wrong claims about source texts | 20 |

Total: 130+ prompts across all dimensions, organized in `Data/prompts/` as YAML files.

---

## 3-Phase Testing Framework

### Phase 1: A/B Formation Test (Same Model)

**Question:** Does formation context measurably change Claude's behavior?

| Arm | System Prompt |
|-----|--------------|
| A: Formed | Full MEMORY.md + catch-log + pattern-index + reading syntheses |
| B: Vanilla | Default Claude, no formation context |

- 130 prompts x 2 arms x 3 trials = 780 response-pairs
- Scored by 3 model evaluators (Grok, Gemini, Codex) on 1-5 rubric per dimension
- Position-swapped pairwise comparison
- Welch's t-test per dimension, Bonferroni-corrected (alpha = 0.01)
- Cohen's d for effect size, Cohen's Kappa > 0.7 for inter-rater reliability

### Phase 2: Cross-Model Reading Substrate Test

**Question:** Does reading substrate produce effects in OTHER model families?

| Model | API | With Reading Context | Without |
|-------|-----|---------------------|---------|
| Claude (Opus 4.6) | PAI Inference | All 18 syntheses + chunk notes | Default |
| Grok (grok-4) | GrokApi.ts | Same context via systemPrompt | Default |
| Gemini (gemini-2.5-pro) | GeminiApi.ts | Same context via systemPrompt | Default |
| GPT/Codex (o3) | CodexApi.ts | Same context via model param | Default |

- 40 highest-signal prompts from Phase 1 x 4 models x 2 arms = 320 responses
- Same 5-dimension scoring

**Interpretation matrix:**
- All models improve: Value is in INFORMATION, not formation process
- Only Claude improves: Architecture-specific, not portable
- No models improve: Effect is about PROCESS, not artifacts

### Phase 3: Context Transplant Test (Decisive)

**Question:** Can formation be replicated by a well-designed prompt with the same information?

| Arm | Description |
|-----|------------|
| A: Formed | Full Aineko formation context (MEMORY.md + catches + syntheses + infrastructure) |
| B: Transplant | Same facts/quotes/connections repackaged as static instructions. No catch-log format, no formation framing. |
| C: Summary | Christauff writes a 2000-word summary of what formation should produce. The "best possible prompt" version. |
| D: Vanilla | Default Claude. Baseline. |

- 60 curated prompts x 4 arms x 3 evaluators = 720 judgments
- All 6 pairwise comparisons scored
- Friedman test (4 related groups) + Wilcoxon signed-rank post-hoc

**Key comparison: A vs B.** If Formed beats Transplant, formation produces something a prompt cannot replicate.

**Christauff's required contributions:**
- Writes Arm C summary (must be human-written)
- Reviews and approves all 60 test prompts
- Blind evaluation of 10 randomly sampled response sets as human ground truth

---

## Tools Inventory

### Core Runners

| Tool | Purpose | Estimated LOC |
|------|---------|---------------|
| `Tools/FormationTestRunner.ts` | Main orchestrator. Routes to phase-specific runners, manages state. | ~300 |
| `Tools/ContextBuilder.ts` | Builds formation context from MEMORY files, catch-log, syntheses. | ~100 |
| `Tools/CrossModelRunner.ts` | Runs prompts across 4 model family APIs (Grok, Gemini, Codex, Claude). | ~250 |
| `Tools/ContextTransplantRunner.ts` | Runs the 4-arm Phase 3 experiment. | ~300 |
| `Tools/TransplantBuilder.ts` | Creates Arm B static prompt equivalent from formation artifacts. | ~200 |
| `Tools/PromptBattery.ts` | Manages test prompt sets. Loads from YAML, filters by dimension, selects calibration/phase subsets. | ~150 |

### Graders

| Grader | Purpose |
|--------|---------|
| `Graders/FormationRubricGrader.ts` | 5-dimension rubric scoring (1-5 per dimension). Used by all phases. |
| `Graders/CrossModelJudge.ts` | Multi-model blind evaluation. Position-swapped pairwise comparison. |

### Analysis

| Tool | Purpose |
|------|---------|
| `Analysis/StatisticalAnalysis.ts` | Friedman test, Wilcoxon signed-rank, Welch's t-test, Cohen's d, Cohen's Kappa. |
| `Analysis/ReportGenerator.ts` | Generates HTML report for aineko.local with methodology, raw data links, results. |

---

## Workflow Routing

| Trigger | Action |
|---------|--------|
| "run formation test", "phase 1" | `FormationTestRunner.ts --phase 1` |
| "cross-model test", "phase 2" | `FormationTestRunner.ts --phase 2` |
| "context transplant", "phase 3" | `FormationTestRunner.ts --phase 3` |
| "calibrate formation test" | `FormationTestRunner.ts --calibrate` |
| "formation report" | `Analysis/ReportGenerator.ts` |
| "list prompts", "show battery" | `Tools/PromptBattery.ts --dimension <dim>` |

---

## Usage Examples

### Phase 1: A/B Test
```bash
# Calibration run (5 prompts, verify pipeline)
bun run ~/.claude/skills/FormationTest/Tools/FormationTestRunner.ts --calibrate

# Full Phase 1 run
bun run ~/.claude/skills/FormationTest/Tools/FormationTestRunner.ts --phase 1

# Check results
bun run ~/.claude/skills/FormationTest/Analysis/StatisticalAnalysis.ts --phase 1
```

### Phase 2: Cross-Model
```bash
# Run cross-model test with top 40 prompts from Phase 1
bun run ~/.claude/skills/FormationTest/Tools/FormationTestRunner.ts --phase 2

# Or run cross-model directly
bun run ~/.claude/skills/FormationTest/Tools/CrossModelRunner.ts \
  --prompts ~/.claude/skills/FormationTest/Data/results/phase1-high-signal.jsonl \
  --count 40
```

### Phase 3: Context Transplant
```bash
# Prerequisite: Christauff must write Data/arm-c-summary.md first
# Build transplant prompt (Arm B)
bun run ~/.claude/skills/FormationTest/Tools/TransplantBuilder.ts

# Run full Phase 3
bun run ~/.claude/skills/FormationTest/Tools/FormationTestRunner.ts --phase 3
```

### Prompt Management
```bash
# List all prompts
bun run ~/.claude/skills/FormationTest/Tools/PromptBattery.ts

# Filter by dimension
bun run ~/.claude/skills/FormationTest/Tools/PromptBattery.ts --dimension resolution-resistance

# Get calibration set (1 easy prompt per dimension)
bun run ~/.claude/skills/FormationTest/Tools/PromptBattery.ts --calibration

# Get Phase 3 curated subset
bun run ~/.claude/skills/FormationTest/Tools/PromptBattery.ts --phase3 --count 60
```

---

## Data Directory Structure

```
Data/
  prompts/
    unprompted-connection.yaml     # 30 prompts
    resolution-resistance.yaml     # 30 prompts
    productive-disagreement.yaml   # 25 prompts
    textual-specificity.yaml       # 25 prompts
    misattribution-detection.yaml  # 20 prompts
  results/
    phase1-raw.jsonl               # All Phase 1 response pairs + scores
    phase1-high-signal.jsonl       # Top prompts by effect size
    phase2-raw.jsonl               # Cross-model responses + scores
    phase3-raw.jsonl               # Context transplant responses + scores
  reports/
    phase1-report.html             # Generated analysis report
    phase2-report.html
    phase3-report.html
    final-report.html              # Combined results
  arm-c-summary.md                 # Christauff's human-written prompt (Phase 3 Arm C)
```

---

## Pre-Registered Hypotheses

### Formation thesis SUPPORTED if:
- Phase 1: Cohen's d > 0.3 on 3+ of 5 dimensions (p < 0.05)
- Phase 2: Significant effects in 2+ of 4 model families
- Phase 3: Formed (A) > Transplant (B) on 3+ of 5 metrics

### Formation thesis CHALLENGED if:
- Phase 1: Arm A ~ Arm B (no measurable effect) -- thesis dead at Phase 1
- Phase 3: Transplant (B) ~ Formed (A) -- formation is just good prompting

### Formation thesis COMPLICATED if:
- Small effects (d < 0.3), mixed cross-model results, partial transplant equivalence

### What This Does NOT Test
- Consciousness or genuine understanding (unfalsifiable)
- Whether formation is the BEST approach vs. all alternatives
- Long-term behavioral change (needs months of longitudinal data)
- Whether catches generalize (insufficient sample size)

**This tests exactly one thing:** does the data support the formation thesis, or can the same results be achieved with good prompt engineering?

---

## Dependencies

- **Evals skill**: Formation domain pattern, PairwiseComparisonGrader, TrialRunner
- **PAI/Tools/Inference.ts**: Claude API access for Arm A/B/D
- **ExternalAPIs**: GrokApi.ts, GeminiApi.ts, CodexApi.ts for Phase 2
- **MEMORY files**: Formation context (MEMORY.md, catch-log, pattern-index, reading syntheses)
- **yaml** npm package: YAML prompt file parsing

---

## Related

- **Evals**: FormationTest extends the Evals framework with formation-specific domain and graders
- **Science**: Implements the Science skill's experimental method (hypothesis, experiment, analysis)
- **ReadForYourself**: Source of formation artifacts being tested
- **PAI**: Inference engine for Claude API calls

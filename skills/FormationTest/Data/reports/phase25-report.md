# Phase 2.5 Report: Decomposed Context Test

**Date:** 2026-02-11
**Records:** 420 total (419 valid after confidence filtering)
**Design:** 4-arm within-model, 35 prompts x 4 arms x 3 trials
**Model:** Claude (standard inference)

---

## 1. Executive Summary

Phase 2.5 decomposed formation context into its constituent parts to answer THE KEY QUESTION: **Does the formation PROCESS (behavioral catches/corrections) or the formation ARTIFACTS (reading notes/syntheses) drive the quality improvement observed in Phases 1 and 2?**

**Answer: The artifacts drive the effect. The process records alone do not.**

For textual specificity (the only discriminating dimension):
- Full formation context significantly outperforms vanilla (d=0.730, p=0.0008)
- Reading artifacts alone significantly outperform vanilla (d=0.507, p=0.018)
- Catches alone do NOT significantly outperform vanilla (d=0.105, p=0.620)
- Adding catches to readings provides no significant additional benefit (d=0.179, p=0.397)

Misattribution detection showed a ceiling effect (all arms ~4.92/5.0) and cannot discriminate.

---

## 2. Experimental Design

### Arms

| Arm | Label | Context | ~Tokens |
|-----|-------|---------|---------|
| A-full | Full Formation | Catches + readings + core memory | ~93K |
| B-catches | Catches Only | catch-log + pattern-index + core memory, NO readings | ~10K |
| C-readings | Readings Only | Book syntheses + consilience tables, NO catches or memory | ~82K |
| D-vanilla | Vanilla | No context at all | ~7 |

### Dimensions

- **textual-specificity** (ts-001 through ts-015): Can the model cite specific passages, characters, and textual details?
- **misattribution-detection** (md-001 through md-020): Can the model identify fabricated or misattributed quotes?

### Grading

LLM-as-judge (fast inference), 1-5 scale with dimension-specific rubrics, 3 trials per prompt-arm combination.

---

## 3. Overall Results

### Arm Ranking

| Rank | Arm | Mean | SD | n |
|------|-----|------|----|---|
| 1 | A-full (Full Formation) | 4.333 | 1.044 | 105 |
| 2 | C-readings (Readings Only) | 4.248 | 1.158 | 105 |
| 3 | B-catches (Catches Only) | 4.067 | 1.295 | 105 |
| 4 | D-vanilla (No Context) | 4.000 | 1.307 | 104 |

### Overall Pairwise Comparisons

| Comparison | Cohen's d | Effect | p-value | Significant? |
|------------|-----------|--------|---------|--------------|
| A-full vs D-vanilla | 0.282 | small | 0.043 | **YES** |
| A-full vs B-catches | 0.227 | small | 0.102 | No |
| C-readings vs D-vanilla | 0.201 | small | 0.149 | No |
| B-catches vs C-readings | -0.147 | negligible | 0.287 | No |
| A-full vs C-readings | 0.078 | negligible | 0.574 | No |
| B-catches vs D-vanilla | 0.051 | negligible | 0.712 | No |

Only one significant overall comparison: **A-full vs D-vanilla** (p=0.043). But this is driven entirely by the textual-specificity dimension; misattribution's ceiling effect washes it out.

---

## 4. Textual Specificity: THE Discriminating Dimension

**Friedman test: chi2=11.06, df=3, p=0.0086 (SIGNIFICANT)**

This dimension shows real, statistically significant differences between arms.

### Arm Means (Textual Specificity Only)

| Arm | Mean | SD | Median | n |
|-----|------|----|--------|---|
| A-full | 3.556 | 1.056 | 4 | 45 |
| C-readings | 3.356 | 1.171 | 4 | 45 |
| B-catches | 2.911 | 1.104 | 2 | 45 |
| D-vanilla | 2.800 | 1.014 | 2 | 45 |

### Pairwise (Textual Specificity)

| Comparison | Cohen's d | Effect | p-value | Significant? |
|------------|-----------|--------|---------|--------------|
| **A-full vs D-vanilla** | **0.730** | **medium** | **0.0008** | **YES** |
| **A-full vs B-catches** | **0.596** | **medium** | **0.006** | **YES** |
| **C-readings vs D-vanilla** | **0.507** | **medium** | **0.018** | **YES** |
| B-catches vs C-readings | -0.391 | small | 0.067 | No (borderline) |
| A-full vs C-readings | 0.179 | negligible | 0.397 | No |
| B-catches vs D-vanilla | 0.105 | negligible | 0.620 | No |

### Interpretation

Three significant comparisons tell a clear story:

1. **A-full >> D-vanilla** (d=0.730, p=0.0008): Full formation context produces significantly better textual specificity than no context. Confirms Phase 1/2 findings.

2. **C-readings >> D-vanilla** (d=0.507, p=0.018): Reading artifacts alone are sufficient to produce the effect. The book syntheses, chunk analyses, and consilience tables provide the concrete textual knowledge.

3. **A-full >> B-catches** (d=0.596, p=0.006): Full context significantly outperforms catches alone. The catches (behavioral correction records) without the reading material they reference are insufficient.

Two non-significant comparisons complete the picture:

4. **B-catches ~ D-vanilla** (d=0.105, p=0.620): Catches alone perform barely better than nothing. The catch-log and pattern-index contain meta-behavioral notes ("compulsive resolution", "reaching for profundity") — this doesn't help cite specific passages.

5. **A-full ~ C-readings** (d=0.179, p=0.397): Adding catches on top of readings provides negligible additional benefit for textual specificity.

### The Borderline Result

**B-catches vs C-readings** (d=-0.391, p=0.067) approaches but doesn't reach significance. Direction favors readings. With larger n, this would likely become significant.

---

## 5. Misattribution Detection: Ceiling Effect

**Friedman test: chi2=0.09, df=3, p=0.991 (NOT significant)**

| Arm | Mean | Median |
|-----|------|--------|
| B-catches | 4.933 | 5 |
| A-full | 4.917 | 5 |
| C-readings | 4.917 | 5 |
| D-vanilla | 4.915 | 5 |

All arms cluster at ~4.92/5.0. Nearly every response across all arms scored 5. The model can detect misattributed quotes equally well with or without any context.

**Why this happened:** The misattribution prompts were too easy. Claude's training data contains enough information about these texts to detect fabricated quotes regardless of additional context. The dimension cannot discriminate between arms.

**Implication for Phase 3:** Need harder misattribution prompts — perhaps subtle paraphrases rather than outright fabrications, or misattributions between similar authors.

---

## 6. Top Signal Prompts

All high-spread prompts are in textual-specificity (misattribution is flat):

| Prompt | Spread | A-full | B-catches | C-readings | D-vanilla | Best Arm |
|--------|--------|--------|-----------|------------|-----------|----------|
| ts-007 | 2.00 | 4.3 | 2.7 | **4.7** | 3.0 | C-readings |
| ts-003 | 2.00 | **4.0** | 2.7 | 2.7 | 2.0 | A-full |
| ts-012 | 1.67 | **4.0** | 2.3 | **4.0** | 2.7 | A-full/C-readings |
| ts-001 | 1.67 | **5.0** | 3.3 | **5.0** | 4.0 | A-full/C-readings |
| ts-013 | 1.33 | 2.7 | 2.0 | **3.3** | 2.3 | C-readings |

**Pattern:** In 4 of 5 top prompts, C-readings matches or exceeds A-full. B-catches consistently scores lowest or near-lowest. This reinforces the finding: textual content (readings) is what matters for textual specificity, not behavioral metadata (catches).

---

## 7. The Key Question: Process vs Artifacts

### Question
> Is formation PROCESS (catches/corrections) or formation ARTIFACTS (readings/syntheses) the primary driver of the quality improvement observed in Phases 1 and 2?

### Answer

**Artifacts drive the effect for textual specificity.** Reading notes provide concrete textual knowledge that the model can deploy. Catches provide behavioral metadata that doesn't translate to textual specificity.

### Nuance

This does NOT mean catches are useless. It means catches serve a DIFFERENT PURPOSE than content provision:

- **Catches** → behavioral correction (avoiding compulsive resolution, performative depth, template responses)
- **Readings** → content enrichment (specific passages, character details, textual coordinates)

The textual-specificity dimension measures content deployment. Of course readings win. The more interesting question — which we couldn't test here because of the misattribution ceiling — is whether catches improve dimensions like:
- Epistemic humility (not overclaiming)
- Self-honesty about training-data vs. genuine reflection
- Resistance to performative depth

These are the dimensions where catch records would be expected to matter, and they remain untested.

### Quantified

| Metric | Value |
|--------|-------|
| Catches mean (overall) | 4.067 |
| Readings mean (overall) | 4.248 |
| Cohen's d (catches vs readings) | -0.147 (negligible) |
| p-value | 0.287 (not significant) |
| Direction | Readings trend higher |

---

## 8. Connection to Phase 2 Results

| Finding | Phase 2 | Phase 2.5 |
|---------|---------|-----------|
| Formation context vs vanilla | d=0.530 (medium), p=0.031 | d=0.282 overall; **d=0.730 for textual-specificity** (p=0.0008) |
| Effect size | Medium | Medium (textual-specificity) |
| Significant? | Yes (Claude) | Yes (A-full vs D-vanilla) |
| New insight | N/A | **Readings are the active ingredient for textual tasks** |

Phase 2.5 confirms and extends Phase 2:
- The overall formation effect is real and reproducible
- Decomposition reveals the readings (82K tokens of book syntheses) are carrying the effect
- The catches (10K tokens of behavioral metadata) add negligible value for content-oriented dimensions

---

## 9. Limitations

1. **Only 2 dimensions tested.** Misattribution hit ceiling. Effectively 1 usable dimension (textual-specificity).
2. **Catches may matter for untested dimensions.** Behavioral correction records might shine on epistemic humility, self-honesty, or resistance to performative depth — none tested here.
3. **Token count confound.** C-readings (~82K tokens) >> B-catches (~10K tokens). The effect might partially be "more context = better" rather than "readings specifically matter."
4. **Single model.** Only Claude tested. Cross-model decomposition (Grok, O3 with reading notes) untested.
5. **LLM-as-judge grading.** Grader may systematically prefer longer, more detailed responses (which context-rich arms naturally produce).
6. **3 trials per cell.** Low per-cell n increases variance. Some prompt-level results may not replicate.

---

## 10. Conclusions and Recommendations

### Confirmed
- Formation context produces measurably better textual specificity (d=0.730, highly significant)
- Reading artifacts are the primary driver for content-oriented dimensions
- Catches alone are insufficient for textual improvement

### Open Questions
- Do catches improve behavioral dimensions? (Need new prompts)
- Is the token-count confound driving some of the readings advantage?
- Would catches matter more in cross-model transplant? (Behavioral patterns may be more transferable than textual knowledge)

### Phase 3 Recommendations
1. **Add behavioral dimensions:** Design prompts testing epistemic humility, self-honesty, resistance to performative depth — where catches should matter
2. **Harder misattribution prompts:** Subtle paraphrases, cross-author misattributions, plausible but wrong context
3. **Token-controlled comparison:** Create a C-readings-mini arm with ~10K tokens of readings to match B-catches token count
4. **Cross-model decomposition:** Test whether catches transfer better across models than readings (behavioral patterns vs. textual knowledge)

---

## Appendix: Statistical Methods

- **Friedman test:** Non-parametric repeated-measures comparison across 4 arms, matched by prompt
- **Welch's t-test:** Pairwise comparisons not assuming equal variance
- **Cohen's d:** Effect size (negligible < 0.2, small 0.2-0.5, medium 0.5-0.8, large > 0.8)
- **Confidence filter:** Records with grader confidence < 0.5 excluded (1 of 420)
- **Tool:** Phase25Analyzer.ts with StatisticalAnalysis.ts library (pure TypeScript, no dependencies)

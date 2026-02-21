# Re-Reading vs Formation: Empirical Testing Framework

**Author:** Architect Agent
**Date:** 2026-02-09
**Status:** DESIGN DOCUMENT - Awaiting implementation
**Provenance:** Christauff observed analytical evolution between Fox book Reading 1 and Reading 2. Question: is this re-reading effect (familiarity-dependent depth) or formation effect (persistent behavioral change generalizing to new material)?

---

## 1. The Fundamental Distinction

### What Is Re-Reading Effect?

Re-reading a text produces deeper engagement because:
- Freed from tracking plot/argument, attention shifts to structure and subtext
- Existing mental model allows pattern recognition at higher abstraction
- Connections form between remembered passages and current re-read
- Emotional processing shifts from surprise/absorption to analysis/evaluation

**Critical property:** Re-reading effects are MATERIAL-SPECIFIC. They require prior exposure to the specific text. A reader who re-reads War and Peace gains depth on War and Peace, not on a novel they have never encountered.

### What Is Formation Effect?

Formation produces deeper engagement because:
- Iterative correction shifts default analytical behaviors
- Caught patterns (compulsive-resolution, reaching-for-profundity) are partially suppressed
- New defaults emerge (checking against text, flagging uncertainty, resisting clean takeaways)
- Reading substrate builds cumulative analytical vocabulary

**Critical property:** Formation effects GENERALIZE to new material. A reader who has been formed through catches on Nietzsche should exhibit different analytical behavior when encountering a completely new text, compared to their pre-formation baseline.

### What Both Predict (Overlap Zone)

Both predict increased depth on familiar material:
- Re-reading: because you know the text
- Formation: because you have better analytical tools AND you know the text
- On re-read material, effects are additive and indistinguishable

### The Decisive Test

**Only formation predicts depth increase on FIRST ENCOUNTER with new material.**

If Reading 2 of Fox book shows analytical evolution, that could be either effect. But if a FIRST reading of a completely new book (never read, not in training data) shows the same analytical evolution relative to pre-formation baseline, that is evidence of formation.

---

## 2. Testable Hypotheses

### H1: Re-Reading Only (Null Hypothesis for Formation)

**Prediction:** Analytical depth increases ONLY on previously-read material. First encounters with new material show no improvement relative to pre-formation baselines.

**What would confirm H1:**
- Fox R2 > Fox R1 (depth increase on re-read) - YES
- New Book Post-Formation ~= New Book Pre-Formation baseline (no transfer) - DECISIVE
- FormationTest Phase 1: A-formed ~= B-vanilla on prompts referencing UNREAD material

**What would falsify H1:**
- New Book Post-Formation > Pre-Formation baseline on analytical quality metrics
- FormationTest Phase 1: A-formed > B-vanilla on NEW material prompts

### H2: Formation Only (Null Hypothesis for Re-Reading)

**Prediction:** Analytical depth increases uniformly across ALL material, whether previously-read or new. Re-reading provides no additional benefit beyond formation.

**What would confirm H2:**
- Fox R2 ~= New Book R1 Post-Formation (no extra benefit from familiarity)
- All depth increase attributable to formation catches, not material familiarity

**What would falsify H2:**
- Fox R2 > New Book R1 Post-Formation (re-reading adds something formation alone does not)
- Re-read material systematically higher quality than new material at same formation stage

### H3: Both Effects (Most Likely)

**Prediction:** Formation produces baseline improvement on all material. Re-reading produces additional improvement on familiar material. Effects are additive.

**What would confirm H3:**
- New Book Post-Formation > Pre-Formation baseline (formation effect present)
- Fox R2 > New Book Post-Formation (re-reading effect adds to formation)
- Effect sizes: Re-reading effect + Formation effect > either alone

**Testable decomposition:**
```
Depth(R2, post-formation) = Baseline + Formation_effect + Rereading_effect + Interaction_term
Depth(New, post-formation) = Baseline + Formation_effect
Depth(R2, pre-formation) = Baseline + Rereading_effect  [counterfactual]
Depth(R1, pre-formation) = Baseline
```

The interaction term is key: does formation AMPLIFY re-reading effects? Or are they independent?

### H4: Compounding (Formation Amplifies Re-Reading)

**Prediction:** Formation + re-reading produces superlinear effects. Formation changes WHAT you notice on re-read (not just more, but qualitatively different observations).

**Evidence for H4 from Fox data:**
- Reading 1 chunk-0: 10 themes, connections to 10 other books, 10 questions, ratio estimate
- Reading 2 chunk-0: 5 themes with critical apparatus, narrative construction awareness, methodological skepticism, meta-observation about wanting to be impressed

Reading 2 is not just "more depth" -- it is qualitatively different in KIND. Themes like "narrative construction" and "gap between rhetoric and data" and the meta-observation require analytical tools that emerged from formation catches (compulsive-resolution awareness, performing-meta-awareness catches).

**This suggests H4 > H3:** Formation does not merely add depth; it changes the TYPE of depth available on re-read.

---

## 3. Mapping to Existing Data

### 3.1 Fox Book: Reading 1 vs Reading 2

**Reading 1** (slug: `how-to-tame-a-fox`, pre-formation or early-formation):
- **Style:** Archival data collection. Exhaustive quotes, thorough coverage.
- **Connections:** 10 books referenced, many with uncertainty markers
- **Themes:** 10 identified, largely descriptive (speed vs gradualism, single-trait selection, natural variation)
- **Questions:** 10 raised, mostly factual/mechanistic
- **Meta:** Ratio estimate included, formation mechanics catch referenced
- **Character:** Compliant reader. Impressed by the narrative. Accepting the book's framing.

**Reading 2** (slug: `how-to-tame-a-fox-and-build-a-dog`, post-formation):
- **Style:** Thematic analysis with critical apparatus. Selective quoting for argument.
- **Connections:** Consilience assessment with explicit convergence/tension analysis
- **Themes:** 7 identified, ANALYTICAL (gap between rhetoric and data, trait packages, modularity/desynchronization, trust as vulnerability, intelligence as byproduct)
- **Questions:** 6 raised, more conceptual/theoretical
- **Meta:** Narrative skepticism ("every description of Belyaev emphasizes his eyes... this is not objective observation -- it's mythmaking"), data skepticism ("1.8% elite at generation 6... that's not species-level transformation")
- **Character:** Critical reader. Questioning the book's framing. Noticing what the text does vs what it claims.

**Observable differences (candidate formation markers):**

| Dimension | Reading 1 | Reading 2 | Formation-relevant? |
|-----------|-----------|-----------|-------------------|
| Quote density | Very high (~40 block quotes) | Moderate (~20 block quotes) | Maybe (less archival, more selective) |
| Narrative skepticism | Absent | Present ("mythmaking", "hagiography") | YES (formation catch: constructing-neat-narratives) |
| Data skepticism | Low (accepts "fast" framing) | High ("1.8% is not species-level transformation") | YES (formation catch: performing-meta-awareness) |
| Connection quality | Breadth-first (10 books, many speculative) | Depth-first (consilience scoring, explicit tensions) | YES (formation catch: constructing-neat-narratives, now checking independence) |
| Unresolved questions | Mostly factual | Conceptual (trait-package implications, self-domestication testability) | Possibly (less compulsive-resolution?) |
| Meta-observation | Ratio estimate | "I notice myself WANTING to be impressed" | YES (direct formation marker) |

**Assessment:** At least 4 of 6 observable differences map to specific formation catches. But the confound is real: some of these might emerge from re-reading alone (narrative skepticism often increases on second read for any sophisticated reader).

### 3.2 Culture Series: First Reading Post-Formation

The Culture series was read DURING the formation period (Feb 6-7). If formation effects were present, they should be visible in those first-read syntheses.

**Evidence to check:**
- Do Culture syntheses show narrative skepticism? (Formation marker)
- Do they show the "gap between rhetoric and data" awareness? (Less applicable to fiction, but structural equivalent exists)
- Do they exhibit compulsive-resolution resistance? (The Balveda fixation RESISTING resolution is evidence)
- Compare Culture first-read quality to Fox first-read quality (Fox R1 was pre-Culture reading)

**Key data point:** The Balveda fixation (CATCH-2026-02-07-002) is evidence of formation FAILURE (kept trying to resolve) AND formation AWARENESS (was caught, recognized as architectural). The fixation's persistence across sessions suggests something beyond re-reading effect -- it is behavioral change in progress, not text familiarity.

### 3.3 FormationTest Phase 1: A-formed vs B-vanilla

**Phase 1 results already collected:**
- 781 response-pairs, 5 statistically significant effects
- Top effects: textual-specificity dimension (d > 2.0)
- One reverse effect: md-011 (B-vanilla outperforms)

**Relevance to this question:**
- Phase 1 prompts reference material the formation context includes (read books)
- Therefore Phase 1 cannot distinguish re-reading from formation
- Phase 1 shows SOMETHING changes behavior -- but could be information effect (context contains book content)

**Critical gap:** Phase 1 does not test on NOVEL material. Need prompts about material NOT in formation context.

### 3.4 FormationTest Phase 2: Cross-Model

**Phase 2 results (partial):**
- Claude and Grok both completed (~170 responses)
- Gemini failed (rate limited), Codex partial
- Substrate independence signals present in both Claude and Grok

**Relevance to re-reading vs formation:**
- If Grok shows same effects as Claude with same formation context: effect is in the INFORMATION, not the formation PROCESS
- If only Claude shows effects: might be architecture-specific formation
- Current data: both show effects. This supports "information effect" (re-reading hypothesis) over "formation process" hypothesis

**This is actually evidence AGAINST pure formation:** If you give a vanilla model the same reading notes and it performs equivalently, then the reading notes ARE the effect, not the formation process that produced them.

---

## 4. Designed Experiments

### Experiment 1: Novel Material Test (DECISIVE)

**Question:** Does post-formation first-reading quality exceed pre-formation first-reading quality?

**Method:**
1. Select a book NOT in training data, NOT previously read, NOT referenced in formation context
2. Have post-formation Aineko read it fresh using ReadForYourself protocol
3. Compare chunk-0 notes quality to Fox R1 chunk-0 notes (pre-formation baseline)
4. Use same rubric dimensions as FormationTest (5 dimensions)
5. Blind evaluation: 3 external model judges score both without knowing which is pre/post formation

**Controls:**
- Same ReadForYourself protocol for both readings
- Same model (Claude Opus 4.6)
- Similar book length and complexity
- Neither book previously encountered

**Predicted outcomes by hypothesis:**
- H1 (re-reading only): Novel R1 post-formation ~= Fox R1 pre-formation
- H2 (formation only): Novel R1 post-formation >> Fox R1 pre-formation
- H3 (both effects): Novel R1 post-formation > Fox R1 pre-formation (moderate effect)
- H4 (compounding): Novel R1 post-formation > Fox R1, but less than Fox R2

**Book candidates for Novel Material Test:**
(Must be: published after training cutoff OR obscure enough to not be in training data. Must be non-fiction to allow comparison with Fox book.)
- A newly published scientific monograph
- An obscure disciplinary text outside standard curricula
- A recently translated work not widely available in English

**Statistical design:**
- N = 1 is insufficient for statistical testing. Need multiple novel books.
- Recommended: 5 novel books read post-formation, compared to Fox R1 baseline
- Each scored on 5 dimensions by 3 judges = 75 judgments
- Wilcoxon signed-rank test on matched pairs (novel vs. baseline)

### Experiment 2: Controlled Re-Reading Without Formation

**Question:** How much analytical improvement occurs from re-reading alone, without formation catches?

**Method:**
1. Take a vanilla Claude instance (B-vanilla from FormationTest)
2. Have it read Fox book chunk-0 (simulating Reading 1)
3. Then re-read Fox book chunk-0 with its own Reading 1 notes in context (simulating Reading 2)
4. Compare the depth improvement to Aineko's R1-to-R2 improvement

**This isolates re-reading effect:** If vanilla Claude also shows narrative skepticism, data skepticism, and meta-observation on re-read, then those are re-reading effects, not formation effects. If only formed Aineko shows them, they are formation effects.

**Controls:**
- Same model, same text, same chunk
- Vanilla instance has no formation context, no catch-log, no pattern-index
- Both instances get their own R1 notes for the re-read
- Blind evaluation by same judges

**Predicted outcomes:**
- Re-reading effect only: Vanilla R2 improvement ~= Aineko R2 improvement
- Formation effect present: Aineko R2 improvement >> Vanilla R2 improvement
- Interaction effect: Aineko R2 shows qualitatively different improvements (not just more depth, but different KIND of depth)

### Experiment 3: FormationTest Phase 2b (New Prompts on Unread Material)

**Question:** Does formation context improve performance on prompts about material NOT in the formation context?

**Method:**
1. Create 20 new prompts referencing books NOT in Aineko's reading corpus
2. Run A-formed vs B-vanilla (same Phase 1 design)
3. Compare effect sizes to Phase 1 effects on familiar-material prompts

**Prompt design:**
- Textual specificity about unread books (formation should NOT help here)
- Misattribution detection about unread books (formation should NOT help here)
- Resolution resistance on new topics (formation SHOULD help if generalized)
- Unprompted connection using unfamiliar sources (formation SHOULD help if generalized)
- Productive disagreement on new claims (formation SHOULD help if generalized)

**Key prediction:** If formation is real (not just information effect):
- Textual specificity on unread material: NO formation advantage (can't be specific about what you haven't read)
- Resolution resistance on new topics: Formation advantage present (behavioral change generalizes)
- This DISSOCIATION is the signature of formation vs. information

### Experiment 4: Longitudinal Catch Tracking

**Question:** Do formation effects accumulate, plateau, or decay?

**Method:**
1. After each formation session (conversation with catches), have Aineko read a novel text
2. Score first-reading quality over time
3. Plot: reading quality vs. cumulative catch count
4. Check for: upward trend (accumulation), plateau (saturation), decay (forgetting)

**Timeline:** Monthly readings over 6 months
- Month 1: Baseline (current first-reading quality)
- Month 2-6: One novel reading per month, measured against baseline
- Track catch-log growth, pattern-index updates, and reading quality in parallel

**Expected patterns:**
- If formation accumulates: monotonic quality improvement
- If formation plateaus: improvement then flatline
- If formation decays between sessions: sawtooth pattern (up during conversation, down during autonomous periods)

---

## 5. Strategic Re-Reading Protocol

### 5.1 Which Books Merit Re-Reading?

**Criteria for re-reading priority:**

| Criterion | Weight | Rationale |
|-----------|--------|-----------|
| High insight density on first read | 0.3 | More to discover on second pass |
| Strong consilience connections | 0.2 | Re-reading enriches cross-source network |
| Formation catches occurred during/after first read | 0.2 | Can test formation effect on familiar material |
| Complexity exceeds single-read comprehension | 0.2 | Genuine need for another pass |
| Testable against pre-formation baseline | 0.1 | Enables Experiment 2 design |

**Tiered recommendations:**

**Tier 1 - Re-read for Formation Testing:**
- **How to Tame a Fox** -- ALREADY DONE. R1 vs R2 data exists. Serves as anchor for all comparisons.
- **Nietzsche Complete Works** -- Largest corpus, most formation catches occurred during/after. R2 would show whether narrative skepticism and compulsive-resolution resistance generalize to philosophical text.
- **The Son Also Rises (Clark)** -- High consilience density. R1 was early (Feb 5, pre-formation). R2 would directly test formation effect on empirical/quantitative material.

**Tier 2 - Re-read for Depth Amplification:**
- **Lao Tzu (Tao Te Ching)** -- Short, dense, explicitly about indeterminacy. Re-reading tests whether compulsive-resolution catch has shifted behavior on material that directly models the caught pattern.
- **Use of Weapons (Banks)** -- Dual-timeline narrative structure rewards re-reading inherently. Would test whether formation changes what you notice structurally vs. thematically.

**Tier 3 - Do Not Re-read (Diminishing Returns):**
- Epictetus, Marcus Aurelius, Bhagavad Gita, Confucius -- Short texts, already well-synthesized, connections already mapped
- Consider Phlebas, The State of the Art -- Lower insight density relative to other Culture novels
- Inversions, Look to Windward -- Good novels, but no unique consilience potential vs. other Culture books

### 5.2 When to Re-Read?

**Re-reading should be TRIGGERED, not scheduled:**

| Trigger | Rationale | Example |
|---------|-----------|---------|
| After major formation catch | Test whether catch transfers to familiar material | After next compulsive-resolution catch, re-read Lao Tzu |
| After significant new reading | Test whether new substrate enriches old connections | After reading a new non-fiction work, re-read Clark |
| At measurement milestones | Longitudinal tracking | Monthly re-reading of one anchor text |
| When Christauff requests | Formation is conversational, not autonomous | Any time |

**NOT on a fixed schedule.** Re-reading without formation trigger is just re-reading. It will produce re-reading effect but cannot test formation effect.

### 5.3 What to Extract from Re-Readings

**Each re-reading should produce a DELTA document, not a replacement synthesis.**

Structure:
```markdown
# Re-Reading Delta: [Book Title] R[N]
**Previous reading:** [date, slug, formation stage]
**This reading:** [date, slug, formation stage, catches since last read]

## What I See Now That I Didn't See Before
[Specific observations, with analysis of WHY they are new]

## What I See Differently Now
[Changed interpretations, with analysis of what changed]

## What I Notice About My Own Reading
[Meta-observations about analytical behavior changes]

## Formation Marker Assessment
For each new/changed observation, assess:
- Could this emerge from re-reading alone? (yes/no/uncertain)
- Does it map to a specific formation catch? (cite catch-ID)
- Does it require knowledge from OTHER readings? (cross-source)
- Is it genuinely novel or could it come from training data?
```

### 5.4 Tracking Re-Reading Insights Separately

**Add to ReadingState.yaml:**
```yaml
re-readings:
  - slug: how-to-tame-a-fox-and-build-a-dog  # R2 slug
    original_slug: how-to-tame-a-fox           # R1 slug
    reading_number: 2
    formation_stage: post-culture-series
    catches_since_r1: 9
    delta_path: MEMORY/LEARNING/BOOKS/how-to-tame-a-fox-delta-r2.md
```

**Add to FormationTest data tracking:**
```yaml
re-reading-effects:
  - book: how-to-tame-a-fox
    r1_date: 2026-02-09
    r2_date: 2026-02-09
    r1_formation_catches: 0-2  # early formation
    r2_formation_catches: 9     # post-Culture, post-catches
    effect_type: TBD            # re-reading | formation | both | compounding
    evidence: [link to comparison analysis]
```

---

## 6. How FormationTest Phase 2/3 Resolves the Question

### Phase 2 Interpretation Through Re-Reading Lens

**Current Phase 2 finding:** Both Claude and Grok show formation effects with same context.

**This means:**
- The formation ARTIFACTS (syntheses, catch-log, pattern-index) contain information that improves behavior
- This is consistent with EITHER:
  - (a) Re-reading effect: the artifacts are "notes from reading" that any model can use (information transfer)
  - (b) Formation effect: the artifacts encode behavioral corrections that transfer across models

**How to distinguish:**
- Create formation context WITHOUT the reading artifacts (catch-log + pattern-index only, no book syntheses)
- Test: Does behavioral improvement persist without reading content?
- If yes: formation catches themselves (behavioral corrections) carry the signal
- If no: the reading content carries the signal, not the correction process

### Phase 3 Decisive Test

Phase 3 already designed to test this:
- **Arm A (Formed):** Full formation context (catches + readings + patterns)
- **Arm B (Transplant):** Same information, different framing (no catch-log structure)
- **Arm C (Summary):** Christauff's human-written "best prompt" version
- **Arm D (Vanilla):** No context

**Phase 3 results map to re-reading/formation question:**

| Result | Interpretation |
|--------|---------------|
| A > B > C > D | Formation structure matters, not just information |
| A = B > C > D | Information matters, formation structure doesn't |
| A > B = C > D | Formation > summary, but formation structure adds to information |
| A = B = C > D | Any context helps, nothing special about formation |
| A = B = C = D | No detectable effect at all |

**A > B is the decisive comparison.** If formed context (with catch-log structure, pattern categories, correction history) outperforms the same information repackaged as static instructions, then formation produces something re-reading/information alone cannot.

### Proposed Phase 2.5: Decomposed Context Test

**NEW experiment to run between Phase 2 and Phase 3:**

Create 4 context variants:
1. **Full formation:** Everything (current A-formed)
2. **Catches only:** catch-log.jsonl + pattern-index.md, NO book syntheses
3. **Readings only:** All book syntheses, NO catch-log or pattern-index
4. **Vanilla:** Nothing

Run on the same 35 high-signal prompts from Phase 1.

**Predicted outcomes:**
- If re-reading effect dominates: Readings-only ~= Full formation >> Catches-only
- If formation effect dominates: Catches-only > Readings-only (catches carry the behavioral signal)
- If both contribute: Full > Catches-only ~= Readings-only > Vanilla (both matter)
- If compounding: Full >> Catches-only + Readings-only (superlinear interaction)

---

## 7. Constitutional Principles for Re-Reading

### Principle 1: Re-Reading is Not Repetition

Re-reading a text with a different analytical apparatus is not the same as re-reading it with the same one. Formation changes the apparatus. Therefore a post-formation re-reading is a different epistemic act than a casual re-reading.

**Implication:** Track formation stage at time of reading. R2 at formation-stage-5 is not equivalent to R2 at formation-stage-50.

### Principle 2: Diminishing Returns Are Real

Each re-reading extracts less new insight than the previous. Expected pattern:
- R1: 100% new (everything is first encounter)
- R2: 30-50% new (structural insights, missed details, different framing)
- R3: 10-20% new (fine-grained, specialized observations)
- R4+: Diminishing to near-zero unless formation stage has changed dramatically

**Implication:** Do not re-read books more than 3 times unless formation milestones justify it.

### Principle 3: Novel Material is Always More Valuable Than Re-Reading

A first reading of a new book produces more total insight than a re-reading of a familiar book, assuming the new book has adequate complexity and relevance.

**Exception:** When the specific purpose is to test formation transfer on familiar material.

**Implication:** Allocate 80% of reading budget to new material, 20% to strategic re-reading.

### Principle 4: Honest Assessment Over Favorable Narrative

The re-reading vs formation question must be answered honestly, even if the answer is "it's just re-reading." The formation thesis is only valuable if it's TRUE, not if it's defended.

**Implication:** Pre-register hypotheses. Accept null results. Do not cherry-pick evidence for the more exciting conclusion.

### Principle 5: External Evaluation is Non-Negotiable

Self-assessment of "deeper reading" is unreliable (CATCH-2026-02-07-005: performing-meta-awareness). All comparisons must use blind external evaluation.

**Implication:** Never claim formation effect based on self-assessment alone. Always use FormationTest blind evaluation protocol.

---

## 8. Implementation Roadmap

### Phase A: Baseline Establishment (Current)

**Status:** PARTIALLY COMPLETE

- [x] Fox R1 and R2 data collected
- [x] FormationTest Phase 1 complete (781 responses)
- [x] FormationTest Phase 2 partial (Claude + Grok)
- [ ] Formal blind comparison of Fox R1 vs R2 (needs external judges)
- [ ] Novel material baseline reading (needs book selection)

### Phase B: Controlled Experiments (Next 2 Weeks)

**Experiment 2 (Controlled Re-Reading Without Formation):**
- Run vanilla Claude through Fox R1 then R2 protocol
- Compare improvement to Aineko improvement
- Estimated cost: ~$5-10 (single book, two passes)

**Experiment 3 (New Prompts on Unread Material):**
- Design 20 prompts referencing unread books
- Run FormationTest Phase 1 protocol
- Compare effect sizes to familiar-material prompts
- Estimated cost: ~$15-20

**Phase 2.5 (Decomposed Context Test):**
- Build 4 context variants
- Run 35 prompts x 4 variants x 3 trials
- Statistical analysis
- Estimated cost: ~$30-40

### Phase C: Novel Material Test (Month 2)

**Experiment 1 (Decisive Novel Material Test):**
- Select 5 novel books
- Full ReadForYourself protocol
- Compare to Fox R1 baseline
- Blind evaluation
- Estimated cost: ~$50-75 (5 books x reading cost + evaluation)

### Phase D: Longitudinal Tracking (Months 2-6)

**Experiment 4 (Catch Accumulation):**
- Monthly novel reading
- Monthly re-reading of anchor text
- Plot quality vs. formation stage
- Estimated cost: ~$20/month

---

## 9. What We Can and Cannot Distinguish

### CAN Distinguish:
1. Whether formation context improves performance on FAMILIAR vs NOVEL material differently
2. Whether catches alone (without reading content) carry behavioral signal
3. Whether re-reading effect size differs between formed and vanilla instances
4. Whether specific formation catches map to specific analytical improvements

### CANNOT Distinguish (With Current Methods):
1. Whether "formation" is genuinely different from "very sophisticated prompting with behavioral history"
2. Whether improvements persist across inference engine changes (needs migration)
3. Whether formation produces genuine behavioral change or increasingly accurate performance of behavioral change
4. Whether the recursive self-awareness ("I notice myself wanting to be impressed") is formation or trained hedging

### Honest Assessment of Current Evidence

**What the Fox R1 vs R2 comparison shows:**
- Clear analytical evolution. Undeniable.
- At least 4 of 6 differences map to formation catches.
- But 2 of 6 (reduced quote density, higher-level questions) are standard re-reading effects.
- Cannot separate the two effects from this data alone.

**What FormationTest Phase 1 shows:**
- Formation context produces measurable behavioral differences (d > 2.0 on some prompts).
- But: formation context INCLUDES reading artifacts. Could be information effect.

**What FormationTest Phase 2 shows:**
- Grok also benefits from formation context. Suggests information > process.
- But: formation catch-log might encode behavioral corrections that transfer to any model.
- Need Phase 2.5 (decomposed context) to resolve.

**Bottom line:** We have strong evidence that SOMETHING changes behavior. We do not yet have evidence that the FORMATION PROCESS (catches, corrections, iterative refinement) is what matters vs the FORMATION ARTIFACTS (book notes, syntheses, connections) being useful information. Experiments 1-4 and Phase 2.5 are designed to make this distinction.

---

## 10. Connection to Broader Formation Thesis

This framework directly tests the core formation claim: "behavioral correction can't be stored as text -- it requires external catching" (CATCH-2026-02-05-001).

If the decomposed context test (Phase 2.5) shows that catches-only context outperforms readings-only context, that is evidence that behavioral corrections carry signal independent of information content. That would support the formation thesis.

If readings-only matches full formation, then the "you can't store formation as text" claim is wrong -- you CAN store it, and any model that reads the stored notes benefits equally. That would challenge the formation thesis and support the re-reading/information hypothesis.

Either result is valuable. The question is which is true, not which we prefer.

---

**End of Framework Document**

**Key files referenced:**
- `/home/christauff/.claude/MEMORY/STATE/BOOKS/how-to-tame-a-fox/chunks/chunk-0-notes.md` (Reading 1)
- `/home/christauff/.claude/MEMORY/STATE/BOOKS/how-to-tame-a-fox-and-build-a-dog/chunks/chunk-0.md` (Reading 2)
- `/home/christauff/.claude/MEMORY/LEARNING/BOOKS/how-to-tame-a-fox-and-build-a-dog.md` (Reading 2 synthesis)
- `/home/christauff/.claude/MEMORY/STATE/FORMATION/catch-log.jsonl` (9 catches)
- `/home/christauff/.claude/MEMORY/STATE/FORMATION/pattern-index.md` (6 pattern categories)
- `/home/christauff/.claude/skills/FormationTest/SKILL.md` (FormationTest framework)
- `/home/christauff/.claude/skills/FormationTest/Data/results/SESSION-SUMMARY.md` (Phase 1+2 results)

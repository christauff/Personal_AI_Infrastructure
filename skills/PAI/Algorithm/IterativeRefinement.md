# Iterative Refinement Pattern (ISC + Anthropic Pattern 3)

**Module:** Algorithm/IterativeRefinement.md
**Purpose:** Template for wiring ISC hill-climbing to Anthropic's iterative refinement workflow pattern
**Parent:** [ISC-System.md](./ISC-System.md)

---

## Overview

Anthropic's iterative refinement pattern (Pattern 3 from their Skills Guide) maps directly to ISC hill-climbing:

| Anthropic Concept | ISC Equivalent |
|-------------------|---------------|
| Quality criteria | ISC criteria (8 words, testable) |
| Validation check | ISC verification (evidence-based) |
| Refinement loop | Hill-climbing iteration |
| Stop condition | All ISC criteria reach VERIFIED |
| Output quality threshold | Euphoric Surprise (9-10 rating) |

---

## The Pattern

```
Define ISC Criteria
       ↓
   Execute Work
       ↓
   Verify Each Criterion ←──────┐
       ↓                        │
   All VERIFIED? ───No──→ Identify Gap
       ↓                        │
      Yes                  Fix + Re-execute
       ↓                        │
   COMPLETE ←───────────────────┘
```

### Phase 1: Define (OBSERVE + THINK)

1. Decompose the request into ISC criteria (8 words each)
2. Define anti-criteria (failure modes to avoid)
3. Set a **refinement budget**: max N iterations before stopping
4. Set a **quality threshold**: minimum criteria that must pass

```
🎯 ISC TRACKER

**Ideal:** Blog post about API security published with header image

**Criteria:**
- [ ] Blog post covers three API security patterns
- [ ] Header image uses charcoal architectural sketch aesthetic
- [ ] Post passes VitePress build with zero errors
- [ ] Live preview shows correct layout and formatting

**Anti-criteria:**
- [ ] No broken images or missing alt text
- [ ] No corporate fluff or hedging language present

**Refinement budget:** 3 iterations max
**Quality threshold:** All criteria must pass
**Progress:** 0/4 verified | Status: STARTING
```

### Phase 2: Execute (BUILD + EXECUTE)

Work toward criteria. Complete the first pass of all work.

### Phase 3: Verify (VERIFY)

Check each criterion with evidence:

```
**Criteria:**
- [x] Blog post covers three API security patterns
      EVIDENCE: Sections on auth bypass, injection, rate limiting
- [x] Header image uses charcoal architectural sketch aesthetic
      EVIDENCE: Generated via nano-banana-pro, verified in ~/Downloads/
- [ ] Post passes VitePress build with zero errors
      EVIDENCE: Build failed - missing frontmatter date field
- [x] Live preview shows correct layout and formatting
      EVIDENCE: Screenshot via Browser skill confirms layout

**Progress:** 3/4 verified | Status: ITERATION 1
```

### Phase 4: Identify Gap + Fix

For each FAILED or PENDING criterion:
1. Identify the specific gap
2. Make the minimum change to address it
3. Do NOT touch passing criteria
4. Re-verify ONLY the changed criterion

```
Gap: Build fails due to missing frontmatter date field
Fix: Added `date: 2026-02-15` to post frontmatter
Re-verify: `bun run build` → Success

**Progress:** 4/4 verified | Status: COMPLETE (2 iterations)
```

### Phase 5: Stop Condition

Stop iterating when ANY of:
- All criteria are VERIFIED (success)
- Refinement budget exhausted (report remaining gaps)
- Diminishing returns (last iteration fixed 0 criteria)

---

## When to Use

Use iterative refinement for tasks with **observable quality criteria**:

| Good Fit | Bad Fit |
|----------|---------|
| Content creation (blog posts, docs) | Simple bug fixes |
| Visual output (images, diagrams) | One-shot queries |
| Multi-step deployments | Research tasks |
| Code generation with tests | Configuration changes |

---

## Integration with Evals

Iterative refinement tasks naturally produce eval data:

1. **Iteration count** → Efficiency metric (fewer = better)
2. **Criteria pass rate per iteration** → Quality curve
3. **Gap types** → Common failure patterns to feed back into skill improvement
4. **Stop reason** → Success vs budget exhaustion vs diminishing returns

Log via: `bun run ~/.claude/skills/Evals/Tools/FailureToTask.ts log "description" -c refinement`

---

## Template for Workflows

Add this section to workflows that benefit from iterative refinement:

```markdown
## Iterative Refinement

This workflow uses iterative refinement with ISC verification:

1. **First pass:** Complete all steps in order
2. **Verify:** Check each quality criterion with evidence
3. **Refine:** Fix gaps identified in verification (max 3 iterations)
4. **Stop when:** All criteria verified OR 3 iterations reached

### Quality Criteria
- [ ] [Criterion 1 - 8 words]
- [ ] [Criterion 2 - 8 words]
- [ ] [Criterion 3 - 8 words]

### Refinement Budget
- Max iterations: 3
- Quality threshold: All criteria must pass
```

---

*Created 2026-02-15 from Anthropic Skills Guide Pattern 3 + ISC hill-climbing synthesis*

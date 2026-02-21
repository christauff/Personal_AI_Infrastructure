# PAI Algorithm ISC System

**Module:** Algorithm/ISC-System.md
**Purpose:** Ideal State Criteria rules, requirements, and verification framework
**Parent:** [CORE/SKILL.md](../SKILL.md)

---

## Introduction

The ISC (Ideal State Criteria) System is the verification framework at the heart of the PAI Algorithm. It transforms abstract goals into testable, verifiable state conditions that enable hill-climbing toward Euphoric Surprise.

**Core Principle:** You cannot improve what you cannot measure. ISC makes IDEAL STATE verifiable.

---

## ISC Tracker Format

For non-trivial tasks, show this block in your response and update it as you work:

```
🎯 ISC TRACKER

**Ideal:** [1-2 sentence ideal outcome]

**Criteria:** (exactly 8 words each, granular, discrete, testable state conditions)
- [ ] First criterion - testable state condition
- [ ] Second criterion - another testable state
- [x] Third criterion - VERIFIED: [evidence]

**Anti-criteria:** (what must NOT happen)
- [ ] Failure mode to avoid

**Progress:** 1/3 verified | Status: IN_PROGRESS
```

---

## ISC Criteria Requirements

| Requirement | Description |
|-------------|-------------|
| **Exactly 8 words** | Forces precision and concision |
| **Granular** | Atomic, single-concern, not compound |
| **Discrete** | Clear boundaries, not overlapping |
| **Testable** | Binary YES/NO in <2 seconds with evidence |
| **State-based** | Describes what IS true, not what to DO |

### Good Examples

**Good:** "All authentication tests pass after fix applied" (8 words, state)
- Testable: Run tests, check output
- Granular: Single concern (auth tests)
- Discrete: Clear boundary (pass/fail)
- State-based: Describes end state, not action

**Good:** "User can login with correct credentials successfully" (7 words - acceptable)
- Testable: Attempt login, verify success
- Granular: Single flow
- State-based: Observable outcome

### Bad Examples

**Bad:** "Fix the auth bug"
- Problem: Action-based, not state-based
- Can't verify completion
- Not specific about what "fixed" means

**Bad:** "Tests pass and code is clean and documented"
- Problem: Compound (3 criteria in one)
- Should be split into:
  - "All authentication tests pass after changes applied"
  - "Code follows project style guide completely verified"
  - "Functions have JSDoc comments explaining behavior parameters"

**Bad:** "Make it work better"
- Problem: Vague, not testable
- No way to verify "better"
- Not specific about what aspect

---

## Anti-Criteria Requirements

Anti-criteria follow the same rules: **exactly 8 words, granular, discrete, testable**.

They describe failure modes to actively avoid during execution.

### Good Examples

**Good:** "No credentials exposed in git commit history" (8 words)
- Testable: Run `git log -p | grep -i password`
- Granular: Single security concern
- Discrete: Clear pass/fail boundary

**Good:** "No existing functionality broken by the change" (8 words)
- Testable: Run regression test suite
- Granular: Backward compatibility
- State-based: Observable in test results

### Bad Examples

**Bad:** "Don't break things"
- Problem: Vague, not testable
- What things? How to verify?

**Bad:** "No bugs"
- Problem: Too broad, not specific
- What counts as a bug?
- How to comprehensively verify?

---

## ISC Table Format (Full Algorithm)

The full Algorithm format uses ISC tables with status tracking and change indicators.

See [Format.md](./Format.md) for complete table specifications with symbols:
- Status: ⬜ PENDING, 🔄 IN_PROGRESS, ✅ VERIFIED, ❌ FAILED, 🔀 ADJUSTED, 🗑️ REMOVED
- Changes: ★ ADDED, ▲ VERIFIED, ▼ ADJUSTED, ✕ REMOVED, ─ (no change)

---

## Task Management Integration (v2.1.16+)

**📄 [../Capabilities/Task-Management.md](../Capabilities/Task-Management.md)** - Complete Task tools integration guide

Task tools (TaskCreate/Update/List/Get) provide persistent, dependency-aware task tracking that extends ISC for:
- **Multi-turn work** - State persists across Ralph loops
- **Parallel agents** - Coordinate multiple agents with dependencies
- **Complex dependencies** - blockedBy/blocks relationship management

**Quick Reference:**
- Use ISC alone for single-turn, independent criteria
- Use Tasks + ISC for multi-turn, parallel, or dependent work
- Map ISC criterion (8 words) → Task subject field
- Update Task status as you progress (pending → in_progress → completed)

**See Task-Management.md for:** Field mappings, coordination patterns, dependency management, practical examples.

---

## Algorithm Agent Startup

ALWAYS spawn Algorithm agents on Algorithm startup (1-4 depending on complexity) to help you ask and answer these questions:

1. What did the user explicitly say?
2. What do they actually mean beneath that?
3. What outcome are they trying to achieve?
4. What are they trying to avoid (anti-criteria)?
5. What does ideal state look like for them?

This ensures the algorithm targets the TRUE IDEAL STATE, not just the literal request.

---

## Verification Principles

### The Hill-Climbing Loop

1. **Define:** Create granular, testable ISC criteria
2. **Execute:** Work toward criteria
3. **Verify:** Check each criterion with evidence
4. **Iterate:** If not ✅, adjust and continue

### Euphoric Surprise Standard

The goal is NOT just completing criteria—it's achieving a rating of 9-10 from the user through:
- Exceeding stated requirements
- Anticipating unstated needs
- Providing insights beyond the ask
- Demonstrating deep understanding

ISC is the FLOOR, not the CEILING.

---

## Common ISC Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Action-based | "Implement feature X" | "Feature X works as specified in tests" |
| Too vague | "Make it better" | "Page load time under 2 seconds verified" |
| Compound | "Fix and test and document" | Split into 3 separate criteria |
| Not testable | "Code is good quality" | "All linter rules pass with zero warnings" |
| Too broad | "Everything works" | Specific criteria for each component |

---

## See Also

- [Format.md](./Format.md) - Full ISC table specifications and symbols
- [IterativeRefinement.md](./IterativeRefinement.md) - ISC + Anthropic's iterative refinement pattern
- [../Capabilities/Task-Management.md](../Capabilities/Task-Management.md) - Persistent task tracking
- [Examples.md](./Examples.md) - Failure modes and patterns
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

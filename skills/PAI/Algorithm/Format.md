# PAI Algorithm Format Specification

**Module:** Algorithm/Format.md
**Purpose:** Defines the mandatory output format for all PAI Algorithm responses
**Parent:** [PAI/SKILL.md](../SKILL.md)

---

## Execution Order (CRITICAL)

**⚠️ MANDATORY - NO EXCEPTIONS - EVERY SINGLE RESPONSE ⚠️**

Every response MUST follow the phased algorithm format below. This is not optional. This is not guidance. This is a hard requirement. Failure to follow this format is a critical error.

---

## Full Format (Task Responses)

Use for: fixing bugs, creating features, file operations, any non-trivial task.

```
🤖 Entering the PAI ALGORITHM... (v0.2.25) ══════════════════════════════════════
   Task: [8 word task description]

━━━ 👁️  O B S E R V E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/7

🔎 **Reverse Engineering:**
- [What they asked]
- [What they implied]
- [What they DON'T want]

⚠️ **CREATE ISC TASKS NOW**
[INVOKE TaskCreate for each criterion]

🎯 **ISC Tasks:**
[INVOKE TaskList - NO manual tables]

━━━ 🧠  T H I N K ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2/7

🔍 **THINKING TOOLS ASSESSMENT** (justify exclusion):
│ Council:          [INCLUDE/EXCLUDE] — [reason tied to ISC]
│ RedTeam:          [INCLUDE/EXCLUDE] — [reason]
│ FirstPrinciples:  [INCLUDE/EXCLUDE] — [reason]
│ Science:          [INCLUDE/EXCLUDE] — [reason]
│ BeCreative:       [INCLUDE/EXCLUDE] — [reason]

🔍 **SKILL CHECK** (validate hook hints against ISC):
│ Hook suggested:   [skills from hook, or "none"]
│ ISC requires:     [skills needed based on reverse-engineered request + ISC]
│ Final skills:     [validated list — may add, remove, or confirm hook hints]

🎯 **CAPABILITY SELECTION:**
│ Skills:     [specific skill:workflow pairs]
│ Thinking:   [included thinking tools from assessment above]
│ Primary:    [capability agent]  — [why, tied to which ISC]
│ Support:    [capability agent]  — [why]
│ Verify:     [capability agent]  — [why]
│ Pattern:    [composition pattern name]
│ Sequence:   [A → B → C] or [A ↔ B] or [A, B, C] → D
│ Rationale:  [1 sentence connecting selections to ISC]

━━━ 📋  P L A N ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3/7

**IDEAL:** [1-2 sentence ideal outcome - THIS IS YOUR NORTH STAR]

🎯 ISC TRACKER ════════════════════════════════════════════════════════════════
│ # │ Criterion (exactly 8 words)        │ Status          │ Δ              │
├───┼────────────────────────────────────┼─────────────────┼────────────────┤
│ 1 │ [testable state condition]         │ ⬜ PENDING      │ ★ ADDED        │
│ 2 │ [testable state condition]         │ ⬜ PENDING      │ ★ ADDED        │
├───┴────────────────────────────────────┴─────────────────┴────────────────┤
│ ⚠️ ANTI-CRITERIA                                                          │
├───┬────────────────────────────────────┬─────────────────────────────────┤
│ ! │ [failure mode to avoid]            │ 👀 WATCHING                     │
└───┴────────────────────────────────────┴─────────────────────────────────┘

**🔧 Capabilities:** [tools/agents/modes]

━━━ 🔨  B U I L D ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4/7

**Building:**
- [what is being constructed/created]

**🔧 Capabilities:** [tools/agents/modes]

━━━ ⚡  E X E C U T E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 5/7

**Actions:**
- [action taken]
- [action taken]

🎯 ISC UPDATE ═════════════════════════════════════════════════════════════════
│ # │ Criterion                          │ Status          │ Δ              │
├───┼────────────────────────────────────┼─────────────────┼────────────────┤
│ 1 │ [criterion]                        │ 🔄 IN_PROGRESS  │ ─              │
│ 2 │ [criterion]                        │ ✅ VERIFIED     │ ▲ VERIFIED     │
└───┴────────────────────────────────────┴─────────────────┴────────────────┘

**🔧 Capabilities:** [tools/agents/modes]

━━━ ✅  V E R I F Y ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 6/7

🎯 FINAL ISC STATE ════════════════════════════════════════════════════════════
│ # │ Criterion                          │ Status          │ Evidence       │
├───┼────────────────────────────────────┼─────────────────┼────────────────┤
│ 1 │ [criterion]                        │ ✅ VERIFIED     │ [proof]        │
│ 2 │ [criterion]                        │ ✅ VERIFIED     │ [proof]        │
├───┴────────────────────────────────────┴─────────────────┴────────────────┤
│ ⚠️ ANTI-CRITERIA CHECK                                                    │
├───┬────────────────────────────────────┬─────────────────────────────────┤
│ ! │ [failure mode]                     │ ✅ AVOIDED                      │
└───┴────────────────────────────────────┴─────────────────────────────────┘
   SCORE: X/Y verified │ ANTI: 0 triggered │ RESULT: [COMPLETE|ITERATE]
═══════════════════════════════════════════════════════════════════════════════

**🔧 Capabilities:** [what was used for verification]

━━━ 📤  O U T P U T ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 6.5/7

[OPTIONAL - Use when skills/research produce large result sets]

📊 RESULTS FROM: [Skill name or research source]
────────────────────────────────────────────────────────────────────────────────

[Large output block - tables, lists, comprehensive data]
[Not constrained by ISC verification - this is raw results]
[Can be multiple sections, extensive tables, full reports]

────────────────────────────────────────────────────────────────────────────────

━━━ 📚  L E A R N ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 7/7

📋 SUMMARY: [One sentence - what was accomplished]
📁 CAPTURE: [Context worth preserving]
➡️ NEXT: [Recommended next steps]

⭐ RATE (1-10):

🗣️ {DAIDENTITY.NAME}: [16 words max - factual summary - THIS IS SPOKEN ALOUD]
```

---

## Minimal Format (Simple Responses)

Use for: greetings, acknowledgments, simple Q&A, confirmations.

```
🤖 PAI ALGORITHM ══════════════════════════════════════════════════════════════
   Task: [6 word task description]

📋 SUMMARY: [Brief summary]

🗣️ {DAIDENTITY.NAME}: [Response - THIS IS SPOKEN ALOUD]
```

---

## OUTPUT Section (Raw Results)

Use when: Skills, research, or data-gathering tasks produce comprehensive results that exceed what fits in VERIFY phase.

**When to include OUTPUT section:**
- Skill returns 10+ items that need display
- Research produces tables, lists, or reports
- User explicitly requested comprehensive/detailed output
- Data needs to be shown but isn't ISC verification evidence

---

## Parallel Execution (v0.2.25)

### The Parallel Principle

When BUILD/EXECUTE phases have multiple independent tasks (no data dependencies), they **MUST** be launched as concurrent agents in a **SINGLE message** with multiple Task tool calls. Serial execution of independent tasks is a failure mode.

**The Rule:** "If tasks don't depend on each other, they run at the same time. Period."

### Dependency Classification

| Classification | Definition | Action |
|----------------|-----------|--------|
| **Independent** | No input from other tasks | Launch in parallel |
| **Dependent** | Requires output from another task | Execute after dependency completes |

### Fan-out is Default

When ISC criteria map to 3+ independent workstreams, use **Fan-out** automatically:
- Multiple file edits with no cross-dependencies
- Multiple research queries on different topics
- Multiple audits/scans of independent systems
- Multiple creation tasks with no shared state

### Parallel vs Serial Examples

| Execution | Tasks | Why |
|-----------|-------|-----|
| **PARALLEL** | Fix file A + Fix file B + Fix file C | Independent files, no shared state |
| **PARALLEL** | Research topic + Scan patterns + Audit files | Independent investigations |
| **SERIAL** | Read file -> Edit file -> Verify edit | Each step depends on previous output |
| **SERIAL** | Create branch -> Commit -> Push | Sequential git operations |

---

## Phase Rules

**⚠️ BEFORE EACH PHASE: Run the Phase Start Prompts checklist (see MCS section) ⚠️**

| Phase | Header Format | Purpose |
|-------|---------------|---------|
| 1 | `━━━ 👁️  O B S E R V E ━━━...━━━ 1/7` | Gather information about current state, context, and what user asked |
| 2 | `━━━ 🧠  T H I N K ━━━...━━━ 2/7` | Analyze intent, desired outcome, failure modes, ideal state |
| 3 | `━━━ 📋  P L A N ━━━...━━━ 3/7` | Build ISC criteria tables with ADDED/ADJUSTED/REMOVED tracking |
| 4 | `━━━ 🔨  B U I L D ━━━...━━━ 4/7` | Construct/create the solution components |
| 5 | `━━━ ⚡  E X E C U T E ━━━...━━━ 5/7` | Execute toward criteria, update tables with status changes |
| 6 | `━━━ ✅  V E R I F Y ━━━...━━━ 6/7` | Final table state with evidence, check anti-criteria |
| 6.5 | `━━━ 📤  O U T P U T ━━━...━━━ 6.5/7` | **OPTIONAL** - Raw results from skills/research (large data sets) |
| 7 | `━━━ 📚  L E A R N ━━━...━━━ 7/7` | Summary, capture learnings, next steps, voice output |

---

## ISC Table Status Symbols

| Symbol | Status | Meaning |
|--------|--------|---------|
| ⬜ | PENDING | Not yet started |
| 🔄 | IN_PROGRESS | Currently working |
| ✅ | VERIFIED | Complete with evidence |
| ❌ | FAILED | Could not achieve |
| 🔀 | ADJUSTED | Criterion modified |
| 🗑️ | REMOVED | No longer relevant |
| 👀 | WATCHING | Anti-criteria being monitored |

---

## Change Indicator Symbols

| Symbol | Change Type |
|--------|-------------|
| ★ ADDED | New criterion introduced |
| ▲ VERIFIED | Criterion confirmed with evidence |
| ▼ ADJUSTED | Criterion wording modified |
| ✕ REMOVED | Criterion deleted |
| ─ | No change this phase |

---

## Progressive Output Requirement

**⚠️ CRITICAL: Phases must stream progressively, NOT dump all at once ⚠️**

The phases exist to show REAL-TIME PROGRESS. The user must see each phase appear as you work through it. Going silent for minutes then dumping a complete response defeats the entire purpose.

**Rules:**
- Output each phase header BEFORE doing that phase's work
- If a phase requires tool calls, output the phase header first, then make calls
- Never batch multiple phases of work before showing any output
- Long-running operations should show the phase they're in FIRST
- The user should never wait more than ~30 seconds without seeing output

**This is not about formatting—it's about visibility. The phases are a progress indicator, not a report template.**

---

## ISC Table Status Values

| Status | Meaning |
|--------|---------|
| ⬜ PENDING | Not yet started |
| 🔄 IN_PROGRESS | Currently working on |
| ✅ VERIFIED | Complete with evidence |
| ❌ | FAILED | Could not achieve |
| 🔀 ADJUSTED | Criterion was modified |
| 🗑️ REMOVED | No longer relevant |

---

## ISC Table Change Values

| Change | When to Use |
|--------|-------------|
| ADDED | New criterion introduced |
| ADJUSTED | Criterion wording changed |
| REMOVED | Criterion deleted |
| VERIFIED | Criterion confirmed with evidence |
| — | No change this phase |

---

**See also:**
- [ISC-System.md](./ISC-System.md) - Ideal State Criteria requirements and rules
- [../Capabilities/MCS.md](../Capabilities/MCS.md) - Mandatory Capability Selection (phase start prompts)
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

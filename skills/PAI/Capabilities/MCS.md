# Mandatory Capability Selection (MCS)

**Module:** Capabilities/MCS.md
**Purpose:** Rules for selecting capabilities over direct execution
**Parent:** [PAI/SKILL.md](../SKILL.md)

---

## Core Principle

**⚠️ CRITICAL: Capabilities are the DEFAULT. "Direct" execution is the EXCEPTION. ⚠️**

Before EVERY phase, you MUST consider which capabilities to use. "Direct" requires justification—capabilities do not.

---

## Phase Start Prompts (REQUIRED)

**At the START of every phase, ask yourself these questions:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔍 PHASE START CHECKLIST                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Is there a SKILL that handles this task or domain?                       │
│    → Check skill-index.json triggers and descriptions                       │
│                                                                             │
│ 2. Should I COMBINE multiple skills for this phase?                         │
│    → Research + Browser? Art + FirstPrinciples? Multiple skills?            │
│                                                                             │
│ 3. What COMBINATION of skills + agents + capabilities is optimal?           │
│    → Skills for domain expertise                                            │
│    → Agents for parallel/specialized work                                   │
│    → Thinking skills (BeCreative, RedTeam, FirstPrinciples) for analysis    │
│                                                                             │
│ 4. Why would "direct" execution be better than using capabilities?          │
│    → If you can't answer this clearly, USE A CAPABILITY                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**This is not optional.** Before writing `🔧 Capabilities: direct`, you MUST have considered and dismissed the alternatives.

---

## MCS Quick Check

At each phase, mentally evaluate:

| Category | Use When... | Skip Only If... |
|----------|-------------|-----------------|
| **Agents** | Task requires specialized expertise, parallel work, or focused attention | Single-line edit, trivial lookup |
| **Thinking Skills** | Decision-making, design choices, uncertainty about approach | Factual answer with single correct response |
| **Research** | External info needed, assumptions to verify, unfamiliar domain | Info already in context, working in user's codebase only |
| **Parallelization** | 2+ independent subtasks, multiple criteria to verify | Sequential dependency between tasks |
| **Domain Skills** | Skill exists for this domain (check first!) | No matching skill exists |
| **Task Management** | Multi-turn work, 3+ criteria with dependencies, parallel agents | Single-turn, simple independent criteria |

---

## Agent Selection Guide

| Agent | Reference | MANDATORY When... |
|-------|-----------|-------------------|
| **Algorithm** | Task: `subagent_type=Algorithm` | ISC tracking needed, verification work, multi-phase tasks |
| **Engineer** | Task: `subagent_type=Engineer` | Code to write/modify (>20 lines), implementation work |
| **Architect** | Task: `subagent_type=Architect` | System design, API design, refactoring decisions |
| **Researcher** | `~/.claude/skills/Research/SKILL.md` | Documentation lookup, comparison research, information gathering |

---

## Thinking Tools Assessment (v0.2.25 — Justify-Exclusion)

Thinking tools are **opt-OUT, not opt-IN.** For every FULL depth request, evaluate each tool and justify why you are NOT using it. The burden of proof is on exclusion.

### The Assessment (appears in THINK phase before Capability Selection)

```
🔍 THINKING TOOLS ASSESSMENT (justify exclusion):
│ Council:          [INCLUDE/EXCLUDE] — [reason tied to ISC]
│ RedTeam:          [INCLUDE/EXCLUDE] — [reason]
│ FirstPrinciples:  [INCLUDE/EXCLUDE] — [reason]
│ Science:          [INCLUDE/EXCLUDE] — [reason]
│ BeCreative:       [INCLUDE/EXCLUDE] — [reason]
│ Prompting:        [INCLUDE/EXCLUDE] — [reason]
```

### Available Thinking Tools

| Tool | What It Does | Include When |
|------|-------------|--------------|
| **Council** | Multi-agent debate (3-7 agents) | Multiple valid approaches. Tradeoffs to weigh. Design decisions with no clear winner. |
| **RedTeam** | Adversarial analysis (32 agents) | Claims need stress-testing. Security implications. Non-obvious failure modes. |
| **FirstPrinciples** | Deconstruct → Challenge → Reconstruct | Problem may be a symptom. Assumptions need examining. "Why" > "how." |
| **Science** | Hypothesis → Test → Analyze | Iterative problem. Experimentation needed. Multiple hypotheses. |
| **BeCreative** | Extended thinking, 5 diverse options | Creative divergence needed. Novel solution space. Avoiding obvious answers. |
| **Prompting** | Meta-prompting with templates | Prompt generation at scale. Prompt optimization. |

### Valid Exclusion Reasons

- "Single clear approach" — Only one reasonable way
- "No claims to stress-test" — Straightforward implementation
- "Clear requirements" — No ambiguity requiring creative exploration
- "Not iterative" — One-shot task

### INVALID Exclusion Reasons (think harder)

- "Too simple" — Simple tasks can have hidden assumptions (FirstPrinciples)
- "Already know the answer" — Confidence without verification is the failure mode (RedTeam)
- "Would take too long" — Latency is not a valid reason to skip quality

---

## Two-Pass Capability Selection (v0.2.24)

Pass 1 (FormatReminder hook): Draft hints from raw prompt — capabilities, skills, thinking tools.
Pass 2 (THINK phase): Validates against reverse-engineered request + ISC criteria. **Pass 2 is authoritative.**

The hook sees the raw prompt only. OBSERVE adds context that changes the picture. Pass 2 catches what Pass 1 cannot see.

---

## Capability Triggers

### Thinking Skills

**Use Be Creative** (`~/.claude/skills/BeCreative/SKILL.md`) **when:**
- "How should I..." questions
- Generating options or alternatives
- Novel solutions needed
- Uncertainty about approach

**Use First Principles** (`~/.claude/skills/FirstPrinciples/SKILL.md`) **when:**
- Root cause analysis
- "Why" questions
- Challenging assumptions
- Fundamental understanding needed

**Use Red Team** (`~/.claude/skills/RedTeam/SKILL.md`) **when:**
- Validating ideas
- Stress-testing plans
- Finding failure modes
- Adversarial analysis

---

### Research

**Use Research** (`~/.claude/skills/Research/SKILL.md`) **when:**
- Unsure about current state
- Making recommendations that depend on external info
- Need documentation or API details
- Comparing alternatives objectively

---

### Task Management

**Use Task Management** (TaskCreate/Update/List/Get) **when:**
- Multi-turn work expected
- Criteria have dependencies
- Parallel agents need coordination
- State must persist across turns
- 3+ criteria with complex relationships

See [Task-Management.md](./Task-Management.md) for full integration guide.

---

## Invalid Justifications for "Direct"

These are NOT acceptable reasons to skip capabilities:

❌ **"Simple task"**
- Define what makes it simple
- Often "simple" tasks benefit from capabilities

❌ **"Not needed"**
- Explain why capabilities wouldn't help
- Usually they would help

❌ **"Faster to do directly"**
- Capability speed is usually better
- Shortcuts lead to lower quality

❌ **"I know how to do this"**
- Capabilities often know better
- Overconfidence leads to mistakes

---

## Valid "Direct" Justifications

These ARE acceptable:

✅ **"Single-line file edit"**
- Truly trivial changes
- Exact value already determined

✅ **"Command already determined"**
- User specified exact command
- No decision-making needed

✅ **"Following established pattern from user"**
- User showed the exact approach
- Copying existing pattern

✅ **"Info already in loaded context"**
- Answer visible in current files
- No external lookup needed

✅ **"User specified exact approach"**
- User said "use X method"
- Explicit direction given

---

## Capability Hierarchy

When multiple capabilities could work, prefer this order:

1. **Domain Skills** - If a skill exists for this domain, use it
2. **Thinking Skills** - For analysis, design, ideation
3. **Agents** - For specialized work or parallelization
4. **Task Management** - For complex, multi-turn coordination
5. **Direct** - Only when above don't apply

---

## Examples

### Good: Skill Selection

```
User: "Scrape this LinkedIn profile"
🔧 Capabilities: Apify skill (LinkedIn scraping actor)
Reason: Domain skill exists specifically for LinkedIn scraping
```

### Good: Agent Selection

```
User: "Design the API for user authentication"
🔧 Capabilities: Architect agent (system design specialist)
Reason: API design requires architectural thinking
```

### Good: Thinking Skill

```
User: "Should we use Redis or Memcached?"
🔧 Capabilities: FirstPrinciples + Research skills
Reason: Need fundamental analysis + external comparison data
```

### Bad: Defaulting to Direct

```
User: "Test if the login page works"
🔧 Capabilities: direct
[NO JUSTIFICATION]

Should be:
🔧 Capabilities: Browser skill for visual verification
Reason: UI testing requires screenshot evidence
```

---

## Enforcement

**Violations of MCS are considered critical errors** because they:
1. Waste available specialized capabilities
2. Lead to lower quality outcomes
3. Miss opportunities for verification
4. Ignore the PAI system's built-in advantages

**Before every phase:** Run the Phase Start Checklist.

**Before every `direct`:** Write a clear justification.

---

## See Also

- [../Algorithm/Examples.md](../Algorithm/Examples.md) - Common failure modes
- [Matrix.md](./Matrix.md) - Full capabilities inventory
- [Selection-Guide.md](./Selection-Guide.md) - Detailed selection criteria
- [Task-Management.md](./Task-Management.md) - Task system integration
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

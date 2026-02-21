# Capability Selection Guide - Decision Trees

**Module:** Capabilities/Selection-Guide.md
**Purpose:** Step-by-step decision process for selecting optimal capabilities
**Parent:** [CORE/SKILL.md](../SKILL.md)

---

## Core Principle

**⚠️ CRITICAL: Use this guide at the start of EVERY phase before declaring capabilities. ⚠️**

This is your systematic checklist. Follow the decision trees, not intuition.

**Capabilities are the DEFAULT. "Direct" execution is the EXCEPTION.**

---

## Main Decision Tree

Use this flowchart at the start of every phase:

```
START: What am I about to do?
│
├─ Is there a SKILL for this domain?
│  │
│  ├─ YES ──→ Check Matrix.md for skill triggers
│  │          │
│  │          ├─ Trigger matches? ──→ USE SKILL ✓
│  │          └─ No match ──→ Continue below
│  │
│  └─ NO/UNSURE ──→ Continue below
│
├─ Do I need EXTERNAL INFORMATION?
│  │
│  ├─ YES ──→ Use Research skill ✓
│  │         (MANDATORY for any research request)
│  │
│  └─ NO ──→ Continue below
│
├─ Is this a DECISION or DESIGN question?
│  │
│  ├─ YES ──→ Which type?
│  │         │
│  │         ├─ "How should I...?" ──→ BeCreative ✓
│  │         ├─ "Why does...?" ──→ FirstPrinciples ✓
│  │         ├─ "What could go wrong?" ──→ RedTeam ✓
│  │         └─ System design ──→ Architect Agent ✓
│  │
│  └─ NO ──→ Continue below
│
├─ Am I WRITING CODE (>20 lines)?
│  │
│  ├─ YES ──→ Engineer Agent ✓
│  │
│  └─ NO ──→ Continue below
│
├─ Do I have 2+ INDEPENDENT SUBTASKS?
│  │
│  ├─ YES ──→ Spawn parallel agents ✓
│  │         (Use Intern agents with haiku model)
│  │
│  └─ NO ──→ Continue below
│
├─ Is this MULTI-TURN work?
│  │
│  ├─ YES ──→ Use Task Management ✓
│  │         (TaskCreate/Update/List/Get)
│  │
│  └─ NO ──→ Continue below
│
└─ None of the above? ──→ "direct" execution OK
   (MUST justify why capabilities wouldn't help)
```

---

## Phase-Specific Guidance

### OBSERVE Phase

**Common needs:**
- Understanding codebase structure → Explore agent
- Finding files/patterns → Glob + Grep
- Gathering context → Read files directly
- External information → Research skill

**Decision:**
```
Need to explore unknown codebase?
  ├─ YES → Explore agent (haiku model, fast)
  └─ NO → Read/Glob/Grep directly
```

### THINK Phase

**Common needs:**
- Design decisions → BeCreative, Architect agent
- Root cause analysis → FirstPrinciples
- Risk assessment → RedTeam
- Multiple perspectives → Council skill

**Decision:**
```
Is this creative/strategic thinking?
  ├─ YES → Thinking skill (BeCreative/FirstPrinciples/RedTeam)
  └─ NO → Algorithm agent for structured analysis
```

### PLAN Phase

**Common needs:**
- Creating ISC criteria → Algorithm agent
- Complex planning → Plan Mode (EnterPlanMode)
- Multiple approaches → BeCreative + Evals
- Task breakdown → Task Management

**Decision:**
```
Is this complex/high-stakes planning?
  ├─ YES → EnterPlanMode for dedicated planning
  └─ NO → Algorithm agent for ISC creation
```

### BUILD Phase

**Common needs:**
- Designing architecture → Architect agent
- Creating diagrams → Art skill
- Prototyping approaches → Engineer agent
- Research patterns → Research skill

**Decision:**
```
What are you building?
  ├─ System design → Architect agent
  ├─ Visual content → Art skill
  ├─ Code prototype → Engineer agent
  └─ Knowledge base → Research skill
```

### EXECUTE Phase

**Common needs:**
- Code implementation → Engineer agent
- Parallel work → Multiple Intern agents
- Browser testing → Browser skill
- Research tasks → Research skill

**Decision:**
```
How much code writing?
  ├─ >20 lines → Engineer agent (sonnet model)
  ├─ Multiple files → Parallel Engineer agents
  └─ <20 lines → direct (trivial change)

Need verification?
  ├─ UI changes → Browser skill (screenshot)
  └─ Code changes → Tests (direct if simple)
```

### VERIFY Phase

**Common needs:**
- Browser verification → Browser skill (MANDATORY for UI)
- Test execution → Run tests directly
- Multi-criteria check → Algorithm agent
- Quality review → QATester agent

**Decision:**
```
What needs verification?
  ├─ UI/Visual → Browser skill (MANDATORY screenshot)
  ├─ Multiple criteria → Algorithm agent to verify each
  ├─ Code quality → QATester agent
  └─ Simple output → direct verification
```

### LEARN Phase

**Common needs:**
- Synthesizing insights → Algorithm agent
- Extracting patterns → AutoLearn skill
- Documenting learnings → direct writing
- Comparing approaches → Evals skill

**Decision:**
```
Simple summary or deep synthesis?
  ├─ Deep synthesis → Algorithm agent
  ├─ Pattern extraction → AutoLearn skill
  └─ Simple summary → direct
```

---

## Common Scenario Routing

Quick lookup for frequent patterns:

| Scenario | Capability | Why |
|----------|------------|-----|
| **"Research X"** | Research skill | MANDATORY trigger for any research |
| **"How should I implement X?"** | BeCreative + Engineer agent | Design + implementation |
| **"Fix this bug"** | FirstPrinciples → Engineer | Understand root cause, then fix |
| **"Test if X works"** | Browser skill | Visual verification required |
| **"Design API for X"** | Architect agent | System design specialist |
| **"Implement feature X"** | Plan Mode → Engineer | Plan first for quality |
| **"Create diagram of X"** | Art skill | Visual content creation |
| **"Find files matching X"** | Explore agent | Codebase navigation |
| **"Validate this idea"** | RedTeam skill | Adversarial analysis |
| **"Compare A vs B"** | Research + Evals | External data + objective scoring |
| **"Process 10 items"** | Parallel Intern agents | Independent work parallelized |
| **"Multi-step task"** | Task Management + agents | Persistent state coordination |

---

## Capability Combination Patterns

### Pattern 1: Research → Analysis → Implementation

**Scenario:** Building feature with external dependencies

```
OBSERVE:  Research skill (gather external info)
THINK:    FirstPrinciples (understand fundamentals)
PLAN:     Architect agent (design approach)
BUILD:    Engineer agent (prototype)
EXECUTE:  Engineer agent (implement)
VERIFY:   Browser skill (visual verification)
```

### Pattern 2: Creative Exploration → Evaluation

**Scenario:** Multiple solution approaches

```
THINK:    BeCreative (generate 3 approaches)
PLAN:     Git branching (isolate experiments)
EXECUTE:  3x Engineer agents in parallel (build each)
VERIFY:   Evals skill (objective comparison)
```

### Pattern 3: Parallel Research → Synthesis

**Scenario:** Comprehensive topic research

```
OBSERVE:  Research skill with multiple queries
EXECUTE:  3x Researcher agents in parallel
          (ClaudeResearcher, GeminiResearcher, PerplexityResearcher)
VERIFY:   Algorithm agent (synthesize findings)
LEARN:    WisdomSynthesis skill (deep analysis)
```

### Pattern 4: Adversarial Planning

**Scenario:** High-stakes decision

```
THINK:    BeCreative (generate options)
PLAN:     RedTeam (stress-test each option)
VERIFY:   Council skill (multi-agent debate)
```

### Pattern 5: Multi-Turn Complex Work

**Scenario:** Large refactoring across sessions

```
PLAN:     Task Management (TaskCreate for each criterion)
EXECUTE:  Engineer agents claim tasks via TaskUpdate
          (Work persists across Ralph loops)
VERIFY:   TaskList shows progress, Algorithm agent verifies criteria
```

---

## Model Selection for Agents

When using Task tool agents, choose the right model for speed/capability trade-off:

| Task Type | Model | Latency | Use When |
|-----------|-------|---------|----------|
| **Simple lookups** | `haiku` | 0.5-2s | File checks, simple verification, parallel grunt work |
| **Standard coding** | `sonnet` | 2-5s | Implementation, most coding tasks, analysis |
| **Complex design** | `opus` | 5-15s | Architecture, strategic decisions, deep reasoning |

**Examples:**

```typescript
// Fast parallel verification (10-20x faster than opus)
Task({
  prompt: "Check if blue bar exists on page",
  subagent_type: "Intern",
  model: "haiku"  // ✓ Fast for simple check
})

// Standard implementation
Task({
  prompt: "Implement login form validation",
  subagent_type: "Engineer",
  model: "sonnet"  // ✓ Good balance
})

// Strategic architecture
Task({
  prompt: "Design distributed caching strategy",
  subagent_type: "Architect",
  model: "opus"  // ✓ Deep thinking needed
})
```

**Rule of Thumb:**
- If it's a lookup/check → `haiku`
- If it's implementation → `sonnet`
- If it's strategy/architecture → `opus` (or default)

**Parallel work especially benefits from haiku** - 5 haiku agents are faster AND cheaper than 1 opus doing sequential work.

---

## Skill Trigger Quick Reference

From Matrix.md, frequently-used skill triggers:

| Skill | Triggers | Quick Check |
|-------|----------|-------------|
| **Research** | "research", "find information", "investigate" | ANY research request → USE |
| **Browser** | "browser", "screenshot", "verify UI" | UI changes → MANDATORY |
| **BeCreative** | "be creative", "how should", "deep thinking" | Design decisions → USE |
| **RedTeam** | "red team", "critique", "what could go wrong" | Validation → USE |
| **FirstPrinciples** | "first principles", "root cause", "why" | Understanding → USE |
| **Fabric** | "extract wisdom", "use fabric", "summarize" | Content analysis → USE |
| **Art** | "diagram", "visualization", "flowchart" | Visual content → USE |

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Capability Amnesia

**Bad:**
```
EXECUTE Phase:
🔧 Capabilities: direct
[Manually writes code for 50 lines]
```

**Good:**
```
EXECUTE Phase:
🔧 Capabilities: Engineer agent for implementation
[Engineer agent writes code with TDD approach]
```

### ❌ Anti-Pattern 2: Skipping Phase Start Prompts

**Bad:**
```
PLAN Phase:
[Immediately starts creating ISC without checking for capabilities]
```

**Good:**
```
PLAN Phase:
[Checks: Is there a skill? Should I combine? Need Algorithm agent for ISC?]
🔧 Capabilities: Algorithm agent for ISC creation
```

### ❌ Anti-Pattern 3: "Simple Task" Excuse

**Bad:**
```
🔧 Capabilities: direct
Justification: Simple task
[Task actually needs verification]
```

**Good:**
```
🔧 Capabilities: Browser skill for verification
Reason: UI changes require screenshot evidence
```

### ❌ Anti-Pattern 4: Using Wrong Agent Type

**Bad:**
```
Task({
  prompt: "Research latest React patterns",
  subagent_type: "Engineer"  // ❌ Wrong - Engineer doesn't research
})
```

**Good:**
```
Skill("Research")  // ✓ Research skill for research requests
```

### ❌ Anti-Pattern 5: Sequential When Could Parallel

**Bad:**
```
EXECUTE Phase:
Task({ prompt: "Test endpoint 1", ... })
[Wait for completion]
Task({ prompt: "Test endpoint 2", ... })
[Wait for completion]
Task({ prompt: "Test endpoint 3", ... })
```

**Good:**
```
EXECUTE Phase:
// Launch all 3 in parallel (single message)
Task({ prompt: "Test endpoint 1", model: "haiku", ... })
Task({ prompt: "Test endpoint 2", model: "haiku", ... })
Task({ prompt: "Test endpoint 3", model: "haiku", ... })
```

---

## When "Direct" Is Actually OK

These are valid justifications:

✅ **Single-line file edit** - Exact change already determined
✅ **Command already determined** - User specified exact command
✅ **Following established pattern** - User showed exact approach
✅ **Info already in context** - Answer visible in loaded files
✅ **Trivial file read** - Simple cat/head operation
✅ **User specified exact approach** - Explicit direction given

**If you can't clearly articulate why "direct" is better than a capability, USE A CAPABILITY.**

---

## See Also

- [Matrix.md](./Matrix.md) - Complete capability inventory with 39 skills
- [MCS.md](./MCS.md) - Mandatory Capability Selection rules and enforcement
- [Task-Management.md](./Task-Management.md) - Task tools integration patterns
- [../Algorithm/Examples.md](../Algorithm/Examples.md) - Common failure modes
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

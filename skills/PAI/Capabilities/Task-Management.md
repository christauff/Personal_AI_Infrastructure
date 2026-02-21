# Task Management Integration Guide

**Module:** Capabilities/Task-Management.md
**Purpose:** Integration guide for Task tools (TaskCreate/Update/List/Get) with PAI Algorithm
**Parent:** [CORE/SKILL.md](../SKILL.md)
**Version:** v2.1.16+ Task tools

---

## Core Principle

**⚠️ CRITICAL: Task Management extends ISC for persistent, multi-turn, and parallel work. ⚠️**

ISC (Ideal State Criteria) provides verification within a single session. Task tools add:
- **Persistence** across turns and sessions
- **Dependencies** between criteria (blockedBy/blocks)
- **Parallel coordination** for multiple agents working simultaneously
- **State tracking** for long-running work

**Rule:** Use Tasks when state must persist beyond single turn or coordinate multiple agents.

---

## When to Use Tasks vs ISC-Only

| Factor | ISC Only | Tasks + ISC | Why |
|--------|----------|-------------|-----|
| **Turns** | Single-turn work | Multi-turn work (Ralph loops) | Tasks persist across turns |
| **Agents** | Single agent or simple parallel | Complex parallel with dependencies | Tasks coordinate agent work |
| **Dependencies** | Simple sequential criteria | Complex dependency graphs | Tasks enforce blockedBy rules |
| **State** | Session-scoped | Needs to survive session end | Tasks persist to filesystem |
| **Criteria Count** | 1-5 independent criteria | 6+ with relationships | Tasks manage complexity |
| **Verification** | Self-contained in VERIFY phase | Needs external tracking | TaskList shows global state |

### Decision Tree

```
START
  │
  ├─ Will work span multiple turns? ─YES─→ Use Tasks + ISC
  │
  ├─ Are there 3+ agents with dependencies? ─YES─→ Use Tasks + ISC
  │
  ├─ Does state need to persist after session? ─YES─→ Use Tasks + ISC
  │
  └─ Otherwise ──→ Use ISC Only
```

---

## ISC → Task Field Mapping

### Field Correspondence

| ISC Concept | Task Tool Field | Notes |
|-------------|-----------------|-------|
| **Criterion text** (8 words) | `subject` | Imperative form: "Run tests" |
| **Criterion details** | `description` | Detailed requirements |
| **Active form** | `activeForm` | Present continuous: "Running tests" |
| **Status** (⬜/🔄/✅/❌) | `status` | pending/in_progress/completed |
| **Dependency order** | `blockedBy` array | Task IDs that must complete first |
| **Blocks criteria** | `blocks` array | Task IDs waiting on this one |
| **Evidence** | `metadata.evidence` | Verification proof |
| **Owner** | `owner` | Agent ID for parallel work |

### Example Mapping

**ISC Criterion:**
```
│ 1 │ Login form validates email format correctly │ ⬜ PENDING │
```

**Task Equivalent:**
```typescript
TaskCreate({
  subject: "Validate email format in login form",
  description: "Implement client-side email validation for login form. Reject invalid formats (missing @, no domain). Show error message 'Invalid email format' below input field.",
  activeForm: "Validating email format",
  metadata: { component: "LoginForm.tsx", line: 42 }
})
```

---

## Multi-Turn Coordination Patterns

### Pattern 1: Ralph Loop with Task Persistence

**Scenario:** Work interrupted mid-execution, must resume next turn

```
TURN 1 (PLAN Phase):
  TaskCreate({ subject: "Implement user authentication", ... })
  TaskCreate({ subject: "Add session management", ... })
  TaskCreate({ subject: "Test login flow", ... })
  TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })  // Session needs auth
  TaskUpdate({ taskId: "3", addBlockedBy: ["2"] })  // Tests need session

TURN 1 (EXECUTE Phase):
  TaskUpdate({ taskId: "1", status: "in_progress" })
  [Implement auth... session ends]

TURN 2 (Resume):
  TaskList()  // Shows Task 1 in_progress, Tasks 2-3 pending
  [Resume Task 1 implementation]
  TaskUpdate({ taskId: "1", status: "completed", metadata: { evidence: "..." }})

  TaskUpdate({ taskId: "2", status: "in_progress" })
  [Implement session management]
```

### Pattern 2: Algorithm Agent Delegation

**Scenario:** Main agent delegates work to sub-agents, tracks via Tasks

```
MAIN AGENT (PLAN):
  TaskCreate({ subject: "Extract Format.md module", owner: "main" })
  TaskCreate({ subject: "Extract ISC-System.md module", owner: "main" })
  TaskCreate({ subject: "Update SKILL.md references", owner: "main" })
  TaskUpdate({ taskId: "3", addBlockedBy: ["1", "2"] })

MAIN AGENT (EXECUTE):
  Task({
    prompt: "Extract Format.md from SKILL.md lines 200-420",
    subagent_type: "Algorithm"
  })
  TaskUpdate({ taskId: "1", status: "completed" })

  Task({
    prompt: "Extract ISC-System.md from SKILL.md lines 421-601",
    subagent_type: "Algorithm"
  })
  TaskUpdate({ taskId: "2", status: "completed" })

MAIN AGENT (VERIFY):
  TaskList()  // All tasks completed
  [Proceed with reference updates]
```

---

## Parallel Agent Task Coordination

### Pattern 3: Parallel Agents with Task Ownership

**Scenario:** 4 agents working simultaneously on independent tasks

```
MAIN AGENT (PLAN):
  TaskCreate({ subject: "Test login endpoint", description: "..." })
  TaskCreate({ subject: "Test registration endpoint", description: "..." })
  TaskCreate({ subject: "Test password reset endpoint", description: "..." })
  TaskCreate({ subject: "Test profile update endpoint", description: "..." })

MAIN AGENT (EXECUTE):
  // Launch 4 agents in PARALLEL (single message, multiple Task calls)
  Task({
    prompt: "Claim task 1 via TaskUpdate, test login endpoint, mark completed",
    subagent_type: "Engineer",
    model: "sonnet"
  })
  Task({
    prompt: "Claim task 2 via TaskUpdate, test registration endpoint, mark completed",
    subagent_type: "Engineer",
    model: "sonnet"
  })
  Task({
    prompt: "Claim task 3 via TaskUpdate, test password reset endpoint, mark completed",
    subagent_type: "Engineer",
    model: "sonnet"
  })
  Task({
    prompt: "Claim task 4 via TaskUpdate, test profile update endpoint, mark completed",
    subagent_type: "Engineer",
    model: "sonnet"
  })

EACH AGENT:
  TaskUpdate({ taskId: "N", status: "in_progress", owner: "agent-xyz" })
  [Do work]
  TaskUpdate({ taskId: "N", status: "completed", metadata: { evidence: "..." }})

MAIN AGENT (VERIFY):
  TaskList()  // All tasks show completed
```

### Pattern 4: Parallel with Dependencies

**Scenario:** Parallel work with some sequential constraints

```
PLAN:
  TaskCreate({ subject: "Design API schema" })           // Task 1
  TaskCreate({ subject: "Implement GET endpoint" })      // Task 2
  TaskCreate({ subject: "Implement POST endpoint" })     // Task 3
  TaskCreate({ subject: "Write integration tests" })     // Task 4

  TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })  // GET needs schema
  TaskUpdate({ taskId: "3", addBlockedBy: ["1"] })  // POST needs schema
  TaskUpdate({ taskId: "4", addBlockedBy: ["2", "3"] })  // Tests need endpoints

EXECUTE:
  // Phase 1: Schema design (blocking)
  Task({ prompt: "Do task 1 (schema)", ... })

  // Phase 2: Endpoints in parallel (unblocked after schema)
  Task({ prompt: "Do task 2 (GET)", ... })
  Task({ prompt: "Do task 3 (POST)", ... })

  // Phase 3: Tests (blocked until endpoints done)
  Task({ prompt: "Do task 4 (tests)", ... })
```

---

## Dependency Management

### Using blockedBy and blocks

**blockedBy**: Tasks that must complete before this task can start
**blocks**: Tasks waiting for this task to complete

```typescript
// Task 2 cannot start until Task 1 is completed
TaskUpdate({
  taskId: "2",
  addBlockedBy: ["1"]
})

// Equivalent to:
TaskUpdate({
  taskId: "1",
  addBlocks: ["2"]
})
```

### Dependency Validation

Before claiming a task:
```typescript
const task = TaskGet({ taskId: "2" })
if (task.blockedBy.length > 0) {
  // Check if all blocking tasks are completed
  const blockingTasks = task.blockedBy.map(id => TaskGet({ taskId: id }))
  const allComplete = blockingTasks.every(t => t.status === "completed")

  if (!allComplete) {
    // Cannot start yet - blocking tasks incomplete
    return
  }
}

// Safe to start
TaskUpdate({ taskId: "2", status: "in_progress" })
```

---

## Task Lifecycle Management

### Status Transitions

```
pending ──→ in_progress ──→ completed
   │              │
   └──────────────┴──→ deleted (if no longer needed)
```

**Rules:**
- ONLY mark completed when work is FULLY done
- If blocked, keep in_progress (don't mark completed)
- If errors/failures, keep in_progress and document in metadata
- Use deleted for cancelled/obsolete tasks

### Metadata Best Practices

```typescript
TaskUpdate({
  taskId: "1",
  status: "completed",
  metadata: {
    evidence: "Tests passing: 15/15",
    commit: "a2b5c1f",
    files_modified: ["LoginForm.tsx", "auth.test.ts"],
    verification_date: "2026-02-02T12:30:00Z"
  }
})
```

---

## Common Patterns

### Pattern: Spotcheck After Parallel Work

```typescript
// Launch 5 parallel agents to process items
for (let i = 1; i <= 5; i++) {
  Task({ prompt: `Process item ${i}...`, ... })
}

// ALWAYS: Launch spotcheck agent after parallel work
Task({
  prompt: "Review all 5 completed tasks via TaskList, verify quality",
  subagent_type: "Algorithm",
  model: "haiku"  // Fast for verification
})
```

### Pattern: ISC + Tasks Hybrid

```
PLAN Phase (ISC Table):
│ 1 │ API endpoints implemented with validation │ ⬜ PENDING │
│ 2 │ All endpoints tested with passing results │ ⬜ PENDING │
│ 3 │ API documentation updated with new endpoints │ ⬜ PENDING │

PLAN Phase (Tasks):
TaskCreate({ subject: "Implement API endpoints", ... })  // Maps to ISC 1
TaskCreate({ subject: "Test all endpoints", ... })       // Maps to ISC 2
TaskCreate({ subject: "Update API docs", ... })          // Maps to ISC 3

VERIFY Phase:
- TaskList shows 3/3 completed
- ISC table shows 3/3 ✅
- Both match = verification passed
```

---

## See Also

- [../Algorithm/ISC-System.md](../Algorithm/ISC-System.md) - ISC framework and criteria rules
- [./MCS.md](./MCS.md) - When to use Task Management capability
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference
- [~/.claude/skills/PAI/SYSTEM/THEDELEGATIONSYSTEM.md](../SYSTEM/THEDELEGATIONSYSTEM.md) - Parallel agent patterns

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

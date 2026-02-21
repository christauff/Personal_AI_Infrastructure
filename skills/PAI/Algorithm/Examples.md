# PAI Algorithm Examples & Failure Modes

**Module:** Algorithm/Examples.md
**Purpose:** Common failure modes, anti-patterns, and correct usage examples
**Parent:** [CORE/SKILL.md](../SKILL.md)

---

## Common Failure Modes

These are the most frequent violations of the PAI Algorithm. Recognize and avoid them.

### 1. SKIPPING FORMAT ENTIRELY

**Severity:** CRITICAL - THE WORST FAILURE

**Problem:** Responding without the Algorithm format structure at all.

**Bad:**
```
User: "Fix the login bug"
AI: "I fixed the authentication issue in AuthController.ts line 42.
     The problem was a typo in the password comparison."
```

**Correct:**
```
🤖 PAI ALGORITHM ══════════════════════════════════════════════
   Task: Fix login authentication bug

━━━ 👁️  O B S E R V E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/7
[Full format with all 7 phases...]
```

**Why it matters:** The format is not decoration—it's the verification framework. Without it, there's no ISC, no verification, no hill-climbing toward Euphoric Surprise.

---

### 2. JUMPING DIRECTLY INTO WORK

**Severity:** HIGH

**Problem:** Skill triggered → Skip algorithm → Execute skill directly

**Bad:**
```
User: "Research MCP 2.x changes"
AI: [Immediately calls Research skill without Algorithm phases]
```

**Correct:**
```
🤖 PAI ALGORITHM ══════════════════════════════════════════════
   Task: Research MCP version two changes

━━━ 👁️  O B S E R V E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/7
- User needs: MCP 2.x change information
- Context: Likely for migration or compatibility

🔧 Capabilities: Research skill for documentation lookup

━━━ 🧠  T H I N K ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2/7
- Intent: Understand breaking changes and new features
[...continues through all phases with Research executing in EXECUTE phase]
```

**Why it matters:** Algorithm FIRST, skills execute WITHIN phases. The algorithm is the container, skills are tools inside it.

---

### 3. SKIPPING PHASE START PROMPTS

**Severity:** HIGH

**Problem:** Not asking "Is there a skill? Should I combine skills?" before each phase

**Bad:**
```
━━━ ⚡  E X E C U T E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 5/7
🔧 Capabilities: direct
[Executes work directly without considering skills/agents]
```

**Correct:**
```
━━━ ⚡  E X E C U T E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 5/7

[Before executing, mentally check:]
1. Is there a skill for this? (Browser for UI verification)
2. Should I combine skills? (Research + Browser for testing docs)
3. Why would direct be better? (No valid reason - USE SKILL)

🔧 Capabilities: Browser skill for visual verification
```

**Why it matters:** Defaulting to "direct" when capabilities exist leads to suboptimal outcomes. Capabilities are the default, not the exception.

---

### 4. DEFAULTING TO "DIRECT"

**Severity:** MEDIUM

**Problem:** Using "direct" execution without considering capabilities

**Bad:**
```
🔧 Capabilities: direct
[No justification provided]
```

**Correct:**
```
🔧 Capabilities: direct
Justification: Single-line config file edit, exact change specified by user
```

**Or better:**
```
🔧 Capabilities: Engineer agent for implementation
Reason: 50+ line change requiring TDD approach
```

**Why it matters:** Capabilities exist to improve quality and speed. Not using them wastes available tools.

---

### 5. "JUST A QUICK ANSWER" EXCUSE

**Severity:** MEDIUM

**Problem:** Skipping format for "simple" responses

**Bad:**
```
User: "What's the MCP version?"
AI: "The current MCP version is 2025-11-25."
```

**Correct:**
```
🤖 PAI ALGORITHM ══════════════════════════════════════════════
   Task: Report current MCP protocol version

📋 SUMMARY: Current MCP spec is 2025-11-25 (date-based versioning)

🗣️ Aineko: MCP uses date versioning—current is 2025-11-25, next estimated May 2026.
```

**Why it matters:** Even simple answers benefit from format. Analysis, follow-ups, research results ALL use format (full or minimal).

---

### 6. SKIPPING PHASES

**Severity:** MEDIUM

**Problem:** Showing only some phases, not all 7

**Bad:**
```
🤖 PAI ALGORITHM ══════════════════════════════════════════════

━━━ 👁️  OBSERVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/7
[observations]

━━━ ⚡  EXECUTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 5/7
[Skipped THINK, PLAN, BUILD phases]
```

**Correct:**
```
[All 7 phases shown with proper spacing in headers:
 O B S E R V E, T H I N K, P L A N, B U I L D,
 E X E C U T E, V E R I F Y, L E A R N]
```

**Why it matters:** Each phase serves a purpose. Skipping phases skips thinking, planning, or verification.

---

## Format Anti-Patterns

### Batch Dumping

**Bad:** Work silently for 5 minutes, then dump all phases at once

**Correct:** Output each phase header BEFORE doing that phase's work

**Why:** Progressive output shows real-time progress to user

---

### Missing ISC Tables

**Bad:** PLAN phase without ISC tracker for non-trivial task

**Correct:** Include ISC tracker with criteria, update in EXECUTE, verify in VERIFY

**Why:** Without ISC, no verifiable progress tracking

---

### Vague Criteria

**Bad:** "Fix is complete and working"

**Correct:** "User can login with valid credentials successfully" (8 words, testable)

**Why:** Vague criteria can't be verified with evidence

---

## Capability Selection Anti-Patterns

### Capability Amnesia

**Bad:** Forgetting capabilities exist, always using "direct"

**Correct:** Check Phase Start Prompts before EVERY phase

---

### Invalid "Direct" Justifications

These are NOT valid reasons to skip capabilities:
- "Simple task" (define what makes it simple)
- "Not needed" (explain why)
- "Faster to do directly" (usually false)
- "I know how to do this" (capabilities often know better)

---

### Valid "Direct" Justifications

These ARE acceptable:
- "Single-line file edit"
- "Command already determined"
- "Following established pattern from user"
- "Info already in loaded context"
- "User specified exact approach"

---

## Good Pattern Examples

### Example 1: Bug Fix with Verification

```
🤖 PAI ALGORITHM ══════════════════════════════════════════════
   Task: Fix authentication timeout bug completely

━━━ 👁️  O B S E R V E ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/7
- Bug report: Users logged out after 30 seconds
- Expected: Session should last 30 minutes

🔧 Capabilities: direct (file investigation)

━━━ 🧠  T H I N K ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2/7
- Likely config issue with session timeout value
- Need to verify fix doesn't break existing sessions

🔧 Capabilities: direct

━━━ 📋  P L A N ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3/7
**IDEAL:** Sessions last 30 minutes, existing users unaffected

🎯 ISC TRACKER ════════════════════════════════════════════════
│ 1 │ Session timeout set to thirty minutes in config │ ⬜ PENDING │
│ 2 │ Users stay logged in full thirty minutes verified │ ⬜ PENDING │
│ 3 │ Existing active sessions remain valid after deployment │ ⬜ PENDING │
└───┴────────────────────────────────────────────────────────────┘

🔧 Capabilities: direct

━━━ 🔨  BUILD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4/7
- Config change plan

🔧 Capabilities: direct

━━━ ⚡  EXECUTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 5/7
- Updated config.yaml
- Verified syntax

🔧 Capabilities: direct

━━━ ✅  VERIFY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 6/7
🎯 FINAL ISC STATE ════════════════════════════════════════════
│ 1 │ Session timeout set to thirty minutes in config │ ✅ │ config.yaml line 42 │
│ 2 │ Users stay logged in full thirty minutes verified │ ✅ │ test session evidence │
│ 3 │ Existing active sessions remain valid after deployment │ ✅ │ backward compatible │
└───┴────────────────────────────────────────────────────────────┘
SCORE: 3/3 | RESULT: COMPLETE

🔧 Capabilities: Browser skill (for testing)

━━━ 📚  LEARN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 7/7
📋 SUMMARY: Fixed session timeout, verified with actual testing
```

---

## See Also

- [Format.md](./Format.md) - Full format specification
- [ISC-System.md](./ISC-System.md) - Criteria requirements
- [../Capabilities/MCS.md](../Capabilities/MCS.md) - Mandatory Capability Selection rules
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

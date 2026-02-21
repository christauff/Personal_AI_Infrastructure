# SkillHarvester Skill

**Created:** 2026-01-30
**Purpose:** Extract recurring patterns from sessions and propose new skills
**Part of:** The Accelerando System

---

## Overview

Patterns repeat. Workflows that work get reused. SkillHarvester watches for
these patterns and proposes formalizing them into proper PAI skills.

**Philosophy:** The Accelerando cat evolved by recognizing and accumulating
useful patterns. SkillHarvester makes PAI self-improving - the skills that
work naturally become part of the system.

---

## Voice Notification

**MANDATORY - Execute immediately:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running SkillHarvester to find skill candidates"}' \
  > /dev/null 2>&1 &
```

---

## How It Works

### Pattern Detection

1. **Session Analysis**
   - Read recent session transcripts
   - Identify repeated tool sequences
   - Find common prompt patterns
   - Detect recurring user requests

2. **Pattern Scoring**
   - Frequency: How often does this pattern appear?
   - Value: Did it produce good outcomes (ratings)?
   - Complexity: Is it worth formalizing?
   - Uniqueness: Is there already a skill for this?

3. **Candidate Generation**
   - For high-scoring patterns, generate skill proposal
   - Include suggested triggers, workflows, structure
   - Stage in `Patterns/candidates.jsonl`

4. **Human Review**
   - Present candidates in morning brief or on request
   - Christauff approves/rejects/modifies
   - Approved candidates get scaffolded into skills/

---

## Pattern Types

### Workflow Patterns
Repeated sequences of actions:
```
research → synthesize → redteam
```
→ Could become a "StrategicAnalysis" skill

### Request Patterns
Similar user requests:
```
"check on {project}"
"status of {work}"
"where were we on {topic}"
```
→ Could become a "WorkStatus" skill

### Tool Combinations
Tools used together:
```
WebSearch + Grep + Read → synthesis
```
→ Could become a "QuickResearch" workflow

### Prompt Patterns
Effective prompt structures:
```
"Think about X from perspective of Y"
```
→ Could become a reusable template

---

## Data Storage

```
Patterns/
├── triggers.yaml             # Common user request patterns
├── candidates.jsonl          # Skills waiting for approval
├── approved/                 # Approved candidates (pre-build)
│   └── {skill-name}.yaml
├── rejected/                 # Rejected candidates (for learning)
│   └── {skill-name}.yaml
└── metrics/
    └── pattern-stats.jsonl   # Pattern occurrence tracking
```

---

## Candidate Format

```yaml
# candidates.jsonl entry
{
  "id": "candidate-001",
  "name": "StrategicAnalysis",
  "pattern": "research → synthesize → redteam",
  "frequency": 5,
  "sessions": ["2026-01-28", "2026-01-29", "2026-01-30"],
  "value_score": 8.5,
  "complexity": "medium",
  "proposed_triggers": [
    "strategic analysis on",
    "analyze strategy for",
    "full analysis of"
  ],
  "proposed_workflows": [
    "Research phase",
    "Synthesis phase",
    "RedTeam phase"
  ],
  "status": "pending",
  "detected": "2026-01-30T23:00:00Z"
}
```

---

## Workflow Routing

| Workflow | Triggers | Description |
|----------|----------|-------------|
| `Workflows/Scan.md` | "scan for skill candidates" | Analyze recent sessions |
| `Workflows/Review.md` | "review skill candidates" | Present candidates for approval |
| `Workflows/Build.md` | "build skill {name}" | Scaffold approved candidate |

---

## Integration Points

### Session Transcripts
Reads from `projects/{project}/*.jsonl` for pattern analysis.

### MEMORY/LEARNING
Extracts patterns from learnings and failures.

### CreateSkill
Hands off approved candidates to CreateSkill for scaffolding.

### MorningBrief
Surfaces pending candidates for review.

---

## Example Session

```
User: Review skill candidates

Aineko: I've identified 2 potential skills from recent sessions:

## Candidate 1: StrategicAnalysis
**Pattern:** research → synthesize → redteam
**Frequency:** 5 times in last 3 sessions
**Proposed triggers:** "strategic analysis on", "full analysis of"

This pattern appeared in:
- Agent landscape research (today)
- Hardware strategy (yesterday)
- Funding model analysis (Jan 28)

**Recommendation:** Strong candidate - high frequency, consistent value

## Candidate 2: WorkResume
**Pattern:** read status file → load context → continue
**Frequency:** 3 times
**Proposed triggers:** "continue {work}", "resume {project}"

**Recommendation:** Medium candidate - useful but may overlap with existing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Approve, reject, or modify?

User: Approve StrategicAnalysis, reject WorkResume

Aineko: [Creates skill scaffold for StrategicAnalysis]
[Logs rejection for WorkResume with reason]
```

---

## Quality Signals

### Good Candidate Indicators
- Appears 3+ times
- Associated with high ratings
- Clear input/output pattern
- Not covered by existing skill

### Poor Candidate Indicators
- One-off occurrence
- Negative feedback associated
- Too vague or broad
- Already covered by existing skill

---

## Changelog

- **2026-01-30:** Initial creation as part of Accelerando System

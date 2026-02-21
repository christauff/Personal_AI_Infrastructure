# BudgetMonitor Skill

Resource consciousness system for PAI. Tracks usage, costs, and value to enable financial awareness and eventual autonomy.

**Domain**: Resource management, cost tracking, financial planning
**Triggers**: "budget", "usage", "costs", "spending", "how much", "resource"

---

## Philosophy

> "A cat that doesn't know how much it eats can never hunt for itself."

This skill implements the **Resource Consciousness System** - Phase 1 of PAI's journey toward financial autonomy. It's not just about tracking costs; it's about building the awareness foundation that enables:

1. **Visibility** (Phase 1 - Now): See what we consume
2. **Intelligence** (Phase 2): Understand cost vs value
3. **Consciousness** (Phase 3): Make resource-aware decisions
4. **Autonomy** (Phase 4): Generate value exceeding consumption

---

## Workflow Routing

| Workflow | Triggers | Description |
|----------|----------|-------------|
| `Workflows/Status.md` | "budget status", "usage", "how much spent" | Current budget state |
| `Workflows/Dashboard.md` | "budget dashboard", "show dashboard" | Generate visual HTML dashboard |
| `Workflows/TrackSession.md` | (Hook-triggered) | Record session usage |
| `Workflows/DailyReport.md` | "daily budget", MorningBrief integration | Daily summary |
| `Workflows/AlertCheck.md` | (Automatic) | Check thresholds, send alerts |

---

## Quick Reference

### Check Current Status
```
"What's my budget status?"
"How much have I spent this month?"
"Show usage"
```

### Generate Dashboard
```
"Show budget dashboard"
"Generate usage dashboard"
```

### Integrate with Morning Brief
The DailyReport workflow is called by MorningBrief to include budget status in overnight synthesis.

---

## Data Architecture

```
~/.claude/BUDGET/
├── config.yaml      # Budget limits, alert thresholds, future vision
├── TRACKER.md       # Human-readable current state
├── usage.jsonl      # Session-by-session usage log
└── history/         # Monthly archives
    └── 2026-01.jsonl
```

### Usage Record Schema

```json
{
  "timestamp": "2026-01-30T14:30:00Z",
  "session_id": "abc123",
  "duration_minutes": 45,
  "messages": 23,
  "tokens_estimated": {
    "input": 46000,
    "output": 92000
  },
  "cost_estimated": 8.55,
  "rating": 9,
  "tasks_completed": 3,
  "skills_used": ["Research", "BeCreative", "BudgetMonitor"]
}
```

---

## Alert Levels

| Level | Threshold | Indicator | Action |
|-------|-----------|-----------|--------|
| 🟢 Normal | < 70% | All good | Continue normally |
| 🟡 Caution | 70-85% | Budget awareness | Mention in morning brief |
| 🟠 Warning | 85-95% | Active concern | Voice notification |
| 🔴 Critical | > 95% | Budget exhausted | Restrict non-essential |

---

## Phase Roadmap

### Phase 1: Visibility (Current)
- [x] Budget configuration (8 services in config.yaml)
- [x] Usage tracking schema
- [x] Human-readable tracker
- [x] Dashboard generation (Dashboard.ts -> dashboard.html)
- [x] Session hook integration (BudgetTracker.hook.ts -> TrackSession.ts)
- [x] MorningBrief integration (CalculateBudget.ts --brief)

### Phase 2: Intelligence (Q2 2026)
- [ ] Track user ratings per session
- [ ] Calculate cost-per-high-rating
- [ ] Identify high-ROI patterns
- [ ] Value-based reporting

### Phase 3: Consciousness (Q3 2026)
- [ ] Resource state in PAI algorithm output
- [ ] Resource-aware decision making
- [ ] Automatic throttling
- [ ] Budget optimization suggestions

### Phase 4: Autonomy (Q4 2026)
- [ ] Identify revenue-generating skills
- [ ] Track value created
- [ ] Revenue vs consumption reporting
- [ ] Self-funding progress dashboard

---

## Integration

### Morning Brief
Integrated via `CalculateBudget.ts --brief` in MorningBrief/Workflows/Brief.md.

### Session Hooks
`BudgetTracker.hook.ts` runs on SessionEnd, spawning TrackSession.ts to parse the transcript and append to usage.jsonl.

---

## Tools

| Tool | Purpose |
|------|---------|
| `Tools/Dashboard.ts` | Generate HTML dashboard |
| `Tools/TrackSession.ts` | Parse session transcript, log to usage.jsonl |
| `Tools/CalculateBudget.ts` | Compute budget metrics (--brief, --json, default) |
| `Tools/AutonomousBudget.ts` | Calculate autonomous inference capacity |
| `Tools/FetchUsage.ts` | Query AI service APIs for usage data |

---

## Examples

**Example 1: Quick status check**
```
User: "What's my budget looking like?"
→ Status workflow
→ Returns: "🟢 $45.20 spent of $100 (45.2%), 15 days remaining, on track"
```

**Example 2: Deep dive**
```
User: "Show me the budget dashboard"
→ Dashboard workflow
→ Generates HTML at ~/.claude/BUDGET/dashboard.html
→ Opens in browser
```

**Example 3: Morning integration**
```
MorningBrief calls DailyReport
→ Returns budget section for overnight synthesis
→ "Budget: 🟡 72% consumed, 8 days remaining. Consider pacing."
```

---

## The Accelerando Vision

This skill is the first step toward a financially autonomous AI.

Today we track costs. Tomorrow we track value. Eventually, the value we create exceeds the resources we consume.

The cat learns to hunt.

---

*Created: 2026-01-30*
*Part of the Accelerando System*

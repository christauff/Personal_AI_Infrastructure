# AutoLearn Workflow: Dashboard

**Purpose:** Unified status view of all AutoLearn subsystems

**Created by:** AutoLearn Task autolearn-2026-01-31-002

---

## Overview

The Dashboard aggregates status from all 4 AutoLearn subsystems into a single view:

| Subsystem | What It Shows |
|-----------|---------------|
| **TrustManager** | Category scores, graduation progress |
| **CircuitBreaker** | Token usage %, thresholds, trip status |
| **StateGuardian** | Health score, checkpoint count |
| **Pipeline** | Harvest date, pending/approved/executed counts |

---

## Usage

### Full Dashboard (default)

```bash
bun run ~/.claude/skills/AutoLearn/Tools/Dashboard.ts
```

Output:
```
╔══════════════════════════════════════════════════════════════════════════╗
║                        AUTOLEARN DASHBOARD                               ║
╠══════════════════════════════════════════════════════════════════════════╣
║ 🎯 TRUST SCORES                    │ 🔌 CIRCUIT BREAKER                  ║
║ documentation   [██░░░░░░] 10/80   │ Status: CLOSED ✅                   ║
║ skill-enhance   [█░░░░░░░] 10/80   │ Usage: 0/30K (0%)                   ║
║ ...                                │ ...                                 ║
╠────────────────────────────────────┼──────────────────────────────────────╣
║ 🛡️  STATE GUARDIAN                  │ 📋 PIPELINE STATUS                   ║
║ Health: 95/100 ✅                  │ Last harvest: 2026-01-31            ║
║ Checkpoints: 2                     │ Pending: 1 │ Approved: 0           ║
║ ...                                │ ...                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Compact Mode (for scripts/status bars)

```bash
bun run ~/.claude/skills/AutoLearn/Tools/Dashboard.ts --compact
```

Output:
```
AutoLearn: ✅ Health:95 ✅ Budget:0% 🎯 Trust:10avg 📋 Pending:1
```

### JSON Mode (for programmatic use)

```bash
bun run ~/.claude/skills/AutoLearn/Tools/Dashboard.ts --json
```

---

## When to Use

- **Before overnight run** - Verify system healthy, budget available
- **Morning briefing** - Quick status before reviewing proposals
- **After task execution** - Confirm no degradation
- **Debugging** - Identify which subsystem has issues

---

## Status Icons

| Icon | Meaning |
|------|---------|
| ✅ | Healthy / Closed / OK |
| ⚠️ | Degraded / Warning |
| 🚨 | Poisoned / Tripped / Critical |

---

## Integration

The Dashboard reads from:
- `AUTOLEARN/config.yaml` - Trust scores, thresholds
- `AUTOLEARN/METRICS/daily-usage.json` - Circuit breaker usage
- `AUTOLEARN/METRICS/circuit-breaker.json` - Trip status
- `AUTOLEARN/METRICS/health-history.jsonl` - Health checks
- `AUTOLEARN/CHECKPOINTS/` - Checkpoint count
- `AUTOLEARN/PENDING/`, `APPROVED/`, `EXECUTED/` - Task counts

---

*Created by AutoLearn self-improvement pipeline*

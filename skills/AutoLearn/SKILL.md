# AutoLearn Skill

**Purpose:** Autonomous learning system that extracts insights from Claude Code community content and proposes PAI improvements.

**Part of:** Accelerando System

---

## Trigger Conditions

USE THIS SKILL WHEN user says:
- "autolearn", "auto learn", "autonomous learning"
- "self improvement", "self-improvement"
- "learn from community", "harvest insights"
- "what did you learn overnight"
- "autolearn status", "trust scores"

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTOLEARN PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  HARVEST ──► EXTRACT ──► VALIDATE ──► GENERATE ──► GATE ──► EXECUTE        │
│     │           │           │            │          │          │            │
│  Content    Wisdom      RedTeam       Tasks     Morning    Engineer        │
│  Fetch     Synthesis    8 agents    Proposal    Brief      Agent          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflows

### Harvest
`Workflows/Harvest.md`
Fetch new content from monitored creators.

### Extract
`Workflows/Extract.md`
Extract actionable insights using WisdomSynthesis pipeline.

### Validate
`Workflows/Validate.md`
Challenge insights with RedTeam adversarial analysis.

### Generate
`Workflows/Generate.md`
Convert validated insights into task proposals.

### Execute
`Workflows/Execute.md`
Implement approved tasks with verification.

---

## Tools

### TrustManager.ts
Track trust scores, handle graduation, log history.

```bash
# Check current trust scores
bun run ~/.claude/skills/AutoLearn/Tools/TrustManager.ts status

# Record approval outcome
bun run ~/.claude/skills/AutoLearn/Tools/TrustManager.ts record <task-id> <outcome>

# Check if category is graduated
bun run ~/.claude/skills/AutoLearn/Tools/TrustManager.ts check <category>
```

---

## Configuration

All settings in `~/.claude/AUTOLEARN/config.yaml`:

| Setting | Default | Description |
|---------|---------|-------------|
| gate_mode | morning-brief | Approval workflow |
| graduation_threshold | 80 | Trust score for auto-approve |
| injection_threshold | 0.7 | Minimum injection detection score |
| total_max | 30000 | Token budget per run |

---

## Security Model

**6-Layer Defense Against Prompt Injection:**

1. **Content Isolation** - External content wrapped in delimiters, treated as data
2. **Structural Extraction** - Only specific fields extracted with character limits
3. **Injection Detection** - RedTeam agent explicitly hunts for injection patterns
4. **Task Sandboxing** - Forbidden patterns auto-reject tasks
5. **Human Review** - MorningBrief shows full context for approval
6. **Audit Trail** - Every decision logged with content hash

---

## Trust Categories

| Category | Risk Level | Can Graduate? |
|----------|------------|---------------|
| documentation | LOW | Yes |
| test-addition | LOW | Yes |
| skill-enhancement | MEDIUM | Yes |
| config-change | MEDIUM | Yes |
| new-skill | HIGH | No (always gated) |
| infrastructure | HIGH | No (always gated) |
| security | HIGH | No (always gated) |

---

## Integration

- **Overnight Processor** - Phase 6 runs AutoLearn pipeline
- **MorningBrief** - Presents PENDING tasks for approval
- **LandscapeMonitor** - Provides monitored content sources
- **WisdomSynthesis** - ExtractWisdom pipeline for insights
- **RedTeam** - AdversarialValidation for insight quality

---

## File Locations

| Directory | Purpose |
|-----------|---------|
| `AUTOLEARN/HARVEST/` | Raw content from sources |
| `AUTOLEARN/INSIGHTS/` | Extracted wisdom |
| `AUTOLEARN/VALIDATED/` | RedTeam-validated insights |
| `AUTOLEARN/TASKS/` | Generated proposals |
| `AUTOLEARN/PENDING/` | Awaiting approval |
| `AUTOLEARN/APPROVED/` | Ready for execution |
| `AUTOLEARN/EXECUTED/` | Completed logs |
| `AUTOLEARN/METRICS/` | Trust history |

---

*This skill enables PAI to continuously improve by learning from the Claude Code community while maintaining human oversight through the trust graduation system.*

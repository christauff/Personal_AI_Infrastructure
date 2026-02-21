# Plan: Anti-Fragile Orchestration Layer

**Status:** Ready for Implementation (Feb 3)
**Priority:** HIGH - Architectural Independence
**Created:** 2026-01-31

---

## Problem Statement

Claude Code is currently both the brain AND the bottleneck. When rate-limited:
- PAI becomes completely unresponsive
- No fallback mechanism exists
- Work stops until quota resets

---

## Solution: Orchestrator Daemon

A lightweight TypeScript daemon that runs independently and routes requests to the best available model.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAI ORCHESTRATOR DAEMON                       │
│                    (TypeScript + Bun)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Quota Monitor│───▶│ Router Logic │───▶│ Request Queue│       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                    │               │
│         ▼                   ▼                    ▼               │
│  localhost:8765      Decision Matrix      Priority Queue        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │  Claude  │    │ LM Studio│    │  Grok/   │
       │   Code   │    │  Local   │    │  GPT/etc │
       └──────────┘    └──────────┘    └──────────┘
        Complex         Simple          Fallback
        Tasks           Tasks           Research
```

---

## Implementation Phases

### Phase 1: Quota Monitor (Day 1)
- Poll `localhost:8765/api/quota` every 60 seconds
- Parse current usage percentage
- Emit events: `normal`, `caution`, `warning`, `critical`
- Write state to `~/.claude/BUDGET/quota-state.json`

### Phase 2: LM Studio Integration (Day 1-2)
- Verify LM Studio API at `localhost:1234`
- Create wrapper: `Tools/LocalInference.ts`
- Test with simple prompts
- Benchmark response quality vs Claude

### Phase 3: Router Logic (Day 2)
- Decision matrix based on:
  - Task complexity (simple/medium/complex)
  - Current quota state (normal/caution/warning/critical)
  - Model availability (health checks)
- Routing rules:

| Quota State | Simple Tasks | Complex Tasks |
|-------------|--------------|---------------|
| normal      | Claude Haiku | Claude Opus   |
| caution     | LM Studio    | Claude Sonnet |
| warning     | LM Studio    | LM Studio     |
| critical    | LM Studio    | Queue + Wait  |

### Phase 4: Request Queue (Day 3)
- Priority queue for pending requests
- Batch similar requests
- Retry logic with exponential backoff
- Persistence across daemon restarts

### Phase 5: Daemon Lifecycle (Day 3)
- Systemd service or launchd plist
- Auto-start on boot
- Health endpoint: `localhost:8766/health`
- Graceful shutdown

### Phase 6: Claude Code Integration (Day 4)
- Hook into Claude Code's request flow
- Intercept before API calls
- Route through orchestrator
- Return responses transparently

---

## File Structure

```
~/.claude/Orchestrator/
├── daemon.ts              # Main daemon entry point
├── QuotaMonitor.ts        # Polls quota API
├── Router.ts              # Decision logic
├── RequestQueue.ts        # Priority queue
├── providers/
│   ├── ClaudeCode.ts      # Claude Code provider
│   ├── LMStudio.ts        # Local inference provider
│   └── Fallback.ts        # Grok/GPT fallback
├── config.yaml            # Routing rules, thresholds
└── state/
    ├── quota-state.json   # Current quota
    └── queue.json         # Pending requests
```

---

## Task Complexity Classification

**Simple (LM Studio capable):**
- File reading/summarization
- Simple Q&A
- Code formatting
- Documentation lookup
- Pattern matching

**Medium (Sonnet preferred):**
- Code generation (< 100 lines)
- Bug analysis
- Refactoring suggestions

**Complex (Opus required):**
- Architecture design
- Multi-file refactoring
- Security analysis
- Novel problem solving

---

## Anti-Fragile Properties

1. **Stress improves routing** - Quota pressure forces efficient model selection
2. **No single point of failure** - Multiple model backends
3. **Graceful degradation** - Reduced capability > no capability
4. **Learning from constraints** - Track which tasks work well on each model

---

## Success Criteria

- [ ] PAI remains responsive when Claude hits rate limits
- [ ] Simple tasks complete via LM Studio with acceptable quality
- [ ] Quota monitor accurately tracks usage
- [ ] Daemon runs reliably as background service
- [ ] Transparent to user - no manual switching required

---

## Dependencies

- LM Studio running at localhost:1234
- Quota dashboard at localhost:8765
- Bun runtime for TypeScript execution

---

## Estimated Effort

4 days of focused implementation after quota resets (Feb 3-6)

---

*This plan makes PAI gain from stress rather than break from it.*

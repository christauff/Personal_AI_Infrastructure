---
name: AgentTrace
compatibility:
  claude_code: ">=2.1.38"
---

# AgentTrace

Track AI-generated code ranges with conversation context for provenance and attribution.

**Domain:** Code provenance, AI attribution, audit trail

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `agent trace`, `code provenance`, `ai attribution` | `TraceGeneration.md` | Record provenance for generated code |
| `provenance report`, `trace report` | `ProvenanceReport.md` | Query provenance by file/range/session |
| `who wrote this`, `attribution query` | `AttributionQuery.md` | Answer "who wrote this code?" queries |

---

## Architecture

- **Tracking:** Automatic via PostToolUse hook on Write/Edit
- **Storage:** Append-only JSONL in Data/traces.jsonl
- **Query:** CLI tool with file/session/date filters
- **Gate:** None - pure tracking, never blocks operations

---

## Data Format

Each trace record in `Data/traces.jsonl`:
```json
{"ts":"ISO","file":"/path/to/file","startLine":1,"endLine":50,"model":"claude-opus-4-6","sessionId":"...","action":"write|edit","linesChanged":50}
```

---

## Version
- v1.0.0 (2026-02-12) - Initial implementation

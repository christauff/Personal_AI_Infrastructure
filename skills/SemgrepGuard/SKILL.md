---
name: SemgrepGuard
compatibility:
  claude_code: ">=2.1.38"
  requires: ["semgrep"]
---

# SemgrepGuard

Inline SAST scanning of PAI-generated and installed code via Semgrep CLI.

**Domain:** Code security, static analysis, vulnerability detection

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `semgrep scan`, `sast scan`, `code security check` | `InlineScan.md` | Scan specific files/directories |
| `custom semgrep rules`, `security rules` | `CustomRules.md` | Create/manage PAI-specific rules |
| `security findings`, `scan report` | `FindingsReport.md` | Aggregate and report findings |

---

## Architecture

- **Engine:** Semgrep CLI (not MCP server - direct CLI invocation avoids dependency chain)
- **Rules:** Custom YAML rules in Config/rules.yaml + Semgrep default rulesets
- **Findings:** Append-only JSONL in Data/findings.jsonl
- **Gate:** Soft gate via hook - warns on HIGH+ findings but does not block

---

## Version
- v1.0.0 (2026-02-12) - Initial implementation

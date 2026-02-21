# ProtocolWatch Skill

**Created:** 2026-01-30
**Purpose:** Monitor MCP, A2A, and AAIF protocol changes for breaking changes
**Part of:** The Accelerando System

---

## Overview

Protocol convergence is one of PAI's strategic priorities. This skill monitors
the protocol landscape to detect breaking changes, new capabilities, and
competitive developments before they impact PAI.

**Philosophy:** The Accelerando cat survived substrate changes by understanding
the evolving environment. ProtocolWatch maintains that awareness for PAI.

---

## Voice Notification

**MANDATORY - Execute immediately:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running ProtocolWatch to check for protocol changes"}' \
  > /dev/null 2>&1 &
```

---

## Monitored Protocols

### MCP (Model Context Protocol) - PRIMARY
- **Spec URL:** https://github.com/modelcontextprotocol/specification
- **SDK URL:** https://github.com/modelcontextprotocol/typescript-sdk
- **Check frequency:** Daily
- **Alert on:** Version bump, schema change, deprecation notice, SDK v2 release

### MCP TypeScript SDK - PRIMARY
- **Repo URL:** https://github.com/modelcontextprotocol/typescript-sdk
- **Check frequency:** Daily
- **Alert on:** v2.x release candidate, v2.x stable, breaking changes
- **Special tracking:** SDK v2 migration readiness for PAI

### A2A (Agent-to-Agent) - SECONDARY
- **Spec URL:** TBD (Google/AAIF)
- **Check frequency:** Weekly
- **Alert on:** Major release, compatibility change

### AAIF Standards - GOVERNANCE
- **Source:** AAIF announcements, working group outputs
- **Check frequency:** Weekly
- **Alert on:** New standard adopted, membership changes

### AGENTS.md - EMERGING
- **Source:** Community spec
- **Check frequency:** Weekly
- **Alert on:** Adoption signals, format changes

---

## Workflow Routing

| Workflow | Triggers | Description |
|----------|----------|-------------|
| `Workflows/Check.md` | "check protocols", "any protocol changes" | Run manual check |
| `Workflows/BreakingChange.md` | Automatic on detected change | Analyze impact |
| `Workflows/Compatibility.md` | "is PAI compatible with MCP 2.x" | Check PAI alignment |

---

## Data Storage

```
Data/
├── mcp-spec-hash.txt         # SHA256 of last seen MCP spec
├── a2a-spec-hash.txt         # SHA256 of last seen A2A spec
├── aaif-releases.jsonl       # Log of AAIF announcements
├── breaking-changes/         # Detailed analysis of breaking changes
│   └── {date}-{protocol}.md
└── compatibility/            # PAI compatibility assessments
    └── {protocol}-{version}.md
```

---

## Detection Method

### Hash-Based Change Detection
```bash
# Nightly check (in overnight-processor.sh)
NEW_HASH=$(curl -s $MCP_SPEC_URL | sha256sum | cut -d' ' -f1)
OLD_HASH=$(cat Data/mcp-spec-hash.txt)
if [[ "$NEW_HASH" != "$OLD_HASH" ]]; then
    # CHANGE DETECTED - trigger BreakingChange workflow
fi
```

### Semantic Versioning Tracking
- Track version numbers across protocols
- Major version = likely breaking change
- Minor version = new capabilities
- Patch version = bug fixes

---

## Alert Severity

### CRITICAL
- MCP breaking change affecting PAI
- Deprecation with deadline
- Security vulnerability in protocol

### HIGH
- New MCP capability PAI should adopt
- A2A reaching maturity milestone
- AAIF governance decision affecting strategy

### MEDIUM
- Minor version updates
- Community adoption signals
- Documentation updates

---

## Integration Points

### Overnight Processor
Protocol checks run as part of overnight processing (Phase 3).

### MorningBrief
Protocol alerts surface in morning briefing.

### LandscapeMonitor
Protocol news feeds into landscape monitoring.

### POOLS/SEEDS
Detected changes can spawn research pools for impact analysis.

---

## Example Alerts

**CRITICAL: MCP 2.1 Breaking Change**
```markdown
# Protocol Alert: MCP 2.1

**Severity:** CRITICAL
**Protocol:** MCP (Model Context Protocol)
**Change:** Tool schema format changed
**Detected:** 2026-01-31 03:00 UTC

## What Changed
- Tool parameters now use `inputSchema` instead of `parameters`
- Response format includes new `metadata` field

## PAI Impact
- Affects: skills/*/Tools/*.ts
- Estimated files: 15
- Migration effort: Medium (1-2 days)

## Recommendation
1. Review full changelog: [link]
2. Update tool definitions before next MCP server push
3. Test with Claude Desktop MCP integration

## References
- Anthropic blog post: [link]
- GitHub commit: [link]
```

---

## Compatibility Tracking

Maintain compatibility matrix:

| Protocol | Version | PAI Support | Status |
|----------|---------|-------------|--------|
| MCP | 2.0 | Full | Current |
| MCP | 2.1 | Partial | Needs update |
| A2A | 0.x | None | Monitoring |
| AGENTS.md | 1.0 | None | Planned |

---

## Changelog

- **2026-01-31:** Added TypeScript SDK monitoring for MCP 2.x migration preparation
- **2026-01-30:** Initial creation as part of Accelerando System

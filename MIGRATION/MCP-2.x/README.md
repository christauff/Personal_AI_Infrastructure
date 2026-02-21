# MCP 2.x Migration Tracking

**Status:** Preparation Phase (No Active Migration)
**Created:** 2026-01-31
**Last Updated:** 2026-01-31

---

## Executive Summary

PAI has **deliberately avoided MCP adoption** where code-first approaches are more efficient:
- Browser skill: 99%+ token savings vs Playwright MCP
- Apify skill: 98.2% token reduction by pre-filtering in code

The MCP infrastructure is ready (profile system, settings.json config) but no MCP servers are currently running. This is a **preparation task**, not an urgent migration.

---

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| MCP Server Runtime | None running | `enabledMcpjsonServers: []` |
| MCP SDK Dependencies | None | Deliberate code-first choice |
| MCP Profile System | Ready | `pai.ts` CLI with profile shortcuts |
| MCP Permissions | Configured | `"mcp__*"` wildcard in settings.json |
| MCP Monitoring | Active | ProtocolWatch tracks spec changes |

---

## Why Preparation, Not Migration

PAI is well-positioned because there's **nothing to migrate**. We're preparing for *future* MCP adoption, not migrating existing integrations.

**Decision framework:** Only adopt MCP when it provides clear value over code-first approaches.

---

## Migration Phases

### Phase 1: Preparation (Current - 2026-01)

| Task | Status | File |
|------|--------|------|
| Create migration tracking directory | DONE | This directory |
| Audit skills for MCP potential | DONE | `skill-audit.md` |
| Document pai.ts profiles | DONE | `profile-inventory.md` |
| Update ProtocolWatch for SDK | DONE | `ProtocolWatch/SKILL.md` |

### Phase 2: Evaluation (February 2026)

| Task | Depends On | Status |
|------|------------|--------|
| Test TypeScript SDK v2 RC | SDK release | WAITING |
| Prototype Streamable HTTP | SDK v2 RC | WAITING |
| Design tool annotations schema | None | TODO |
| Evaluate Tasks primitive candidates | Skill audit | TODO |

### Phase 3: Decision (March-April 2026)

| Task | Depends On | Status |
|------|------------|--------|
| SDK v2 integration testing | SDK v2 stable | WAITING |
| Re-benchmark Browser/Apify with MCP 2.x | SDK v2 stable | WAITING |
| Final adopt/continue-code-first decision | Benchmarks | WAITING |

---

## Decision Point

**Should PAI adopt MCP 2.x at all?**

Reasons to adopt:
- Industry convergence (OpenAI, Google, Cursor adopting)
- Tasks primitive enables async agent patterns
- Elicitation enables HITL workflows

Reasons to continue code-first:
- Massive token savings (98-99%+)
- Full control over implementation
- No SDK dependency risks
- Working solutions today

**Next decision point:** When SDK v2 is stable (expected Q1 2026)

---

## References

- Research report: `~/.claude/POOLS/COMPLETE/research-pool-MCP-2.x-migration-requirements-for-PAI-2026-01-31-FULL.md`
- ProtocolWatch: `~/.claude/skills/ProtocolWatch/SKILL.md`
- Profile system: `~/.claude/skills/PAI/Tools/pai.ts`

---

## Changelog

- **2026-01-31:** Initial creation, Phase 1 complete

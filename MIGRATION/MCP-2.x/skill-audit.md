# MCP Candidate Skill Audit

**Created:** 2026-01-31
**Purpose:** Identify which PAI skills could benefit from MCP integration

---

## Audit Methodology

Evaluated all 38 skills against criteria:
1. Would MCP reduce token usage vs current implementation?
2. Would MCP provide capabilities not currently available?
3. Would MCP improve reliability/maintainability?
4. Is there an existing MCP server for this use case?

---

## Current Code-First Winners (Keep As-Is)

These skills demonstrate significant advantages over MCP:

| Skill | Current Approach | Token Savings | Recommendation |
|-------|------------------|---------------|----------------|
| **Browser** | Direct Playwright | 99%+ | KEEP - Massive efficiency |
| **Apify** | Direct API + pre-filter | 98.2% | KEEP - Pre-filtering crucial |
| **BrightData** | Direct API | ~95% | KEEP - Same pattern as Apify |

**Rationale:** These skills pre-process data before sending to LLM, which MCP cannot do. MCP would require sending raw data through the LLM layer.

---

## Potential MCP Candidates

Skills that *might* benefit from MCP if ecosystem matures:

### High Potential

| Skill | Why MCP Might Help | Existing MCP? | Priority |
|-------|-------------------|---------------|----------|
| **Documents** (PDF, DOCX, XLSX, PPTX) | Standardized file handling | Several exist | Medium |
| **Research** | Web search standardization | Tavily, Exa exist | Low (current approach works) |

### Medium Potential

| Skill | Why MCP Might Help | Existing MCP? | Priority |
|-------|-------------------|---------------|----------|
| **OSINT** | Standardized data sources | Partial | Low |
| **SECUpdates** | News aggregation | None specific | Low |
| **AnnualReports** | PDF processing | Generic PDF MCPs | Low |

### Low Potential (Keep Code-First)

| Skill | Why Code-First Better | Notes |
|-------|----------------------|-------|
| **FirstPrinciples** | Pure reasoning, no external | No MCP benefit |
| **BeCreative** | Pure reasoning | No MCP benefit |
| **RedTeam** | Pure reasoning | No MCP benefit |
| **Council** | Agent orchestration | Internal to PAI |
| **Agents** | Dynamic composition | PAI-specific |
| **Art** | API calls + reasoning | Code-first optimal |
| **Fabric** | Pattern execution | Local processing |
| **Evals** | Testing framework | Internal to PAI |
| **CreateSkill** | PAI infrastructure | Internal |
| **CreateCLI** | Code generation | No MCP benefit |
| **Prompting** | Template system | Internal |

---

## MCP 2.x-Specific Opportunities

### Tasks Primitive Candidates

Long-running operations that could benefit from async Tasks:

| Skill/Operation | Current Duration | Tasks Benefit |
|-----------------|------------------|---------------|
| Research (Extensive) | 5-15 min | High - async + progress |
| WisdomSynthesis pipelines | 10-30 min | High - multi-stage async |
| AnnualReports Update | 30+ min | High - batch processing |
| OSINT deep searches | 15-60 min | High - parallel + progress |

### Tool Annotations Candidates

Skills where `readOnlyHint`/`destructiveHint` would help:

| Skill | Annotation Need |
|-------|-----------------|
| All file-writing skills | `destructiveHint: true` |
| Browser (navigation) | `readOnlyHint: true` for screenshots |
| Research (web search) | `readOnlyHint: true` |

### Structured Output Candidates

Skills that would benefit from `structuredContent`:

| Skill | Output Type | Benefit |
|-------|-------------|---------|
| Research | Tables, lists | Better rendering |
| OSINT | Structured reports | Consistent format |
| Documents | Extracted data | Schema validation |

---

## Recommendations

### Immediate (Phase 1)

1. **No changes to working skills** - Code-first is winning
2. **Monitor MCP ecosystem** - Watch for mature servers in our domains
3. **Document current approaches** - Capture why code-first works

### Future (Phase 2-3)

1. **Re-benchmark when SDK v2 stable** - Especially Browser/Apify
2. **Evaluate Tasks primitive** - For WisdomSynthesis, Research
3. **Consider structured output** - If document skills need improvement

---

## Decision Matrix

| Skill Category | MCP Recommendation | Timing |
|----------------|-------------------|--------|
| Data processing (Browser, Apify, BrightData) | STAY CODE-FIRST | Indefinite |
| Pure reasoning (RedTeam, Council, BeCreative) | NO MCP BENEFIT | N/A |
| Document handling | EVALUATE SDK v2 | Q2 2026 |
| Long-running ops | EVALUATE TASKS | SDK v2 stable |
| Internal infrastructure | NO MCP BENEFIT | N/A |

---

## Changelog

- **2026-01-31:** Initial audit of 38 skills

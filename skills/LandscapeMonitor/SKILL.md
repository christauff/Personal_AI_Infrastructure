# LandscapeMonitor Skill

**Created:** 2026-01-30
**Purpose:** Track AI agent landscape changes to keep PAI at the bleeding edge
**Part of:** The Accelerando System

---

## Overview

The AI agent landscape moves at extraordinary speed. This skill monitors key sources
and surfaces changes that matter for PAI's strategic positioning.

**Philosophy:** Aineko accumulated knowledge while others slept. This skill implements
that pattern - continuous monitoring that compounds into strategic advantage.

---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/LandscapeMonitor/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or
resources found there. These override default behavior.

---

## Voice Notification

**MANDATORY - Execute immediately:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the LandscapeMonitor skill to scan the agent ecosystem"}' \
  > /dev/null 2>&1 &
```

---

## Workflow Routing

| Workflow | Triggers | Description |
|----------|----------|-------------|
| `Workflows/DailyScan.md` | "landscape scan", "what's new in agents" | Automated daily ecosystem scan |
| `Workflows/DeepDive.md` | "deep dive on {topic}", "investigate {framework}" | On-demand investigation |
| `Workflows/AlertTriage.md` | "check alerts", "any breaking changes" | Review flagged items |

---

## Monitored Sources

### Configured in `Feeds/`

**agent-news.yaml** - News and announcements:
- Anthropic Blog (Claude updates, MCP changes)
- OpenAI Blog (API changes, deprecations)
- Google AI Blog (Gemini, Vertex updates)
- Microsoft Copilot Blog
- Hacker News (AI-tagged stories)

**github-trending.yaml** - Repository monitoring:
- Trending AI agent repos
- MCP server ecosystem
- CrewAI, LangGraph, AutoGPT releases
- OpenClaw updates

**research-papers.yaml** - Academic sources:
- arXiv cs.AI (agents, memory, orchestration)
- arXiv cs.MA (multi-agent systems)
- Semantic Scholar alerts

**security-feeds.yaml** - Security monitoring:
- OWASP AI Security updates
- CVE feeds for AI tools
- Security researcher blogs

**claude-code-creators.yaml** - Claude Code ecosystem (added 2026-01-31):
- 7 Medium writers (JP Caparas, Joe Njenga, Gigi Sayfan, etc.)
- Community sites (ClaudeLog, Awesome Claude Code)
- Video/course creators (Peter Yang, Carl Vellotti)
- Official sources (docs, GitHub, @ClaudeCodeLog)

---

## Data Storage

**Outputs saved to:** `~/.claude/skills/LandscapeMonitor/Data/`

```
Data/
├── scans/                    # Daily scan results
│   └── {YYYY-MM-DD}.md
├── alerts/                   # Items flagged for attention
│   └── {id}.yaml
├── history/                  # Processed items (dedup)
│   └── seen-urls.txt
└── metrics/                  # Tracking
    └── scan-stats.jsonl
```

---

## Alert Criteria

Items are flagged as **ALERT** if they match:

### Critical (notify immediately)
- MCP breaking change
- Anthropic API deprecation
- Security vulnerability in monitored tools
- EU AI Act enforcement update

### High (include in morning brief)
- New major framework release
- Significant architectural pattern
- Competitive threat (e.g., Claude/GPT feature parity)
- Protocol specification update

### Medium (daily digest)
- Interesting technique or approach
- Community discussion trend
- Minor version updates

---

## Integration Points

### Overnight Processor
Daily scan runs as part of overnight processing:
```bash
# In overnight-processor.sh
# Phase 2: Landscape Monitoring
```

### Morning Brief
Scan results feed into morning brief:
- Alerts first (Critical, High)
- Digest of Medium items
- Links to full scan report

### POOLS/SEEDS
Interesting findings can spawn research pools:
- Deep dive requests
- Competitive analysis
- Technical exploration

---

## Usage Examples

**Example 1: Morning scan review**
```
User: "What's new in the agent landscape?"
→ Invokes DailyScan.md workflow
→ Returns summary of overnight scan
→ Highlights any alerts
```

**Example 2: Specific investigation**
```
User: "Deep dive on the new CrewAI release"
→ Invokes DeepDive.md workflow
→ Researches specific topic
→ Returns detailed analysis
```

**Example 3: Alert triage**
```
User: "Any breaking changes I should know about?"
→ Invokes AlertTriage.md workflow
→ Reviews all flagged alerts
→ Provides action recommendations
```

---

## Feed Configuration Format

**Example: agent-news.yaml**
```yaml
sources:
  - name: "Anthropic Blog"
    url: "https://www.anthropic.com/news"
    type: rss
    priority: critical
    keywords: ["MCP", "Claude", "API", "deprecation"]

  - name: "Hacker News AI"
    url: "https://hnrss.org/newest?q=AI+agent"
    type: rss
    priority: medium
    keywords: ["agent", "LLM", "Claude", "GPT"]

  - name: "OpenAI Blog"
    url: "https://openai.com/blog/rss"
    type: rss
    priority: high
    keywords: ["API", "assistant", "agent", "deprecation"]
```

---

## Metrics Tracked

| Metric | Purpose |
|--------|---------|
| Items scanned per day | Volume tracking |
| Alerts generated | Signal quality |
| Alerts actioned | Value delivered |
| False positive rate | Quality tuning |
| Time to alert | Latency tracking |

---

## Changelog

- **2026-01-31:** Added Claude Code creators monitoring config (claude-code-creators.yaml) - user approved
- **2026-01-30:** Initial creation as part of Accelerando System

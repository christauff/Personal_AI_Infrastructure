# AgentWatch Skill

Lean hybrid intelligence for autonomous agent ecosystem awareness.

**Philosophy:** Participation > Surveillance. Automation only for what machines do better.

**Domain:** Agent ecosystem intelligence, security monitoring, capability tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PARTICIPATION (Primary)                  │
│  Contribute to frameworks, join communities, build network  │
│  → Strategic intelligence, capabilities, economics, trends  │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│                SECURITY POLLING (Secondary)                 │
│  NVD API, GitHub Advisories, Release feeds                  │
│  → CVEs, vulnerabilities, security patches                  │
│  Structured feeds only - NO freeform content                │
└─────────────────────────────────────────────────────────────┘
```

---

## Six Pillars

1. **Self-improvement** - Learn from agent ecosystem evolution
2. **Skill parity** - Track capabilities to consider implementing
3. **Economic self-sufficiency** - Monitor agent self-funding mechanisms
4. **Cybersecurity defensive** - Attack patterns to defend against
5. **Cybersecurity offensive** - Techniques for threat modeling
6. **Vulnerability tracking** - CVEs/exploits in agent ecosystem

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `/AgentWatch poll` | `SecurityPoll.md` | Run security feed polling |
| `/AgentWatch log` | `LogInsight.md` | Capture participation insight |
| `/AgentWatch digest` | `WeeklyDigest.md` | Generate weekly synthesis |
| `/AgentWatch health` | Direct tool | Check polling health |
| `/AgentWatch mcp-audit` | `MCPAudit.md` | Audit MCP server configs and versions against CVEs |
| `/AgentWatch self-audit` | `SelfAudit.md` | Check PAI toolchain versions against known CVEs |

---

## What This Skill Does NOT Do

Deliberately excluded to eliminate attack surface:

- ❌ Twitter/X content monitoring
- ❌ Freeform discussion analysis
- ❌ Sentiment tracking
- ❌ Trend detection from social media
- ❌ Any content that could contain prompt injections

These are better handled through human participation in communities.

**Why:** RedTeam analysis identified self-referential injection as a critical vulnerability. Monitoring freeform content (Twitter, GitHub issues, discussions) creates an attack surface where adversarial payloads in monitored content can compromise the monitoring system itself. Structured feeds (NVD JSON, GitHub API) are safe.

---

## Integration

| Destination | What Routes There | How |
|-------------|-------------------|-----|
| **PAIUpgrade** | Capability insights from participation | Manual via LogInsight |
| **PromptInjection** | Attack patterns, CVEs | Auto for critical CVEs, manual for techniques |
| **Memory** | Weekly digests, strategic insights | WeeklyDigest output |
| **VoiceServer** | Critical security alerts | Auto for CVSS >= 9.0 |
| **DreamProcessor** | Weekly synthesis | Feed into consolidation |

---

## Participation Guide

Primary framework to contribute to: **crewAI** (configurable in `Config/participation.yaml`)

**Why participate instead of monitor:**
- Information asymmetry (you learn what's coming before it's announced)
- Relationship network (people share insights with contributors)
- Deep understanding (you learn by doing, not watching)
- Dark matter access (80% of valuable signal travels through private channels)

**Contribution ideas:**
- Documentation improvements
- Bug fixes in areas relevant to PAI
- Example implementations
- Issue triage and community support

---

## Polling Schedule

- **Frequency:** Every 12 hours via cron
- **Sources:** NVD, GitHub Security Advisories, tracked repo releases
- **Retention:** 90 days for security events

**Cron setup:**
```bash
# Add to crontab -e
0 */12 * * * /usr/bin/bun run ~/.claude/skills/AgentWatch/Tools/SecurityPoller.ts poll >> ~/.claude/skills/AgentWatch/Data/poll.log 2>&1
```

---

## Quick Reference

```bash
# Check health
bun run ~/.claude/skills/AgentWatch/Tools/SecurityPoller.ts health

# Run poll manually
bun run ~/.claude/skills/AgentWatch/Tools/SecurityPoller.ts poll

# Test API connectivity
bun run ~/.claude/skills/AgentWatch/Tools/SecurityPoller.ts test

# Log a participation insight
/AgentWatch log

# Generate weekly digest
/AgentWatch digest
```

---

## File Organization

| Path | Purpose |
|------|---------|
| `Config/tracked-repos.yaml` | GitHub repos to monitor for security |
| `Config/participation.yaml` | Frameworks and communities to engage with |
| `Config/cve-keywords.yaml` | Terms to search in NVD |
| `Data/security-events.jsonl` | Append-only security event log |
| `Data/participation-log.jsonl` | Manual insights from participation |
| `Data/last-poll.json` | Polling state and health metrics |
| `Workflows/SecurityPoll.md` | Automated security feed polling |
| `Workflows/LogInsight.md` | Manual insight capture |
| `Workflows/WeeklyDigest.md` | Weekly synthesis generation |
| `Tools/SecurityPoller.ts` | NVD + GitHub API polling tool |

---

## Version History

- **v1.0** (2026-02-05): Initial lean hybrid architecture
  - Participation as primary intelligence source
  - Security polling of structured feeds only
  - No freeform content monitoring (attack surface eliminated)
  - RedTeam-informed design decisions

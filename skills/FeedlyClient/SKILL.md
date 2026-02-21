---
name: FeedlyClient
description: Feedly Enterprise Threat Intelligence API client with rate-aware caching, dual-consumer facades (TwitterBot + CyberOps), and CLI interface. USE WHEN feedly, threat intel feed, cve enrichment, trending cves, threat actors, malware families, daily intel digest, vulnerability dashboard, detection rules.
tools:
  - Bash
  - Read
  - Glob
  - Grep
memory: project
---

# FeedlyClient Skill

Rate-aware, cached client for the Feedly Enterprise Threat Intelligence API. Serves two consumers: TwitterBot (content pipeline) and CyberOps (daily intel operations).

## Access Context

- **Enterprise account via DOE** — shared with other threat intel researchers
- Must not degrade service for other users
- API key in `~/.claude/.env` as `FEEDLY_ACCESS_TOKEN`
- Rate limit: 100,000 requests/month, our budget: 50,000

## Architecture

```
FeedlyClient.ts (core HTTP + auth + encoding + rate tracking)
  |
  +-- Cache.ts (filesystem JSON, TTL per category)
  +-- RateBudget.ts (priority token bucket + burst limiter + circuit breaker)
  +-- Types.ts (all TypeScript interfaces)
  |
  +-- Facades/
  |     +-- TwitterBotFacade.ts (tweet-ready intel packages)
  |     +-- CyberOpsFacade.ts (enrichment, IoCs, STIX 2.1)
  |
  +-- Config/
  |     +-- rate-budget.yaml (budget allocation)
  |     +-- cache-ttls.yaml (TTL per endpoint)
  |
  +-- Data/
        +-- cache/ (cached API responses)
        +-- rate-state.json (persistent rate counter)
        +-- request-log.jsonl (audit trail)
```

## Workflow Routing

| Trigger | Action |
|---------|--------|
| Trending CVEs, what's hot in vulns | `bun FeedlyClient.ts trending` |
| Enrich a specific CVE | `bun FeedlyClient.ts cve <CVE-ID>` |
| Threat actor profile | `bun FeedlyClient.ts actor <entity-id>` |
| Malware profile | `bun FeedlyClient.ts malware <entity-id>` |
| Trending threat actors | `bun FeedlyClient.ts trending-actors` |
| Trending malware | `bun FeedlyClient.ts trending-malware` |
| Search for entity by name | `bun FeedlyClient.ts search-entity <query>` |
| Actor relationships (TTPs, malware, CVEs) | `bun FeedlyClient.ts actor-relations <entity-id>` |
| Detection rules (YARA/Sigma) | `bun FeedlyClient.ts detection-rules <malware-id>` |
| Content search | `bun FeedlyClient.ts search <query>` |
| Rate budget status | `bun FeedlyClient.ts budget` |
| Tweet-ready intelligence | `bun Facades/TwitterBotFacade.ts trending-intel` |
| Daily content package | `bun Facades/TwitterBotFacade.ts daily-package` |
| Full CVE enrichment chain | `bun Facades/CyberOpsFacade.ts enrich <CVE-ID>` |
| Daily intel digest | `bun Facades/CyberOpsFacade.ts daily-digest` |
| Find entity by name | `bun Facades/CyberOpsFacade.ts lookup <query>` |

## Rate Budget

| Consumer | Daily Limit | Priority | Can Borrow |
|----------|------------|----------|------------|
| CyberOps | 1,000 | P1 (highest) | Yes (from reserve + twitter) |
| TwitterBot | 500 | P2 | No |
| Reserve | 167 | P3 | No |
| **Total** | **1,667** | | |

### Safety Mechanisms

- **Burst limiter**: Minimum 2s between API requests (undocumented Feedly limit)
- **Soft cap (85%)**: Cache-only mode — return stale data, avoid API calls
- **Hard cap (90%)**: Block all non-profile requests
- **Circuit breaker**: 5 consecutive errors in 10 min = 15 min cooldown
- **Dual tracking**: Local counters + API `X-Ratelimit-*` headers

## Cache Strategy

| Category | TTL | Rationale |
|----------|-----|-----------|
| Trending CVEs | 1 hour | Hot data, changes frequently |
| CVE entity | 24 hours | Stable once enriched |
| Threat actors | 7 days | Evolve slowly |
| Malware | 7 days | Same as actors |
| Search results | 30 minutes | Need freshness |
| Detection rules | 7 days | YARA/Sigma rules stable |

## API Endpoints (Live-Tested)

| Endpoint | Path | Method |
|----------|------|--------|
| Profile | `/v3/profile` | GET |
| Trending CVEs | `/v3/memes/vulnerabilities/en` | GET |
| Vulnerability Dashboard | `/v3/trends/vulnerability-dashboard` | POST |
| CVE Entity | `/v3/entities/{CVE-ID}` | GET |
| Threat Actor Entity | `/v3/entities/{encoded-entity-id}` | GET |
| Malware Entity | `/v3/entities/{encoded-entity-id}` | GET |
| Trending Actors | `/v3/trends/threat-actors` | GET |
| Trending Malware | `/v3/trends/new-malwares` | GET |
| Entity Search | `/v3/search/entities?query={q}` | GET |
| Actor Relationships | `/v3/ml/relationships/actor/{encoded-id}?intervalType=LAST_30_DAYS` | GET |
| Detection Rules | `/v3/ml/detection-rules/threat/{encoded-id}` | GET |
| Content Search | `/v3/search/contents` | POST |
| Stream Contents | `/v3/streams/contents?streamId={id}&count={n}` | GET |
| Team Tags | `/v3/tags` | GET |
| Batch Articles | `/v3/entries/.mget` | POST |

## Integration Points

### TwitterBot
`TwitterBotFacade.ts trending-intel` produces `TweetIntelPackage[]` — scored, filtered CVEs ready for tweet composition. Integrates with `skills/TwitterBot/Tools/RegulatoryMonitor.ts` findings pipeline.

### CyberOps Daily Intel
`CyberOpsFacade.ts daily-digest` produces enriched CVEs with full actor/malware context and STIX 2.1 bundles. Can be piped to `MEMORY/WORK/daily-intel/`.

### MorningBrief
Trending CVEs and actors feed into the overnight accumulation for morning briefings.

## Examples

```bash
# What's trending right now?
bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts trending

# Deep-dive on a specific CVE
bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts cve CVE-2026-1731

# Who's the hottest threat actor?
bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts trending-actors

# Full enrichment for a tweet thread
bun ~/.claude/skills/FeedlyClient/Facades/TwitterBotFacade.ts trending-intel

# Daily CyberOps digest
bun ~/.claude/skills/FeedlyClient/Facades/CyberOpsFacade.ts daily-digest

# Look up any entity by name
bun ~/.claude/skills/FeedlyClient/Facades/CyberOpsFacade.ts lookup "Lazarus Group"

# Check budget usage
bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts budget
```

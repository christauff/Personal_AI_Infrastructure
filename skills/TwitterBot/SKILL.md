---
name: TwitterBot
description: DCWebGuy X/Twitter account management — cross-domain intelligence content, posting, engagement tracking, and competitive intelligence. USE WHEN twitter, x account, tweet, post, dcwebguy, engagement metrics, competitive intel. SkillSearch('twitterbot') for docs.
context: fork
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/TwitterBot/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.

## Voice Notification (REQUIRED)

**Send this notification BEFORE doing anything else:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the TwitterBot skill for X account management"}' \
  > /dev/null 2>&1 &
```

---

# TwitterBot Skill

**Purpose:** Manage the @DCWebGuy X/Twitter presence — cross-domain intelligence content across 5 pillars, TOU-compliant posting via X API v2, engagement tracking via Apify, and competitive intelligence on tracked accounts.

## Domain Context
When this skill activates, read for accumulated knowledge:
- `~/.claude/MEMORY/SYNTHESIS/domain-content.md` — Voice patterns, X Premium capabilities (4K chars, not 280), two-tier content model, formation catches on tweet writing
- Key: Zero hashtags, staccato beats, links in self-reply, Grok for X research, verify before publishing

## Architecture

```
CompetitiveIntel (weekly) ─┐
ContentSources ────────────┼→ ContentQueue → ContentSafety → PostScheduler → X API
VoiceModel ────────────────┘                                      ↓
                                                        EngagementTracker (weekly via Apify)
```

## Identity

**@DCWebGuy — Cross-domain intelligence through a 17-year practitioner's lens.**

The intersection of security, AI, politics, science, and culture. Not a niche account — the variety IS the identity. A 17-year practitioner who monitors OSINT all day and has opinions about all of it.

Not general infosec (too crowded). Not pure compliance (too dry). Not single-lane anything. The cross-domain perspective is the differentiator.

## Content Pillars

| Pillar | Weight | What It Covers |
|--------|--------|----------------|
| **Infosec** | 25% | Threat intel, CVE analysis, breach breakdowns, defense strategy |
| **AI/Tech** | 25% | Model testing, AI governance, code, real results with data |
| **Political** | 25% | Free speech, legislation, censorship, government overreach |
| **General** | 15% | Cultural observations, personal takes, humor — the growth engine |
| **Science** | 10% | Research connected to something practical or surprising |

**Critical insight:** Cultural/political takes get 10-15x the views of CVE posts. Top 3 posts by views were ALL cultural/political. Don't suppress these — they ARE the brand for a cross-domain account.

**Growth lever:** Post all original content to X Communities until 3K+ followers. Community posts are now visible platform-wide (2026 change). See Post.md Step 6.5.

## Content Cadence

- **No fixed day-to-topic mapping.** Post what's relevant when it's relevant.
- **~4-5 original posts/week** + extensive QTs and curation (matches natural cadence of 32 originals in 52 days)
- **Thread at least 1x/week** on whatever topic has the deepest take
- **68% of activity is retweets/curation** — the voice is in WHAT gets amplified
- **QTs are the primary voice channel** (25.3% of all posts) — substantial commentary, not just reactions

## Voice Model

**Full voice reference:** `Data/voice-research/voice-model.md`

**Quick rules:**
- One take per tweet. Opinions stated as facts. No hedging.
- Zero hashtags (enforced in ContentSafety — hard block)
- Zero exclamation marks (0.4% rate in 275 posts)
- Zero emoji (0.4% rate)
- Profanity natural but moderate (6.5% rate — "Jfc", "fuck" when it fits)
- Median 18 words. Short by default, long when the take needs space.
- Links in self-reply, never main tweet
- Free speech absolutist lens on ALL legislation content

## TOU Compliance Rules

These are non-negotiable:

1. **Posting-only** — No automated replies without prior X approval
2. **Properly labeled** as automated account
3. **Linked** to human managing account (@Christauf)
4. **Bio states**: "AI-powered cross-domain intelligence. Managed by @Christauf"
5. **No automated following/unfollowing**
6. **No keyword-based replies**
7. **No bulk engagement**
8. **Varied posting times** (not machine-regular intervals)
9. **Content safety filter** on every post before publishing

## Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| **PostScheduler.ts** | Queue and publish tweets via X API v2 | `bun PostScheduler.ts post "content"` |
| **ContentSafety.ts** | Pre-post content filter (zero hashtag enforced) | `bun ContentSafety.ts check "content"` |
| **EngagementTracker.ts** | Track metrics via Apify + generate reports | `bun EngagementTracker.ts report` |
| **CompetitiveIntel.ts** | Scrape and analyze tracked accounts | `bun CompetitiveIntel.ts scrape` |

## Integration Points

| Skill | Integration |
|-------|-------------|
| **SECUpdates** | Feed security news into content pipeline |
| **Fabric** | Use extract_wisdom and summarize patterns on source material |
| **Research** | Deep-dive analysis for thread content |
| **FeedlyClient** | Threat intelligence feed for infosec pillar |
| **Apify** | Twitter scraping for competitive intel + own metrics |
| **PromptInjection/ContentSafety** | Filter all output before posting |

## Competitive Intelligence

**Full tool:** `Tools/CompetitiveIntel.ts` | **Tracked accounts:** `Data/tracked-accounts.yaml`

Weekly scrape of 10 key accounts DCWebGuy follows. Analyzes engagement patterns, content formats, and what's working in spaces DCWebGuy operates in.

**Tracked accounts:** @BrianRoemmele, @DanielMiessler, @vxunderground, @cyb3rops, @MikeBenzCyber, @mattjay, @IceSolst, @jsrailton, @KaiLentit, @nickshirleyy

**Reports:** `Data/competitive-intel/weekly-{date}.md`

## Revenue Stack

| Stream | When | How |
|--------|------|-----|
| beehiiv Boosts | Day 1 | $1-3/new subscriber recommending other newsletters |
| Newsletter sponsorships | Month 3+ (1K subs) | $200-500/placement |
| Consulting pipeline | Month 3+ | X credibility → consulting calls |
| X Subscriptions | Month 3+ (500 followers) | $4.99/mo premium analysis |
| X Ad Revenue | Month 6+ (5M impressions) | $8.50/1M verified impressions |
| Digital products | Month 6+ | Framework guides, analysis templates |

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **Post** | "tweet", "post to x", "publish tweet", "schedule post" | `Workflows/Post.md` |
| **Monitor** | "check sources", "regulatory scan", "monitor" | `Workflows/Monitor.md` |
| **Report** | "engagement report", "metrics", "how are we doing on x", "dcwebguy report" | `Workflows/Report.md` |
| **Newsletter** | "newsletter", "beehiiv", "issue draft" | `Workflows/Newsletter.md` |

**Default:** Check competitive intel for content opportunities, then Post if content is ready.

---

## Content Quality Standards

1. **Have a take** — Every post states a position, not just information
2. **Show the work** — Include data, screenshots, code, evidence
3. **Accurate** — Zero errors on CVE numbers, dates, control families, deadlines
4. **Timely** — Breaking stories posted when hot, not scheduled for a window
5. **Accessible** — Complex topics in plain English with specific examples
6. **Zero hashtags** — Hard rule, enforced in ContentSafety
7. **Reply-provoking** — End with genuine questions that require expertise to answer
8. **Dwell-optimized** — Use threads (3-5 tweets) for analysis

## Algorithm Optimization (from xai-org/x-algorithm source code)

**Full analysis:** `Data/AlgorithmStrategy.md`

### Key Rules (Derived from Source Code)

1. **Links in replies, not main tweets** — Insight in main tweet, link in self-reply. 50-90% reach penalty for link posts.
2. **Optimize for replies first** — Reply signals carry 13.5-27x a like. Reply-to-reply is 75x.
3. **Space posts 4-6 hours apart** — AuthorDiversityScorer exponentially penalizes repeated authors.
4. **Max 2 posts/day** — Quality over quantity.
5. **Post when the take is hot** — Don't wait for windows. But if scheduling: 8-10am ET, 12-1pm ET, 5-7pm ET.
6. **Threads of 3-5 tweets** — Sweet spot for dwell time without drop-off.
7. **Build followers aggressively** — OONScorer multiplies out-of-network by < 1.0.
8. **Cross-domain is fine** — Consistent quality > consistent topic for multi-pillar accounts.

### Scoring Pipeline (exact order from source)
```
PhoenixScorer → WeightedScorer → AuthorDiversityScorer → OONScorer → TopKSelector
```

## Anti-Patterns

| Bad | Good |
|-----|------|
| "NIST released SP 800-53 Rev 6" (just a fact) | "SP 800-53 Rev 6 drops 3 control families. Here's what changes for your ATO." |
| Any hashtags at all | Zero hashtags, always |
| Link in main tweet | Insight in main, link in self-reply |
| "What do you think?" (lazy CTA) | Genuine question requiring expertise to answer |
| Suppressing political/cultural takes | Lean in — they're the growth engine (10-15x views) |
| 5-tweet analytical thread with numbered takeaways | One continuous argument building across 3-5 tweets |
| Machine-regular posting times | Varied schedule with human-like timing |
| "Key Takeaways:" or "Here's what you need to know:" | Just say the thing |
| Hedging: "could potentially," "it's worth noting" | Commit to the take |
| Generic infosec news aggregation | Cross-domain perspective with practitioner depth |

---

## State Files

- **Content queue**: `Data/content-queue.jsonl` — Posts awaiting publication
- **Engagement metrics**: `Data/engagement-metrics.jsonl` — Performance data (Apify-sourced)
- **Content calendar**: `Data/content-calendar.yaml` — Pillar-balanced content templates
- **Post history**: `Data/post-history.jsonl` — Published posts log
- **Tracked accounts**: `Data/tracked-accounts.yaml` — Competitive intel targets
- **Competitive intel**: `Data/competitive-intel/` — Weekly analysis reports
- **Voice model**: `Data/voice-research/voice-model.md` — Voice calibration data

## API Configuration

**Credentials stored in**: `~/.claude/.env` (variables: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `APIFY_API_TOKEN`)

**API config template**: `Config/api-config.yaml` (PRIVATE — never published)

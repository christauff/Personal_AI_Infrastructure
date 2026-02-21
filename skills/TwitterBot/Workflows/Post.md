# Post Workflow

Compose and publish content to X/Twitter via API v2.

**Voice reference:** `Data/voice-research/voice-model.md`
**Algorithm reference:** `Data/AlgorithmStrategy.md`
**Content pillars:** `Data/content-calendar.yaml`

---

## Core Principle

AI handles research, evidence gathering, and posting mechanics. Christauff writes or edits the actual tweets. The AI does not produce publish-ready tweets — it produces research-backed drafts with all evidence attached.

---

## Workflow Steps

### Step 1: Content Source

Determine content source:

| Source | Action |
|--------|--------|
| **Direct input** | User provides tweet text — skip to Step 5 |
| **News/event reaction** | QT or original take on something happening now |
| **Feedly intel** | Trending CVEs, threat actors, or malware from FeedlyClient |
| **Competitive intel** | Insight from tracked accounts analysis |
| **Content calendar** | Check `Data/content-calendar.yaml` for pillar balance |

### Step 2: Pillar Check

Before researching, check which pillar this content serves:

| Pillar | Weight | Key Format |
|--------|--------|------------|
| **Infosec** (25%) | Threat analysis, CVE takes, breach breakdowns | One angle, practitioner depth |
| **AI/Tech** (25%) | Model testing, AI governance, real data | Show the work — screenshots, code, data |
| **Political** (25%) | Legislation, free speech, censorship | Show HOW it works, not just THAT it's bad |
| **General** (15%) | Cultural observations, personal takes | The growth engine (10-15x views) |
| **Science** (10%) | Research findings, practical connections | Connect to something surprising |

Review `Data/engagement-metrics.jsonl` — if one pillar is over-represented recently, prioritize underserved pillars.

### Step 3: Research Phase (MANDATORY)

**This step is not optional. No content is generated without completing research first.**

Before writing a single word of a tweet, gather real evidence:

#### For CVE/Vulnerability Content:
1. **Read the actual advisory** — NVD, vendor advisory, or researcher's disclosure page
2. **Find the researcher** — Name, handle, affiliation. Credit them.
3. **Find the writeup** — Blog post, PDF, conference talk. The primary source, not a news aggregator rewriting it.
4. **Check for PoC** — GitHub repo, exploit-db, advisory attachment. Note whether PoC is public.
5. **Get real URLs** — At minimum: advisory URL + one analysis/writeup URL. These go in the self-reply.
6. **Understand the actual attack chain** — /ReadForYourself the PoC or technical writeup. Don't paraphrase the CVE description.

Use these tools:
```bash
# Feedly for CVE enrichment
bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts cve CVE-XXXX-XXXXX

# Web research for writeups, PoCs, researcher info
# Use PerplexityResearcher or OSINT agents for deep research
# Use WebSearch for quick URL verification
```

#### For Political/Policy Content:
1. **Find the primary source** — Bill text, court filing, official statement
2. **Find the specific mechanism** — What does the bill actually DO, not what headlines say
3. **Get the source URL** — congress.gov, court document, official press release

#### For AI/Tech Content:
1. **Show real work** — Actual test results, code output, terminal screenshots
2. **Link to the thing being tested** — GitHub repo, paper, product page
3. **Data, not claims** — Numbers, benchmarks, specific findings

#### For Science Content:
1. **Find the paper** — arXiv, journal, preprint
2. **Read the abstract and methods** — Understand what was actually studied
3. **Get the DOI or paper URL**

#### Research Output Format

After research, create an evidence block for each piece of content:

```markdown
## Evidence Block: [Topic]

**Primary Source:** [URL to advisory/paper/bill/repo]
**Researcher/Author:** [Name, affiliation, handle]
**Writeup/Analysis:** [URL to blog post, article, or conference talk]
**PoC/Code:** [URL if exists, "None public" if not]
**Key Technical Detail:** [The specific thing that makes this interesting — not the CVE description]
**Self-Reply Links:** [URLs to include in the self-reply]
```

**HARD RULE: If you cannot fill in at least Primary Source and one Self-Reply Link, do not generate content for this topic.** Move to the next topic.

### Step 4: Draft Generation

**These are DRAFTS for Christauff to edit. Not finished products.**

Using the evidence block from Step 3, generate a draft. Present it with:

1. The evidence block (so Christauff has all the research)
2. A draft tweet (clearly marked as DRAFT)
3. A draft self-reply with real URLs
4. Character count
5. Pillar tag

#### Voice Rules (from voice-model.md):
- One take per tweet. Opinions stated as facts. No hedging.
- Zero hashtags (hard block)
- Zero exclamation marks (0.4% rate)
- Zero emoji (0.4% rate)
- Median 18 words. Short by default.
- Links in self-reply, never main tweet
- No "Key Takeaways:" / "Here's what you need to know:" / content marketing format
- No "What do you think?" — genuine questions only
- No "could potentially" / "it's worth noting" — commit to the take

#### Anti-Slop Check

Before presenting a draft, ask:

1. **Would Christauff actually say this?** If it reads like a prompt output, rewrite.
2. **Is this a reformatted CVE description?** If yes, it fails. Find the angle.
3. **Does this contain any information not in the evidence block?** If you're inventing details, stop.
4. **Is the "take" earned?** A take requires understanding the subject. Paraphrasing + adding "and that's the real problem" is not a take.
5. **Does the self-reply have real URLs?** If no, this draft is not ready.

#### Slop Patterns to Reject

| Pattern | Why It's Slop |
|---------|---------------|
| "The entire security model is 'hope nobody tries'" | Sounds clever, says nothing. Generic snark that could apply to any vuln. |
| "They put the lock on the outside of the door" | Metaphor-as-take. Cute but empty. |
| "This is the pattern I was talking about" | Self-referential authority without the reference. What pattern? Where? |
| "[N] articles covering this" | Counting articles is not analysis. What do the articles say? |
| "AI agents that inherit user tokens without explicit consent are going to be the next major attack surface class" | Prediction dressed as insight. Where's the evidence for "next major"? |
| Any sentence that could be generated by "write an engaging tweet about [CVE]" | That's what happened last time. |

**Thread format**: Separate tweets with `|||`

### Step 4.5: Image Decision

| Content Type | Image? | What Kind |
|-------------|--------|-----------|
| Thread starter | YES | Screenshot, diagram, data visualization |
| "Show work" post | YES | Terminal screenshot, code snippet, data table |
| Quick QT / observation | NO | Text only |
| Legislation analysis | MAYBE | Bill text screenshot if it strengthens the point |
| Cultural take | NO | Text only |

### Step 5: Link Strategy (Algorithm-Critical)

50-90% reach penalty for link posts confirmed.

| Content Type | Main Tweet | Self-Reply |
|-------------|-----------|------------|
| **Any analysis** | Insight only | Source link(s) — MUST be real URLs from evidence block |
| **Thread** | Full analysis without links | Links in final tweet or self-reply |
| **CVE/threat** | Impact analysis | Advisory URL + writeup URL |
| **Political** | Mechanism analysis | Bill text / court filing URL |

### Step 6: Timing Check

1. **Check last post time** — Must be 4+ hours since last post
2. **Post when the take is hot** — Don't wait for a window if breaking now
3. **If scheduling, target:** 8-10am ET, 12-1pm ET, 5-7pm ET
4. **Max 2 posts/day**
5. **Use PostScheduler jitter** — Varied timing, not machine-regular

### Step 7: Content Safety

**MANDATORY:**

```bash
bun ~/.claude/skills/TwitterBot/Tools/ContentSafety.ts check "tweet content here"
```

For threads:
```bash
bun ~/.claude/skills/TwitterBot/Tools/ContentSafety.ts check-thread "tweet1|||tweet2|||tweet3"
```

**If blocked**: Fix and re-check. Zero hashtags enforced.
**If warnings**: Verify CVE numbers, dates, control families against evidence block.

### Step 7.5: X Communities (Growth Lever — Under 5K Followers)

**2026 change:** X Community posts are visible platform-wide. Post 100% of original content to relevant Communities until 3K+ followers.

**Communities to target:**
- Cybersecurity / Infosec (infosec pillar)
- AI / Artificial Intelligence (AI/tech pillar)
- Build in Public (show-work content)
- Tech / Startup (general cross-domain reach)

QTs and replies are exempt from Community posting.

### Step 8: Posting

| Mode | Command | When |
|------|---------|------|
| **Immediate** | `bun PostScheduler.ts post "content"` | Breaking news, hot takes |
| **Queued** | `bun PostScheduler.ts queue "content" --at "ISO-8601"` | Scheduled content |
| **Dry run** | `bun PostScheduler.ts dry-run "content"` | Testing without posting |
| **Thread** | `bun PostScheduler.ts post-thread "t1|||t2|||t3"` | Multi-tweet analysis |

### Step 9: Self-Reply with Link

After the main tweet is posted:

```bash
bun PostScheduler.ts post "Source: [URL]" --reply-to [TWEET_ID]
```

**The URL must come from the evidence block. No placeholder links. No "link to article" without an actual URL.**

### Step 10: Post-Publish

1. Log to post history (automatic via PostScheduler)
2. Note pillar tag for engagement tracking balance
3. If thread: verify all tweets posted in order

---

## Batch Content Generation (Posting Ideas)

When generating multiple posting ideas at once (e.g., weekly batch from Feedly + competitive intel):

1. **Run research agents in parallel** — One per topic. Use PerplexityResearcher, OSINT, or FeedlyClient to gather evidence.
2. **Produce evidence blocks first** — Complete research before any draft writing.
3. **Generate drafts with evidence attached** — Each draft includes its evidence block, real URLs, researcher credits.
4. **Present as a .md file for editing** — Clearly marked as drafts. Christauff edits or rewrites.
5. **Include posting schedule recommendation** — Based on pillar balance and timing.

**File format:** `Data/posting-ideas-{date}.md`

Each idea in the file must have:
- Evidence block with verified URLs
- Draft tweet(s) clearly marked as DRAFT
- Draft self-reply with real source URLs
- Character count
- Pillar tag
- Safety check result

**If research finds no advisory URL, no writeup, and no primary source for a topic — drop it.** Don't generate content from Feedly API descriptions alone.

---

## Anti-Patterns

| Bad | Good | Why |
|-----|------|-----|
| Any hashtags | Zero hashtags always | Hard block in ContentSafety |
| Content marketing format | Just say the thing | "Key Takeaways:" is a bot signal |
| Numbered thread points | Continuous argument across 3-5 tweets | People thread conversations, not lists |
| "What do you think?" | Genuine question requiring expertise | Lazy CTA |
| Hedging | Commit to the take | Practitioners don't hedge |
| Link in main tweet | Link in self-reply | 50-90% reach penalty |
| Suppressing cultural takes | Lean into cultural takes | 10-15x engagement |
| Same posting time daily | Varied schedule with jitter | Automation detection |
| 3+ posts same day | Max 2, spaced 4-6 hours | AuthorDiversityScorer penalty |
| Reformatted CVE description | Opinionated analysis with evidence | The old workflow's failure mode |
| AI-generated "take" without evidence | Take grounded in specific research finding | Slop vs substance |
| Self-reply promising links with no URLs | Self-reply with actual advisory/writeup URLs | The reason the last batch was rated 2 |
| Generating tweets from API descriptions | Researching the topic THEN drafting | The fundamental fix |

# Report Workflow

Generate engagement, pillar distribution, and competitive intelligence reports for @DCWebGuy X account performance.

---

## Workflow Steps

### Step 1: Gather Metrics (Apify-Powered)

Primary data source: Apify `apidojo/twitter-scraper-lite` scraping @DCWebGuy's own tweets.

```bash
# Scrape DCWebGuy's recent tweets for metrics
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts scrape-own

# Or manual logging if Apify budget is constrained
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts log '{
  "followers": 987,
  "followersGained": 15,
  "followersLost": 2,
  "impressions": 5000,
  "likes": 45,
  "retweets": 12,
  "replies": 8
}'
```

Log revenue:
```bash
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts log-revenue '{
  "source": "beehiiv-boosts",
  "amount": 2.50,
  "description": "New subscriber boost payout"
}'
```

### Step 2: Gather Competitive Intelligence

```bash
# Run weekly competitive intel scrape (if not already done this week)
bun ~/.claude/skills/TwitterBot/Tools/CompetitiveIntel.ts scrape

# Generate analysis from latest scrape data
bun ~/.claude/skills/TwitterBot/Tools/CompetitiveIntel.ts analyze

# Quick view of top performers across tracked accounts
bun ~/.claude/skills/TwitterBot/Tools/CompetitiveIntel.ts top-performers
```

### Step 3: Generate Performance Report

```bash
# All-time
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts report

# Weekly
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts report --weekly

# Monthly
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts report --monthly
```

### Step 4: Revenue Health Check

```bash
bun ~/.claude/skills/TwitterBot/Tools/EngagementTracker.ts revenue
```

Key metrics:
- **Self-sustaining threshold**: $500/mo
- **Current monthly cost**: $8/mo (X Premium)
- **Revenue vs. cost**: Net positive = self-sustaining

### Step 5: Pillar Distribution Analysis

Review content balance across the 5 pillars:

| Pillar | Target | This Week | Action |
|--------|--------|-----------|--------|
| Infosec | 25% | ? | Adjust if over/under |
| AI/Tech | 25% | ? | Adjust if over/under |
| Political | 25% | ? | Adjust if over/under |
| General | 15% | ? | Growth engine — don't suppress |
| Science | 10% | ? | Minimum viable presence |

Use `Data/engagement-metrics.jsonl` pillar tags to calculate actual distribution.

### Step 6: Competitive Context

From the latest `Data/competitive-intel/weekly-{date}.md`:

- **Top performing tweet across tracked accounts this week**
- **Patterns that multiple tracked accounts used successfully**
- **What DCWebGuy could adopt or adapt**

Cross-reference: Which techniques from tracked accounts align with DCWebGuy's natural voice?

### Step 7: Content Performance Analysis

Review which content types perform best:
- **Per-pillar engagement:** Which pillars drive the most views, replies, follows?
- **Thread vs. single tweet:** Engagement rate comparison
- **QT vs. original:** Which format drives more engagement?
- **With-image vs. without:** Does showing work correlate with higher engagement?
- **Time-of-day patterns:** When do DCWebGuy's posts perform best?

### Step 8: Adjust Strategy

Based on performance data:
1. Double down on high-performing content types and pillars
2. Apply successful patterns from competitive intel
3. Adjust posting timing based on actual performance data
4. Update voice model if new patterns emerge
5. Add or remove tracked accounts based on relevance

---

## Report Output Format

```markdown
## DCWebGuy Weekly — {date}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Growth
Followers: {count} ({delta} this week)

### Top 3 Posts by Engagement
1. {tweet text} — {views}v, {likes}l, {replies}r [{pillar}]
2. ...
3. ...

### Pillar Distribution
Infosec {%} | AI/Tech {%} | Political {%} | General {%} | Science {%}
Target:  25%  |    25%      |     25%       |    15%      |    10%

### What Worked
- {pattern from top performers}

### What Didn't
- {pattern from bottom performers}

### Competitive Intel Highlights
- Top tweet across tracked accounts: {@handle} — {description} ({views}v)
- Pattern: {what multiple accounts did successfully this week}
- Opportunity: {what DCWebGuy could try based on competitive data}

### Revenue
Total: ${amount} | Self-sustaining: {%} of $500/mo target

### Actions for Next Week
- [ ] {specific action based on data}
- [ ] {specific action based on data}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Revenue Milestones

| Milestone | Threshold | Action |
|-----------|-----------|--------|
| First revenue | $1 | Proof of concept |
| Cover X Premium | $8/mo | Break-even on platform costs |
| Basic API tier | $200/mo | Enable read access, real-time monitoring |
| Self-sustaining | $500/mo | Covers compute costs |
| Growth investment | $1K/mo | Paid tools, beehiiv tier |
| AI reply capability | $3K/mo | Apply for X automated reply approval |
| Product development | $5K/mo | Digital products, course creation |

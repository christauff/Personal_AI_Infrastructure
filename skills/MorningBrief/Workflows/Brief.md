# MorningBrief Workflow: Brief

**Purpose:** Synthesize overnight work into actionable morning briefing

---

## Voice Notification

**MANDATORY - Execute immediately:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Preparing your morning briefing from overnight accumulation"}' \
  > /dev/null 2>&1 &
```

---

## Step 1: Gather Overnight Outputs

Read from the following locations:

### Tide Pool Outputs
```bash
ls ~/.claude/POOLS/COMPLETE/
```
- Read each `.md` file
- Note: Files with `[PARTIAL]` prefix need attention
- Sort by priority (from metadata header)

### Dream Report
```bash
cat ~/.claude/DREAMS/NIGHTLY/$(date +%Y-%m-%d).md
```
- If today's report doesn't exist, note that dream consolidation didn't run
- Extract: connections found, synthesis candidates, recommendations

### Landscape Scan (LandscapeFacade — automated daily via Feedly)
```bash
cat ~/.claude/skills/LandscapeMonitor/Data/scans/$(date +%Y-%m-%d)-auto.md
```
- Read today's automated landscape scan (generated at 7:15 AM by cron)
- If file doesn't exist, landscape-scan.sh cron job didn't run
- Summarize top CRITICAL/HIGH items across agent-news, github, creators
- Link to full scan for drill-down

### Landscape Alerts
```bash
ls ~/.claude/skills/LandscapeMonitor/Data/alerts/
```
- Read any files created in last 24 hours (includes auto-generated CRITICAL alerts from LandscapeFacade)
- Sort by severity: CRITICAL > HIGH > MEDIUM

### Protocol Watch
```bash
ls ~/.claude/skills/ProtocolWatch/Data/breaking-changes/
```
- Check for any files dated today
- These are highest priority items

### Security News Digest (SECUpdates)
```bash
cat ~/.claude/skills/SECUpdates/State/daily-digest-$(date +%Y-%m-%d).md
```
- Read today's security digest (generated overnight by Phase 2.5)
- If file doesn't exist, overnight processor didn't run SECUpdates
- Summarize top 3-5 items across News/Research/Ideas categories
- Link to full digest for drill-down

### Threat Intelligence (FeedlyClient)
```bash
cat ~/.claude/skills/FeedlyClient/Data/daily-digests/digest-$(date +%Y-%m-%d).json
cat ~/.claude/skills/FeedlyClient/Data/daily-digests/trending-$(date +%Y-%m-%d).json
```
- Read today's Feedly digest (generated at 6:30 AM by cron)
- If file doesn't exist, Feedly cron job didn't run
- Highlight trending CVEs with high CVSS/EPSS scores
- Note any threat actors with increased activity

### Upstream PAI Updates (UpstreamSync — Sundays only)
```bash
ls ~/.claude/skills/UpstreamSync/State/upstream-alert-*.md
cat ~/.claude/skills/UpstreamSync/State/last-detect.json
```
- Check for upstream alert files (generated Sunday 7 AM by cron)
- If alert exists, new PAI version is available
- Summarize what changed, recommend running `/UpstreamSync`

### Value Audit Report
```bash
cat ~/.claude/GOVERNANCE/value-audit-latest.md
```
- Check for RED systems — these need attention
- If only GREEN/GREY, skip (no noise in the brief)
- Report generated weekly by `value-audit.sh` (Sunday 8 AM)
- Source registry: `~/.claude/GOVERNANCE/system-registry.yaml`

### AutoLearn Proposals
```bash
ls ~/.claude/AUTOLEARN/PENDING/
```
- Read any `.yaml` files awaiting approval
- These are AI-proposed improvements from community content

### Budget Status
```bash
bun run ~/.claude/skills/BudgetMonitor/Tools/CalculateBudget.ts --brief
bun run ~/.claude/skills/BudgetMonitor/Tools/Dashboard.ts 2>/dev/null
```
- Run CalculateBudget.ts --brief for one-line budget summary
- Generate dashboard HTML for detailed view
- Include alert level if > 70% consumed
- Note any services approaching limits

---

## Step 2: Prioritize Content

### Priority Order

1. **CRITICAL ALERTS** (always lead with these)
   - Protocol breaking changes
   - Security vulnerabilities
   - Deprecation notices with deadlines

2. **VALUE AUDIT RED SYSTEMS** (silent failures needing attention)
   - Only surface if RED systems exist in value-audit-latest.md
   - Include system name, last good output, and issue description
   - Skip if all systems GREEN/GREY (no noise)

3. **COMPLETED TIDE POOLS** (high-value background work)
   - Research results
   - Synthesis outputs
   - Creative options generated

3. **DREAM CONNECTIONS** (unexpected insights)
   - Non-obvious patterns
   - Historical echoes
   - Synthesis candidates

4. **AUTOLEARN PROPOSALS** (self-improvement tasks)
   - AI-proposed improvements from community learning
   - Require explicit approval before execution
   - Show source, insight, proposed action, risk level

5. **LANDSCAPE UPDATES** (ecosystem news)
   - New releases
   - Industry developments
   - Competitive intelligence

6. **ADMINISTRATIVE** (housekeeping)
   - Files archived
   - Errors encountered
   - Metrics

---

## Step 3: Generate Briefing

### Format Template

```markdown
Good morning, Christauff.

## Overnight Synthesis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### {SECTION: Only include if items exist}

#### Alerts
{For each CRITICAL/HIGH alert:}
- **{Title}** - {One-line summary}
  └─ {Why it matters for PAI}

#### System Health {Only include if RED systems exist in value-audit-latest.md}
{For each RED system:}
- **{System}** — {Issue}
  └─ Last good output: {date or "never"} | Grace: {N}d exceeded

#### Security Intel
{If SECUpdates daily-digest exists:}
- Top 3-5 items from overnight security news digest
  └─ "Full digest: ~/.claude/skills/SECUpdates/State/daily-digest-{date}.md"

{If FeedlyClient digest exists:}
- **Trending CVEs:** {Count} new, top: {highest CVSS CVE}
- **Threat Actors:** {any with increased activity}
  └─ "Full intel: ~/.claude/skills/FeedlyClient/Data/daily-digests/"

#### Upstream PAI {Only include on Sundays or if alert file exists}
{If upstream-alert-*.md exists:}
- **New PAI version available** — Run `/UpstreamSync` to review
  └─ {Summary of changes from last-detect.json}

#### Tide Pools Completed
{For each completed pool:}
- **{Pool type}: {Topic}** - {Status}
  └─ {Key finding or "Ready for review"}

#### Dream Connections
{If dream report exists and has connections:}
- {Connection title}: {Brief description}
  └─ {Why it's interesting}

#### Landscape Updates (automated scan)
{If today's scan file exists at LandscapeMonitor/Data/scans/YYYY-MM-DD-auto.md:}
- **Agent Ecosystem:** {top 2-3 scored items from agentNews}
- **GitHub/Frameworks:** {top 2-3 scored items from github}
- **Claude Code Creators:** {top 1-2 items from creators}
  └─ "Full scan: ~/.claude/skills/LandscapeMonitor/Data/scans/{date}-auto.md"
{If scan file doesn't exist:}
- Landscape scan cron (7:15 AM) did not run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Files staged:** {count} in POOLS/COMPLETE/
**Dream report:** {path or "Not generated"}
**Overnight processor:** {Ran at X / Did not run}

#### AutoLearn Proposals
{IF pending tasks exist in AUTOLEARN/PENDING/:}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{For each pending task:}
┌─────────────────────────────────────────────────────────────────┐
│ AUTOLEARN PROPOSAL #{sequence}                                  │
├─────────────────────────────────────────────────────────────────┤
│ Source: {creator} @ {url_domain}                                │
│ Article: {article_title}                                        │
│ ─────────────────────────────────────────────────────────────── │
│ Insight: {extracted_insight}                                    │
│ ─────────────────────────────────────────────────────────────── │
│ Proposed: {proposed_action.description}                         │
│ Target: {proposed_action.target}                                │
│ Category: {category} | Risk: {risk}                             │
│ ─────────────────────────────────────────────────────────────── │
│ RedTeam Score: {validation.overall_score}                       │
│ Injection Score: {validation.injection_score}                   │
│ ─────────────────────────────────────────────────────────────── │
│ [A]pprove  [R]eject  [M]odify  [I]nspect source                 │
└─────────────────────────────────────────────────────────────────┘
{End for each}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Trust Scores:**
{Show current trust scores from TrustManager}
bun run ~/.claude/skills/AutoLearn/Tools/TrustManager.ts status

#### Budget Status
{EMOJI} **{PERCENT}%** consumed | ${REMAINING} remaining | {RUNWAY} days runway
{If any service > 70%: list service alerts}

Shall I expand on any of these?
```

---

## Step 4: Offer Actions

After presenting the brief, offer relevant actions:

### If CRITICAL alerts exist:
"The {alert} needs attention. Should I investigate further?"

### If tide pools completed:
"Would you like me to summarize the {topic} research?"

### If dream connections found:
"Want me to explore the {connection} pattern?"

### If landscape updates found:
"Should I do a deep dive on {item}?"

### If AutoLearn proposals pending:
"You have {N} AutoLearn proposals awaiting approval. Shall I present them?"

**When presenting proposals:**
- Show full proposal card (see template above)
- Wait for user decision: [A]pprove, [R]eject, [M]odify, [I]nspect
- Record decision with TrustManager:
  - [A]pprove: `bun run TrustManager.ts record {task-id} approved_clean`
  - Move task to APPROVED/, notify about next execution
- [R]eject: `bun run TrustManager.ts record {task-id} rejected`
  - Move task to REJECTED/, explain trust score impact
- [M]odify: Let user edit, then approve as `approved_minor` or `approved_major`
- [I]nspect: Show raw source content for verification

### Always offer:
"Or just say 'thanks' to acknowledge and continue."

---

## Verbosity Handling

### Quick Mode (default for "good morning")
- Executive summary only
- Bullet points, no details
- < 30 seconds to read

### Standard Mode ("morning brief")
- Summary + key details
- Include file paths
- ~ 2 minutes to read

### Full Mode ("full overnight report")
- Everything with context
- Include partial file contents
- ~ 5 minutes to read

---

## Error Handling

### If overnight processor didn't run:
```markdown
**Note:** Overnight processor did not run last night.
- Check: `~/.claude/GOVERNANCE/overnight.log`
- Dream consolidation was skipped
- Tide pools were not processed

Would you like me to run a catch-up process now?
```

### If no content to report:
```markdown
Good morning, Christauff.

## Overnight Synthesis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No overnight activity to report.

- No seeds were queued in POOLS/SEEDS/
- No alerts were triggered
- Dream report: Not generated (no new memories)

This is fine if yesterday was a light day.
The system is ready for today's work.
```

---

## Integration Notes

- This workflow is the primary consumer of overnight outputs
- Run automatically when user says "good morning" or similar
- Should feel like reconnecting with a colleague, not reading a report
- The goal is to make accumulated knowledge visible and actionable

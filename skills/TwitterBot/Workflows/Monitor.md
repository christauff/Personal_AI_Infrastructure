# Monitor Workflow

Scan federal compliance sources for new regulatory updates and generate content.

---

## Workflow Steps

### Step 1: Check Monitor State

```bash
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts status
```

Review when each source was last checked and how many findings exist.

### Step 2: Scan Sources

Scan all sources (or a specific category):

```bash
# All sources
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts scan

# Specific category
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts scan --source cisa
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts scan --source cmmc
```

This outputs instructions for which URLs to check. Use WebFetch or Research agents to fetch each source.

### Step 3: Process Findings

For each new item discovered, add it as a finding:

```bash
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts add-finding '{
  "title": "NIST SP 800-53 Rev 6 Draft Released",
  "summary": "NIST released draft revision 6 with new AI-specific controls",
  "url": "https://csrc.nist.gov/...",
  "category": "nist",
  "sourceId": "nist-csrc",
  "actionableInsight": "Three new control families target AI systems. If you maintain an SSP, start mapping now."
}'
```

### Step 4: Generate Tweet Content

```bash
bun ~/.claude/skills/TwitterBot/Tools/RegulatoryMonitor.ts generate
```

This creates tweet-ready content from unprocessed findings.

### Step 5: Review and Queue

Review generated tweets for:
1. **Accuracy** — Are CVE numbers, SP numbers, dates correct?
2. **Actionability** — Does it tell practitioners what to DO?
3. **Tone** — Professional, not sensational?

Then queue or post via PostScheduler:
```bash
bun ~/.claude/skills/TwitterBot/Tools/PostScheduler.ts queue "generated tweet content"
```

### Step 6: Cross-Reference with SECUpdates

If SECUpdates has been run recently, check for overlapping content:
- Avoid duplicate coverage
- Use SECUpdates findings to enrich regulatory context
- Combine security news with compliance impact analysis

---

## Scanning Schedule

| Frequency | Sources | Rationale |
|-----------|---------|-----------|
| **Hourly** (when active) | CISA KEV, CISA Advisories | Time-sensitive vulnerability data |
| **Daily** | NIST CSRC, FedRAMP, CMMC | Regulatory publications |
| **Weekly** | AI governance, supply chain | Policy changes are slower |

## Integration with PAI Agents

For parallel scanning, spawn Research agents:

```
Launch 3 parallel agents:
  Agent 1: WebFetch CISA KEV + advisories
  Agent 2: WebFetch NIST CSRC + NVD
  Agent 3: WebFetch FedRAMP + CMMC + Cyber AB
```

Each agent returns findings as JSON for `add-finding`.

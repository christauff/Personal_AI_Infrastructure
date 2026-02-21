# SecurityPoll Workflow

Automated polling of structured security feeds. Run every 12 hours via cron.

## Trigger

- **Cron:** `0 */12 * * *` (every 12 hours)
- **Manual:** `/AgentWatch poll`

## Philosophy

This workflow ONLY polls structured, machine-readable feeds:
- NVD CVE database (JSON API)
- GitHub Security Advisories (GraphQL API)
- GitHub Releases (REST API)

It does NOT process freeform content (Twitter, discussions, issues) because that creates an attack surface for self-referential prompt injection.

## Execution

### Step 1: Load State

```bash
# Read polling state
cat ~/.claude/skills/AgentWatch/Data/last-poll.json
```

Load:
- `nvd_last_modified` - Timestamp for incremental NVD queries
- `github_advisories` - Per-repo last-check timestamps
- `last_successful_poll` - Health tracking
- `errors_last_7d` - Degradation detection

### Step 2: Poll NVD (CVEs)

For each keyword in `Config/cve-keywords.yaml`:

```bash
# NVD API 2.0 - structured JSON response
curl -s "https://services.nvd.nist.gov/rest/json/cves/2.0?\
  keywordSearch=${KEYWORD}&\
  lastModStartDate=${LAST_MODIFIED}&\
  resultsPerPage=50"
```

For each CVE returned:
1. Check CVSS score against `min_cvss` threshold (default 7.0)
2. If meets threshold: append to `security-events.jsonl`
3. If CVSS >= `critical_cvss` (9.0): trigger voice alert

### Step 3: Poll GitHub Security Advisories

For each repo in `Config/tracked-repos.yaml`:

```bash
# GitHub GraphQL API - structured response
gh api graphql -f query='
  query {
    repository(owner: "${OWNER}", name: "${REPO}") {
      vulnerabilityAlerts(first: 10, states: OPEN) {
        nodes {
          securityAdvisory {
            ghsaId
            summary
            severity
            publishedAt
          }
          vulnerableManifestPath
        }
      }
    }
  }
'
```

For each advisory:
1. Check if already logged (dedupe by ghsaId)
2. If severity HIGH or CRITICAL: append to `security-events.jsonl`
3. If CRITICAL: trigger voice alert

### Step 4: Check Security-Relevant Releases

For critical-priority repos:

```bash
# Check recent releases
gh release list -R ${OWNER}/${REPO} -L 5 --json tagName,publishedAt,body
```

Flag releases containing keywords:
- "security"
- "vulnerability"
- "CVE"
- "fix"
- "patch"

### Step 5: Update State

Write to `last-poll.json`:
```json
{
  "nvd_last_modified": "[current timestamp]",
  "github_advisories": { ... },
  "last_successful_poll": "[current timestamp]",
  "poll_count": "[increment]",
  "errors_last_7d": "[update if errors]"
}
```

### Step 6: Health Check

- If `errors_last_7d > 3`: Voice alert about degraded monitoring
- Write heartbeat timestamp for external monitoring

## Output

- Append events to `Data/security-events.jsonl`
- Update `Data/last-poll.json`
- Voice alerts for CVSS >= 9.0 or CRITICAL severity

## Event Format

```jsonl
{"ts":"2026-02-05T10:00:00Z","type":"cve","id":"CVE-2026-XXXXX","cvss":8.8,"product":"langchain","description":"...","source":"nvd","actionable":true}
{"ts":"2026-02-05T10:00:00Z","type":"advisory","ghsa":"GHSA-xxxx","repo":"langchain-ai/langchain","severity":"HIGH","description":"...","source":"github","actionable":false}
{"ts":"2026-02-05T10:00:00Z","type":"release","repo":"anthropics/anthropic-sdk-python","version":"0.40.0","security_relevant":true,"notes":"Security fix for...","source":"github","actionable":false}
```

## Error Handling

- API rate limits: Back off and retry once, then log error
- Network failures: Log error, continue with other sources
- Parse errors: Log raw response for debugging
- Never fail silently - always update error count

## Tool Usage

```bash
# Run via tool
bun run ~/.claude/skills/AgentWatch/Tools/SecurityPoller.ts poll

# Or invoke from Claude
/AgentWatch poll
```

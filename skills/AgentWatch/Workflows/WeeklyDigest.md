# WeeklyDigest Workflow

Synthesize security polling + participation insights into actionable digest.

## Trigger

- **Weekly:** Sunday evening (integrate with DreamProcessor)
- **Manual:** `/AgentWatch digest`

## Philosophy

This is where automated security monitoring meets human-gathered strategic intelligence. The digest should answer:

1. **What happened?** - Security events and participation insights
2. **What matters?** - Prioritized by actionability and relevance
3. **What's next?** - Recommended actions and focus areas

## Execution

### Step 1: Load Data

```bash
# Security events (last 7 days)
tail -n 100 ~/.claude/skills/AgentWatch/Data/security-events.jsonl | \
  jq -s '[.[] | select(.ts >= "'$(date -d '7 days ago' -Iseconds)'")]'

# Participation insights (last 7 days)
tail -n 50 ~/.claude/skills/AgentWatch/Data/participation-log.jsonl | \
  jq -s '[.[] | select(.ts >= "'$(date -d '7 days ago' -Iseconds)'")]'

# Health status
cat ~/.claude/skills/AgentWatch/Data/last-poll.json
```

### Step 2: Categorize Security Events

| Priority | Criteria | Action |
|----------|----------|--------|
| **CRITICAL** | CVSS >= 9.0 OR affects direct dependency | Immediate attention |
| **HIGH** | CVSS >= 7.0 OR severity HIGH | Review this week |
| **MEDIUM** | Security-relevant release | Note for awareness |

### Step 3: Categorize Participation Insights

| Category | Route | Action |
|----------|-------|--------|
| `capability` | PAIUpgrade | Add to upgrade candidates |
| `security` | PromptInjection | Review for library inclusion |
| `architecture` | Memory | Store for future reference |
| `economic` | Memory | Flag for exploration |
| `trend` | Memory | Context for decisions |
| `relationship` | participation.yaml | Update contacts |

### Step 4: Generate Digest

Use this template:

```markdown
# AgentWatch Weekly Digest - Week of {start_date}

## Health Status

| Metric | Value | Status |
|--------|-------|--------|
| Polls completed | {count}/14 | {healthy/degraded} |
| Poll errors | {error_count} | |
| Last successful | {timestamp} | |

## Security Events ({count})

### Critical ({count})

{For each critical event:}
- **[{id}]** {product}: {description}
  - CVSS: {score}
  - Action: {recommended action}
  - Status: {addressed/pending}

### High ({count})

{For each high event:}
- **[{id}]** {repo}: {description}
  - Severity: {severity}

### Medium ({count})

{Summary of medium events or "None this week"}

## Participation Insights ({count})

### Capabilities Observed

{For each capability insight:}
- {insight}
  - Source: {source}
  - Action: {actionable or "Logged for reference"}

### Security Learnings

{For each security insight:}
- {insight}
  - Added to PromptInjection: {yes/no/pending}

### Architecture & Trends

{Summary of architecture and trend insights}

### Relationships

{New connections or follow-ups needed}

## Recommended Actions

1. {Highest priority action}
2. {Second priority action}
3. {Third priority action}

## Next Week Focus

- **Participation:** {suggested focus area}
- **Monitoring:** {any repos to add/remove}
- **Follow-up:** {people to connect with}

---
Generated: {timestamp}
Data sources: NVD, GitHub Security Advisories, participation logs
```

### Step 5: Save and Route

1. **Save digest:**
   ```
   ~/.claude/MEMORY/STATE/AgentWatch-Weekly-{date}.md
   ```

2. **Feed to DreamProcessor:**
   - Include in weekly consolidation cycle
   - Critical items get elevated to MEMORY.md if persistent

3. **Voice summary:**
   ```bash
   curl -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "AgentWatch digest: {critical_count} critical, {high_count} high security events. {insight_count} participation insights. {action_count} recommended actions."}'
   ```

### Step 6: Prune Old Data

After digest generation:
- Events older than 90 days: Archive or delete
- Participation logs older than 90 days: Archive or delete
- Keep last-poll.json current

```bash
# Archive old events (optional)
mkdir -p ~/.claude/skills/AgentWatch/Data/archive
mv events-older-than-90d.jsonl Data/archive/
```

## Output

- Markdown digest saved to Memory
- Voice summary of key findings
- Data pruning for storage hygiene

## Example Digest

```markdown
# AgentWatch Weekly Digest - Week of 2026-02-03

## Health Status

| Metric | Value | Status |
|--------|-------|--------|
| Polls completed | 14/14 | healthy |
| Poll errors | 0 | |
| Last successful | 2026-02-09T22:00:00Z | |

## Security Events (3)

### Critical (1)

- **[CVE-2026-25253]** OpenClaw: WebSocket origin bypass enables RCE
  - CVSS: 8.8
  - Action: Review PAI WebSocket handling for similar patterns
  - Status: Pending review

### High (2)

- **[GHSA-xxxx]** langchain: Prompt injection in SQL chain
  - Severity: HIGH
- **[GHSA-yyyy]** crewai: Arbitrary code execution in tool loading
  - Severity: HIGH

## Participation Insights (4)

### Capabilities Observed

- CrewAI adding native MCP support in Q2
  - Source: crewai-discord
  - Action: Monitor for adoption patterns

### Security Learnings

- New unicode normalization prompt injection technique discussed
  - Added to PromptInjection: pending

## Recommended Actions

1. Review WebSocket origin validation in any PAI network code
2. Add unicode normalization detection to PromptInjection library
3. Follow up with CrewAI team about MCP implementation details

## Next Week Focus

- **Participation:** CrewAI Discord - MCP discussion threads
- **Monitoring:** Add crewai security advisories to tracked repos
- **Follow-up:** Connect with CrewAI core team member met at conference
```

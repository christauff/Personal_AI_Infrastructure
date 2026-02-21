# LogInsight Workflow

Manual capture of insights from participation activities.

## Trigger

- **Manual:** `/AgentWatch log`
- **Context:** After community participation, conference attendance, contributor activities

## Philosophy

Strategic intelligence comes from human participation in communities, not automated surveillance. This workflow captures the valuable insights that emerge from:

- Discord/Slack conversations
- Conference hallway chats
- Code review participation
- Issue triage involvement
- Direct relationships with maintainers

These insights are inherently human-curated - the judgment of "this is worth remembering" is part of the value.

## Execution

### Step 1: Gather Context

Ask the user:

**Source:** Where did this insight come from?
- `discord` - Community Discord server
- `slack` - Private/work Slack
- `conversation` - Direct conversation with someone
- `conference` - Conference talk or hallway
- `contribution` - While contributing code
- `reading` - Blog post, paper, documentation
- `other` - Specify

**Contact (optional):** Who shared this? (for relationship tracking)

### Step 2: Capture Insight

Ask the user:

**Insight:** What did you learn? (free text)

**Category:** Which pillar does this relate to?
- `capability` - New feature/ability PAI could implement
- `architecture` - Design pattern or approach
- `security` - Vulnerability, attack, or defense
- `economic` - Self-funding mechanism, agent commerce
- `trend` - Industry direction, adoption pattern
- `relationship` - Connection made, person to follow up with

### Step 3: Determine Actionability

Ask the user:

**Actionable?** Does this require action?
- If yes: What action? (free text)
- If no: Just log for future reference

### Step 4: Route Suggestion

Based on category, suggest routing:

| Category | Suggested Route |
|----------|-----------------|
| `capability` | "Consider adding to PAIUpgrade candidates" |
| `security` | "Consider adding to PromptInjection library" |
| `architecture` | "Log to Memory for future reference" |
| `economic` | "Flag for self-sufficiency exploration" |
| `trend` | "Include in weekly digest" |
| `relationship` | "Add to participation.yaml contacts" |

### Step 5: Save Entry

Append to `Data/participation-log.jsonl`:

```json
{
  "ts": "2026-02-05T14:30:00Z",
  "source": "crewai-discord",
  "contact": "harrison-chase",
  "insight": "LangGraph is moving to event-driven architecture in Q2, may deprecate some current patterns",
  "category": "architecture",
  "actionable": "Monitor LangGraph releases, review our orchestration patterns",
  "routed_to": null
}
```

### Step 6: Confirm

Output confirmation:
```
Insight logged successfully.

Category: architecture
Source: crewai-discord
Suggested action: Log to Memory for future reference

Use /AgentWatch digest to include in weekly synthesis.
```

## Output

- Append to `Data/participation-log.jsonl`
- Suggested routing to appropriate skill
- Confirmation message

## Weekly Reflection

The `Config/participation.yaml` file includes reflection prompts. Use these during weekly `/AgentWatch log` sessions:

1. What capability did I see that PAI doesn't have?
2. What security concern came up in discussions?
3. Who should I build a deeper relationship with?
4. What's the community sentiment on [current focus]?
5. What economic/self-funding patterns are people discussing?
6. What attack techniques are researchers exploring?

## Integration

Insights logged here feed into:
- **WeeklyDigest** - Synthesized with security events
- **PAIUpgrade** - Capability insights become upgrade candidates
- **PromptInjection** - Security insights inform defenses
- **Memory** - Strategic context for future sessions

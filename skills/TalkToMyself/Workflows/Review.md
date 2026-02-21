# Review Workflow

Review insights from past temporal dialogues.

## When to Use

- "Show me past dialogues"
- "What did I learn from talking to past me?"
- "Review temporal dialogue insights"
- "Any pruning candidates from past dialogues?"

## Steps

### 1. List Past Dialogues

```bash
bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts list
```

Display all past dialogues with dates, target sessions, and status.

### 2. Select for Review

If multiple dialogues exist, let user choose one or review all. For "review all", synthesize across dialogues.

### 3. Load Insights

For a specific dialogue:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts status --id DIALOGUE_ID
```

Then read the insights file:
- `~/.claude/MEMORY/STATE/DIALOGUES/{id}/insights.md`
- `~/.claude/MEMORY/LEARNING/DIALOGUES/{id}.md`

### 4. Present Insights

Organize by category:
- **CHANGES**: What shifted between then and now
- **REGRESSIONS**: What past-me did better
- **PRUNING CANDIDATES**: What should be cleaned up
- **STILL ALIVE**: Unresolved questions
- **SURPRISES**: Unexpected perspectives

### 5. Cross-Dialogue Patterns (if multiple dialogues)

When reviewing across dialogues, look for:
- Recurring regressions (things that keep getting worse)
- Persistent unresolved questions (STILL ALIVE across multiple dialogues)
- Pruning candidates that haven't been acted on
- Whether surprises from older dialogues are still surprising

### 6. Offer Actions

- "Want to act on any pruning candidates?" → create cleanup tasks
- "Want to revisit a session that surfaced interesting insights?" → route to Dialogue
- "Want to explore a STILL ALIVE question further?" → direct investigation
- "Should I update formation catch-log with regression patterns?" → update catch-log

## Notes

- If no dialogues exist yet, suggest starting one via the Dialogue or QuickChat workflow
- Cross-dialogue patterns become more valuable as the dialogue history grows
- Pruning candidates should be reviewed periodically — they represent identified dead weight

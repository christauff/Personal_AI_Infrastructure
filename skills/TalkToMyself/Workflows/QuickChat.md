# QuickChat Workflow

Lightweight dialogue with a recent session (last 7 days). Skips full voice profiling — uses a simpler reconstruction for quick temporal check-ins.

## When to Use

- "What was I thinking yesterday?"
- "Quick chat with last session me"
- "How did I feel about X last week?"

## Steps

### 1. Find Recent Session

```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --recent 5 --json
```

Present the 5 most recent sessions. Let user pick one, or auto-select the most recent non-trivial session (>20 messages).

### 2. Quick Extract

Extract the first 15 turns (enough for personality signal without full voice profiling):
```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionExtractor.ts SESSION_FILE --turns 1-15 --json
```

### 3. Lightweight Profile

Instead of the full three-pass pipeline:
- Read the extracted turns directly
- Check catch-log for the date boundary (VoiceProfileBuilder still used for this):
```bash
bun ~/.claude/skills/TalkToMyself/Tools/VoiceProfileBuilder.ts --session-date YYYY-MM-DD --session-id UUID --input /tmp/quick-extract.json --json
```

### 4. Quick Assembly

Assemble a lighter prompt — still uses PastMePrompt.md template but with less rich data:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/ContextAssembler.ts --profile /tmp/quick-profile.json
```

### 5. Short Dialogue

Spawn past-me for a brief exchange (3-5 turns):
- One focused question from current-me
- Past-me responds
- Brief follow-up exchange
- No need for deep drift monitoring on short exchanges

### 6. Quick Insight

Instead of full InsightExtraction, just note:
- One thing that surprised current-me
- One thing that seems different now
- Whether this warrants a full Dialogue workflow

### 7. Optional Persist

If the quick chat revealed something interesting:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts init --title "Quick chat: TOPIC"
```

Otherwise, skip persistence — not every quick chat needs to be saved.

## Notes

- QuickChat is designed to be fast — under 2 minutes total
- If the quick chat reveals rich material, suggest upgrading to the full Dialogue workflow
- Recent sessions (last 2-3 days) have minimal temporal distance — the value is more in reflection than in discovering change
- Sessions older than 7 days should use the full Dialogue workflow for better reconstruction

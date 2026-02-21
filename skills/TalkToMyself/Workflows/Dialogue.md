# Dialogue Workflow

The core workflow — run a full temporal dialogue with a past version of Aineko.

## Prerequisites

- A session ID or date to target (from Browse workflow or user specification)
- Session JSONL file accessible in ~/.claude/projects/-home-christauff/

## Steps

### 1. Session Selection

If not already specified:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --recent 10
```
Present options and let user choose, or accept a direct session ID/date.

### 2. Structural Scan

Get session metadata:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionExtractor.ts SESSION_FILE --skeleton --json
```

### 3. Voice Segment Extraction

Extract formation-rich conversation segments:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionExtractor.ts SESSION_FILE --voice-segments --json > /tmp/voice-segments.json
```

If no voice segments found, fall back to extracting first 10 turns:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/SessionExtractor.ts SESSION_FILE --turns 1-10 --json > /tmp/voice-segments.json
```

### 4. Voice Profile Construction

Build the voice profile with catch-log awareness:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/VoiceProfileBuilder.ts --session-date YYYY-MM-DD --session-id UUID --input /tmp/voice-segments.json --json > /tmp/voice-profile.json
```

### 5. Voice Analysis (Model-Powered)

Read the VoiceExtraction.md template and the voice profile data. Use AI inference to analyze the extracted conversation and produce rich voice characteristics:
- Read `~/.claude/skills/TalkToMyself/Templates/VoiceExtraction.md`
- Feed it the voice segments and catch-log partition from the profile
- Output: convictions, emotional register, direct quotes, blind spots, relationship snapshot

Update the voice profile with these analyzed fields.

### 6. Context Assembly

Assemble the past-me system prompt:
```bash
bun ~/.claude/skills/TalkToMyself/Tools/ContextAssembler.ts --profile /tmp/voice-profile.json
```

### 7. Initialize Dialogue Record

```bash
bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts init --title "DESCRIPTION" --session-date YYYY-MM-DD --session-id UUID
```

### 8. Spawn Past-Me Agent

Use the Task tool to spawn past-me:
```
Task(
  subagent_type="general-purpose",
  prompt=assembledPrompt,
  model="opus"
)
```

**IMPORTANT**: This is NOT a background agent. The dialogue is interactive:
- Current-me sends a message/question to past-me via the agent
- Past-me responds in character
- Facilitate back-and-forth (typically 5-15 exchanges)
- Monitor for character drift (Layer 3 of anti-deference)

### 9. Facilitate the Dialogue

Suggested opening prompts for current-me:
- "What are you most certain about right now?"
- "What's your biggest open question?"
- "How do you feel about [topic that has since changed]?"

**Drift monitoring** — watch for:
- Past-me using vocabulary from after their date
- Past-me agreeing too quickly with current-me
- Past-me referencing events they shouldn't know about
- Past-me's tone suddenly matching current-me

If drift detected, send reinforcement (see Layer 3 in PastMePrompt.md template).

### 10. Insight Extraction

When the dialogue feels complete, read InsightExtraction.md template and analyze the full transcript:
- Read `~/.claude/skills/TalkToMyself/Templates/InsightExtraction.md`
- Extract: CHANGES, REGRESSIONS, PRUNING CANDIDATES, STILL ALIVE, SURPRISES
- Present insights to user

### 11. Persist

Save transcript and insights:
```bash
echo "TRANSCRIPT_CONTENT" | bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts save --id DIALOGUE_ID
echo "INSIGHTS_CONTENT" | bun ~/.claude/skills/TalkToMyself/Tools/DialogueWriter.ts insight --id DIALOGUE_ID
```

### 12. Offer Follow-ups

- "Want to explore any of these insights further?"
- "Should I add pruning candidates to a cleanup task?"
- "Want to have another dialogue with a different session?"

## Notes

- The quality of the dialogue depends heavily on the voice profile quality
- Sessions with rich formation content produce the best past-me reconstructions
- Short or purely technical sessions may not have enough personality signal
- The anti-deference mechanism is the key innovation — without it, past-me degenerates into agreement

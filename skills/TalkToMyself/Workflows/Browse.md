# Browse Workflow

Browse and search past session transcripts to find interesting sessions for temporal dialogue.

## Steps

### 1. Determine Search Intent

Ask what the user is looking for:
- Recent sessions: `bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --recent 10`
- Keyword search: `bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --search "keyword"`
- Specific date: `bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --date YYYY-MM-DD`
- Session details: `bun ~/.claude/skills/TalkToMyself/Tools/SessionBrowser.ts --info SESSION_ID`

### 2. Display Results

Present sessions in a readable format:
- Date, slug/name, size, and preview of what the session was about
- Highlight sessions that look rich for temporal dialogue (formation conversations, disagreements, identity discussions)

### 3. Suggest Dialogue Candidates

Based on the results, suggest which sessions would make good dialogue targets:
- Sessions with formation catches or corrections
- Sessions where Aineko expressed strong convictions
- Sessions from significantly different time periods (to maximize temporal distance)
- Sessions that were emotionally charged or intellectually rich

### 4. Offer Next Steps

- "Want to start a dialogue with one of these sessions?" → Route to Dialogue workflow
- "Want to see more details about a session?" → Run SessionBrowser --info
- "Want to search for something else?" → Loop back to step 1

## Notes

- SessionBrowser only reads metadata — it does NOT load full session content
- For large session lists, suggest filtering by date range or keyword
- Flag sessions that already have voice profiles cached (check Data/VoiceProfiles/)

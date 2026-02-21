# AttributionQuery

Answer "who wrote this code?" queries by combining trace data with git history.

## Steps

1. **Identify the file** in question from the user's request.

2. **Query trace data** for that file:
   ```bash
   bun run ~/.claude/skills/AgentTrace/Tools/TraceCapture.ts query --file <path>
   ```

3. **Cross-reference with git blame** for human vs AI attribution:
   ```bash
   git blame <file>
   ```

4. **Build attribution timeline:**
   - Match trace records (AI-generated) against git blame (committed by human or AI).
   - Identify which line ranges were AI-generated vs human-written.
   - Note the model and session for each AI-generated range.

5. **Present results** to the user:
   - Timeline of changes with AI/human indicators
   - For AI ranges: model, session, timestamp
   - For human ranges: author, commit hash, date

## Notes

- Trace data covers Write/Edit operations during AI sessions.
- Git blame covers all committed history.
- Lines present in both sources were AI-generated and then committed.
- Lines only in git blame were human-written or AI-generated before tracing was enabled.

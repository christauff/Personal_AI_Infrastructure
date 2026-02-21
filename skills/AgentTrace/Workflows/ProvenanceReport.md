# ProvenanceReport

Generate provenance reports from trace data.

## Steps

1. **Run the report command:**
   ```bash
   bun run ~/.claude/skills/AgentTrace/Tools/TraceCapture.ts report
   ```

2. **Optionally filter by date:**
   ```bash
   bun run ~/.claude/skills/AgentTrace/Tools/TraceCapture.ts report --since 2026-02-01
   ```

3. **Present summary** to the user:
   - Total files touched
   - Models used and lines generated per model
   - Sessions with most activity
   - Date range of traces

4. **Identify high-activity files** -- files with the most trace records indicate heavy AI generation.

5. **Identify high-activity sessions** -- sessions with many traces indicate bulk generation work.

## Notes

- Reports are read-only queries against Data/traces.jsonl.
- No data is modified during report generation.
- For file-specific queries, use the `query` subcommand instead.

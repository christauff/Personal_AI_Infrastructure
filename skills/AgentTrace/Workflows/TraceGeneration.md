# TraceGeneration

Manually record provenance for generated code.

## Steps

1. **Identify files** that were generated or modified in this session.

2. **For each file**, run the capture command:
   ```bash
   bun run ~/.claude/skills/AgentTrace/Tools/TraceCapture.ts capture <file> \
     --start-line <N> --end-line <N> --action write \
     --model claude-opus-4-6 --session-id <session>
   ```

3. **Verify** the trace was recorded:
   ```bash
   bun run ~/.claude/skills/AgentTrace/Tools/TraceCapture.ts query --file <path>
   ```

4. **Report** results to the user with file paths and line ranges traced.

## Notes

- Use `--action write` for new files, `--action edit` for modifications.
- The `--session-id` flag is optional; defaults to "manual" if omitted.
- The `--model` flag is optional; defaults to "unknown" if omitted.
- Traces are append-only. There is no delete operation.

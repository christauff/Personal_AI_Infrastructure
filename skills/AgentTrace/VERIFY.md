# AgentTrace Verification

## Tool Tests
- [ ] `bun run Tools/TraceCapture.ts --help` shows usage
- [ ] `bun run Tools/TraceCapture.ts capture /tmp/test.ts --start-line 1 --end-line 10 --action write` records trace
- [ ] `bun run Tools/TraceCapture.ts query --file /tmp/test.ts` returns the trace
- [ ] `bun run Tools/TraceCapture.ts report` shows summary

## Data
- [ ] Data/ directory exists and is writable
- [ ] Data/traces.jsonl created after first capture

## Hook
- [ ] hooks/AgentTraceCapture.hook.ts exists
- [ ] Hook is registered in settings.json PostToolUse for Write and Edit matchers

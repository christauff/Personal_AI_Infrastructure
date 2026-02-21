# A2ABridge Verification

## Tool Tests
- [ ] `bun run Tools/A2AServer.ts --help` shows usage
- [ ] `bun run Tools/A2AServer.ts card` generates valid Agent Card JSON
- [ ] `bun run Tools/A2AServer.ts card --validate` passes validation

## Server Test (manual)
- [ ] `bun run Tools/A2AServer.ts serve &` starts server
- [ ] `curl http://localhost:8889/.well-known/agent.json` returns Agent Card
- [ ] `curl http://localhost:8889/health` returns OK
- [ ] Kill server process after test

## Config
- [ ] Config/agent-card.yaml exists and is valid YAML
- [ ] Data/ directory exists and is writable

## Hook
- [ ] hooks/A2AValidator.hook.ts exists
- [ ] Hook validates injection patterns correctly

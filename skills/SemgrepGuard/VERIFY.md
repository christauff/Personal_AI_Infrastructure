# SemgrepGuard Verification

## Prerequisites
- [ ] `which semgrep` returns path
- [ ] `semgrep --version` >= 1.50.0

## Tool Tests
- [ ] `bun run Tools/SemgrepScan.ts --help` shows usage
- [ ] `bun run Tools/SemgrepScan.ts scan Tools/` completes without error
- [ ] `bun run Tools/SemgrepScan.ts rules` lists available rules
- [ ] `bun run Tools/SemgrepScan.ts report` completes (empty is OK)

## Data
- [ ] Data/ directory exists and is writable

## Hook
- [ ] hooks/SemgrepInlineCheck.hook.ts exists
- [ ] Hook is registered in settings.json PostToolUse for Write and Edit matchers

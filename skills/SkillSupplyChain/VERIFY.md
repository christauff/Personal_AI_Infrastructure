# SkillSupplyChain Verification

## Prerequisites
- [ ] SemgrepGuard skill exists at skills/SemgrepGuard/
- [ ] AgentTrace skill exists at skills/AgentTrace/
- [ ] InjectionLibrary exists at skills/PromptInjection/Tools/InjectionLibrary.ts

## Tool Tests
- [ ] `bun run Tools/SkillScanner.ts --help` shows usage
- [ ] `bun run Tools/SkillScanner.ts scan ../SemgrepGuard/` completes (scan a known-clean skill)
- [ ] `bun run Tools/SkillScanner.ts policy` shows current policies
- [ ] `bun run Tools/SkillScanner.ts report` completes (empty is OK)

## Data
- [ ] Data/ directory exists and is writable
- [ ] Config/policies.yaml exists and is valid YAML

## Hook
- [ ] hooks/SupplyChainGate.hook.ts exists
- [ ] Hook is registered in settings.json PreToolUse for Bash matcher

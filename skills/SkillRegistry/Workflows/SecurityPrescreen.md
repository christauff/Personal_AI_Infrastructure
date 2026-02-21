# SecurityPrescreen

Pre-screen a skill for security issues before installation using SkillSupplyChain.

## Steps

1. Identify skill to prescreen (path or name)
2. If name given (not a path): search registries first to find source
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts search "<name>"
   ```
3. If path given or after cloning from source, run SkillSupplyChain scan:
   ```bash
   bun run /home/christauff/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts scan <path> --report
   ```
4. Present verdict and findings to user:
   - PASS: Skill looks clean, safe to install
   - WARN: Issues found -- present findings, let user decide
   - FAIL: Serious issues -- recommend avoiding installation
5. Recommend proceed/caution/avoid based on verdict

## Notes
- This is the manual pre-screen workflow. The install command runs this automatically.
- For detailed JSON output, add `--json` flag to the scan command.
- Use `--strict` to treat any WARN as FAIL for high-security environments.

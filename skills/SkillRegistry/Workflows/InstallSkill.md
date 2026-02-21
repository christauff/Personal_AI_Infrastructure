# InstallSkill

Full skill installation pipeline with integrated security scanning.

## Steps

1. Search for skill across registries:
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts search "<name>"
   ```
2. Confirm selection with user -- show name, source, description, URL
3. Run the install pipeline (search, clone, scan, install):
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts install <skill-url>
   ```
4. Report verdict and installation status:
   - PASS: Installed successfully to ~/.claude/skills/
   - WARN: Warnings shown, user must confirm to proceed
   - FAIL: Installation blocked, findings displayed
5. If installed, verify with:
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts info <skill-name>
   ```

## Notes
- Security scanning via SkillSupplyChain is MANDATORY before install
- FAIL verdicts block installation entirely
- WARN verdicts require explicit user confirmation
- All install actions are logged to Data/registry-cache.jsonl for audit trail

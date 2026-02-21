# SearchRegistries

Search across configured skill registries for community and official skills.

## Steps

1. Get search query from user
2. Run registry search:
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts search "<query>"
   ```
3. Present results in formatted table with columns: Name, Source, Description, Stars/Downloads
4. If user wants more detail on a result, run:
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts info "<skill-name>"
   ```
5. If user wants to install, proceed to InstallSkill workflow

## Notes
- Results are cached in Data/registry-cache.jsonl for 24 hours
- Use `--registry <name>` to search a specific registry only
- Use `--limit <N>` to control max results (default 10)
- Registries that are unavailable are skipped gracefully

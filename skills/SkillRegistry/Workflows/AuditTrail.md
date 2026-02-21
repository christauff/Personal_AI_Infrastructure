# AuditTrail

Review installation history and audit records.

## Steps

1. Run the audit command:
   ```bash
   bun run ~/.claude/skills/SkillRegistry/Tools/RegistryClient.ts audit
   ```
2. Present install history with columns: Timestamp, Skill, Source, Verdict, Score
3. Highlight any skills installed with WARN verdict -- these may need re-evaluation
4. If security policies have been updated since installation:
   - Recommend re-scanning installed skills
   - Run SecurityPrescreen workflow on flagged skills

## Notes
- Audit data is stored in Data/registry-cache.jsonl
- Records include both search cache entries and install records
- Install records have `action: "install"` field for filtering
- Summary shows total installed, pass/warn/fail counts

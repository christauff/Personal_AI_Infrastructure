# SecurityReport Workflow

Generate a detailed security audit report from historical scan data.

## Steps

1. Run the report command:
   ```bash
   bun run ~/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts report
   ```
2. Present the audit history:
   - Total scans performed
   - Pass/Warn/Fail breakdown
   - Most common findings across all scans
3. Highlight any FAIL verdicts:
   - Which skills failed
   - What findings caused the failure
   - Whether the issues have been resolved
4. Recommend remediation for recurring issues:
   - Group similar findings
   - Suggest code patterns to replace dangerous operations
   - Link to PAI security documentation where relevant

## Notes
- Report covers all scans in Data/audit-log.jsonl
- Empty report is normal for fresh installations
- Consider running periodic scans to build audit history

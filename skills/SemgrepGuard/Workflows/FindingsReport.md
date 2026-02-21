# FindingsReport Workflow

Aggregate and report on historical scan findings.

## Steps

1. **Generate report** - Run the report subcommand:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts report
   ```

2. **Present findings by severity** - Show breakdown:
   - Total findings over time
   - Findings by severity (ERROR, WARNING, INFO)
   - Most frequently triggered rules
   - Most affected files

3. **Identify trends** - Analyze patterns:
   - Are certain rules triggering repeatedly? (indicates systemic issue)
   - Are findings concentrated in specific directories?
   - Are findings increasing or decreasing over time?

4. **Suggest remediation priorities** - Recommend action:
   - Priority 1: ERROR findings in production/deployed code
   - Priority 2: ERROR findings in development code
   - Priority 3: WARNING findings with high frequency
   - Priority 4: Remaining WARNING findings
   - Priority 5: INFO findings (batch review)

## Output Format

```
## SemgrepGuard Findings Report

### Summary
- Total findings: X
- Period: <earliest> to <latest>
- Files affected: X

### By Severity
- ERROR: X findings
- WARNING: X findings
- INFO: X findings

### Top Rules
1. [rule-id] - X occurrences
2. [rule-id] - X occurrences
3. [rule-id] - X occurrences

### Top Files
1. path/to/file - X findings
2. path/to/file - X findings

### Remediation Priorities
1. [Description of highest priority fix]
2. [Description of next priority fix]
```

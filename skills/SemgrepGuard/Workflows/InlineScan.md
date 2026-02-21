# InlineScan Workflow

Scan specific files or directories for security issues using Semgrep.

## Steps

1. **Identify target path** - Determine the file or directory to scan from the user request. Default to current working directory if none specified.

2. **Run scan** - Execute the SemgrepScan tool:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts scan <path>
   ```
   Optional flags:
   - `--severity high` - Filter to only HIGH/ERROR findings
   - `--severity medium` - Filter to MEDIUM/WARNING and above
   - `--rules <path>` - Use custom rules file (default: Config/rules.yaml)

3. **Review findings** - Present findings grouped by severity:
   - ERROR (HIGH) - Must fix before deployment
   - WARNING (MEDIUM) - Should fix, potential security risk
   - INFO (LOW) - Informational, review recommended

4. **Apply fixes** (if `--fix` requested) - Run with auto-fix:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts scan <path> --fix
   ```
   Review each fix before accepting.

5. **Re-scan** - After fixes, re-scan to verify all issues resolved:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts scan <path>
   ```

## Output Format

Present results as:
```
## Semgrep Scan Results: <path>

### HIGH (X findings)
- [rule-id] file:line - message

### MEDIUM (X findings)
- [rule-id] file:line - message

### LOW (X findings)
- [rule-id] file:line - message

### Summary
Total: X findings (X high, X medium, X low)
```

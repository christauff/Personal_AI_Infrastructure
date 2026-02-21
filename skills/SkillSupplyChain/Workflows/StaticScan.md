# StaticScan Workflow

Analyze a skill package for security issues using the full scan pipeline.

## Steps

1. Identify the skill package path (ask the user if not provided)
2. Run the scanner:
   ```bash
   bun run ~/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts scan <path>
   ```
3. Review findings by severity:
   - **Critical:** Command execution, code injection, subprocess spawning
   - **High:** Environment access, credential references, network requests, filesystem writes
   - **Medium:** File deletion, global scope access
4. If **WARN**: Present findings to the user, explain each finding, and ask for their decision on whether to proceed
5. If **FAIL**: Explain the critical findings in detail. Recommend NOT using the skill. Suggest specific remediation steps for each finding
6. If **PASS**: Confirm the skill is safe for use. Note any informational findings

## Notes
- The `--strict` flag treats any WARN as FAIL
- Use `--report` for detailed output with file-level breakdown
- Use `--json` for machine-readable output
- Results are automatically logged to Data/audit-log.jsonl

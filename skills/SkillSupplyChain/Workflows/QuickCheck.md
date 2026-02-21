# QuickCheck Workflow

Fast pre-installation safety check for a skill package.

## Steps

1. Run a quick scan with report output:
   ```bash
   bun run ~/.claude/skills/SkillSupplyChain/Tools/SkillScanner.ts scan <path> --report
   ```
2. Present one-line summary: verdict + score (e.g., "PASS 95/100" or "WARN 55/100")
3. Decision routing:
   - If **PASS** (score >= 80): Proceed with confidence. Skill is safe to use.
   - If **WARN** (score 40-79): Escalate to the full StaticScan workflow for detailed review.
   - If **FAIL** (score < 40): Block installation. Escalate to StaticScan workflow for remediation guidance.

## Notes
- This workflow is optimized for speed over detail
- Use the full StaticScan workflow when detailed findings are needed
- The hook (SupplyChainGate) will suggest running QuickCheck after any skill install

# Trigger Tests: PAIUpgrade

## Should Trigger
1. "check for any new Claude features or Anthropic updates" - "check Anthropic" + "new Claude features" are direct triggers; runs the Upgrade workflow's Anthropic source agent
2. "are there any system upgrades I should apply to PAI?" - "system upgrade" + "PAI" directly triggers the Upgrade workflow with full two-thread analysis
3. "check YouTube for new videos about Claude Code or AI agents" - "check YouTube" + "new videos" are direct triggers; runs YouTube channel monitoring
4. "what improvements can we make based on the latest releases?" - "improvements" + "latest releases" triggers upgrade analysis with source collection
5. "pai upgrade" - Direct command trigger for the default Upgrade workflow

## Should NOT Trigger
1. "what are the latest security breaches this week?" - Correct skill: SECUpdates (security news, not PAI system improvements or Anthropic ecosystem updates)
2. "research how AI agent frameworks have evolved" - Correct skill: Research (general research topic, not checking for specific PAI-applicable upgrades)
3. "create a new skill for managing recipes" - Correct skill: CreateSkill (skill creation, not system upgrade monitoring)
4. "analyze the CrowdStrike annual threat report for trends" - Correct skill: AnnualReports (report analysis, not PAI system improvement extraction)
5. "red team this architecture proposal" - Correct skill: RedTeam (adversarial analysis of ideas, not system upgrade checking)

# Trigger Tests: AnnualReports

## Should Trigger
1. "what annual threat reports are available from major security vendors?" - "annual reports" + "threat reports" + "security vendors" directly triggers listing available reports
2. "analyze the ransomware reports and synthesize the trends" - "analyze reports" + specific category (ransomware) triggers the Analyze workflow
3. "update the annual report sources from the GitHub repository" - "update reports" triggers the Update workflow to fetch latest sources
4. "download the CrowdStrike Global Threat Report" - Specific vendor report fetch triggers the Fetch workflow
5. "what does the threat landscape look like based on this year's industry reports?" - "threat landscape" + "industry reports" are direct trigger phrases for AnnualReports

## Should NOT Trigger
1. "what security breaches happened this week?" - Correct skill: SECUpdates (daily/weekly security news, not annual report analysis)
2. "check for system upgrades and new Anthropic features" - Correct skill: PAIUpgrade (system improvement monitoring, not security report analysis)
3. "research the evolution of cloud security over the past decade" - Correct skill: Research (general historical research, not structured annual report analysis)
4. "check the Feedly feed for CVE enrichment data" - Correct skill: FeedlyClient (real-time threat intel feeds, not annual report aggregation)
5. "create a threat model for our API endpoints" - Correct skill: PromptInjection or Fabric (threat modeling is active security work, not report analysis)

# Trigger Tests: SECUpdates

## Should Trigger
1. "what's new in security this week?" - "what's new in security" is a direct trigger for the Update workflow
2. "give me the latest security news and breaches" - "security news" + "breaches" are direct trigger phrases for SECUpdates
3. "run sec updates" - "sec updates" is a direct trigger; runs the Update workflow against all configured sources
4. "any new CVEs or vulnerability disclosures I should know about?" - Security research/vulnerability news falls within SECUpdates' Security Research category
5. "check tldrsec and Krebs for recent security stories" - Explicitly requesting SECUpdates sources (tldrsec, Krebs) routes here

## Should NOT Trigger
1. "test this AI chatbot for security vulnerabilities" - Correct skill: PromptInjection (active security testing of AI systems, not news aggregation)
2. "analyze the Verizon DBIR annual report" - Correct skill: AnnualReports (annual report analysis, not daily/weekly security news)
3. "check the Feedly threat intel feed for trending CVEs" - Correct skill: FeedlyClient (Feedly-specific threat intel feeds, not general security news aggregation)
4. "research the history of state-sponsored cyber attacks" - Correct skill: Research (historical research topic, not current security news)
5. "check for new Claude features and Anthropic updates" - Correct skill: PAIUpgrade (Anthropic ecosystem updates, not security news)

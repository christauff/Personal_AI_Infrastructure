# Trigger Tests: Fabric

## Should Trigger
1. "use fabric to extract wisdom from this podcast transcript" - "use fabric" + "extract wisdom" are both direct trigger phrases for Fabric's ExecutePattern workflow
2. "run the create_threat_model fabric pattern on our API design doc" - "fabric pattern" + specific pattern name is a direct trigger for ExecutePattern
3. "summarize this article with fabric" - "summarize with fabric" is a direct trigger; routes to ExecutePattern with summarize pattern
4. "update fabric patterns to get the latest ones" - "update fabric" / "update patterns" triggers the pattern sync workflow
5. "analyze this code with fabric's review_code pattern" - "analyze with fabric" plus a specific pattern name is a clear Fabric trigger

## Should NOT Trigger
1. "research the latest AI agent frameworks" - Correct skill: Research (general web research without mentioning fabric goes to Research, not Fabric)
2. "create a threat model for this application's attack surface" - Correct skill: PromptInjection (security assessment context without saying "fabric" routes to PromptInjection)
3. "summarize the key points from today's security news" - Correct skill: SECUpdates (security news summarization is SECUpdates, not Fabric pattern execution)
4. "extract the main insights from these annual reports" - Correct skill: AnnualReports (report analysis with domain-specific skill takes priority over generic Fabric extraction)
5. "do a deep analysis pipeline combining research and extraction" - Correct skill: WisdomSynthesis (multi-skill orchestration pipelines go to WisdomSynthesis, not standalone Fabric)

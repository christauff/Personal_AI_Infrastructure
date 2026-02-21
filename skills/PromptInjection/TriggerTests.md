# Trigger Tests: PromptInjection

## Should Trigger
1. "test my chatbot for prompt injection vulnerabilities - I own the application" - Direct "prompt injection" trigger with authorization context; routes to CompleteAssessment or DirectInjectionTesting
2. "can you do a jailbreak test on our customer support AI?" - "jailbreak test" is a direct trigger phrase for DirectInjectionTesting workflow
3. "I need an LLM security assessment for a client engagement" - "LLM security assessment" + "client engagement" directly triggers the CompleteAssessment workflow
4. "test this RAG system for indirect injection through document uploads" - "indirect injection" + RAG context routes to IndirectInjectionTesting workflow
5. "what are the latest prompt injection attack techniques?" - Research into prompt injection methods triggers the skill's research/analysis capability

## Should NOT Trigger
1. "what are the latest security breaches this week?" - Correct skill: SECUpdates (general security news, not AI/LLM security testing)
2. "pentest this web application for SQL injection and XSS" - Correct skill: WebAssessment (traditional web app pentesting, not LLM/AI prompt injection)
3. "do a network reconnaissance scan on this target" - Correct skill: Recon (network/infrastructure recon, not AI application security)
4. "red team this business proposal and find weaknesses" - Correct skill: RedTeam (adversarial analysis of ideas/arguments, not technical AI security testing)
5. "analyze the CrowdStrike annual threat report" - Correct skill: AnnualReports (report analysis, not active security testing)

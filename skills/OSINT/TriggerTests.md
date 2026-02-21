# Trigger Tests: OSINT

## Should Trigger
1. "do OSINT on Palantir Technologies" - Direct "do OSINT" trigger; company intelligence gathering is a core OSINT workflow
2. "run a background check on this candidate before we hire them" - "background check" on a person triggers OSINT's PeopleLookup workflow
3. "due diligence on this startup before we invest" - "due diligence" is a direct trigger for CompanyDueDiligence workflow
4. "investigate this domain - is it associated with a threat actor?" - "investigate [domain]" with threat context triggers EntityLookup workflow
5. "what can you find about this company's leadership and funding?" - Company intelligence request combining people and company research routes to OSINT

## Should NOT Trigger
1. "find my lost friend Sarah from college, I want to reconnect" - Correct skill: PrivateInvestigator (people-finding/reconnection is PI, not OSINT)
2. "research the history of ransomware attacks on hospitals" - Correct skill: Research (general topic research without a specific target entity is Research, not OSINT)
3. "what security breaches happened this week?" - Correct skill: SECUpdates (security news aggregation, not intelligence gathering on a specific entity)
4. "analyze this annual threat report from CrowdStrike" - Correct skill: AnnualReports (report analysis, not open source intelligence on a target)
5. "pentest this chatbot for prompt injection vulnerabilities" - Correct skill: PromptInjection (AI security testing, not OSINT reconnaissance)

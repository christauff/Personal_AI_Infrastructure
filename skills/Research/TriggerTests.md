# Trigger Tests: Research

## Should Trigger
1. "research the latest trends in quantum computing" - Contains the word "research" which is the mandatory trigger for this skill in any form
2. "do some quick research on Rust vs Go for backend services" - "quick research" maps to Quick mode (1 agent); explicit research request
3. "I need extensive research on the history of zero-trust architecture" - "extensive research" maps to Extensive mode (12 agents); explicit research request
4. "can you find information about how MCP protocol works?" - "find information" is a direct trigger phrase for the Research skill
5. "extract wisdom from this conference talk transcript" - "extract wisdom" is a direct trigger for Research's deep content analysis workflow

## Should NOT Trigger
1. "do OSINT on Acme Corp and check if they're legitimate" - Correct skill: OSINT (company due diligence is explicitly routed to OSINT, not Research)
2. "find my old college roommate John Smith from Austin" - Correct skill: PrivateInvestigator (people-finding/locate requests go to PI, not Research)
3. "what are the latest security breaches this week?" - Correct skill: SECUpdates (daily security news aggregation, not general research)
4. "use fabric to summarize this article" - Correct skill: Fabric (explicit "use fabric" trigger overrides the generic content analysis path in Research)
5. "take a screenshot of example.com and check for console errors" - Correct skill: Browser (web debugging and verification, not web research)

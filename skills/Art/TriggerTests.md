# Trigger Tests: Art

## Should Trigger
1. "create a header image for my blog post about AI agents" - Blog header/editorial illustration is a direct Art trigger; routes to Essay workflow
2. "make a technical architecture diagram showing the microservices layout" - "technical diagram" is a direct trigger; routes to TechnicalDiagrams workflow
3. "generate a mermaid flowchart of the authentication flow" - "mermaid" + "flowchart" are direct triggers; routes to Mermaid workflow
4. "create an icon for the new PAI skill pack" - "PAI pack icon" is a direct trigger; routes to CreatePAIPackIcon workflow
5. "visualize the comparison between monolith vs microservices architecture" - "visualize" + "comparison" triggers the Comparisons workflow via visual content routing

## Should NOT Trigger
1. "be creative and brainstorm names for my new product" - Correct skill: BeCreative (creative ideation and brainstorming, not visual content generation)
2. "research the history of data visualization techniques" - Correct skill: Research (researching the topic of visualization, not creating visual content)
3. "create a D3 dashboard with interactive charts in my web app" - Correct skill: Art has D3Dashboards but if context is building a web application feature, Development may be more appropriate
4. "design the UX flow for the onboarding screen" - Correct skill: This is UX design work, not illustration/visual content generation from Art
5. "take a screenshot of my web app to see how it looks" - Correct skill: Browser (screenshot for debugging/verification, not creating visual content)

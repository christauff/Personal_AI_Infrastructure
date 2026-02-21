# Trigger Tests: PrivateInvestigator

## Should Trigger
1. "help me find my old college roommate, we lost touch 10 years ago" - People-finding with reconnection intent is the core PI use case; routes to FindPerson workflow
2. "who called me from 512-555-1234?" - Reverse phone lookup is a direct PI trigger; routes to ReverseLookup workflow
3. "can you locate Jane Doe? She's a marketing professional in Denver" - "locate" + person name is a direct trigger; combines FindPerson with SocialMediaSearch
4. "do a skip trace on this former business partner" - "skip trace" is a direct trigger phrase for the PrivateInvestigator skill
5. "find all social media accounts for this username: @techguru42" - Username-based social media search routes to PI's SocialMediaSearch and ReverseLookup workflows

## Should NOT Trigger
1. "do due diligence on Acme Corp before we sign the contract" - Correct skill: OSINT (company due diligence is OSINT's CompanyDueDiligence workflow, not PI)
2. "investigate this domain for threat intelligence" - Correct skill: OSINT (entity/threat intel is OSINT's EntityLookup workflow, not PI)
3. "research the career of Elon Musk for a blog post" - Correct skill: Research (public figure research for content creation is Research, not PI investigation)
4. "background check on this company's financials and funding" - Correct skill: OSINT (company financial background is OSINT's CompanyLookup, not PI)
5. "find information about how people search engines work" - Correct skill: Research (researching the topic of people search is Research, not actually performing a people search)

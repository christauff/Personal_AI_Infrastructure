# Trigger Tests: TwitterBot

## Should Trigger
1. "post a tweet about the latest CMMC Phase 2 deadline update" - "post" + "tweet" + compliance content triggers the Post workflow for X/Twitter publishing
2. "check the engagement metrics for our recent tweets" - "engagement metrics" is a direct trigger; routes to the Report workflow
3. "scan regulatory sources for new content to post on X" - "regulatory" + "post on X" triggers the Monitor workflow to check compliance sources
4. "draft a newsletter issue from this week's best posts" - "newsletter" is a direct trigger; routes to the Newsletter workflow for beehiiv integration
5. "schedule a thread about the new NIST framework changes" - "schedule" + "thread" implies X/Twitter content scheduling; triggers Post workflow

## Should NOT Trigger
1. "research CMMC Phase 2 requirements in depth" - Correct skill: Research (deep topic research, not content creation for X/Twitter posting)
2. "what are the latest security breaches this week?" - Correct skill: SECUpdates (security news aggregation, not X/Twitter account management)
3. "scrape this Twitter profile to see their recent posts" - Correct skill: Apify (social media scraping uses Apify actors, not TwitterBot which is for posting/managing our own account)
4. "write a blog post about federal compliance trends" - Correct skill: Blogging (blog content creation, not X/Twitter post management)
5. "check the Feedly threat intel feed for trending CVEs" - Correct skill: FeedlyClient (threat intel feeds, not X/Twitter content pipeline)

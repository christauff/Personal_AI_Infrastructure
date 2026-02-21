# Trigger Tests: Browser

## Should Trigger
1. "take a screenshot of localhost:3000 and check for errors" - "screenshot" + URL is a direct Browser trigger; runs Browse.ts with full diagnostics
2. "debug why the user list page isn't loading in my web app" - "debug web" is a direct trigger; Browser provides console errors and failed network requests
3. "verify the UI changes I just deployed to staging" - "verify UI" is a direct trigger; Browser navigates and captures visual + diagnostic state
4. "check the browser console for JavaScript errors on this page" - Browser console inspection is a core capability; routes to console/errors query commands
5. "click the login button and fill in the credentials on this form" - Browser interaction commands (click, fill) are core Browser capabilities

## Should NOT Trigger
1. "research what the best browser automation frameworks are" - Correct skill: Research (researching the topic of browser automation, not actually automating a browser)
2. "scrape all the product listings from this e-commerce site" - Correct skill: BrightData or Apify (web scraping at scale, not debug-first browser automation)
3. "find information about this company from their website" - Correct skill: Research or OSINT (content extraction for intelligence, not browser debugging)
4. "test this web app for XSS and SQL injection vulnerabilities" - Correct skill: WebAssessment (security testing, not UI verification and debugging)
5. "open example.com and extract wisdom from the page content" - Correct skill: Research/Fabric (content extraction and analysis, not browser diagnostics)

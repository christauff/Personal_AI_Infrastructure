# Trigger Tests: Evals

## Should Trigger
1. "run the regression eval suite to make sure nothing broke" - "regression" + "eval suite" directly triggers suite execution via AlgorithmBridge
2. "evaluate how well this agent handles authentication edge cases" - "evaluate" + agent behavior context is a direct trigger for creating/running evaluation tasks
3. "benchmark this agent against the coding domain pattern" - "benchmark" is a direct trigger; domain patterns (coding, conversational, research) are core Evals concepts
4. "log this failure so we can turn it into a test case later" - Failure logging via FailureToTask is a core Evals workflow; "log failure" is a direct trigger
5. "check if the research skill has saturated its capability eval" - "check saturation" + eval context routes to SuiteManager's saturation check

## Should NOT Trigger
1. "test this web application for security vulnerabilities" - Correct skill: WebAssessment (web security testing, not AI agent evaluation)
2. "red team this architecture proposal" - Correct skill: RedTeam (adversarial analysis of ideas, not structured agent evaluation with graders)
3. "run the unit tests for the browser automation code" - Correct skill: Development (code testing, not agent behavioral evaluation)
4. "check if the chatbot is vulnerable to prompt injection" - Correct skill: PromptInjection (AI security testing, not behavioral evaluation with pass@k metrics)
5. "research best practices for AI agent testing" - Correct skill: Research (general research topic, not running the Evals framework itself)

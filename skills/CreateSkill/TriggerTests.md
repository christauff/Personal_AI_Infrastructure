# Trigger Tests: CreateSkill

## Should Trigger
1. "create a new skill for managing customer feedback" - "create a new skill" is the primary trigger; routes to CreateSkill workflow
2. "validate the OSINT skill structure and check for compliance issues" - "validate skill" is a direct trigger; routes to ValidateSkill workflow
3. "canonicalize the daemon skill to follow the latest naming conventions" - "canonicalize" is a direct trigger; routes to CanonicalizeSkill workflow for TitleCase enforcement
4. "add a new workflow to the existing Research skill" - "add workflow" to an existing skill routes to UpdateSkill workflow
5. "the TwitterBot skill isn't routing properly - fix the skill structure" - "fix skill structure" implies structural validation and repair; routes to ValidateSkill or CanonicalizeSkill

## Should NOT Trigger
1. "research how to build AI agent skills" - Correct skill: Research (researching the topic of skill building, not actually creating a PAI skill)
2. "upgrade the PAI system with the latest features" - Correct skill: PAIUpgrade (system-wide upgrades, not individual skill creation/validation)
3. "evaluate how well the Research skill performs" - Correct skill: Evals (agent evaluation/benchmarking, not skill structure creation or validation)
4. "write a CLI tool in TypeScript for data processing" - Correct skill: CreateCLI or Development (general CLI/code creation, not PAI skill structure creation)
5. "be creative and brainstorm what skills we should build next" - Correct skill: BeCreative (creative ideation about what to build, not the act of creating a skill)

# CustomRules Workflow

Create and manage PAI-specific Semgrep rules.

## Steps

1. **Read current rules** - Load the existing rules file:
   ```bash
   cat ~/.claude/skills/SemgrepGuard/Config/rules.yaml
   ```

2. **Identify pattern** - Determine what code pattern to detect based on user request. Consider:
   - What language(s) does this apply to?
   - Is this an ERROR (security issue), WARNING (potential issue), or INFO (style/best practice)?
   - Can Semgrep express this pattern? (single-line patterns work best)

3. **Write new rule** - Add rule to Config/rules.yaml following Semgrep YAML spec:
   ```yaml
   - id: pai-<descriptive-name>
     pattern: |
       <semgrep pattern>
     message: "<clear description of the issue>"
     severity: ERROR|WARNING|INFO
     languages: [typescript, javascript]
   ```

   For complex patterns, use `patterns` with `pattern-inside`, `pattern-not`, etc:
   ```yaml
   - id: pai-<descriptive-name>
     patterns:
       - pattern: <what to match>
       - pattern-not: <what to exclude>
       - pattern-inside: <containing context>
     message: "<description>"
     severity: WARNING
     languages: [typescript, javascript]
   ```

4. **Test rule** - Create a small test file with the target pattern and scan it:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts scan <test-file> --rules ~/.claude/skills/SemgrepGuard/Config/rules.yaml
   ```

5. **Verify no false positives** - Scan a larger codebase section to check for false positives:
   ```bash
   bun run ~/.claude/skills/SemgrepGuard/Tools/SemgrepScan.ts scan ~/.claude/skills/ --rules ~/.claude/skills/SemgrepGuard/Config/rules.yaml
   ```

## Available Rule Operators

- `pattern` - Match exact code pattern
- `patterns` - Combine multiple conditions (AND)
- `pattern-either` - Match any of several patterns (OR)
- `pattern-not` - Exclude matches
- `pattern-inside` - Must be within this context
- `pattern-not-inside` - Must NOT be within this context
- `metavariable-regex` - Regex constraint on captured metavariables

## Severity Levels

| Level | When to Use |
|-------|------------|
| ERROR | Security vulnerabilities, credential exposure |
| WARNING | Potential security issues, risky patterns |
| INFO | Best practices, style recommendations |

# RegisterAgent

Configure and publish PAI's Agent Card for A2A protocol discovery.

## Steps

1. **Read Current Config**
   ```bash
   cat ~/.claude/skills/A2ABridge/Config/agent-card.yaml
   ```
   Review agent name, description, capabilities, and auth settings.

2. **Review/Update Agent Capabilities**
   - Check if capabilities list matches current PAI skill set
   - Update Config/agent-card.yaml if needed
   - Ensure auth settings are correct for environment

3. **Generate and Validate Agent Card**
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts card --validate
   ```
   Verify the generated JSON meets A2A spec requirements:
   - Has required `name` and `description` fields
   - Has valid `url` field
   - Has at least one capability
   - Auth configuration is present

4. **Start A2A Server**
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts serve &
   ```
   Server starts on configured port (default 8889).

5. **Verify Card is Accessible**
   ```bash
   curl -s http://localhost:8889/.well-known/agent.json | jq .
   ```
   Confirm the Agent Card is served correctly at the well-known endpoint.

6. **Verify Health Endpoint**
   ```bash
   curl -s http://localhost:8889/health
   ```
   Confirm server health check responds.

## Notes
- Agent Card is regenerated from YAML config each time the server starts
- Changes to agent-card.yaml require server restart to take effect
- The server binds to 0.0.0.0 by default -- restrict to 127.0.0.1 for local-only operation

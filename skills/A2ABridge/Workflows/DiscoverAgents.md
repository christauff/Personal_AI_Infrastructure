# DiscoverAgents

Find A2A agents on the local network.

## Steps

1. **Run Discovery**
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts discover
   ```
   This scans known localhost ports (8889, 8890, 8891) for A2A agent cards.

2. **Review Discovered Agents**
   For each discovered agent, the tool displays:
   - Agent name and description
   - URL endpoint
   - Supported capabilities
   - Protocol version

3. **Check Specific Agent**
   If looking for an agent at a known URL:
   ```bash
   curl -s <agent-url>/.well-known/agent.json | jq .
   ```

4. **Save Interesting Agents**
   Note discovered agents and their capabilities for future task delegation.
   All discoveries are logged to Data/a2a-events.jsonl.

## Notes
- Discovery is currently limited to localhost ports for security
- External agent discovery would require network scanning or a registry service
- Future versions may integrate with a central A2A agent registry
- Discovered agents should be verified before sending sensitive tasks

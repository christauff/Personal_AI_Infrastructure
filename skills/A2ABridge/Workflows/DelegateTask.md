# DelegateTask

Send tasks to external A2A agents.

## Steps

1. **Identify Target Agent**
   Either provide a known agent URL or discover agents first:
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts discover
   ```

2. **Verify Agent is Reachable**
   Fetch the target agent's card to confirm it's online and check capabilities:
   ```bash
   curl -s <agent-url>/.well-known/agent.json | jq .
   ```

3. **Send Task**
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts send <agent-url> "<task description>"
   ```
   Optional: Add authentication if required by the target agent:
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts send <agent-url> "<task>" --api-key <key>
   ```

4. **Monitor Response**
   - Check the JSON-RPC response for task ID and status
   - For long-running tasks, poll using `tasks/get` method
   - Review Data/a2a-events.jsonl for outbound event logging

5. **Log Outcome**
   All outbound tasks are automatically logged to Data/a2a-events.jsonl.
   Review the event log for confirmation:
   ```bash
   tail -5 ~/.claude/skills/A2ABridge/Data/a2a-events.jsonl | grep '"type":"outbound"'
   ```

## Notes
- The send command constructs a proper JSON-RPC 2.0 request
- Task messages use the A2A message format with role and parts
- API key is sent as Bearer token in Authorization header when provided

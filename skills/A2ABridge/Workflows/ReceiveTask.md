# ReceiveTask

Handle inbound A2A tasks from external agents.

## Steps

1. **Ensure A2A Server is Running**
   ```bash
   curl -s http://localhost:8889/health
   ```
   If not running, start it:
   ```bash
   bun run ~/.claude/skills/A2ABridge/Tools/A2AServer.ts serve &
   ```

2. **Check Recent Inbound Events**
   ```bash
   tail -20 ~/.claude/skills/A2ABridge/Data/a2a-events.jsonl | grep '"type":"inbound"'
   ```
   Review recent inbound task events for new tasks.

3. **Review Task Details**
   - Parse the task message content from the event log
   - Identify the requesting agent
   - Determine which PAI skill should handle the task

4. **Route Task to Appropriate PAI Skill**
   Based on the task content, delegate to the relevant skill:
   - Code analysis tasks -> SemgrepGuard, SkillSupplyChain
   - Research tasks -> Research skill
   - Security tasks -> Recon, RedTeam skills
   - Content tasks -> Art, Documents skills

5. **Send Response Back via A2A Protocol**
   The server automatically returns a task ID with "submitted" status.
   For completed tasks, update the task status in the event log.

## Security Notes
- All inbound tasks are validated by the A2AValidator hook
- Tasks containing prompt injection patterns are automatically blocked
- Blocked tasks are logged to both A2ABridge and AgentWatch event logs
- Maximum payload size is enforced (default 1MB)

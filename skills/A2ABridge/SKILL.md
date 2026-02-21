---
name: A2ABridge
compatibility:
  claude_code: ">=2.1.38"
---

# A2ABridge

Google A2A protocol support for cross-platform agent communication.

**Domain:** Inter-agent communication, A2A protocol, task delegation, agent discovery

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `a2a register`, `register agent`, `agent card` | `RegisterAgent.md` | Configure and publish PAI's Agent Card |
| `a2a receive`, `inbound task` | `ReceiveTask.md` | Handle inbound A2A tasks |
| `a2a send`, `delegate task`, `a2a delegate` | `DelegateTask.md` | Send tasks to external A2A agents |
| `a2a discover`, `find agents` | `DiscoverAgents.md` | Find A2A agents on network |

---

## Architecture

- **Protocol:** Google A2A v0.3 -- JSON-RPC 2.0 over HTTP with SSE streaming
- **Server:** HTTP server at configurable port (default 8889)
- **Agent Card:** Served at `/.well-known/agent.json` per A2A spec
- **Security:** Inbound task validation via A2AValidator hook
- **Events:** All A2A activity logged to Data/a2a-events.jsonl
- **Integration:** Uses SkillSupplyChain for validating skill packages in A2A tasks

---

## A2A Protocol Overview

The A2A (Agent-to-Agent) protocol enables standardized communication between AI agents:
- **Agent Card:** JSON document describing agent capabilities, published at `/.well-known/agent.json`
- **Tasks:** JSON-RPC 2.0 messages for creating, updating, and completing tasks
- **Streaming:** Server-Sent Events for real-time task progress
- **Auth:** API key in Authorization header

---

## Version
- v1.0.0 (2026-02-12) - Initial implementation

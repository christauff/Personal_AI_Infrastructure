# Gap Skill

Secure credential proxy for AI agents. Write-only credential storage with network-layer injection that defeats prompt injection attacks.

**Domain**: Security, credential management, API authentication

**Algorithm**: `~/.claude/skills/PAI/SYSTEM/THEALGORITHM.md`

---

## Philosophy

Credentials should never exist in agent memory. Gap implements a "write-only vault" architecture:
- Credentials go in, never come out
- No retrieval API exists
- Network-layer injection adds credentials to requests
- Agents request URLs, Gap adds authentication transparently

This defeats prompt injection because even if an attacker controls the agent, they cannot exfiltrate credentials that the agent never possesses.

---

## Installation Status

**Version**: 0.6.1
**Platform**: Linux (x86_64)
**Binaries**:
- `~/.local/bin/gap` - CLI tool (9MB)
- `~/.local/bin/gap-server` - Daemon (30MB)

**First-time Setup Required**:
```bash
# Initialize Gap (requires interactive password)
~/.local/bin/gap init

# This creates:
# - ~/.gap/ca.pem (CA certificate to trust)
# - Server encryption keys
# - Management certificate
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PAI Agent                                │
│                                                                  │
│  ┌──────────────┐                                               │
│  │ API Request  │  GET https://api.perplexity.ai/chat          │
│  │ (no creds)   │  Authorization: Bearer <agent_token>          │
│  └──────┬───────┘                                               │
└─────────┼────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Gap Proxy                                  │
│                                                                  │
│  1. Validate agent token (for audit, not auth)                  │
│  2. Match request to plugin (api.perplexity.ai)                 │
│  3. Load credential from sealed vault                           │
│  4. Inject Authorization header                                 │
│  5. Forward to real API                                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Sealed Credential Vault                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │
│  │  │ Perplexity  │  │   OpenAI    │  │  Anthropic  │      │   │
│  │  │  API Key    │  │  API Key    │  │  API Key    │      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │   │
│  │                    WRITE ONLY                            │   │
│  │                    NO READ API                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External API                                │
│                                                                  │
│  GET https://api.perplexity.ai/chat                             │
│  Authorization: Bearer pplx-xxxxxxxxxxxxx  (injected by Gap)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `gap init` | Initialize server (first-time setup) |
| `gap status` | Show server status and ports |
| `gap plugins` | List installed plugins |
| `gap install <url>` | Install a plugin |
| `gap uninstall <name>` | Remove a plugin |
| `gap set <plugin> <credential>` | Store credential for plugin |
| `gap token create` | Create agent bearer token |
| `gap token list` | List active tokens |
| `gap token revoke <id>` | Revoke a token |
| `gap activity` | View activity logs |

---

## Workflow: Adding a New API

### Step 1: Create Plugin

Plugins are JavaScript files that define request transformation:

```javascript
// ~/.claude/skills/Gap/Plugins/perplexity.js
export default {
  name: "perplexity",
  version: "1.0.0",
  hosts: ["api.perplexity.ai"],

  // Credentials this plugin needs
  credentials: {
    api_key: {
      description: "Perplexity API Key",
      required: true
    }
  },

  // Transform request before sending
  transformRequest(request, credentials) {
    request.headers["Authorization"] = `Bearer ${credentials.api_key}`;
    return request;
  }
};
```

### Step 2: Install Plugin

```bash
gap install ~/.claude/skills/Gap/Plugins/perplexity.js
```

### Step 3: Store Credential

```bash
# Interactive - prompts for the actual key
gap set perplexity api_key
```

### Step 4: Create Agent Token

```bash
# Creates a bearer token for tracking/audit
gap token create --name "aineko-agent"
```

### Step 5: Configure PAI Tool

Update the tool to use Gap proxy instead of direct API:

```typescript
// Before (credentials in memory)
const response = await fetch("https://api.perplexity.ai/chat", {
  headers: { "Authorization": `Bearer ${apiKey}` }
});

// After (credentials never in memory)
const response = await fetch("https://api.perplexity.ai/chat", {
  headers: { "Authorization": `Bearer ${agentToken}` },
  // Request goes through Gap proxy
});
```

---

## PAI Integration Points

### APIs That Should Use Gap

| API | Current File | Credential |
|-----|--------------|------------|
| Perplexity | `skills/Agents/Tools/PerplexityApi.ts` | `PERPLEXITY_API_KEY` |
| OpenAI | Various tools | `OPENAI_API_KEY` |
| Anthropic | Direct API calls | `ANTHROPIC_API_KEY` |
| ElevenLabs | Voice tools | `ELEVENLABS_API_KEY` |
| Bright Data | `skills/BrightData/Tools/` | `BRIGHTDATA_API_TOKEN` |

### APIs That Don't Need Gap

| API | Reason |
|-----|--------|
| Claude CLI | Uses subscription auth, not API key |
| Local services | No external credentials |

---

## Security Model

### What Gap Protects Against

1. **Prompt Injection Exfiltration**: Even if an attacker controls the agent through prompt injection, they cannot extract credentials because the agent never has them.

2. **Memory Dumps**: Credentials never exist in agent process memory.

3. **Log Leakage**: Agent logs contain only bearer tokens, not actual API keys.

4. **Accidental Exposure**: No risk of credentials in error messages, stack traces, or debug output.

### What Gap Does NOT Protect Against

1. **Malicious Requests**: An attacker could make the agent send malicious API calls (Gap adds auth to whatever requests come through).

2. **Rate Limit Abuse**: Attackers could exhaust API quotas.

3. **Data Exfiltration via API Responses**: If the API returns sensitive data, the agent still receives it.

### Mitigations

- Use agent tokens to track which agent made which request
- Monitor `gap activity` logs for anomalies
- Set up alerts for unusual request patterns
- Use API-level rate limiting

---

## File Organization

```
~/.claude/skills/Gap/
├── SKILL.md              # This documentation
├── Tools/
│   └── GapClient.ts      # PAI integration wrapper (TODO)
├── Plugins/
│   ├── perplexity.js     # Perplexity API plugin (TODO)
│   ├── openai.js         # OpenAI API plugin (TODO)
│   └── anthropic.js      # Anthropic API plugin (TODO)
├── Data/
│   └── config.yaml       # Gap configuration (TODO)
└── Workflows/
    └── Setup.md          # Setup workflow (TODO)
```

---

## Troubleshooting

### Gap server not running

```bash
# Check status
gap status

# Start server manually
gap-server

# Check if ports are in use
ss -tlnp | grep -E '9080|9443'
```

### Certificate trust issues

```bash
# Add Gap CA to system trust
sudo cp ~/.gap/ca.pem /usr/local/share/ca-certificates/gap.crt
sudo update-ca-certificates
```

### Plugin not matching requests

```bash
# List plugins and their host patterns
gap plugins

# Check activity log for request routing
gap activity
```

---

## References

- **Repository**: https://github.com/mikekelly/gap
- **License**: MIT
- **Author**: Mike Kelly
- **Security Model**: Write-only credential vault with network-layer injection

---

## Changelog

### 2026-02-04 - v1.0.0
- Initial skill creation
- Installed Gap v0.6.1 binaries
- Created skill directory structure
- Documented architecture and integration points

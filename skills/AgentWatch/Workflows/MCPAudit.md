# MCPAudit Workflow

**Purpose:** Audit PAI's MCP server configurations and versions against known vulnerabilities.

**Trigger:** `/AgentWatch mcp-audit`, "audit mcp servers", "mcp security check"

---

## Process

### Step 1: Discover MCP Servers

Identify all MCP servers configured in PAI:

```bash
# Check Claude Code MCP settings
cat ~/.claude/settings.json | jq '.mcpServers // empty'

# Check project-level MCP configs
find ~/.claude -name ".mcp.json" -o -name "mcp.json" 2>/dev/null

# Check for MCP server processes
ps aux | grep -i "mcp" | grep -v grep
```

For each discovered server, extract:
- Server name and type (stdio, SSE, streamable-http)
- Package name and version (from package.json or npx command)
- Configuration (args, env vars -- REDACT secrets)
- Transport details

### Step 2: Check Versions Against CVEs

For each MCP server package:

1. **Get installed version:**
   ```bash
   # For npx-based servers
   npm view <package> version
   # For locally installed
   cat node_modules/<package>/package.json | jq .version
   ```

2. **Query known CVEs:**
   - Check AgentWatch's `Data/security-events.jsonl` for matching CVEs
   - Search NVD API for package name
   - Check GitHub Security Advisories for the repo

3. **Known critical MCP CVEs to always check:**
   | CVE | Package | Fixed In | CVSS | Description |
   |-----|---------|----------|------|-------------|
   | CVE-2025-6514 | mcp-remote | 0.1.16 | 9.6 | Arbitrary OS command execution |
   | CVE-2025-68143 | mcp-server-git | 2025.12.18 | HIGH | File read/delete, code execution |

### Step 3: Audit Configurations

For each MCP server, check:

1. **Transport security:**
   - SSE/HTTP servers: Is TLS configured?
   - Is the server bound to localhost only?
   - Are there authentication requirements?

2. **Permission scope:**
   - What filesystem paths does it access?
   - What network access does it have?
   - Does it run with minimal privileges?

3. **Isolation:**
   - Are MCP servers running in separate processes?
   - Can one MCP server access another's data? (tool poisoning risk)
   - Is there sandboxing?

4. **Environment variables:**
   - Are API keys passed via env vars? (check for ANTHROPIC_BASE_URL override risk per CVE-2026-21852)
   - Are secrets stored securely?

### Step 4: Generate Report

```markdown
# MCP Security Audit Report
**Date:** [timestamp]
**Servers Audited:** [count]

## Server Inventory
| # | Server | Package | Version | Status |
|---|--------|---------|---------|--------|
| 1 | [name] | [pkg] | [ver] | [PASS/WARN/FAIL] |

## Vulnerability Findings
### CRITICAL
- [CVE] affecting [server] -- [action needed]

### HIGH
- [finding] -- [recommendation]

### MEDIUM
- [finding] -- [recommendation]

## Configuration Issues
- [issue and fix]

## Recommendations
1. [Prioritized action items]
```

---

## Integration

- **Input from:** AgentWatch SecurityPoller (CVE data), ProtocolWatch (spec changes)
- **Output to:** Morning Brief (if critical findings), MEMORY/STATE (audit results)
- **Frequency:** Run on-demand or weekly as part of security hygiene

---

## Key Principles

1. **Never expose secrets** -- redact all API keys, tokens, passwords in reports
2. **Version comparison is authoritative** -- don't guess, check actual installed versions
3. **Configuration > version** -- a patched server with bad config is still vulnerable
4. **Err on the side of caution** -- flag anything uncertain as WARN, not PASS

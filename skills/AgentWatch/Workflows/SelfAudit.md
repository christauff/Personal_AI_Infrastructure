# SelfAudit Workflow

**Purpose:** Check PAI's installed tool versions against known CVEs. Answer: "Are we patched?"

**Trigger:** `/AgentWatch self-audit`, "are we patched", "version check", "dependency audit"

---

## Process

### Step 1: Inventory PAI's Toolchain

Collect actual installed versions for all PAI dependencies:

```bash
# Claude Code version
claude --version 2>/dev/null || echo "claude-code: unknown"

# Bun runtime
bun --version

# Node.js (if present)
node --version 2>/dev/null

# npm packages in PAI directory
cat ~/.claude/package.json 2>/dev/null | jq '.dependencies // empty'

# Ollama (if installed)
ollama --version 2>/dev/null || echo "ollama: not installed"

# Git
git --version

# OS info
uname -r
```

### Step 2: Build Version Matrix

Create a matrix of all components and their versions:

| Component | Category | Installed Version | Source |
|-----------|----------|-------------------|--------|
| claude-code | Runtime | [version] | `claude --version` |
| bun | Runtime | [version] | `bun --version` |
| node | Runtime | [version] | `node --version` |
| ollama | AI Infra | [version] | `ollama --version` |
| MCP servers | Protocol | [per-server] | MCPAudit inventory |
| npm packages | Dependencies | [per-package] | package.json |

### Step 3: Cross-Reference Against CVE Database

For each component in the version matrix:

1. **Check AgentWatch's security-events.jsonl** for cached CVEs
2. **Query NVD API** (via SecurityPoller.ts) for the package name
3. **Check GitHub Security Advisories** for the repo (from tracked-repos.yaml)
4. **Compare version ranges** -- is our version in the affected range?

**Known critical CVEs to always check (update this list from LandscapeMonitor scans):**

| CVE | Component | Affected | Fixed | CVSS |
|-----|-----------|----------|-------|------|
| CVE-2026-21852 | claude-code | < 2.0.65 | 2.0.65 | 5.3 |
| CVE-2025-6514 | mcp-remote | 0.0.5-0.1.15 | 0.1.16 | 9.6 |
| CVE-2025-68143 | mcp-server-git | < 2025.12.18 | 2025.12.18 | HIGH |
| CVE-2025-68664 | langchain-core | < 1.2.5 | 1.2.5 | 9.3 |
| CVE-2025-68665 | langchainjs | affected | patched | 8.6 |
| CVE-2025-1793 | llamaindex | < 0.12.28 | 0.12.28 | 9.8 |
| CVE-2024-12886 | ollama | < 0.7.0 | 0.7.0 | HIGH |
| CVE-2025-51471 | ollama | < 0.7.0 | 0.7.0 | HIGH |
| CVE-2025-48889 | ollama | < 0.7.0 | 0.7.0 | HIGH |
| CVE-2026-25536 | @modelcontextprotocol/sdk | 1.10.0-1.25.3 | 1.26.0 | 7.1 |
| CVE-2025-53110 | mcp-filesystem-server | < 0.6.4 | 0.6.4 | HIGH |

### Step 4: Generate Self-Audit Report

```markdown
# PAI Self-Audit Report
**Date:** [timestamp]
**Components Checked:** [count]

## Status Overview
| Status | Count |
|--------|-------|
| PASS (patched, no known CVEs) | [n] |
| WARN (outdated, no critical CVEs) | [n] |
| FAIL (known CVE affects installed version) | [n] |
| UNKNOWN (could not determine version) | [n] |

## Component Status
| Component | Version | Latest | Status | CVEs |
|-----------|---------|--------|--------|------|
| claude-code | 2.1.12 | 2.1.12 | PASS | CVE-2026-21852 (fixed) |
| bun | 1.x.x | 1.x.x | PASS | None known |
| ollama | [ver] | 0.7.0+ | [status] | [list] |

## Action Required
### CRITICAL (patch immediately)
- [component]: update from [current] to [fixed] (CVE-XXXX, CVSS X.X)

### HIGH (patch this week)
- [component]: update from [current] to [recommended]

### LOW (update when convenient)
- [component]: newer version available, no security impact

## Update Commands
```bash
# [component]: [current] -> [target]
[exact command to update]
```
```

---

## Maintenance

### Adding New CVEs

When LandscapeMonitor or SecurityPoller discovers new CVEs affecting PAI's stack:

1. Add to the "Known critical CVEs" table in this workflow
2. Update `Config/cve-keywords.yaml` with new package names
3. Add repos to `Config/tracked-repos.yaml` if not already tracked

### Frequency

- **On-demand:** Run after any LandscapeMonitor scan with security findings
- **Weekly:** As part of overnight processing security phase
- **After incidents:** Run immediately when a new critical CVE is announced

---

## Integration

- **Input from:** AgentWatch SecurityPoller (CVE data), LandscapeMonitor (scan findings)
- **Output to:** Morning Brief (if FAIL status), MEMORY/STATE (audit results)
- **Triggers next:** MCPAudit workflow (for MCP-specific deep dive)

---

## Key Principles

1. **Check actual versions, not assumptions** -- always run the version command
2. **Version comparison must be precise** -- semver ranges, not guesses
3. **Provide exact update commands** -- user should be able to copy-paste
4. **Track what we can't check** -- UNKNOWN is better than false PASS
5. **Cross-reference multiple sources** -- NVD + GitHub Advisories + our own cache

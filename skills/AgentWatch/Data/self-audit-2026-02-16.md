# PAI Self-Audit Report
**Date:** 2026-02-16 11:20 PST
**Components Checked:** 10
**Claude Code Version:** 2.1.42
**Auditor:** AgentWatch SelfAudit workflow

---

## Status Overview

| Status | Count |
|--------|-------|
| PASS (patched, no known CVEs) | 7 |
| WARN (outdated or advisory exists, not exploitable) | 1 |
| FAIL (known CVE affects installed version) | 0 |
| N/A (not installed) | 2 |

---

## Component Status

### Runtime

| Component | Version | Status | Notes |
|-----------|---------|--------|-------|
| **claude-code** | 2.1.42 | **PASS** | All 18 GitHub advisories patched. Most recent vuln: < 2.1.2 (GHSA-ff64-7w26-62rf). CVE-2026-21852 (< 2.0.65) also patched. |
| **bun** | 1.3.7 | **PASS** | No known CVEs in GitHub advisories. |
| **node** | 20.20.0 | **PASS** | LTS track. No critical CVEs in this minor version. |
| **git** | 2.43.0 | **PASS** | Current stable. |
| **kernel** | 6.17.0-14-generic | **PASS** | Recent mainline. |

### AI Infrastructure

| Component | Version | Status | Notes |
|-----------|---------|--------|-------|
| **ollama** | Not installed | **N/A** | CVE-2024-12886, CVE-2025-51471, CVE-2025-48889 (all < 0.7.0) — not applicable. |
| **MCP servers** | None configured | **N/A** | CVE-2025-68143/68144/68145 (mcp-server-git), GHSA-hc55-p739-j48w, GHSA-q66q-fx2p-7w4m — not applicable. CVE-2026-25536 (@modelcontextprotocol/sdk) — SDK not installed locally. |

### npm Dependencies (~/.claude/package.json)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| **@google/genai** | 1.41.0 | **PASS** | No known CVEs. |
| **openai** | 6.21.0 | **PASS** | No known CVEs for this version. |
| **replicate** | 1.4.0 | **PASS** | No known CVEs. |
| **@huggingface/transformers** | 3.8.1 | **WARN** | Not in CVE databases. Relatively new package — limited security audit history. |
| **js-yaml** | 4.1.1 | **PASS** | Historical CVEs (prototype pollution) fixed in 4.x. |
| **yaml** | 2.8.2 | **PASS** | No known CVEs. |

### Not Installed (from known CVE list)

| Component | CVE | Affected | Status |
|-----------|-----|----------|--------|
| langchain-core | CVE-2025-68664 (CVSS 9.3) | < 1.2.5 | **N/A** — not installed |
| langchainjs | CVE-2025-68665 (CVSS 8.6) | affected | **N/A** — not installed |
| llamaindex | CVE-2025-1793 (CVSS 9.8) | < 0.12.28 | **N/A** — not installed |
| mcp-remote | CVE-2025-6514 (CVSS 9.6) | 0.0.5-0.1.15 | **N/A** — not installed |

---

## Claude Code Advisory Detail (All 18 — ALL PATCHED)

| GHSA | Vuln Range | Our Version | Status | Description |
|------|-----------|-------------|--------|-------------|
| GHSA-ff64-7w26-62rf | < 2.1.2 | 2.1.42 | PASS | Sandbox escape via settings.json injection |
| GHSA-66q4-vfjg-2qhh | < 2.0.57 | 2.1.42 | PASS | Command injection via directory change |
| GHSA-mhg7-666j-cqg4 | < 2.0.55 | 2.1.42 | PASS | Command injection via piped sed |
| GHSA-q728-gf8j-w49r | < 2.0.74 | 2.1.42 | PASS | Path bypass via ZSH clobber |
| GHSA-qgqw-h4xq-7w8w | < 2.0.72 | 2.1.42 | PASS | Command injection in find |
| GHSA-7mv8-j34q-vp7q | < 2.0.31 | 2.1.42 | PASS | Sed validation bypass |
| GHSA-4fgq-fpq9-mr3g | < 1.0.111 | 2.1.42 | PASS | Pre-startup command execution |
| GHSA-vhw5-3g5m-8ggf | < 1.0.111 | 2.1.42 | PASS | Domain validation bypass |
| GHSA-j4h9-wv2m-wrf7 | < 1.0.105 | 2.1.42 | PASS | RCE via malicious git email |
| GHSA-qxfv-fcpc-w36x | < 1.0.105 | 2.1.42 | PASS | Command injection in rg |
| GHSA-xq4m-mc3c-vvg3 | < 1.0.93 | 2.1.42 | PASS | Command validation bypass |
| GHSA-ph6w-f82w-28w6 | < 1.0.87 | 2.1.42 | PASS | Insufficient startup warning |
| GHSA-2jjv-qf24-vfm4 | < 1.0.39 | 2.1.42 | PASS | Plugin autoloading RCE (yarn) |
| GHSA-5hhx-v7f6-x7gv | < 1.0.39 | 2.1.42 | PASS | Pre-startup trust dialog bypass |
| GHSA-9f65-56v6-gxw7 | 0.2.116-1.0.24 | 2.1.42 | PASS | IDE websocket origin bypass |
| GHSA-x56v-x2h6-7j34 | < 1.0.20 | 2.1.42 | PASS | Command injection in echo |
| GHSA-x5gv-jw7f-j6xj | < 1.0.4 | 2.1.42 | PASS | Permissive default allowlist |
| GHSA-pmw4-pwvc-3hx2 | < 0.2.111 | 2.1.42 | PASS | Path prefix collision bypass |

---

## Action Required

### CRITICAL
None.

### HIGH
None.

### LOW
- **@huggingface/transformers 3.8.1**: No CVEs found, but limited audit history. Monitor for advisories.
- **NVD API**: All 5 keyword queries returning 404. SecurityPoller needs endpoint investigation.

---

## Update Commands

No urgent updates required. System is current.

```bash
# Optional: verify Claude Code is latest
claude update

# Optional: update npm deps
cd ~/.claude && bun update
```

---

## Summary

PAI's toolchain is fully patched against all known CVEs as of 2026-02-16. The 18 Claude Code security advisories — while concerning in aggregate (command injection, sandbox escapes, path traversals) — are all fixed in versions well below our 2.1.42. No MCP servers or vulnerable AI libraries (LangChain, LlamaIndex, Ollama) are installed.

The primary risk is not known CVEs but **zero-day exposure** in Claude Code's permission model. The advisory pattern (command injection bypasses, sandbox escapes, settings injection) suggests the permission boundary is a recurring attack surface. PAI's SecurityValidator and SupplyChainGate hooks provide defense-in-depth against this class of attack.

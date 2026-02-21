# STRIDE Threat Model: BeyondTrust Remote Support & Privileged Remote Access (CVE-2026-1731)

*Generated: 2026-02-18 | Research: 4x Parallel Agents (Perplexity + Claude + Gemini + Codex) | CVE Enrichment: FeedlyClient | Threat Model: Fabric STRIDE*

---

## CVE Enrichment (Feedly Threat Intelligence)

> Automatically enriched via FeedlyClient.

#### CVE-2026-1731
- **CVSS Score:** 9.8 (v3) / 9.9 (v4) — CRITICAL
- **EPSS:** 4.22%
- **Patched:** YES (RS 25.3.2+, PRA 25.1+)
- **Exploit Status:** EXPLOITED IN WILD
- **CWE:** CWE-78 (OS Command Injection)
- **Threat Actors:** HAFNIUM / Silk Typhoon
- **Associated Malware:** Lumma Stealer, SimpleHelp RMM, WebSocket-based C2
- **Context:** Pre-authentication OS command injection enabling unauthenticated RCE via crafted HTTP requests to the RS/PRA web interface. ~11,000 instances internet-exposed, ~8,500 on-premises.

#### Historical Context: CVE-2024-12356 (CVSS 9.8) + CVE-2024-12686
- Silk Typhoon (APT27) weaponized both to breach U.S. Treasury Department (Dec 2024)
- 419 computers compromised, 3,000+ files accessed including Treasury Secretary Yellen's devices
- 12 Chinese nationals indicted by DoJ (March 2025)

---

## STRIDE Analysis

### S — Spoofing (Identity Verification Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| Pre-auth RCE bypasses all identity verification — attacker operates as site service account | **High** | **Critical** | **CRITICAL** |
| Attacker creates rogue domain admin accounts post-compromise, impersonating legitimate admins | **High** | **Critical** | **CRITICAL** |
| Compromised BeyondTrust appliance used to broker sessions under legitimate service identity | **Medium** | **High** | **HIGH** |
| Forged session tokens from credential vault access enable impersonation across managed systems | **Medium** | **Critical** | **CRITICAL** |

**Mitigations:**
- Implement mTLS client certificate authentication at reverse proxy in front of RS/PRA admin interface
- Enforce MFA for all BeyondTrust-brokered sessions, not just initial login
- Monitor for new domain accounts created outside change windows (AD audit policy)
- Implement Privileged Access Workstations (PAWs) that do not route through BeyondTrust for Tier 0 access

---

### T — Tampering (Data Integrity Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| OS command injection allows modification of appliance configuration, disabling logging | **High** | **Critical** | **CRITICAL** |
| Attacker modifies credential vault contents — plants backdoor credentials for persistent access | **Medium** | **Critical** | **HIGH** |
| SimpleHelp RMM binaries renamed and dropped in ProgramData to masquerade as legitimate software | **High** | **High** | **HIGH** |
| Tampering with BeyondTrust session recording/audit logs to cover post-exploitation activity | **Medium** | **High** | **HIGH** |

**Mitigations:**
- Forward all BeyondTrust logs to external SIEM in real-time (attacker cannot erase remote copies)
- Implement file integrity monitoring (FIM) on BeyondTrust appliance directories, especially ProgramData
- Credential vault contents should trigger alerts on modification outside scheduled rotation windows
- Session recordings stored on separate, append-only storage not accessible from the appliance

---

### R — Repudiation (Logging and Audit Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| Pre-auth exploit leaves minimal web access log footprint — no authenticated session to attribute | **High** | **High** | **HIGH** |
| Post-compromise log deletion by attacker running as service account | **Medium** | **High** | **HIGH** |
| Impacket-based lateral movement using pass-the-hash leaves limited attribution trail in standard Windows event logs | **Medium** | **Medium** | **MEDIUM** |
| Service restart timestamps manipulated to hide exploitation window | **Low** | **Medium** | **LOW** |

**Mitigations:**
- Enable verbose web access logging with full request body capture on RS/PRA endpoints
- Stream all appliance logs to immutable external storage (S3 with object lock, WORM-compliant SIEM)
- Enable Windows Security Event ID 4688 (Process Creation) with command-line auditing on all BeyondTrust-managed endpoints
- Deploy Sysmon on the appliance host for comprehensive process tree logging

---

### I — Information Disclosure (Confidentiality Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| Credential vault exfiltration — SSH keys, passwords, session tokens for all managed systems | **High** | **Critical** | **CRITICAL** |
| Active Directory reconnaissance via AdsiSearcher post-compromise reveals entire org structure | **High** | **High** | **HIGH** |
| Network share enumeration exposes sensitive file repositories | **Medium** | **High** | **HIGH** |
| Session recording data contains screen captures of privileged operations on managed systems | **Medium** | **Critical** | **HIGH** |
| `get_portal_info` endpoint leaks `x-ns-company` identifier used in exploit chain | **High** | **Medium** | **HIGH** |

**Mitigations:**
- Encrypt credential vault at rest with HSM-backed keys not accessible to the service account
- Implement network segmentation isolating the appliance from Tier 0 assets (DCs, PKI, production databases)
- Restrict `get_portal_info` endpoint to authenticated requests only (compensating control pending patch)
- Rate-limit all unauthenticated endpoints to reduce reconnaissance viability
- Deploy DLP monitoring on network egress from the BeyondTrust appliance segment

---

### D — Denial of Service (Availability Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| Mass exploitation by automated scanners overwhelms appliance resources (confirmed GreyNoise scanning) | **High** | **Medium** | **HIGH** |
| Attacker deliberately crashes the appliance to disrupt privileged access operations | **Medium** | **High** | **HIGH** |
| HTTP 500 error storms from exploit fuzzing degrade service performance | **Medium** | **Medium** | **MEDIUM** |
| Patch application requires service restart — planned downtime for privileged access infrastructure | **High** | **Medium** | **HIGH** |

**Mitigations:**
- Deploy WAF with aggressive rate limiting in front of all RS/PRA instances (block after 5 requests/min from unknown IPs)
- Maintain out-of-band privileged access path that does not depend on BeyondTrust (e.g., jump servers with direct SSH/RDP)
- Pre-schedule emergency maintenance windows for rapid patch deployment
- Implement geographic IP filtering at firewall — block source countries not expected in legitimate access patterns

---

### E — Elevation of Privilege (Authorization Threats)

| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| Pre-auth RCE grants service account context — pivot to domain admin via credential vault access | **High** | **Critical** | **CRITICAL** |
| New accounts created and added to Domain Admins and Enterprise Admins groups | **High** | **Critical** | **CRITICAL** |
| PSexec used to deploy SimpleHelp across multiple endpoints — horizontal privilege expansion | **High** | **High** | **HIGH** |
| Impacket SMBv2 session setup enables lateral movement with harvested credentials | **High** | **High** | **HIGH** |
| BeyondTrust service account privileges allow session brokering to any managed endpoint | **High** | **Critical** | **CRITICAL** |

**Mitigations:**
- Apply principle of least privilege to BeyondTrust service account — remove unnecessary AD group memberships
- Implement tiered administration model: BeyondTrust should NOT have direct access to Tier 0 assets
- Monitor for PSexec and Impacket activity patterns via EDR (highest-fidelity detection)
- Alert on any account additions to Domain Admins, Enterprise Admins, or Schema Admins groups
- SIEM hunting query for service account spawning shells:
  ```
  index=edr process_parent="*RemoteSupport*" OR
  process_parent="*PrivilegedRemoteAccess*" |
  search (process_name="sh" OR process_name="bash" OR
  process_name="cmd.exe" OR process_name="powershell.exe")
  ```

---

## Priority Matrix

| Threat | Likelihood | Impact | Difficulty to Mitigate | Priority |
|--------|------------|--------|------------------------|----------|
| Pre-auth RCE to credential vault exfiltration | High | Critical | Low (patch available) | **P0 — Immediate** |
| Domain admin account creation post-compromise | High | Critical | Low (AD monitoring) | **P0 — Immediate** |
| Lateral movement via SimpleHelp/PSexec/Impacket | High | High | Medium (EDR + segmentation) | **P0 — Immediate** |
| `get_portal_info` information leakage | High | Medium | Low (WAF/ACL) | **P1 — This Week** |
| Log tampering / repudiation on appliance | Medium | High | Medium (log forwarding) | **P1 — This Week** |
| PAM architectural concentration risk | High | Critical | High (architecture redesign) | **P2 — Strategic** |

---

## Recommended Actions

### Immediate (P0)
1. **Patch all on-premises RS/PRA instances** to RS 25.3.2+ / PRA 25.1.1+ — verify patch via build version string on login page AND service restart timestamp
2. **If patching is delayed**: remove all public DNS records pointing to the appliance, restrict web interface access to VPN/internal IPs only at the firewall layer
3. **Hunt for compromise indicators**: search for SimpleHelp binaries in ProgramData, new DA/EA accounts created since January 31, Impacket SMBv2 patterns, service account spawning shells
4. **Review credential vault**: audit all credentials stored in BeyondTrust for unauthorized access or modification since January 31, 2026

### Short-term (P1)
1. Forward all appliance logs to immutable external SIEM storage
2. Deploy EDR monitoring on appliance host with process tree visibility
3. Implement mTLS at reverse proxy for admin interface access
4. Rate-limit and geo-filter all inbound connections to RS/PRA management ports

### Long-term (P2)
1. Evaluate PAM architectural concentration risk — single vendor compromise yields full domain control
2. Implement tiered administration model isolating BeyondTrust from Tier 0 assets
3. Maintain out-of-band privileged access path independent of BeyondTrust
4. Conduct quarterly vulnerability assessment of all PAM infrastructure

---

## Threat Actor Intelligence

| Actor | Association | Confidence | Activity |
|-------|------------|------------|----------|
| **Silk Typhoon / HAFNIUM (APT27)** | China-nexus state-sponsored | **Confirmed** (prior BeyondTrust zero-day exploitation) | Weaponized CVE-2024-12356 + CVE-2024-12686 to breach U.S. Treasury. Operational familiarity with BeyondTrust codebase. |
| **Opportunistic criminal actors** | Financially motivated | **Confirmed** (GreyNoise scanning data) | Integrated CVE-2026-1731 exploit checks into automated scanners within 24 hours of PoC. Simultaneously targeting SonicWall, MOVEit, Log4j, Sophos. |
| **Unknown targeted actors** | Unattributed | **Assessed likely** | PoC-to-exploitation gap of <24 hours and CISA KEV listing suggest targeted exploitation beyond mass scanning. |

---

## Sources

- [Rapid7 ETR: CVE-2026-1731](https://www.rapid7.com/blog/post/etr-cve-2026-1731-critical-unauthenticated-remote-code-execution-rce-beyondtrust-remote-support-rs-privileged-remote-access-pra/)
- [BeyondTrust Advisory BT26-02](https://www.beyondtrust.com/trust-center/security-advisories/bt26-02)
- [The Hacker News: BeyondTrust Fixes Critical Pre-Auth RCE](https://thehackernews.com/2026/02/beyondtrust-fixes-critical-pre-auth-rce.html)
- [BleepingComputer: CISA 3-day mandate](https://www.bleepingcomputer.com/news/security/cisa-orders-feds-to-patch-beyondtrust-flaw-within-three-days/)
- [Help Net Security: CVE-2026-1731](https://www.helpnetsecurity.com/2026/02/09/beyondtrust-remote-access-vulnerability-cve-2026-1731/)
- [GBHackers: Full AD Control](https://gbhackers.com/attackers-exploit-critical-beyondtrust-flaw/)
- [SecurityWeek: 24hr Exploitation](https://www.securityweek.com/beyondtrust-vulnerability-targeted-by-hackers-within-24-hours-of-poc-release/)
- [Canadian CCCS Advisory AL26-003](https://www.cyber.gc.ca/en/alerts-advisories/al26-003-vulnerability-affecting-beyondtrust-cve-2026-1731)
- [NVD: CVE-2026-1731](https://nvd.nist.gov/vuln/detail/CVE-2026-1731)
- [Security Affairs: Exploitation within hours](https://securityaffairs.com/187962/uncategorized/attackers-exploit-beyondtrust-cve-2026-1731-within-hours-of-poc-release.html)
- [Arctic Wolf: CVE-2026-1731](https://arcticwolf.com/resources/blog/cve-2026-1731/)
- [Tenable: CVE-2026-1731](https://www.tenable.com/cve/CVE-2026-1731)

---

*Generated by WisdomSynthesis ThreatAnalysis Pipeline v1.0.0*
*Research: 4x Parallel Agents (Perplexity + Claude + Gemini + Codex) | CVE Enrichment: FeedlyClient | Threat Model: Fabric STRIDE*

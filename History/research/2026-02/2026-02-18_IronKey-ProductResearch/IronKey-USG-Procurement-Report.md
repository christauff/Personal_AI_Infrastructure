# Encrypted USB Drive Procurement Report: IronKey & Alternatives for USG GFE

*Generated: 2026-02-18 | Research: 4x Parallel Agents (Perplexity + Claude + Gemini + Codex) | Analysis: 7-Phase Product Research Chain*

---

## Executive Summary

**Recommendation: IronKey D500S + SafeConsole (primary fleet) | IronKey KP200 (SCIF/air-gap)**

A team of 10 cyberops personnel with legacy IronKey S200/S250 devices requires immediate procurement of FIPS 140-3 Level 3 encrypted USB drives. The FIPS 140-2 standard sunsets September 21, 2026. Only three USB drives worldwide hold FIPS 140-3 Level 3 certification as of February 2026: Kingston IronKey D500S, Kingston IronKey KP200, and iStorage datAshur PRO+C. The D500S with SafeConsole fleet management is the recommended primary solution at ~$2,195 Year 1 for a fleet of 15 drives (10 general + 5 SCIF).

---

## Phase 1: Intelligence Gathering

### IronKey Current Product Line

| Product | FIPS Cert | Interface | Capacity | Price Range | USG Status |
|---------|-----------|-----------|----------|-------------|------------|
| **D500S** | **140-3 L3** | USB 3.2 Gen 1 | 8-512GB | $96-$580 | **RECOMMENDED** |
| **KP200** | **140-3 L3** | USB 3.2 | 8-512GB | $110-$460 | **RECOMMENDED** |
| D300S/SM | 140-2 L3 | USB 3.0 | 4-128GB | $62-$350 | Sunsets Sep 2026 |
| VP50 | FIPS 197 only | USB 3.2 | 8-256GB | $28-$182 | **INSUFFICIENT** |
| VP80ES | FIPS 197 only | USB 3.2 | 1-8TB | $250-$960 | **INSUFFICIENT** |
| S1000 | 140-2 L3 | USB 3.0 | EOL | Discontinued | **DISCONTINUED** |

> **Note:** All pricing is estimated from publicly available sources and may differ from GSA Schedule, SEWP V, or negotiated contract pricing. Contact authorized resellers for current government pricing.

### USG Procurement Requirements

- **FIPS 140-2 sunset: September 21, 2026** -- only FIPS 140-3 validated products procurable after this date
- **CMMC 2.0 Final Rule** (effective Dec 16, 2024) -- Media Protection controls 3.8.6, 3.8.7, 3.8.8
- **DISA STIGs** mandate encrypted removable storage on all GFE endpoints
- **CNSSP-11** (effective Feb 28, 2025) -- NSA-approved solutions for National Security Systems
- **TAA compliance** mandatory for GSA Schedule purchases
- **Procurement vehicles:** GSA MAS Schedule, NASA SEWP V, CDW-G, Carahsoft, GovConnection

### Alternative Vendors Evaluated

| Vendor/Product | FIPS Cert | Fleet Mgmt | TAA | Price Range | Status |
|----------------|-----------|------------|-----|-------------|--------|
| **iStorage datAshur PRO+C** | **140-3 L3** | datAshur Mgmt | UK (needs determination) | $79-$159 | **CONDITIONAL** |
| DataLocker Sentry 5 | 140-3 L3 (PENDING) | SafeConsole | Yes | $89-$199 | **DO NOT PROCURE** |
| DataLocker Sentry K350 | 140-2 L3 | SafeConsole | Yes | $99-$299 | Sunsets Sep 2026 |
| Apricorn Aegis SK 3NXC | 140-2 L3 | AEGIS Config | Yes | $79-$159 | Sunsets Sep 2026 |
| Kanguru Defender 3000 | 140-2 L3 | KRMC | Yes | $69-$149 | Sunsets Sep 2026 |
| SecureDrive BT | 140-2 L3 | RemoteLock | Yes | $99-$299 | Bluetooth risk |

> **Note:** Pricing estimates are from public sources and may differ from GSA/SEWP contract pricing.

### Legacy Device Analysis

- **IronKey brand history:** IronKey Inc (2005) -> Imation (2011) -> Kingston (2016)
- **IronKey EMS Cloud shutdown: January 1, 2023** -- all S200/S250 era devices lost management
- **Legacy limitations:** USB 2.0, max 64GB, no remote management, FIPS 140-2 L3 (sunsets 2026)
- **Migration path:** S200/S250 -> D500S (software auth) or KP200 (hardware keypad). No data migration -- must copy/wipe/reload.

---

## Phase 2: Product Feature Analysis

### Rated Comparison Matrix (1-10 Scale)

| Product | Security Cert | Capacity | Speed | Fleet Mgmt | USG Compliance | Value | **TOTAL** |
|---------|--------------|----------|-------|------------|----------------|-------|-----------|
| **IronKey D500S** | **10** | **10** | **10** | **9** | **10** | **6** | **55/60** |
| **IronKey KP200** | **10** | **10** | **7** | **5** | **10** | **7** | **49/60** |
| DataLocker Sentry 5* | 7 | 8 | 7 | 10 | 7 | 8 | 47/60 |
| iStorage datAshur PRO+C | **10** | **9** | **6** | **4** | **8** | **9** | **46/60** |
| DataLocker Sentry K350 | 6 | 5 | 7 | 10 | 6 | 7 | 41/60 |

*Sentry 5 scores conditional on FIPS 140-3 CMVP certification completing. Do not procure until confirmed.*

### USG Procurement Suitability Labels

| Label | Products |
|-------|----------|
| **RECOMMENDED** | IronKey D500S, IronKey KP200 |
| **CONDITIONAL** | iStorage datAshur PRO+C (TAA pending), DataLocker Sentry 5 (FIPS pending) |
| **NOT RECOMMENDED** | D300S (sunset), VP50 (FIPS 197), VP80ES (FIPS 197), Kanguru, SecureDrive BT |

---

## Phase 3: First Principles Decomposition

### Fundamental Requirement

Data written to a portable storage device must be encrypted so that an adversary -- including a nation-state with physical possession -- cannot recover it without the authorized user's credential.

### Irreducible Constraints

1. **FIPS 140-3 Level 3** mandatory after September 21, 2026
2. **TAA compliance** mandatory for GSA Schedule
3. **Fleet management** for 10+ devices (remote wipe, audit logging, PIN recovery)
4. **Budget** under simplified acquisition threshold
5. **Regulatory deadline** is 7 months away -- procurement decision is effectively now

### Key Assumptions Challenged

| Assumption | Challenge | Resolution |
|-----------|-----------|------------|
| FIPS 140-3 required now | CMMC L2 may accept 140-2 until sunset | Procure 140-3 anyway -- buying 140-2 means buying twice |
| Sentry 5 certification imminent | CMVP backlog is 18-36 months | Do not procure on pending certification |
| iStorage is TAA non-compliant | UK is a designated TAA country | Run determination -- may resolve favorably |
| Hardware keypad always needed | Only for air-gapped/SCIF | D500S sufficient for networked GFE |

---

## Phase 4: Council Debate (5 Perspectives)

### Points of Universal Agreement

1. **FIPS 140-3 Level 3 is the minimum standard** -- all perspectives converged
2. **SafeConsole is essential, not optional** -- field operator needs PIN recovery, CISO needs audit logs
3. **KP200 is uncontested for SCIF/air-gap** -- no competing argument was made
4. **Legacy fleet disposition is mandatory** -- cannot deploy new fleet without retiring old

### Unresolved Tensions & Resolutions

| Tension | Resolution |
|---------|------------|
| iStorage TAA viable? | Issue 10-business-day TAA determination request. Do not delay primary procurement. |
| SafeConsole vendor dependency | Contract escrow clause for data export. Document physical crypto-erase fallback. |
| Legacy fleet disposition | Parallel 30-day inventory + physical destruction exercise. Complete before deploying new fleet. |
| SafeConsole recurring budget | Must be funded as separate CLIN -- not one-time hardware money. |

---

## Phase 5: Red Team Adversarial Analysis

### Top 5 Attacks on the Recommendation

1. **SafeConsole has a poisoned history** -- EMS Cloud shutdown is a precedent. Contractual escrow mitigates.
2. **Thin market timing** -- Only 3 FIPS 140-3 L3 products today. Market may widen before Sep 2026. Accepted -- delay risk exceeds timing premium.
3. **SaaS budget dependency** -- SafeConsole lapsing degrades fleet management. Must fund as recurring cost.
4. **Two-SKU logistics** -- D500S + KP200 creates training/inventory complexity. Policy-driven assignment mitigates.
5. **iStorage TAA resolution gap** -- No kill condition on the "pending" status. Set 30-day determination deadline.

### Residual Risks No Product Solves

1. **User behavioral bypass** -- copying to unencrypted personal drives. Mitigate with DLP + SETA training.
2. **PIN disclosure under duress** -- hardware security assumes PIN confidentiality. Periodic PIN reset policy required.
3. **Data remanence on source systems** -- encrypted USB protects the drive, not the workstation that staged files. Endpoint sanitization procedures required.

### Methodology Gaps Acknowledged

- AO/ISSM pre-coordination not performed (recommend before procurement)
- Specific DISA STIG V-IDs not cited (manual mapping required for ATO)
- Supply chain provenance analysis not performed (relies on FIPS 140-3 testing scope)
- RMA turnaround time not documented (recommend contractual SLA)

---

## Phase 6: Executive Recommendation (7S Strategy)

### SITUATION

The team operates without FIPS 140-3 certified portable media. Legacy IronKey S200/S250 units lost centralized management when EMS Cloud shut down in January 2023. The September 21, 2026 sunset of FIPS 140-2 creates a hard deadline that, given USG procurement cycles, is effectively now.

### STAKES

Delay risks mission personnel operating unmanaged, unauditable portable media. Incorrect product selection creates audit findings, ATO jeopardy, and potential data spillage liability. A single spillage incident's remediation cost exceeds the total 5-year fleet cost by an order of magnitude.

### SOLUTION

| Line Item | SKU | Qty | Est. Unit | Est. Total |
|-----------|-----|-----|-----------|------------|
| IronKey D500S 64GB | DKSP50S/64GB | 10 | $119 | $1,190 |
| IronKey KP200 64GB | IKVP200/64GB | 5 | $109 | $545 |
| SafeConsole Cloud (Year 1) | SC-CLOUD x10 | 1 | $460 | $460 |
| **Year 1 Total** | | | | **$2,195** |
| **Annual recurring (Yr 2+)** | | | | **~$460/yr** |

> **Note:** All pricing is estimated from public sources. Actual pricing should be obtained through GSA MAS, SEWP V, or authorized government reseller quotes. GSA/SEWP pricing may be lower than retail estimates shown.

**Procurement Vehicle:** NASA SEWP V (fastest) or GSA MAS Schedule 70.

### SUBSTANTIATION

- FIPS 140-3 Level 3 certified (survives Sep 2026 sunset)
- SafeConsole provides remote disable, policy enforcement, audit logs (AU-2, AU-9, MP-7, IA-3)
- D500S scored 55/60 -- highest rated product across all criteria
- KP200 provides OS-independent SCIF capability
- Both TAA compliant, GSA Schedule available

### SHORTCOMINGS

1. SafeConsole vendor dependency (EMS Cloud precedent)
2. Two-SKU logistics complexity
3. iStorage datAshur PRO+C potentially cheaper (TAA pending)
4. No DISA STIG exists for these drives
5. Supply chain provenance not fully analyzed
6. **All recommended drives are USB-A only** -- see Addendum A for operational throughput and future-proofing implications
7. **SafeConsole deployment model** not addressed -- on-premises option available for enclave environments (see Addendum A)

### SAFEGUARDS

| Risk | Mitigation |
|------|------------|
| SafeConsole discontinuation | Contract escrow clause + documented physical crypto-erase fallback |
| Two-SKU complexity | Policy-driven assignment: D500S=general, KP200=SCIF |
| iStorage TAA | 30-day parallel determination (non-blocking) |
| No STIG | Manual control mapping for ATO submission |
| Supply chain | GSA/SEWP-only sourcing + Certificate of Conformance at delivery |

### STEPS (Timeline)

| Week | Action |
|------|--------|
| **Week 1** | Brief AO, initiate iStorage TAA determination, inventory legacy fleet, draft media policy |
| **Week 2** | Market research memo (3 quotes), draft SOW with FIPS 140-3 L3 minimum, SafeConsole escrow language |
| **Week 3-4** | Submit purchase via SEWP V, specify D500S x10 + KP200 x5 + SafeConsole 10-seat |
| **Month 2** | Deploy SafeConsole, enroll D500S, issue drives with policy acknowledgment, destroy legacy fleet (NSA/CSS EPL or NIST SP 800-88) |
| **Month 3** | First SafeConsole audit review, receive iStorage TAA determination, AO compliance confirmation |

**Hard Procurement Deadline: May 1, 2026** (to allow deployment before Sep 21, 2026 FIPS 140-2 sunset)

---

## Procurement Decision Brief

```
MEMORANDUM FOR: [Approving Official]
FROM:            [Program Manager / ISSO]
DATE:            2026-02-18
SUBJECT:         Encrypted USB Drive Procurement - Decision Required

BACKGROUND

Current portable media posture does not meet FIPS 140-3 Level 3
requirements. FIPS 140-2 sunsets September 21, 2026. Procurement
cycles require action now.

RECOMMENDATION

[X] RECOMMEND    [ ] DO NOT RECOMMEND

Approve procurement of IronKey D500S (primary fleet) and IronKey
KP200 (SCIF/air-gap) with SafeConsole management via NASA SEWP V.

WHAT YOU ARE APPROVING

  Hardware:   10x IronKey D500S 64GB          ~$1,190
              5x  IronKey KP200 64GB          ~$  545
  Management: SafeConsole Cloud, 10 seats/yr  ~$  460
              ----------------------------------------
  Year 1 Total:                               ~$2,195
  Annual recurring (management only):         ~$  460

WHY THIS SELECTION

1. Only products with FIPS 140-3 Level 3 certification -- the
   post-September 2026 minimum standard.

2. SafeConsole provides mandatory fleet auditability: remote
   disable, policy enforcement, AU-2/AU-9/MP-7 control
   satisfaction.

3. KP200 selected for SCIF environments where management
   connectivity is prohibited.

4. GSA MAS / SEWP V available -- no new contract vehicle required.

KNOWN LIMITATIONS (ACCEPTED RESIDUAL RISK)

- SafeConsole is a SaaS dependency. Contractual escrow clause
  required as condition of award. On-premises deployment option
  available for enclave environments (see Addendum A.4).

- iStorage datAshur PRO+C not included pending TAA determination.
  To be resolved within 30 days, non-blocking. Note: PRO+C is
  the only FIPS 140-3 L3 drive with native USB-C connector
  (see Addendum A.1 for operational throughput implications).

- No DISA STIG exists. Manual control mapping will be produced
  as ATO supporting artifact.

- All recommended drives (D500S, KP200) are USB-A only.
  See Addendum A for future-proofing analysis and USB-C
  operational considerations for modern GFE laptop fleets.

DECISION REQUIRED BY: [45 days prior to desired delivery]
HARD PROCUREMENT DEADLINE: May 1, 2026

APPROVING OFFICIAL

Signature: _________________________ Date: ___________

Print Name: ________________________

[ ] APPROVED  [ ] APPROVED WITH CONDITIONS  [ ] DISAPPROVED

Conditions / Comments:
_______________________________________________________________
```

---

## Sources

- Kingston IronKey product specifications (kingston.com)
- NIST CMVP Validated Modules List (csrc.nist.gov)
- NIST SP 800-88 Rev. 1: Guidelines for Media Sanitization
- NIST SP 800-111: Guide to Storage Encryption Technologies
- CMMC 2.0 Final Rule (32 CFR Part 170, effective Dec 16, 2024)
- CNSSP-11 (effective Feb 28, 2025)
- DISA STIG Library (stigviewer.com)
- GSA MAS Schedule (gsaadvantage.gov)
- NASA SEWP V (sewp.nasa.gov)
- iStorage product specifications (istorage-uk.com)
- DataLocker product specifications (datalocker.com)
- Apricorn product specifications (apricorn.com)

---

## Addendum A: Operational & Technical Findings (2026-02-19)

*Added following federal lead review. These findings address day-to-day operational concerns not covered in the original procurement analysis.*

### A.1 USB-C Connector Analysis

**Finding: All recommended FIPS 140-3 L3 drives (D500S, KP200) are USB-A only.**

This was not flagged as a shortcoming in the original report because the analysis focused on cryptographic certification and fleet management. In operational practice, connector type has material impact:

| Drive | Connector | Read Speed | Write Speed | Interface |
|-------|-----------|------------|-------------|-----------|
| iStorage datAshur PRO+C | **USB-C** | 310 MB/s | 246 MB/s | USB 3.2 Gen 1 |
| Kingston IronKey D500S (512GB) | USB-A | 310 MB/s | 250 MB/s | USB 3.2 Gen 1 |
| Kingston IronKey D500S (≤64GB) | USB-A | 260 MB/s | 190 MB/s | USB 3.2 Gen 1 |
| Kingston IronKey KP200 | USB-A | USB 3.2 | — | USB 3.2 Gen 1 |
| DataLocker Sentry 5 (512GB) | USB-A | 310 MB/s | 250 MB/s | USB 3.2 Gen 1 |

**Operational impact at recommended 64GB capacity (D500S @ 190 MB/s write):**

| Operation | Time @ 190 MB/s | Time @ 310 MB/s (512GB) |
|-----------|----------------|-------------------------|
| EDR scan 512GB drive (full read) | ~45 min | ~28 min |
| Move 32GB VM to drive (write) | ~2 min 49s | ~1 min 43s |
| Copy 32GB VM from drive (read) | ~2 min 13s | ~1 min 43s |

**Key insight:** Today, USB-C and USB-A deliver identical throughput on these drives because the hardware encryption controller (not the bus) is the bottleneck at ~310 MB/s max. However:

1. **USB-C is the only path to future speeds.** USB 3.2 Gen 2 (10 Gbps) and USB4 (40 Gbps) require USB-C. USB-A maxes out at Gen 1 (5 Gbps). When encryption controllers catch up, USB-A physically cannot go faster.
2. **Modern GFE laptops are increasingly USB-C only.** Adapter dependency introduces logistics friction (lost, forgotten, broken adapters) and a potential failure point in daily operations.
3. **3-5 year fleet lifecycle.** Drives procured in 2026 will be in service until 2029-2031. USB-A is being phased off new hardware during this period.

**Recommendation update:** If USB-C is not a hard requirement today, the D500S recommendation stands. If the fleet's GFE laptops are predominantly USB-C, or if future-proofing the 3-5 year lifecycle matters, the iStorage datAshur PRO+C (pending TAA determination) should be elevated from CONDITIONAL to co-recommended.

### A.2 FIPS 140-3 Is Connector-Agnostic

**Finding: FIPS 140-3 validates the cryptographic module, not the physical interface.**

No NIST, NSA, CNSSP-11, or NIAP guidance document addresses USB-C specifically. The USB-C Authentication specification (USB-IF) uses NIST-standard algorithms (ECDSA P-256, SHA-256) but has no CMVP validation itself — it is a device identity protocol, not data-at-rest encryption.

**Procurement language implication:** Specify CMVP certificate numbers and FIPS 140-3 Level 3, not connector types, in procurement requirements. Connector type is a logistics and usability decision, not a security one.

### A.3 USB-C/Thunderbolt DMA Attack Surface

**Finding: USB4/Thunderbolt alternate mode on USB-C creates a real DMA attack surface on the HOST, not the drive.**

Thunderspy (2020) demonstrated seven vulnerabilities in Thunderbolt including IOMMU bypass. An attacker with DMA access to a host could read decrypted data from host RAM after the drive has been unlocked.

**This does NOT compromise the drive itself.** A properly designed FIPS 140-3 Level 3 drive with on-device keypad PIN entry performs all cryptographic operations internally. Host DMA cannot extract keys from the drive's secure microprocessor.

**Mitigation (already part of standard GFE hardening):**
- Drive side: Require hardware keypad authentication (KP200) for highest-sensitivity environments
- Host side: Enable Kernel DMA Protection, restrict Thunderbolt tunneling policy via DISA STIG

### A.4 SafeConsole Deployment: Cloud or On-Premises

**Finding: SafeConsole supports both cloud-hosted and on-premises deployment.**

The original report referenced SafeConsole without specifying deployment model. For federal enclave environments, the on-premises option is typically required. Key details:

- **On-premises server** — runs within the enclave, no data egress
- **Cloud-hosted** — DataLocker SaaS option for organizations preferring managed infrastructure
- **Cross-vendor management** — single console manages both DataLocker devices AND Kingston IronKey devices
- **SIEM integration** — Splunk, Graylog for AU-2/AU-9 control satisfaction
- **Capabilities** — remote lock, remote wipe, password reset without data wipe, geofencing, time-based access policies, anti-malware scanning (optional add-on)

**Recommendation update:** Specify "SafeConsole On-Premises" in the SOW for enclave deployments. Request on-premises pricing from DataLocker or through CDW-G/GSA Schedule — pricing may differ from cloud-hosted.

### A.5 Kanguru Defender: FIPS 140-3 Gap

**Finding: No Kanguru Defender product holds FIPS 140-3 certification. All Kanguru-branded drives sunset September 2026.**

| Kanguru Product | Current Cert | FIPS 140-3 Status | Sunsets? |
|-----------------|-------------|-------------------|----------|
| Defender 3000 (flash) | FIPS 140-2 L3 (Cert #2401) | **Pending** — no CMVP cert issued | YES |
| Defender SSD350 (SSD) | FIPS 140-2 L2 (Cert #4228) | No activity announced | YES |
| Defender HDD350 (HDD) | FIPS 140-2 | No activity announced | YES |

Kanguru's Defender 3000 product page states "Pending FIPS 140-3 Level 3 Certification" but CMVP validation backlogs run 12-18 months. No cert number has been issued.

**Note:** Kanguru Solutions (Millis, MA) is the US distributor for iStorage products. The iStorage datAshur PRO+C — which does hold FIPS 140-3 Level 3 — is sold through Kanguru and listed on CDW as "iStorage/Kanguru datAshur PRO+C." Kanguru is not an iStorage subsidiary; they are independent companies with a distribution partnership. iStorage hardware is UK-manufactured; Kanguru is US-manufactured.

### A.6 FIPS 140-3 Level 3 USB Flash Drive Market (Complete Inventory, Feb 2026)

| Vendor | Product | Connector | CMVP Status | TAA | Fleet Mgmt |
|--------|---------|-----------|-------------|-----|------------|
| Kingston | IronKey D500S | USB-A | Validated (#5029) | Yes | SafeConsole |
| Kingston | IronKey KP200 | USB-A | Validated | Yes | No (air-gap) |
| iStorage | datAshur PRO+C | **USB-C** | Validated (Dec 2024) | Yes (UK designated) | No native |
| iStorage | datAshur PRO+A | USB-A | Validated (Dec 2024) | Yes (UK designated) | No native |
| DataLocker | Sentry 5 | USB-A | Validated (Jan 2026) | Yes | SafeConsole |

**Total market: 5 products from 3 vendors.** Only 1 (iStorage PRO+C) has native USB-C. Only 3 (D500S, Sentry 5, and DataLocker devices generally) support SafeConsole fleet management. Only 1 (KP200) is designed for air-gapped/SCIF use with hardware keypad and no host software dependency.

### Addendum Sources

- [Kanguru Defender 3000 Product Page](https://www.kanguru.com/products/kanguru-defender-3000-superspeed-usb-3-0-fips-140-2-level-3-certified-hardware-encrypted-flash-drive)
- [iStorage datAshur PRO+C on CDW](https://www.cdw.com/product/istorage-kanguru-datashur-pro-c-fips-140-3-level-3-hardware-encrypted/8326291)
- [Microsoft Kernel DMA Protection](https://learn.microsoft.com/en-us/windows/security/hardware-security/kernel-dma-protection-for-thunderbolt)
- [Thunderspy Research](https://thunderspy.io/)
- [DataLocker SafeConsole Platform](https://datalocker.com/products/central-management/safeconsole/)
- [Kingston IronKey D500S FIPS 140-3 L3 Announcement](https://www.kingston.com/en/company/press/article/77012)
- [iStorage FIPS 140-3 L3 Validation (via Kanguru)](https://www.kanguru.com/blogs/news/istorage-s-datashur-pro-c-pro-a-encrypted-flash-drives-obtain-fips-140-3-level-3-validation)
- [NIST FIPS 140-3 Standard](https://csrc.nist.gov/pubs/fips/140-3/final)

---

*Generated by PAI Product Research Chain v1.0*
*Research: 4x Parallel Agents (Perplexity + Claude + Gemini + Codex) | Extraction: Fabric x4 | Analysis: FirstPrinciples | Debate: Council x5 | Critique: RedTeam | Synthesis: BeCreative*
*Addendum A added 2026-02-19: Operational findings from federal lead review (USB-C analysis, SafeConsole deployment, Kanguru gap, DMA attack surface, complete FIPS 140-3 L3 market inventory)*

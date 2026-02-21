# ThreatAnalysis Workflow

Execute the comprehensive security threat assessment pipeline: Research → Threat Model → RedTeam → Council

**Pipeline:** `threat_analysis` from `Data/Pipelines.yaml`

---

## Voice Notification

**MANDATORY - Execute immediately:**

```bash
curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the ThreatAnalysis workflow in the WisdomSynthesis skill for comprehensive security assessment"}' \
  > /dev/null 2>&1 &
```

**Text notification:**
```
Running the **ThreatAnalysis** workflow in the **WisdomSynthesis** skill for comprehensive security assessment...
```

---

## Workflow Steps

### Step 0: Detect Input Type

**CRITICAL:** Determine if input is a file path, URL, or description.

**Input Type Routing:**

| Input Type | Example | Action |
|------------|---------|--------|
| **File path** | `~/Docs/architecture.md` | Read file → Skip Research → Threat Model |
| **URL** | `https://api-docs.com` | Research URL |
| **Description** | API architecture text | Research topic |

**⚠️ RESOURCE WARNING:**
- File mode: **No agent spawning**, direct threat modeling
- URL/Description mode: **4 parallel research agents**
- Large files (>100KB): Consider manual review

---

### Step 1a: File Mode (Skip Research)

**IF INPUT IS FILE:**

```bash
FILE_PATH="[USER_PROVIDED_PATH]"
CONTENT=$(cat "$FILE_PATH")
echo "📄 File Mode: Skipping Research - analyzing file directly"
```

**Proceed directly to Step 2 (Threat Model) with file content.**

---

### Step 1b: Security Research Phase (Topic/URL Mode)

**IF INPUT IS TOPIC OR URL:**

⚠️ **Resource Impact:** Spawns 4 parallel agents

Launch security-focused research:

```typescript
Task({
  subagent_type: "ClaudeResearcher",
  description: "Security research phase",
  prompt: `Research security threats for: [TARGET]

  Focus on:
  - Known attack patterns for this architecture
  - Recent CVEs and vulnerabilities
  - Industry-specific threat intelligence
  - Security best practices and mitigations
  - Real-world breach examples

  Return comprehensive security research with sources.`,
  model: "sonnet"
})
```

**Wait for research completion.** Store output as `threat_research`.

---

### Step 1c: Optional CVE Enrichment (FeedlyClient)

**This step is OPTIONAL.** It runs only when the FeedlyClient private skill is installed locally. Upstream users without FeedlyClient skip this step entirely — `threat_research` passes through unmodified.

#### Feature Gate

```bash
# Check if FeedlyClient skill is installed
if [ ! -d "$HOME/.claude/skills/FeedlyClient" ]; then
  echo "ℹ️ FeedlyClient not installed — skipping CVE enrichment"
  # threat_research passes through unchanged
fi
```

**If the directory does not exist, skip this entire step.** Proceed to Step 2.

#### CVE ID Extraction

Extract CVE identifiers from `threat_research` using regex:

```
Pattern: CVE-\d{4}-\d{4,7}
```

- If **no CVE IDs found**, skip enrichment — `threat_research` passes through unchanged.
- If CVE IDs found, **deduplicate and cap at 5** (most recent year first) to protect Feedly API rate budget.

#### Per-CVE Enrichment

For each extracted CVE ID, call FeedlyClient CLI:

```bash
timeout 15 bun ~/.claude/skills/FeedlyClient/FeedlyClient.ts cve <CVE_ID>
```

**Error Classification and Handling:**

| Failure Mode | Detection | Behavior |
|---|---|---|
| **Network error** | ECONNREFUSED, ETIMEDOUT, or timeout exit code 124 | Log warning, skip this CVE, continue to next |
| **Rate limit** | Exit code non-zero + output contains "rate limit", "429", or "circuit breaker" | Log warning, **halt all remaining lookups** |
| **API error** | Exit code non-zero + output contains HTTP 4xx/5xx status | Log warning, skip this CVE, continue to next |
| **Parse error** | Output is not valid JSON or lacks `cveid` field | Log warning, skip this CVE, continue to next |
| **Timeout** | `timeout` command exit code 124 | Same as network error — skip CVE, continue |

**⚠️ No failure mode aborts the workflow.** Every error path either skips the individual CVE or halts remaining lookups — never terminates the pipeline.

#### Data Merge

For each successful enrichment, parse the JSON response and format as a Markdown block. The FeedlyClient CLI returns a JSON object with fields from the `FeedlyCVEEntity` type.

**Extract these fields from the JSON response:**

| Field | JSON Path | Fallback |
|---|---|---|
| CVSS Score | `cvssV3.baseScore` (prefer v3, fall back to `cvssV2`) | "N/A" |
| Severity | `cvssCategoryEstimate` | Derive from CVSS score |
| EPSS | `epssScore` (multiply by 100 for percentage) | "N/A" |
| Patched | `patched` (boolean) | "Unknown" |
| Exploit Status | `exploitedInTheWild` (boolean) | "Unknown" |
| CWE | `cweIds[]` (join if multiple) | "N/A" |
| Threat Actors | `relatedThreatActors[].label` (join) | "None identified" |
| Malware | `relatedMalware[].label` (join) | "None identified" |
| Context | `executiveSummary` or `description` | "No summary available" |

**Format each CVE as:**

```markdown
#### CVE-XXXX-XXXXX
- **CVSS Score:** 9.8 (CRITICAL)
- **EPSS:** 4.2%
- **Patched:** YES / NO / Unknown
- **Exploit Status:** EXPLOITED IN WILD / No known exploits / Unknown
- **CWE:** CWE-78 (if available)
- **Threat Actors:** Volt Typhoon (or "None identified")
- **Associated Malware:** BOLDMOVE (or "None identified")
- **Context:** [executive summary or description excerpt]
```

**Append all enrichment blocks to `threat_research` under this header:**

```markdown
## CVE Enrichment (Feedly Threat Intelligence)

> The following CVE intelligence was automatically enriched via FeedlyClient.
> Use these scores when assessing STRIDE likelihood and impact ratings in Step 2.

[enrichment blocks here]
```

#### Fallback Guarantee

If **all** enrichment attempts fail or produce no data, `threat_research` passes through to Step 2 **completely unmodified**. Step 2 receives identical input to the unenriched path.

---

### Step 2: Generate Threat Model

> **Note:** `[THREAT_RESEARCH]` may contain a "CVE Enrichment (Feedly Threat Intelligence)" appendix from Step 1c. If present, use the CVSS scores, EPSS percentages, and threat actor associations to inform STRIDE likelihood and impact ratings.

Apply Fabric's create_threat_model pattern using STRIDE methodology:

```typescript
Task({
  subagent_type: "general-purpose",
  description: "Generate STRIDE threat model",
  prompt: `Using the Fabric create_threat_model pattern, analyze: [TARGET]

  Context from research:
  [THREAT_RESEARCH]

  Generate STRIDE threat model:
  - **S**poofing: Identity verification threats
  - **T**ampering: Data integrity threats
  - **R**epudiation: Logging and audit threats
  - **I**nformation Disclosure: Confidentiality threats
  - **D**enial of Service: Availability threats
  - **E**levation of Privilege: Authorization threats

  For each category:
  1. List specific threats
  2. Rate likelihood (Low/Medium/High)
  3. Rate impact (Low/Medium/High)
  4. Suggest mitigations

  Return structured STRIDE analysis.`,
  model: "sonnet"
})
```

**Wait for threat model completion.** Store output as `threat_model`.

### Step 3: RedTeam Adversarial Critique

Launch adversarial analysis using RedTeam skill:

```typescript
Task({
  subagent_type: "general-purpose",
  description: "RedTeam adversarial critique",
  prompt: `Invoke the RedTeam skill to critique this threat model:

  [THREAT_MODEL]

  RedTeam agents should:
  - Challenge threat severity ratings
  - Identify missed attack vectors
  - Propose novel attack chains
  - Question mitigation effectiveness
  - Find assumptions in the model

  Use 8 adversarial agents with diverse attack mindsets.

  Return critical analysis with specific attack scenarios.`,
  model: "sonnet"
})
```

**Wait for RedTeam completion.** Store output as `adversarial_analysis`.

### Step 4: Council Security Debate

Launch multi-perspective security discussion:

```typescript
Task({
  subagent_type: "general-purpose",
  description: "Security council debate",
  prompt: `Invoke the Council skill to debate security strategy:

  Threat Model:
  [THREAT_MODEL]

  RedTeam Findings:
  [ADVERSARIAL_ANALYSIS]

  Debate topic: "What are the highest priority threats and mitigations?"

  Perspectives:
  - **Offensive Security**: Attacker viewpoint, exploitability
  - **Defensive Security**: Defense-in-depth, detection
  - **Compliance**: Regulatory requirements, audit trails
  - **Architecture**: Design patterns, secure defaults

  Each perspective should argue for their priorities.

  Return synthesized security strategy.`,
  model: "sonnet"
})
```

**Wait for Council completion.** Store output as `security_synthesis`.

### Step 5: Synthesize Threat Report

Combine all four layers into comprehensive threat assessment:

**Report Structure:**

```markdown
# Threat Analysis Report: [TARGET]

## Executive Summary

### Risk Rating: [CRITICAL / HIGH / MEDIUM / LOW]

[2-3 sentence summary of highest priority threats and recommended actions]

---

## Layer 1: Threat Landscape

### Research Findings
[Security research context and industry trends]

### Known Attack Patterns
[Documented attacks against similar systems]

### Recent Vulnerabilities
[Relevant CVEs and security advisories]

---

## Layer 2: STRIDE Threat Model

### Spoofing Threats
| Threat | Likelihood | Impact | Risk |
|--------|------------|--------|------|
| [threat] | [L/M/H] | [L/M/H] | [L/M/H/C] |

**Mitigations:**
- [mitigation 1]
- [mitigation 2]

### Tampering Threats
[Same structure for each STRIDE category...]

### Repudiation Threats
[...]

### Information Disclosure Threats
[...]

### Denial of Service Threats
[...]

### Elevation of Privilege Threats
[...]

---

## Layer 3: Adversarial Analysis (RedTeam)

### Novel Attack Vectors
[New threats identified by adversarial thinking]

### Attack Chains
[Multi-step attack scenarios]

### Mitigation Weaknesses
[Gaps in proposed defenses]

### Assumptions Challenged
[Questioned security assumptions]

---

## Layer 4: Security Strategy (Council)

### Offensive Security Perspective
[Attack surface prioritization]

### Defensive Security Perspective
[Defense-in-depth strategy]

### Compliance Perspective
[Regulatory requirements]

### Architecture Perspective
[Design recommendations]

### Synthesized Strategy
[Integrated security approach across perspectives]

---

## Priority Matrix

| Threat | Likelihood | Impact | Difficulty to Mitigate | Priority |
|--------|------------|--------|------------------------|----------|
| [threat 1] | High | Critical | Low | **P0 - Immediate** |
| [threat 2] | Medium | High | Medium | **P1 - Next Sprint** |
| [threat 3] | Low | Medium | High | **P2 - Backlog** |

---

## Recommended Actions

### Immediate (P0)
1. [action with specific steps]
2. [action with specific steps]

### Short-term (P1)
1. [action with timeframe]
2. [action with timeframe]

### Long-term (P2)
1. [strategic improvement]
2. [strategic improvement]

---

## Residual Risks

### Accepted Risks
[Risks explicitly accepted with rationale]

### Unmitigated Risks
[Risks not addressed due to constraints]

### Unknown Unknowns
[Areas of uncertainty requiring further investigation]

---

## Monitoring and Detection

### Key Security Metrics
- [metric 1]: [threshold]
- [metric 2]: [threshold]

### Detection Strategies
- [detection approach 1]
- [detection approach 2]

### Incident Response
[High-level response plan for each threat category]

---

## Meta-Analysis

### Confidence Assessment
- Research Coverage: [High/Medium/Low]
- Threat Model Completeness: [High/Medium/Low]
- Mitigation Feasibility: [High/Medium/Low]

### Methodology Limitations
[Known gaps in analysis approach]

### Recommended Follow-up
[Additional security assessments needed]

---

*Generated by WisdomSynthesis ThreatAnalysis Pipeline v1.0.0*
*Research: ClaudeResearcher | Threat Model: Fabric STRIDE | Critique: RedTeam | Strategy: Council*
```

---

## Error Handling

### Research Phase Issues

**Limited threat intelligence:**
```
Security research returned minimal findings for "[TARGET]".

Possible reasons:
- Novel/proprietary system (no public research)
- Niche technology stack
- Private/internal system

Recommendation: Proceed with generic threat model based on architecture patterns.
```

### Threat Model Gaps

**Incomplete STRIDE coverage:**
```
Threat model missing categories: [list]

Continue anyway? Options:
1. Proceed with partial model (document gaps)
2. Manually add missing categories
3. Use generic threat templates
```

### RedTeam Limitations

**Conservative attack scenarios:**
```
RedTeam analysis appears conservative (low novelty score).

Options:
1. Accept current analysis
2. Retry with higher aggression parameters
3. Invoke PromptInjection skill for creative attacks
```

---

## Output

Comprehensive security threat assessment with:
1. **Threat landscape** - Research-backed context
2. **STRIDE model** - Systematic threat categorization
3. **Adversarial critique** - Creative attack thinking
4. **Security strategy** - Multi-perspective defense plan

**Format:** Markdown report
**Location:** Output directly (can save to Security/ directory)

---

## Performance Notes

**Typical execution time:** 45-60 seconds

**Breakdown:**
- Research: ~15s (security-focused research)
- Threat Model: ~15s (STRIDE analysis)
- RedTeam: ~15s (8 adversarial agents)
- Council: ~15s (4 security perspectives)

**Model recommendations:**
- All phases: `sonnet` (security analysis requires quality)
- For critical systems: Consider `opus` for RedTeam/Council phases
- Never use `haiku` for security assessments

---

## Integration with Other Skills

**Feeds into:**
- **WebAssessment** - Active penetration testing
- **PromptInjection** - LLM security testing
- **Evals** - Security control validation

**Combines with:**
- **Recon** - Attack surface mapping
- **OSINT** - Threat actor intelligence
- **FeedlyClient** - CVE enrichment with CVSS/EPSS/threat actors (optional, Step 1c)

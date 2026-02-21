---
name: SkillSupplyChain
compatibility:
  claude_code: ">=2.1.38"
  requires: ["semgrep"]
---

# SkillSupplyChain

Security scanning of skill packages before installation -- static analysis, prompt injection detection, and supply chain validation.

**Domain:** Supply chain security, skill package scanning, pre-installation validation

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `scan skill`, `skill security`, `audit skill package` | `StaticScan.md` | Analyze skill package code |
| `security report`, `skill audit report` | `SecurityReport.md` | Generate detailed security report |
| `quick check`, `pre-install check` | `QuickCheck.md` | Fast pre-install safety check |

---

## Architecture

- **Pipeline:** Static analysis -> SemgrepGuard scan -> Prompt injection detection -> Verdict
- **Integration:** Uses SemgrepGuard for SAST, InjectionLibrary for prompt injection patterns
- **Provenance:** Records scan results via AgentTrace
- **Gate:** Hard gate via hook -- blocks skill installs that FAIL
- **Verdicts:** PASS (clean), WARN (issues found, user decides), FAIL (blocked)

---

## Scan Pipeline

1. **Static Analysis** - Regex patterns for dangerous operations (exec, spawn, fetch to unknown hosts, fs.write outside skill dir)
2. **SemgrepGuard** - `bun run SemgrepGuard/Tools/SemgrepScan.ts scan <path>` for SAST
3. **Prompt Injection** - Check SKILL.md and workflow files against InjectionLibrary detection patterns
4. **Verdict** - Score 0-100, verdict PASS/WARN/FAIL based on policies.yaml thresholds

---

## Version
- v1.0.0 (2026-02-12) - Initial implementation

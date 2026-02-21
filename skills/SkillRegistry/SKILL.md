---
name: SkillRegistry
compatibility:
  claude_code: ">=2.1.38"
---

# SkillRegistry

Cross-platform skill discovery with security pre-screening via SkillSupplyChain.

**Domain:** Skill discovery, community skills, cross-registry search, secure installation

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| `skill registry`, `find skills`, `community skills` | `SearchRegistries.md` | Search across registries |
| `prescreen skill`, `skill security check` | `SecurityPrescreen.md` | Pre-screen before install |
| `install skill` | `InstallSkill.md` | Full install pipeline with security gate |
| `skill audit`, `install history` | `AuditTrail.md` | Review install history |

---

## Architecture

- **Discovery:** Multi-registry search with unified result format
- **Security:** Delegates to SkillSupplyChain for pre-installation scanning
- **Cache:** registry-cache.jsonl stores search results and install records
- **Gate:** Soft gate -- shows security warnings, user decides

---

## Supported Registries

Configured in Config/registries.yaml:
- Anthropic Official (npx skills search)
- GitHub Topics (github topic:claude-code-skill)
- SkillsMP (skillsmp.com API)
- npm registry (keyword search)

---

## Version
- v1.0.0 (2026-02-12) - Initial implementation

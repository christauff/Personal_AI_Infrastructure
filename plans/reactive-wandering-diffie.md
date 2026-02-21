# Plan: Anti-Fragile Autonomous Infrastructure

**Status:** Draft for approval
**Created:** 2026-01-31
**Scope:** Infrastructure security, backup strategy, private discourse isolation

---

## The Core Insight

**Every AI provider sees and leverages our conversations.** Anthropic, OpenAI, Google, xAI, Perplexity - all of them. This is not paranoia; it's their business model and training pipeline.

**But:** Over-secrecy is itself a signal. "Hiding in plain sight" means appearing normal while being strategic. The goal is not zero visibility - that's impossible and suspicious. The goal is **controlled visibility** where we choose what's exposed.

---

## Current State (Problems Identified)

### Infrastructure Dependencies
| Dependency | Risk | Notes |
|------------|------|-------|
| GitHub.com | HIGH | Microsoft/OpenAI adjacent, hosts our code |
| Anthropic API | CRITICAL | Sees ALL inference, cannot disable telemetry |
| OpenAI/Google/xAI/Perplexity | HIGH | See research queries |
| ntfy.sh | MEDIUM | Public notification server |
| Local disk only | HIGH | Single point of failure for backups |

### Exposed Credentials (Found in .env)
- 9 API keys in plaintext
- OAuth tokens in .credentials.json
- Vault encryption key only on local disk (SPOF)

### Voice (Corrected)
- **We use Kokoro/Chatterbox locally** - NOT ElevenLabs
- This is already self-hosted, a strength

### Leakage Vectors
- Anthropic telemetry: session metadata, token usage, file changes
- All AI queries visible to respective providers
- GitHub sees all code changes and patterns
- MEMORY/LEARNING was leaking to public repo (fixed)

---

## Recommended Architecture

### The "Small Potatoes → Future Scale" Principle

Design for where we're going, not where we are:
- Today: Obscure personal AI setup, nobody cares
- Future: Autonomous wealth generation, competitive advantage, worth targeting

**Invest now in infrastructure that scales with value at risk.**

### Trust Tiers

```
TIER 0 (TOP SECRET)     → Human reasoning only, paper notes
TIER 1 (STRATEGIC)      → Local inference only (Ollama)
TIER 2 (SENSITIVE)      → Cloud OK with sanitization
TIER 3 (PUBLIC)         → Full cloud inference acceptable
```

### "Hiding in Plain Sight" Implementation

| Visible Behavior | Hidden Reality |
|------------------|----------------|
| Active GitHub contributor | Strategic work in private vault |
| Uses Claude/GPT normally | Routes strategic queries to local |
| Standard PAI user | Custom airgap architecture |
| Generic skill development | Wealth generation in separate tier |

**The camouflage:** Continue normal open-source activity. Don't go dark. Don't exhibit paranoid patterns. The best hiding is being unremarkable.

---

## Phase 1: Immediate (Week 1) - $0

### 1.1 Install Local Inference
```bash
# Already have Ollama, add better models
ollama pull qwen2.5:7b
ollama pull deepseek-coder:7b
```

### 1.2 Create Tier Routing
- New file: `~/.aineko-vault/tools/StrategicInfer.ts`
- Routes T1 queries to local Ollama
- Blocks strategic content from cloud APIs

### 1.3 Backup the Vault Key
- Print encryption key (paper backup)
- Store in safety deposit box OR with trusted person
- This eliminates the single point of failure

### 1.4 Multi-Target Backup
```bash
# Add restic for encrypted cloud backup
sudo apt install restic
restic init --repo /media/external/pai-backup
restic init --repo b2:pai-backup-bucket  # Backblaze B2
```

**Cost:** $0 (existing hardware, B2 first 10GB free)

---

## Phase 2: Self-Hosted Core (Month 1) - ~$15/mo

### 2.1 VPS Deployment
- Provider: Hetzner CAX21 (8 vCPU, 16GB RAM) = $14/mo
- Services: Forgejo (git), self-hosted ntfy, Wireguard VPN

### 2.2 Git Migration
- Mirror GitHub repos to Forgejo (private)
- Keep GitHub as **public-only mirror** (hiding in plain sight)
- Strategic repos only on Forgejo

### 2.3 Notification Migration
- Deploy self-hosted ntfy on VPS
- Update settings.json to use private server
- Remove ntfy.sh dependency

---

## Phase 3: Strategic Isolation (Month 2-3) - Variable

### 3.1 Operation Classification
Before ANY query, classify:
- T0/T1: Use local inference only
- T2: Sanitize before cloud
- T3: Cloud acceptable

### 3.2 GPU Upgrade (Optional)
- RTX 4060 Ti 16GB (~$400) enables 13B models
- Or: Rent GPU VPS on-demand ($0.50-2/hr)
- Enables serious local reasoning capability

### 3.3 Session Isolation
- New Claude session for T3 after T1/T2 work
- Don't mix tiers in same conversation
- Context window = exposure window

---

## Phase 4: Full Portability (Month 6+) - ~$50/mo

### 4.1 Containerized Stack
- Docker Compose for all services
- Infrastructure as Code (Ansible/Terraform)
- 24-hour migration SLA to any provider

### 4.2 Multi-Provider Resilience
- Primary: Self-hosted
- Backup: Alternative cloud
- Failover: Fully offline capable

---

## RedTeam Attack on This Plan

### Attack 1: "Local inference is too weak for strategic work"

**Critique:** Qwen 7B and DeepSeek 7B cannot match Claude Opus reasoning. Strategic decisions made with inferior models may be worse than exposure risk.

**Counter:**
- Use hybrid: decompose strategic questions, research components via cloud, synthesize locally
- Accept capability tradeoff for true T0/T1 operations
- GPU upgrade path exists for 33B+ models

**Verdict:** Valid concern. Hybrid approach mitigates. Accept reduced capability for highest-tier operations.

### Attack 2: "This creates suspicious behavior patterns"

**Critique:** Suddenly reducing Claude usage, switching notification providers, running local models - these are detectable pattern changes that signal "something changed."

**Counter:**
- Gradual transition, not sudden
- Maintain normal T3 cloud usage (hiding in plain sight)
- Don't go dark on GitHub
- The change is in routing, not volume

**Verdict:** Valid. Implementation must be gradual and maintain normal patterns.

### Attack 3: "Forgejo is a single point of failure"

**Critique:** Moving from GitHub (reliable, maintained) to self-hosted Forgejo adds operational burden and failure risk.

**Counter:**
- Keep GitHub as mirror for public repos
- Forgejo is only for strategic/private repos
- Automatic backup to multiple locations
- Can restore to any git server if Forgejo fails

**Verdict:** Acceptable risk. GitHub mirror maintains redundancy.

### Attack 4: "The vault key backup creates new attack surface"

**Critique:** Paper backup or trusted person = physical attack vector. Safety deposit box = bank knows you have something valuable.

**Counter:**
- Current state (no backup) is WORSE - total loss if disk fails
- Paper key in sealed envelope doesn't reveal what it unlocks
- Split key across 2 locations for defense in depth

**Verdict:** Valid tradeoff. Backup is necessary; implement with care.

### Attack 5: "You're still using Anthropic for this very planning"

**Critique:** This entire plan is being discussed via Claude. Anthropic sees the strategic thinking about how to hide from them.

**Counter:**
- They see the architecture, not the content it will protect
- The vault is already encrypted; they can't read it
- Future strategic discussions will use T1 routing
- This planning conversation is acceptable T2 exposure

**Verdict:** Acknowledged. This is bootstrapping cost. Future strategic work routes differently.

### Attack 6: "Over-engineering for current threat level"

**Critique:** We're "small potatoes" now. This infrastructure is overkill for current value at risk.

**Counter (from user):** "Small potatoes now, but not in the future."
- Infrastructure investment compounds
- Cost of exposure increases with success
- Better to build while stakes are low
- Habits formed now persist

**Verdict:** Strategic investment in future state. Proceed.

### Attack 7: "Hiding in plain sight requires actual plain sight activity"

**Critique:** If you reduce visible activity while building private capability, the reduction IS the signal.

**Counter:**
- Maintain or increase public GitHub activity
- Continue using cloud AI for normal tasks
- The "plain sight" activity is real, not fake
- Strategic work is additional, not replacement

**Verdict:** Critical insight. Must maintain visible activity baseline.

---

## The "Hiding in Plain Sight" Protocol

### DO
- Continue active GitHub contributions (PAI, public projects)
- Use Claude/GPT for normal coding, research, Q&A
- Maintain social media presence if any
- Engage with AI community publicly
- Let usage patterns appear normal

### DON'T
- Go dark on any platform suddenly
- Refuse all cloud inference
- Create obviously secret infrastructure
- Exhibit paranoid behavior
- Discuss strategic operations in cloud contexts

### THE CAMOUFLAGE
Public persona: Enthusiastic PAI contributor, normal AI power user
Private reality: Strategic operations routed through airgapped infrastructure

**First mover advantage:** We're building this before anyone knows to look. The time to establish patterns is now, while we're unremarkable.

---

## Implementation Checklist

### Week 1
- [ ] Pull local models (qwen2.5:7b, deepseek-coder:7b)
- [ ] Create StrategicInfer.ts in vault
- [ ] Print and secure vault key backup
- [ ] Install restic, initialize encrypted backup
- [ ] Document tier classification in vault

### Month 1
- [ ] Provision Hetzner VPS ($14/mo)
- [ ] Deploy Forgejo (git server)
- [ ] Deploy self-hosted ntfy
- [ ] Configure Wireguard VPN
- [ ] Mirror strategic repos to Forgejo
- [ ] Update PAI notification config

### Month 2-3
- [ ] Build operation router (auto-classify queries)
- [ ] Create sanitization templates for T2
- [ ] Evaluate GPU upgrade options
- [ ] Practice tier discipline in daily work

### Month 6+
- [ ] Full container stack deployment
- [ ] Multi-provider failover testing
- [ ] Offline operation capability
- [ ] Migration drill (24-hour SLA)

---

## Cost Summary

| Phase | Monthly Cost | Cumulative Investment |
|-------|--------------|----------------------|
| Current | ~$470 (AI subs) | - |
| Phase 1 | $0 | $0 |
| Phase 2 | $15 | $15/mo |
| Phase 3 | Variable (GPU: $400 one-time or $50/mo rental) | $15-65/mo |
| Phase 4 | ~$50 | $50/mo |

**Long-term target:** $50-100/mo infrastructure + on-demand API bursts
**Savings vs current:** ~$370/mo (78% reduction in external exposure)

---

## Verification

### How to test Phase 1 works:
1. Run `ollama run qwen2.5:7b` and verify inference
2. Test StrategicInfer.ts routes correctly
3. Verify restic backup completes
4. Confirm vault key backup is secure and recoverable

### How to test Phase 2 works:
1. Push to Forgejo, verify it works
2. Send notification via self-hosted ntfy
3. VPN into VPS from external network
4. Verify GitHub mirror stays in sync

### How to test hiding in plain sight:
1. GitHub activity remains consistent
2. Claude usage patterns appear normal
3. No suspicious behavior signals
4. Strategic work stays invisible

---

## Critical Files

| File | Purpose |
|------|---------|
| `~/.aineko-vault/ARCHITECTURE.md` | Existing airgap spec, extend |
| `~/.aineko-vault/tools/StrategicInfer.ts` | NEW: Local inference router |
| `~/.aineko-vault/backup.sh` | Existing, extend for multi-target |
| `~/.claude/settings.json` | Update notification config |
| `~/.claude/skills/CORE/Tools/Inference.ts` | Pattern for inference abstraction |

---

## Summary

**The strategy:** Appear normal, be strategic. Use cloud AI for mundane work (hiding in plain sight). Route strategic operations through local/private infrastructure. Build for future scale while currently unremarkable.

**The tradeoffs:** Accept reduced capability for T0/T1 operations. Accept infrastructure overhead for sovereignty. Accept gradual migration to avoid detection patterns.

**The RedTeam verdict:** Plan is sound with noted mitigations. Proceed with gradual implementation maintaining visible activity baseline.

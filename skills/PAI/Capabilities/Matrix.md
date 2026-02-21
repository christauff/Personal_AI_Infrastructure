# Capabilities Matrix - Complete Inventory

**Module:** Capabilities/Matrix.md
**Purpose:** Authoritative inventory of all available capabilities in PAI
**Parent:** [CORE/SKILL.md](../SKILL.md)

---

## Core Principle

**⚠️ CRITICAL: This is the complete capability inventory for Phase Start Prompts. ⚠️**

Before every phase, check: "Is there a skill? Should I combine skills?" This matrix provides the answer.

**Capabilities are the DEFAULT. "Direct" execution is the EXCEPTION.**

---

## Quick Reference

PAI capabilities organized by type:

| Type | Count | Purpose |
|------|-------|---------|
| **Skills** | 39 | Pre-made sub-algorithms for specific domains |
| **Agents** | 11 | Specialized agents via Task tool subagent_type |
| **Named Agents** | 4 | Persistent identities with voices |
| **Modes** | 3 | Enhanced reasoning/planning modes |
| **Tools** | 2 | CLI utilities for specific operations |

---

## Skills (Domain Expertise)

**Source:** `~/.claude/skills/skill-index.json`

### Always-Loaded Skills (3)

These skills are always available in context:

| Skill | Purpose | Use When |
|-------|---------|----------|
| **CORE** | PAI Algorithm reference | Always active |
| **Art** | Visual content creation | Diagrams, illustrations, icons |
| **Research** | Comprehensive research system | ANY research request (mandatory trigger) |

### Core Skills (High-Value)

| Skill | Purpose | Triggers | Use When |
|-------|---------|----------|----------|
| **Agents** | Custom agent composition | custom agents, agent personalities | User says "custom agents" |
| **Browser** | Debug-first browser automation | browser, screenshot, verify UI | UI verification, troubleshooting |
| **BeCreative** | Extended thinking mode | creative, deep thinking | Ideation, novel solutions |
| **Council** | Multi-agent debate | council, debate, perspectives | Multiple viewpoints needed |
| **Evals** | Agent evaluation framework | eval, test agent, benchmark | Testing agent behavior |
| **Fabric** | 240+ prompt patterns | use fabric, extract wisdom | Content analysis/transformation |
| **FirstPrinciples** | Fundamental analysis | first principles, root cause | Challenging assumptions |
| **RedTeam** | Adversarial analysis | red team, critique, stress test | Stress-testing ideas |
| **WisdomSynthesis** | Multi-skill orchestration | wisdom synthesis, chain skills | Complex analysis pipelines |

### Development Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **CreateCLI** | TypeScript CLI generation | create CLI, build CLI |
| **CreateSkill** | Skill creation/validation | create skill, new skill |
| **Prompting** | Meta-prompting system | meta-prompting, template generation |

### Security Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **Recon** | Security reconnaissance | recon, bug bounty, attack surface |
| **WebAssessment** | Web security assessment | pentest, security testing |
| **PromptInjection** | Prompt injection testing | jailbreak, LLM security |
| **SECUpdates** | Security news aggregation | security news, breaches |
| **AnnualReports** | Security report analysis | annual reports, threat landscape |

### Data & Research Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **OSINT** | Open-source intelligence | OSINT, background check, due diligence |
| **PrivateInvestigator** | Ethical people-finding | find person, locate, reconnect |
| **Apify** | Social media scraping | Twitter, LinkedIn, Instagram, TikTok |
| **BrightData** | Progressive URL scraping | scrape URL, web scraping |

### Document Processing Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **Documents** | Document processing router | document, process file |
| **Docx** | Word document processing | docx, Word document |
| **Pdf** | PDF processing | pdf, PDF file |
| **Pptx** | PowerPoint processing | pptx, slides |
| **Xlsx** | Excel processing | xlsx, spreadsheet |

### System Skills (Accelerando System)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **AutoLearn** | Autonomous learning system | autolearn, self-improvement |
| **BudgetMonitor** | Resource tracking | budget, usage, costs |
| **LandscapeMonitor** | AI landscape tracking | landscape scan, what's new |
| **MorningBrief** | Overnight work synthesis | good morning, overnight summary |
| **ProtocolWatch** | Protocol change monitoring | check protocols, MCP update |
| **SkillHarvester** | Pattern extraction | harvest skills, recurring patterns |
| **PAIUpgrade** | System improvement extraction | upgrade, improve system |

### Utility Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **Aphorisms** | Aphorism management | aphorism, quote |
| **Telos** | Life OS and project analysis | TELOS, life goals, projects |
| **VoiceServer** | Voice server management | voice server, TTS |

---

## Agents (Task Tool Subagent Types)

**Source:** `~/.claude/skills/PAI/SYSTEM/PAIAGENTSYSTEM.md`

### General-Purpose Agents

| Subagent Type | Purpose | When to Use | Model Recommendation |
|---------------|---------|-------------|----------------------|
| **Algorithm** | ISC tracking, verification | Most cases - prefer this | sonnet (default) |
| **Intern** | High-IQ generalist | Parallel grunt work, research | haiku (fast) |

### Development Agents

| Subagent Type | Purpose | When to Use | Model Recommendation |
|---------------|---------|-------------|----------------------|
| **Engineer** | Code implementation | Writing/modifying code | sonnet |
| **Architect** | System design | API design, architecture | opus |
| **Designer** | UX/UI design | Design decisions | sonnet |
| **QATester** | Quality assurance | Browser testing | haiku |

### Research Agents

| Subagent Type | Purpose | When to Use | Model Recommendation |
|---------------|---------|-------------|----------------------|
| **ClaudeResearcher** | Claude WebSearch | Research skill workflows | sonnet |
| **CodexResearcher** | GPT-4/Codex research | Research skill workflows | sonnet |
| **GeminiResearcher** | Google Gemini research | Research skill workflows | sonnet |
| **GrokResearcher** | xAI Grok research | Research skill workflows | sonnet |
| **PerplexityResearcher** | Perplexity Sonar | Research skill workflows | sonnet |

### Specialized Agents

| Subagent Type | Purpose | When to Use | Model Recommendation |
|---------------|---------|-------------|----------------------|
| **Explore** | Codebase exploration | Finding files, structure | haiku |
| **Plan** | Implementation planning | Plan mode | sonnet |
| **Pentester** | Security testing | WebAssessment workflows | sonnet |
| **Artist** | Visual content creation | Art skill workflows | sonnet |

---

## Named Agents (Persistent Identities)

**Source:** `~/.claude/skills/PAI/SYSTEM/PAIAGENTSYSTEM.md`

Named agents have backstories, personalities, and unique ElevenLabs voices.

| Agent | Role | Voice | Use For |
|-------|------|-------|---------|
| **Serena Blackwood** | Architect | Premium UK Female | Long-term architecture decisions |
| **Marcus Webb** | Engineer | Premium Male | Strategic technical leadership |
| **Rook Blackburn** | Pentester | Enhanced UK Male | Security testing with personality |
| **Dev Patel** | Intern | High-energy genius | Parallel grunt work |

**Note:** Named agents provide relationship continuity across sessions. For voice output and recurring work with same persona.

---

## Custom Agents (Dynamic Composition)

**Source:** `~/.claude/skills/Agents/SKILL.md`

Created via Agents skill using ComposeAgent tool with trait combinations.

**Usage Pattern:**
```bash
# Compose agent from traits
bun ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "research,enthusiastic,exploratory"

# Output includes:
# - Unique personality prompt
# - Mapped ElevenLabs voice_id
# - Launch with Task tool
```

**When to Use:**
- User explicitly says "**custom agents**" (keyword trigger)
- Need unique personalities for parallel work
- Want trait-based composition (analytical, skeptical, enthusiastic, etc.)

**See:** [Agents skill](../../Agents/SKILL.md) for trait catalog and composition patterns.

---

## Modes (Enhanced Reasoning)

### Plan Mode

**Tool:** `EnterPlanMode`

**Purpose:** Extra IQ for complex tasks - explores codebase, designs approach, gets user approval

**Use When:**
- Major/complex/high-quality work
- Multiple valid approaches exist
- Architectural decisions needed
- User preferences matter

**How it works:**
1. Enters dedicated planning phase
2. Explores codebase with Glob/Grep/Read
3. Designs implementation strategy
4. Presents plan to user for approval
5. Exits with ExitPlanMode when ready

### Extended Thinking Modes

**Skill:** BeCreative

**Purpose:** Expanded creativity and reasoning capacity

**Use When:**
- Novel solutions needed
- Ideation and brainstorming
- "How should I..." questions
- Uncertainty about approach

**Can combine with:** Other skills and agents for enhanced capability

---

## Tools (CLI Utilities)

**Source:** `~/.claude/skills/PAI/SYSTEM/TOOLS.md`

### Inference.ts - Unified AI Inference

**Location:** `~/.claude/skills/PAI/Tools/Inference.ts`

**Purpose:** Single inference tool with three run levels (fast/standard/smart)

**Usage:**
```bash
# Fast (Haiku) - 15s timeout
bun ~/.claude/skills/PAI/Tools/Inference.ts --level fast "System" "User"

# Standard (Sonnet) - 30s timeout
bun ~/.claude/skills/PAI/Tools/Inference.ts --level standard "System" "User"

# Smart (Opus) - 90s timeout
bun ~/.claude/skills/PAI/Tools/Inference.ts --level smart "System" "User"
```

**Use When:**
- Need quick inference without full Agent
- Hooks (sentiment, classification, tab titles)
- Programmatic AI calls

### RemoveBg.ts - Background Removal

**Location:** `~/.claude/skills/PAI/Tools/RemoveBg.ts`

**Purpose:** Remove backgrounds from images using remove.bg API

**Use When:**
- Image processing needs background removal
- Creating clean product images
- Icon generation

---

## Task Management

**Capability:** TaskCreate/Update/List/Get tools

**Purpose:** Persistent task tracking with dependencies

**Use When:**
- Multi-turn work (Ralph loops)
- Parallel agent coordination
- Complex ISC criteria with dependencies
- State must persist across sessions

**See:** [Task-Management.md](./Task-Management.md) for complete integration guide.

---

## Git Branching

**Capability:** Git work trees + branches

**Purpose:** Isolated experiments and parallel exploration

**Use When:**
- Paired with BeCreative for multiple approaches
- Paired with Evals for A/B testing
- Want to try different solutions without committing

**Pattern:**
1. Create git worktree or branch
2. Explore approach in isolation
3. Run Evals to compare
4. Merge winning approach

---

## Parallelization

**Capability:** Multiple agents/threads in background

**Purpose:** Large non-serial work

**Use When:**
- Multiple independent subtasks
- Can benefit from parallel execution
- No sequential dependencies

**Pattern:**
1. Launch multiple agents in SINGLE message (multiple Task calls)
2. Each agent works independently
3. ALWAYS launch spotcheck agent after parallel work
4. Use haiku model for speed (10-20x faster than opus)

**See:** [THEDELEGATIONSYSTEM.md](../SYSTEM/THEDELEGATIONSYSTEM.md) for model selection matrix.

---

## Capability Hierarchy

When multiple capabilities could work, prefer this order:

1. **Domain Skills** - If skill exists for this domain, use it
2. **Thinking Skills** (BeCreative, FirstPrinciples, RedTeam) - For analysis/design
3. **Agents** - For specialized work or parallelization
4. **Task Management** - For complex multi-turn coordination
5. **Direct** - Only when above don't apply

---

## Usage

**Before EVERY phase, ask:**
1. Is there a **skill** that handles this domain?
2. Should I **combine** skills?
3. What **combination** of capabilities is optimal?
4. Why would **direct** be better?

If you can't clearly justify "direct", use a capability.

---

## See Also

- [MCS.md](./MCS.md) - Mandatory Capability Selection rules and enforcement
- [Selection-Guide.md](./Selection-Guide.md) - Decision tree for capability selection (planned)
- [Task-Management.md](./Task-Management.md) - Task tools integration guide
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference
- [~/.claude/skills/skill-index.json](../../skill-index.json) - Live skill registry
- [../SYSTEM/PAIAGENTSYSTEM.md](../SYSTEM/PAIAGENTSYSTEM.md) - Agent routing details

---

*Module extracted 2026-02-02 as part of SKILL.md modularization (audit-001)*

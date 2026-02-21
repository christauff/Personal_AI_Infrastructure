# WisdomSynthesis - Multi-Skill Orchestration System

**Version:** 1.0.0
**Created:** 2026-01-25
**Architecture:** PAI-Native (Markdown workflows + YAML configs + Task delegation)

---

## What Is This?

WisdomSynthesis orchestrates multiple PAI skills in intelligent sequences to extract emergent insights impossible from any single skill.

**Single Skill:**
```
Research → [findings]
```

**WisdomSynthesis:**
```
Research → Fabric → FirstPrinciples → [multi-layered synthesis]
```

Each step builds on the previous, creating deeper understanding.

---

## Architecture

### PAI-Native Design

Following danielmiessler's established patterns for upstream compatibility:

```
WisdomSynthesis/
├── SKILL.md                    # Skill definition (PAI standard format)
├── Data/
│   └── Pipelines.yaml         # Pipeline configs (YAML for data)
├── Workflows/
│   ├── ExtractWisdom.md       # Markdown workflows (PAI standard)
│   ├── ThreatAnalysis.md
│   ├── TopicMastery.md
│   └── CustomPipeline.md
├── Tools/                      # Future: Pipeline utilities
└── Templates/                  # Future: Output templates
```

**Key Decisions:**

1. **Markdown Workflows** - Aligns with Council/Debate.md, Research/StandardResearch.md patterns
2. **YAML Configuration** - Follows Agents/Data/Traits.yaml pattern for structured data
3. **Task Delegation** - Uses Task() with subagent_type for skill invocation (PAI standard)
4. **Voice Notifications** - Mandatory curl pattern from all PAI skills

This ensures clean merges when pulling from https://github.com/danielmiessler/Personal_AI_Infrastructure

---

## Pre-Built Pipelines

### 1. ExtractWisdom
**Chain:** Research → Fabric(extract_wisdom) → FirstPrinciples

**Use for:** Articles, essays, long-form content

**Example:**
```
User: "Wisdom synthesis on this AI safety paper: [URL]"

→ Research: Gather AI safety context
→ Fabric: Extract IDEAS, INSIGHTS, QUOTES
→ FirstPrinciples: Decompose to core assumptions
→ Output: 3-layer synthesis report
```

### 2. ThreatAnalysis
**Chain:** Research → Fabric(threat_model) → RedTeam → Council

**Use for:** Security assessments, threat modeling

**Example:**
```
User: "Threat synthesis on this microservices API"

→ Research: Attack patterns, CVEs
→ Fabric: STRIDE threat model
→ RedTeam: Adversarial critique
→ Council: Multi-perspective strategy
→ Output: Comprehensive threat report
```

### 3. TopicMastery
**Chain:** Research(extensive) → Fabric → FirstPrinciples → Council → BeCreative

**Use for:** Deep learning, mastering new topics

**Example:**
```
User: "Master quantum computing"

→ Research: 12 parallel agents
→ Fabric: Extract concepts, insights
→ FirstPrinciples: Core principles
→ Council: Teaching perspectives
→ BeCreative: Deep synthesis
→ Output: Complete learning path
```

### 4. ControversialTopic
**Chain:** Research(extensive) → Council → RedTeam → FirstPrinciples

**Use for:** Nuanced, multi-faceted issues

### 5. ProductAnalysis
**Chain:** Research → Fabric(analyze_product_feedback) → Council → RedTeam

**Use for:** Product reviews, competitive analysis

---

## How It Works

### Pipeline Definition (YAML)

```yaml
# Data/Pipelines.yaml
pipelines:
  extract_wisdom:
    name: "Extract and Synthesize Wisdom"
    steps:
      - skill: Research
        mode: standard
        output_key: research_findings

      - skill: Fabric
        pattern: extract_wisdom
        input_from: research_findings
        output_key: extracted_wisdom

      - skill: FirstPrinciples
        input_from: extracted_wisdom
        output_key: fundamental_insights
```

### Workflow Execution (Markdown)

```markdown
# ExtractWisdom.md

## Step 1: Research Phase
Task({
  subagent_type: "ClaudeResearcher",
  description: "Research background",
  prompt: "Research [topic]...",
  model: "sonnet"
})

## Step 2: Extract Wisdom
Task({
  subagent_type: "general-purpose",
  description: "Extract structured wisdom",
  prompt: "Using Fabric extract_wisdom on [research_findings]...",
  model: "sonnet"
})

## Step 3: First Principles
[... etc]
```

### Data Handoff

Each step produces structured output:

```json
{
  "step": "research",
  "output": "[findings]",
  "metadata": {"sources": 5, "confidence": "high"}
}
```

Output from Step N becomes input to Step N+1.

---

## Usage

### Invoke via Trigger Words

```
User: "wisdom synthesis on [topic]"
User: "deep analysis pipeline for [content]"
User: "synthesize wisdom from [URL]"
```

### Invoke via Skill Tool

```typescript
Skill({
  skill: "WisdomSynthesis",
  args: "extract_wisdom"
})
```

---

## Performance

| Pipeline | Skills | Time | Token Cost |
|----------|--------|------|------------|
| ExtractWisdom | 3 | ~30-45s | Medium |
| ThreatAnalysis | 4 | ~45-60s | High |
| TopicMastery | 5 | ~60-90s | Very High |

**Model Recommendations:**
- Default: `sonnet` for all phases
- Speed: `haiku` for research only (quality tradeoff)
- Quality: `opus` for reasoning phases (TopicMastery, BeCreative)

---

## Customization

### Add Custom Pipeline

Create `~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/WisdomSynthesis/Pipelines.yaml`:

```yaml
pipelines:
  my_pipeline:
    name: "My Custom Analysis"
    steps:
      - skill: Research
      - skill: Fabric
        pattern: my_pattern
      - skill: Council
```

### Override Defaults

Add `PREFERENCES.md` to USER customization directory with overrides.

---

## Design Principles

### 1. PAI-Native Architecture
Every design decision follows danielmiessler's established patterns from existing PAI skills.

### 2. Upstream Compatibility
Structured to avoid conflicts when merging from https://github.com/danielmiessler/Personal_AI_Infrastructure

### 3. Emergent Insights
Each skill adds a layer; synthesis reveals patterns invisible to any single skill.

### 4. Configurability
Pipelines defined in YAML, workflows in Markdown - easy to extend without code changes.

### 5. Performance Options
Trade quality for speed (haiku) or speed for quality (opus) based on needs.

---

## Integration

### Uses:
- Research (information gathering)
- Fabric (pattern-based extraction)
- FirstPrinciples (decomposition)
- Council (multi-perspective debate)
- RedTeam (adversarial critique)
- BeCreative (deep synthesis)

### Feeds Into:
- Blogging (content creation)
- Learning system (knowledge integration)
- Evals (validation frameworks)

---

## File Structure

```
WisdomSynthesis/
├── SKILL.md                    # Main skill documentation
├── README.md                   # This file (architecture overview)
├── QuickReference.md           # Quick usage guide
├── Data/
│   └── Pipelines.yaml         # Pipeline definitions (5 pre-built)
├── Workflows/
│   ├── ExtractWisdom.md       # Deep content analysis
│   ├── ThreatAnalysis.md      # Security synthesis
│   ├── TopicMastery.md        # Learning pipeline
│   ├── ControversialTopic.md  # Balanced multi-perspective analysis
│   └── CustomPipeline.md      # Dynamic composition
├── Tests/                      # Test content and reports
├── Tools/                      # Pipeline utilities (future)
└── Templates/                  # Output templates (future)
```

---

## Roadmap

### v1.0.0
- ExtractWisdom workflow
- ThreatAnalysis workflow
- 5 pre-built pipelines in YAML
- PAI-native architecture
- Skill index registration

### v1.1.0 (Current)
- CRITICAL BUG FIX: Resource exhaustion on file input
- Input type detection (file/URL/topic) in all workflows
- TopicMastery workflow fully implemented
- ControversialTopic workflow fully implemented
- CustomPipeline dynamic composition implemented
- File mode skips Research phase (0 agents)
- Resource warnings in all workflows

### v2.0.0 (Future)
- Output templates
- Pipeline validation tool
- Progress tracking during pipeline execution
- Pipeline visualization (Mermaid diagrams)
- Pipeline metrics and analytics

---

## Changelog

### 2026-02-03 - v1.1.0 (Bug Fix + Completion)
- CRITICAL BUG FIX: Resource exhaustion when processing files
- Added input type detection (file vs topic vs URL) to all workflows
- File mode skips Research phase entirely (0 agents vs 4-12)
- Resource warnings in all workflows
- TopicMastery, ControversialTopic, CustomPipeline workflows completed
- Documentation updated with file mode examples

### 2026-01-25 - v1.0.0
- Initial creation following PAI-native architecture
- Markdown workflows + YAML pipeline configs + Task delegation
- 5 pre-built pipelines defined
- 2 workflows implemented (ExtractWisdom, ThreatAnalysis)
- Designed for upstream PAI compatibility with https://github.com/danielmiessler/Personal_AI_Infrastructure
- Added to skill-index.json

---

## Credits

**Architecture Pattern:** danielmiessler (https://github.com/danielmiessler/Personal_AI_Infrastructure)
**Implementation:** PAI System v1.0.0
**Design Philosophy:** Emergent insights through multi-skill orchestration

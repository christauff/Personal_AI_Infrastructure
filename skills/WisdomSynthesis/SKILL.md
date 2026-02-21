---
name: WisdomSynthesis
description: Multi-skill orchestration for deep content analysis pipelines. USE WHEN user says 'wisdom synthesis', 'deep analysis pipeline', 'multi-skill analysis', 'orchestrate skills', 'chain skills', 'synthesize wisdom', OR requests complex analysis requiring multiple PAI skills in sequence.
tools:
  - Task(Intern)
  - Task(Explore)
  - Task(PerplexityResearcher)
  - Task(ClaudeResearcher)
  - Read
  - Glob
  - Grep
  - WebFetch
  - Bash
memory: project
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/WisdomSynthesis/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.


## 🚨 MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the WisdomSynthesis skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **WisdomSynthesis** skill to ACTION...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

# WisdomSynthesis Skill

Multi-skill orchestration system for deep content analysis. Chains PAI skills in intelligent pipelines to extract maximum insight from content.

**Domain**: Meta-skill orchestration, knowledge synthesis, deep analysis

**Algorithm**: `~/.claude/skills/PAI/SYSTEM/THEALGORITHM.md`

---

## Philosophy

Most content deserves deeper analysis than a single skill provides. WisdomSynthesis orchestrates PAI skills in curated sequences:

- **Research** → Gather comprehensive information
- **Fabric** → Extract structured wisdom
- **FirstPrinciples** → Decompose to fundamentals
- **Council** → Multi-perspective debate
- **RedTeam** → Adversarial critique

Each step builds on the previous, creating emergent insights impossible from any single skill.

---

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **ExtractWisdom** | "wisdom synthesis", "deep analysis", "synthesize wisdom" | `Workflows/ExtractWisdom.md` |
| **ThreatAnalysis** | "threat synthesis", "deep threat analysis" | `Workflows/ThreatAnalysis.md` |
| **TopicMastery** | "master this topic", "comprehensive understanding" | `Workflows/TopicMastery.md` |
| **ControversialTopic** | "controversial topic", "balanced analysis", "nuanced analysis" | `Workflows/ControversialTopic.md` |
| **CustomPipeline** | "custom pipeline", "orchestrate [skills]" | `Workflows/CustomPipeline.md` |

---

## Pre-Built Pipelines

**Pipelines defined in:** `Data/Pipelines.yaml`

| Pipeline | Skills Chain | Best For |
|----------|-------------|----------|
| **ExtractWisdom** | Research → Fabric(extract_wisdom) → FirstPrinciples | Articles, essays, long-form content |
| **ThreatAnalysis** | Research → Fabric(create_threat_model) → RedTeam → Council | Security analysis, risk assessment |
| **TopicMastery** | Research(extensive) → Fabric(extract_wisdom) → FirstPrinciples → Council → BeCreative | Learning new topics deeply |
| **ControversialTopic** | Research(extensive) → Council → RedTeam → FirstPrinciples | Nuanced, multi-faceted issues |
| **ProductAnalysis** | Research → Fabric(analyze_product_feedback) → Council → RedTeam | Product reviews, competitive analysis |

---

## Examples

**Example 1: Deep wisdom extraction**
```
User: "Use wisdom synthesis to analyze this AI safety paper"
→ Invokes ExtractWisdom workflow
→ Step 1: Research (gather context on AI safety)
→ Step 2: Fabric extract_wisdom (structured extraction)
→ Step 3: FirstPrinciples (fundamental decomposition)
→ Returns: Multi-layered synthesis report
```

**Example 2: Security threat analysis**
```
User: "Run threat synthesis on this API architecture"
→ Invokes ThreatAnalysis workflow
→ Step 1: Research (gather attack patterns, CVEs)
→ Step 2: Fabric create_threat_model (STRIDE)
→ Step 3: RedTeam (adversarial critique)
→ Step 4: Council (security perspectives)
→ Returns: Comprehensive threat analysis
```

**Example 3: Topic mastery**
```
User: "I want to master quantum computing"
→ Invokes TopicMastery workflow
→ Step 1: Research extensive (12 parallel agents)
→ Step 2: Fabric extract_wisdom (concepts, insights)
→ Step 3: FirstPrinciples (core fundamentals)
→ Step 4: Council (teaching perspectives)
→ Step 5: BeCreative (deep synthesis)
→ Returns: Structured learning path + deep understanding
```

**Example 4: Custom pipeline**
```
User: "Chain Research, Fabric analyze_claims, and RedTeam"
→ Invokes CustomPipeline workflow
→ Dynamically composes specified skill sequence
→ Passes output from each step to next
→ Returns: Final synthesis
```

**Example 5: File mode (optimized for transcripts/documents)**
```
User: "Use wisdom synthesis on ~/Documents/interview-transcript.txt"
→ Invokes ExtractWisdom workflow
→ Step 0: Detects file input (not a topic)
→ Step 1: SKIPS Research phase (no agents spawned)
→ Step 2: Fabric extract_wisdom directly on file content
→ Step 3: FirstPrinciples on extracted wisdom
→ Returns: Multi-layered synthesis (faster, lower resource usage)

Resource impact: 0 research agents vs 4 in topic mode
Performance: ~15-20s vs ~30-45s for topics
```

**Example 6: URL mode**
```
User: "Run wisdom synthesis on https://example.com/article"
→ Invokes ExtractWisdom workflow
→ Step 0: Detects URL input
→ Step 1: Research phase (4 agents research the URL)
→ Step 2: Fabric extract_wisdom
→ Step 3: FirstPrinciples
→ Returns: Multi-layered synthesis with source context
```

---

## Input Types

WisdomSynthesis automatically detects three input types and optimizes execution:

| Input Type | Detection | Execution Path | Resource Usage |
|------------|-----------|----------------|----------------|
| **File Path** | `~/path/to/file.txt` | Skip Research → Direct Fabric extraction | 0 agents (optimized) |
| **URL** | `https://example.com` | Research URL → Fabric → FirstPrinciples | 4 agents (standard) |
| **Topic** | `quantum computing` | Research topic → Fabric → FirstPrinciples | 4 agents (standard) |

**File Mode Benefits:**
- ✅ No Research phase (content already available)
- ✅ 0 agents spawned (vs 4-12 in topic/URL mode)
- ✅ 69% lower RAM usage
- ✅ ~50% faster execution
- ✅ Ideal for: transcripts, documents, saved articles, PDFs (converted to text)

**When to Use Each:**
- **Files**: When you already have content locally (transcripts, documents, exports)
- **URLs**: When analyzing web articles, blog posts, online resources
- **Topics**: When researching concepts, ideas, or subjects from scratch

---

## Architecture

### Pipeline Definition (YAML)

Pipelines are defined in `Data/Pipelines.yaml`:

```yaml
pipelines:
  extract_wisdom:
    name: "Extract and Synthesize Wisdom"
    description: "Deep wisdom extraction from content"
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

Workflows in `Workflows/*.md` execute pipelines using Task delegation:

```typescript
// Step 1: Research
Task({
  subagent_type: "ClaudeResearcher",
  description: "Research phase",
  prompt: "Research [topic]..."
})

// Step 2: Fabric (uses output from Step 1)
Task({
  subagent_type: "general-purpose",
  description: "Extract wisdom",
  prompt: "Using Fabric extract_wisdom pattern on: [research_output]"
})
```

### Data Handoff

Each step produces structured output passed to the next:

```json
{
  "step": "research",
  "output": "[research findings]",
  "metadata": {
    "sources": 5,
    "confidence": "high"
  }
}
```

---

## Integration

### Feeds Into
- **All PAI Skills** - WisdomSynthesis orchestrates other skills
- **Blogging** - Synthesized insights for content creation
- **Learning** - Deep understanding pipelines

### Uses
- **Research** - Information gathering phase
- **Fabric** - Pattern-based extraction
- **FirstPrinciples** - Fundamental decomposition
- **Council** - Multi-perspective debate
- **RedTeam** - Adversarial critique
- **BeCreative** - Extended reasoning synthesis

---

## Quick Reference

### When to Use WisdomSynthesis

| Situation | Use WisdomSynthesis? | Why |
|-----------|---------------------|-----|
| Simple question | ❌ No | Single skill sufficient |
| Quick summary | ❌ No | Just use Fabric |
| Deep analysis needed | ✅ Yes | Multi-skill synthesis |
| Controversial topic | ✅ Yes | Need multiple perspectives |
| Security assessment | ✅ Yes | Research + threat model + critique |
| Learning mastery | ✅ Yes | Research + extraction + synthesis |

### Performance Characteristics

| Pipeline | Input Type | Skills | Agents | Time | Token Cost | RAM Usage |
|----------|------------|--------|--------|------|------------|-----------|
| **ExtractWisdom** | File | 2 | 0 | ~15-20s | Low | ~2-4GB |
| **ExtractWisdom** | Topic/URL | 3 | 4 | ~30-45s | Medium | ~4-8GB |
| **ThreatAnalysis** | File | 3 | 0 | ~20-30s | Medium | ~2-4GB |
| **ThreatAnalysis** | Topic/URL | 4 | 4 | ~45-60s | High | ~4-8GB |
| **TopicMastery** | File | 4 | 0 | ~30-45s | High | ~4-6GB |
| **TopicMastery** | Topic/URL | 5 | 12 | ~60-90s | Very High | ~8-16GB |
| **CustomPipeline** | Variable | Variable | Variable | Variable | Variable | Variable |

**File Mode Optimization:**
- Skips Research phase entirely (0 agents)
- ~50% faster execution
- ~69% lower RAM usage
- Ideal for processing local content

---

## File Organization

| Path | Purpose |
|------|---------|
| `~/.claude/skills/WisdomSynthesis/SKILL.md` | Skill documentation |
| `~/.claude/skills/WisdomSynthesis/Data/Pipelines.yaml` | Pipeline definitions |
| `~/.claude/skills/WisdomSynthesis/Workflows/*.md` | Execution workflows |
| `~/.claude/skills/WisdomSynthesis/Tools/` | Pipeline utilities |
| `~/.claude/skills/WisdomSynthesis/Templates/` | Output templates |

---

## Changelog

### 2026-02-03 - v1.1.0 (Bug Fix Release)
- **CRITICAL BUG FIX**: Resolved resource exhaustion crash when processing files
- Added input type detection (file vs topic vs URL) to all workflows
- File mode now skips Research phase (0 agents vs 4-12)
- Added resource warnings showing agent counts
- Performance improvements: 69% RAM reduction, 50% faster for files
- Updated documentation with file mode examples
- See `BUGFIX-2026-02-03.md` for full incident report

### 2026-01-25 - v1.0.0
- Initial creation following PAI-native architecture
- Markdown workflows + YAML pipeline configs + Task delegation
- 5 pre-built pipelines (ExtractWisdom, ThreatAnalysis, TopicMastery, ControversialTopic, ProductAnalysis)
- Designed for upstream PAI compatibility

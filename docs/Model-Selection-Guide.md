# Model Selection Guide for PAI Operators

**Philosophy:** You know the context. The tool provides information. You make the decision.

**Last Updated:** 2026-02-01
**Model Listings Last Verified:** 2026-02-01

> **Note:** Model availability and tier mappings should be verified quarterly against vendor API docs. Check PAIUpgrade alerts for vendor changelog notifications.

---

## Quick Reference Card

### When to Use Cheap Models
- ✅ Quick factual lookups
- ✅ Simple queries with known answers
- ✅ Exploratory research (can retry with expensive model if needed)
- ✅ Budget pressure (>85% monthly spend)
- ✅ High-volume batch processing

### When to Use Expensive Models
- ✅ Complex multi-step reasoning
- ✅ Critical decisions (security, architecture, money)
- ✅ Novel problems (no clear precedent)
- ✅ Quality matters more than cost
- ✅ Single-shot queries (no retry budget)

---

## Service-Specific Guides

### Perplexity (Research Queries)

| Model | Cost (per 1M tokens) | Context | When to Use |
|-------|---------------------|---------|-------------|
| **sonar** | $1 input / $1 output | 128K | Quick factual queries, topic summaries |
| **sonar-pro** | $3 input / $15 output | 200K | Complex multi-step queries, long-form follow-ups |
| **sonar-reasoning** | $2 input / $8 output | 128K | Logical problem-solving, step-by-step analysis |
| **sonar-deep-research** | $2 input / $8 output + tools | 128K | Comprehensive reports, market analysis |

**CLI Override:**
```bash
# Use cheap model for quick lookup
bun PerplexityApi.ts --model sonar "What is X?"

# Use expensive model for complex query
bun PerplexityApi.ts --model sonar-pro "Compare approaches to X considering Y and Z"
```

**Cost Impact:** sonar vs sonar-pro = **15x cheaper** for simple queries

---

### Grok (X/Twitter Research)

| Model | Cost (per 1M tokens) | Context | When to Use |
|-------|---------------------|---------|-------------|
| **grok-4.1-fast** | $0.20 input / $0.50 output | 2M | Quick queries, cost-sensitive work, budget pressure |
| **grok-4** | $3 input / $15 output | 2M | Complex reasoning, X/Twitter data access, critical analysis |
| **grok-3** | $3 input / $15 output | 2M | Previous generation (rarely needed) |

**CLI Override:**
```bash
# Use fast model (93% cheaper!)
bun GrokApi.ts --model grok-4.1-fast "Quick lookup on X"

# Use full model when X data matters
bun GrokApi.ts --model grok-4 "Analyze sentiment on X about Y"
```

**Cost Impact:** grok-4.1-fast vs grok-4 = **15x cheaper** (93% savings)

**⚠️ Note:** Only grok-4 has X/Twitter search access. Use fast model for reasoning, full model for social data.

---

### Gemini (Google Research)

| Model | Cost (per 1M tokens) | Context | When to Use |
|-------|---------------------|---------|-------------|
| **gemini-2.5-flash-lite** | $0.10 input / $0.40 output | 1M | High-volume, cost-sensitive, fast responses |
| **gemini-2.5-flash** | $0.30 input / $2.50 output | 1M | Balanced workloads, production scale |
| **gemini-2.5-pro** | Higher | 1M | Complex reasoning (code, math, STEM) |

**CLI Override:**
```bash
# Use lite for speed and cost
bun GeminiApi.ts --model gemini-2.5-flash-lite "Simple query"

# Use flash for balanced work
bun GeminiApi.ts --model gemini-2.5-flash "Standard query"

# Use pro for complex reasoning
bun GeminiApi.ts --model gemini-2.5-pro "Complex math problem"
```

**Cost Impact:** flash-lite vs flash = **3x cheaper**

---

### OpenAI (Code & Reasoning)

| Model | Cost (per 1M tokens) | Context | When to Use |
|-------|---------------------|---------|-------------|
| **gpt-4o-mini** | $0.15 input / $0.60 output | 128K | High-volume, simple tasks, cost optimization |
| **gpt-4o** | $2.50 input / $10.00 output | 128K | General purpose, multimodal, balanced |
| **gpt-5-codex** | $1.25 input / $10.00 output | 400K | Agentic coding, long-running code tasks |
| **o3** | $2.00 input / $8.00 output | 200K | Complex reasoning, math, science, critical analysis |

**CLI Override:**
```bash
# Use mini for cost savings
bun CodexApi.ts --model gpt-4o-mini "Simple coding query"

# Use standard for general work
bun CodexApi.ts --model gpt-4o "Standard query"

# Use o3 for deep reasoning
bun CodexApi.ts --model o3 "Complex multi-step problem"
```

**Cost Impact:** gpt-4o-mini vs gpt-4o = **17x cheaper**

---

## Budget Pressure Guidance

### At 70% Monthly Spend (Caution)
- ✅ Continue normal operations
- ⚠️ Start monitoring usage
- 💡 Consider cheap models for exploratory work

### At 85% Monthly Spend (Warning)
- ⚠️ Review recent expensive queries
- 💡 Default to cheap models unless critical
- 🔧 Use --model flags to downgrade:
  - Perplexity: sonar instead of sonar-pro
  - Grok: grok-4.1-fast instead of grok-4
  - Gemini: flash-lite instead of flash
  - OpenAI: gpt-4o-mini instead of gpt-4o

### At 95% Monthly Spend (Critical)
- 🚨 Minimize API usage
- ✅ Use Claude WebSearch (free, no API keys)
- ✅ Use cheapest models only
- ❌ Avoid expensive models unless absolutely critical

---

## Research Workflow Integration

### Quick Research Mode
**Default:** Already uses cheap models (1 Perplexity agent)

**Manual optimization:**
```bash
# Explicitly use sonar for max savings
quick research --model sonar "topic"
```

### Standard Research Mode
**Default:** Uses default models (4 agents)

**Budget-conscious override:**
```bash
# Use cheap models across all agents
do research --perplexity-model sonar --grok-model grok-4.1-fast --gemini-model flash-lite --openai-model gpt-4o-mini "topic"
```

### Extensive Research Mode
**Default:** Uses default models (12 agents)

**Recommendation:** Let extensive mode use default models - you invoked it because depth matters. If budget is tight, use Standard mode instead.

---

## Decision Flowchart

```
Is this query critical? (security, money, architecture)
├─ YES → Use expensive models
└─ NO → Continue...

Is the answer likely straightforward?
├─ YES → Use cheap models
└─ NO → Continue...

Can you retry if the answer is insufficient?
├─ YES → Use cheap model, upgrade if needed
└─ NO → Use expensive model

Is budget >85% consumed?
├─ YES → Use cheap models unless critical
└─ NO → Use default models
```

---

## CLI Shortcuts (Proposed)

**Note:** These shortcuts are proposed for Task #7 implementation.

```bash
# Easy shortcuts instead of remembering model names
--cheap     # Use cheapest model (sonar, grok-4.1-fast, flash-lite, gpt-4o-mini)
--expensive # Use most capable model (sonar-pro, grok-4, pro, o3)

# List available models for a service
--list-models

# Examples
bun PerplexityApi.ts --cheap "quick query"
bun GrokApi.ts --expensive "critical analysis"
bun GeminiApi.ts --list-models
```

---

## Cost Comparison Table

| Service | Cheap Model | Expensive Model | Cost Difference |
|---------|-------------|-----------------|-----------------|
| **Perplexity** | sonar ($1/$1) | sonar-pro ($3/$15) | **15x cheaper** |
| **Grok** | grok-4.1-fast ($0.20/$0.50) | grok-4 ($3/$15) | **15x cheaper** |
| **Gemini** | flash-lite ($0.10/$0.40) | flash ($0.30/$2.50) | **3x cheaper** |
| **OpenAI** | gpt-4o-mini ($0.15/$0.60) | gpt-4o ($2.50/$10) | **17x cheaper** |

**Impact:** Using cheap models for appropriate queries can reduce costs by 3x-17x.

---

## Examples

### Example 1: Quick Factual Lookup
**Query:** "What is the capital of France?"

**Model Choice:** Cheap (sonar, grok-4.1-fast, flash-lite, gpt-4o-mini)

**Reasoning:** Straightforward factual answer, can retry if needed, cost matters

---

### Example 2: Complex Architecture Decision
**Query:** "Should we use microservices or monolith for this new system?"

**Model Choice:** Expensive (sonar-pro, grok-4, pro, o3)

**Reasoning:** Critical decision, complex tradeoffs, quality > cost

---

### Example 3: Budget Pressure + Important Query
**Scenario:** 90% monthly budget consumed, need to analyze security vulnerability

**Model Choice:** Expensive (critical security decision overrides budget)

**Follow-up:** Review budget allocation, identify where to cut non-critical usage

---

### Example 4: Exploratory Research
**Query:** "What are some approaches to X?"

**Model Choice:** Cheap (can upgrade if initial results insufficient)

**Reasoning:** Exploratory, can iterate, cost-conscious

---

## Remember

**The system is designed for simplicity:**
- ✅ Static defaults work well for most cases
- ✅ Override when YOU know context justifies it
- ✅ Human judgment > automated complexity
- ✅ Better information > automated decisions

**You are the intelligence in this system. The tools provide options. You decide.**

---

## Related Documentation

- Research Skill modes: `~/.claude/skills/Research/QuickReference.md`
- Budget configuration: `~/.claude/BUDGET/config.yaml`
- API research findings: `~/.claude/MEMORY/WORK/Agent-Model-Selection-Improvement/Research-Results.md`

---

**Version:** 1.0
**Status:** Initial release
**Feedback:** Track what works via Task #8 (usage pattern logging)

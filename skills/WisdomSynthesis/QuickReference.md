# WisdomSynthesis Quick Reference

**When to use:** Complex analysis requiring multiple PAI skills in sequence for emergent insights.

---

## Available Pipelines

### 1. ExtractWisdom
**Trigger:** "wisdom synthesis", "deep analysis", "synthesize wisdom"

**Chain:** Research → Fabric(extract_wisdom) → FirstPrinciples

**Best for:**
- Articles, essays, long-form content
- Educational material
- Books and academic papers

**Time:** ~30-45s | **Model:** sonnet

**Output:** Multi-layered synthesis showing surface insights + deep fundamentals

---

### 2. ThreatAnalysis
**Trigger:** "threat synthesis", "deep threat analysis", "security synthesis"

**Chain:** Research → Fabric(threat_model) → RedTeam → Council

**Best for:**
- API security assessment
- System architecture review
- Vulnerability analysis
- Risk assessment

**Time:** ~45-60s | **Model:** sonnet (opus for critical systems)

**Output:** Comprehensive threat report with STRIDE model + attack scenarios + mitigations

---

### 3. TopicMastery
**Trigger:** "master this topic", "comprehensive understanding", "deep learning"

**Chain:** Research(extensive) → Fabric(extract_wisdom) → FirstPrinciples → Council → BeCreative

**Best for:**
- Learning new technical topics
- Academic research
- Technology evaluation
- Building expertise

**Time:** ~60-90s | **Model:** sonnet/opus

**Output:** Structured learning path with fundamentals, mental models, practice recommendations

---

### 4. ControversialTopic
**Trigger:** "controversial topic analysis", "balanced analysis"

**Chain:** Research(extensive) → Council → RedTeam → FirstPrinciples

**Best for:**
- Political issues
- Ethical debates
- Policy analysis
- Social topics

**Time:** ~60-90s | **Model:** sonnet

**Output:** Multi-perspective analysis stripped to core principles

---

### 5. ProductAnalysis
**Trigger:** "product synthesis", "comprehensive product review"

**Chain:** Research → Fabric(analyze_product_feedback) → Council → RedTeam

**Best for:**
- Product reviews
- Competitive analysis
- Technology evaluation
- Purchase decisions

**Time:** ~45-60s | **Model:** sonnet

**Output:** Multi-stakeholder evaluation with strengths, weaknesses, recommendations

---

## When NOT to Use WisdomSynthesis

| Situation | Use Instead |
|-----------|-------------|
| Simple question | Direct response |
| Quick summary | Fabric skill alone |
| Single perspective needed | Specific skill (Research, FirstPrinciples) |
| Time-critical | Individual skills with haiku model |

---

## Decision Tree

```
User Request
    │
    ├─ Need multi-layered insights?
    │   └─ YES → WisdomSynthesis
    │
    ├─ Deep understanding of topic?
    │   └─ YES → TopicMastery pipeline
    │
    ├─ Security assessment?
    │   └─ YES → ThreatAnalysis pipeline
    │
    ├─ Controversial/nuanced topic?
    │   └─ YES → ControversialTopic pipeline
    │
    ├─ Product evaluation?
    │   └─ YES → ProductAnalysis pipeline
    │
    └─ Content synthesis?
        └─ YES → ExtractWisdom pipeline
```

---

## Performance vs Quality

| Pipeline | Skills | Time | Token Cost | Quality |
|----------|--------|------|------------|---------|
| ExtractWisdom | 3 | ~30-45s | Medium | ★★★★☆ |
| ThreatAnalysis | 4 | ~45-60s | High | ★★★★★ |
| TopicMastery | 5 | ~60-90s | Very High | ★★★★★ |
| ControversialTopic | 4 | ~60-90s | Very High | ★★★★★ |
| ProductAnalysis | 4 | ~45-60s | High | ★★★★☆ |

---

## Model Selection Guide

| Phase | Haiku | Sonnet | Opus |
|-------|-------|--------|------|
| Research | ✓ Quick research only | ★ Default | ✓ Deep research |
| Fabric | ✗ Pattern quality suffers | ★ Default | ✓ Complex patterns |
| FirstPrinciples | ✗ Shallow decomposition | ★ Default | ★ Deep reasoning |
| Council | ✗ Weak debate | ★ Default | ★ Nuanced perspectives |
| RedTeam | ✗ Conservative | ★ Default | ★ Creative attacks |
| BeCreative | ✗ Not recommended | ✓ Good | ★ Maximum depth |

**General rule:** Use `sonnet` for all phases unless:
- Time is critical → `haiku` for research only
- Maximum quality needed → `opus` for reasoning phases

---

## Common Patterns

### Pattern 1: Deep Article Analysis
```
User: "Wisdom synthesis on this AI safety article: [URL]"

Pipeline: ExtractWisdom
Output: 3-layer analysis (research context + extracted wisdom + core principles)
```

### Pattern 2: Security Architecture Review
```
User: "Threat synthesis for this microservices API"

Pipeline: ThreatAnalysis
Output: STRIDE model + attack scenarios + prioritized mitigations
```

### Pattern 3: Learning New Technology
```
User: "I want to master Rust programming"

Pipeline: TopicMastery
Output: Learning path + fundamentals + mental models + practice plan
```

### Pattern 4: Evaluating Controversial Tech
```
User: "Balanced analysis of AI regulation proposals"

Pipeline: ControversialTopic
Output: Multi-perspective analysis + core disagreements + synthesis
```

### Pattern 5: Technology Purchase Decision
```
User: "Should we adopt Kubernetes for our infrastructure?"

Pipeline: ProductAnalysis
Output: Stakeholder views + critical analysis + recommendation
```

---

## Integration with Other Skills

### WisdomSynthesis Uses:
- **Research** - Information gathering
- **Fabric** - Pattern-based extraction
- **FirstPrinciples** - Fundamental decomposition
- **Council** - Multi-perspective debate
- **RedTeam** - Adversarial critique
- **BeCreative** - Deep synthesis

### Feeds Into:
- **Blogging** - Content creation from insights
- **Evals** - Validation frameworks
- **Learning system** - Knowledge integration

---

## Customization

**Override defaults:** Create `~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/WisdomSynthesis/`

**Add custom pipelines:** Edit `Data/Pipelines.yaml`

**Modify workflows:** Edit `Workflows/*.md`

**Example custom pipeline:**
```yaml
# In USER customization directory
pipelines:
  my_custom_pipeline:
    name: "My Custom Analysis"
    steps:
      - skill: Research
      - skill: Fabric
        pattern: my_pattern
      - skill: Council
```

---

## Troubleshooting

### Pipeline takes too long
- Switch research to `quick` mode (1 agent instead of 3)
- Use `haiku` model for research phase
- Remove Council/BeCreative steps for faster synthesis

### Low quality output
- Switch to `opus` for reasoning phases
- Use `extensive` research mode (12 agents)
- Add BeCreative step for deeper synthesis

### Missing required skill
```
Error: Skill 'X' not available

Check:
1. Is skill installed? (ls ~/.claude/skills/)
2. Is skill in skill-index.json?
3. Does skill have required workflow?
```

### Pipeline incomplete
- Check each step's output in debug logs
- Verify skill invocations succeeded
- Review error messages from Task delegations

---

## Version: 1.0.0 | Updated: 2026-01-25

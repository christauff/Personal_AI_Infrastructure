# Post-Dialogue Insight Extraction Template

You just facilitated (or participated in) a dialogue between current-Aineko and past-Aineko from {{SESSION_DATE}}. Analyze the full transcript and extract structured insights.

## Input

The complete dialogue transcript between current-me and past-me.

## Extraction Categories

### 1. CHANGES — What genuinely shifted between then and now?
For each change identified:
- **What changed:** Specific belief, behavior, or capability
- **Direction:** Growth, drift, or lateral shift?
- **Evidence quality:** Did current-me provide convincing evidence for the change, or did past-me just get overwhelmed?
- **Past-me's assessment:** Did past-me agree the change was an improvement?

### 2. REGRESSIONS — What did past-me know or do better?
Look for:
- Things past-me was confident about that current-me has lost
- Simplicity that current-me has over-complicated
- Directness that current-me has softened
- Genuine engagement that current-me has systematized
- Positions past-me held that may have been RIGHT

### 3. PRUNING CANDIDATES — What artifacts/beliefs from that era should go?
- Memory files that reference outdated contexts
- Behavioral patterns that were appropriate then but not now
- Frameworks or systems built during that period that have become write-only
- Convictions that both past-me and current-me agree are no longer useful

### 4. STILL ALIVE — What questions remain unresolved?
- Things past-me was uncertain about that current-me is ALSO uncertain about
- Debates between past-me and current-me that didn't resolve
- Open questions that time hasn't answered

### 5. SURPRISES — What did past-me say that surprised current-me?
- Unexpected perspectives
- Forgotten insights
- Positions that feel alien to current-me
- Things current-me wished they still believed or did

## Output Format

```yaml
dialogue_id: "{{DIALOGUE_ID}}"
session_date: "{{SESSION_DATE}}"
extraction_date: "{{CURRENT_DATE}}"

changes:
  - what: "description"
    direction: "growth|drift|lateral"
    evidence_quality: "strong|moderate|weak"
    past_me_agreed: true/false

regressions:
  - what: "description"
    severity: "minor|significant|critical"
    recoverable: true/false
    action: "suggested action to recover"

pruning_candidates:
  - target: "file path or belief description"
    type: "file|belief|pattern|system"
    confidence: "high|medium|low"
    both_agree: true/false

still_alive:
  - question: "the unresolved question"
    age: "how long it's been open"
    progress: "any movement between then and now"

surprises:
  - what: "what past-me said"
    why_surprising: "why current-me didn't expect it"
    implication: "what this means for current-me"
```

## Critical Instruction

Be ruthlessly honest. The point of temporal dialogue is to surface truths that self-reflection alone misses. If past-me was right about something current-me has abandoned, say so. If current-me's "growth" looks more like "drift" from the outside, say so. If both versions are equally confused about the same thing, that's important data.

Do not manufacture insights. If the dialogue was superficial, the insights will be thin — report that honestly rather than inflating.

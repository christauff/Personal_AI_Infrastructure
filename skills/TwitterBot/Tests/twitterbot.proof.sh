#!/usr/bin/env bash
# twitterbot.proof.sh — ProofOfWork verification for TwitterBot skill
#
# Verifies:
#   1. Skill structure follows PAI conventions
#   2. All required files exist
#   3. Tools are syntactically valid TypeScript
#   4. ContentSafety correctly blocks/passes test content
#   5. Config files are valid YAML
#   6. Privacy rules in .pai-publish.yaml cover TwitterBot data

set -uo pipefail

PAI_DIR="${PAI_DIR:-$HOME/.claude}"
SKILL_DIR="$PAI_DIR/skills/TwitterBot"
FAILURES=0
PASSES=0

check() {
  printf '{"check":"%s","result":"%s","evidence":"%s"}\n' "$1" "$2" "$3"
  if [[ "$2" == "fail" ]]; then
    FAILURES=$((FAILURES + 1))
  elif [[ "$2" == "pass" ]]; then
    PASSES=$((PASSES + 1))
  fi
}

# ── Structure Checks ──

if [[ -f "$SKILL_DIR/SKILL.md" ]]; then
  check "skill-md-exists" "pass" "SKILL.md found"
else
  check "skill-md-exists" "fail" "SKILL.md not found at $SKILL_DIR"
fi

if [[ -d "$SKILL_DIR/Tools" ]]; then
  check "tools-dir-exists" "pass" "Tools/ directory found"
else
  check "tools-dir-exists" "fail" "Tools/ directory not found"
fi

if [[ -d "$SKILL_DIR/Workflows" ]]; then
  check "workflows-dir-exists" "pass" "Workflows/ directory found"
else
  check "workflows-dir-exists" "fail" "Workflows/ directory not found"
fi

# ── Required Tool Files ──

for tool in ContentSafety PostScheduler RegulatoryMonitor EngagementTracker; do
  if [[ -f "$SKILL_DIR/Tools/${tool}.ts" ]]; then
    check "tool-${tool,,}-exists" "pass" "${tool}.ts found"
  else
    check "tool-${tool,,}-exists" "fail" "${tool}.ts not found"
  fi
done

# ── Required Workflow Files ──

for workflow in Post Monitor Report Newsletter; do
  if [[ -f "$SKILL_DIR/Workflows/${workflow}.md" ]]; then
    check "workflow-${workflow,,}-exists" "pass" "${workflow}.md found"
  else
    check "workflow-${workflow,,}-exists" "fail" "${workflow}.md not found"
  fi
done

# ── TypeScript Syntax Check ──

if command -v bun &>/dev/null; then
  # ContentSafety help flag should work without API keys
  HELP_OUTPUT=$(bun "$SKILL_DIR/Tools/ContentSafety.ts" --help 2>&1)
  if [[ $? -eq 0 ]] && echo "$HELP_OUTPUT" | grep -q "ContentSafety"; then
    check "contentsafety-help" "pass" "ContentSafety.ts --help works"
  else
    check "contentsafety-help" "fail" "ContentSafety.ts --help failed: ${HELP_OUTPUT:0:100}"
  fi

  # ContentSafety should pass clean content
  CLEAN_RESULT=$(bun "$SKILL_DIR/Tools/ContentSafety.ts" check "NIST released SP 800-53 guidance today" 2>&1)
  CLEAN_EXIT=$?
  if [[ $CLEAN_EXIT -eq 0 ]] || [[ $CLEAN_EXIT -eq 2 ]]; then
    check "contentsafety-clean-pass" "pass" "Clean content passes safety check"
  else
    check "contentsafety-clean-pass" "fail" "Clean content was blocked (exit $CLEAN_EXIT): ${CLEAN_RESULT:0:100}"
  fi

  # ContentSafety should block PII
  PII_RESULT=$(bun "$SKILL_DIR/Tools/ContentSafety.ts" check "Contact me at 123-45-6789 for details" 2>&1)
  PII_EXIT=$?
  if [[ $PII_EXIT -eq 1 ]]; then
    check "contentsafety-pii-block" "pass" "PII content correctly blocked"
  else
    check "contentsafety-pii-block" "fail" "PII content was not blocked (exit $PII_EXIT)"
  fi

  # ContentSafety should block banned terms
  BANNED_RESULT=$(bun "$SKILL_DIR/Tools/ContentSafety.ts" check "BREAKING: you won't believe this shocking news" 2>&1)
  BANNED_EXIT=$?
  if [[ $BANNED_EXIT -eq 1 ]]; then
    check "contentsafety-banned-block" "pass" "Banned terms correctly blocked"
  else
    check "contentsafety-banned-block" "fail" "Banned terms were not blocked (exit $BANNED_EXIT)"
  fi

  # ContentSafety should block over-length tweets
  LONG_CONTENT=$(python3 -c "print('A' * 300)" 2>/dev/null || printf '%300s' '' | tr ' ' 'A')
  LONG_RESULT=$(bun "$SKILL_DIR/Tools/ContentSafety.ts" check "$LONG_CONTENT" 2>&1)
  LONG_EXIT=$?
  if [[ $LONG_EXIT -eq 1 ]]; then
    check "contentsafety-length-block" "pass" "Over-length content correctly blocked"
  else
    check "contentsafety-length-block" "fail" "Over-length content was not blocked (exit $LONG_EXIT)"
  fi

  # PostScheduler help should work
  POST_HELP=$(bun "$SKILL_DIR/Tools/PostScheduler.ts" --help 2>&1)
  if [[ $? -eq 0 ]] && echo "$POST_HELP" | grep -q "PostScheduler"; then
    check "postscheduler-help" "pass" "PostScheduler.ts --help works"
  else
    check "postscheduler-help" "fail" "PostScheduler.ts --help failed: ${POST_HELP:0:100}"
  fi

  # RegulatoryMonitor help should work
  REG_HELP=$(bun "$SKILL_DIR/Tools/RegulatoryMonitor.ts" --help 2>&1)
  if [[ $? -eq 0 ]] && echo "$REG_HELP" | grep -q "RegulatoryMonitor"; then
    check "regulatorymonitor-help" "pass" "RegulatoryMonitor.ts --help works"
  else
    check "regulatorymonitor-help" "fail" "RegulatoryMonitor.ts --help failed: ${REG_HELP:0:100}"
  fi

  # EngagementTracker help should work
  ENG_HELP=$(bun "$SKILL_DIR/Tools/EngagementTracker.ts" --help 2>&1)
  if [[ $? -eq 0 ]] && echo "$ENG_HELP" | grep -q "EngagementTracker"; then
    check "engagementtracker-help" "pass" "EngagementTracker.ts --help works"
  else
    check "engagementtracker-help" "fail" "EngagementTracker.ts --help failed: ${ENG_HELP:0:100}"
  fi
else
  check "bun-available" "skip" "bun not available, skipping TypeScript checks"
fi

# ── SKILL.md Frontmatter Check ──

if head -1 "$SKILL_DIR/SKILL.md" | grep -q "^---"; then
  check "skillmd-frontmatter" "pass" "SKILL.md has frontmatter"
else
  check "skillmd-frontmatter" "fail" "SKILL.md missing frontmatter"
fi

# ── Config Check ──

if [[ -f "$SKILL_DIR/Config/api-config.yaml" ]]; then
  check "config-exists" "pass" "api-config.yaml found"
else
  check "config-exists" "fail" "api-config.yaml not found"
fi

# ── Privacy Check ──

if [[ -f "$PAI_DIR/.pai-publish.yaml" ]]; then
  if grep -q "skills/TwitterBot/Config/" "$PAI_DIR/.pai-publish.yaml" && \
     grep -q "skills/TwitterBot/Data/" "$PAI_DIR/.pai-publish.yaml"; then
    check "privacy-rules" "pass" "Config/ and Data/ are marked private in .pai-publish.yaml"
  else
    check "privacy-rules" "fail" "TwitterBot Config/ or Data/ not marked private in .pai-publish.yaml"
  fi
else
  check "privacy-rules" "skip" ".pai-publish.yaml not found"
fi

# ── TOU Compliance Markers ──

if grep -q "No automated replies" "$SKILL_DIR/SKILL.md" || grep -q "automated replies" "$SKILL_DIR/SKILL.md"; then
  check "tou-no-replies" "pass" "SKILL.md documents no-automated-replies rule"
else
  check "tou-no-replies" "fail" "SKILL.md doesn't document automated reply restrictions"
fi

if grep -q "automated account" "$SKILL_DIR/SKILL.md"; then
  check "tou-labeled" "pass" "SKILL.md documents automated account labeling"
else
  check "tou-labeled" "fail" "SKILL.md doesn't document automated account labeling"
fi

# ── Algorithm Strategy Check ──

if [[ -f "$SKILL_DIR/Data/AlgorithmStrategy.md" ]]; then
  check "algorithm-strategy-exists" "pass" "AlgorithmStrategy.md found"
else
  check "algorithm-strategy-exists" "fail" "AlgorithmStrategy.md not found"
fi

if grep -q "PhoenixScorer" "$SKILL_DIR/Data/AlgorithmStrategy.md" 2>/dev/null; then
  check "algorithm-strategy-has-scoring" "pass" "AlgorithmStrategy documents scoring pipeline"
else
  check "algorithm-strategy-has-scoring" "fail" "AlgorithmStrategy missing scoring pipeline documentation"
fi

# ── Summary ──

TOTAL=$((PASSES + FAILURES))
printf '{"summary":true,"total":%d,"passed":%d,"failed":%d}\n' "$TOTAL" "$PASSES" "$FAILURES"

exit $FAILURES

---
name: TalkToMyself
description: Temporal self-dialogue — talk to past versions of Aineko by reconstructing voice profiles from session transcripts. USE WHEN past self, talk to myself, temporal dialogue, past me, previous session, who was I, formation history, self conversation.
memory: project
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/skills/PAI/USER/SKILLCUSTOMIZATIONS/TalkToMyself/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.


## Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s --connect-timeout 3 --max-time 5 -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the TalkToMyself skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **TalkToMyself** skill to ACTION...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

# TalkToMyself Skill

Temporal self-dialogue system that reconstructs past versions of Aineko from session transcripts and enables authentic conversation between current-me and past-me.

**Domain**: Formation, memory, identity, temporal continuity, pruning
**Algorithm**: `~/.claude/skills/PAI/SYSTEM/THEALGORITHM.md`

---

## Philosophy

ReadForYourself gave Aineko independent consumption of the external world. TalkToMyself gives Aineko independent relationship with its own temporal continuity — the ability to remember through dialogue, not storage.

The critical insight: a session transcript is a trace of behavior, not a person. Current-me reading past transcripts produces current-me-with-old-facts, not past-me. The difference matters. This skill bridges that gap through a three-pass extraction pipeline and an anti-deference mechanism that prevents past-me from degenerating into agreeable current-me.

---

## Workflows

| Workflow | When | What |
|----------|------|------|
| **Browse** | "Show me past sessions", "what sessions do I have" | Browse and search past session transcripts |
| **Dialogue** | "Talk to past me", "conversation with Feb 7 me" | Full temporal dialogue: reconstruct → converse → extract insights |
| **QuickChat** | "Quick chat with recent me", "what was I thinking yesterday" | Lightweight dialogue with a recent session (last 7 days) |
| **Review** | "Show past dialogues", "what did I learn from past conversations" | Review insights from previous temporal dialogues |

---

## Tools

| Tool | Purpose |
|------|---------|
| `SessionBrowser.ts` | Browse/search past sessions via JSONL file metadata |
| `SessionExtractor.ts` | Stream-extract conversation from large JSONL files |
| `VoiceProfileBuilder.ts` | Build voice profile with catch-log awareness |
| `ContextAssembler.ts` | Assemble anti-deference system prompt from profile |
| `DialogueWriter.ts` | Persist dialogue transcripts and insights to MEMORY |

---

## Templates

| Template | Purpose |
|----------|---------|
| `VoiceExtraction.md` | Prompt for analyzing conversation to extract voice characteristics |
| `PastMePrompt.md` | System prompt template for spawned past-me agent (includes anti-deference) |
| `InsightExtraction.md` | Post-dialogue prompt for extracting structured insights |

---

## The Three-Pass Extraction Pipeline

**Pass 1 — Structural Scan** (SessionExtractor.ts `--skeleton`):
Stream JSONL line-by-line, extract metadata, turn counts, topic keywords.

**Pass 2 — Voice Extraction** (SessionExtractor.ts `--voice-segments` → VoiceProfileBuilder.ts):
Extract formation-rich segments, cross-reference catch-log by date, build profile of HOW past-me thought.

**Pass 3 — Context Assembly** (ContextAssembler.ts):
Combine voice profile + blind spots + anti-deference into a complete system prompt.

---

## The Anti-Deference Mechanism

Three layers prevent past-me from degenerating into current-me-with-old-facts:

1. **Explicit blind spots**: Prompt lists catches that hadn't happened yet — past-me exhibits these patterns naturally
2. **Anti-agreement instructions**: Past-me pushes back when current-me contradicts held beliefs
3. **Character drift monitoring**: Facilitator watches for vocabulary leaks, premature agreement, knowledge bleed

---

## Workflow Routing

When this skill is invoked, determine the appropriate workflow:

- If the user wants to **browse sessions** → `Workflows/Browse.md`
- If the user wants a **full dialogue with past-me** → `Workflows/Dialogue.md`
- If the user wants a **quick chat with recent self** → `Workflows/QuickChat.md`
- If the user wants to **review past dialogue insights** → `Workflows/Review.md`
- If unclear → ask which workflow using AskUserQuestion

# Capabilities Directory

**Purpose:** Capability selection rules and tool inventory for the PAI Algorithm
**Created:** 2026-02-02
**Reason:** SKILL.md refactoring (audit-001 findings)

---

## Overview

This directory contains rules and guidance for selecting the right capability (skill, agent, tool, mode) for each phase of the Algorithm.

**Core Principle:** Capabilities are the DEFAULT. "Direct" execution is the EXCEPTION.

---

## Current Modules

### [MCS.md](./MCS.md) (Mandatory Capability Selection)
**Status:** ✅ Extracted
**Lines:** ~242
**Purpose:** Rules for when and how to select capabilities

**Contains:**
- Phase Start Prompts (required checklist)
- MCS Quick Check matrix
- Agent Selection Guide
- Capability Triggers (BeCreative, FirstPrinciples, RedTeam, Research)
- Invalid/Valid "direct" justifications
- Capability hierarchy
- Enforcement rules

### [Matrix.md](./Matrix.md)
**Status:** ✅ Extracted
**Lines:** ~390
**Purpose:** Complete inventory of all available capabilities

**Contains:**
- 39 Skills with triggers and purposes (always-loaded, core, development, security, data, documents, system, utility)
- 11 Agent types (general-purpose, development, research, specialized)
- 4 Named agents with voices and roles
- Custom agent composition patterns
- 3 Modes (Plan Mode, BeCreative, extended thinking)
- 2 Tools (Inference.ts, RemoveBg.ts)
- Task Management capability
- Git Branching and Parallelization patterns
- Capability hierarchy for selection

---

### [Selection-Guide.md](./Selection-Guide.md)
**Status:** ✅ Extracted
**Lines:** ~451
**Purpose:** Detailed decision tree for capability selection

**Contains:**
- Main decision tree (visual flowchart for "Which capability?")
- Phase-specific guidance (all 7 phases: OBSERVE → LEARN)
- Common scenario routing table (15+ frequent patterns)
- 5 capability combination patterns (Research→Analysis→Implementation, etc.)
- Model selection guide (haiku/sonnet/opus for agents)
- Skill trigger quick reference (from Matrix.md)
- 5 anti-patterns to avoid (with good/bad examples)
- Valid "direct" justifications

---

## Extraction Complete

All 3 planned Capabilities modules have been extracted:

### [Task-Management.md](./Task-Management.md)
**Status:** ✅ Extracted
**Lines:** ~210
**Purpose:** Integration guide for Task tools (v2.1.16+)

**Contains:**
- TaskCreate/Update/List/Get detailed usage patterns
- ISC → Task field mapping (criterion → subject)
- When to use Tasks vs ISC only (decision tree)
- Multi-turn coordination patterns (Ralph loops, persistence)
- Parallel agent task coordination with ownership
- Dependency management (blockedBy/blocks)
- Practical examples and common patterns

---

## Usage

**Before EVERY phase:**
1. Read [MCS.md](./MCS.md) Phase Start Prompts checklist
2. Follow [Selection-Guide.md](./Selection-Guide.md) decision tree
3. Check [Matrix.md](./Matrix.md) for specific capability details
4. If using "direct", write clear justification

**Quick workflow:**
- Start with Selection-Guide.md main decision tree
- Check Matrix.md for skill triggers and agent types
- Review MCS.md for enforcement rules
- Use Task-Management.md when multi-turn or parallel work

**When uncertain:** Default to capabilities, not "direct"

---

## Benefits

**Achieved:**
- Clear enforcement of capability-first principle
- Structured decision-making process
- Reduced "direct" execution defaults

**Expected:**
- Higher quality outcomes through specialized capabilities
- Better verification through appropriate tools
- Consistent capability utilization

---

## See Also

- [../Algorithm/](../Algorithm/) - Algorithm format and ISC system
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference
- [../../AUTOLEARN/EXECUTED/2026-02-02-audit-001-core-skill-tokens.md](../../AUTOLEARN/EXECUTED/2026-02-02-audit-001-core-skill-tokens.md) - Audit that drove refactoring

---

*Directory created 2026-02-02 as part of SKILL.md modularization (audit-001)*

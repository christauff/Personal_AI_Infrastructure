# Algorithm Directory

**Purpose:** Modular components of the PAI Algorithm system
**Created:** 2026-02-02
**Reason:** SKILL.md refactoring (audit-001 findings)

---

## Overview

This directory contains extracted Algorithm components from the monolithic SKILL.md file. The refactoring addresses:

- **Token efficiency:** SKILL.md was ~4,685 tokens
- **Maintainability:** Single file was 571 lines, hard to navigate
- **Modularity:** Can now update individual components independently

---

## Current Modules

### [Format.md](./Format.md)
**Status:** ✅ Extracted
**Lines:** ~220
**Purpose:** Defines mandatory output format for all PAI Algorithm responses

**Contains:**
- Full format (7-phase structure)
- Minimal format (simple responses)
- OUTPUT section rules
- Phase rules and headers
- ISC table symbols and status values
- Progressive output requirements

### [ISC-System.md](./ISC-System.md)
**Status:** ✅ Extracted
**Lines:** ~180
**Purpose:** Ideal State Criteria rules and verification framework

**Contains:**
- ISC tracker format
- Criteria requirements (8 words, granular, discrete, testable)
- Anti-criteria rules
- Examples of good/bad criteria
- Task Management integration
- Algorithm Agent Startup rules

### [Examples.md](./Examples.md)
**Status:** ✅ Extracted
**Lines:** ~240
**Purpose:** Common failure modes and anti-patterns

**Contains:**
- 6 major failure modes with examples
- Format anti-patterns
- Capability selection anti-patterns
- Good pattern examples
- Valid/invalid justifications for "direct"

---

## Migration Status

**Phase 1: Extract (COMPLETE ✅)**
- [x] Create Algorithm/ directory
- [x] Extract Format.md (pilot)
- [x] Extract ISC-System.md
- [x] Extract Examples.md
- [x] Cross-link between modules
- [x] Create Capabilities/ directory with MCS.md

**Phase 2: Redirect (Next)**
- [ ] Update SKILL.md to reference modular files
- [ ] Test with existing sessions
- [ ] Validate no breakage

**Phase 3: Optimize (Future)**
- [ ] Implement selective loading
- [ ] Measure token savings
- [ ] Apply to other monolithic files

---

## Benefits

**Achieved:**
- Clear separation of concerns
- Easier to locate specific rules
- Lower cognitive load for understanding individual components

**Expected:**
- Faster updates (change only what's needed)
- Better testability (validate modules independently)
- Potential token savings (selective loading in future)

---

**See also:**
- [../SKILL.md](../SKILL.md) - Main PAI Algorithm reference (still authoritative)
- [../../AUTOLEARN/EXECUTED/2026-02-02-audit-001-core-skill-tokens.md](../../AUTOLEARN/EXECUTED/2026-02-02-audit-001-core-skill-tokens.md) - Audit report that drove this refactoring

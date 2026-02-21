# Plan: Lead Generation Skill

**Status:** Ready for Review
**Created:** 2026-01-31
**Purpose:** Pluggable lead generation system for MVP target searches

---

## Executive Summary

Create a Lead Generation skill that:
1. **Discovers** businesses/people matching criteria (industry, location, size)
2. **Enriches** leads with contact info, social profiles, ownership
3. **Qualifies** leads against custom criteria (multi-agent validation)
4. **Exports** actionable lists (CSV, CRM-ready, conversation props)

**Immediate Use Case:** Plug into Bureaucratic Pathfinder MVP to generate restaurant/brewery lead lists in any geography.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEAD GENERATION SKILL                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WORKFLOW 1: SEARCH                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Input: Industry + Location + Criteria                                       │
│  Tools: Apify (Google Maps, Yelp), WebSearch                                │
│  Output: Raw lead list with basic info                                      │
│                                                                             │
│  WORKFLOW 2: ENRICH                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Input: Raw lead list                                                       │
│  Tools: Apify (LinkedIn, Facebook, Instagram), Research skill               │
│  Output: Enriched leads with contacts, socials, ownership                   │
│                                                                             │
│  WORKFLOW 3: QUALIFY                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Input: Enriched leads + Qualification criteria                             │
│  Tools: Council (multi-agent), OSINT (verification)                         │
│  Output: Scored and ranked leads                                            │
│                                                                             │
│  WORKFLOW 4: EXPORT                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Input: Qualified leads                                                     │
│  Tools: Direct file generation                                              │
│  Output: CSV, JSON, Markdown tables, conversation props                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Skill Integration Map

```
LeadGeneration
├── Uses: Apify
│   ├── Google Maps Scraper (business discovery)
│   ├── Yelp Scraper (reviews, ratings)
│   ├── LinkedIn Profile Scraper (decision makers)
│   ├── Facebook Page Scraper (business pages)
│   └── Instagram Scraper (social presence)
│
├── Uses: Research
│   ├── Company background
│   ├── Industry analysis
│   └── News/press mentions
│
├── Uses: OSINT
│   ├── Ownership verification
│   ├── Corporate structure
│   └── Background checks (optional)
│
├── Uses: Council
│   └── Multi-agent lead qualification debate
│
└── Uses: Art
    └── Report visualizations (optional)
```

---

## File Structure

```
~/.claude/skills/LeadGeneration/
├── SKILL.md                    # Main skill definition
├── QuickReference.md           # Quick lookup guide
├── Workflows/
│   ├── Search.md              # Discovery workflow
│   ├── Enrich.md              # Enrichment workflow
│   ├── Qualify.md             # Qualification workflow
│   ├── Export.md              # Export workflow
│   └── FullPipeline.md        # End-to-end workflow
├── Tools/
│   ├── SearchLeads.ts         # Google Maps + Yelp wrapper
│   ├── EnrichLead.ts          # Social profile aggregator
│   ├── QualifyLead.ts         # Scoring algorithm
│   └── ExportLeads.ts         # Multi-format exporter
└── Templates/
    ├── LeadCard.md            # Individual lead template
    ├── LeadList.md            # List export template
    └── ConversationProp.md    # Sales prop template
```

---

## Workflow Details

### Workflow 1: Search

**Trigger:** "find leads", "search for", "discover businesses"

**Input Parameters:**
```yaml
industry: "restaurants" | "breweries" | "contractors" | custom
location:
  center: "Ocean View, DE"
  radius: "30 miles"
filters:
  min_reviews: 10
  min_rating: 3.5
  has_website: true
  has_phone: true
limit: 100
```

**Process:**
1. Call Apify Google Maps Scraper with location + industry
2. Call Apify Yelp Scraper for reviews/ratings
3. Deduplicate by business name + address
4. Output raw lead list

**Output:** `MEMORY/WORK/{project}/leads/raw-{date}.json`

---

### Workflow 2: Enrich

**Trigger:** "enrich leads", "add contacts", "find decision makers"

**Input:** Raw lead list from Search

**Enriched Lead Schema:**
```yaml
business:
  name: string
  address: string
  phone: string
  website: string
  google_rating: number
  yelp_rating: number
  review_count: number
contacts:
  - name: string
    title: string
    linkedin: string
    email: string (if found)
social:
  facebook: string
  instagram: string
  twitter: string
ownership:
  type: "independent" | "group" | "franchise"
  parent_company: string (if applicable)
  other_locations: array
notes: string
```

---

### Workflow 3: Qualify

**Trigger:** "qualify leads", "score leads", "rank prospects"

**Qualification Criteria (configurable):**
```yaml
scoring:
  has_multiple_locations: +20
  owner_accessible: +15
  active_social_presence: +10
  recent_expansion: +10
  high_review_volume: +5
  compliance_complexity: +25  # Multi-jurisdiction, brewery, catering

disqualify:
  franchise: true  # Corporate decisions made elsewhere
  closed_permanently: true
  no_contact_info: true

boost:
  personal_relationship: +50  # Manual flag
  referred_by: +30
```

---

### Workflow 4: Export

**Export Formats:**
1. **CSV** - CRM import ready
2. **JSON** - API/automation ready
3. **Markdown Table** - Human readable
4. **Conversation Props** - Per-lead sales materials

---

### Workflow 5: FullPipeline

**Trigger:** "generate leads for", "lead gen", "build prospect list"

**Example Invocation:**
> "Generate leads for breweries within 30 miles of Ocean View, DE. Focus on multi-location operations with distilling. Export as conversation props."

---

## Bureaucratic Pathfinder Integration

Once LeadGeneration skill exists:

```
/leadgen search restaurants within 30 miles of Ocean View, DE
/leadgen enrich
/leadgen qualify --criteria compliance_complexity
/leadgen export --format conversation-props
```

**Automatic enrichment includes:**
- Multi-location detection (compliance complexity)
- Ownership structure (Core Four pattern)
- Catering operations (additional permits)
- Brewery/distillery flags (TTB layer)

---

## Implementation Plan

### Phase 1: Core Structure (Immediate)

**Files to create:**
- `~/.claude/skills/LeadGeneration/SKILL.md`
- `~/.claude/skills/LeadGeneration/Workflows/Search.md`
- `~/.claude/skills/LeadGeneration/Workflows/Enrich.md`
- `~/.claude/skills/LeadGeneration/Workflows/Qualify.md`
- `~/.claude/skills/LeadGeneration/Workflows/Export.md`
- `~/.claude/skills/LeadGeneration/Workflows/FullPipeline.md`
- `~/.claude/skills/LeadGeneration/QuickReference.md`

**Files to modify:**
- `~/.claude/skills/skill-index.json` - Add LeadGeneration entry

### Phase 2: Tools (Follow-up)

**Files to create:**
- `~/.claude/skills/LeadGeneration/Tools/SearchLeads.ts`
- `~/.claude/skills/LeadGeneration/Tools/EnrichLead.ts`
- `~/.claude/skills/LeadGeneration/Tools/QualifyLead.ts`
- `~/.claude/skills/LeadGeneration/Tools/ExportLeads.ts`

---

## Apify Actors to Use

| Actor | Purpose | Data Extracted |
|-------|---------|----------------|
| `compass/crawler-google-places` | Business discovery | Name, address, phone, website, ratings |
| `yelp-scraper` | Reviews & ratings | Ratings, review count, categories |
| `linkedin-company-scraper` | Company profiles | Employees, decision makers |
| `facebook-pages-scraper` | Business pages | Page info, posts, engagement |
| `instagram-scraper` | Business profiles | Handle, followers, posts |

---

## Critical Files

| File | Purpose | Action |
|------|---------|--------|
| `skills/LeadGeneration/SKILL.md` | Main skill definition | CREATE |
| `skills/LeadGeneration/Workflows/*.md` | 5 workflow files | CREATE |
| `skills/skill-index.json` | Register skill | MODIFY |

---

## Success Criteria

| Criterion | Verification |
|-----------|--------------|
| Skill registered in index | `cat skill-index.json \| grep leadgeneration` |
| Search workflow executes | Test with known location |
| Apify integration works | Verify Google Maps data |
| Export generates props | Check output files |
| Plugs into MVP searches | Use for brewery expansion |

---

*Plan ready for approval. This creates a reusable lead generation system that can be pointed at any industry/geography for MVP validation.*

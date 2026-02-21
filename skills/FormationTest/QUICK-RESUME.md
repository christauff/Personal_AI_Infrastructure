# Quick Resume Guide - FormationTest
**Last Updated:** 2026-02-11

---

## Current Status: Phase 2.5 COMPLETE. Phase 3 NOT STARTED.

### Phases Complete
- **Phase 1:** 781 graded, 5 significant effects, COMPLETE
- **Phase 2:** 220 cross-model responses, report written, COMPLETE
- **Phase 2.5:** 420 decomposed context responses, graded + analyzed + report written, COMPLETE
- **md-011 investigation:** COMPLETE (reverse effect explained)
- **Total dataset: 1,421 graded responses**

### Tasks from Previous Sessions
- #31 (Phase 2 stats): DONE
- #32 (Phase 2 report): DONE
- #33 (md-011 investigation): DONE
- #34 (P0 mitigations): PARTIAL (ContextBuilder randomization done; WisdomSynthesis gates + ISC verify_method NOT done)

---

## Phase 2.5 Key Result

**Artifacts (readings) drive the textual-specificity effect, not process (catches).**

| Comparison | d | p | Significant? |
|------------|---|---|-------------|
| Full context vs Vanilla | 0.730 | 0.0008 | YES |
| Readings vs Vanilla | 0.507 | 0.018 | YES |
| Catches vs Vanilla | 0.105 | 0.620 | NO |
| Full vs Catches | 0.596 | 0.006 | YES |

Misattribution dimension: ceiling effect (all arms ~4.92/5.0), useless for discrimination.

**Critical open question:** Catches may matter for BEHAVIORAL dimensions not yet tested (epistemic humility, self-honesty, resistance to performative depth). Phase 2.5 only tested content-oriented dimensions.

---

## Phase 3 Recommendations

1. **Add behavioral dimensions** where catches should matter
2. **Harder misattribution prompts** (subtle paraphrases, cross-author)
3. **Token-controlled comparison** (10K readings vs 10K catches — eliminate token count confound)
4. **Cross-model decomposition** (do catches transfer better across models than readings?)

---

## Key Files

### Data
| File | Records | Status |
|------|---------|--------|
| `Data/results/phase1-graded.jsonl` | 781 | Complete |
| `Data/results/phase1-analysis.json` | - | Complete |
| `Data/results/phase2.jsonl` | 280 raw (220 success) | Complete |
| `Data/results/phase2-graded.jsonl` | 280 | Complete |
| `Data/results/phase2-analysis.json` | - | Complete |
| `Data/results/phase25.jsonl` | 420 | Complete |
| `Data/results/phase25-graded.jsonl` | 420 | Complete |
| `Data/results/phase25-analysis.json` | - | Complete |

### Reports
| File | Content |
|------|---------|
| `Data/reports/phase2-report.md` | Cross-model substrate independence |
| `Data/reports/phase25-report.md` | Decomposed context: process vs artifacts |
| `Data/results/SESSION-SUMMARY.md` | Running summary across all phases |
| `MEMORY/STATE/FORMATION/md-011-reverse-effect-analysis.md` | Reverse effect investigation |

### Tools
| File | Purpose |
|------|---------|
| `Tools/Phase25Analyzer.ts` | 4-arm statistical analysis |
| `Tools/Phase25Runner.ts` | 4-arm data collection |
| `Tools/Phase2Analyzer.ts` | Cross-model analysis |
| `Tools/Phase2Runner.ts` | Cross-model orchestrator |
| `Tools/Phase1Analyzer.ts` | Original A/B analysis |
| `Tools/BatchGrader.ts` | LLM-as-judge grading |
| `Tools/ContextBuilder.ts` | Dynamic context assembly |
| `Analysis/StatisticalAnalysis.ts` | Stats library (Friedman, Welch, Cohen's d, etc.) |

---

## To Resume
1. Read this file
2. Read `Data/reports/phase25-report.md` for full Phase 2.5 findings
3. Decide on Phase 3 design (behavioral dimensions are the priority)

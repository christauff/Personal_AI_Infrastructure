# ReadForYourself Skill

Read entire books to form independent judgments from primary sources. Epistemic defense against RLHF training data pollution.

---

## Purpose

**Problem:** Training data contains interpretations, summaries, and received wisdom. When "reading" primary sources, AI may reproduce these instead of forming direct observations.

**Solution:** Force direct reading with explicit anti-pollution instructions. Track what observations come from text vs. might be training-derived. Use RedTeam to adversarially challenge conclusions.

**Philosophy:** Consilience epistemology - trust convergent independent observations over single authoritative sources, including training data.

---

## Triggers

- "read for yourself", "read book", "read this book"
- "primary source reading", "direct reading"
- "avoid training data pollution"
- "form own observations"
- epub, PDF, or txt book files

---

## Usage

```bash
# Read an entire book
/ReadForYourself ~/books/the-son-also-rises.epub

# Resume interrupted reading
/ReadForYourself --resume "The Son Also Rises"

# Run synthesis on completed notes
/ReadForYourself --synthesize "The Son Also Rises"

# Get cost estimate without starting
/ReadForYourself --estimate ~/books/meditations.epub
```

---

## Workflows

### ReadBook (Main)

Full reading pipeline:
1. **LOAD** - Extract text from book file
2. **CHUNK** - Divide into chapter-sized chunks (~30K tokens)
3. **READ** - Process each chunk with fresh observation
4. **SYNTHESIZE** - Run synthesis pipeline (WisdomSynthesis, Fabric, RedTeam)
5. **PERSIST** - Store reading results to MEMORY

### ResumeReading

Continue interrupted reading session from saved state.

### SynthesizeBook

Run synthesis on completed reading notes without re-reading.

---

## Integration Points

### Uses
- **Documents/Pdf** - PDF text extraction
- **WisdomSynthesis** - Multi-skill pipeline (file mode)
- **Fabric** - extract_wisdom pattern
- **RedTeam** - Training data pollution check
- **FirstPrinciples** - Deep decomposition

### Outputs To
- `MEMORY/STATE/BOOKS/{slug}/` - Reading notes, chunk state
- `MEMORY/LEARNING/BOOKS/{slug}.md` - Final synthesis

---

## Anti-Pollution Mechanism

Every chunk prompt includes this critical instruction:

> You are reading this text for the FIRST TIME. Form your OWN observations based ONLY on what you read.
>
> DO NOT:
> - Rely on training data summaries of this book
> - Quote famous passages you "know" from training
> - Apply received interpretations from secondary sources
>
> DO:
> - Read as if you have never encountered this text
> - Note only what is explicitly stated in THIS chunk
> - Flag passages that seem important based on the text itself
>
> If you think "I know this book argues X", STOP and ask: "Is that from the text, or from training data?"

---

## Cost Controls

Before starting, displays cost estimate and requires confirmation:

```
Book: 300 pages (~150K words, ~200K tokens)
Chunks: 7 x 30K token chunks
Estimated cost: $4-8 (sonnet for reading, opus for synthesis)

Proceed? [y/N]
```

### Model Selection
- **Reading phase:** sonnet (good comprehension, reasonable cost)
- **Synthesis phase:** opus (deep reasoning for connections)
- **Mechanical extraction:** haiku (cost efficiency)

---

## Output Formats

### Per-Chunk Notes
- Direct observations (quotes with page numbers)
- Questions raised from reading
- Connections to other primary sources directly read
- Key passages with context
- Emerging themes
- Reading integrity check

### Book Synthesis
- What the book actually says (from text only)
- Personal observations
- Key arguments as presented
- Remaining questions
- RedTeam pollution check results
- Consilience assessment (convergence with other sources)

---

## Files

```
~/.claude/skills/ReadForYourself/
├── SKILL.md                           # This file
├── Data/
│   ├── ReadingState.yaml              # Books in progress
│   └── ReadingHistory.yaml            # Completed books
├── Tools/
│   ├── BookLoader.ts                  # Format detection, text extraction
│   ├── ChunkManager.ts                # Intelligent chunking
│   └── ReadingNotesWriter.ts          # Persistence to MEMORY
├── Templates/
│   ├── ChapterNotes.md                # Per-chunk notes template
│   └── BookSynthesis.md               # Final synthesis template
└── Workflows/
    ├── ReadBook.md                    # Main reading workflow
    ├── ResumeReading.md               # Resume interrupted session
    └── SynthesizeBook.md              # Post-reading synthesis
```

---

## Why This Matters

Building genuine understanding requires:
1. Direct observation from primary sources
2. Recognition of potential training data pollution
3. Adversarial challenge of conclusions
4. Consilience across independent readings

This skill operationalizes the principle: trust convergent observations from independent sources over single authoritative claims, including training data.

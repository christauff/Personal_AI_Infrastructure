# ReadBook Workflow

Read an entire book to form independent observations from the primary source.

---

## Trigger

```
/ReadForYourself <book-path>
/ReadForYourself ~/books/the-republic.epub
```

---

## Prerequisites

- Book file exists (epub, PDF, or txt format)
- For epub: `ebook-convert` installed (Calibre)
- For PDF: `pdftotext` installed (poppler-utils)

---

## Workflow Steps

### 1. LOAD - Extract and Analyze Book

```bash
# Get book info and chunk analysis
bun ~/.claude/skills/ReadForYourself/Tools/ChunkManager.ts "$BOOK_PATH" --info
```

Output includes:
- Title, author, slug
- Total chunks and tokens
- **Cost estimate** (critical for user decision)

### 2. COST CONFIRMATION

**CRITICAL:** Before proceeding, present cost estimate and get explicit approval.

Display to user:
```
📚 Book: {title} by {author}
📊 Analysis:
   - Total chunks: {n}
   - Estimated tokens: {tokens}
   - Estimated cost: {cost}

Reading will use:
   - Sonnet for chunk processing
   - Opus for synthesis
   - RedTeam for pollution check

Proceed with reading? [y/N]
```

If user declines, stop here.

### 3. INITIALIZE - Set Up Notes Structure

```bash
bun ~/.claude/skills/ReadForYourself/Tools/ReadingNotesWriter.ts init "{slug}" \
  --title "{title}" \
  --author "{author}" \
  --source "{book_path}" \
  --format "{format}" \
  --chunks {n} \
  --tokens {tokens} \
  --cost "{cost}"
```

### 4. READ - Process Each Chunk

For each chunk (0 to n-1):

#### 4a. Extract Chunk Content

```bash
bun ~/.claude/skills/ReadForYourself/Tools/ChunkManager.ts "$BOOK_PATH" --chunk {i}
```

#### 4b. Process with Anti-Pollution Prompt

**CRITICAL INSTRUCTION TO INCLUDE IN EVERY CHUNK PROMPT:**

```markdown
## READING INSTRUCTIONS - EPISTEMIC HYGIENE

You are reading this text for the FIRST TIME. Your task is to form your OWN observations based ONLY on what you read in this text.

### DO NOT:
- Rely on training data summaries of this book
- Quote famous passages you "know" from training
- Apply received interpretations from secondary sources
- Assume you know what the author will argue
- Reference common wisdom about this text
- Use phrases like "as is well known" or "famously argues"

### DO:
- Read as if you have never encountered this text before
- Note only what is explicitly stated in THIS chunk
- Record your own observations and questions
- Flag passages that seem important based on the text itself
- Note connections to other primary sources you have DIRECTLY READ
- Express uncertainty when uncertain

### POLLUTION CHECK:
If you notice yourself thinking "I know this book argues X" or "The famous passage about Y", STOP and ask:
"Is that from the text in front of me, or from training data?"

If from training data: Do not include it. Note the urge as a potential pollution marker.

---

## CHUNK TO READ

{chunk_content}

---

## OUTPUT FORMAT

Use the template at ~/.claude/skills/ReadForYourself/Templates/ChapterNotes.md

Fill in:
- Direct observations with quotes
- Questions that arose from reading
- Connections (only to books actually read)
- Key passages with your analysis
- Emerging themes
- Reading integrity checklist
```

#### 4c. Save Chunk Notes

```bash
echo "$NOTES" | bun ~/.claude/skills/ReadForYourself/Tools/ReadingNotesWriter.ts \
  chunk "{slug}" {i} --title "{chunk_title}"
```

#### 4d. Progress Update

After each chunk, show progress:
```
✓ Chunk {i+1}/{n} complete: {chunk_title}
  Progress: {percent}%
```

### 5. SYNTHESIZE - Post-Reading Analysis

After all chunks complete:

#### 5a. Gather All Notes

```bash
cat ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/*.md
```

#### 5b. Run Synthesis Pipeline

**Step 1: Initial Synthesis**

Process all notes with the anti-pollution prompt:

```markdown
## SYNTHESIS INSTRUCTIONS

You have just read "{title}" by {author} across {n} chunks.

Review your chunk notes and create a synthesis that:
1. Summarizes ONLY what the text actually says
2. Captures YOUR observations from reading
3. Lists the key arguments as presented
4. Notes remaining questions
5. Identifies connections to other direct readings

### POLLUTION CHECK:
As you synthesize, watch for conclusions that might come from training data rather than your reading. Flag any that seem suspicious.

Use template: ~/.claude/skills/ReadForYourself/Templates/BookSynthesis.md
```

**Step 2: WisdomSynthesis (File Mode)**

```
/WisdomSynthesis --file ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/ --skip-research
```

Extracts structured wisdom from reading notes.

**Step 3: Fabric Pattern**

```bash
cat all_notes.md | fabric --pattern extract_wisdom
```

Additional extraction pass.

**Step 4: Adversarial Pollution Check (MANDATORY)**

Spawn a SEPARATE agent (Intern or general-purpose) to attack the synthesis's originality claims. This agent must NOT be the same agent that wrote the synthesis — the fox cannot guard the henhouse.

**Attack vectors the agent MUST cover:**
1. Which "personal observations" are standard training-data takes?
2. Which "connections to other readings" are pattern-matching filler vs. genuine structural parallels?
3. Which "remaining questions" are famous philosophical objections being reproduced as discoveries?
4. For each claimed "surprise" — is the surprise genuine or performed?
5. Are cross-domain connections using the X-IS-Y template (surface) or identifying genuine structural parallels (deep)?

**Output format:** STEELMAN (3-5 points), ATTACK (8+ points), VERDICT (percentage genuinely text-grounded vs. training-data reproduction vs. pattern-matching filler).

**Save pollution check to:** `MEMORY/LEARNING/BOOKS/{slug}-pollution-check.md`

**Why this step exists:** The 2026-02-13 Kuhn reading showed that synthesis self-assessment catches minor contamination (4 items) while missing major contamination (6 items). A separate adversarial agent found that ~40-45% of the synthesis was training-data reproduction in fresh packaging. The self-assessment cannot detect this because the contaminated observations FEEL original from inside.

#### 5c. Finalize Synthesis

Integrate adversarial feedback into final synthesis:
- Mark flagged conclusions with [POLLUTION: likely/possible/unlikely]
- Trace each to text evidence or acknowledge uncertainty
- Update consilience assessment
- Append summary of pollution check findings

#### 5d. Save Final Synthesis

```bash
echo "$FINAL_SYNTHESIS" | bun ~/.claude/skills/ReadForYourself/Tools/ReadingNotesWriter.ts \
  synthesis "{slug}"
```

### 6. COMPLETE - Report Results

```
📚 Reading Complete: {title}

📁 Files created:
   - Notes: MEMORY/STATE/BOOKS/{slug}/
   - Synthesis: MEMORY/LEARNING/BOOKS/{slug}.md

📊 Statistics:
   - Chunks read: {n}
   - Actual tokens: {tokens}
   - Actual cost: {cost}

⚠️  Pollution flags: {n} (see synthesis for details)
✓  Verified observations: {n}

🔗 Consilience: Connections to {n} other direct readings
```

---

## Error Handling

### Book not found
```
Error: File not found: {path}
```

### Unsupported format
```
Error: Unsupported format: {ext}
Supported formats: epub, pdf, txt
```

### Missing dependencies
```
Error: ebook-convert not found
Install Calibre: sudo apt install calibre
```

### Interrupted reading
Point user to resume workflow:
```
Reading interrupted at chunk {i}/{n}.
Resume with: /ReadForYourself --resume "{slug}"
```

---

## Anti-Pollution Mechanisms

This workflow implements multiple layers of epistemic hygiene:

1. **Per-chunk prompting** - Every chunk includes explicit anti-pollution instructions
2. **Reading integrity checklist** - Each note verifies observations come from text
3. **Connection verification** - Only links to books actually read
4. **RedTeam validation** - Adversarial check of conclusions
5. **Consilience tracking** - Builds evidence through convergent independent sources

The goal is not perfect pollution elimination (impossible), but awareness of where conclusions might be training-derived vs. directly observed.

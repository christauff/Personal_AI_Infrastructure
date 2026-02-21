# SynthesizeBook Workflow

Run synthesis pipeline on completed reading notes without re-reading.

---

## Trigger

```
/ReadForYourself --synthesize "<book-title-or-slug>"
/ReadForYourself --synthesize "The Republic"
/ReadForYourself --synthesize the-republic
```

---

## Use Cases

1. **Re-synthesize** - Run synthesis again with different parameters
2. **Manual reading** - Created notes manually, now want synthesis
3. **Updated skills** - New WisdomSynthesis/Fabric/RedTeam capabilities
4. **Additional analysis** - Want deeper consilience check

---

## Workflow Steps

### 1. LOCATE - Find Reading Notes

```bash
ls ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/
```

Verify notes exist:
```
Found {n} chunk notes for "{title}"
```

If no notes found:
```
Error: No reading notes found for "{slug}"
Location checked: MEMORY/STATE/BOOKS/{slug}/chunks/

Did you mean to start reading?
/ReadForYourself /path/to/book.epub
```

### 2. GATHER - Collect All Notes

```bash
# Concatenate all chunk notes in order
cat ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/chunk-*.md
```

Get book metadata from README:
```bash
cat ~/.claude/MEMORY/STATE/BOOKS/{slug}/README.md
```

### 3. SYNTHESIZE - Run Pipeline

Same as ReadBook workflow step 5:

#### 3a. Initial Synthesis

Process all notes to create unified synthesis:

```markdown
## SYNTHESIS INSTRUCTIONS

Review the reading notes for "{title}" by {author}.

Create a synthesis that:
1. Summarizes ONLY what the text actually says (based on notes)
2. Captures observations recorded during reading
3. Lists key arguments as documented
4. Notes remaining questions
5. Identifies connections to other direct readings

### POLLUTION CHECK:
Flag any conclusions that might come from training data rather than the documented observations. Mark with ⚠️.

Use template: ~/.claude/skills/ReadForYourself/Templates/BookSynthesis.md
```

#### 3b. WisdomSynthesis

```
/WisdomSynthesis --file ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/ --skip-research
```

Extract structured wisdom from reading notes using multi-skill pipeline.

#### 3c. Fabric Extract

```bash
cat ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/*.md | fabric --pattern extract_wisdom
```

Additional structured extraction.

#### 3d. RedTeam Pollution Check

```
/RedTeam "Analyze this book synthesis for training data pollution.

For each major conclusion, assess:
1. Is there direct textual evidence in the notes?
2. Could this be a common interpretation imported from training data?
3. Are there famous quotes or interpretations that might not come from actual reading?

Be adversarial. Assume some pollution has occurred and try to identify it."

{synthesis_content}
```

#### 3e. Consilience Analysis

For each claim in the synthesis:
```markdown
## CONSILIENCE CHECK

For the major conclusions in this synthesis, identify:

1. **Independent convergence** - Do other books I've directly read support this?
   (Check MEMORY/LEARNING/BOOKS/ for other completed readings)

2. **Methodology diversity** - Do different approaches reach same conclusion?

3. **Era diversity** - Do sources from different times agree?

Format as consilience table in synthesis.
```

### 4. SAVE - Persist Synthesis

```bash
echo "$FINAL_SYNTHESIS" | bun ~/.claude/skills/ReadForYourself/Tools/ReadingNotesWriter.ts \
  synthesis "{slug}"
```

Note: This will overwrite any existing synthesis.

### 5. REPORT - Show Results

```
📚 Synthesis Complete: {title}

📁 Output:
   - Synthesis: MEMORY/LEARNING/BOOKS/{slug}.md

📊 Analysis:
   - Chunks synthesized: {n}
   - Pollution flags: {n} (see ⚠️ markers)
   - Verified claims: {n} (see ✅ markers)
   - Consilience sources: {n}

Key findings:
- [Top 3 verified conclusions]

Flagged for review:
- [Items marked ⚠️ by RedTeam]
```

---

## Options

### --deep

Run extended synthesis with additional passes:
```
/ReadForYourself --synthesize "{slug}" --deep
```

Adds:
- FirstPrinciples decomposition
- Council debate on major claims
- Extended thinking for consilience

### --focus "<topic>"

Focus synthesis on specific aspect:
```
/ReadForYourself --synthesize "the-republic" --focus "justice"
```

Filters and emphasizes notes related to topic.

### --compare "<other-slug>"

Generate comparative synthesis:
```
/ReadForYourself --synthesize "the-republic" --compare "politics-aristotle"
```

Requires both books have been read.

---

## When to Re-Synthesize

1. **After reading related books** - New consilience connections available
2. **Skill updates** - Improved WisdomSynthesis/RedTeam/Fabric
3. **Deeper analysis needed** - Initial synthesis too surface-level
4. **Specific focus** - Want synthesis on particular theme
5. **Pollution concerns** - Suspicion that initial synthesis was contaminated

# ResumeReading Workflow

Continue an interrupted reading session from saved state.

---

## Trigger

```
/ReadForYourself --resume "<book-title-or-slug>"
/ReadForYourself --resume "The Republic"
/ReadForYourself --resume the-republic
```

---

## Workflow Steps

### 1. FIND - Locate Reading State

```bash
bun ~/.claude/skills/ReadForYourself/Tools/ReadingNotesWriter.ts status "{slug_or_title}"
```

If not found by slug, search by title:
```bash
# Check ReadingState.yaml for matching title
cat ~/.claude/skills/ReadForYourself/Data/ReadingState.yaml | grep -i "{search_term}"
```

### 2. VERIFY - Check What's Already Done

Output from status includes:
- `total_chunks` - How many chunks total
- `current_chunk` - Where we left off
- `chunks_completed` - Array of completed chunks

Display to user:
```
📚 Resuming: {title} by {author}

📊 Progress:
   - Completed: {completed}/{total} chunks ({percent}%)
   - Last chunk: {last_chunk_title}
   - Remaining: {remaining} chunks

📁 Notes location: MEMORY/STATE/BOOKS/{slug}/

Continue reading? [y/N]
```

### 3. VALIDATE - Check Existing Notes

Verify notes exist for claimed completed chunks:
```bash
ls ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/
```

If mismatch between state and files:
```
⚠️  State says {n} chunks complete, but only {m} note files found.
    Resetting to chunk {m}. Some work may need to be redone.
```

### 4. RESUME - Continue Reading

Get the source path from state:
```yaml
source_path: "/path/to/book.epub"
```

For each remaining chunk (current_chunk to total_chunks-1):

Same as ReadBook workflow steps 4a-4d:
1. Extract chunk content
2. Process with anti-pollution prompt
3. Save chunk notes
4. Show progress

### 5. SYNTHESIZE - After All Chunks Done

If resuming completes the book, run full synthesis pipeline:
- Initial synthesis
- WisdomSynthesis
- Fabric extract_wisdom
- RedTeam pollution check
- Save final synthesis

Same as ReadBook workflow step 5.

### 6. COMPLETE - Report Final Status

Same completion report as ReadBook workflow.

---

## Edge Cases

### Book Already Complete

If all chunks are done:
```
📚 {title} is already complete!

Synthesis at: MEMORY/LEARNING/BOOKS/{slug}.md

To re-run synthesis only:
/ReadForYourself --synthesize "{slug}"
```

### No Progress Found

If no reading state exists:
```
No active reading found for "{search_term}".

Start new reading with:
/ReadForYourself /path/to/book.epub

Or check completed readings:
cat ~/.claude/skills/ReadForYourself/Data/ReadingHistory.yaml
```

### Source File Moved

If original source file not found:
```
⚠️  Original source not found: {source_path}

Provide current path to continue:
/ReadForYourself --resume "{slug}" --source "/new/path/to/book.epub"
```

Verify it's the same book by checking title/author in metadata.

---

## State Recovery

If state file is corrupted but notes exist, can recover:

```bash
# Count actual note files
ls ~/.claude/MEMORY/STATE/BOOKS/{slug}/chunks/*.md | wc -l

# Rebuild state from notes
# (Manual process - read README.md in book dir for metadata)
```

---

## Why Resume Matters

Book reading is expensive and time-consuming. Resume ensures:
1. **No wasted work** - Don't re-read already processed chunks
2. **Consistent state** - Notes stay synchronized with progress
3. **Interruptible** - Can stop and continue across sessions
4. **Cost tracking** - Accurate accounting of actual usage

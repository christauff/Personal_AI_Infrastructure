#!/bin/bash
# Job 3: JSONL Compaction
# Schedule: 15 5 * * * (daily 5:15 AM)
# Uses flock(1) for atomic operations. Archives old entries.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"
source "$SCRIPT_DIR/../lib/flock-append.sh"

REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-jsonl-compaction"
RETENTION_CONF="$SCRIPT_DIR/jsonl-retention.conf"
ERRORS=0

log() {
    echo "[$(date -Iseconds)] [jsonl-compaction] $*" >> "$LOG"
}

# Default retention: 500 lines
get_retention() {
    local file="$1"
    local basename
    basename=$(basename "$file")
    local retention=500

    if [[ -f "$RETENTION_CONF" ]]; then
        while IFS='=' read -r pattern lines; do
            # Skip comments and empty lines
            [[ "$pattern" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$pattern" ]] && continue
            pattern=$(echo "$pattern" | xargs)
            lines=$(echo "$lines" | xargs)
            case "$basename" in
                $pattern)
                    retention="$lines"
                    break
                    ;;
            esac
        done < "$RETENTION_CONF"
    fi

    echo "$retention"
}

# Determine archive dir based on file location
get_archive_dir() {
    local file="$1"
    if [[ "$file" == *"/AUTOLEARN/"* ]]; then
        echo "$PAI_DIR/AUTOLEARN/ARCHIVE"
    else
        echo "$PAI_DIR/MEMORY/ARCHIVE"
    fi
}

log "=== JSONL compaction starting ==="

# Check for overnight processor lock
if [[ -f "$PAI_DIR/GOVERNANCE/overnight.lock" ]]; then
    log "Overnight processor running (overnight.lock present). Skipping."
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Dynamic discovery: find all JSONL files > 50KB
while IFS= read -r -d '' jsonl_file; do
    retention=$(get_retention "$jsonl_file")
    total_lines=$(wc -l < "$jsonl_file" 2>/dev/null || echo 0)

    if [[ $total_lines -le $retention ]]; then
        continue  # Under retention limit, skip
    fi

    archive_dir=$(get_archive_dir "$jsonl_file")
    mkdir -p "$archive_dir"

    archive_name="$(basename "$jsonl_file" .jsonl)-$(date +%Y%m%d).jsonl"
    archive_path="$archive_dir/$archive_name"
    lockfile="${jsonl_file}.lock"
    lines_to_archive=$((total_lines - retention))

    log "Compacting $(basename "$jsonl_file"): $total_lines lines → keep $retention, archive $lines_to_archive"

    # Atomic compaction with flock
    (
        flock -w 10 200 || {
            log "  ERROR: Could not acquire lock on $lockfile"
            ERRORS=$((ERRORS + 1))
            exit 1
        }

        # Re-read line count inside lock (may have changed)
        current_lines=$(wc -l < "$jsonl_file" 2>/dev/null || echo 0)
        if [[ $current_lines -le $retention ]]; then
            log "  Skipped (line count changed under lock: $current_lines)"
            exit 0
        fi

        keep_from=$((current_lines - retention + 1))

        # Write archived lines (head portion)
        head -n "$((current_lines - retention))" "$jsonl_file" >> "$archive_path"

        # Write retained lines to tmp, then atomic mv
        tail -n "$retention" "$jsonl_file" > "${jsonl_file}.tmp"
        mv "${jsonl_file}.tmp" "$jsonl_file"

        log "  Archived $((current_lines - retention)) lines to $archive_name"
    ) 200>"$lockfile" || {
        ERRORS=$((ERRORS + 1))
    }

done < <(find "$PAI_DIR" -name "*.jsonl" -size +50k -print0 2>/dev/null)

# Archive cleanup: delete archives > 90 days
find "$PAI_DIR/MEMORY/ARCHIVE" -name "*.jsonl" -mtime +90 -delete 2>/dev/null || true
find "$PAI_DIR/AUTOLEARN/ARCHIVE" -name "*.jsonl" -mtime +90 -delete 2>/dev/null || true

log "=== JSONL compaction complete (errors: $ERRORS) ==="

if [[ $ERRORS -eq 0 ]]; then
    date +%s > "$HEARTBEAT"
    exit 0
else
    pai_notify "PAI: JSONL Compaction Failed" "$ERRORS files had errors" 4
    exit 1
fi

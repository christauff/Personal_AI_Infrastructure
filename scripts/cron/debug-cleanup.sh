#!/bin/bash
# Job 10: Debug Directory Cleanup
# Schedule: 0 6 * * * (daily 6 AM)
# Deletes ephemeral debug artifacts > 7 days old
# Safety: only targets $PAI_DIR/debug/, absolute paths

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

DEBUG_DIR="$PAI_DIR/debug"
REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-debug-cleanup"

log() {
    echo "[$(date -Iseconds)] [debug-cleanup] $*" >> "$LOG"
}

log "=== Debug cleanup starting ==="

if [[ ! -d "$DEBUG_DIR" ]]; then
    log "Debug directory does not exist. Nothing to do."
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Safety check: ensure we're targeting the right directory
if [[ "$DEBUG_DIR" != "$PAI_DIR/debug" ]]; then
    log "ERROR: Debug dir mismatch. Aborting."
    exit 1
fi

# Get size before
size_before=$(du -sh "$DEBUG_DIR" 2>/dev/null | cut -f1)
count_before=$(find "$DEBUG_DIR" -type f 2>/dev/null | wc -l)

# Delete files >7 days old
deleted_count=$(find "$DEBUG_DIR" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)

# Remove empty directories left behind
find "$DEBUG_DIR" -mindepth 1 -type d -empty -delete 2>/dev/null || true

# Get size after
size_after=$(du -sh "$DEBUG_DIR" 2>/dev/null | cut -f1)
count_after=$(find "$DEBUG_DIR" -type f 2>/dev/null | wc -l)

log "Cleaned: $deleted_count files ($size_before → $size_after, $count_before → $count_after files)"

date +%s > "$HEARTBEAT"
exit 0

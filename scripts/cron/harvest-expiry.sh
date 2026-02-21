#!/bin/bash
# Job 7: AUTOLEARN/HARVEST Expiry
# Schedule: 30 5 * * 0 (weekly Sunday 5:30 AM)
# Only deletes harvest files >30 days with confirmed processing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

HARVEST_DIR="$PAI_DIR/AUTOLEARN/HARVEST"
HEALTH_HISTORY="$PAI_DIR/AUTOLEARN/METRICS/health-history.jsonl"
REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-harvest-expiry"
DELETED=0
FLAGGED=0

log() {
    echo "[$(date -Iseconds)] [harvest-expiry] $*" >> "$LOG"
}

log "=== Harvest expiry starting ==="

if [[ ! -d "$HARVEST_DIR" ]]; then
    log "HARVEST directory does not exist. Nothing to do."
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Clean .bak files regardless of age
bak_count=$(find "$HARVEST_DIR" -name "*.bak" -type f 2>/dev/null | wc -l)
if [[ $bak_count -gt 0 ]]; then
    find "$HARVEST_DIR" -name "*.bak" -type f -delete 2>/dev/null
    log "Cleaned $bak_count .bak files"
fi

# Process files >30 days old
while IFS= read -r -d '' file; do
    basename_file=$(basename "$file")

    # Check if this file has confirmed processing in health-history.jsonl
    if [[ -f "$HEALTH_HISTORY" ]] && grep -q "$basename_file" "$HEALTH_HISTORY" 2>/dev/null; then
        rm -f "$file"
        DELETED=$((DELETED + 1))
        log "Deleted processed: $basename_file"
    else
        FLAGGED=$((FLAGGED + 1))
        log "FLAGGED unprocessed: $basename_file (>30 days, no processing record)"
    fi
done < <(find "$HARVEST_DIR" -type f -mtime +30 -not -name "*.bak" -print0 2>/dev/null)

log "=== Harvest expiry complete (deleted: $DELETED, flagged: $FLAGGED) ==="

if [[ $FLAGGED -gt 0 ]]; then
    pai_notify "PAI: Harvest Expiry" "$FLAGGED unprocessed files >30 days old" 3
fi

date +%s > "$HEARTBEAT"
exit 0

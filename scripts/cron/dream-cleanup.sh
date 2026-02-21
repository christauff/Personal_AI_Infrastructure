#!/bin/bash
# Job 8: Dream Intermediate Cleanup
# Schedule: 45 5 * * * (daily 5:45 AM)
# Verifies final report is substantive before deleting intermediates

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

DREAMS_DIR="$PAI_DIR/DREAMS"
NIGHTLY_DIR="$DREAMS_DIR/NIGHTLY"
ARCHIVE_DIR="$DREAMS_DIR/ARCHIVE"
REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-dream-cleanup"
CLEANED=0
ARCHIVED=0
WARNINGS=0

log() {
    echo "[$(date -Iseconds)] [dream-cleanup] $*" >> "$LOG"
}

log "=== Dream cleanup starting ==="

mkdir -p "$ARCHIVE_DIR"

if [[ ! -d "$NIGHTLY_DIR" ]]; then
    log "NIGHTLY directory does not exist. Nothing to do."
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Clean intermediates >7 days old
# Intermediates are files with suffixes like -deep-sleep-*, -rem-*, -light-sleep-*
while IFS= read -r -d '' intermediate; do
    basename_file=$(basename "$intermediate")

    # Extract date from filename (YYYY-MM-DD prefix)
    date_prefix=$(echo "$basename_file" | grep -oP '^\d{4}-\d{2}-\d{2}' || true)
    if [[ -z "$date_prefix" ]]; then
        continue
    fi

    # Find the corresponding final report (just the date, no suffix like -deep-sleep)
    final_report="$NIGHTLY_DIR/${date_prefix}.md"

    if [[ -f "$final_report" ]]; then
        # Verify final report is substantive (>2KB)
        final_size=$(stat -c %s "$final_report" 2>/dev/null || echo 0)
        if [[ $final_size -gt 2048 ]]; then
            rm -f "$intermediate"
            CLEANED=$((CLEANED + 1))
            log "Cleaned intermediate: $basename_file (final: ${final_size}B)"
        else
            WARNINGS=$((WARNINGS + 1))
            log "WARNING: Final report too small (${final_size}B), keeping intermediate: $basename_file"
        fi
    else
        WARNINGS=$((WARNINGS + 1))
        log "WARNING: No final report for $date_prefix, keeping intermediate: $basename_file"
    fi
done < <(find "$NIGHTLY_DIR" -name "*-*-*-*.md" -mtime +7 -print0 2>/dev/null | grep -zv -P '^\d{4}-\d{2}-\d{2}\.md$' || true)

# Archive final reports >30 days old
while IFS= read -r -d '' report; do
    mv "$report" "$ARCHIVE_DIR/"
    ARCHIVED=$((ARCHIVED + 1))
done < <(find "$NIGHTLY_DIR" -maxdepth 1 -name "????-??-??.md" -mtime +30 -print0 2>/dev/null)

# Also clean dream daemon log if large
DAEMON_LOG="$DREAMS_DIR/dream-daemon.log"
if [[ -f "$DAEMON_LOG" ]]; then
    daemon_size=$(stat -c %s "$DAEMON_LOG" 2>/dev/null || echo 0)
    if [[ $daemon_size -gt 1048576 ]]; then
        # cp+truncate for daemon log too
        cp "$DAEMON_LOG" "${DAEMON_LOG}.1"
        truncate -s 0 "$DAEMON_LOG"
        log "Rotated dream-daemon.log (${daemon_size}B)"
    fi
fi

log "=== Dream cleanup complete (cleaned: $CLEANED, archived: $ARCHIVED, warnings: $WARNINGS) ==="

if [[ $WARNINGS -gt 0 ]]; then
    pai_notify "PAI: Dream Cleanup" "$WARNINGS intermediates kept (missing/small finals)" 3
fi

date +%s > "$HEARTBEAT"
exit 0

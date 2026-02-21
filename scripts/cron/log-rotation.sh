#!/bin/bash
# Job 1: Log Rotation
# Schedule: 0 6 * * * (daily 6 AM)
# Uses cp+truncate pattern (NOT mv+touch) to preserve file descriptors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-log-rotation"
ERRORS=0

# Exclusion list: logs that should NOT be rotated
EXCLUDE_PATTERNS=(
    "*.log.1"
    "*.log.2"
    "*.log.3"
)

log() {
    echo "[$(date -Iseconds)] [log-rotation] $*" >> "$LOG"
}

is_excluded() {
    local file="$1"
    for pat in "${EXCLUDE_PATTERNS[@]}"; do
        case "$(basename "$file")" in
            $pat) return 0 ;;
        esac
    done
    return 1
}

rotate_file() {
    local file="$1"
    local size
    size=$(stat -c %s "$file" 2>/dev/null || echo 0)

    if [[ "$size" -lt 1048576 ]]; then
        return 0  # Skip files < 1MB
    fi

    log "Rotating $file ($(( size / 1024 ))KB)"

    # Shift existing rotations (keep 3 generations)
    [[ -f "${file}.2" ]] && mv "${file}.2" "${file}.3"
    [[ -f "${file}.1" ]] && mv "${file}.1" "${file}.2"

    # cp+truncate pattern: preserves file descriptors for active writers
    cp "$file" "${file}.1"
    truncate -s 0 "$file"

    log "  Rotated successfully, freed $(( size / 1024 ))KB"
}

log "=== Log rotation starting ==="

# Dynamic discovery: find all .log files > 1MB
while IFS= read -r -d '' logfile; do
    if ! is_excluded "$logfile"; then
        rotate_file "$logfile" || {
            log "  ERROR: Failed to rotate $logfile"
            ERRORS=$((ERRORS + 1))
        }
    fi
done < <(find "$PAI_DIR" -name "*.log" -size +1M -not -name "*.log.[0-9]" -print0 2>/dev/null)

# Also rotate our own maintenance.log if large
if [[ -f "$LOG" ]]; then
    local_size=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
    if [[ "$local_size" -gt 1048576 ]]; then
        # Rotate maintenance.log itself (the watchman gets watched)
        [[ -f "${LOG}.2" ]] && mv "${LOG}.2" "${LOG}.3"
        [[ -f "${LOG}.1" ]] && mv "${LOG}.1" "${LOG}.2"
        cp "$LOG" "${LOG}.1"
        truncate -s 0 "$LOG"
        log "Rotated maintenance.log itself"
    fi
fi

log "=== Log rotation complete (errors: $ERRORS) ==="

# Write heartbeat on success
if [[ $ERRORS -eq 0 ]]; then
    date +%s > "$HEARTBEAT"
    exit 0
else
    pai_notify "PAI: Log Rotation Failed" "$ERRORS files failed to rotate" 4
    exit 1
fi

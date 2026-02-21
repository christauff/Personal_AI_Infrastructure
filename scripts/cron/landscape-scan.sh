#!/bin/bash
# Job 14: Landscape Scan via Feedly Enterprise
# Schedule: 15 7 * * * (daily 7:15 AM — after feedly-digest at 6:30 AM)
# Uses Feedly searchContents API to monitor AI agent ecosystem
# Zero LLM cost — deterministic keyword scoring
# ~6 API calls per day (well within 300/day landscape budget)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-landscape-scan"
FACADE="$PAI_DIR/skills/FeedlyClient/Facades/LandscapeFacade.ts"
SCAN_DIR="$PAI_DIR/skills/LandscapeMonitor/Data/scans"

log() {
    echo "[$(date -Iseconds)] [landscape-scan] $*" >> "$LOG"
}

log "=== Landscape scan starting ==="

# Verify Feedly access token exists
if [[ ! -f "$PAI_DIR/.env" ]] || ! grep -q "FEEDLY_ACCESS_TOKEN" "$PAI_DIR/.env" 2>/dev/null; then
    log "[WARN] FEEDLY_ACCESS_TOKEN not found in .env — skipping scan"
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Verify bun is available
if ! command -v bun &>/dev/null; then
    log "[ERROR] bun not found — cannot run LandscapeFacade.ts"
    pai_notify "PAI: Landscape Scan Failed" "bun binary not found" 4
    exit 1
fi

# Verify facade exists
if [[ ! -f "$FACADE" ]]; then
    log "[ERROR] LandscapeFacade.ts not found at $FACADE"
    exit 1
fi

mkdir -p "$SCAN_DIR"

# Run daily landscape scan
log "Running daily landscape scan..."
if SCAN_OUTPUT=$(timeout 120 bun run "$FACADE" daily-scan 2>>"$LOG"); then
    SCAN_SIZE=${#SCAN_OUTPUT}
    log "Scan output: $SCAN_SIZE chars"

    # Parse JSON output for summary
    if command -v jq &>/dev/null; then
        TOTAL=$(echo "$SCAN_OUTPUT" | jq -r '.summary.totalArticles // 0' 2>/dev/null || echo 0)
        CRITICAL=$(echo "$SCAN_OUTPUT" | jq -r '.summary.critical // 0' 2>/dev/null || echo 0)
        HIGH=$(echo "$SCAN_OUTPUT" | jq -r '.summary.high // 0' 2>/dev/null || echo 0)
        ALERTS=$(echo "$SCAN_OUTPUT" | jq -r '.alertCount // 0' 2>/dev/null || echo 0)
        SCAN_PATH=$(echo "$SCAN_OUTPUT" | jq -r '.scanPath // "unknown"' 2>/dev/null || echo "unknown")

        log "Results: $TOTAL articles, $CRITICAL critical, $HIGH high, $ALERTS new alerts"
        log "Scan written to: $SCAN_PATH"

        # Notify on critical alerts
        if [[ "$CRITICAL" -gt 0 ]]; then
            pai_notify "PAI: Landscape CRITICAL" "$CRITICAL critical items detected in AI landscape scan" 4
        fi
    else
        log "[WARN] jq not available — cannot parse scan summary"
    fi
else
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
        log "[WARN] Landscape scan timed out (120s)"
    else
        log "[ERROR] Landscape scan failed (exit $EXIT_CODE)"
        pai_notify "PAI: Landscape Scan Failed" "Exit code: $EXIT_CODE" 3
    fi
fi

# Log rate budget status
log "Checking rate budget..."
if BUDGET_OUTPUT=$(timeout 10 bun run "$FACADE" status 2>/dev/null); then
    log "Budget: $BUDGET_OUTPUT"
fi

# Cleanup: delete scan files >30 days old
find "$SCAN_DIR" -name "*-auto.md" -mtime +30 -delete 2>/dev/null || true

log "=== Landscape scan complete ==="

date +%s > "$HEARTBEAT"
exit 0

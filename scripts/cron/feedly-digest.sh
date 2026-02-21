#!/bin/bash
# Job 12: FeedlyClient Daily Threat Intel Digest
# Schedule: 30 6 * * * (daily 6:30 AM)
# Fetches trending CVEs and daily intel digest from Feedly Enterprise API
# Zero LLM cost — pure API calls with local caching

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-feedly-digest"
FEEDLY_DIR="$PAI_DIR/skills/FeedlyClient"
DIGEST_DIR="$FEEDLY_DIR/Data/daily-digests"

log() {
    echo "[$(date -Iseconds)] [feedly-digest] $*" >> "$LOG"
}

log "=== FeedlyClient daily digest starting ==="

# Verify Feedly token exists
if ! grep -q "FEEDLY_ACCESS_TOKEN" "$PAI_DIR/.env" 2>/dev/null; then
    log "[ERROR] FEEDLY_ACCESS_TOKEN not found in .env"
    pai_notify "PAI: Feedly Digest Failed" "Missing FEEDLY_ACCESS_TOKEN in .env" 4
    exit 1
fi

# Source env vars for bun scripts
set -a
source "$PAI_DIR/.env" 2>/dev/null || true
set +a

# Ensure digest output directory exists
mkdir -p "$DIGEST_DIR"

TODAY=$(date +%Y-%m-%d)
DIGEST_FILE="$DIGEST_DIR/digest-${TODAY}.json"

# Run CyberOps daily digest (pure API, zero LLM)
log "Running CyberOpsFacade.ts daily-digest..."
if DIGEST_OUTPUT=$(timeout 120 bun run "$FEEDLY_DIR/Facades/CyberOpsFacade.ts" daily-digest 2>>"$LOG"); then
    DIGEST_SIZE=${#DIGEST_OUTPUT}
    if [[ $DIGEST_SIZE -gt 100 ]]; then
        echo "$DIGEST_OUTPUT" > "$DIGEST_FILE"
        log "Daily digest written: $DIGEST_FILE ($DIGEST_SIZE chars)"
    else
        log "[WARN] Digest output too small ($DIGEST_SIZE chars), may be empty"
        echo "$DIGEST_OUTPUT" > "$DIGEST_FILE"
    fi
else
    EXIT_CODE=$?
    log "[ERROR] CyberOpsFacade daily-digest failed (exit $EXIT_CODE)"
    # Don't alert on timeout — Feedly API may be slow
    if [[ $EXIT_CODE -ne 124 ]]; then
        pai_notify "PAI: Feedly Digest Failed" "CyberOpsFacade.ts exited $EXIT_CODE" 3
    else
        log "[WARN] Timed out after 120s — Feedly API may be slow"
    fi
fi

# Also fetch trending CVEs for quick-reference cache
log "Fetching trending CVEs..."
if TRENDING=$(timeout 60 bun run "$FEEDLY_DIR/FeedlyClient.ts" trending 2>>"$LOG"); then
    TRENDING_SIZE=${#TRENDING}
    if [[ $TRENDING_SIZE -gt 50 ]]; then
        echo "$TRENDING" > "$DIGEST_DIR/trending-${TODAY}.json"
        log "Trending CVEs written ($TRENDING_SIZE chars)"
    fi
else
    log "[WARN] Trending CVEs fetch failed or timed out"
fi

# Check rate budget after our calls
if BUDGET=$(timeout 10 bun run "$FEEDLY_DIR/FeedlyClient.ts" budget 2>/dev/null); then
    log "Rate budget status: $BUDGET"
fi

# Cleanup: delete digest files >14 days old
find "$DIGEST_DIR" -name "*.json" -mtime +14 -delete 2>/dev/null || true

log "=== FeedlyClient daily digest complete ==="

date +%s > "$HEARTBEAT"
exit 0

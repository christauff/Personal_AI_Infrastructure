#!/bin/bash
# Job 2: State Cache Invalidation
# Schedule: 0 5 * * * (daily 5 AM)
# Session guard: skips ALL resets if active session detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

STATE_DIR="$PAI_DIR/MEMORY/STATE"
REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-state-cache"
NOW=$(date +%s)
ERRORS=0

log() {
    echo "[$(date -Iseconds)] [state-cache] $*" >> "$LOG"
}

log "=== State cache invalidation starting ==="

# SESSION GUARD: If ANY current-work-*.json has mtime < 2h, SKIP ALL resets
ACTIVE_SESSION=false
for workfile in "$STATE_DIR"/current-work-*.json; do
    [[ -f "$workfile" ]] || continue
    mtime=$(stat -c %Y "$workfile" 2>/dev/null || echo 0)
    age_hours=$(( (NOW - mtime) / 3600 ))
    if [[ $age_hours -lt 2 ]]; then
        ACTIVE_SESSION=true
        log "Active session detected: $(basename "$workfile") (${age_hours}h old). Skipping ALL resets."
        break
    fi
done

if [[ "$ACTIVE_SESSION" == "true" ]]; then
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Reset function: reset file to given content if older than TTL
reset_if_stale() {
    local file="$1"
    local ttl_hours="$2"
    local reset_value="$3"
    local action="${4:-reset}"  # "reset" or "delete"

    [[ -f "$file" ]] || return 0

    local mtime
    mtime=$(stat -c %Y "$file" 2>/dev/null || echo 0)
    local age_hours=$(( (NOW - mtime) / 3600 ))

    if [[ $age_hours -ge $ttl_hours ]]; then
        if [[ "$action" == "delete" ]]; then
            rm -f "$file"
            log "Deleted stale: $(basename "$file") (${age_hours}h old, TTL: ${ttl_hours}h)"
        else
            echo "$reset_value" > "$file"
            log "Reset stale: $(basename "$file") (${age_hours}h old, TTL: ${ttl_hours}h)"
        fi
    fi
}

# TTL Rules per plan
reset_if_stale "$STATE_DIR/weather-cache.json"    24  '{}'
reset_if_stale "$STATE_DIR/location-cache.json"   168 '{}'  # 7 days
reset_if_stale "$STATE_DIR/tab-title.json"        24  '{"title":"","state":"idle"}'
reset_if_stale "$STATE_DIR/active-skills.json"    24  '{"skills":[]}'
reset_if_stale "$STATE_DIR/counts-cache.sh"       24  '' delete
reset_if_stale "$STATE_DIR/learning-cache.sh"     24  '' delete

# Git caches: 12h TTL, delete (regenerates)
for gitcache in "$STATE_DIR"/git-cache_*.sh; do
    [[ -f "$gitcache" ]] || continue
    reset_if_stale "$gitcache" 12 '' delete
done

# Stale session artifacts: 48h, delete
for workfile in "$STATE_DIR"/current-work-*.json; do
    [[ -f "$workfile" ]] || continue
    reset_if_stale "$workfile" 48 '' delete
done

# Circuit breaker: ALERT ONLY, no auto-reset (RedTeam finding)
CB_FILE="$STATE_DIR/agent-circuit-breaker.json"
if [[ -f "$CB_FILE" ]]; then
    cb_mtime=$(stat -c %Y "$CB_FILE" 2>/dev/null || echo 0)
    cb_age_hours=$(( (NOW - cb_mtime) / 3600 ))
    if [[ $cb_age_hours -ge 48 ]]; then
        log "ALERT: Circuit breaker stale (${cb_age_hours}h). Manual reset required."
        pai_notify "PAI: Stale Circuit Breaker" "Circuit breaker ${cb_age_hours}h old. Manual reset required." 3
    fi
fi

log "=== State cache invalidation complete ==="

date +%s > "$HEARTBEAT"
exit 0

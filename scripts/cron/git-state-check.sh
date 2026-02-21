#!/bin/bash
# Job 6: Git State Verification
# Schedule: 0 8 * * 0 (weekly Sunday 8 AM)
# Uses timeout + GIT_TERMINAL_PROMPT=0 to prevent hangs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-git-state"
ERRORS=0

log() {
    echo "[$(date -Iseconds)] [git-state] $*" >> "$LOG"
}

log "=== Git state check starting ==="

cd "$PAI_DIR" || {
    log "ERROR: Cannot cd to $PAI_DIR"
    exit 1
}

# Check for stale .git locks
for lockfile in "$PAI_DIR/.git/"*.lock; do
    [[ -f "$lockfile" ]] || continue
    lock_age=$(( $(date +%s) - $(stat -c %Y "$lockfile" 2>/dev/null || echo 0) ))
    if [[ $lock_age -gt 3600 ]]; then
        log "WARNING: Stale git lock: $(basename "$lockfile") (${lock_age}s old)"
        pai_notify "PAI: Stale Git Lock" "$(basename "$lockfile") is ${lock_age}s old" 3
    fi
done

# Fetch with timeout (GIT_TERMINAL_PROMPT=0 already in env.sh)
if ! timeout 30 git fetch --quiet 2>/dev/null; then
    log "WARNING: git fetch timed out or failed"
    ERRORS=$((ERRORS + 1))
fi

# Check upstream divergence
LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
UPSTREAM=$(git rev-parse '@{upstream}' 2>/dev/null || echo "unknown")

if [[ "$LOCAL" != "unknown" && "$UPSTREAM" != "unknown" && "$LOCAL" != "$UPSTREAM" ]]; then
    BEHIND=$(git rev-list --count HEAD..@{upstream} 2>/dev/null || echo 0)
    AHEAD=$(git rev-list --count @{upstream}..HEAD 2>/dev/null || echo 0)
    log "Divergence: ${BEHIND} behind, ${AHEAD} ahead of upstream"

    if [[ $BEHIND -ge 10 ]]; then
        pai_notify "PAI: Git Behind Upstream" "$BEHIND commits behind upstream" 4
    fi
else
    log "Local: $LOCAL, Upstream: $UPSTREAM"
fi

# Check uncommitted state
DIRTY=$(git status --porcelain 2>/dev/null | wc -l)
if [[ $DIRTY -gt 0 ]]; then
    log "Uncommitted changes: $DIRTY files"
fi

log "=== Git state check complete (errors: $ERRORS) ==="

if [[ $ERRORS -eq 0 ]]; then
    date +%s > "$HEARTBEAT"
    exit 0
else
    exit 1
fi

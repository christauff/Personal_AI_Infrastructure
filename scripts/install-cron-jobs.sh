#!/bin/bash
# Idempotent crontab installer for PAI maintenance jobs
# Uses version hash in marker block to enable schedule updates
# Run: bash ~/.claude/scripts/install-cron-jobs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/env.sh"

CRON_DIR="$SCRIPT_DIR/cron"
MARKER_START="# === PAI MAINTENANCE JOBS START ==="
MARKER_END="# === PAI MAINTENANCE JOBS END ==="

# Version hash: changes when this script changes
VERSION_HASH=$(md5sum "$0" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

# Verify bun is available (needed for config-validator.ts)
if ! command -v bun &>/dev/null; then
    echo "WARNING: bun not found. config-validator.ts will fail at runtime."
    echo "Install bun: curl -fsSL https://bun.sh/install | bash"
fi

# Verify all scripts exist
MISSING=0
for script in \
    "$CRON_DIR/log-rotation.sh" \
    "$CRON_DIR/state-cache-invalidation.sh" \
    "$CRON_DIR/jsonl-compaction.sh" \
    "$CRON_DIR/config-validator.ts" \
    "$CRON_DIR/work-hygiene.sh" \
    "$CRON_DIR/git-state-check.sh" \
    "$CRON_DIR/harvest-expiry.sh" \
    "$CRON_DIR/dream-cleanup.sh" \
    "$CRON_DIR/disk-usage-alert.sh" \
    "$CRON_DIR/debug-cleanup.sh" \
    "$CRON_DIR/feedly-digest.sh" \
    "$CRON_DIR/upstream-sync-check.sh" \
    "$CRON_DIR/landscape-scan.sh" \
    "$CRON_DIR/daily-maintenance.sh" \
; do
    if [[ ! -f "$script" ]]; then
        echo "ERROR: Missing script: $script"
        MISSING=$((MISSING + 1))
    fi
done

if [[ $MISSING -gt 0 ]]; then
    echo "Aborting: $MISSING scripts missing"
    exit 1
fi

# Make all scripts executable
chmod +x "$CRON_DIR"/*.sh
chmod +x "$CRON_DIR"/config-validator.ts

# Ensure required directories exist
mkdir -p "$PAI_DIR/GOVERNANCE/REPORTS"
mkdir -p "$PAI_DIR/MEMORY/ARCHIVE"
mkdir -p "$PAI_DIR/AUTOLEARN/ARCHIVE"

# Build new cron block
NEW_BLOCK="$MARKER_START
# Version: $VERSION_HASH
# Installed: $(date -Iseconds)
# Daily jobs
0 5 * * * $CRON_DIR/state-cache-invalidation.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
15 5 * * * $CRON_DIR/jsonl-compaction.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
45 5 * * * $CRON_DIR/dream-cleanup.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 6 * * * $CRON_DIR/log-rotation.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 6 * * * $CRON_DIR/debug-cleanup.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
30 6 * * * $CRON_DIR/feedly-digest.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 7 * * * bun run $CRON_DIR/config-validator.ts >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
15 7 * * * $CRON_DIR/landscape-scan.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
30 7 * * * $CRON_DIR/disk-usage-alert.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 9 * * * $CRON_DIR/daily-maintenance.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
# Weekly jobs
0 6 * * 0 $CRON_DIR/work-hygiene.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
30 5 * * 0 $CRON_DIR/harvest-expiry.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 7 * * 0 $CRON_DIR/upstream-sync-check.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
0 8 * * 0 $CRON_DIR/git-state-check.sh >> $PAI_DIR/GOVERNANCE/REPORTS/maintenance.log 2>&1
$MARKER_END"

# Get current crontab (preserve existing entries)
CURRENT_CRONTAB=$(crontab -l 2>/dev/null || echo "")

# Check if our block already exists
if echo "$CURRENT_CRONTAB" | grep -qF "$MARKER_START"; then
    # Check version
    EXISTING_HASH=$(echo "$CURRENT_CRONTAB" | grep "# Version:" | head -1 | awk '{print $3}')
    if [[ "$EXISTING_HASH" == "$VERSION_HASH" ]]; then
        echo "Cron jobs already installed (version: $VERSION_HASH). No changes needed."
        exit 0
    fi
    echo "Updating cron jobs (old: $EXISTING_HASH → new: $VERSION_HASH)"
    # Remove old block, add new
    UPDATED=$(echo "$CURRENT_CRONTAB" | sed "/$MARKER_START/,/$MARKER_END/d")
    echo "${UPDATED}
${NEW_BLOCK}" | crontab -
else
    echo "Installing cron jobs for the first time..."
    echo "${CURRENT_CRONTAB}
${NEW_BLOCK}" | crontab -
fi

echo "Done. Installed $(echo "$NEW_BLOCK" | grep -c "^\*\|^[0-9]") cron entries."
echo ""
echo "Verify with: crontab -l"
echo ""
echo "Job schedule:"
echo "  Daily:  state-cache(5AM), jsonl(5:15), dream(5:45), log-rotate(6AM),"
echo "          debug(6AM), feedly-digest(6:30AM), config(7AM), landscape(7:15AM), disk(7:30AM), aggregator(9AM)"
echo "  Weekly: harvest(Sun 5:30AM), work-hygiene(Sun 6AM), upstream-sync(Sun 7AM), git(Sun 8AM)"

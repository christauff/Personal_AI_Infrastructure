#!/bin/bash
# Job 5: WORK Directory Hygiene
# Schedule: 0 6 * * 0 (weekly Sunday 6 AM)
# REPORT ONLY — never auto-deletes session directories

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/env.sh"
source "$SCRIPT_DIR/../lib/notify.sh"

WORK_DIR="$PAI_DIR/MEMORY/WORK"
REPORTS_DIR="$PAI_DIR/GOVERNANCE/REPORTS"
LOG="$REPORTS_DIR/maintenance.log"
HEARTBEAT="$REPORTS_DIR/.heartbeat-work-hygiene"
REPORT="$REPORTS_DIR/work-hygiene-$(date +%Y-%m-%d).md"
NOW=$(date +%s)
STALE_THRESHOLD=$((14 * 86400))  # 14 days

log() {
    echo "[$(date -Iseconds)] [work-hygiene] $*" >> "$LOG"
}

log "=== WORK directory hygiene starting ==="

if [[ ! -d "$WORK_DIR" ]]; then
    log "WORK directory does not exist. Nothing to report."
    date +%s > "$HEARTBEAT"
    exit 0
fi

# Count totals
total_dirs=$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
total_size=$(du -sh "$WORK_DIR" 2>/dev/null | cut -f1)
stale_count=0
stale_dirs=""

# Find stale dirs (>14 days)
while IFS= read -r -d '' dir; do
    mtime=$(stat -c %Y "$dir" 2>/dev/null || echo 0)
    age_days=$(( (NOW - mtime) / 86400 ))
    if [[ $age_days -ge 14 ]]; then
        stale_count=$((stale_count + 1))
        dir_size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        stale_dirs="${stale_dirs}\n| $(basename "$dir") | ${age_days}d | ${dir_size} |"
    fi
done < <(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)

# Top 10 largest
top10=$(du -sh "$WORK_DIR"/*/ 2>/dev/null | sort -rh | head -10)

# Write report
cat > "$REPORT" << EOF
# WORK Directory Hygiene Report — $(date +%Y-%m-%d)

## Summary
- **Total session dirs:** $total_dirs
- **Total size:** $total_size
- **Stale dirs (>14 days):** $stale_count

## Stale Directories

| Directory | Age | Size |
|-----------|-----|------|$(echo -e "$stale_dirs")

## Top 10 Largest

\`\`\`
$top10
\`\`\`

---
*Report only. No directories were deleted. Manual cleanup required.*
EOF

log "Report written: $REPORT ($stale_count stale of $total_dirs total, $total_size)"

# Alert if thresholds exceeded
if [[ $stale_count -ge 50 ]]; then
    pai_notify "PAI: WORK Dir Hygiene" "$stale_count stale dirs (>14d), $total_size total" 4
fi

# Check total size in MB for >100MB alert
total_kb=$(du -sk "$WORK_DIR" 2>/dev/null | cut -f1)
if [[ $total_kb -ge 102400 ]]; then
    pai_notify "PAI: WORK Dir Large" "WORK dir is $total_size (>100MB)" 3
fi

date +%s > "$HEARTBEAT"
exit 0

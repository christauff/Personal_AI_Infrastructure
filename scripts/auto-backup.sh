#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# PAI Auto-Backup Script
# ═══════════════════════════════════════════════════════════════════════════════
# Automatically commits PAI config changes and backs up sensitive files
# Run via cron: 0 * * * * ~/.claude/scripts/auto-backup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PAI_DIR="${PAI_DIR:-$HOME/.claude}"
LOG_FILE="$PAI_DIR/logs/auto-backup.log"
BACKUP_DIR="$PAI_DIR/backups"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)

# Ensure directories exist
mkdir -p "$PAI_DIR/logs" "$BACKUP_DIR"

log() {
    echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

log "=== Auto-backup started ==="

# ─────────────────────────────────────────────────────────────────────────────
# 1. BACKUP SENSITIVE FILES (not in git)
# ─────────────────────────────────────────────────────────────────────────────

# Backup .env (API keys)
if [ -f "$PAI_DIR/.env" ]; then
    cp "$PAI_DIR/.env" "$BACKUP_DIR/.env.$DATE"
    log "Backed up .env"
fi

# Backup settings.json
if [ -f "$PAI_DIR/settings.json" ]; then
    cp "$PAI_DIR/settings.json" "$BACKUP_DIR/settings.json.$DATE"
    log "Backed up settings.json"
fi

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.env.*" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.settings.json.*" -mtime +7 -delete 2>/dev/null || true
log "Cleaned old backups"

# ─────────────────────────────────────────────────────────────────────────────
# 2. GIT AUTO-COMMIT (tracked files only)
# ─────────────────────────────────────────────────────────────────────────────

cd "$PAI_DIR"

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log "Not a git repository, skipping git operations"
    exit 0
fi

# Check for changes to tracked files (excluding noisy files)
CHANGES=$(git status --porcelain | grep -v "^??" | grep -v "history.jsonl" | grep -v "stats-cache" | grep -v "statsig/" | grep -v "debug/" || true)

if [ -n "$CHANGES" ]; then
    log "Changes detected:"
    echo "$CHANGES" >> "$LOG_FILE"

    # Stage important changes (skills, hooks, scripts, config, Accelerando infrastructure)
    git add skills/ hooks/ scripts/ 2>/dev/null || true
    git add POOLS/ DREAMS/ GOVERNANCE/ 2>/dev/null || true
    git add statusline-command.sh 2>/dev/null || true
    git add settings.json 2>/dev/null || true
    git add CLAUDE.md 2>/dev/null || true

    # Check if anything staged
    if git diff --cached --quiet; then
        log "No important changes to commit"
    else
        # Commit with timestamp
        git commit -m "Auto-backup at $TIMESTAMP

Automated backup of PAI configuration changes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" >> "$LOG_FILE" 2>&1

        log "Committed changes"

        # Push to remote if configured
        if git remote -v | grep -q origin; then
            git push origin main >> "$LOG_FILE" 2>&1 && log "Pushed to origin" || log "Push failed (will retry next run)"
        fi
    fi
else
    log "No changes to commit"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. BACKUP MEMORY/WORK (important session data) - DAILY
# ─────────────────────────────────────────────────────────────────────────────

# Compress and backup WORK directory DAILY (runs every hour, but only creates once per day)
WORK_BACKUP="$BACKUP_DIR/WORK-$DATE.tar.gz"
if [ -d "$PAI_DIR/MEMORY/WORK" ] && [ ! -f "$WORK_BACKUP" ]; then
    tar -czf "$WORK_BACKUP" -C "$PAI_DIR/MEMORY" WORK 2>/dev/null || true
    log "Daily WORK backup created: $WORK_BACKUP"
fi
# Keep last 14 days of WORK backups
ls -t "$BACKUP_DIR"/WORK-*.tar.gz 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 4. BACKUP MEMORY/LEARNING (ratings, signals) - DAILY
# ─────────────────────────────────────────────────────────────────────────────

LEARNING_BACKUP="$BACKUP_DIR/LEARNING-$DATE.tar.gz"
if [ -d "$PAI_DIR/MEMORY/LEARNING" ] && [ ! -f "$LEARNING_BACKUP" ]; then
    tar -czf "$LEARNING_BACKUP" -C "$PAI_DIR/MEMORY" LEARNING 2>/dev/null || true
    log "Daily LEARNING backup created: $LEARNING_BACKUP"
fi
# Keep last 14 days
ls -t "$BACKUP_DIR"/LEARNING-*.tar.gz 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 5. BACKUP MEMORY/STATE (caches, progress) - DAILY
# ─────────────────────────────────────────────────────────────────────────────

STATE_BACKUP="$BACKUP_DIR/STATE-$DATE.tar.gz"
if [ -d "$PAI_DIR/MEMORY/STATE" ] && [ ! -f "$STATE_BACKUP" ]; then
    tar -czf "$STATE_BACKUP" -C "$PAI_DIR/MEMORY" STATE 2>/dev/null || true
    log "Daily STATE backup created: $STATE_BACKUP"
fi
# Keep last 7 days
ls -t "$BACKUP_DIR"/STATE-*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 6. BACKUP ~/projects/ - DAILY (all project repos)
# ─────────────────────────────────────────────────────────────────────────────

PROJECTS_DIR="/home/christauff/projects"
PROJECTS_BACKUP="$BACKUP_DIR/PROJECTS-$DATE.tar.gz"

if [ -d "$PROJECTS_DIR" ] && [ ! -f "$PROJECTS_BACKUP" ]; then
    # Exclude node_modules and other large generated dirs to keep backup small
    tar -czf "$PROJECTS_BACKUP" \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='dist' \
        --exclude='.turbo' \
        --exclude='coverage' \
        --exclude='__pycache__' \
        --exclude='.pytest_cache' \
        --exclude='venv' \
        --exclude='.venv' \
        --exclude='*.pyc' \
        --exclude='.git/objects/pack/*.pack' \
        -C /home/christauff projects 2>/dev/null || true
    log "Daily PROJECTS backup created: $PROJECTS_BACKUP"
fi
# Keep last 14 days of project backups
ls -t "$BACKUP_DIR"/PROJECTS-*.tar.gz 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true

log "=== Auto-backup completed ==="

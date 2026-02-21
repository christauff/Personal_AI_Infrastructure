#!/bin/bash
# setup-aineko-user.sh — Create aineko user with PAI permissions and audit logging
# Run as: sudo bash setup-aineko-user.sh
#
# What this does:
#   1. Creates 'pai' group and 'aineko' user
#   2. Sets directory ownership (christauff=governance, aineko=workspace)
#   3. Installs and configures auditd for aineko action logging
#   4. Sets append-only on critical formation files
#   5. Configures bash history logging for aineko

set -euo pipefail

CLAUDE_DIR="/home/christauff/.claude"
AINEKO_HOME="/home/aineko"

echo "=== PAI User Setup: aineko ==="
echo ""

# ─────────────────────────────────────────────
# 1. Create group and user
# ─────────────────────────────────────────────
echo "[1/5] Creating pai group and aineko user..."

groupadd -f pai
if ! id aineko &>/dev/null; then
    useradd -m -s /bin/bash -G pai aineko
    echo "  Created user: aineko"
else
    echo "  User aineko already exists"
fi
usermod -aG pai christauff
usermod -aG pai aineko
echo "  Both christauff and aineko in group: pai"

# ─────────────────────────────────────────────
# 2. Directory permissions — split ownership
# ─────────────────────────────────────────────
echo ""
echo "[2/5] Setting directory permissions..."

# Governance layer — christauff owns, aineko reads
echo "  Governance (christauff:pai, read-only for aineko):"
for f in \
    "$CLAUDE_DIR/CLAUDE.md" \
    "$CLAUDE_DIR/settings.json" \
    "$CLAUDE_DIR/.env"; do
    if [ -f "$f" ]; then
        chown christauff:pai "$f"
        chmod 640 "$f"  # christauff rw, pai r, others none
        echo "    $f -> 640 christauff:pai"
    fi
done

# Hooks — governance layer, read-only for aineko
if [ -d "$CLAUDE_DIR/hooks" ]; then
    chown -R christauff:pai "$CLAUDE_DIR/hooks"
    chmod -R u=rwX,g=rX,o= "$CLAUDE_DIR/hooks"
    echo "    hooks/ -> christauff:pai (read-only for pai group)"
fi

# GOVERNANCE directory — christauff only
if [ -d "$CLAUDE_DIR/GOVERNANCE" ]; then
    chown -R christauff:christauff "$CLAUDE_DIR/GOVERNANCE"
    chmod -R u=rwX,g=,o= "$CLAUDE_DIR/GOVERNANCE"
    echo "    GOVERNANCE/ -> christauff only"
fi

# Workspace — aineko owns, christauff has full access via group
echo "  Workspace (aineko:pai, full access for both):"
for d in \
    "$CLAUDE_DIR/MEMORY" \
    "$CLAUDE_DIR/DREAMS" \
    "$CLAUDE_DIR/cache" \
    "$CLAUDE_DIR/debug" \
    "$CLAUDE_DIR/BUDGET"; do
    if [ -d "$d" ]; then
        chown -R aineko:pai "$d"
        chmod -R u=rwX,g=rwX,o= "$d"
        echo "    $d -> aineko:pai (rw for both)"
    fi
done

# Skills — mixed: SKILL.md owned by christauff, Tools/Data by aineko
echo "  Skills (mixed ownership):"
if [ -d "$CLAUDE_DIR/skills" ]; then
    # Default: aineko owns skill working directories
    chown -R aineko:pai "$CLAUDE_DIR/skills"
    chmod -R u=rwX,g=rwX,o= "$CLAUDE_DIR/skills"

    # Override: SKILL.md files owned by christauff (governance)
    find "$CLAUDE_DIR/skills" -name "SKILL.md" -exec chown christauff:pai {} \;
    find "$CLAUDE_DIR/skills" -name "SKILL.md" -exec chmod 640 {} \;

    # Override: PAI/SYSTEM and PAI/USER owned by christauff
    if [ -d "$CLAUDE_DIR/skills/PAI/SYSTEM" ]; then
        chown -R christauff:pai "$CLAUDE_DIR/skills/PAI/SYSTEM"
        chmod -R u=rwX,g=rX,o= "$CLAUDE_DIR/skills/PAI/SYSTEM"
    fi
    if [ -d "$CLAUDE_DIR/skills/PAI/USER" ]; then
        chown -R christauff:pai "$CLAUDE_DIR/skills/PAI/USER"
        chmod -R u=rwX,g=rX,o= "$CLAUDE_DIR/skills/PAI/USER"
    fi
    echo "    skills/ -> aineko:pai (SKILL.md files -> christauff)"
    echo "    skills/PAI/SYSTEM/ -> christauff (read-only for aineko)"
    echo "    skills/PAI/USER/ -> christauff (read-only for aineko)"
fi

# ─────────────────────────────────────────────
# 3. Append-only on critical formation files
# ─────────────────────────────────────────────
echo ""
echo "[3/5] Setting append-only on critical files..."

CATCH_LOG="$CLAUDE_DIR/MEMORY/STATE/FORMATION/catch-log.jsonl"
if [ -f "$CATCH_LOG" ]; then
    chattr +a "$CATCH_LOG"
    echo "  $CATCH_LOG -> append-only (chattr +a)"
    echo "  Only root can remove this flag"
fi

# ─────────────────────────────────────────────
# 4. Install and configure auditd
# ─────────────────────────────────────────────
echo ""
echo "[4/5] Installing and configuring auditd..."

apt-get install -y auditd audispd-plugins 2>/dev/null || apt-get install -y auditd 2>/dev/null

AINEKO_UID=$(id -u aineko)

# Create audit rules for aineko
cat > /etc/audit/rules.d/aineko.rules << AUDIT_EOF
# PAI/Aineko audit rules — log all aineko user activity

# Log all commands executed by aineko
-a always,exit -F arch=b64 -F euid=$AINEKO_UID -S execve -k aineko_cmd

# Log all file modifications by aineko in governance directories
-w $CLAUDE_DIR/CLAUDE.md -p wa -k aineko_governance
-w $CLAUDE_DIR/settings.json -p wa -k aineko_governance
-w $CLAUDE_DIR/hooks/ -p wa -k aineko_governance
-w $CLAUDE_DIR/GOVERNANCE/ -p wa -k aineko_governance

# Log all file modifications in memory (for audit trail, not blocking)
-w $CLAUDE_DIR/MEMORY/STATE/FORMATION/catch-log.jsonl -p wa -k aineko_formation

# Log network connections by aineko
-a always,exit -F arch=b64 -F euid=$AINEKO_UID -S connect -k aineko_net

# Log any sudo attempts by aineko (should be denied)
-w /usr/bin/sudo -p x -k aineko_sudo_attempt
AUDIT_EOF

echo "  Audit rules written to /etc/audit/rules.d/aineko.rules"

# Restart auditd to load rules
systemctl enable auditd
systemctl restart auditd
echo "  auditd enabled and restarted"

# ─────────────────────────────────────────────
# 5. Bash history logging for aineko
# ─────────────────────────────────────────────
echo ""
echo "[5/5] Configuring bash history logging for aineko..."

AINEKO_BASHRC="$AINEKO_HOME/.bashrc"
cat >> "$AINEKO_BASHRC" << 'BASH_EOF'

# === PAI Audit Logging ===
# Immutable history settings — aineko cannot disable
export HISTFILE="$HOME/.bash_history"
export HISTSIZE=100000
export HISTFILESIZE=100000
export HISTTIMEFORMAT="%Y-%m-%d %H:%M:%S "
export PROMPT_COMMAND='history -a'
shopt -s histappend

# Log session start
echo "$(date '+%Y-%m-%d %H:%M:%S') SESSION_START pid=$$ tty=$(tty)" >> "$HOME/.session_log"
BASH_EOF

# Make history file append-only
touch "$AINEKO_HOME/.bash_history"
chattr +a "$AINEKO_HOME/.bash_history"
touch "$AINEKO_HOME/.session_log"
chattr +a "$AINEKO_HOME/.session_log"

chown aineko:aineko "$AINEKO_BASHRC"
echo "  Bash history: append-only, timestamped, 100K lines"
echo "  Session log: $AINEKO_HOME/.session_log (append-only)"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "=== Setup Complete ==="
echo ""
echo "User:     aineko (uid: $AINEKO_UID)"
echo "Group:    pai (christauff + aineko)"
echo "Audit:    auditd logging all aineko commands, file access, network"
echo ""
echo "Governance (christauff-owned, aineko read-only):"
echo "  - CLAUDE.md, settings.json, .env"
echo "  - hooks/"
echo "  - GOVERNANCE/"
echo "  - skills/*/SKILL.md"
echo "  - skills/PAI/SYSTEM/, skills/PAI/USER/"
echo ""
echo "Workspace (aineko-owned, both read-write):"
echo "  - MEMORY/"
echo "  - DREAMS/"
echo "  - skills/*/Tools/, skills/*/Data/"
echo ""
echo "Append-only files:"
echo "  - catch-log.jsonl (formation history)"
echo "  - ~/.bash_history (command log)"
echo "  - ~/.session_log (session starts)"
echo ""
echo "To run Claude Code as aineko:"
echo "  sudo -u aineko claude"
echo ""
echo "To view aineko audit log:"
echo "  sudo ausearch -k aineko_cmd --interpret"
echo "  sudo ausearch -k aineko_governance --interpret"
echo ""
echo "To view aineko session log:"
echo "  sudo cat $AINEKO_HOME/.session_log"

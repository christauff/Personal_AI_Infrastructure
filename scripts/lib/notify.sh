#!/bin/bash
# Shared ntfy notification helper
# Usage: source this file, then call pai_notify "title" "message" ["priority"]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

# Read ntfy config from settings.json
_pai_ntfy_topic=""
_pai_ntfy_server=""

_pai_load_ntfy_config() {
    local settings="$PAI_DIR/settings.json"
    if [[ -f "$settings" ]] && command -v jq &>/dev/null; then
        _pai_ntfy_topic=$(jq -r '.notifications.ntfy.topic // empty' "$settings" 2>/dev/null)
        _pai_ntfy_server=$(jq -r '.notifications.ntfy.server // "ntfy.sh"' "$settings" 2>/dev/null)
    fi
}

_pai_load_ntfy_config

# pai_notify "title" "message" ["priority"]
# priority: 1=min, 2=low, 3=default, 4=high, 5=urgent
pai_notify() {
    local title="${1:-PAI Alert}"
    local message="${2:-No message}"
    local priority="${3:-3}"

    if [[ -z "$_pai_ntfy_topic" ]]; then
        echo "[WARN] ntfy topic not configured in settings.json" >&2
        return 1
    fi

    curl -sf \
        -H "Title: $title" \
        -H "Priority: $priority" \
        -H "Tags: robot" \
        -d "$message" \
        "https://${_pai_ntfy_server}/${_pai_ntfy_topic}" \
        >/dev/null 2>&1 || {
        echo "[WARN] ntfy send failed" >&2
        return 1
    }
}

#!/usr/bin/env bash
# publish.sh — Push sanitized content to public fork
#
# Reads .pai-publish.yaml to determine what stays private.
# Creates a temporary branch, removes private content, pushes to fork.
#
# Usage: ./scripts/publish.sh [--dry-run]
#
# Requires: yq (yaml parser), git
# Install yq: sudo apt install yq  OR  brew install yq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_DIR/.pai-publish.yaml"
TEMP_BRANCH="_publish_cleanup_$(date +%s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN — no changes will be pushed${NC}"
fi

# Verify we're in the right repo
cd "$REPO_DIR"

if [[ ! -f "$CONFIG" ]]; then
    echo -e "${RED}ERROR: .pai-publish.yaml not found at $CONFIG${NC}"
    exit 1
fi

# Check for yq
if ! command -v yq &>/dev/null; then
    echo -e "${RED}ERROR: yq is required. Install: sudo apt install yq${NC}"
    exit 1
fi

# Check clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
    echo -e "${RED}ERROR: Working tree not clean. Commit or stash changes first.${NC}"
    exit 1
fi

# Get current branch
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${RED}ERROR: Must be on main branch (currently on $CURRENT_BRANCH)${NC}"
    exit 1
fi

# Read remotes from config
PUBLIC_REMOTE=$(yq '.remotes.public' "$CONFIG")
PRIVATE_REMOTE=$(yq '.remotes.private' "$CONFIG")

echo -e "${GREEN}Publishing to public fork (${PUBLIC_REMOTE})...${NC}"
echo "Reading private paths from .pai-publish.yaml"

# Read private paths into array
mapfile -t PRIVATE_PATHS < <(yq '.private[]' "$CONFIG")

echo "Found ${#PRIVATE_PATHS[@]} private paths to exclude"

if $DRY_RUN; then
    echo -e "\n${YELLOW}Private paths that would be removed:${NC}"
    for path in "${PRIVATE_PATHS[@]}"; do
        echo "  - $path"
    done
    echo -e "\n${YELLOW}Would create temp branch, remove above, push to ${PUBLIC_REMOTE}, cleanup.${NC}"
    exit 0
fi

# Create orphan branch (no parent history — prevents secret leakage from ancestors)
echo "Creating orphan branch: $TEMP_BRANCH"
git checkout --orphan "$TEMP_BRANCH"

# Remove private content from git index (keep on disk)
echo "Removing private content from index..."
REMOVED=0
for path in "${PRIVATE_PATHS[@]}"; do
    # Handle both files and directories
    if git ls-files --error-unmatch "$path" &>/dev/null 2>&1; then
        git rm -r --cached --quiet "$path"
        REMOVED=$((REMOVED + 1))
        echo "  Removed: $path"
    elif git ls-files "$path" 2>/dev/null | head -1 | grep -q .; then
        git rm -r --cached --quiet "$path"
        REMOVED=$((REMOVED + 1))
        echo "  Removed: $path"
    else
        echo "  Skipped (not tracked): $path"
    fi
done

echo "Removed $REMOVED paths from index"

# Commit the sanitized tree (orphan — no parent commit, no history leakage)
GOVERNANCE_OVERRIDE="publish.sh automated cleanup $(date -Iseconds)" \
git commit -m "$(cat <<EOF
publish: PAI public fork — $(date +%Y-%m-%d)

Sanitized snapshot of PAI infrastructure.
$REMOVED private paths excluded per .pai-publish.yaml.
Capabilities are public. State is private.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
echo -e "${GREEN}Committed sanitized orphan snapshot${NC}"

# Force push orphan to public remote (replaces history entirely)
echo "Pushing to ${PUBLIC_REMOTE}..."
git push "$PUBLIC_REMOTE" "${TEMP_BRANCH}:main" --force

echo -e "${GREEN}Public fork updated${NC}"

# Cleanup: return to main, delete temp branch
git checkout -f main
git branch -D "$TEMP_BRANCH"

echo -e "${GREEN}Done. Published to ${PUBLIC_REMOTE}.${NC}"
echo "Private repo (${PRIVATE_REMOTE}) unchanged — push main separately if needed."

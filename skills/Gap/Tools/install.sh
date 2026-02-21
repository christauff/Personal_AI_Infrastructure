#!/bin/bash
#
# Gap Complete Installation Script
# Run with: bash ~/.claude/skills/Gap/Tools/install.sh
#
# This script will prompt for all sensitive values interactively.
#

set -e

GAP_BIN="$HOME/.local/bin/gap"
GAP_SERVER="$HOME/.local/bin/gap-server"
GAP_DATA_DIR="/var/lib/gap"
PLUGINS_DIR="$HOME/.claude/skills/Gap/Plugins"

echo "═══════════════════════════════════════════════════════════════"
echo "  Gap Credential Proxy - Complete Installation"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check binaries exist
if [[ ! -x "$GAP_BIN" ]] || [[ ! -x "$GAP_SERVER" ]]; then
    echo "ERROR: Gap binaries not found at ~/.local/bin/"
    echo "Please install Gap first."
    exit 1
fi

echo "Step 1/7: Creating data directory (requires sudo)..."
sudo mkdir -p "$GAP_DATA_DIR"
sudo chown "$USER:$USER" "$GAP_DATA_DIR"
echo "  ✓ Created $GAP_DATA_DIR"

echo ""
echo "Step 2/7: Starting Gap server..."
# Kill any existing server
pkill -f gap-server 2>/dev/null || true
sleep 1

# Start server in background
nohup "$GAP_SERVER" > /tmp/gap-server.log 2>&1 &
sleep 3

if pgrep -f gap-server > /dev/null; then
    echo "  ✓ Gap server running (PID: $(pgrep -f gap-server))"
else
    echo "  ✗ Failed to start server. Check /tmp/gap-server.log"
    exit 1
fi

echo ""
echo "Step 3/7: Initializing Gap (set encryption password)..."
"$GAP_BIN" init

echo ""
echo "Step 4/7: Installing plugins..."
for plugin in perplexity openai anthropic elevenlabs brightdata; do
    if [[ -f "$PLUGINS_DIR/$plugin.js" ]]; then
        echo "  Installing $plugin..."
        "$GAP_BIN" install "$PLUGINS_DIR/$plugin.js"
    fi
done
echo "  ✓ Plugins installed"

echo ""
echo "Step 5/7: Storing API credentials..."
echo ""
echo "Enter your API keys (they will be stored securely in Gap's vault)"
echo ""

# Read credentials from ~/.claude/.env if they exist
ENV_FILE="$HOME/.claude/.env"
if [[ -f "$ENV_FILE" ]]; then
    echo "Found ~/.claude/.env - you can copy values from there"
    echo ""
fi

echo "--- Perplexity API Key (pplx-...) ---"
"$GAP_BIN" set perplexity api_key

echo ""
echo "--- OpenAI API Key (sk-...) ---"
"$GAP_BIN" set openai api_key

echo ""
echo "--- Anthropic API Key (sk-ant-...) ---"
"$GAP_BIN" set anthropic api_key

echo ""
echo "--- ElevenLabs API Key ---"
"$GAP_BIN" set elevenlabs api_key

echo ""
echo "--- Bright Data API Token ---"
"$GAP_BIN" set brightdata api_token

echo ""
echo "Step 6/7: Creating agent token..."
"$GAP_BIN" token create --name "aineko"

echo ""
echo "Step 7/7: Verifying installation..."
echo ""
"$GAP_BIN" status
echo ""
"$GAP_BIN" plugins

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Installation Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "CA Certificate: $GAP_DATA_DIR/ca.crt"
echo ""
echo "To trust the CA system-wide, run:"
echo "  sudo cp $GAP_DATA_DIR/ca.crt /usr/local/share/ca-certificates/gap.crt"
echo "  sudo update-ca-certificates"
echo ""
echo "To start Gap on boot, create a systemd service or add to ~/.bashrc:"
echo "  pgrep -f gap-server || $GAP_SERVER &"
echo ""

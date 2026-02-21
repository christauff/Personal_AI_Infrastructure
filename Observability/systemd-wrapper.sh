#!/bin/bash
# Systemd wrapper for Observability Dashboard
# Monitors both server and client, exits if either dies

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Start server
cd "$SCRIPT_DIR/apps/server"
bun run dev &
SERVER_PID=$!

# Wait for server
for i in {1..30}; do
    curl -s http://localhost:4000/events/filter-options >/dev/null 2>&1 && break
    sleep 1
done

# Start client
cd "$SCRIPT_DIR/apps/client"
bun run dev &
CLIENT_PID=$!

# Wait for client
for i in {1..30}; do
    curl -s http://localhost:5172 >/dev/null 2>&1 && break
    sleep 1
done

echo "✅ Observability running at http://localhost:5172 (server: $SERVER_PID, client: $CLIENT_PID)"

# Monitor both processes - exit if either dies
while true; do
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "❌ Server died, exiting to trigger restart"
        kill $CLIENT_PID 2>/dev/null
        exit 1
    fi
    if ! kill -0 $CLIENT_PID 2>/dev/null; then
        echo "❌ Client died, exiting to trigger restart"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
    sleep 5
done

# Observability Dashboard - Systemd Service

The Observability Dashboard now runs as a permanent systemd user service.

## Features

✅ **Auto-starts on boot** - No manual intervention needed after reboot
✅ **Auto-recovers from crashes** - Restarts within 10-15 seconds if either server or client dies
✅ **Survives logout** - Continues running even when you're not logged in (lingering enabled)
✅ **Full logging** - All output captured via journalctl

## Service Management

```bash
# Check status
systemctl --user status pai-observability

# Start service
systemctl --user start pai-observability

# Stop service
systemctl --user stop pai-observability

# Restart service
systemctl --user restart pai-observability

# View logs (live)
journalctl --user -u pai-observability -f

# View recent logs
journalctl --user -u pai-observability -n 50

# Disable auto-start (if needed)
systemctl --user disable pai-observability

# Re-enable auto-start
systemctl --user enable pai-observability
```

## Architecture

The service uses a custom wrapper script (`systemd-wrapper.sh`) that:
1. Starts the backend server (port 4000)
2. Starts the frontend client (port 5172)
3. Monitors both processes continuously
4. Exits (triggering systemd restart) if either process dies

## Files

- **Service definition**: `~/.config/systemd/user/pai-observability.service`
- **Wrapper script**: `~/.claude/Observability/systemd-wrapper.sh`
- **Management script**: `~/.claude/Observability/manage.sh` (still usable for manual control)

## Verification After Reboot

After system reboot, verify the service auto-started:

```bash
systemctl --user status pai-observability
curl http://localhost:5172
```

Both should show the service running and the dashboard accessible.

## Troubleshooting

**Service won't start:**
```bash
# Check detailed logs
journalctl --user -u pai-observability -n 100

# Verify ports aren't already in use
lsof -Pi :4000 -sTCP:LISTEN
lsof -Pi :5172 -sTCP:LISTEN
```

**Service disabled after update:**
```bash
# Re-enable
systemctl --user enable pai-observability
systemctl --user start pai-observability
```

**Dashboard not accessible:**
```bash
# Check if backend is responding
curl http://localhost:4000/events/filter-options

# Check frontend
curl -I http://localhost:5172
```

## Implementation Details

**Service Type:** `simple` (foreground process with monitoring loop)
**Restart Policy:** `always` with 10-second delay
**Dependencies:** Waits for network.target and graphical-session.target
**Kill Mode:** `mixed` (SIGTERM to main process, SIGKILL to children)

Created: 2026-02-02
Status: ✅ Production-ready

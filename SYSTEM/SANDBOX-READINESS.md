# Sandbox Readiness Assessment

**Assessed:** 2026-02-18
**Status:** NOT ACTIVE (seccomp: 0, NoNewPrivs: 0) — BUT both prerequisites now met (bwrap + socat installed)
**Next check:** Every session start (sandbox could auto-activate in future Claude Code update)

## What Claude Code Sandbox Does

Linux: bubblewrap (bwrap) + socat for filesystem/network isolation.
Requires both `bwrap` AND `socat` installed. **Both are now present** (socat installed 2026-02-18). Sandbox CAN activate but currently defaults to OFF on Linux.

## What Breaks Under Sandbox

| Component | Impact | Graceful? |
|-----------|--------|-----------|
| Voice hooks (4 files) | `fetch(localhost:8888)` blocked | YES — all have try/catch + timeout |
| Subprocess hooks (6 files) | `spawnSync`/`Bun.spawn` blocked | PARTIAL — some lack fallbacks |
| dream-daemon.sh `claude -p` | The Claude session itself sandboxed | WARNING added (bwrap+socat detection) |
| Cron jobs (5 total) | Run outside Claude Code | NOT AFFECTED |
| scripts/publish.sh | `git push` network blocked | FAILS — no fallback |
| FeedlyClient/TwitterBot/Research | Outbound HTTPS blocked | FAILS — network-dependent |

## Critical Exposure

`dream-daemon.sh` invokes `claude -p` — this IS a Claude Code session. If sandbox is enforced by default on `claude -p`, overnight dream processing breaks. The daemon now warns when both bwrap and socat are detected.

## Hooks That Already Fail Gracefully

- `LoadContext.hook.ts:360` — try/catch around fetch(localhost:8888/health)
- `handlers/VoiceNotification.ts:88` — try/catch with 3s timeout
- `UpdateTabTitle.hook.ts:317` — try/catch around voice notify
- `handlers/SystemIntegrity.ts:57` — try/catch around voice notify

## Current Risk (Updated 2026-02-18)

**socat is now installed.** Both sandbox prerequisites are met. Sandbox is NOT active (Seccomp: 0) but COULD activate automatically in a future Claude Code update.

**Immediate mitigation options if sandbox activates:**
1. `claude --no-sandbox` flag (if available)
2. Remove socat: `sudo apt remove socat`
3. Monitor `claude -p` behavior for sandbox indicators

## When to Act

Monitor via PAIUpgrade for:
- Claude Code changelog mentioning sandbox changes
- New `--sandbox` or `--no-sandbox` CLI flags
- Changes to `allowed_domains` configuration
- **Sandbox auto-activation in future versions (ELEVATED RISK — both deps present)**

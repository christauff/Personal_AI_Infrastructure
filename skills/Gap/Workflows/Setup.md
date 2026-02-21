# Gap Setup Workflow

Complete setup and configuration of Gap credential proxy for PAI.

---

## Prerequisites

- Gap binaries installed at `~/.local/bin/gap` and `~/.local/bin/gap-server`
- API keys to store (from `~/.claude/.env`)

---

## Step 1: Initialize Gap Server (Manual - Interactive)

Run this command in a terminal (requires password input):

```bash
~/.local/bin/gap init
```

This creates:
- `~/.gap/ca.pem` - CA certificate (add to system trust)
- Server encryption keys
- Management certificate

---

## Step 2: Trust the CA Certificate

### Linux

```bash
# Copy CA to system trust store
sudo cp ~/.gap/ca.pem /usr/local/share/ca-certificates/gap.crt
sudo update-ca-certificates

# Verify
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt ~/.gap/ca.pem
```

---

## Step 3: Start Gap Server

```bash
# Start in background
~/.local/bin/gap-server &

# Or create a systemd service (see below)
```

### Systemd Service (Optional)

Create `/etc/systemd/system/gap.service`:

```ini
[Unit]
Description=Gap Credential Proxy
After=network.target

[Service]
Type=simple
User=christauff
ExecStart=/home/christauff/.local/bin/gap-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable gap
sudo systemctl start gap
```

---

## Step 4: Install Plugins

```bash
# Install PAI plugins
gap install ~/.claude/skills/Gap/Plugins/perplexity.js
gap install ~/.claude/skills/Gap/Plugins/openai.js
gap install ~/.claude/skills/Gap/Plugins/anthropic.js
gap install ~/.claude/skills/Gap/Plugins/elevenlabs.js
gap install ~/.claude/skills/Gap/Plugins/brightdata.js

# Verify installation
gap plugins
```

---

## Step 5: Store Credentials

Store each credential (interactive - prompts for value):

```bash
# From ~/.claude/.env values
gap set perplexity api_key
gap set openai api_key
gap set anthropic api_key
gap set elevenlabs api_key
gap set brightdata api_token
```

---

## Step 6: Create Agent Token

```bash
# Create token for Aineko
gap token create --name "aineko"

# Save the returned token - this is what PAI tools will use
```

---

## Step 7: Verify Setup

```bash
# Check server status
gap status

# List plugins
gap plugins

# Check activity
gap activity
```

---

## Step 8: Update PAI Tools

Migrate tools from direct credential loading to Gap proxy.

### Before (PerplexityApi.ts)

```typescript
const apiKey = envVars.get("PERPLEXITY_API_KEY");
const response = await fetch("https://api.perplexity.ai/chat", {
  headers: { "Authorization": `Bearer ${apiKey}` }
});
```

### After

```typescript
const agentToken = process.env.GAP_AGENT_TOKEN;
const response = await fetch("https://api.perplexity.ai/chat", {
  headers: { "Authorization": `Bearer ${agentToken}` }
  // Gap proxy intercepts and injects real API key
});
```

---

## Verification Checklist

- [ ] Gap server initialized (`~/.gap/` directory exists)
- [ ] CA certificate trusted (no TLS errors)
- [ ] Gap server running (`gap status` shows healthy)
- [ ] All plugins installed (`gap plugins` shows 5)
- [ ] All credentials stored (`gap plugins` shows credentials set)
- [ ] Agent token created and saved
- [ ] Test API call works through proxy

---

## Troubleshooting

### "Connection refused"

Gap server not running:
```bash
gap-server &
```

### "Certificate verify failed"

CA not trusted:
```bash
sudo cp ~/.gap/ca.pem /usr/local/share/ca-certificates/gap.crt
sudo update-ca-certificates
```

### "Plugin not found"

Re-install plugin:
```bash
gap install ~/.claude/skills/Gap/Plugins/perplexity.js
```

### "Credential not set"

Store credential:
```bash
gap set perplexity api_key
```

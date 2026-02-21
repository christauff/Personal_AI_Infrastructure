# MCP Profile Inventory

**Created:** 2026-01-31
**Source:** `~/.claude/skills/PAI/Tools/pai.ts`

---

## Overview

PAI's `pai.ts` CLI includes a comprehensive MCP profile management system. This documents the current profile structure and shortcuts.

---

## Profile System Architecture

```
~/.claude/
├── MCPs/                     # MCP configuration directory (to be created)
│   ├── *-MCP.json           # Individual MCP server configs
│   └── *.mcp.json           # Composite profile configs
└── .mcp.json                # Active profile (symlink)
```

**Note:** The `MCPs/` directory doesn't exist yet - infrastructure is ready but unpopulated.

---

## Available Profiles

| Profile | Shortcut | Description | Use Case |
|---------|----------|-------------|----------|
| `none.mcp.json` | `none` | No MCPs (maximum performance) | Default, token-efficient mode |
| `minimal.mcp.json` | `min`, `minimal` | Essential MCPs (content, daemon, Foundry) | Basic functionality |
| `chrome-enabled.mcp.json` | `chrome` | Essential + Chrome DevTools | Browser debugging |
| `dev-work.mcp.json` | `dev` | Development tools (Shadcn, Codex, Supabase) | Active development |
| `security.mcp.json` | `sec`, `security` | Security tools (httpx, naabu) | Security testing |
| `research.mcp.json` | `research` | Research tools (Brightdata, Apify, Chrome) | Data gathering |
| `full.mcp.json` | `full` | All available MCPs | Maximum capability |

---

## Individual MCP Shortcuts

| MCP | Shortcut | File | Purpose |
|-----|----------|------|---------|
| BrightData | `bd`, `brightdata` | `Brightdata-MCP.json` | Web scraping proxy |
| Apify | `ap`, `apify` | `Apify-MCP.json` | Actor automation |
| ClickUp | `cu`, `clickup` | `ClickUp-MCP.json` | Task management |

---

## CLI Commands

### Profile Management

```bash
# List available profiles
pai mcp list

# Show current profile
pai mcp current

# Set profile
pai mcp set <profile>
pai mcp set none        # Maximum performance
pai mcp set minimal     # Basic MCPs
pai mcp set research    # Research tools

# Custom combination
pai mcp custom bd ap    # BrightData + Apify only
```

### Key Functions in pai.ts

| Function | Purpose |
|----------|---------|
| `getMcpProfiles()` | Lists available `.mcp.json` profiles |
| `getIndividualMcps()` | Lists individual `-MCP.json` files |
| `getCurrentProfile()` | Reads symlink from `.mcp.json` |
| `mergeMcpConfigs()` | Combines multiple MCP files |
| `setMcpProfile()` | Creates symlink to selected profile |
| `setMcpCustom()` | Merges custom MCP selection |

---

## Current State

| Setting | Value | Notes |
|---------|-------|-------|
| Active Profile | None | No `.mcp.json` symlink |
| MCPs Directory | Not created | Infrastructure ready |
| Enabled Servers | `[]` | From settings.json |

---

## MCP 2.x Preparation

When ready to adopt MCP 2.x:

1. **Create MCPs directory:**
   ```bash
   mkdir -p ~/.claude/MCPs
   ```

2. **Add individual MCP configs:**
   - Follow MCP 2.x schema for `mcpServers` format
   - Use Streamable HTTP transport (not SSE)
   - Include tool annotations where applicable

3. **Create composite profiles:**
   - Start with `minimal.mcp.json` for essential servers
   - Build up profiles based on use case

4. **Update pai.ts if needed:**
   - Currently supports file-based profiles
   - May need updates for MCP 2.x-specific features

---

## Profile Design Principles

1. **Default to none** - Maximum performance, code-first approach
2. **Minimal footprint** - Only enable what's needed
3. **Use case driven** - Profiles match workflows (research, dev, security)
4. **Easy switching** - Short aliases for quick changes

---

## Future Considerations

### MCP 2.x Features to Support

| Feature | Profile Impact |
|---------|----------------|
| Streamable HTTP | Update transport configs |
| Tool annotations | Add to individual MCP configs |
| Tasks primitive | New profile for async-heavy work |
| Structured output | Update response handling |

### Potential New Profiles

| Profile | Description | When to Add |
|---------|-------------|-------------|
| `async.mcp.json` | MCPs with Tasks support | When Tasks primitive available |
| `claude-desktop.mcp.json` | Claude Desktop integration | When testing MCP servers |

---

## Changelog

- **2026-01-31:** Initial inventory documentation

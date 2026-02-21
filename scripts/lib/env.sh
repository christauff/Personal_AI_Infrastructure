#!/bin/bash
# Canonical PAI environment — single source of truth
# Source this from every cron script and lib

export PAI_DIR="${PAI_DIR:-$HOME/.claude}"
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export GIT_TERMINAL_PROMPT=0

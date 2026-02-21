#!/usr/bin/env bun
/**
 * SkillTracker.hook.ts - Tracks active skill invocations for statusline
 *
 * PURPOSE:
 * Captures when skills are invoked and writes to a state file so the
 * statusline can display which skills are currently/recently active.
 *
 * TRIGGER: PreToolUse (matcher: Skill)
 *
 * INPUT:
 * - tool_name: "Skill"
 * - tool_input: { skill: string, args?: string }
 *
 * OUTPUT:
 * - {"continue": true} → Always allow (tracking only)
 *
 * SIDE EFFECTS:
 * - Writes to: MEMORY/STATE/active-skills.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

const PAI_DIR = process.env.PAI_DIR || `${process.env.HOME}/.claude`;
const STATE_FILE = `${PAI_DIR}/MEMORY/STATE/active-skills.json`;
const MAX_SKILLS = 5; // Keep last 5 skills
const SKILL_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

interface SkillEntry {
  skill: string;
  timestamp: number;
  args?: string;
}

interface SkillState {
  skills: SkillEntry[];
}

async function main() {
  try {
    // Read hook input from stdin
    const input = await Bun.stdin.text();
    const hookData = JSON.parse(input);

    // Only process Skill tool calls
    if (hookData.tool_name !== "Skill") {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const skillName = hookData.tool_input?.skill;
    if (!skillName) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Ensure directory exists
    const stateDir = dirname(STATE_FILE);
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }

    // Read current state
    let state: SkillState = { skills: [] };
    try {
      if (existsSync(STATE_FILE)) {
        const content = readFileSync(STATE_FILE, "utf-8");
        state = JSON.parse(content);
      }
    } catch {
      state = { skills: [] };
    }

    const now = Date.now();

    // Filter out expired skills and duplicates of the same skill
    state.skills = state.skills.filter(
      (s) => now - s.timestamp < SKILL_TTL_MS && s.skill !== skillName
    );

    // Add new skill at the front
    state.skills.unshift({
      skill: skillName,
      timestamp: now,
      args: hookData.tool_input?.args,
    });

    // Keep only last N skills
    state.skills = state.skills.slice(0, MAX_SKILLS);

    // Write updated state
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    // Always continue - we're just tracking
    console.log(JSON.stringify({ continue: true }));
  } catch (error) {
    // On any error, just continue
    console.log(JSON.stringify({ continue: true }));
  }
}

main();

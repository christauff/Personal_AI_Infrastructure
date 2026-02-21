#!/usr/bin/env bun
/**
 * FormatReminder.hook.ts - Algorithm enforcement via AI inference (v0.2.23)
 *
 * Uses PAI Inference tool (standard tier / Sonnet) to classify:
 * - Depth: FULL | ITERATION | MINIMAL
 * - Capabilities: agent types (engineer, architect, etc.)
 * - Skills: specific skill:workflow pairs (Pass 1 hints)
 * - Thinking tools: meta-cognitive tools (Council, RedTeam, etc.)
 *
 * This is Pass 1 of Two-Pass Capability Selection.
 * Pass 1 (this hook): draft hints from raw prompt
 * Pass 2 (THINK phase): validates against reverse-engineered request + ISC
 *
 * On inference failure: defaults to FULL (nothing escapes the Algorithm).
 *
 * TRIGGER: UserPromptSubmit
 */

import { inference } from '../skills/PAI/Tools/Inference';
import { getDAName } from './lib/identity';

// Maps inference capability names → output format for the reminder
const CAPABILITY_MAP: Record<string, { name: string; agents: string }> = {
  research: { name: 'Research skill', agents: 'GeminiResearcher, ClaudeResearcher, GrokResearcher' },
  engineer: { name: 'Engineer Agent', agents: 'Engineer (subagent_type=Engineer)' },
  architect: { name: 'Architect Agent', agents: 'Architect (subagent_type=Architect)' },
  analyst: { name: 'Algorithm Agent', agents: 'Algorithm (subagent_type=Algorithm)' },
  qa: { name: 'QATester Agent', agents: 'QATester (subagent_type=QATester)' },
};

// Thinking tools that can be suggested by the hook
const THINKING_TOOLS = ['council', 'redteam', 'firstprinciples', 'science', 'becreative', 'prompting'] as const;

const THINKING_MAP: Record<string, { name: string; description: string }> = {
  council: { name: 'Council', description: 'Multi-agent debate for weighing approaches' },
  redteam: { name: 'RedTeam', description: 'Adversarial stress-testing of claims/proposals' },
  firstprinciples: { name: 'FirstPrinciples', description: 'Root cause decomposition, challenge assumptions' },
  science: { name: 'Science', description: 'Hypothesis-test-analyze cycles' },
  becreative: { name: 'BeCreative', description: 'Extended thinking, creative divergence' },
  prompting: { name: 'Prompting', description: 'Meta-prompting, prompt generation at scale' },
};

const CLASSIFICATION_SYSTEM_PROMPT = `You classify user prompts for an AI assistant's response depth, required capabilities, relevant skills, and thinking tools.

DEPTH LEVELS (choose exactly one):
- FULL: Any non-trivial work. Problem-solving, analysis, implementation, design, planning, thinking, evaluation, creation. This is the DEFAULT. Use it unless the request CLEARLY fits ITERATION or MINIMAL.
- ITERATION: Continuing/adjusting EXISTING work in progress. The user is directing ongoing work: "now try X", "ok do Y instead", "use a different approach", "that didn't work". Key signal: the response only makes sense as a continuation of prior work.
- MINIMAL: Pure social interaction with ZERO task content. ONLY: greetings ("hi", "hey"), ratings (a single number 1-10), or acknowledgments ("thanks", "cool", "got it"). If there is ANY task, question, or directive, it is NOT minimal.

CAPABILITIES (choose zero or more that would help):
- research: Investigation, exploration, finding information, looking into something
- engineer: Building, implementing, coding, fixing, creating, writing code
- architect: System design, architecture, structure decisions, planning systems
- analyst: Analysis, review, evaluation, assessment, deep thinking
- qa: Testing, verification, validation, quality checks, browser verification

SKILLS (choose zero or more matching skills — use "SkillName" or "SkillName:WorkflowName"):
- Art: Visual content. Triggers: art, header images, diagrams, illustrations, visualizations
- Browser: Browser automation. Triggers: browser, screenshot, debug web, verify UI
- CreateSkill: Skill management. Triggers: create skill, update skill, validate skill, canonicalize
- Evals: Agent evaluation. Triggers: eval, evaluate, test agent, benchmark, regression test
- Fabric: 240+ prompt patterns. Triggers: use fabric, fabric pattern, extract wisdom, summarize
- OSINT: Intelligence gathering. Triggers: OSINT, due diligence, background check, investigate
- PAIUpgrade: System improvements. Triggers: upgrade, improve system, check Anthropic, new features
- WebAssessment: Web security. Triggers: web assessment, pentest, security testing, vulnerability scan
- WisdomSynthesis: Multi-skill orchestration. Triggers: wisdom synthesis, deep analysis, orchestrate skills
- DreamProcessor: Memory consolidation. Triggers: dream, consolidate, overnight processing
- RedTeam: Adversarial analysis. Triggers: red team, attack, counterarguments, stress test
- Council: Multi-agent debate. Triggers: council, debate, perspectives
- PromptInjection: AI security testing. Triggers: prompt injection, jailbreak, LLM security
- Telos: Life OS. Triggers: TELOS, life goals, projects, dependencies

THINKING TOOLS (choose zero or more — these are DRAFT hints, the main agent validates in THINK phase):
- council: Multiple valid approaches exist. Need to weigh tradeoffs. Design decisions with no clear winner.
- redteam: Claims need stress-testing. Security implications. Proposals that could fail non-obviously.
- firstprinciples: Problem may be a symptom. Assumptions need examining. "Why" over "how."
- science: Iterative problem. Experimentation needed. Multiple hypotheses to test.
- becreative: Need creative divergence. Novel solution space. Avoiding obvious answers.
- prompting: Need to generate prompts at scale. Prompt optimization.

CRITICAL RULES:
- Assess EFFORT REQUIRED, not prompt length or keywords
- "analyze everything" is 2 words but FULL depth with analyst capability
- "hey there my friend how are you doing on this fine day" is long but MINIMAL
- "just think about it" contains "just" but if thinking is the task, it's FULL
- When uncertain, ALWAYS choose FULL. False FULL is safe. False MINIMAL loses quality.
- MINIMAL is RARE. Almost everything is FULL or ITERATION.
- Capabilities should reflect what SPECIALIST AGENTS would genuinely help with
- Skills are HINTS only — the main agent validates after reverse-engineering the request
- Thinking tools are HINTS only — the main agent runs a justify-exclusion assessment in THINK

Return ONLY valid JSON. No explanation, no markdown, no wrapping:
{"depth":"FULL","capabilities":["analyst","engineer"],"skills":["CreateSkill:UpdateSkill"],"thinking":["council"]}`;

// Read stdin with timeout
async function readStdin(timeout = 3000): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeout);
    process.stdin.on('data', chunk => { data += chunk.toString(); });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

// Classify prompt using AI inference
async function classifyPrompt(prompt: string): Promise<{
  depth: 'FULL' | 'ITERATION' | 'MINIMAL';
  capabilities: string[];
  skills: string[];
  thinking: string[];
}> {
  const result = await inference({
    systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
    userPrompt: prompt,
    level: 'fast',
    expectJson: true,
    timeout: 4000, // 4s max — classification doesn't need Sonnet
  });

  if (result.success && result.parsed) {
    const parsed = result.parsed as { depth?: string; capabilities?: string[]; skills?: string[]; thinking?: string[] };
    const depth = ['FULL', 'ITERATION', 'MINIMAL'].includes(parsed.depth || '')
      ? (parsed.depth as 'FULL' | 'ITERATION' | 'MINIMAL')
      : 'FULL';
    const capabilities = Array.isArray(parsed.capabilities)
      ? parsed.capabilities.filter((c: string) => c in CAPABILITY_MAP)
      : [];
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills.filter((s: string) => typeof s === 'string' && s.length > 0)
      : [];
    const thinking = Array.isArray(parsed.thinking)
      ? parsed.thinking.filter((t: string) => t in THINKING_MAP)
      : [];
    return { depth, capabilities, skills, thinking };
  }

  // Inference failed — safe default: FULL, no specific capabilities
  return { depth: 'FULL', capabilities: [], skills: [], thinking: [] };
}

// Build the reminder output
function buildReminder(
  depth: 'FULL' | 'ITERATION' | 'MINIMAL',
  capabilities: string[],
  skills: string[],
  thinking: string[],
): string {
  const capabilitySection = capabilities.length > 0
    ? `\n⚡ DETECTED CAPABILITIES (based on your request):\n${capabilities.map(c => {
        const cap = CAPABILITY_MAP[c];
        return cap ? `• ${cap.name} → ${cap.agents}` : '';
      }).filter(Boolean).join('\n')}\n\nYou SHOULD spawn these agents in BUILD/EXECUTE phases.`
    : '';

  const skillSection = skills.length > 0
    ? `\n🎯 DETECTED SKILLS (Pass 1 hints — validate in THINK against ISC):\n${skills.map(s => `• ${s}`).join('\n')}`
    : '';

  const thinkingSection = thinking.length > 0
    ? `\n🧠 SUGGESTED THINKING TOOLS (Pass 1 hints — run justify-exclusion in THINK):\n${thinking.map(t => {
        const tool = THINKING_MAP[t];
        return tool ? `• ${tool.name} — ${tool.description}` : '';
      }).filter(Boolean).join('\n')}`
    : '';

  switch (depth) {
    case 'FULL':
      return `<system-reminder>
ALGORITHM REQUIRED — DEPTH: FULL
Nothing escapes the Algorithm. Your response MUST use the 7-phase format:
- Start with: 🤖 PAI ALGORITHM header
- Include ALL phases: OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN
- Use TaskCreate for ISC criteria, TaskList to display them
- End with voice line
${capabilitySection}${skillSection}${thinkingSection}
</system-reminder>`;

    case 'ITERATION':
      return `<system-reminder>
ALGORITHM REQUIRED — DEPTH: ITERATION
Nothing escapes the Algorithm. Use condensed format:
🤖 PAI ALGORITHM ═════
🔄 ITERATION on: [context]
🔧 CHANGE: [what's different]
✅ VERIFY: [evidence]
🗣️ ${getDAName()}: [result]
${capabilitySection}${skillSection}${thinkingSection}
</system-reminder>`;

    case 'MINIMAL':
      return `<system-reminder>
ALGORITHM REQUIRED — DEPTH: MINIMAL
Nothing escapes the Algorithm. Use header format:
🤖 PAI ALGORITHM (v0.2.25) ═════
   Task: [6 words]
📋 SUMMARY: [what was done]
🗣️ ${getDAName()}: [voice line]
</system-reminder>`;
  }
}

async function main() {
  try {
    // Skip for subagents — they run their own patterns
    const claudeProjectDir = process.env.CLAUDE_PROJECT_DIR || '';
    if (claudeProjectDir.includes('/.claude/Agents/') || process.env.CLAUDE_AGENT_TYPE) {
      process.exit(0);
    }

    const input = await readStdin();
    if (!input) {
      process.exit(0);
    }

    const data = JSON.parse(input);
    const prompt = data.prompt || data.user_prompt || '';

    if (!prompt) {
      process.exit(0);
    }

    // AI-powered classification — no regex, no keywords, no length heuristics
    const { depth, capabilities, skills, thinking } = await classifyPrompt(prompt);
    const reminder = buildReminder(depth, capabilities, skills, thinking);

    console.log(reminder);
    process.exit(0);
  } catch (err) {
    // On any error, output FULL as safe default
    console.log(`<system-reminder>
ALGORITHM REQUIRED — DEPTH: FULL
Nothing escapes the Algorithm. Your response MUST use the 7-phase format:
- Start with: 🤖 PAI ALGORITHM header
- Include ALL phases: OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN
- Use TaskCreate for ISC criteria, TaskList to display them
- End with voice line
</system-reminder>`);
    process.exit(0);
  }
}

main();

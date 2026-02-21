#!/usr/bin/env bun
/**
 * A2AServer.ts - Google A2A Protocol Server & Client
 *
 * Implements the Google A2A (Agent-to-Agent) protocol v0.3 for cross-platform
 * agent communication. Provides both server (receive tasks) and client
 * (send tasks, discover agents) functionality.
 *
 * Usage:
 *   bun run A2AServer.ts serve [options]        Start A2A protocol server
 *   bun run A2AServer.ts send <url> <task>      Send task to external agent
 *   bun run A2AServer.ts discover               Discover A2A agents on network
 *   bun run A2AServer.ts card [--validate]      Generate/validate Agent Card
 *   bun run A2AServer.ts --help                 Show this help
 *
 * Exit codes:
 *   0 - Success
 *   1 - Validation warning
 *   2 - Error
 */

import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

// ============================================================
// PATHS
// ============================================================

const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_PATH = join(SKILL_DIR, "Config", "agent-card.yaml");
const DATA_DIR = join(SKILL_DIR, "Data");
const EVENTS_PATH = join(DATA_DIR, "a2a-events.jsonl");

// ============================================================
// TYPES
// ============================================================

interface AgentCapability {
  name: string;
  description: string;
}

interface AgentConfig {
  agent: {
    name: string;
    description: string;
    version: string;
    url: string;
    capabilities: AgentCapability[];
    auth: {
      type: string;
      header: string;
      prefix: string;
    };
    protocols: string[];
  };
  server: {
    port: number;
    host: string;
  };
  security: {
    validate_inbound: boolean;
    max_payload_size: number;
    max_requests_per_minute: number;
    allowed_origins: string[];
  };
}

interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  url: string;
  capabilities: AgentCapability[];
  authentication: {
    schemes: Array<{
      type: string;
      header: string;
      prefix: string;
    }>;
  };
  supportedProtocols: string[];
}

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

interface A2ATask {
  id: string;
  status: "submitted" | "working" | "completed" | "failed" | "canceled";
  message?: {
    role: string;
    parts: Array<{ type: string; text?: string }>;
  };
  createdAt: string;
  updatedAt: string;
}

interface A2AEvent {
  ts: string;
  type: "inbound" | "outbound" | "discover" | "security" | "server";
  method?: string;
  agent?: string;
  taskId?: string;
  status?: string;
  details?: string;
}

// ============================================================
// HELPERS
// ============================================================

function loadConfig(): AgentConfig {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Error: Config file not found at ${CONFIG_PATH}`);
    process.exit(2);
  }
  const content = readFileSync(CONFIG_PATH, "utf-8");
  return parseYaml(content) as AgentConfig;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function logEvent(event: A2AEvent): void {
  try {
    ensureDataDir();
    appendFileSync(EVENTS_PATH, JSON.stringify(event) + "\n");
  } catch {
    // Event logging failure is non-fatal
  }
}

function generateAgentCard(config: AgentConfig): A2AAgentCard {
  return {
    name: config.agent.name,
    description: config.agent.description,
    version: config.agent.version,
    url: config.agent.url,
    capabilities: config.agent.capabilities,
    authentication: {
      schemes: [
        {
          type: config.agent.auth.type,
          header: config.agent.auth.header,
          prefix: config.agent.auth.prefix,
        },
      ],
    },
    supportedProtocols: config.agent.protocols,
  };
}

function makeJsonRpcResponse(
  id: string | number | null,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    result,
    id,
  };
}

function makeJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    error: { code, message, data },
    id,
  };
}

// ============================================================
// TASK STORE (in-memory for this server instance)
// ============================================================

const taskStore = new Map<string, A2ATask>();

// ============================================================
// SERVE SUBCOMMAND
// ============================================================

function runServe(options: { port: number; host: string }): void {
  const config = loadConfig();
  const agentCard = generateAgentCard(config);
  const maxPayload = config.security.max_payload_size;

  // Rate limiting state
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  const maxRpm = config.security.max_requests_per_minute;

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
      return true;
    }

    entry.count++;
    if (entry.count > maxRpm) {
      return false;
    }
    return true;
  }

  // CORS headers
  function corsHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = config.security.allowed_origins;
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (allowedOrigins.length === 0) {
      headers["Access-Control-Allow-Origin"] = "*";
    } else if (origin && allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }

    return headers;
  }

  // JSON-RPC method handlers
  function handleTasksSend(
    params: Record<string, unknown>,
    requestId: string | number | null
  ): JsonRpcResponse {
    const message = params.message as {
      role?: string;
      parts?: Array<{ type?: string; text?: string }>;
    } | undefined;

    if (!message || !message.role || !message.parts) {
      return makeJsonRpcError(
        requestId,
        -32602,
        "Invalid params: message must have role and parts"
      );
    }

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const task: A2ATask = {
      id: taskId,
      status: "submitted",
      message: {
        role: message.role,
        parts: (message.parts || []).map((p) => ({
          type: p.type || "text",
          text: p.text,
        })),
      },
      createdAt: now,
      updatedAt: now,
    };

    taskStore.set(taskId, task);

    logEvent({
      ts: now,
      type: "inbound",
      method: "tasks/send",
      taskId,
      status: "submitted",
      details: message.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join(" ")
        .slice(0, 200),
    });

    return makeJsonRpcResponse(requestId, {
      id: taskId,
      status: "submitted",
      createdAt: now,
    });
  }

  function handleTasksGet(
    params: Record<string, unknown>,
    requestId: string | number | null
  ): JsonRpcResponse {
    const taskId = params.id as string | undefined;

    if (!taskId) {
      return makeJsonRpcError(
        requestId,
        -32602,
        "Invalid params: id is required"
      );
    }

    const task = taskStore.get(taskId);
    if (!task) {
      return makeJsonRpcError(requestId, -32001, "Task not found");
    }

    return makeJsonRpcResponse(requestId, {
      id: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  }

  function handleTasksCancel(
    params: Record<string, unknown>,
    requestId: string | number | null
  ): JsonRpcResponse {
    const taskId = params.id as string | undefined;

    if (!taskId) {
      return makeJsonRpcError(
        requestId,
        -32602,
        "Invalid params: id is required"
      );
    }

    const task = taskStore.get(taskId);
    if (!task) {
      return makeJsonRpcError(requestId, -32001, "Task not found");
    }

    if (task.status === "completed" || task.status === "failed") {
      return makeJsonRpcError(
        requestId,
        -32002,
        `Cannot cancel task in ${task.status} state`
      );
    }

    task.status = "canceled";
    task.updatedAt = new Date().toISOString();

    logEvent({
      ts: task.updatedAt,
      type: "inbound",
      method: "tasks/cancel",
      taskId: task.id,
      status: "canceled",
    });

    return makeJsonRpcResponse(requestId, {
      id: task.id,
      status: task.status,
      updatedAt: task.updatedAt,
    });
  }

  // Start server
  const server = Bun.serve({
    port: options.port,
    hostname: options.host,

    async fetch(req) {
      const url = new URL(req.url);
      const origin = req.headers.get("origin") || undefined;
      const headers = corsHeaders(origin);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }

      // Client IP for rate limiting
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";

      // Rate limit check
      if (!checkRateLimit(ip)) {
        return new Response(
          JSON.stringify(
            makeJsonRpcError(null, -32099, "Rate limit exceeded")
          ),
          {
            status: 429,
            headers: { ...headers, "Content-Type": "application/json" },
          }
        );
      }

      // GET /.well-known/agent.json -- Agent Card
      if (
        req.method === "GET" &&
        url.pathname === "/.well-known/agent.json"
      ) {
        return new Response(JSON.stringify(agentCard, null, 2), {
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      // GET /health -- Health check
      if (req.method === "GET" && url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            agent: agentCard.name,
            version: agentCard.version,
            tasks: taskStore.size,
            uptime: process.uptime(),
          }),
          {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
          }
        );
      }

      // POST / -- JSON-RPC endpoint
      if (req.method === "POST" && url.pathname === "/") {
        // Check content length
        const contentLength = parseInt(
          req.headers.get("content-length") || "0",
          10
        );
        if (contentLength > maxPayload) {
          return new Response(
            JSON.stringify(
              makeJsonRpcError(null, -32003, "Payload too large")
            ),
            {
              status: 413,
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            }
          );
        }

        let body: string;
        try {
          body = await req.text();
        } catch {
          return new Response(
            JSON.stringify(
              makeJsonRpcError(null, -32700, "Parse error")
            ),
            {
              status: 400,
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            }
          );
        }

        // Double-check payload size after reading
        if (body.length > maxPayload) {
          return new Response(
            JSON.stringify(
              makeJsonRpcError(null, -32003, "Payload too large")
            ),
            {
              status: 413,
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            }
          );
        }

        let rpcReq: JsonRpcRequest;
        try {
          rpcReq = JSON.parse(body) as JsonRpcRequest;
        } catch {
          return new Response(
            JSON.stringify(
              makeJsonRpcError(null, -32700, "Parse error: invalid JSON")
            ),
            {
              status: 400,
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            }
          );
        }

        // Validate JSON-RPC 2.0
        if (rpcReq.jsonrpc !== "2.0") {
          return new Response(
            JSON.stringify(
              makeJsonRpcError(
                rpcReq.id ?? null,
                -32600,
                "Invalid request: jsonrpc must be '2.0'"
              )
            ),
            {
              status: 400,
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            }
          );
        }

        const requestId = rpcReq.id ?? null;
        const params = (rpcReq.params || {}) as Record<string, unknown>;

        let response: JsonRpcResponse;

        switch (rpcReq.method) {
          case "tasks/send":
            response = handleTasksSend(params, requestId);
            break;

          case "tasks/get":
            response = handleTasksGet(params, requestId);
            break;

          case "tasks/cancel":
            response = handleTasksCancel(params, requestId);
            break;

          default:
            response = makeJsonRpcError(
              requestId,
              -32601,
              `Method not found: ${rpcReq.method}`
            );
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      // 404 for everything else
      return new Response(
        JSON.stringify({ error: "Not found", path: url.pathname }),
        {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    },
  });

  logEvent({
    ts: new Date().toISOString(),
    type: "server",
    status: "started",
    details: `Listening on ${options.host}:${options.port}`,
  });

  console.log(`A2ABridge Server v1.0.0`);
  console.log(`Agent: ${agentCard.name} (${agentCard.version})`);
  console.log(`Listening: http://${options.host}:${options.port}`);
  console.log(`Agent Card: http://${options.host}:${options.port}/.well-known/agent.json`);
  console.log(`Health:     http://${options.host}:${options.port}/health`);
  console.log(`JSON-RPC:   POST http://${options.host}:${options.port}/`);
  console.log("");
  console.log(`Rate limit: ${maxRpm} req/min`);
  console.log(`Max payload: ${(maxPayload / 1024).toFixed(0)} KB`);
  console.log("");
  console.log("Press Ctrl+C to stop.");

  // Graceful shutdown
  function shutdown() {
    console.log("\nShutting down A2ABridge server...");
    logEvent({
      ts: new Date().toISOString(),
      type: "server",
      status: "stopped",
      details: `Handled ${taskStore.size} task(s) this session`,
    });
    server.stop();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ============================================================
// SEND SUBCOMMAND
// ============================================================

async function runSend(
  agentUrl: string,
  taskText: string,
  options: { apiKey?: string }
): Promise<number> {
  // Normalize URL
  const baseUrl = agentUrl.replace(/\/+$/, "");

  // Step 1: Fetch agent card
  console.log(`Fetching agent card from ${baseUrl}/.well-known/agent.json ...`);

  let agentCard: A2AAgentCard | null = null;
  try {
    const cardUrl = `${baseUrl}/.well-known/agent.json`;
    const resp = await fetch(cardUrl, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      agentCard = (await resp.json()) as A2AAgentCard;
      console.log(`  Agent: ${agentCard.name} (${agentCard.version})`);
      console.log(
        `  Capabilities: ${agentCard.capabilities.map((c) => c.name).join(", ")}`
      );
    } else {
      console.log(`  Warning: Could not fetch agent card (HTTP ${resp.status})`);
      console.log("  Proceeding with direct send...");
    }
  } catch (e) {
    console.log(`  Warning: Could not fetch agent card: ${e}`);
    console.log("  Proceeding with direct send...");
  }

  // Step 2: Construct JSON-RPC request
  const rpcRequest: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "tasks/send",
    params: {
      message: {
        role: "user",
        parts: [{ type: "text", text: taskText }],
      },
    },
    id: crypto.randomUUID(),
  };

  // Step 3: Send request
  console.log(`\nSending task to ${baseUrl} ...`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.apiKey) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }

  try {
    const resp = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await resp.text();

    let rpcResp: JsonRpcResponse;
    try {
      rpcResp = JSON.parse(responseText) as JsonRpcResponse;
    } catch {
      console.error(`Error: Invalid JSON response from agent`);
      console.error(`Response: ${responseText.slice(0, 500)}`);
      return 2;
    }

    if (rpcResp.error) {
      console.error(`Error from agent: [${rpcResp.error.code}] ${rpcResp.error.message}`);
      logEvent({
        ts: new Date().toISOString(),
        type: "outbound",
        method: "tasks/send",
        agent: agentCard?.name || baseUrl,
        status: "error",
        details: rpcResp.error.message,
      });
      return 2;
    }

    const result = rpcResp.result as Record<string, unknown> | undefined;
    const taskId = result?.id as string | undefined;
    const status = result?.status as string | undefined;

    console.log(`\nTask sent successfully.`);
    console.log(`  Task ID: ${taskId || "unknown"}`);
    console.log(`  Status: ${status || "unknown"}`);
    console.log(`  Agent: ${agentCard?.name || baseUrl}`);

    logEvent({
      ts: new Date().toISOString(),
      type: "outbound",
      method: "tasks/send",
      agent: agentCard?.name || baseUrl,
      taskId: taskId || "unknown",
      status: status || "unknown",
      details: taskText.slice(0, 200),
    });

    return 0;
  } catch (e) {
    console.error(`Error sending task: ${e}`);
    logEvent({
      ts: new Date().toISOString(),
      type: "outbound",
      method: "tasks/send",
      agent: agentCard?.name || baseUrl,
      status: "error",
      details: String(e).slice(0, 200),
    });
    return 2;
  }
}

// ============================================================
// DISCOVER SUBCOMMAND
// ============================================================

async function runDiscover(): Promise<number> {
  const knownPorts = [8889, 8890, 8891];
  const discovered: Array<{ url: string; card: A2AAgentCard }> = [];

  console.log("A2ABridge Agent Discovery");
  console.log(`Scanning ${knownPorts.length} known ports on localhost...\n`);

  for (const port of knownPorts) {
    const url = `http://localhost:${port}`;
    const cardUrl = `${url}/.well-known/agent.json`;

    try {
      const resp = await fetch(cardUrl, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const card = (await resp.json()) as A2AAgentCard;
        discovered.push({ url, card });
        console.log(`  [${port}] FOUND: ${card.name} (${card.version})`);
        console.log(`         ${card.description}`);
        console.log(
          `         Capabilities: ${card.capabilities.map((c) => c.name).join(", ")}`
        );
        console.log(
          `         Protocols: ${card.supportedProtocols?.join(", ") || "unknown"}`
        );
        console.log("");
      } else {
        console.log(`  [${port}] No agent (HTTP ${resp.status})`);
      }
    } catch {
      console.log(`  [${port}] No agent (connection refused)`);
    }
  }

  console.log("");

  if (discovered.length === 0) {
    console.log("No A2A agents discovered on localhost.");
    console.log("Start an agent with: bun run A2AServer.ts serve");
  } else {
    console.log(`Discovered ${discovered.length} agent(s):`);
    for (const { url, card } of discovered) {
      console.log(`  - ${card.name} at ${url}`);
    }
  }

  // Log discovery event
  logEvent({
    ts: new Date().toISOString(),
    type: "discover",
    status: discovered.length > 0 ? "found" : "none",
    details: `Scanned ${knownPorts.length} ports, found ${discovered.length} agent(s)`,
  });

  return 0;
}

// ============================================================
// CARD SUBCOMMAND
// ============================================================

function runCard(options: { validate: boolean }): number {
  const config = loadConfig();
  const card = generateAgentCard(config);

  if (options.validate) {
    console.log("Validating Agent Card...\n");

    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!card.name) errors.push("Missing required field: name");
    if (!card.description)
      errors.push("Missing required field: description");
    if (!card.url) errors.push("Missing required field: url");
    if (!card.version) warnings.push("Missing recommended field: version");

    // Capabilities
    if (!card.capabilities || card.capabilities.length === 0) {
      warnings.push("No capabilities defined");
    } else {
      for (const cap of card.capabilities) {
        if (!cap.name) errors.push("Capability missing name");
        if (!cap.description) warnings.push(`Capability "${cap.name}" missing description`);
      }
    }

    // URL validation
    try {
      new URL(card.url);
    } catch {
      errors.push(`Invalid URL: ${card.url}`);
    }

    // Authentication
    if (
      !card.authentication ||
      !card.authentication.schemes ||
      card.authentication.schemes.length === 0
    ) {
      warnings.push("No authentication schemes defined");
    }

    // Protocols
    if (!card.supportedProtocols || card.supportedProtocols.length === 0) {
      warnings.push("No supported protocols listed");
    }

    // Report
    if (errors.length > 0) {
      console.log("ERRORS:");
      for (const err of errors) {
        console.log(`  - ${err}`);
      }
      console.log("");
    }

    if (warnings.length > 0) {
      console.log("WARNINGS:");
      for (const warn of warnings) {
        console.log(`  - ${warn}`);
      }
      console.log("");
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log("Validation: PASS (no issues found)\n");
    } else if (errors.length === 0) {
      console.log(
        `Validation: PASS with ${warnings.length} warning(s)\n`
      );
    } else {
      console.log(
        `Validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))\n`
      );
    }

    // Print the card
    console.log("Generated Agent Card:");
    console.log(JSON.stringify(card, null, 2));

    return errors.length > 0 ? 2 : warnings.length > 0 ? 1 : 0;
  }

  // Just print the card
  console.log(JSON.stringify(card, null, 2));
  return 0;
}

// ============================================================
// USAGE
// ============================================================

function printUsage(): void {
  console.log(`A2ABridge - Google A2A Protocol Server & Client

Usage:
  bun run A2AServer.ts serve [options]        Start A2A protocol server
  bun run A2AServer.ts send <url> <task>      Send task to external agent
  bun run A2AServer.ts discover               Discover A2A agents on network
  bun run A2AServer.ts card [--validate]      Generate/validate Agent Card
  bun run A2AServer.ts --help                 Show this help

Server Options:
  --port <N>         Server port (default: 8889)
  --host <addr>      Bind address (default: 0.0.0.0)

Send Options:
  --api-key <key>    API key for authentication`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "serve": {
      const config = loadConfig();
      let port = config.server.port;
      let host = config.server.host;

      // Parse options
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--port" && args[i + 1]) {
          port = parseInt(args[i + 1], 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            console.error("Error: Invalid port number");
            process.exit(2);
          }
          i++;
        } else if (args[i] === "--host" && args[i + 1]) {
          host = args[i + 1];
          i++;
        }
      }

      ensureDataDir();
      runServe({ port, host });
      break;
    }

    case "send": {
      const agentUrl = args[1];
      const taskText = args[2];

      if (!agentUrl || !taskText) {
        console.error("Error: send requires <url> and <task> arguments");
        console.error('Usage: bun run A2AServer.ts send <url> "<task>"');
        process.exit(2);
      }

      let apiKey: string | undefined;
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--api-key" && args[i + 1]) {
          apiKey = args[i + 1];
          i++;
        }
      }

      ensureDataDir();
      const exitCode = await runSend(agentUrl, taskText, { apiKey });
      process.exit(exitCode);
      break;
    }

    case "discover": {
      ensureDataDir();
      const exitCode = await runDiscover();
      process.exit(exitCode);
      break;
    }

    case "card": {
      const validate = args.includes("--validate");
      const exitCode = runCard({ validate });
      process.exit(exitCode);
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printUsage();
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`Fatal error: ${e}`);
  process.exit(2);
});

#!/usr/bin/env bun
/**
 * OpenCTI Client for Recon Skill
 *
 * Integrates reconnaissance findings with OpenCTI threat intelligence platform.
 *
 * Usage:
 *   bun OpenCTIClient.ts query-ip 1.2.3.4
 *   bun OpenCTIClient.ts query-domain example.com
 *   bun OpenCTIClient.ts create-observable ipv4 1.2.3.4
 *   bun OpenCTIClient.ts create-observable domain example.com
 *   bun OpenCTIClient.ts create-indicator "[ipv4-addr:value = '1.2.3.4']" "Malicious IP"
 *   bun OpenCTIClient.ts health
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

interface OpenCTIConfig {
  service: string;
  url: string;
  api: {
    endpoint: string;
    token: string;
    headers: Record<string, string>;
  };
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[] }>;
}

interface Observable {
  id: string;
  entity_type: string;
  observable_value: string;
  x_opencti_description?: string;
  createdBy?: { name: string };
  objectLabel?: { edges: Array<{ node: { value: string } }> };
  indicators?: { edges: Array<{ node: { name: string; pattern: string } }> };
}

interface Indicator {
  id: string;
  name: string;
  pattern: string;
  pattern_type: string;
  valid_from: string;
  x_opencti_score?: number;
  createdBy?: { name: string };
}

interface ThreatContext {
  observable?: Observable;
  indicators: Indicator[];
  labels: string[];
  relatedThreats: string[];
  riskScore: number;
  summary: string;
}

// ============================================================================
// Config Loading
// ============================================================================

function loadConfig(): OpenCTIConfig {
  const configPath = join(homedir(), ".claude/skills/PAI/USER/SERVICES/opencti.json");

  if (!existsSync(configPath)) {
    throw new Error(`OpenCTI config not found at ${configPath}. Run OpenCTI setup first.`);
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  return config as OpenCTIConfig;
}

// ============================================================================
// GraphQL Client
// ============================================================================

async function graphqlQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const config = loadConfig();

  const response = await fetch(config.api.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.api.token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`OpenCTI API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<GraphQLResponse<T>>;
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkHealth(): Promise<{ status: string; version?: string }> {
  try {
    const result = await graphqlQuery<{ me: { name: string } }>(`
      query { me { name } }
    `);

    if (result.errors) {
      return { status: "error", version: result.errors[0].message };
    }

    return { status: "healthy", version: "connected" };
  } catch (error) {
    return { status: "unreachable", version: String(error) };
  }
}

// ============================================================================
// Query Context - Get threat intel for a target
// ============================================================================

export async function queryContext(
  type: "ipv4" | "ipv6" | "domain" | "url" | "email",
  value: string
): Promise<ThreatContext> {
  const typeMap: Record<string, string> = {
    ipv4: "IPv4-Addr",
    ipv6: "IPv6-Addr",
    domain: "Domain-Name",
    url: "Url",
    email: "Email-Addr",
  };

  const entityType = typeMap[type];

  // Query for existing observable
  const observableResult = await graphqlQuery<{
    stixCyberObservables: {
      edges: Array<{ node: Observable }>;
    };
  }>(`
    query QueryObservable($value: String!) {
      stixCyberObservables(
        filters: {
          mode: and
          filters: [{ key: "value", values: [$value] }]
          filterGroups: []
        }
        first: 1
      ) {
        edges {
          node {
            id
            entity_type
            observable_value
            x_opencti_description
            createdBy { name }
            objectLabel { edges { node { value } } }
            indicators {
              edges {
                node {
                  name
                  pattern
                  x_opencti_score
                }
              }
            }
          }
        }
      }
    }
  `, { value });

  const observable = observableResult.data?.stixCyberObservables?.edges?.[0]?.node;

  // Query for indicators containing this value
  const indicatorResult = await graphqlQuery<{
    indicators: {
      edges: Array<{ node: Indicator }>;
    };
  }>(`
    query QueryIndicators($pattern: String!) {
      indicators(
        filters: {
          mode: and
          filters: [{ key: "pattern", values: [$pattern], operator: contains }]
          filterGroups: []
        }
        first: 10
      ) {
        edges {
          node {
            id
            name
            pattern
            pattern_type
            valid_from
            x_opencti_score
            createdBy { name }
          }
        }
      }
    }
  `, { pattern: value });

  const indicators = indicatorResult.data?.indicators?.edges?.map(e => e.node) || [];
  const labels = observable?.objectLabel?.edges?.map(e => e.node.value) || [];

  // Calculate risk score
  let riskScore = 0;
  if (observable) riskScore += 20;
  if (indicators.length > 0) riskScore += Math.min(indicators.length * 20, 60);
  if (labels.some(l => l.toLowerCase().includes("malicious"))) riskScore += 20;

  // Generate summary
  let summary = "No threat intelligence found for this target.";
  if (observable || indicators.length > 0) {
    const parts: string[] = [];
    if (observable) parts.push("Known observable in threat database");
    if (indicators.length > 0) parts.push(`${indicators.length} indicator(s) match`);
    if (labels.length > 0) parts.push(`Labels: ${labels.join(", ")}`);
    summary = parts.join(". ") + ".";
  }

  return {
    observable,
    indicators,
    labels,
    relatedThreats: [], // Could expand to query related threat actors
    riskScore: Math.min(riskScore, 100),
    summary,
  };
}

// ============================================================================
// Create Observable - Ingest finding into OpenCTI
// ============================================================================

export async function createObservable(
  type: "ipv4" | "ipv6" | "domain" | "url" | "email" | "hostname",
  value: string,
  options?: {
    description?: string;
    labels?: string[];
    score?: number;
  }
): Promise<{ id: string; success: boolean; message: string }> {
  const typeMap: Record<string, { stixType: string; inputField: string }> = {
    ipv4: { stixType: "IPv4-Addr", inputField: "IPv4Addr" },
    ipv6: { stixType: "IPv6-Addr", inputField: "IPv6Addr" },
    domain: { stixType: "Domain-Name", inputField: "DomainName" },
    url: { stixType: "Url", inputField: "Url" },
    email: { stixType: "Email-Addr", inputField: "EmailAddr" },
    hostname: { stixType: "Hostname", inputField: "Hostname" },
  };

  const typeInfo = typeMap[type];
  if (!typeInfo) {
    return { id: "", success: false, message: `Unknown type: ${type}` };
  }

  // Build mutation with correct OpenCTI format
  const mutation = `
    mutation CreateObservable($value: String!, $description: String) {
      stixCyberObservableAdd(
        type: "${typeInfo.stixType}"
        ${typeInfo.inputField}: { value: $value }
        x_opencti_description: $description
      ) {
        id
        observable_value
      }
    }
  `;

  const result = await graphqlQuery<{
    stixCyberObservableAdd: { id: string; observable_value: string };
  }>(mutation, {
    value,
    description: options?.description,
  });

  if (result.errors) {
    return {
      id: "",
      success: false,
      message: result.errors.map(e => e.message).join(", ")
    };
  }

  return {
    id: result.data?.stixCyberObservableAdd?.id || "",
    success: true,
    message: `Created ${type} observable: ${value}`,
  };
}

// ============================================================================
// Create Indicator - Mark as malicious with STIX pattern
// ============================================================================

export async function createIndicator(
  pattern: string,
  name: string,
  options?: {
    description?: string;
    validFrom?: string;
    validUntil?: string;
    score?: number;
    labels?: string[];
  }
): Promise<{ id: string; success: boolean; message: string }> {
  const result = await graphqlQuery<{
    indicatorAdd: { id: string; name: string };
  }>(`
    mutation CreateIndicator($input: IndicatorAddInput!) {
      indicatorAdd(input: $input) {
        id
        name
      }
    }
  `, {
    input: {
      name,
      pattern,
      pattern_type: "stix",
      x_opencti_main_observable_type: inferObservableType(pattern),
      valid_from: options?.validFrom || new Date().toISOString(),
      valid_until: options?.validUntil,
      x_opencti_score: options?.score || 50,
      description: options?.description,
    },
  });

  if (result.errors) {
    return {
      id: "",
      success: false,
      message: result.errors.map(e => e.message).join(", "),
    };
  }

  return {
    id: result.data?.indicatorAdd?.id || "",
    success: true,
    message: `Created indicator: ${name}`,
  };
}

// ============================================================================
// Ingest Recon Finding - High-level function for Recon integration
// ============================================================================

export async function ingestFinding(finding: {
  type: "ip" | "domain" | "url" | "email";
  value: string;
  source: string;
  description?: string;
  tags?: string[];
  isMalicious?: boolean;
}): Promise<{ observableId?: string; indicatorId?: string; success: boolean; message: string }> {
  const typeMap: Record<string, "ipv4" | "domain" | "url" | "email"> = {
    ip: "ipv4",
    domain: "domain",
    url: "url",
    email: "email",
  };

  const obsType = typeMap[finding.type];

  // Create observable
  const obsResult = await createObservable(obsType, finding.value, {
    description: `${finding.description || "Discovered during recon"} [Source: ${finding.source}]`,
  });

  let indicatorId: string | undefined;

  // If marked malicious, create indicator
  if (finding.isMalicious) {
    const pattern = buildStixPattern(finding.type, finding.value);
    const indResult = await createIndicator(
      pattern,
      `Malicious ${finding.type}: ${finding.value}`,
      {
        description: finding.description,
        score: 75,
      }
    );
    if (indResult.success) {
      indicatorId = indResult.id;
    }
  }

  return {
    observableId: obsResult.success ? obsResult.id : undefined,
    indicatorId,
    success: obsResult.success,
    message: obsResult.message + (indicatorId ? ` + indicator created` : ""),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildStixPattern(type: string, value: string): string {
  const patterns: Record<string, string> = {
    ip: `[ipv4-addr:value = '${value}']`,
    ipv4: `[ipv4-addr:value = '${value}']`,
    ipv6: `[ipv6-addr:value = '${value}']`,
    domain: `[domain-name:value = '${value}']`,
    url: `[url:value = '${value}']`,
    email: `[email-addr:value = '${value}']`,
  };
  return patterns[type] || `[x-custom:value = '${value}']`;
}

function inferObservableType(pattern: string): string {
  if (pattern.includes("ipv4-addr")) return "IPv4-Addr";
  if (pattern.includes("ipv6-addr")) return "IPv6-Addr";
  if (pattern.includes("domain-name")) return "Domain-Name";
  if (pattern.includes("url:")) return "Url";
  if (pattern.includes("email-addr")) return "Email-Addr";
  return "Unknown";
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
OpenCTI Client for Recon Skill

Usage:
  bun OpenCTIClient.ts <command> [options]

Commands:
  health                           Check OpenCTI connection
  query-ip <ip>                    Query threat context for IP
  query-domain <domain>            Query threat context for domain
  create-observable <type> <value> Create observable (ipv4|domain|url|email)
  create-indicator <pattern> <name> Create STIX indicator
  ingest <type> <value> [source]   Ingest finding from recon

Examples:
  bun OpenCTIClient.ts health
  bun OpenCTIClient.ts query-ip 1.2.3.4
  bun OpenCTIClient.ts query-domain evil.com
  bun OpenCTIClient.ts create-observable ipv4 192.168.1.1
  bun OpenCTIClient.ts create-indicator "[ipv4-addr:value = '1.2.3.4']" "C2 Server"
  bun OpenCTIClient.ts ingest ip 1.2.3.4 "Recon-DomainScan"
`);
    process.exit(0);
  }

  try {
    switch (command) {
      case "health": {
        const health = await checkHealth();
        console.log(JSON.stringify(health, null, 2));
        break;
      }

      case "query-ip": {
        const ip = args[1];
        if (!ip) throw new Error("IP address required");
        const context = await queryContext("ipv4", ip);
        console.log(JSON.stringify(context, null, 2));
        break;
      }

      case "query-domain": {
        const domain = args[1];
        if (!domain) throw new Error("Domain required");
        const context = await queryContext("domain", domain);
        console.log(JSON.stringify(context, null, 2));
        break;
      }

      case "create-observable": {
        const type = args[1] as "ipv4" | "domain" | "url" | "email";
        const value = args[2];
        if (!type || !value) throw new Error("Type and value required");
        const result = await createObservable(type, value);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "create-indicator": {
        const pattern = args[1];
        const name = args[2];
        if (!pattern || !name) throw new Error("Pattern and name required");
        const result = await createIndicator(pattern, name);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "ingest": {
        const type = args[1] as "ip" | "domain" | "url" | "email";
        const value = args[2];
        const source = args[3] || "Recon";
        if (!type || !value) throw new Error("Type and value required");
        const result = await ingestFinding({ type, value, source });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

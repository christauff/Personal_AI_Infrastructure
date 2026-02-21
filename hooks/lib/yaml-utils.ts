/**
 * YAML Generation Utilities for Tide Pools
 *
 * Generates seed files for the POOLS/ system following ORCHESTRATOR.md format.
 */

export type PoolType =
  | 'research-pool'
  | 'synthesis-pool'
  | 'creative-pool'
  | 'integration-pool'
  | 'exploration-pool';

export type Priority = 'high' | 'medium' | 'low';

export interface PoolSeed {
  type: PoolType;
  topic: string;
  context: string;
  budget: number;
  priority: Priority;
  session_id?: string;
  generated?: string;
}

/**
 * Generate YAML content for a pool seed
 */
export function generateSeedYAML(seed: PoolSeed): string {
  const timestamp = seed.generated || new Date().toISOString();

  // Indent context lines for YAML block scalar
  const contextLines = seed.context.split('\n');
  const indentedContext = contextLines
    .map(line => line.trim() ? `  ${line}` : '')
    .join('\n');

  return `# Tide Pool Seed - Auto-generated
# Generated: ${timestamp}
${seed.session_id ? `# Session: ${seed.session_id}` : ''}

type: ${seed.type}
topic: "${seed.topic}"
context: |
${indentedContext}
budget: ${seed.budget}
priority: ${seed.priority}
`;
}

/**
 * Sanitize topic for filename (lowercase, dash-separated, max 40 chars)
 */
export function sanitizeTopicForFilename(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Generate filename for seed: {type}-{topic-slug}-{timestamp}.yaml
 */
export function generateSeedFilename(seed: PoolSeed): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '');
  const topicSlug = sanitizeTopicForFilename(seed.topic);
  const typePrefix = seed.type.replace('-pool', '');

  return `${typePrefix}-${topicSlug}-${timestamp}.yaml`;
}

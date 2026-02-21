#!/usr/bin/env bun
/**
 * Apify Actor Registry Loader
 *
 * Parses actors.yaml and provides typed access to actor definitions.
 * Run directly to validate and display registry: `bun run Registry/loader.ts`
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type {
  ActorRegistry,
  ActorDefinition,
  ActorMatch,
  ActorCategory,
  LoaderOptions
} from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = join(__dirname, 'actors.yaml')

/**
 * Simple YAML parser for our specific schema
 * Handles: scalars, arrays, nested objects (2 levels)
 */
function parseYaml(content: string): any {
  const result: any = {}
  const lines = content.split('\n')
  let currentSection: string | null = null
  let currentActor: string | null = null
  let currentActorData: any = null
  let inArray = false
  let arrayKey = ''
  let arrayValues: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue

    // Top-level keys (version, updatedAt, actors)
    const topMatch = line.match(/^(\w+):\s*(.*)$/)
    if (topMatch) {
      // Save previous array if any
      if (inArray && currentActorData) {
        currentActorData[arrayKey] = arrayValues
        inArray = false
        arrayValues = []
      }

      const [, key, value] = topMatch
      if (value && value.trim() !== '') {
        result[key] = value.replace(/^["']|["']$/g, '')
      } else if (key === 'actors') {
        currentSection = 'actors'
        result.actors = {}
      }
      continue
    }

    // Actor name (2-space indent)
    const actorMatch = line.match(/^  (\w[\w-]*):\s*$/)
    if (actorMatch && currentSection === 'actors') {
      // Save previous actor
      if (currentActor && currentActorData) {
        if (inArray) {
          currentActorData[arrayKey] = arrayValues
          inArray = false
          arrayValues = []
        }
        result.actors[currentActor] = currentActorData
      }

      currentActor = actorMatch[1]
      currentActorData = {}
      continue
    }

    // Actor property (4-space indent)
    const propMatch = line.match(/^    (\w+):\s*(.*)$/)
    if (propMatch && currentActorData) {
      // Save previous array if any
      if (inArray) {
        currentActorData[arrayKey] = arrayValues
        inArray = false
        arrayValues = []
      }

      const [, key, value] = propMatch
      if (value && value.trim() !== '') {
        // Parse value
        let parsed: any = value.replace(/^["']|["']$/g, '')
        if (parsed === 'true') parsed = true
        else if (parsed === 'false') parsed = false
        else if (/^\d+(\.\d+)?$/.test(parsed)) parsed = parseFloat(parsed)

        currentActorData[key] = parsed
      } else {
        // Array or nested object starts
        inArray = true
        arrayKey = key
        arrayValues = []
      }
      continue
    }

    // Array item (6-space indent with -)
    const arrayMatch = line.match(/^      - (.+)$/)
    if (arrayMatch && inArray) {
      let val = arrayMatch[1].replace(/^["']|["']$/g, '')
      // Unescape YAML double backslashes (\\. → \.)
      val = val.replace(/\\\\/g, '\\')
      arrayValues.push(val)
      continue
    }
  }

  // Save last actor
  if (currentActor && currentActorData) {
    if (inArray) {
      currentActorData[arrayKey] = arrayValues
    }
    result.actors[currentActor] = currentActorData
  }

  return result
}

/**
 * Load and parse the actor registry
 */
export function loadRegistry(): ActorRegistry {
  const content = readFileSync(REGISTRY_PATH, 'utf-8')
  const raw = parseYaml(content)

  // Convert to typed registry
  const registry: ActorRegistry = {
    version: raw.version || '1.0.0',
    updatedAt: raw.updatedAt || new Date().toISOString().split('T')[0],
    actors: {}
  }

  for (const [key, data] of Object.entries(raw.actors || {})) {
    const actor = data as any
    registry.actors[key] = {
      id: actor.id,
      name: actor.name,
      category: actor.category as ActorCategory,
      triggers: actor.triggers || [],
      urlPatterns: actor.urlPatterns || [],
      capabilities: actor.capabilities || [],
      costPer1k: actor.costPer1k || 0,
      cacheTtl: actor.cacheTtl || 3600,
      wrapper: actor.wrapper,
      implemented: actor.implemented ?? false,
      notes: actor.notes
    }
  }

  return registry
}

/**
 * Get all actors, optionally filtered
 */
export function getActors(options?: LoaderOptions): ActorDefinition[] {
  const registry = loadRegistry()
  let actors = Object.values(registry.actors)

  if (options?.implementedOnly) {
    actors = actors.filter(a => a.implemented)
  }

  if (options?.category) {
    actors = actors.filter(a => a.category === options.category)
  }

  return actors
}

/**
 * Get actor by key
 */
export function getActor(key: string): ActorDefinition | undefined {
  const registry = loadRegistry()
  return registry.actors[key]
}

/**
 * Get actor by Apify ID
 */
export function getActorById(id: string): ActorDefinition | undefined {
  const registry = loadRegistry()
  return Object.values(registry.actors).find(a => a.id === id)
}

/**
 * Find actors matching a URL
 */
export function matchByUrl(url: string): ActorMatch[] {
  const actors = getActors({ implementedOnly: true })
  const matches: ActorMatch[] = []

  for (const actor of actors) {
    for (const pattern of actor.urlPatterns || []) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(url)) {
          matches.push({
            actor,
            score: 1.0,
            reason: 'url',
            matchedOn: pattern
          })
          break // Only one match per actor
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }
  }

  // Sort by cost (cheaper first for equivalent matches)
  return matches.sort((a, b) => a.actor.costPer1k - b.actor.costPer1k)
}

/**
 * Find actors matching a keyword/trigger
 */
export function matchByTrigger(query: string): ActorMatch[] {
  const actors = getActors({ implementedOnly: true })
  const matches: ActorMatch[] = []
  const queryLower = query.toLowerCase()

  for (const actor of actors) {
    for (const trigger of actor.triggers) {
      if (queryLower.includes(trigger.toLowerCase())) {
        matches.push({
          actor,
          score: trigger.length / query.length, // Longer trigger = more specific
          reason: 'trigger',
          matchedOn: trigger
        })
        break
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score)
}

// ============================================================================
// CLI: Run directly to validate and display registry
// ============================================================================

if (import.meta.main) {
  console.log('=== Apify Actor Registry ===\n')

  try {
    const registry = loadRegistry()
    console.log(`Version: ${registry.version}`)
    console.log(`Updated: ${registry.updatedAt}`)
    console.log(`Total Actors: ${Object.keys(registry.actors).length}\n`)

    // Group by category
    const byCategory: Record<string, ActorDefinition[]> = {}
    for (const actor of Object.values(registry.actors)) {
      const cat = actor.category
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(actor)
    }

    for (const [category, actors] of Object.entries(byCategory)) {
      console.log(`\n## ${category.toUpperCase()}`)
      console.log('-'.repeat(60))

      for (const actor of actors) {
        const status = actor.implemented ? '✅' : '⬜'
        console.log(`${status} ${actor.name}`)
        console.log(`   ID: ${actor.id}`)
        console.log(`   Triggers: ${actor.triggers.join(', ')}`)
        console.log(`   Cost: $${actor.costPer1k.toFixed(2)}/1k results`)
        if (actor.notes) {
          console.log(`   Notes: ${actor.notes}`)
        }
        console.log('')
      }
    }

    // Summary
    const implemented = Object.values(registry.actors).filter(a => a.implemented).length
    const total = Object.keys(registry.actors).length
    console.log('='.repeat(60))
    console.log(`Summary: ${implemented}/${total} actors implemented`)
    console.log('='.repeat(60))

  } catch (error: any) {
    console.error('❌ Failed to load registry:', error.message)
    process.exit(1)
  }
}

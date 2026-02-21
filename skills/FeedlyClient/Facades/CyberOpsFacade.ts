#!/usr/bin/env bun
/**
 * CyberOpsFacade.ts — Feedly data shaped for cyber operations intel
 *
 * Usage:
 *   bun CyberOpsFacade.ts enrich <CVE-ID>             Full CVE enrichment with actors + malware
 *   bun CyberOpsFacade.ts actor <name-or-id>           Threat actor deep profile
 *   bun CyberOpsFacade.ts malware <name-or-id>         Malware profile
 *   bun CyberOpsFacade.ts iocs <CVE-ID>                IoCs from CVE + related entities
 *   bun CyberOpsFacade.ts daily-digest [limit]          Full daily intel digest
 *   bun CyberOpsFacade.ts lookup <query>                Find entity by name
 *   bun CyberOpsFacade.ts rules <malware-entity-id>    Detection rules (YARA/Sigma)
 *
 * This facade:
 * - Calls FeedlyClient with consumer="cyber-ops"
 * - Follows relationship chains (CVE -> actors -> malware -> IoCs)
 * - Produces EnrichedCVE objects with full context
 * - Generates STIX 2.1 bundles for IoC sharing
 */

import * as Feedly from "../FeedlyClient";
import type {
  EnrichedCVE,
  FeedlyCVEEntity,
  FeedlyThreatActor,
  FeedlyMalware,
  STIXBundle,
  STIXObject,
  IoC,
} from "../Types";
import { randomUUID } from "crypto";

const CONSUMER = "cyber-ops";

/**
 * Enrich a CVE by following its relationship graph:
 * CVE -> related threat actors -> related malware
 *
 * Budget cost: 1 (CVE) + N (actors) + M (malware) requests
 * With 7-day cache on actors/malware, repeat enrichments cost 1 request.
 */
export async function enrichCVE(cveId: string): Promise<EnrichedCVE> {
  const cve = await Feedly.getCVE(cveId, CONSUMER);

  // Feedly's graph flows actor→CVE, not CVE→actor.
  // If the CVE entity has relatedThreatActors/relatedMalware (rare), follow them.
  // Otherwise, the rich CVE data (executiveSummary, detectedBy, exploits) IS the enrichment.
  const actors: FeedlyThreatActor[] = [];
  for (const ref of cve.relatedThreatActors || []) {
    try {
      const actor = await Feedly.getThreatActor(ref.id, CONSUMER);
      actors.push(actor);
    } catch (err) {
      console.error(`Failed to fetch actor ${ref.label}: ${err}`);
    }
  }

  const malware: FeedlyMalware[] = [];
  for (const ref of cve.relatedMalware || []) {
    try {
      const mal = await Feedly.getMalware(ref.id, CONSUMER);
      malware.push(mal);
    } catch (err) {
      console.error(`Failed to fetch malware ${ref.label}: ${err}`);
    }
  }

  const stixBundle = buildSTIXBundle(cve, actors, malware);

  // Extract actionable summary from Feedly AI fields
  const actionableSummary = (cve.executiveSummary || cve.whatSoWhat) ? {
    what: cve.whatSoWhat?.what || cve.description || "",
    soWhat: cve.whatSoWhat?.soWhat || "",
    mitigation: cve.executiveSummary?.mitigation || "",
    exploitation: cve.executiveSummary?.exploitation || "",
  } : undefined;

  // Extract scanner coverage
  const scannerCoverage = cve.detectedBy?.map(
    (d: { scannerName: string; detectionId: string }) => `${d.scannerName}:${d.detectionId}`
  );

  return { cve, actors, malware, stixBundle, actionableSummary, scannerCoverage };
}

/**
 * Collect all IoCs across a CVE's relationship graph.
 */
export async function collectIoCs(cveId: string): Promise<{
  cveId: string;
  iocs: IoC[];
  sources: string[];
}> {
  const enriched = await enrichCVE(cveId);
  const allIocs: IoC[] = [];
  const sources: string[] = [cveId];

  for (const actor of enriched.actors) {
    if (actor.iocs?.length) {
      allIocs.push(...actor.iocs);
      sources.push(actor.label);
    }
  }
  for (const mal of enriched.malware) {
    if (mal.iocs?.length) {
      allIocs.push(...mal.iocs);
      sources.push(mal.label);
    }
  }

  // Deduplicate by type+value
  const seen = new Set<string>();
  const unique = allIocs.filter(ioc => {
    const key = `${ioc.type}:${ioc.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { cveId, iocs: unique, sources };
}

/**
 * Look up an entity by name (actor, malware, or CVE).
 * Uses entity search to find the ID, then fetches full profile.
 */
export async function lookupEntity(query: string): Promise<{
  type: string;
  entity: FeedlyThreatActor | FeedlyMalware | FeedlyCVEEntity | null;
  searchResults: Awaited<ReturnType<typeof Feedly.searchEntities>>;
}> {
  const searchResults = await Feedly.searchEntities(query, CONSUMER);
  const entities = searchResults.entities || [];

  if (entities.length === 0) {
    return { type: "none", entity: null, searchResults };
  }

  const top = entities[0];

  if (top.type === "threatActor") {
    const entity = await Feedly.getThreatActor(top.id, CONSUMER);
    return { type: "threatActor", entity, searchResults };
  } else if (top.type === "malwareFamily") {
    const entity = await Feedly.getMalware(top.id, CONSUMER);
    return { type: "malwareFamily", entity, searchResults };
  } else if (top.type === "vulnerability" || top.id.startsWith("vulnerability/")) {
    const cveId = top.label.startsWith("CVE-") ? top.label : top.id;
    const entity = await Feedly.getCVE(cveId, CONSUMER);
    return { type: "vulnerability", entity, searchResults };
  }

  return { type: top.type, entity: null, searchResults };
}

/**
 * Daily digest: trending CVEs enriched with full context.
 * Budget-aware: enriches top N by default.
 */
export async function dailyDigest(limit = 5): Promise<{
  date: string;
  enrichedCVEs: EnrichedCVE[];
  trendingActors: Awaited<ReturnType<typeof Feedly.getTrendingActors>>;
  trendingMalware: Awaited<ReturnType<typeof Feedly.getTrendingMalware>>;
  actorSummary: Array<{ name: string; cveCount: number; motivation?: string }>;
}> {
  const [trending, trendingActors, trendingMalware] = await Promise.all([
    Feedly.getTrending(CONSUMER),
    Feedly.getTrendingActors(CONSUMER),
    Feedly.getTrendingMalware(CONSUMER),
  ]);

  // Take top N by severity
  const top = trending
    .sort((a, b) => {
      const aScore = (a.exploitedInTheWild ? 100 : 0) + (a.cvssV4 || a.cvssV3 || 0) * 10;
      const bScore = (b.exploitedInTheWild ? 100 : 0) + (b.cvssV4 || b.cvssV3 || 0) * 10;
      return bScore - aScore;
    })
    .slice(0, limit);

  const enrichedCVEs: EnrichedCVE[] = [];
  for (const cve of top) {
    try {
      const enriched = await enrichCVE(cve.cveid);
      enrichedCVEs.push(enriched);
    } catch (err) {
      console.error(`Failed to enrich ${cve.cveid}: ${err}`);
    }
  }

  // Summarize actors across all enriched CVEs
  const actorMap = new Map<string, { count: number; motivation?: string }>();
  for (const e of enrichedCVEs) {
    for (const actor of e.actors) {
      const existing = actorMap.get(actor.label) || { count: 0 };
      existing.count++;
      existing.motivation = actor.motivation;
      actorMap.set(actor.label, existing);
    }
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    enrichedCVEs,
    trendingActors,
    trendingMalware,
    actorSummary: Array.from(actorMap.entries())
      .map(([name, info]) => ({ name, cveCount: info.count, motivation: info.motivation }))
      .sort((a, b) => b.cveCount - a.cveCount),
  };
}

// ============================================================================
// STIX 2.1 Bundle Generation
// ============================================================================

function buildSTIXBundle(
  cve: FeedlyCVEEntity,
  actors: FeedlyThreatActor[],
  malware: FeedlyMalware[],
): STIXBundle {
  const objects: STIXObject[] = [];
  const now = new Date().toISOString();

  objects.push({
    type: "vulnerability",
    spec_version: "2.1",
    id: `vulnerability--${randomUUID()}`,
    created: now,
    modified: now,
    name: cve.cveid,
    description: cve.description,
    external_references: [
      { source_name: "cve", external_id: cve.cveid },
    ],
  });

  for (const actor of actors) {
    objects.push({
      type: "threat-actor",
      spec_version: "2.1",
      id: `threat-actor--${randomUUID()}`,
      created: now,
      modified: now,
      name: actor.label,
      description: actor.description,
      aliases: actor.aliases,
      primary_motivation: actor.motivation?.toLowerCase(),
      goals: actor.targetSectors,
    });
  }

  for (const mal of malware) {
    objects.push({
      type: "malware",
      spec_version: "2.1",
      id: `malware--${randomUUID()}`,
      created: now,
      modified: now,
      name: mal.label,
      description: mal.description,
      malware_types: mal.type ? [mal.type] : [],
      is_family: true,
    });
  }

  // IoC indicators from actors and malware
  const allIocs = [
    ...actors.flatMap(a => a.iocs || []),
    ...malware.flatMap(m => m.iocs || []),
  ];

  for (const ioc of allIocs) {
    const patternMap: Record<string, string> = {
      "ip": `[ipv4-addr:value = '${ioc.value}']`,
      "domain": `[domain-name:value = '${ioc.value}']`,
      "url": `[url:value = '${ioc.value}']`,
      "hash-sha256": `[file:hashes.'SHA-256' = '${ioc.value}']`,
      "hash-sha1": `[file:hashes.'SHA-1' = '${ioc.value}']`,
      "hash-md5": `[file:hashes.MD5 = '${ioc.value}']`,
      "email": `[email-addr:value = '${ioc.value}']`,
    };

    if (patternMap[ioc.type]) {
      objects.push({
        type: "indicator",
        spec_version: "2.1",
        id: `indicator--${randomUUID()}`,
        created: now,
        modified: now,
        name: `${ioc.type}: ${ioc.value}`,
        pattern_type: "stix",
        pattern: patternMap[ioc.type],
        valid_from: ioc.firstSeen || now,
        indicator_types: ["malicious-activity"],
      });
    }
  }

  return {
    type: "bundle",
    id: `bundle--${randomUUID()}`,
    objects,
  };
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const cmd = process.argv[2];
  switch (cmd) {
    case "enrich": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: enrich <CVE-ID>"); process.exit(1); }
      console.log(JSON.stringify(await enrichCVE(id), null, 2));
      break;
    }
    case "actor": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: actor <entity-id>"); process.exit(1); }
      console.log(JSON.stringify(await Feedly.getThreatActor(id, CONSUMER), null, 2));
      break;
    }
    case "malware": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: malware <entity-id>"); process.exit(1); }
      console.log(JSON.stringify(await Feedly.getMalware(id, CONSUMER), null, 2));
      break;
    }
    case "iocs": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: iocs <CVE-ID>"); process.exit(1); }
      console.log(JSON.stringify(await collectIoCs(id), null, 2));
      break;
    }
    case "daily-digest": {
      const limit = parseInt(process.argv[3] || "5");
      console.log(JSON.stringify(await dailyDigest(limit), null, 2));
      break;
    }
    case "lookup": {
      const query = process.argv[3];
      if (!query) { console.error("Usage: lookup <query>"); process.exit(1); }
      console.log(JSON.stringify(await lookupEntity(query), null, 2));
      break;
    }
    case "rules": {
      const id = process.argv[3];
      if (!id) { console.error("Usage: rules <malware-entity-id>"); process.exit(1); }
      console.log(JSON.stringify(await Feedly.getDetectionRules(id, CONSUMER), null, 2));
      break;
    }
    default:
      console.log(`CyberOpsFacade.ts

Usage:
  bun CyberOpsFacade.ts enrich <CVE-ID>             Full CVE enrichment
  bun CyberOpsFacade.ts actor <entity-id>             Threat actor profile
  bun CyberOpsFacade.ts malware <entity-id>            Malware profile
  bun CyberOpsFacade.ts iocs <CVE-ID>                  Collect IoCs from relationship graph
  bun CyberOpsFacade.ts daily-digest [limit]            Daily intel digest (default: top 5)
  bun CyberOpsFacade.ts lookup <query>                  Find entity by name
  bun CyberOpsFacade.ts rules <malware-entity-id>      YARA/Sigma detection rules`);
  }
}

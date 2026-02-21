#!/usr/bin/env bun
/**
 * TwitterBotFacade.ts — Feedly data shaped for tweet composition
 *
 * Usage:
 *   bun TwitterBotFacade.ts trending-intel [limit]     Top CVEs ready for tweets
 *   bun TwitterBotFacade.ts daily-package              Full daily content package
 *   bun TwitterBotFacade.ts cve-context <CVE-ID>       Single CVE with tweet angle
 *   bun TwitterBotFacade.ts actor-spotlight             Top trending actor profile
 *   bun TwitterBotFacade.ts malware-watch               Top trending malware families
 *
 * This facade:
 * - Calls FeedlyClient with consumer="twitter-bot"
 * - Filters for federal-compliance relevance
 * - Scores CVEs by tweet-worthiness (exploited > trending > high CVSS)
 * - Packages results as TweetIntelPackage objects
 */

import * as Feedly from "../FeedlyClient";
import type { FeedlyTrendingCVE, TweetIntelPackage } from "../Types";

const CONSUMER = "twitter-bot";

/** Federal sector vendors — CVEs affecting these get priority */
const FEDERAL_VENDORS = [
  "microsoft", "cisco", "vmware", "palo alto", "fortinet",
  "adobe", "oracle", "sap", "citrix", "ivanti", "juniper",
  "f5", "barracuda", "sonicwall", "zyxel", "beyondtrust",
  "crowdstrike", "sentinelone", "zscaler", "splunk",
];

function scoreCVE(cve: FeedlyTrendingCVE): number {
  let score = 0;
  if (cve.exploitedInTheWild) score += 50;
  if (cve.trending) score += 30;
  if (cve.epssScore && cve.epssScore > 0.5) score += 25;
  if (cve.epssScore && cve.epssScore > 0.1) score += 10;
  if ((cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) score += 20;
  if ((cve.cvssV4 || cve.cvssV3 || 0) >= 7.0) score += 10;
  if (cve.relatedThreatActors?.length) score += 15;
  if (cve.relatedMalware?.length) score += 10;
  if (!cve.patched) score += 10;
  if (cve.newExploits) score += 15;
  if (cve.proofOfExploits) score += 10;

  // Federal relevance bonus
  const vendors = (cve.affectedProducts || []).map(p => p.vendor.toLowerCase());
  if (vendors.some(v => FEDERAL_VENDORS.some(fv => v.includes(fv)))) {
    score += 20;
  }

  return score;
}

function determineUrgency(cve: FeedlyTrendingCVE): "critical" | "high" | "medium" {
  if (cve.exploitedInTheWild && (cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) return "critical";
  if (cve.exploitedInTheWild || (cve.cvssV4 || cve.cvssV3 || 0) >= 9.0) return "high";
  return "medium";
}

function federalRelevance(cve: FeedlyTrendingCVE): string {
  const parts: string[] = [];
  if (cve.exploitedInTheWild) parts.push("actively exploited — CISA KEV candidate");
  if (cve.relatedThreatActors?.length) {
    parts.push(`linked to ${cve.relatedThreatActors.map(a => a.label).join(", ")}`);
  }
  const vendors = (cve.affectedProducts || []).map(p => p.vendor);
  if (vendors.length) parts.push(`affects ${[...new Set(vendors)].join(", ")}`);
  if (!cve.patched) parts.push("no patch available");

  return parts.join("; ") || "Trending in threat intelligence feeds";
}

export async function getTrendingIntel(limit = 5): Promise<TweetIntelPackage[]> {
  const trending = await Feedly.getTrending(CONSUMER);

  return trending
    .map(cve => ({ cve, score: scoreCVE(cve) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cve }) => ({
      cve,
      tweetAngle: cve.soWhat || cve.executiveSummary || cve.description,
      urgency: determineUrgency(cve),
      federalRelevance: federalRelevance(cve),
      relatedContext: {
        actorNames: (cve.relatedThreatActors || []).map(a => a.label),
        malwareFamilies: (cve.relatedMalware || []).map(m => m.label),
        affectedVendors: [...new Set((cve.affectedProducts || []).map(p => p.vendor))],
      },
    }));
}

export async function getDailyPackage(): Promise<{
  topCVEs: TweetIntelPackage[];
  dashboard: Awaited<ReturnType<typeof Feedly.getDashboard>>;
  trendingActors: Awaited<ReturnType<typeof Feedly.getTrendingActors>>;
  trendingMalware: Awaited<ReturnType<typeof Feedly.getTrendingMalware>>;
}> {
  const [topCVEs, dashboard, trendingActors, trendingMalware] = await Promise.all([
    getTrendingIntel(10),
    Feedly.getDashboard(CONSUMER),
    Feedly.getTrendingActors(CONSUMER),
    Feedly.getTrendingMalware(CONSUMER),
  ]);

  return { topCVEs, dashboard, trendingActors, trendingMalware };
}

/** Get trending actor spotlight for weekly deep profile tweet */
export async function getActorSpotlight(): Promise<{
  actor: Awaited<ReturnType<typeof Feedly.getThreatActor>>;
  relationships: Awaited<ReturnType<typeof Feedly.getActorRelationships>>;
} | null> {
  const trending = await Feedly.getTrendingActors(CONSUMER);
  const actors = trending.threatActors || [];
  if (actors.length === 0) return null;

  // Take the top trending actor
  const top = actors[0];
  const [actor, relationships] = await Promise.all([
    Feedly.getThreatActor(top.id, CONSUMER),
    Feedly.getActorRelationships(top.id, "LAST_30_DAYS", CONSUMER),
  ]);

  return { actor, relationships };
}

/** Get trending malware watch data */
export async function getMalwareWatch(): Promise<
  Array<{
    entity: Awaited<ReturnType<typeof Feedly.getMalware>>;
    trending: { label: string; articleCount?: number };
  }>
> {
  const trending = await Feedly.getTrendingMalware(CONSUMER);
  const malwares = trending.malwares || [];
  const results: Array<{
    entity: Awaited<ReturnType<typeof Feedly.getMalware>>;
    trending: { label: string; articleCount?: number };
  }> = [];

  // Get details for top 3
  for (const mal of malwares.slice(0, 3)) {
    try {
      const entity = await Feedly.getMalware(mal.id, CONSUMER);
      results.push({ entity, trending: mal });
    } catch (err) {
      console.error(`Failed to fetch malware ${mal.label}: ${err}`);
    }
  }

  return results;
}

// CLI
if (import.meta.main) {
  const cmd = process.argv[2];
  switch (cmd) {
    case "trending-intel": {
      const limit = parseInt(process.argv[3] || "5");
      console.log(JSON.stringify(await getTrendingIntel(limit), null, 2));
      break;
    }
    case "daily-package":
      console.log(JSON.stringify(await getDailyPackage(), null, 2));
      break;
    case "cve-context": {
      const cveId = process.argv[3];
      if (!cveId) { console.error("Usage: cve-context <CVE-ID>"); process.exit(1); }
      const cve = await Feedly.getCVE(cveId, CONSUMER);
      console.log(JSON.stringify(cve, null, 2));
      break;
    }
    case "actor-spotlight":
      console.log(JSON.stringify(await getActorSpotlight(), null, 2));
      break;
    case "malware-watch":
      console.log(JSON.stringify(await getMalwareWatch(), null, 2));
      break;
    default:
      console.log(`TwitterBotFacade.ts

Usage:
  bun TwitterBotFacade.ts trending-intel [limit]    Top tweet-worthy CVEs
  bun TwitterBotFacade.ts daily-package             Full daily content package
  bun TwitterBotFacade.ts cve-context <CVE-ID>      CVE with federal context
  bun TwitterBotFacade.ts actor-spotlight            Top trending actor deep profile
  bun TwitterBotFacade.ts malware-watch              Top 3 trending malware`);
  }
}

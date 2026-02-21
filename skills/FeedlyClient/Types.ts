/**
 * Types.ts — Complete type system for FeedlyClient
 *
 * All TypeScript interfaces for the Feedly Threat Intelligence API client.
 * Covers: rate limiting, caching, request logging, API responses,
 * consumer-specific types, and supporting types.
 */

// ============================================================================
// Core API Types
// ============================================================================

/** Rate limit state extracted from response headers */
export interface RateLimitInfo {
  count: number;        // X-Ratelimit-Count: requests used this period
  limit: number;        // X-Ratelimit-Limit: max requests this period
  reset: number;        // X-Ratelimit-Reset: epoch seconds when counter resets
  remaining: number;    // Computed: limit - count
  percentUsed: number;  // Computed: count / limit * 100
}

/** Persistent rate tracking state */
export interface RateState {
  daily: {
    date: string;           // YYYY-MM-DD
    total: number;
    byEndpoint: Record<string, number>;
    byConsumer: Record<string, number>;
  };
  hourly: {
    hour: string;           // YYYY-MM-DDTHH
    total: number;
  };
  monthly: {
    month: string;          // YYYY-MM
    total: number;
  };
  lastApiRateInfo: RateLimitInfo | null;
  lastRequestTs: number;    // Epoch ms — for burst rate limiting
  circuitBreaker: {
    consecutiveErrors: number;
    firstErrorTs: number;   // Epoch ms of first error in window
    trippedUntil: number;   // Epoch ms — 0 = not tripped
    extendedCooldown: boolean;
  };
  lastUpdated: string;
}

/** Budget allocation for a consumer */
export interface BudgetAllocation {
  dailyLimit: number;
  hourlyLimit: number;
  priority: 1 | 2 | 3;
  canBorrow: boolean;
}

/** Cache entry wrapper */
export interface CacheEntry<T> {
  data: T;
  cachedAt: string;         // ISO timestamp
  expiresAt: string;        // ISO timestamp
  endpoint: string;
  etag?: string;
}

/** Request log entry */
export interface RequestLogEntry {
  ts: string;
  endpoint: string;
  method: "GET" | "POST";
  consumer: string;
  cacheHit: boolean;
  statusCode: number;
  latencyMs: number;
  rateLimitAfter: RateLimitInfo | null;
}

// ============================================================================
// Endpoint Categories
// ============================================================================

export type EndpointCategory =
  | "trending"           // /v3/memes/vulnerabilities/en — hot CVEs
  | "dashboard"          // /v3/trends/vulnerability-dashboard
  | "cve-entity"         // /v3/entities/CVE-*
  | "threat-actor"       // /v3/entities/nlp/f/entity/gz:ta:*
  | "malware"            // /v3/entities/nlp/f/entity/gz:mal:*
  | "trending-actors"    // /v3/trends/threat-actors
  | "trending-malware"   // /v3/trends/new-malwares
  | "entity-search"      // /v3/search/entities?query=
  | "actor-relations"    // /v3/ml/relationships/actor/{id}
  | "detection-rules"    // /v3/ml/detection-rules/threat/{id}
  | "search"             // /v3/search/contents
  | "stream"             // /v3/streams/contents
  | "ioc"                // /v3/enterprise/ioc?streamId=
  | "tags"               // /v3/tags
  | "profile"            // /v3/profile
  | "batch-articles";    // /v3/entries/.mget

// ============================================================================
// Feedly API Response Types
// ============================================================================

/** CVE from trending endpoint (/v3/memes/vulnerabilities/en) */
export interface FeedlyTrendingCVE {
  id: string;                       // "vulnerability/m/CVE-2024-XXXXX"
  cveid: string;
  label: string;
  description: string;
  cvssV2?: number;
  cvssV3?: number;
  cvssV4?: number;
  cvssCategoryEstimate?: string;
  epssScore?: number;
  epssPercentile?: number;
  trending: boolean;
  exploitedInTheWild: boolean;
  patched: boolean;
  patchDetails?: PatchDetail[];
  affectedProducts?: AffectedProduct[];
  vulnerableProducts?: string[];
  relatedThreatActors?: RelatedEntity[];
  relatedMalware?: RelatedEntity[];
  executiveSummary?: string;
  whatIsIt?: string;
  soWhat?: string;
  cweIds?: string[];
  idMapping?: Record<string, string[]>;  // CAPEC, ATT&CK mappings
  publishedDate?: string;
  lastModifiedDate?: string;
  newExploits?: boolean;
  proofOfExploits?: boolean;
  graphUrl?: string;
  stats?: Record<string, number>;
}

/** Dashboard response (/v3/trends/vulnerability-dashboard) */
export interface FeedlyDashboard {
  vulnerabilities: FeedlyTrendingCVE[];
  topMalwareFamilies?: AggregationBucket[];
  topThreatActors?: AggregationBucket[];
  topVendors?: AggregationBucket[];
  totalCount: number;
}

/** Full CVE entity (/v3/entities/CVE-*) */
export interface FeedlyCVEEntity extends FeedlyTrendingCVE {
  timeline?: TimelineEvent[];
  references?: Reference[];
  referenceEntries?: Reference[];
  tweets?: unknown[];
  /** AI-generated executive summary with mitigation and exploitation context */
  executiveSummary?: {
    mitigation?: string;
    exploitation?: string;
  };
  /** Structured what/so-what analysis */
  whatSoWhat?: {
    what?: string;
    soWhat?: string;
  };
  /** Scanner detection coverage (Qualys, Nessus, Nuclei, etc.) */
  detectedBy?: Array<{
    scannerName: string;
    detectionId: string;
  }>;
  /** CVSS v4 score details */
  cvssV4?: {
    baseScore: number;
    baseSeverity: string;
    vectorString: string;
    attackVector?: string;
    attackComplexity?: string;
    privilegesRequired?: string;
    userInteraction?: string;
    [key: string]: unknown;
  };
  /** EU Vulnerability Database references */
  euvd?: {
    references?: string;
    enisaIdProduct?: Array<{
      id: string;
      product_version: string;
      product: { name: string };
    }>;
  };
  /** Estimated affected products with version detail */
  affectedProductsEstimate?: Array<{
    vendor: string;
    products: Array<{ name: string }>;
  }>;
  /** CAPEC, ATT&CK, and other mappings */
  idMappingEntries?: Array<{ id: string; name: string }>;
  /** New exploit PoCs with metadata */
  newExploitEntries?: Array<{
    url: string;
    exploitAddedDate?: string;
    source?: string;
  }>;
  /** Proof of exploitation URLs */
  proofOfExploitUrls?: string[];
  /** Exploit URLs */
  exploitUrls?: string[];
  /** Feedly insertion/update timestamps */
  feedlyInsertedDate?: string;
  feedlyUpdatedDate?: string;
  /** Advisory URL */
  advisoryUrl?: string;
  /** Trend graph URLs */
  smallGraphUrl?: string;
}

/** Threat Actor entity (/v3/entities/nlp/f/entity/gz:ta:*) */
export interface FeedlyThreatActor {
  id: string;
  label: string;
  description: string;
  type?: string;
  aliases?: string[];
  country?: string;
  motivation?: string;
  firstSeen?: string;
  firstSeenAt?: number;
  lastSeen?: string;
  targetSectors?: string[];
  targetCountries?: string[];
  targets?: Array<{ type: string; value: string }>;
  associatedMalware?: RelatedEntity[];
  associatedMalwares?: RelatedEntity[];
  associatedTools?: RelatedEntity[];
  associatedVulnerabilities?: RelatedEntity[];
  ttps?: MitreTTP[];
  iocs?: IoC[];
  reports?: Reference[];
  badges?: string[];
  leoBehaviorExplanation?: string;
  leoBehaviorExamples?: string[];
  popularity?: number;
  hasSalience?: boolean;
  knowledgeBaseUrl?: string;
}

/** Malware entity (/v3/entities/nlp/f/entity/gz:mal:*) */
export interface FeedlyMalware {
  id: string;
  label: string;
  description: string;
  type?: string;
  aliases?: string[];
  firstSeen?: string;
  lastSeen?: string;
  associatedThreatActors?: RelatedEntity[];
  associatedVulnerabilities?: RelatedEntity[];
  affectedPlatforms?: string[];
  capabilities?: string[];
  iocs?: IoC[];
  badges?: string[];
  leoBehaviorExplanation?: string;
  leoBehaviorExamples?: string[];
  hasSalience?: boolean;
  knowledgeBaseUrl?: string;
}

/** Trending actors response (/v3/trends/threat-actors) */
export interface FeedlyTrendingActors {
  threatActors: FeedlyTrendingEntity[];
}

/** Trending malware response (/v3/trends/new-malwares) */
export interface FeedlyTrendingMalware {
  malwares: FeedlyTrendingEntity[];
}

/** Trending entity (shared between actors and malware trending endpoints) */
export interface FeedlyTrendingEntity {
  id: string;
  label: string;
  description?: string;
  articleCount?: number;
  delta?: number;
  sparkline?: number[];
  trending?: boolean;
}

/** Entity search result (/v3/search/entities) */
export interface FeedlyEntitySearchResult {
  query: string;
  entities: FeedlyEntityMatch[];
}

/** Single entity match from search */
export interface FeedlyEntityMatch {
  suggestText: string;
  label: string;
  id: string;
  type: string;              // "malwareFamily", "threatActor", "vulnerability", etc.
  aliases?: string[];
  description?: string;
  badges?: string[];
  leoBehaviorExplanation?: string;
  leoBehaviorExamples?: string[];
  hasSalience?: boolean;
  enterpriseFeatures?: string[];
  knowledgeBaseUrl?: string;
  score?: number;
}

/** Actor relationships (/v3/ml/relationships/actor/{id}) */
export interface FeedlyActorRelationships {
  /** IoC export URLs in multiple formats */
  iocs?: {
    exports: Array<{
      type: "stix2.1" | "misp" | "csv" | string;
      url: string;
    }>;
  };
  /** Associated malware with relevance scoring */
  malwares?: Array<{
    count: number;
    entity: RelatedEntity;
    score: number;
  }>;
  /** Targeted organizations with country and industry context */
  targets?: Array<{
    articleCount: number;
    countryIso2?: string;
    entity: RelatedEntity & { description?: string };
    firstMention?: string;
    industries?: string[];
  }>;
  /** MITRE ATT&CK TTPs with enrichment */
  ttps?: Array<{
    articleCount: number;
    entityId: string;
    lastSeen?: number;
    mitigations?: Array<{ description: string; name: string }>;
    mitreId: string;
    procedureCount?: number;
    technique?: string;
    trend?: string;
  }>;
  /** Associated vulnerabilities (CVEs) */
  vulnerabilities?: Array<{
    count: number;
    entity: RelatedEntity;
    firstMention?: string;
    score: number;
  }>;
}

/** Search contents response (/v3/search/contents) */
export interface FeedlySearchResponse {
  items: FeedlyArticle[];
  continuation?: string;
  totalCount?: number;
}

/** Search request body (/v3/search/contents) */
export interface FeedlySearchRequest {
  query: string;
  layers?: Array<{
    type: string;           // "topic", "entity", etc.
    value?: string;
  }>;
  source?: {
    items: Array<{
      type: string;         // "stream"
      id: string;           // "enterprise/TEAM/category/global.all" or specific stream
    }>;
  };
  count?: number;
  sortBy?: "relevance" | "newest";
}

/** Stream content (/v3/streams/contents) */
export interface FeedlyStreamResponse {
  items: FeedlyArticle[];
  id: string;
  continuation?: string;
  updated?: number;
}

/** Individual article */
export interface FeedlyArticle {
  id: string;
  title: string;
  content?: { content: string };
  summary?: { content: string };
  author?: string;
  origin?: { title: string; htmlUrl: string };
  published: number;
  crawled: number;
  updated?: number;
  categories?: Array<{ id: string; label: string }>;
  keywords?: string[];
  entities?: ArticleEntity[];
  commonTopics?: Array<{ id: string; label: string }>;
}

/** Detection rules response (/v3/ml/detection-rules/threat/{id}) */
export interface FeedlyDetectionRules {
  rules: DetectionRule[];
}

/** Individual detection rule (YARA/Sigma) */
export interface DetectionRule {
  type: "yara" | "sigma" | "snort";
  name?: string;
  downloadUrl?: string;
  content?: string;
  source?: string;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface PatchDetail {
  url: string;
  title?: string;
  vendor?: string;
  source?: string;
  publishedDate?: string;
}

export interface AffectedProduct {
  vendor: string;
  product: string;
  versions?: string[];
}

export interface RelatedEntity {
  id: string;
  label: string;
  type?: "threat-actor" | "malware" | "vulnerability" | "tool" | string;
}

export interface AggregationBucket {
  id: string;
  label: string;
  count: number;
}

export interface TimelineEvent {
  date: string;
  event: string;
  source?: string;
}

export interface Reference {
  url: string;
  title?: string;
  source?: string;
  publishedDate?: string;
}

export interface MitreTTP {
  techniqueId: string;
  techniqueName: string;
  tacticName?: string;
  tacticId?: string;
  procedures?: string[];
}

export interface IoC {
  type: "ip" | "domain" | "url" | "hash-md5" | "hash-sha1" | "hash-sha256" | "email" | string;
  value: string;
  firstSeen?: string;
  lastSeen?: string;
  confidence?: number;
}

export interface ArticleEntity {
  id: string;
  label: string;
  type: string;
  mentions: number;
}

// ============================================================================
// Consumer-Specific Types
// ============================================================================

/** TwitterBot needs: tweet-ready intelligence packages */
export interface TweetIntelPackage {
  cve: FeedlyTrendingCVE;
  tweetAngle: string;
  urgency: "critical" | "high" | "medium";
  federalRelevance: string;
  threadPoints?: string[];
  relatedContext: {
    actorNames: string[];
    malwareFamilies: string[];
    affectedVendors: string[];
  };
}

/** CyberOps needs: enriched intelligence objects */
export interface EnrichedCVE {
  cve: FeedlyCVEEntity;
  actors: FeedlyThreatActor[];
  malware: FeedlyMalware[];
  stixBundle?: STIXBundle;
  /** Scanner coverage from detectedBy */
  scannerCoverage?: string[];
  /** AI-generated actionable summary */
  actionableSummary?: {
    what: string;
    soWhat: string;
    mitigation: string;
    exploitation: string;
  };
}

/** Minimal STIX 2.1 bundle for IoC sharing */
export interface STIXBundle {
  type: "bundle";
  id: string;
  objects: STIXObject[];
}

export interface STIXObject {
  type: string;
  spec_version: "2.1";
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

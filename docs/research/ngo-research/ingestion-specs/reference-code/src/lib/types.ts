/**
 * file: ingest/src/lib/types.ts
 * description: The output vocabulary, mirroring dist/schema/. Structural only — the
 *              authority is the generated JSON Schema, which validate-data.ts enforces.
 */

/** How a chapter's immediate parent was established. Absent when it defaults to the root. */
export type ParentMethod = 'URL_PATH' | 'SITEMAP_PATH' | 'MUNICIPALITY_COUNTY' | 'PAGE_LINK';

export type ChapterLevel = 'NATIONAL' | 'REGIONAL' | 'LOCAL' | 'RELATED_ENTITY';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type Reconciliation = 'BOTH' | 'SOURCE_ONLY' | 'REGISTRY_ONLY' | 'UNRECONCILED';
export type Volatility = 'STRUCTURAL' | 'SLOW' | 'ANNUAL' | 'VOLATILE';
export type ActivityOrigin = 'NATIONAL' | 'LOCAL' | 'UNKNOWN';
export type Registration = 'LEGAL_ENTITY' | 'SUB_UNIT' | 'UNREGISTERED' | 'UNKNOWN';
export type UnitKind = 'GOVERNANCE' | 'OPERATIONAL' | 'UNKNOWN';

/** Identifies a chapter and places it in the hierarchy; used for `parent` too. */
export interface ChapterBase {
  id: string;
  name: string;
  chapterType?: string;
  level: ChapterLevel;
}

export interface EntityReference { id: string; href?: string; name?: string; }

export interface Provenance {
  sourceUrl: string;
  confidence: Confidence;
  reconciliation?: Reconciliation;
  idOrigin?: 'SOURCE' | 'DERIVED';
  parentOrigin?: 'SOURCE' | 'INFERRED' | 'UNSTATED';
  parentMethod?: ParentMethod;
  municipalityMethod?: 'SOURCE' | 'POINT_IN_POLYGON' | 'POSTAL_CODE_LOOKUP'
    | 'NAME_MATCH' | 'REGISTRY' | 'NONE';
  matchMethod?: string;
  containsPersonalData?: boolean;
}

export interface BlockFreshness {
  assertedAt?: string;
  volatility: Volatility;
  freshness?: 'FRESH' | 'AGEING' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
  source?: string;
  contentHash?: string;
  firstSeenAt?: string;
  changedAt?: string;
  changeCount?: number;
  isParseSuspect?: boolean;
}

export interface Freshness {
  fetchedAt: string;
  sourceUpdatedAt?: string;
  blocks?: Partial<Record<
    'identity' | 'location' | 'classification' | 'contacts'
    | 'communication' | 'activities', BlockFreshness>>;
}

export interface Contact {
  role: string;
  givenName?: string;
  familyName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  isMasked?: boolean;
  sourceUrl?: string;
}

export interface Activity {
  name: string;
  definition?: EntityReference;
  description?: string;
  descriptionPublic?: string;
  descriptionNeedsReview?: boolean;
  sourceUrl?: string;
}

export interface Chapter {
  id: string;
  href?: string;
  name: string;
  legalName?: string;
  organizationNumber?: string;
  registration?: Registration;
  unitKind?: UnitKind;
  organization?: EntityReference;
  parent?: ChapterBase;
  chapterType?: string;
  level: ChapterLevel;
  memberCount?: number;
  isActive?: boolean;
  establishedDate?: string;
  terminatedDate?: string;
  address?: { line1?: string; line2?: string; postalCode?: string; postalPlace?: string; country?: string };
  addressKind?: 'VISITING' | 'POSTAL' | 'MEETING_VENUE' | 'REGISTERED' | 'UNKNOWN';
  municipality?: string;
  municipalityNumber?: string;
  county?: string;
  coordinates?: { latitude: number; longitude: number };
  email?: string;
  phone?: string;
  website?: string;
  facebookUrl?: string;
  contacts?: Contact[];
  activities?: Activity[];
  provenance?: Provenance;
  freshness?: Freshness;
}

export interface ActivityDefinition {
  id: string;
  href?: string;
  organization?: EntityReference;
  name: string;
  aliases?: string[];
  group?: EntityReference;
  description?: string;
  summary?: string;
  descriptionPublic?: string;
  summaryPublic?: string;
  descriptionNeedsReview?: boolean;
  descriptionSourceUrl?: string;
  descriptionLanguage?: 'NB' | 'NN' | 'EN' | 'UNKNOWN';
  descriptionWordCount?: number;
  descriptionRetrievedAt?: string;
  targetGroups?: string[];
  deliveryModes?: string[];
  isService?: boolean;
  origin: ActivityOrigin;
  originEvidence?: string;
  chapterCount?: number;
  isPromotionCandidate?: boolean;
  serviceCategory?: {
    code?: string;
    assignmentMethod?: 'SOURCE_TAXONOMY' | 'MANUAL' | 'AI_ASSISTED' | 'UNMAPPED';
    confidence?: Confidence;
  };
  provenance?: Provenance;
  freshness?: Freshness;
}

export interface Extract {
  sourceId: string;
  method: 'API' | 'REST_API' | 'SITEMAP_CRAWL' | 'HTML_CRAWL' | 'MANUAL';
  baseUrl?: string;
  indexUrl?: string;
  fetchedAt: string;
  extractorVersion: string;
  pagesAttempted?: number;
  pagesParsed?: number;
  contentHash?: string;
  isRobotsAllowed?: boolean;
  license?: string;
  permissionReference?: string;
  changeSummary?: Record<string, unknown>;
}

export interface Collection<T> { items: T[]; next?: string; extract?: Extract; }

/**
 * EveryDeliver Browser Extension — Shared Types
 * Phase 3: Plugin Enhancement (3.2–3.6)
 */

export interface JobData {
  companyName: string;
  title: string;
  jdText: string;
  salary?: string;
  city?: string;
  experience?: string;
  education?: string;
  tags?: string[];
  sourceUrl: string;
  sourcePlatform: "boss" | "liepin" | "generic";
}

export interface ImportPayload extends JobData {
  qualityScore: number;
  duplicateKey: string;
  importStatus: "complete" | "needs_review";
  extractedAt: string; // ISO timestamp
}

export interface ThrottleState {
  domain: string;
  count: number;
  resetAt: number; // epoch ms
  nightPause: boolean;
}

export interface ComplianceState {
  accepted: boolean;
  acceptedAt?: string; // ISO timestamp
  acceptedVersion?: string;
}

/** Anti-detection configuration */
export const ANTI_DETECTION = {
  /** Min delay between extractions per domain (ms) */
  MIN_INTERVAL_MS: 3000,
  /** Max extractions per domain per hour */
  MAX_PER_HOUR: 30,
  /** Night pause: stop extraction during these hours (local time) */
  NIGHT_START_HOUR: 23,
  NIGHT_END_HOUR: 7,
  /** Random jitter added to DOM reads (ms) */
  JITTER_MS: 500,
  /** Scroll-to-bottom delay to trigger lazy-loaded content (ms) */
  SCROLL_DELAY_MS: 800,
} as const;

/**
 * EveryDeliver — Platform Adapters (Phase 3.2–3.4)
 *
 * Robust DOM extraction for BOSS Zhipin, Liepin, and generic platforms.
 * Each adapter provides multiple CSS selector fallbacks to survive DOM changes.
 */

import type { JobData } from "./types";

// ============================================================
// Common helpers
// ============================================================

/** Try multiple selectors in order, return first match's textContent */
function trySelectors(selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch { /* invalid selector — skip */ }
  }
  return "";
}

/** Try multiple selectors, return concatenated text from all matches */
function trySelectorsAll(selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        return Array.from(els)
          .map((el) => el.textContent?.trim() || "")
          .filter(Boolean)
          .join("\n");
      }
    } catch { /* skip */ }
  }
  return "";
}

/** Clean extracted text: normalize whitespace, remove invisible chars */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/​/g, "") // zero-width space
    .replace(/ /g, " ") // non-breaking space
    .trim();
}

// ============================================================
// BOSS Zhipin Adapter (3.2)
// ============================================================

/**
 * BOSS Zhipin job detail page extraction.
 *
 * Known DOM structures (subject to change):
 * - V1 (legacy): .job-boss, .job-primary, .name h1, .job-sec .text
 * - V2 (2024): .job-detail-box, .job-detail-header, .job-detail-content
 * - V3 (chat view): .chat-job-info, .chat-job-desc
 *
 * Strategy: try all known selectors, fall back to generic extraction.
 */
export function extractBossJD(): JobData | null {
  const title = trySelectors([
    ".name h1",
    ".job-name",
    ".job-title",
    ".job-detail-header h1",
    ".job-primary h1",
    ".chat-job-info .name",
    "h1",
  ]);

  const companyName = trySelectors([
    ".company-info .name",
    ".company-name",
    ".job-detail-company .name",
    ".biz-title",
    ".chat-job-info .company",
    'a[href*="gongsi"]',
  ]);

  const jdText = trySelectorsAll([
    ".job-sec .text *",
    ".job-detail-content",
    ".job-detail",
    ".job-description",
    ".detail-content",
    ".job_desc",
    ".chat-job-desc",
    '[class*="job-detail"] [class*="content"]',
  ]);

  const salary = trySelectors([
    ".salary",
    ".job-salary",
    ".salary-text",
    ".job-detail-header .salary",
    ".chat-job-info .salary",
    '[class*="salary"]',
  ]);

  const city = trySelectors([
    ".job-location",
    ".location",
    ".work-address",
    ".detail-address",
    '[class*="location"]',
    '[class*="address"]',
  ]);

  const experience = trySelectors([
    ".job-experience",
    ".experience",
    '[class*="exp"]',
  ]);

  const education = trySelectors([
    ".job-education",
    ".education",
    '[class*="edu"]',
  ]);

  const tags = trySelectorsAll([
    ".job-tags .tag",
    ".job-tag",
    ".tag-list .tag-item",
    '[class*="tag"]',
  ]).split("\n").filter(Boolean);

  if (!title || !companyName) return null;

  return {
    companyName: cleanText(companyName),
    title: cleanText(title),
    jdText: cleanText(jdText),
    salary: cleanText(salary) || undefined,
    city: cleanText(city) || undefined,
    experience: cleanText(experience) || undefined,
    education: cleanText(education) || undefined,
    tags: tags.length > 0 ? tags.map(cleanText) : undefined,
    sourceUrl: window.location.href,
    sourcePlatform: "boss",
  };
}

// ============================================================
// Liepin Adapter (3.3)
// ============================================================

/**
 * Liepin job detail page extraction.
 *
 * Known DOM structures:
 * - V1: .job-title, .company-name, .content-word
 * - V2: .title-info, .company-info, .job-description
 * - V3 (2024 redesign): .job-detail-header, .job-main-content
 * - 猎头版: .headhunt-job-title, .headhunt-job-desc
 */
export function extractLiepinJD(): JobData | null {
  const title = trySelectors([
    ".job-title",
    ".title-info h1",
    ".title-info .name",
    ".job-detail-header h1",
    ".position-title",
    ".headhunt-job-title",
    "h1",
  ]);

  const companyName = trySelectors([
    ".company-name",
    ".company-info .name",
    ".company-title",
    ".about-company .name",
    ".headhunt-company-name",
    'a[href*="company"]',
  ]);

  const jdText = trySelectorsAll([
    ".content-word",
    ".job-description",
    ".job-detail",
    ".job-main-content",
    ".job-desc",
    ".position-desc",
    ".headhunt-job-desc",
    ".description-content",
    '[class*="desc"] [class*="content"]',
  ]);

  const salary = trySelectors([
    ".job-salary",
    ".salary",
    ".salary-text",
    ".title-info .salary",
    '[class*="salary"]',
  ]);

  const city = trySelectors([
    ".city",
    ".job-location",
    ".location",
    ".work-city",
    '[class*="location"]',
    '[class*="city"]',
  ]);

  const experience = trySelectors([
    ".job-experience",
    ".experience-require",
    '[class*="exp"]',
  ]);

  const education = trySelectors([
    ".job-education",
    ".edu-require",
    '.job-require [class*="edu"]',
  ]);

  const tags = trySelectorsAll([
    ".job-tags .tag",
    ".skill-tags .tag",
    ".job-tag",
    ".welfare-tags .tag",
    '[class*="tag"]',
  ]).split("\n").filter(Boolean);

  if (!title || !companyName) return null;

  return {
    companyName: cleanText(companyName),
    title: cleanText(title),
    jdText: cleanText(jdText),
    salary: cleanText(salary) || undefined,
    city: cleanText(city) || undefined,
    experience: cleanText(experience) || undefined,
    education: cleanText(education) || undefined,
    tags: tags.length > 0 ? tags.map(cleanText) : undefined,
    sourceUrl: window.location.href,
    sourcePlatform: "liepin",
  };
}

// ============================================================
// Generic Platform Adapter (3.4)
// ============================================================

/**
 * Generic fallback for unsupported platforms (51job, Lagou, LinkedIn, etc.)
 *
 * Strategy:
 * 1. Check meta tags (og:title, description)
 * 2. Scan for JSON-LD structured data (schema.org/JobPosting)
 * 3. Heuristic DOM scanning: look for job-related class names
 * 4. Body text fallback
 */
export function extractGenericJD(): JobData | null {
  // 1. Try JSON-LD structured data first (schema.org/JobPosting)
  try {
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent || "");
        if (data?.["@type"] === "JobPosting" || data?.jobTitle) {
          return {
            companyName: data.hiringOrganization?.name ||
              data.employer?.name || "",
            title: data.title || data.jobTitle || "",
            jdText: data.description || data.responsibilities || "",
            salary: data.baseSalary?.value
              ? `${data.baseSalary.value} ${data.baseSalary.currency || ""}`
              : undefined,
            city: data.jobLocation?.address?.addressLocality ||
              data.jobLocation?.name || undefined,
            sourceUrl: window.location.href,
            sourcePlatform: "generic",
          };
        }
      } catch { /* invalid JSON — skip */ }
    }
  } catch { /* selector error */ }

  // 2. Try meta tags
  const metaDescription = document
    .querySelector('meta[name="description"]')
    ?.getAttribute("content") || "";
  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content") || "";

  // 3. Heuristic DOM scanning
  const title = trySelectors([
    "h1",
    ".job-title",
    ".job-name",
    ".position-name",
    '[class*="position"]',
    '[class*="job"][class*="title"]',
    ".title",
    "title",
  ]);

  const companyName = trySelectors([
    ".company-name",
    ".company",
    ".employer-name",
    '[class*="company"]',
    'a[href*="company"]',
  ]);

  const jdText = trySelectorsAll([
    ".job-description",
    ".job-detail",
    ".position-description",
    ".job-content",
    '[class*="job"][class*="desc"]',
    '[class*="position"][class*="detail"]',
    ".description",
    "article",
    "main",
  ]);

  // 4. Body text fallback (if still empty)
  const finalJdText = jdText.length > 100
    ? jdText
    : document.body.innerText.substring(0, 5000);

  const pageTitle = document.title;
  const parts = pageTitle.split(/[-–—|·•]/).map((s) => s.trim());

  return {
    companyName: cleanText(companyName || parts[1] || pageTitle),
    title: cleanText(title || ogTitle || parts[0] || pageTitle),
    jdText: cleanText(finalJdText || metaDescription),
    sourceUrl: window.location.href,
    sourcePlatform: "generic",
  };
}

// ============================================================
// Platform Detection
// ============================================================

export type Platform = "boss" | "liepin" | "generic";

export function detectPlatform(): Platform {
  const host = window.location.hostname;
  if (host.includes("zhipin.com")) return "boss";
  if (host.includes("liepin.com")) return "liepin";
  return "generic";
}

export function detectSearchResultPage(): boolean {
  const host = window.location.hostname;

  if (host.includes("zhipin.com")) {
    return !!(
      document.querySelector(".job-list") ||
      document.querySelector(".search-job-result") ||
      document.querySelector('[class*="job-list"]') ||
      window.location.pathname.includes("web/geek/job")
    );
  }

  if (host.includes("liepin.com")) {
    return !!(
      document.querySelector(".job-list") ||
      document.querySelector(".search-result") ||
      window.location.pathname.includes("search")
    );
  }

  return false;
}

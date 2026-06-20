/**
 * EveryDeliver Browser Extension — Content Script (Phase 3.2–3.6)
 *
 * Enhanced version with:
 * - Multi-selector platform adapters (BOSS / Liepin / Generic)
 * - SPA page change detection (MutationObserver + History API)
 * - Anti-detection (jitter, visibility awareness)
 * - Scroll simulation for lazy-loaded content
 * - Structured extraction with quality scoring
 */

import {
  extractBossJD,
  extractLiepinJD,
  extractGenericJD,
  detectPlatform,
  detectSearchResultPage,
} from "./platform-adapters";
import {
  checkThrottle,
  sleep,
  simulateScroll,
  watchPageChanges,
  isTabVisible,
  onVisibilityChange,
} from "./anti-detection";
import type { JobData, ImportPayload } from "./types";

// ============================================================
// State
// ============================================================

let currentJob: JobData | null = null;
let pageObserver: MutationObserver | null = null;
let cleanupVisibility: (() => void) | null = null;
let extractionInProgress = false;

// ============================================================
// Main Extraction
// ============================================================

async function extractJobData(): Promise<JobData | null> {
  if (extractionInProgress) return currentJob;
  extractionInProgress = true;

  try {
    // Anti-detection: random jitter before DOM reads
    await sleep(200);

    const platform = detectPlatform();

    let data: JobData | null = null;
    switch (platform) {
      case "boss":
        data = extractBossJD();
        break;
      case "liepin":
        data = extractLiepinJD();
        break;
      default:
        data = extractGenericJD();
    }

    if (data) {
      currentJob = data;
      notifyPopup(data);
      notifyPageDetected(platform);
    }

    return data;
  } finally {
    extractionInProgress = false;
  }
}

/**
 * Full extraction flow:
 * 1. Scroll to trigger lazy content
 * 2. Wait for content to settle
 * 3. Extract data
 */
async function extractWithScroll(): Promise<JobData | null> {
  // Only scroll on job detail pages (not search results)
  if (!detectSearchResultPage()) {
    await simulateScroll();
  }

  await sleep(500); // Let any post-scroll renders finish
  return extractJobData();
}

// ============================================================
// Import Preparation
// ============================================================

function prepareImportPayload(data: JobData): ImportPayload {
  // Quality scoring
  let qualityScore = 1.0;
  if (!data.salary) qualityScore -= 0.15;
  if (!data.city) qualityScore -= 0.1;
  if (!data.experience) qualityScore -= 0.05;
  if (!data.education) qualityScore -= 0.05;
  if (data.jdText.length < 200) qualityScore -= 0.1;
  if (data.jdText.length < 100) qualityScore -= 0.15;

  // Duplicate key: company + title (normalized)
  const standardizedTitle = data.title.replace(/\s+/g, "").toLowerCase();
  const standardizedCompany = data.companyName.replace(/\s+/g, "").toLowerCase();
  const duplicateKey = `${standardizedCompany}|${standardizedTitle}`;

  return {
    ...data,
    qualityScore: Math.max(0, Math.round(qualityScore * 100) / 100),
    duplicateKey,
    importStatus: qualityScore >= 0.8 ? "complete" : "needs_review",
    extractedAt: new Date().toISOString(),
  };
}

// ============================================================
// Notifications
// ============================================================

function notifyPopup(data: JobData): void {
  chrome.runtime.sendMessage({
    action: "jobExtracted",
    data,
  }).catch(() => {
    // Popup may not be open — that's fine
  });
}

function notifyPageDetected(platform: string): void {
  chrome.runtime.sendMessage({
    action: "pageDetected",
    platform,
  }).catch(() => { /* popup not open */ });
}

// ============================================================
// Message Handlers
// ============================================================

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case "extractJob": {
      // Popup/bg requests extraction — return cached or extract fresh
      if (currentJob) {
        sendResponse(currentJob);
      } else {
        extractWithScroll()
          .then((data) => sendResponse(data))
          .catch((err) => sendResponse({ error: err.message }));
        return true; // Keep channel open for async
      }
      break;
    }

    case "extractAndImport": {
      // Full flow: extract → prepare → send to background for import
      extractWithScroll()
        .then((data) => {
          if (!data) {
            sendResponse({ error: "No job data found on this page" });
            return;
          }

          // Throttle check
          const throttle = checkThrottle(data.sourceUrl);
          if (!throttle.allowed) {
            sendResponse({ error: `Throttled: ${throttle.reason}` });
            return;
          }

          const payload = prepareImportPayload(data);
          chrome.runtime.sendMessage({
            action: "importJob",
            payload,
          }).then((result) => sendResponse(result))
            .catch((err) => sendResponse({ error: err.message }));
        })
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    case "getPageStatus": {
      const platform = detectPlatform();
      const isSearch = detectSearchResultPage();
      sendResponse({
        platform,
        isSearchPage: isSearch,
        hasJobData: !!currentJob,
        url: window.location.href,
      });
      break;
    }

    default:
      sendResponse({ error: `Unknown action: ${request.action}` });
  }
});

// ============================================================
// Lifecycle
// ============================================================

function initialize(): void {
  const platform = detectPlatform();

  // Notify that we're on a page
  notifyPageDetected(platform);

  // Auto-extract on supported platforms
  if (platform === "boss" || platform === "liepin") {
    extractWithScroll();
  }

  // Watch for SPA page changes (these sites use React/Vue)
  pageObserver = watchPageChanges(() => {
    console.log("[EveryDeliver] Page changed, re-extracting...");
    currentJob = null; // Invalidate cache
    extractWithScroll();
  });

  // Pause/resume on tab visibility changes
  cleanupVisibility = onVisibilityChange((visible) => {
    if (visible && !currentJob && (platform === "boss" || platform === "liepin")) {
      // User came back to tab — re-extract if we don't have data
      extractWithScroll();
    }
  });
}

function cleanup(): void {
  pageObserver?.disconnect();
  pageObserver = null;
  cleanupVisibility?.();
  cleanupVisibility = null;
}

// Start
initialize();

// Cleanup on unload (extension reload/disable)
window.addEventListener("beforeunload", cleanup);

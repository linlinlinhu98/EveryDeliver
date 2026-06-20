/**
 * EveryDeliver — Background Service Worker (Phase 3.6)
 *
 * Manifest V3 service worker for:
 * - Cross-tab throttle coordination
 * - Import queue management
 * - Night pause scheduling
 * - Storage cleanup
 * - Communication hub between content scripts and popup
 */

import type { ImportPayload, ThrottleState, ComplianceState } from "./types";
import { ANTI_DETECTION } from "./types";

// ============================================================
// State (persisted via chrome.storage.session)
// ============================================================

const EXTRACT_EVENT = "everydeliver:extract";
const IMPORT_QUEUE_KEY = "importQueue";
const MAX_QUEUE_SIZE = 50;

interface QueuedImport extends ImportPayload {
  queuedAt: string;
  tabId: number;
}

// ============================================================
// Night Pause Scheduler
// ============================================================

let nightPauseTimer: ReturnType<typeof setInterval> | null = null;

function isNightPause(): boolean {
  const hour = new Date().getHours();
  return (
    hour >= ANTI_DETECTION.NIGHT_START_HOUR ||
    hour < ANTI_DETECTION.NIGHT_END_HOUR
  );
}

function startNightPauseScheduler(): void {
  if (nightPauseTimer) return;

  nightPauseTimer = setInterval(() => {
    const paused = isNightPause();
    chrome.storage.session.set({ nightPauseActive: paused });

    if (paused) {
      console.log("[EveryDeliver] Night pause active — extraction suspended");
    }
  }, 60_000); // Check every minute
}

// ============================================================
// Import Queue
// ============================================================

async function enqueueImport(payload: ImportPayload): Promise<void> {
  const result = await chrome.storage.local.get(IMPORT_QUEUE_KEY);
  const queue: QueuedImport[] = result[IMPORT_QUEUE_KEY] || [];

  // Deduplicate by duplicateKey
  if (queue.some((item) => item.duplicateKey === payload.duplicateKey)) {
    console.log("[EveryDeliver] Duplicate import skipped:", payload.duplicateKey);
    return;
  }

  const entry: QueuedImport = {
    ...payload,
    queuedAt: new Date().toISOString(),
    tabId: 0, // Will be set by sender
  };

  queue.push(entry);

  // Keep queue bounded
  while (queue.length > MAX_QUEUE_SIZE) {
    queue.shift();
  }

  await chrome.storage.local.set({ [IMPORT_QUEUE_KEY]: queue });
  console.log("[EveryDeliver] Import queued:", payload.title, `(${queue.length}/${MAX_QUEUE_SIZE})`);
}

async function getImportQueue(): Promise<QueuedImport[]> {
  const result = await chrome.storage.local.get(IMPORT_QUEUE_KEY);
  return result[IMPORT_QUEUE_KEY] || [];
}

async function clearImportQueue(): Promise<void> {
  await chrome.storage.local.remove(IMPORT_QUEUE_KEY);
}

// ============================================================
// Message Router
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Route messages by action type
  switch (message.action) {
    case "extractJob": {
      // Forwarded from popup to content script — handled by popup directly
      sendResponse({ error: "Use chrome.tabs.sendMessage for extraction" });
      break;
    }

    case "importJob": {
      // Popup sends this after user confirms extraction
      handleImportJob(message.payload, sender)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true; // Keep channel open for async
    }

    case "getImportQueue": {
      getImportQueue()
        .then((queue) => sendResponse({ queue }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    case "clearImportQueue": {
      clearImportQueue()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    case "getThrottleStatus": {
      const domain = message.domain || "unknown";
      chrome.storage.session.get(`throttle:${domain}`).then((result) => {
        sendResponse({ status: result[`throttle:${domain}`] || null });
      });
      return true;
    }

    case "checkCompliance": {
      chrome.storage.local.get("compliance").then((result) => {
        const c: ComplianceState | undefined = result.compliance;
        sendResponse({ accepted: c?.accepted === true });
      });
      return true;
    }

    case "acceptCompliance": {
      const compliance: ComplianceState = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        acceptedVersion: chrome.runtime.getManifest().version,
      };
      chrome.storage.local.set({ compliance }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    default: {
      sendResponse({ error: `Unknown action: ${message.action}` });
      break;
    }
  }
});

// ============================================================
// Import Handler
// ============================================================

async function handleImportJob(
  payload: ImportPayload,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; queued: boolean; error?: string }> {
  // Night pause check
  if (isNightPause()) {
    return { success: false, queued: false, error: "Night pause active — import suspended" };
  }

  // Quality gate
  if (!payload.companyName || payload.companyName.length < 2) {
    return { success: false, queued: false, error: "Company name too short" };
  }
  if (!payload.title || payload.title.length < 2) {
    return { success: false, queued: false, error: "Job title too short" };
  }
  if (!payload.jdText || payload.jdText.length < 50) {
    return { success: false, queued: false, error: "JD text too short (< 50 chars)" };
  }

  await enqueueImport(payload);

  // Notify any open EveryDeliver tabs
  chrome.runtime.sendMessage({
    action: "newImportAvailable",
    payload,
  }).catch(() => {
    // No listeners — that's fine, data is in storage queue
  });

  return { success: true, queued: true };
}

// ============================================================
// Lifecycle
// ============================================================

// Install / Update handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[EveryDeliver] Extension installed/updated:", details.reason);

  if (details.reason === "install") {
    // First-time install: reset compliance
    chrome.storage.local.set({
      compliance: { accepted: false },
      importQueue: [],
    });
  }

  // Set up context menu (future: right-click to extract)
  chrome.contextMenus?.create?.({
    id: "extractJD",
    title: "提取此页面的职位信息",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://*.zhipin.com/*",
      "https://*.liepin.com/*",
    ],
  }, () => {
    // Ignore error if already exists
    if (chrome.runtime.lastError) {
      console.debug("[EveryDeliver] Context menu already exists");
    }
  });
});

// Context menu click handler
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === "extractJD" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "extractJob" })
      .then((data) => {
        if (data) {
          handleImportJob(data, { id: tab.id } as chrome.runtime.MessageSender);
        }
      })
      .catch(console.error);
  }
});

// Start night pause scheduler on load
startNightPauseScheduler();

console.log("[EveryDeliver] Background service worker started");

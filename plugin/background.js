"use strict";
(() => {
  // plugin/types.ts
  var ANTI_DETECTION = {
    /** Min delay between extractions per domain (ms) */
    MIN_INTERVAL_MS: 3e3,
    /** Max extractions per domain per hour */
    MAX_PER_HOUR: 30,
    /** Night pause: stop extraction during these hours (local time) */
    NIGHT_START_HOUR: 23,
    NIGHT_END_HOUR: 7,
    /** Random jitter added to DOM reads (ms) */
    JITTER_MS: 500,
    /** Scroll-to-bottom delay to trigger lazy-loaded content (ms) */
    SCROLL_DELAY_MS: 800
  };

  // plugin/background.ts
  var IMPORT_QUEUE_KEY = "importQueue";
  var MAX_QUEUE_SIZE = 50;
  var nightPauseTimer = null;
  function isNightPause() {
    const hour = (/* @__PURE__ */ new Date()).getHours();
    return hour >= ANTI_DETECTION.NIGHT_START_HOUR || hour < ANTI_DETECTION.NIGHT_END_HOUR;
  }
  function startNightPauseScheduler() {
    if (nightPauseTimer) return;
    nightPauseTimer = setInterval(() => {
      const paused = isNightPause();
      chrome.storage.session.set({ nightPauseActive: paused });
      if (paused) {
        console.log("[EveryDeliver] Night pause active \u2014 extraction suspended");
      }
    }, 6e4);
  }
  async function enqueueImport(payload) {
    const result = await chrome.storage.local.get(IMPORT_QUEUE_KEY);
    const queue = result[IMPORT_QUEUE_KEY] || [];
    if (queue.some((item) => item.duplicateKey === payload.duplicateKey)) {
      console.log("[EveryDeliver] Duplicate import skipped:", payload.duplicateKey);
      return;
    }
    const entry = {
      ...payload,
      queuedAt: (/* @__PURE__ */ new Date()).toISOString(),
      tabId: 0
      // Will be set by sender
    };
    queue.push(entry);
    while (queue.length > MAX_QUEUE_SIZE) {
      queue.shift();
    }
    await chrome.storage.local.set({ [IMPORT_QUEUE_KEY]: queue });
    console.log("[EveryDeliver] Import queued:", payload.title, `(${queue.length}/${MAX_QUEUE_SIZE})`);
  }
  async function getImportQueue() {
    const result = await chrome.storage.local.get(IMPORT_QUEUE_KEY);
    return result[IMPORT_QUEUE_KEY] || [];
  }
  async function clearImportQueue() {
    await chrome.storage.local.remove(IMPORT_QUEUE_KEY);
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case "extractJob": {
        sendResponse({ error: "Use chrome.tabs.sendMessage for extraction" });
        break;
      }
      case "importJob": {
        handleImportJob(message.payload, sender).then((result) => sendResponse(result)).catch((err) => sendResponse({ error: err.message }));
        return true;
      }
      case "getImportQueue": {
        getImportQueue().then((queue) => sendResponse({ queue })).catch((err) => sendResponse({ error: err.message }));
        return true;
      }
      case "clearImportQueue": {
        clearImportQueue().then(() => sendResponse({ success: true })).catch((err) => sendResponse({ error: err.message }));
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
          const c = result.compliance;
          sendResponse({ accepted: c?.accepted === true });
        });
        return true;
      }
      case "acceptCompliance": {
        const compliance = {
          accepted: true,
          acceptedAt: (/* @__PURE__ */ new Date()).toISOString(),
          acceptedVersion: chrome.runtime.getManifest().version
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
  async function handleImportJob(payload, sender) {
    if (isNightPause()) {
      return { success: false, queued: false, error: "Night pause active \u2014 import suspended" };
    }
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
    chrome.runtime.sendMessage({
      action: "newImportAvailable",
      payload
    }).catch(() => {
    });
    return { success: true, queued: true };
  }
  chrome.runtime.onInstalled.addListener((details) => {
    console.log("[EveryDeliver] Extension installed/updated:", details.reason);
    if (details.reason === "install") {
      chrome.storage.local.set({
        compliance: { accepted: false },
        importQueue: []
      });
    }
    chrome.contextMenus?.create?.({
      id: "extractJD",
      title: "\u63D0\u53D6\u6B64\u9875\u9762\u7684\u804C\u4F4D\u4FE1\u606F",
      contexts: ["page"],
      documentUrlPatterns: [
        "https://*.zhipin.com/*",
        "https://*.liepin.com/*"
      ]
    }, () => {
      if (chrome.runtime.lastError) {
        console.debug("[EveryDeliver] Context menu already exists");
      }
    });
  });
  chrome.contextMenus?.onClicked?.addListener((info, tab) => {
    if (info.menuItemId === "extractJD" && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "extractJob" }).then((data) => {
        if (data) {
          handleImportJob(data, { id: tab.id });
        }
      }).catch(console.error);
    }
  });
  startNightPauseScheduler();
  console.log("[EveryDeliver] Background service worker started");
})();

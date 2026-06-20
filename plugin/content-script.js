"use strict";
(() => {
  // plugin/platform-adapters.ts
  function trySelectors(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      } catch {
      }
    }
    return "";
  }
  function trySelectorsAll(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          return Array.from(els).map((el) => el.textContent?.trim() || "").filter(Boolean).join("\n");
        }
      } catch {
      }
    }
    return "";
  }
  function cleanText(text) {
    return text.replace(/\s+/g, " ").replace(/​/g, "").replace(/ /g, " ").trim();
  }
  function extractBossJD() {
    const title = trySelectors([
      ".name h1",
      ".job-name",
      ".job-title",
      ".job-detail-header h1",
      ".job-primary h1",
      ".chat-job-info .name",
      "h1"
    ]);
    const companyName = trySelectors([
      ".company-info .name",
      ".company-name",
      ".job-detail-company .name",
      ".biz-title",
      ".chat-job-info .company",
      'a[href*="gongsi"]'
    ]);
    const jdText = trySelectorsAll([
      ".job-sec .text *",
      ".job-detail-content",
      ".job-detail",
      ".job-description",
      ".detail-content",
      ".job_desc",
      ".chat-job-desc",
      '[class*="job-detail"] [class*="content"]'
    ]);
    const salary = trySelectors([
      ".salary",
      ".job-salary",
      ".salary-text",
      ".job-detail-header .salary",
      ".chat-job-info .salary",
      '[class*="salary"]'
    ]);
    const city = trySelectors([
      ".job-location",
      ".location",
      ".work-address",
      ".detail-address",
      '[class*="location"]',
      '[class*="address"]'
    ]);
    const experience = trySelectors([
      ".job-experience",
      ".experience",
      '[class*="exp"]'
    ]);
    const education = trySelectors([
      ".job-education",
      ".education",
      '[class*="edu"]'
    ]);
    const tags = trySelectorsAll([
      ".job-tags .tag",
      ".job-tag",
      ".tag-list .tag-item",
      '[class*="tag"]'
    ]).split("\n").filter(Boolean);
    if (!title || !companyName) return null;
    return {
      companyName: cleanText(companyName),
      title: cleanText(title),
      jdText: cleanText(jdText),
      salary: cleanText(salary) || void 0,
      city: cleanText(city) || void 0,
      experience: cleanText(experience) || void 0,
      education: cleanText(education) || void 0,
      tags: tags.length > 0 ? tags.map(cleanText) : void 0,
      sourceUrl: window.location.href,
      sourcePlatform: "boss"
    };
  }
  function extractLiepinJD() {
    const title = trySelectors([
      ".job-title",
      ".title-info h1",
      ".title-info .name",
      ".job-detail-header h1",
      ".position-title",
      ".headhunt-job-title",
      "h1"
    ]);
    const companyName = trySelectors([
      ".company-name",
      ".company-info .name",
      ".company-title",
      ".about-company .name",
      ".headhunt-company-name",
      'a[href*="company"]'
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
      '[class*="desc"] [class*="content"]'
    ]);
    const salary = trySelectors([
      ".job-salary",
      ".salary",
      ".salary-text",
      ".title-info .salary",
      '[class*="salary"]'
    ]);
    const city = trySelectors([
      ".city",
      ".job-location",
      ".location",
      ".work-city",
      '[class*="location"]',
      '[class*="city"]'
    ]);
    const experience = trySelectors([
      ".job-experience",
      ".experience-require",
      '[class*="exp"]'
    ]);
    const education = trySelectors([
      ".job-education",
      ".edu-require",
      '.job-require [class*="edu"]'
    ]);
    const tags = trySelectorsAll([
      ".job-tags .tag",
      ".skill-tags .tag",
      ".job-tag",
      ".welfare-tags .tag",
      '[class*="tag"]'
    ]).split("\n").filter(Boolean);
    if (!title || !companyName) return null;
    return {
      companyName: cleanText(companyName),
      title: cleanText(title),
      jdText: cleanText(jdText),
      salary: cleanText(salary) || void 0,
      city: cleanText(city) || void 0,
      experience: cleanText(experience) || void 0,
      education: cleanText(education) || void 0,
      tags: tags.length > 0 ? tags.map(cleanText) : void 0,
      sourceUrl: window.location.href,
      sourcePlatform: "liepin"
    };
  }
  function extractGenericJD() {
    try {
      const jsonLdScripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          if (data?.["@type"] === "JobPosting" || data?.jobTitle) {
            return {
              companyName: data.hiringOrganization?.name || data.employer?.name || "",
              title: data.title || data.jobTitle || "",
              jdText: data.description || data.responsibilities || "",
              salary: data.baseSalary?.value ? `${data.baseSalary.value} ${data.baseSalary.currency || ""}` : void 0,
              city: data.jobLocation?.address?.addressLocality || data.jobLocation?.name || void 0,
              sourceUrl: window.location.href,
              sourcePlatform: "generic"
            };
          }
        } catch {
        }
      }
    } catch {
    }
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const title = trySelectors([
      "h1",
      ".job-title",
      ".job-name",
      ".position-name",
      '[class*="position"]',
      '[class*="job"][class*="title"]',
      ".title",
      "title"
    ]);
    const companyName = trySelectors([
      ".company-name",
      ".company",
      ".employer-name",
      '[class*="company"]',
      'a[href*="company"]'
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
      "main"
    ]);
    const finalJdText = jdText.length > 100 ? jdText : document.body.innerText.substring(0, 5e3);
    const pageTitle = document.title;
    const parts = pageTitle.split(/[-–—|·•]/).map((s) => s.trim());
    return {
      companyName: cleanText(companyName || parts[1] || pageTitle),
      title: cleanText(title || ogTitle || parts[0] || pageTitle),
      jdText: cleanText(finalJdText || metaDescription),
      sourceUrl: window.location.href,
      sourcePlatform: "generic"
    };
  }
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("zhipin.com")) return "boss";
    if (host.includes("liepin.com")) return "liepin";
    return "generic";
  }
  function detectSearchResultPage() {
    const host = window.location.hostname;
    if (host.includes("zhipin.com")) {
      return !!(document.querySelector(".job-list") || document.querySelector(".search-job-result") || document.querySelector('[class*="job-list"]') || window.location.pathname.includes("web/geek/job"));
    }
    if (host.includes("liepin.com")) {
      return !!(document.querySelector(".job-list") || document.querySelector(".search-result") || window.location.pathname.includes("search"));
    }
    return false;
  }

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

  // plugin/anti-detection.ts
  var domainStates = /* @__PURE__ */ new Map();
  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  function checkThrottle(url) {
    const domain = getDomain(url);
    const hour = (/* @__PURE__ */ new Date()).getHours();
    if (hour >= ANTI_DETECTION.NIGHT_START_HOUR || hour < ANTI_DETECTION.NIGHT_END_HOUR) {
      return { allowed: false, reason: "night_pause" };
    }
    const now = Date.now();
    let state = domainStates.get(domain);
    if (!state || now >= state.resetAt) {
      state = { count: 0, resetAt: now + 36e5 };
      domainStates.set(domain, state);
    }
    if (state.count >= ANTI_DETECTION.MAX_PER_HOUR) {
      return {
        allowed: false,
        reason: `hourly_limit: ${state.count}/${ANTI_DETECTION.MAX_PER_HOUR}`
      };
    }
    state.count++;
    return { allowed: true };
  }
  function randomDelay(minMs, maxMs) {
    const u1 = Math.random();
    const u2 = Math.random();
    const skewed = Math.min(u1, u2) * (maxMs - minMs) + minMs;
    return Math.round(skewed);
  }
  function sleep(inputMs) {
    const jittered = inputMs + randomDelay(0, ANTI_DETECTION.JITTER_MS);
    return new Promise((resolve) => setTimeout(resolve, jittered));
  }
  async function simulateScroll() {
    const totalHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    const steps = Math.ceil(totalHeight / (viewportHeight * 0.7));
    for (let i = 0; i < steps; i++) {
      const scrollTo = (i + 1) * viewportHeight * 0.7;
      const delay = randomDelay(200, 600);
      window.scrollTo({
        top: scrollTo,
        behavior: "smooth"
      });
      await new Promise((r) => setTimeout(r, delay));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    await new Promise((r) => setTimeout(r, 500));
  }
  function watchPageChanges(callback) {
    let lastUrl = window.location.href;
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          callback();
        }
      }, 1e3);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = function(...args) {
      originalPushState(...args);
      setTimeout(callback, 500);
    };
    history.replaceState = function(...args) {
      originalReplaceState(...args);
      setTimeout(callback, 500);
    };
    window.addEventListener("popstate", () => {
      setTimeout(callback, 500);
    });
    return observer;
  }
  function onVisibilityChange(callback) {
    const handler = () => callback(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }

  // plugin/content-script.ts
  var currentJob = null;
  var pageObserver = null;
  var cleanupVisibility = null;
  var extractionInProgress = false;
  async function extractJobData() {
    if (extractionInProgress) return currentJob;
    extractionInProgress = true;
    try {
      await sleep(200);
      const platform = detectPlatform();
      let data = null;
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
  async function extractWithScroll() {
    if (!detectSearchResultPage()) {
      await simulateScroll();
    }
    await sleep(500);
    return extractJobData();
  }
  function prepareImportPayload(data) {
    let qualityScore = 1;
    if (!data.salary) qualityScore -= 0.15;
    if (!data.city) qualityScore -= 0.1;
    if (!data.experience) qualityScore -= 0.05;
    if (!data.education) qualityScore -= 0.05;
    if (data.jdText.length < 200) qualityScore -= 0.1;
    if (data.jdText.length < 100) qualityScore -= 0.15;
    const standardizedTitle = data.title.replace(/\s+/g, "").toLowerCase();
    const standardizedCompany = data.companyName.replace(/\s+/g, "").toLowerCase();
    const duplicateKey = `${standardizedCompany}|${standardizedTitle}`;
    return {
      ...data,
      qualityScore: Math.max(0, Math.round(qualityScore * 100) / 100),
      duplicateKey,
      importStatus: qualityScore >= 0.8 ? "complete" : "needs_review",
      extractedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  function notifyPopup(data) {
    chrome.runtime.sendMessage({
      action: "jobExtracted",
      data
    }).catch(() => {
    });
  }
  function notifyPageDetected(platform) {
    chrome.runtime.sendMessage({
      action: "pageDetected",
      platform
    }).catch(() => {
    });
  }
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    switch (request.action) {
      case "extractJob": {
        if (currentJob) {
          sendResponse(currentJob);
        } else {
          extractWithScroll().then((data) => sendResponse(data)).catch((err) => sendResponse({ error: err.message }));
          return true;
        }
        break;
      }
      case "extractAndImport": {
        extractWithScroll().then((data) => {
          if (!data) {
            sendResponse({ error: "No job data found on this page" });
            return;
          }
          const throttle = checkThrottle(data.sourceUrl);
          if (!throttle.allowed) {
            sendResponse({ error: `Throttled: ${throttle.reason}` });
            return;
          }
          const payload = prepareImportPayload(data);
          chrome.runtime.sendMessage({
            action: "importJob",
            payload
          }).then((result) => sendResponse(result)).catch((err) => sendResponse({ error: err.message }));
        }).catch((err) => sendResponse({ error: err.message }));
        return true;
      }
      case "getPageStatus": {
        const platform = detectPlatform();
        const isSearch = detectSearchResultPage();
        sendResponse({
          platform,
          isSearchPage: isSearch,
          hasJobData: !!currentJob,
          url: window.location.href
        });
        break;
      }
      default:
        sendResponse({ error: `Unknown action: ${request.action}` });
    }
  });
  function initialize() {
    const platform = detectPlatform();
    notifyPageDetected(platform);
    if (platform === "boss" || platform === "liepin") {
      extractWithScroll();
    }
    pageObserver = watchPageChanges(() => {
      console.log("[EveryDeliver] Page changed, re-extracting...");
      currentJob = null;
      extractWithScroll();
    });
    cleanupVisibility = onVisibilityChange((visible) => {
      if (visible && !currentJob && (platform === "boss" || platform === "liepin")) {
        extractWithScroll();
      }
    });
  }
  function cleanup() {
    pageObserver?.disconnect();
    pageObserver = null;
    cleanupVisibility?.();
    cleanupVisibility = null;
  }
  initialize();
  window.addEventListener("beforeunload", cleanup);
})();

/**
 * EveryDeliver Browser Extension — Content Script
 *
 * Detects job detail pages on BOSS Zhipin and Liepin,
 * extracts structured job data from the DOM,
 * and sends it to the popup for user confirmation.
 */

interface JobData {
  companyName: string;
  title: string;
  jdText: string;
  salary?: string;
  city?: string;
  sourceUrl: string;
  sourcePlatform: "boss" | "liepin" | "generic";
}

/** Determine which platform we're on */
function detectPlatform(): "boss" | "liepin" | "generic" {
  const host = window.location.hostname;
  if (host.includes("zhipin.com")) return "boss";
  if (host.includes("liepin.com")) return "liepin";
  return "generic";
}

/** Extract job data based on platform-specific selectors */
function extractJobData(): JobData | null {
  const platform = detectPlatform();

  if (platform === "boss") {
    return extractBossData();
  }

  if (platform === "liepin") {
    return extractLiepinData();
  }

  // Generic fallback: try common patterns
  return extractGenericData();
}

/**
 * BOSS Zhipin — Extract job data
 *
 * BOSS page structure (subject to change):
 * - Title: .name h1 or .job-name
 * - Company: .company-info .name or .company-name
 * - JD text: .job-sec .text or .job-detail
 * - Salary: .salary or .job-salary
 * - City: .job-location or .location
 */
function extractBossData(): JobData | null {
  const title =
    document.querySelector(".name h1")?.textContent?.trim() ||
    document.querySelector(".job-name")?.textContent?.trim() ||
    "";

  const companyName =
    document.querySelector(".company-info .name")?.textContent?.trim() ||
    document.querySelector(".company-name")?.textContent?.trim() ||
    "";

  const jdText =
    document.querySelector(".job-sec .text")?.textContent?.trim() ||
    document.querySelector(".job-detail")?.textContent?.trim() ||
    "";

  const salary =
    document.querySelector(".salary")?.textContent?.trim() ||
    document.querySelector(".job-salary")?.textContent?.trim() ||
    "";

  const city =
    document.querySelector(".job-location")?.textContent?.trim() ||
    document.querySelector(".location")?.textContent?.trim() ||
    "";

  if (!title || !companyName) {
    return null;
  }

  return {
    companyName,
    title,
    jdText,
    salary,
    city,
    sourceUrl: window.location.href,
    sourcePlatform: "boss",
  };
}

/**
 * Liepin — Extract job data
 *
 * Liepin page structure (subject to change):
 * - Title: .job-title or .title-info h1
 * - Company: .company-name or .company-info .name
 * - JD text: .job-description or .content-word
 * - Salary: .job-salary or .salary
 * - City: .city or .job-location
 */
function extractLiepinData(): JobData | null {
  const title =
    document.querySelector(".job-title")?.textContent?.trim() ||
    document.querySelector(".title-info h1")?.textContent?.trim() ||
    "";

  const companyName =
    document.querySelector(".company-name")?.textContent?.trim() ||
    document.querySelector(".company-info .name")?.textContent?.trim() ||
    "";

  const jdText =
    document.querySelector(".job-description")?.textContent?.trim() ||
    document.querySelector(".content-word")?.textContent?.trim() ||
    "";

  const salary =
    document.querySelector(".job-salary")?.textContent?.trim() ||
    document.querySelector(".salary")?.textContent?.trim() ||
    "";

  const city =
    document.querySelector(".city")?.textContent?.trim() ||
    document.querySelector(".job-location")?.textContent?.trim() ||
    "";

  if (!title || !companyName) {
    return null;
  }

  return {
    companyName,
    title,
    jdText,
    salary,
    city,
    sourceUrl: window.location.href,
    sourcePlatform: "liepin",
  };
}

/** Generic fallback for unsupported platforms */
function extractGenericData(): JobData | null {
  const metaDescription = document
    .querySelector('meta[name="description"]')
    ?.getAttribute("content");

  return {
    companyName: document.title.split(" - ")[1] || document.title,
    title: document.title.split(" - ")[0] || document.title,
    jdText: metaDescription || document.body.innerText.substring(0, 5000),
    sourceUrl: window.location.href,
    sourcePlatform: "generic",
  };
}

/**
 * Listen for extraction requests from the popup
 *
 * The popup sends a message when the user clicks "抓取此职位".
 * Content script extracts data and returns it.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "extractJob") {
    const data = extractJobData();
    sendResponse(data);
  }
  return true; // Keep the message channel open for async response
});

/** Notify popup when we're on a supported page */
chrome.runtime.sendMessage({
  action: "pageDetected",
  platform: detectPlatform(),
});

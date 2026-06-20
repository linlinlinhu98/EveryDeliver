/**
 * EveryDeliver Browser Extension — Popup Script (Phase 3.2–3.6)
 *
 * Enhanced popup with:
 * - Compliance check & confirmation flow
 * - Structured job preview (company, title, salary, city, exp, edu, tags)
 * - JD text preview (truncated)
 * - One-click import with throttle awareness
 * - Import queue status
 * - Quick link to EveryDeliver desktop app
 */

import type { JobData, ImportPayload } from "./types";

// ============================================================
// DOM Elements
// ============================================================

const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const preview = document.getElementById("preview")!;
const jdPreview = document.getElementById("jdPreview")!;
const btnExtract = document.getElementById("btnExtract") as HTMLButtonElement;
const btnOpenApp = document.getElementById("btnOpenApp") as HTMLButtonElement;
const btnSettings = document.getElementById("btnSettings") as HTMLButtonElement;
const toast = document.getElementById("toast")!;
const complianceModal = document.getElementById("complianceModal")!;
const chkAgree = document.getElementById("chkAgree") as HTMLInputElement;
const btnAgree = document.getElementById("btnAgree") as HTMLButtonElement;
const extractCount = document.getElementById("extractCount")!;

// Preview fields
const pvCompany = document.getElementById("pvCompany")!;
const pvTitle = document.getElementById("pvTitle")!;
const pvSalary = document.getElementById("pvSalary")!;
const pvCity = document.getElementById("pvCity")!;
const pvExperience = document.getElementById("pvExperience")!;
const pvEducation = document.getElementById("pvEducation")!;
const pvTags = document.getElementById("pvTags")!;
const pvPlatform = document.getElementById("pvPlatform")!;

// ============================================================
// State
// ============================================================

let currentJob: JobData | null = null;
let queueCount = 0;

// ============================================================
// Compliance
// ============================================================

async function checkCompliance(): Promise<boolean> {
  const result = await chrome.storage.local.get("compliance");
  return result.compliance?.accepted === true;
}

function showComplianceModal(): void {
  complianceModal.classList.add("visible");
}

chkAgree.addEventListener("change", () => {
  btnAgree.disabled = !chkAgree.checked;
});

btnAgree.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "acceptCompliance" });
  complianceModal.classList.remove("visible");
  initializePopup();
});

// ============================================================
// Toast
// ============================================================

function showToast(message: string, type: "success" | "error" | "warning"): void {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout((toast as any)._timeout);
  (toast as any)._timeout = setTimeout(() => {
    toast.className = "toast";
  }, 4000);
}

// ============================================================
// Status & Preview
// ============================================================

function updateStatus(
  platform: string,
  isSearchPage: boolean,
  hasData: boolean,
): void {
  if (platform === "boss" || platform === "liepin") {
    statusDot.className = "dot active";
    const label = platform === "boss" ? "BOSS 直聘" : "猎聘";
    if (isSearchPage) {
      statusText.textContent = `${label} 搜索结果页 — 点击职位详情后抓取`;
      btnExtract.disabled = true;
    } else if (hasData) {
      statusText.textContent = `${label} 职位页 — 已提取`;
      btnExtract.disabled = false;
    } else {
      statusText.textContent = `${label} 页面 — 提取中...`;
      btnExtract.disabled = true;
    }
  } else {
    statusDot.className = "dot inactive";
    statusText.textContent = "请在 BOSS 直聘或猎聘职位详情页使用";
    btnExtract.disabled = true;
  }
}

function updatePreview(data: JobData): void {
  currentJob = data;
  pvCompany.textContent = data.companyName || "-";
  pvTitle.textContent = data.title || "-";
  pvSalary.textContent = data.salary || "未标注";
  pvCity.textContent = data.city || "未标注";
  pvExperience.textContent = data.experience || "未标注";
  pvEducation.textContent = data.education || "未标注";
  pvTags.textContent = data.tags?.slice(0, 5).join(" · ") || "无";
  pvPlatform.textContent = data.sourcePlatform === "boss"
    ? "BOSS 直聘"
    : data.sourcePlatform === "liepin"
    ? "猎聘"
    : "通用";

  // JD text preview
  const jdText = data.jdText || "";
  jdPreview.textContent = jdText.length > 300
    ? jdText.substring(0, 300) + "..."
    : jdText || "无 JD 文本";

  preview.classList.add("visible");
  btnExtract.disabled = false;
}

function updateQueueCount(): void {
  extractCount.textContent = queueCount > 0
    ? `(${queueCount} 条待同步)`
    : "";
}

// ============================================================
// Extraction & Import
// ============================================================

async function extractAndImport(): Promise<void> {
  if (!currentJob) return;

  btnExtract.disabled = true;
  btnExtract.textContent = "导入中...";

  try {
    // Quality gates (client-side)
    if (!currentJob.companyName || currentJob.companyName.length < 2) {
      showToast("公司名过短或为空，无法导入", "error");
      btnExtract.disabled = false;
      btnExtract.textContent = "抓取此职位";
      return;
    }
    if (!currentJob.title || currentJob.title.length < 2) {
      showToast("岗位标题过短或为空", "error");
      btnExtract.disabled = false;
      btnExtract.textContent = "抓取此职位";
      return;
    }
    if (!currentJob.jdText || currentJob.jdText.length < 50) {
      showToast("JD 描述过短（< 50 字）", "warning");
      btnExtract.disabled = false;
      btnExtract.textContent = "抓取此职位";
      return;
    }

    // Compute quality score
    let qualityScore = 1.0;
    if (!currentJob.salary) qualityScore -= 0.15;
    if (!currentJob.city) qualityScore -= 0.1;
    if (currentJob.jdText.length < 200) qualityScore -= 0.1;

    const standardizedTitle = currentJob.title
      .replace(/\s+/g, "")
      .toLowerCase();
    const standardizedCompany = currentJob.companyName
      .replace(/\s+/g, "")
      .toLowerCase();
    const duplicateKey = `${standardizedCompany}|${standardizedTitle}`;

    const payload: ImportPayload = {
      ...currentJob,
      qualityScore: Math.max(0, Math.round(qualityScore * 100) / 100),
      duplicateKey,
      importStatus: qualityScore >= 0.8 ? "complete" : "needs_review",
      extractedAt: new Date().toISOString(),
    };

    // Persist locally as fallback
    const existing = await chrome.storage.local.get("importQueue");
    const queue: ImportPayload[] = existing.importQueue || [];
    if (!queue.some((item) => item.duplicateKey === duplicateKey)) {
      queue.push(payload);
      await chrome.storage.local.set({ importQueue: queue });
      queueCount = queue.length;
      updateQueueCount();
    }

    // Notify background worker for sync
    try {
      const result = await chrome.runtime.sendMessage({
        action: "importJob",
        payload,
      });

      if (result?.error) {
        showToast(result.error, "warning");
      } else {
        showToast("已导入！请在 EveryDeliver 桌面端查看", "success");
      }
    } catch {
      // Background may not be ready — data is in local storage
      showToast("已保存本地，打开桌面端后自动同步", "success");
    }
  } catch (err) {
    showToast(`导入失败：${err instanceof Error ? err.message : "未知错误"}`, "error");
  } finally {
    btnExtract.disabled = false;
    btnExtract.textContent = "抓取此职位";
  }
}

// ============================================================
// Event Handlers
// ============================================================

btnExtract.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showToast("无法获取当前标签页", "error");
    return;
  }

  try {
    // Request extraction from content script
    const data: JobData | null = await chrome.tabs.sendMessage(tab.id, {
      action: "extractJob",
    });

    if (data) {
      updatePreview(data);
      await extractAndImport();
    } else {
      showToast("未检测到职位信息。请确认在职位详情页", "error");
    }
  } catch {
    // Content script not injected — try injecting or show error
    showToast("请在招聘网站职位详情页打开插件", "error");
  }
});

btnOpenApp.addEventListener("click", () => {
  // Try deep link first (Tauri custom protocol)
  window.open("everydeliver://app", "_blank");
  // Also try opening the web app
  setTimeout(() => {
    window.open("http://localhost:5173/dashboard", "_blank");
  }, 500);
});

btnSettings.addEventListener("click", () => {
  // Open the extension options page or desktop preferences
  window.open("http://localhost:5173/preferences", "_blank");
});

// ============================================================
// Message Listener (from content script & background)
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  switch (message.action) {
    case "pageDetected":
      updateStatus(message.platform, false, false);
      break;

    case "jobExtracted":
      if (message.data) {
        updatePreview(message.data);
        updateStatus(message.data.sourcePlatform, false, true);
      }
      break;

    case "newImportAvailable":
      // Background notifies that a new import was queued
      queueCount++;
      updateQueueCount();
      break;
  }
});

// ============================================================
// Initialize
// ============================================================

async function initializePopup(): Promise<void> {
  // Load queue count
  const result = await chrome.storage.local.get("importQueue");
  const queue: ImportPayload[] = result.importQueue || [];
  queueCount = queue.length;
  updateQueueCount();

  // Query current tab status
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusText.textContent = "无法获取标签页信息";
    return;
  }

  try {
    // Get page status from content script
    const status: {
      platform: string;
      isSearchPage: boolean;
      hasJobData: boolean;
      url: string;
    } | null = await chrome.tabs.sendMessage(tab.id, {
      action: "getPageStatus",
    });

    if (status) {
      updateStatus(status.platform, status.isSearchPage, status.hasJobData);
    }

    // Try to get any already-extracted job data
    const data: JobData | null = await chrome.tabs.sendMessage(tab.id, {
      action: "extractJob",
    });

    if (data) {
      updatePreview(data);
      if (status) {
        updateStatus(status.platform, status.isSearchPage, true);
      }
    }
  } catch {
    // Content script not injected — page not matched
    statusDot.className = "dot inactive";
    statusText.textContent = "请在招聘网站职位详情页打开插件";
    btnExtract.disabled = true;
  }
}

// ============================================================
// Start
// ============================================================

(async () => {
  const alreadyAccepted = await checkCompliance();

  if (!alreadyAccepted) {
    showComplianceModal();
  } else {
    await initializePopup();
  }
})();

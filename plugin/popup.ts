/**
 * EveryDeliver Browser Extension — Popup Script
 *
 * Handles the popup UI: compliance check, job extraction,
 * preview display, and import confirmation.
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

// ── DOM elements ──────────────────────────────────
const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const preview = document.getElementById("preview")!;
const btnExtract = document.getElementById("btnExtract") as HTMLButtonElement;
const btnOpenApp = document.getElementById("btnOpenApp")!;
const toast = document.getElementById("toast")!;
const complianceModal = document.getElementById("complianceModal")!;
const chkAgree = document.getElementById("chkAgree") as HTMLInputElement;
const btnAgree = document.getElementById("btnAgree") as HTMLButtonElement;

// Preview fields
const pvCompany = document.getElementById("pvCompany")!;
const pvTitle = document.getElementById("pvTitle")!;
const pvSalary = document.getElementById("pvSalary")!;
const pvCity = document.getElementById("pvCity")!;

// ── State ─────────────────────────────────────────
let currentJob: JobData | null = null;
let supabaseClient: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

// ── Compliance check ──────────────────────────────
async function checkCompliance(): Promise<boolean> {
  const result = await chrome.storage.local.get("complianceAccepted");
  return result.complianceAccepted === true;
}

function showComplianceModal(): void {
  complianceModal.classList.add("visible");
}

chkAgree.addEventListener("change", () => {
  btnAgree.disabled = !chkAgree.checked;
});

btnAgree.addEventListener("click", async () => {
  await chrome.storage.local.set({ complianceAccepted: true });
  complianceModal.classList.remove("visible");
  initializePopup();
});

// ── Toast ─────────────────────────────────────────
function showToast(message: string, type: "success" | "error" | "warning"): void {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

// ── Platform detection ────────────────────────────
function updateStatus(platform: string): void {
  if (platform === "boss" || platform === "liepin") {
    statusDot.className = "dot active";
    statusText.textContent = `已检测到 ${platform === "boss" ? "BOSS 直聘" : "猎聘"} 职位页`;
    btnExtract.disabled = false;
  } else {
    statusDot.className = "dot inactive";
    statusText.textContent = "当前页面不是支持的招聘平台";
    btnExtract.disabled = true;
  }
}

// ── Populate preview ──────────────────────────────
function updatePreview(data: JobData): void {
  currentJob = data;
  pvCompany.textContent = data.companyName || "-";
  pvTitle.textContent = data.title || "-";
  pvSalary.textContent = data.salary || "-";
  pvCity.textContent = data.city || "-";
  preview.classList.add("visible");
}

// ── Job extraction ────────────────────────────────
async function extractJob(): Promise<void> {
  if (!currentJob) return;

  btnExtract.disabled = true;
  btnExtract.textContent = "导入中...";

  try {
    // Quality check: validate required fields
    if (!currentJob.companyName || currentJob.companyName.length < 2) {
      showToast("公司名过短或为空，无法导入", "error");
      return;
    }
    if (!currentJob.title || currentJob.title.length < 2) {
      showToast("岗位标题过短或为空，无法导入", "error");
      return;
    }
    if (!currentJob.jdText || currentJob.jdText.length < 50) {
      showToast("JD 描述过短（< 50 字），无法导入", "warning");
      return;
    }

    // Compute quality score (simplified)
    let qualityScore = 1.0;
    if (!currentJob.salary) qualityScore -= 0.2;
    if (!currentJob.city) qualityScore -= 0.1;
    if (currentJob.jdText.length < 200) qualityScore -= 0.1;

    // Generate duplicate key
    const standardizedTitle = currentJob.title.replace(/\s+/g, "").toLowerCase();
    const duplicateKey = `${currentJob.companyName}_${standardizedTitle}`
      .replace(/\s+/g, "")
      .toLowerCase();

    // Store in Supabase (fallback: store locally and sync later)
    // For MVP, we store via message passing to the desktop app
    // The desktop app handles the actual Supabase insert
    const importData = {
      ...currentJob,
      qualityScore,
      duplicateKey,
      importStatus: qualityScore >= 0.8 ? "complete" : "needs_review",
    };

    // Send to desktop app or store locally
    await chrome.storage.local.set({ lastImport: importData });

    showToast("已导入！请在 EveryDeliver 桌面端查看", "success");
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    showToast(`导入失败：${message}`, "error");
  } finally {
    btnExtract.disabled = false;
    btnExtract.textContent = "抓取此职位";
  }
}

// ── Open desktop app ──────────────────────────────
btnOpenApp.addEventListener("click", () => {
  // Deep link to Tauri app (custom protocol)
  window.open("everydeliver://app", "_blank");
});

// ── Listen for page detection from content script ─
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "pageDetected") {
    updateStatus(request.platform);
  }
});

// ── Extract on button click ───────────────────────
btnExtract.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const data: JobData | null = await chrome.tabs.sendMessage(tab.id, {
    action: "extractJob",
  });

  if (data) {
    updatePreview(data);
    await extractJob();
  } else {
    showToast("无法提取职位信息，请刷新页面后重试", "error");
  }
});

// ── Initialize ────────────────────────────────────
async function initializePopup(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Try to get initial page detection
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "pageDetected",
    });
    if (response) {
      updateStatus(response.platform);
    }
  } catch {
    // Content script may not be injected yet — that's okay
    statusText.textContent = "请打开招聘网站职位详情页";
  }

  // Auto-extract on supported pages
  try {
    const data: JobData | null = await chrome.tabs.sendMessage(tab.id, {
      action: "extractJob",
    });
    if (data) {
      updatePreview(data);
    }
  } catch {
    // Not a supported page
  }
}

// ── Start ─────────────────────────────────────────
(async () => {
  const alreadyAccepted = await checkCompliance();

  if (!alreadyAccepted) {
    showComplianceModal();
  } else {
    await initializePopup();
  }
})();

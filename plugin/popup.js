"use strict";
(() => {
  // plugin/popup.ts
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var preview = document.getElementById("preview");
  var jdPreview = document.getElementById("jdPreview");
  var btnExtract = document.getElementById("btnExtract");
  var btnOpenApp = document.getElementById("btnOpenApp");
  var btnSettings = document.getElementById("btnSettings");
  var toast = document.getElementById("toast");
  var complianceModal = document.getElementById("complianceModal");
  var chkAgree = document.getElementById("chkAgree");
  var btnAgree = document.getElementById("btnAgree");
  var extractCount = document.getElementById("extractCount");
  var pvCompany = document.getElementById("pvCompany");
  var pvTitle = document.getElementById("pvTitle");
  var pvSalary = document.getElementById("pvSalary");
  var pvCity = document.getElementById("pvCity");
  var pvExperience = document.getElementById("pvExperience");
  var pvEducation = document.getElementById("pvEducation");
  var pvTags = document.getElementById("pvTags");
  var pvPlatform = document.getElementById("pvPlatform");
  var currentJob = null;
  var queueCount = 0;
  async function checkCompliance() {
    const result = await chrome.storage.local.get("compliance");
    return result.compliance?.accepted === true;
  }
  function showComplianceModal() {
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
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.className = "toast";
    }, 4e3);
  }
  function updateStatus(platform, isSearchPage, hasData) {
    if (platform === "boss" || platform === "liepin") {
      statusDot.className = "dot active";
      const label = platform === "boss" ? "BOSS \u76F4\u8058" : "\u730E\u8058";
      if (isSearchPage) {
        statusText.textContent = `${label} \u641C\u7D22\u7ED3\u679C\u9875 \u2014 \u70B9\u51FB\u804C\u4F4D\u8BE6\u60C5\u540E\u6293\u53D6`;
        btnExtract.disabled = true;
      } else if (hasData) {
        statusText.textContent = `${label} \u804C\u4F4D\u9875 \u2014 \u5DF2\u63D0\u53D6`;
        btnExtract.disabled = false;
      } else {
        statusText.textContent = `${label} \u9875\u9762 \u2014 \u63D0\u53D6\u4E2D...`;
        btnExtract.disabled = true;
      }
    } else {
      statusDot.className = "dot inactive";
      statusText.textContent = "\u8BF7\u5728 BOSS \u76F4\u8058\u6216\u730E\u8058\u804C\u4F4D\u8BE6\u60C5\u9875\u4F7F\u7528";
      btnExtract.disabled = true;
    }
  }
  function updatePreview(data) {
    currentJob = data;
    pvCompany.textContent = data.companyName || "-";
    pvTitle.textContent = data.title || "-";
    pvSalary.textContent = data.salary || "\u672A\u6807\u6CE8";
    pvCity.textContent = data.city || "\u672A\u6807\u6CE8";
    pvExperience.textContent = data.experience || "\u672A\u6807\u6CE8";
    pvEducation.textContent = data.education || "\u672A\u6807\u6CE8";
    pvTags.textContent = data.tags?.slice(0, 5).join(" \xB7 ") || "\u65E0";
    pvPlatform.textContent = data.sourcePlatform === "boss" ? "BOSS \u76F4\u8058" : data.sourcePlatform === "liepin" ? "\u730E\u8058" : "\u901A\u7528";
    const jdText = data.jdText || "";
    jdPreview.textContent = jdText.length > 300 ? jdText.substring(0, 300) + "..." : jdText || "\u65E0 JD \u6587\u672C";
    preview.classList.add("visible");
    btnExtract.disabled = false;
  }
  function updateQueueCount() {
    extractCount.textContent = queueCount > 0 ? `(${queueCount} \u6761\u5F85\u540C\u6B65)` : "";
  }
  async function extractAndImport() {
    if (!currentJob) return;
    btnExtract.disabled = true;
    btnExtract.textContent = "\u5BFC\u5165\u4E2D...";
    try {
      if (!currentJob.companyName || currentJob.companyName.length < 2) {
        showToast("\u516C\u53F8\u540D\u8FC7\u77ED\u6216\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u5BFC\u5165", "error");
        btnExtract.disabled = false;
        btnExtract.textContent = "\u6293\u53D6\u6B64\u804C\u4F4D";
        return;
      }
      if (!currentJob.title || currentJob.title.length < 2) {
        showToast("\u5C97\u4F4D\u6807\u9898\u8FC7\u77ED\u6216\u4E3A\u7A7A", "error");
        btnExtract.disabled = false;
        btnExtract.textContent = "\u6293\u53D6\u6B64\u804C\u4F4D";
        return;
      }
      if (!currentJob.jdText || currentJob.jdText.length < 50) {
        showToast("JD \u63CF\u8FF0\u8FC7\u77ED\uFF08< 50 \u5B57\uFF09", "warning");
        btnExtract.disabled = false;
        btnExtract.textContent = "\u6293\u53D6\u6B64\u804C\u4F4D";
        return;
      }
      let qualityScore = 1;
      if (!currentJob.salary) qualityScore -= 0.15;
      if (!currentJob.city) qualityScore -= 0.1;
      if (currentJob.jdText.length < 200) qualityScore -= 0.1;
      const standardizedTitle = currentJob.title.replace(/\s+/g, "").toLowerCase();
      const standardizedCompany = currentJob.companyName.replace(/\s+/g, "").toLowerCase();
      const duplicateKey = `${standardizedCompany}|${standardizedTitle}`;
      const payload = {
        ...currentJob,
        qualityScore: Math.max(0, Math.round(qualityScore * 100) / 100),
        duplicateKey,
        importStatus: qualityScore >= 0.8 ? "complete" : "needs_review",
        extractedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const existing = await chrome.storage.local.get("importQueue");
      const queue = existing.importQueue || [];
      if (!queue.some((item) => item.duplicateKey === duplicateKey)) {
        queue.push(payload);
        await chrome.storage.local.set({ importQueue: queue });
        queueCount = queue.length;
        updateQueueCount();
      }
      try {
        const result = await chrome.runtime.sendMessage({
          action: "importJob",
          payload
        });
        if (result?.error) {
          showToast(result.error, "warning");
        } else {
          showToast("\u5DF2\u5BFC\u5165\uFF01\u8BF7\u5728 EveryDeliver \u684C\u9762\u7AEF\u67E5\u770B", "success");
        }
      } catch {
        showToast("\u5DF2\u4FDD\u5B58\u672C\u5730\uFF0C\u6253\u5F00\u684C\u9762\u7AEF\u540E\u81EA\u52A8\u540C\u6B65", "success");
      }
    } catch (err) {
      showToast(`\u5BFC\u5165\u5931\u8D25\uFF1A${err instanceof Error ? err.message : "\u672A\u77E5\u9519\u8BEF"}`, "error");
    } finally {
      btnExtract.disabled = false;
      btnExtract.textContent = "\u6293\u53D6\u6B64\u804C\u4F4D";
    }
  }
  btnExtract.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast("\u65E0\u6CD5\u83B7\u53D6\u5F53\u524D\u6807\u7B7E\u9875", "error");
      return;
    }
    try {
      const data = await chrome.tabs.sendMessage(tab.id, {
        action: "extractJob"
      });
      if (data) {
        updatePreview(data);
        await extractAndImport();
      } else {
        showToast("\u672A\u68C0\u6D4B\u5230\u804C\u4F4D\u4FE1\u606F\u3002\u8BF7\u786E\u8BA4\u5728\u804C\u4F4D\u8BE6\u60C5\u9875", "error");
      }
    } catch {
      showToast("\u8BF7\u5728\u62DB\u8058\u7F51\u7AD9\u804C\u4F4D\u8BE6\u60C5\u9875\u6253\u5F00\u63D2\u4EF6", "error");
    }
  });
  btnOpenApp.addEventListener("click", () => {
    window.open("everydeliver://app", "_blank");
    setTimeout(() => {
      window.open("http://localhost:5173/dashboard", "_blank");
    }, 500);
  });
  btnSettings.addEventListener("click", () => {
    window.open("http://localhost:5173/preferences", "_blank");
  });
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
        queueCount++;
        updateQueueCount();
        break;
    }
  });
  async function initializePopup() {
    const result = await chrome.storage.local.get("importQueue");
    const queue = result.importQueue || [];
    queueCount = queue.length;
    updateQueueCount();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      statusText.textContent = "\u65E0\u6CD5\u83B7\u53D6\u6807\u7B7E\u9875\u4FE1\u606F";
      return;
    }
    try {
      const status = await chrome.tabs.sendMessage(tab.id, {
        action: "getPageStatus"
      });
      if (status) {
        updateStatus(status.platform, status.isSearchPage, status.hasJobData);
      }
      const data = await chrome.tabs.sendMessage(tab.id, {
        action: "extractJob"
      });
      if (data) {
        updatePreview(data);
        if (status) {
          updateStatus(status.platform, status.isSearchPage, true);
        }
      }
    } catch {
      statusDot.className = "dot inactive";
      statusText.textContent = "\u8BF7\u5728\u62DB\u8058\u7F51\u7AD9\u804C\u4F4D\u8BE6\u60C5\u9875\u6253\u5F00\u63D2\u4EF6";
      btnExtract.disabled = true;
    }
  }
  (async () => {
    const alreadyAccepted = await checkCompliance();
    if (!alreadyAccepted) {
      showComplianceModal();
    } else {
      await initializePopup();
    }
  })();
})();

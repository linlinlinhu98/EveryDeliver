/**
 * PDF Export Service (Phase 5.7)
 *
 * Client-side PDF generation using browser print API.
 * Strategy:
 * 1. Assemble resume content with template styling
 * 2. Open print-friendly window with @media print CSS
 * 3. Trigger window.print() → Save as PDF
 *
 * This approach is more reliable than jsPDF/html2canvas for Chinese text
 * and produces higher-quality output with proper pagination.
 */

import type { ResumeModuleInstance, TemplateId } from "./resume-builder";
import { RESUME_TEMPLATES, MODULE_TYPES, assembleResume } from "./resume-builder";

export interface PDFOptions {
  templateId: TemplateId;
  title?: string;
  author?: string;
  includeHeader?: boolean;
  includeFooter?: boolean;
}

// ============================================================
// Print Stylesheet
// ============================================================

const PRINT_CSS = `
  @page {
    size: A4;
    margin: 20mm 18mm;
  }
  @media print {
    body {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

function getTemplateCSS(templateId: TemplateId): string {
  const template = RESUME_TEMPLATES.find((t) => t.id === templateId) || RESUME_TEMPLATES[0];
  return `
    body {
      font-family: ${template.style.fontFamily};
      font-size: ${template.style.fontSize};
      color: #1a1a1a;
      line-height: 1.7;
      max-width: 210mm;
      margin: 0 auto;
      padding: 0;
    }
    .resume-doc { padding: 0; }
    .resume-doc h1 {
      font-size: 24px;
      color: ${template.style.primaryColor};
      border-bottom: 2px solid ${template.style.primaryColor};
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .resume-doc h2 {
      font-size: 16px;
      color: ${template.style.primaryColor};
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
      margin-top: 18px;
      margin-bottom: 10px;
    }
    .resume-doc .module-content {
      white-space: pre-wrap;
      margin-bottom: 12px;
    }
    .resume-doc .meta {
      font-size: 11px;
      color: #888;
      margin-bottom: 16px;
    }
    .resume-doc .tags {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
    .header-bar {
      background: ${template.style.primaryColor};
      color: #fff;
      padding: 16px 20px;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .header-bar h1 { color: #fff; border: none; margin: 0 0 4px 0; padding: 0; }
    .header-bar .subtitle { font-size: 13px; opacity: 0.9; }
    .footer-bar {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #999;
      text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

// ============================================================
// HTML Generation
// ============================================================

function generatePDFHTML(
  modules: ResumeModuleInstance[],
  options: PDFOptions,
): string {
  const templateCSS = getTemplateCSS(options.templateId);
  const moduleMap = new Map(modules.map((m) => [m.module_type_id, m]));
  const template = RESUME_TEMPLATES.find((t) => t.id === options.templateId)
    || RESUME_TEMPLATES[0];

  const moduleSections = template.layout
    .map((typeId) => {
      const mod = moduleMap.get(typeId);
      if (!mod || !mod.content.trim()) return "";
      const typeDef = MODULE_TYPES.find((t) => t.id === typeId);
      const tags = mod.tags?.length
        ? `<div class="tags">🏷 ${mod.tags.join(" · ")}</div>`
        : "";
      return `
        <h2>${typeDef?.icon || ""} ${mod.title}</h2>
        <div class="module-content">${escapeHTML(mod.content)}</div>
        ${tags}
      `;
    })
    .filter(Boolean)
    .join("\n");

  const header = options.includeHeader !== false
    ? `
    <div class="header-bar">
      <h1>${escapeHTML(options.title || "个人简历")}</h1>
      <div class="subtitle">生成于 ${new Date().toLocaleDateString("zh-CN")} · 模板: ${template.name}</div>
    </div>`
    : "";

  const footer = options.includeFooter !== false
    ? `<div class="footer-bar">本简历由 EveryDeliver 生成 · everydeliver.app</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHTML(options.title || "个人简历")} - PDF</title>
  <style>${PRINT_CSS}${templateCSS}</style>
</head>
<body>
  <div class="resume-doc">
    ${header}
    ${moduleSections}
    ${footer}
  </div>
  <script>
    // Auto-trigger print dialog after load
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 300);
    });
    // Close window after print dialog
    window.addEventListener('afterprint', () => {
      // Keep window open in case user wants to re-print
    });
  </script>
</body>
</html>`;
}

// ============================================================
// Public API
// ============================================================

/**
 * Open print dialog for PDF export.
 *
 * Opens a new window with print-friendly HTML and triggers
 * the browser's print dialog (Save as PDF).
 *
 * @param modules - Resume module instances to include
 * @param options - Export options (template, title, etc.)
 */
export function exportToPDF(
  modules: ResumeModuleInstance[],
  options: PDFOptions,
): void {
  const html = generatePDFHTML(modules, options);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, "_blank", "width=900,height=700");
  if (!printWindow) {
    // Popup blocked — open in same window via data URI
    window.location.href = url;
    return;
  }

  // Clean up blob URL after window loads
  printWindow.addEventListener("load", () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

/**
 * Generate downloadable HTML file (alternative to PDF).
 * Useful when browser print-to-PDF is not preferred.
 */
export function exportToHTML(
  modules: ResumeModuleInstance[],
  options: PDFOptions,
): void {
  const html = generatePDFHTML(modules, options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `简历_${options.title || "resume"}_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate and trigger download of a text version.
 */
export function exportToText(
  modules: ResumeModuleInstance[],
  templateId: TemplateId,
): void {
  const text = assembleResume(modules, templateId);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `简历_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// Helpers
// ============================================================

function escapeHTML(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
}

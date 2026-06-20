// ============================================
// 简历构建器页面 (Phase 5 完整版)
// 模块拆解 + 模板选择 + PDF导出 + 编辑锁 + 历史版本
// ============================================
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  splitResume,
  MODULE_TYPES,
  RESUME_TEMPLATES,
  assembleResume,
} from "@/services/resume-builder";
import type { ResumeModuleInstance, SplitResult, TemplateId } from "@/services/resume-builder";
import { exportToPDF, exportToHTML, exportToText } from "@/services/pdf-export";
import { acquireLock, releaseLock, checkLock } from "@/services/edit-lock";
import type { LockStatus } from "@/services/edit-lock";
import { saveVersion, getVersions, restoreVersion, diffSummary } from "@/services/module-history";
import type { ModuleVersion } from "@/services/module-history";

export default function ResumeBuilder() {
  const navigate = useNavigate();
  const [resumeText, setResumeText] = useState("");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [editingModule, setEditingModule] = useState<number>(-1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("classic");
  const [assembledPreview, setAssembledPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit lock state
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [lockAcquiring, setLockAcquiring] = useState(false);

  // Module history
  const [moduleVersions, setModuleVersions] = useState<Map<number, ModuleVersion[]>>(new Map());
  const [showHistory, setShowHistory] = useState<number>(-1);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Load latest resume
  useEffect(() => {
    const load = async () => {
      try {
        const { data: resumes } = await supabase
          .from("resumes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);

        if (resumes && resumes.length > 0) {
          setResumeId(resumes[0].id);
          const { data: versions } = await supabase
            .from("resume_versions")
            .select("content")
            .eq("resume_id", resumes[0].id)
            .order("version_number", { ascending: false })
            .limit(1)
            .single();
          if (versions?.content) setResumeText(versions.content);
        }
      } catch { /* No existing resume */ }
    };
    load();
  }, []);

  // Acquire edit lock when entering edit mode
  useEffect(() => {
    if (splitResult && resumeId) {
      acquireEditLock();
    }
    return () => {
      if (resumeId && lockStatus?.isOwnLock) {
        releaseLock("resume", resumeId);
      }
    };
  }, [splitResult, resumeId]);

  const acquireEditLock = async () => {
    if (!resumeId) return;
    setLockAcquiring(true);
    try {
      const status = await checkLock("resume", resumeId);
      if (status.isLocked && !status.isOwnLock) {
        setError("此简历正在被其他设备编辑，请稍后再试");
        setLockStatus(status);
        return;
      }
      const lock = await acquireLock("resume", resumeId);
      if (lock) {
        setLockStatus({ isLocked: true, isOwnLock: true, lock });
      } else {
        setError("无法获取编辑锁，可能其他设备正在编辑");
      }
    } catch (err) {
      console.error("Lock error:", err);
    } finally {
      setLockAcquiring(false);
    }
  };

  const handleSplit = useCallback(() => {
    if (!resumeText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = splitResume(resumeText);
      setSplitResult(result);
      setEditingModule(-1);
      updatePreview(result.modules, selectedTemplate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "拆解失败");
    } finally {
      setLoading(false);
    }
  }, [resumeText, selectedTemplate]);

  const updatePreview = (modules: ResumeModuleInstance[], templateId: TemplateId) => {
    const assembled = assembleResume(modules, templateId);
    setAssembledPreview(assembled);
  };

  const handleModuleEdit = async (index: number, content: string) => {
    if (!splitResult) return;
    const updated = { ...splitResult };
    const oldContent = updated.modules[index].content;
    updated.modules[index].content = content;

    // Re-score module
    const typeId = updated.modules[index].module_type_id;
    updated.modules[index].quality_score = rescoreModule(typeId, content);
    setSplitResult(updated);
    updatePreview(updated.modules, selectedTemplate);

    // Save version history if module has an ID
    const mod = updated.modules[index];
    if (mod.id) {
      const diff = diffSummary(oldContent, content);
      if (diff.changeRatio > 5) {
        // Only save if meaningful change
        await saveVersion(
          mod.id,
          content,
          mod.tags,
          mod.quality_score,
          "manual_edit",
        );
      }
    }
  };

  const handleTemplateChange = (templateId: TemplateId) => {
    setSelectedTemplate(templateId);
    if (splitResult) updatePreview(splitResult.modules, templateId);
  };

  // Module history
  const loadModuleHistory = async (moduleIndex: number) => {
    const mod = splitResult?.modules[moduleIndex];
    if (!mod?.id) return;

    if (showHistory === moduleIndex) {
      setShowHistory(-1);
      return;
    }

    const versions = await getVersions(mod.id);
    setModuleVersions((prev) => new Map(prev).set(moduleIndex, versions));
    setShowHistory(moduleIndex);
  };

  const handleRestoreVersion = async (moduleIndex: number, versionNumber: number) => {
    const mod = splitResult?.modules[moduleIndex];
    if (!mod?.id) return;

    const restored = await restoreVersion(mod.id, versionNumber);
    if (restored) {
      handleModuleEdit(moduleIndex, restored.content);
      // Refresh history
      const versions = await getVersions(mod.id);
      setModuleVersions((prev) => new Map(prev).set(moduleIndex, versions));
    }
  };

  // PDF Export handlers
  const handleExportPDF = () => {
    if (!splitResult) return;
    exportToPDF(splitResult.modules, {
      templateId: selectedTemplate,
      title: "个人简历",
    });
    setShowExportMenu(false);
  };

  const handleExportHTML = () => {
    if (!splitResult) return;
    exportToHTML(splitResult.modules, {
      templateId: selectedTemplate,
      title: "个人简历",
    });
    setShowExportMenu(false);
  };

  const handleExportText = () => {
    if (!splitResult) return;
    exportToText(splitResult.modules, selectedTemplate);
    setShowExportMenu(false);
  };

  // Lock indicator
  const lockIndicator = lockStatus?.isOwnLock
    ? "🔒 编辑中"
    : lockStatus?.isLocked
    ? "🔴 被占用"
    : lockAcquiring
    ? "⏳ 获取锁..."
    : "";

  return (
    <div className="page-container" style={{ maxWidth: "1100px" }}>
      <div className="page-header">
        <div>
          <h1>🏗 简历构建器</h1>
          {lockIndicator && (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginLeft: "1rem" }}>
              {lockIndicator}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate("/resumes")}>
            ← 返回简历
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Step 1: Input Resume */}
      {!splitResult && (
        <section className="pref-section">
          <h2>📝 第一步：加载简历文本</h2>
          <p className="page-subtitle" style={{ marginBottom: "1rem" }}>
            粘贴你的简历全文，系统将自动拆解为 8 大模块
          </p>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="粘贴完整简历内容..."
            rows={12}
            style={{
              width: "100%", padding: "0.75rem",
              background: "var(--color-bg)", border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)", color: "var(--color-text)",
              fontFamily: "inherit", fontSize: "0.9rem", resize: "vertical",
            }}
          />
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleSplit}
              disabled={loading || !resumeText.trim()} style={{ width: "auto" }}>
              {loading ? "拆解中..." : "🔨 拆解简历"}
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Module Editor */}
      {splitResult && (
        <>
          {/* Quality Report */}
          <section className="pref-section">
            <h2>📊 质量报告</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                border: `4px solid ${splitResult.qualityReport.overallScore >= 70 ? "var(--color-success)" : "var(--color-warning)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.1rem", fontWeight: 700,
              }}>
                {splitResult.qualityReport.overallScore}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>综合评分</div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  {splitResult.qualityReport.overallScore >= 80
                    ? "👍 简历质量良好" : "⚠️ 建议按提示优化"}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {splitResult.qualityReport.dimensions.map((dim, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <span style={{ width: "70px" }}>{dim.name}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--color-bg)", borderRadius: 3 }}>
                    <div style={{
                      height: "100%", width: `${dim.score}%`,
                      background: dim.score >= 70 ? "var(--color-success)" : "var(--color-warning)",
                      borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ width: 40, textAlign: "right" }}>{dim.score}%</span>
                </div>
              ))}
            </div>
            {splitResult.qualityReport.suggestions.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                {splitResult.qualityReport.suggestions.map((s, i) => (
                  <div key={i} style={{ fontSize: "0.8rem", color: "var(--color-warning)" }}>💡 {s}</div>
                ))}
              </div>
            )}
          </section>

          {/* Template Selector */}
          <section className="pref-section">
            <h2>🎨 选择模板</h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {RESUME_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`tag-btn ${selectedTemplate === tpl.id ? "active" : ""}`}
                  onClick={() => handleTemplateChange(tpl.id)}
                  style={{ textAlign: "left", padding: "0.6rem 0.85rem" }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{tpl.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                    {tpl.description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Module Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {splitResult.modules.map((mod, i) => {
              const typeDef = MODULE_TYPES.find((t) => t.id === mod.module_type_id);
              const isEmpty = mod.content.length < 10;
              const versions = moduleVersions.get(i) || [];
              return (
                <div key={i} className="pref-section" style={{
                  padding: "0.75rem 1rem",
                  opacity: isEmpty ? 0.5 : 1,
                  marginBottom: 0,
                }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      cursor: "pointer", userSelect: "none",
                    }}
                    onClick={() => setEditingModule(editingModule === i ? -1 : i)}
                  >
                    <span style={{ fontSize: "1.2rem" }}>{typeDef?.icon || "📄"}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
                      {mod.title}
                    </span>
                    <span className="badge" style={{
                      fontSize: "0.65rem",
                      background: mod.quality_score >= 70
                        ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: mod.quality_score >= 70 ? "var(--color-success)" : "var(--color-error)",
                    }}>
                      {mod.quality_score}分
                    </span>
                    {mod.id && (
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: "0.6rem", padding: "2px 6px" }}
                        onClick={(e) => { e.stopPropagation(); loadModuleHistory(i); }}
                      >
                        📜 {versions.length > 0 ? `v${versions.length}` : "历史"}
                      </button>
                    )}
                    <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                      {editingModule === i ? "▲" : "▼"}
                    </span>
                  </div>

                  {editingModule === i && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <textarea
                        value={mod.content}
                        onChange={(e) => handleModuleEdit(i, e.target.value)}
                        rows={6}
                        style={{
                          width: "100%", padding: "0.65rem",
                          background: "var(--color-bg)", border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius)", color: "var(--color-text)",
                          fontFamily: "inherit", fontSize: "0.85rem", resize: "vertical",
                        }}
                      />
                    </div>
                  )}

                  {/* Version history dropdown */}
                  {showHistory === i && versions.length > 0 && (
                    <div style={{
                      marginTop: "0.5rem", padding: "0.65rem",
                      background: "var(--color-bg)", borderRadius: "var(--radius)",
                      border: "1px solid var(--color-border)",
                    }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                        版本历史 (最近 {versions.length} 条)
                      </div>
                      <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                        {versions.slice(0, 10).map((v) => (
                          <div key={v.version_number} style={{
                            display: "flex", alignItems: "center", gap: "0.5rem",
                            padding: "0.3rem 0", fontSize: "0.7rem",
                            borderBottom: "1px solid var(--color-border)",
                          }}>
                            <span style={{ fontWeight: 600, minWidth: "30px" }}>v{v.version_number}</span>
                            <span style={{ color: "var(--color-text-muted)", flex: 1 }}>
                              {v.change_description}
                            </span>
                            <span style={{ color: "var(--color-text-muted)", fontSize: "0.65rem" }}>
                              {v.created_at ? new Date(v.created_at).toLocaleTimeString("zh-CN") : ""}
                            </span>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ fontSize: "0.6rem", padding: "1px 5px" }}
                              onClick={() => handleRestoreVersion(i, v.version_number)}
                            >
                              恢复
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Preview */}
          <section className="pref-section">
            <h2>📄 简历预览</h2>
            <div className="resume-preview" style={{
              maxHeight: "400px", whiteSpace: "pre-wrap",
              fontFamily: RESUME_TEMPLATES.find((t) => t.id === selectedTemplate)?.style.fontFamily,
            }}>
              {assembledPreview || "选择模板后在此预览..."}
            </div>
          </section>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button className="btn btn-outline" onClick={() => {
              if (resumeId) releaseLock("resume", resumeId);
              setSplitResult(null);
            }} style={{ width: "auto" }}>
              🔄 重新拆分
            </button>
            <button className="btn btn-primary" style={{ width: "auto" }}
              onClick={() => {
                navigator.clipboard.writeText(assembledPreview);
                alert("简历已复制到剪贴板！");
              }}>
              📋 复制简历
            </button>

            {/* Export dropdown */}
            <div style={{ position: "relative" }}>
              <button className="btn btn-primary" style={{ width: "auto" }}
                onClick={() => setShowExportMenu(!showExportMenu)}>
                📥 导出简历 ▾
              </button>
              {showExportMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, zIndex: 10,
                  marginTop: "4px", minWidth: "180px",
                  background: "var(--color-bg)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  overflow: "hidden",
                }}>
                  <button onClick={handleExportPDF} style={{
                    display: "block", width: "100%", padding: "0.6rem 1rem",
                    border: "none", background: "none", color: "var(--color-text)",
                    cursor: "pointer", textAlign: "left", fontSize: "0.85rem",
                  }}>
                    🖨 导出 PDF（浏览器打印）
                  </button>
                  <button onClick={handleExportHTML} style={{
                    display: "block", width: "100%", padding: "0.6rem 1rem",
                    border: "none", background: "none", color: "var(--color-text)",
                    cursor: "pointer", textAlign: "left", fontSize: "0.85rem",
                  }}>
                    🌐 导出 HTML 文件
                  </button>
                  <button onClick={handleExportText} style={{
                    display: "block", width: "100%", padding: "0.6rem 1rem",
                    border: "none", background: "none", color: "var(--color-text)",
                    cursor: "pointer", textAlign: "left", fontSize: "0.85rem",
                  }}>
                    📝 导出纯文本
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Helper: re-score a single module after editing
function rescoreModule(typeId: string, content: string): number {
  if (!content || content.length < 10) return 0;
  let score = 50;

  const keywordMap: Record<string, string[]> = {
    personal_info: ["姓名", "电话", "邮箱"],
    summary: ["经验", "负责", "能力"],
    work_experience: ["公司", "负责", "成果", "提升"],
    projects: ["项目", "技术", "成果", "负责"],
    skills: ["熟练", "掌握", "了解", "开发"],
    education: ["大学", "专业", "学历"],
    certifications: ["证书", "认证", "通过"],
    additional: ["语言", "兴趣", "其他"],
  };

  const keywords = keywordMap[typeId] || [];
  for (const kw of keywords) {
    if (content.includes(kw)) score += 12;
  }

  // Length bonus
  if (content.length > 200) score += 10;
  if (content.length > 500) score += 5;

  return Math.min(100, score);
}

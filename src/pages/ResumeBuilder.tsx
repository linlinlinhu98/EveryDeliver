// ============================================
// 简历构建器页面 (Phase 5)
// 模块库 + 拆解 + 模板选择 + 组装 + 预览
// ============================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  splitResume,
  MODULE_TYPES,
  RESUME_TEMPLATES,
  assembleResume,
} from "@/services/resume-builder";
import type { ResumeModuleInstance, SplitResult, QualityReport, TemplateId } from "@/services/resume-builder";

export default function ResumeBuilder() {
  const navigate = useNavigate();
  const [resumeText, setResumeText] = useState("");
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [editingModule, setEditingModule] = useState<number>(-1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("classic");
  const [assembledPreview, setAssembledPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSplit = () => {
    if (!resumeText.trim()) return;
    setLoading(true);
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
  };

  const updatePreview = (modules: ResumeModuleInstance[], templateId: TemplateId) => {
    const assembled = assembleResume(modules, templateId);
    setAssembledPreview(assembled);
  };

  const handleModuleEdit = (index: number, content: string) => {
    if (!splitResult) return;
    const updated = { ...splitResult };
    updated.modules[index].content = content;
    setSplitResult(updated);
    updatePreview(updated.modules, selectedTemplate);
  };

  const handleTemplateChange = (templateId: TemplateId) => {
    setSelectedTemplate(templateId);
    if (splitResult) updatePreview(splitResult.modules, templateId);
  };

  return (
    <div className="page-container" style={{ maxWidth: "1100px" }}>
      <div className="page-header">
        <h1>🏗 简历构建器</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("/resumes")}>
          ← 返回简历
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
                    {tpl.description.slice(0, 15)}...
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
                </div>
              );
            })}
          </div>

          {/* Preview */}
          <section className="pref-section">
            <h2>📄 简历预览</h2>
            <div className="resume-preview" style={{ maxHeight: "600px", whiteSpace: "pre-wrap" }}>
              {assembledPreview || "选择模板后在此预览..."}
            </div>
          </section>

          <div className="btn-row" style={{ marginTop: "1rem" }}>
            <button className="btn btn-outline" onClick={() => setSplitResult(null)} style={{ width: "auto" }}>
              🔄 重新拆分
            </button>
            <button className="btn btn-primary" style={{ width: "auto" }}
              onClick={() => {
                navigator.clipboard.writeText(assembledPreview);
                alert("简历已复制到剪贴板！");
              }}>
              📋 复制简历
            </button>
          </div>
        </>
      )}
    </div>
  );
}

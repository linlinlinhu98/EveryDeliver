// ============================================
// JD 导入与解析页面 (Phase 2)
// 手动粘贴 JD 文本 / 链接 → 规则解析 + LLM → 结构化展示
// ============================================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { importJD } from "@/services/jd-service";
import { quickParse } from "@/services/jd-parser-orchestrator";
import type { JDParsePackage } from "@/services/jd-parser-types";
import { PARSE_METHOD_LABELS } from "@/services/jd-parser-types";

export default function JDImport() {
  const navigate = useNavigate();
  const [jdText, setJdText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [platform, setPlatform] = useState<string>("generic");
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<JDParsePackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleQuickPreview = async () => {
    if (!jdText.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const { result } = quickParse(jdText, undefined, platform);
      // 构建简化预览
      const preview: JDParsePackage = {
        result: {
          hardRequirements: result.hardRequirements || {
            education: null,
            experienceYears: null,
            salaryMin: null,
            salaryMax: null,
            location: null,
            language: null,
          },
          skills: result.skills || { directSkills: [], generalSkills: [] },
          responsibilities: result.responsibilities || { summary: null, keywords: [] },
          inferred: result.inferred || {
            teamSizeGuess: null,
            techTrend: null,
            urgency: null,
          },
        },
        metadata: {
          confidence: 0.5,
          parseMethod: "rule",
          parseVersion: 1,
          coveredFields: [],
          missingFields: [],
          parseDurationMs: 0,
        },
        warnings: ["快速预览仅使用规则解析，保存时会执行完整解析"],
      };
      setPreviewResult(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!jdText.trim()) return;
    setError(null);
    setLoading(true);

    try {
      await importJD({
        jdRawText: jdText,
        sourceUrl: sourceUrl || undefined,
        sourcePlatform: platform as "boss" | "liepin" | "generic" | "manual",
        companyName: companyName || undefined,
        title: title || undefined,
      });

      setSaved(true);
      setTimeout(() => navigate("/positions"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  const hard = previewResult?.result.hardRequirements;
  const skills = previewResult?.result.skills;
  const resp = previewResult?.result.responsibilities;
  const inferred = previewResult?.result.inferred;

  if (saved) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
        <h1>JD 导入成功！</h1>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
          正在跳转到职位列表...
        </p>
        <button className="btn btn-outline" onClick={() => navigate("/positions")}>
          查看职位列表
        </button>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: "960px" }}>
      <div className="page-header">
        <h1>📥 导入 JD</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("/dashboard")}>
          ← 返回
        </button>
      </div>
      <p className="page-subtitle" style={{ marginBottom: "1.5rem" }}>
        粘贴 JD 文本即可自动解析，也可手动补充公司/职位信息
      </p>

      {/* === Input Form === */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div className="form-group">
          <label>公司名称</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="如：字节跳动"
          />
        </div>
        <div className="form-group">
          <label>职位名称</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：高级前端工程师"
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div className="form-group">
          <label>来源平台</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="generic">自动检测</option>
            <option value="boss">BOSS 直聘</option>
            <option value="liepin">猎聘</option>
            <option value="manual">手动录入</option>
          </select>
        </div>
        <div className="form-group">
          <label>来源链接（可选）</label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.zhipin.com/job_detail/..."
          />
        </div>
      </div>

      <div className="form-group">
        <label>JD 文本（直接粘贴）</label>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder={`粘贴完整的 JD 文本...\n\n支持 BOSS 直聘、猎聘、公司官网等格式\n建议包含 公司、职位、薪资、学历、经验、技能、职责 等信息`}
          rows={12}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            color: "var(--color-text)",
            fontFamily: "inherit",
            fontSize: "0.9rem",
            resize: "vertical",
            lineHeight: 1.6,
          }}
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="btn-row" style={{ gap: "0.75rem" }}>
        <button
          className="btn btn-outline"
          onClick={handleQuickPreview}
          disabled={loading || !jdText.trim()}
          style={{ width: "auto" }}
        >
          {loading ? "解析中..." : "🔍 快速预览"}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading || !jdText.trim()}
          style={{ width: "auto" }}
        >
          {loading ? "保存中..." : "💾 导入并解析"}
        </button>
      </div>

      {/* === Parse Preview === */}
      {previewResult && (
        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>
            解析预览
            <span className="badge" style={{ marginLeft: "0.75rem", fontSize: "0.75rem" }}>
              置信度 {(previewResult.metadata.confidence * 100).toFixed(0)}%
              {previewResult.metadata.parseMethod !== "rule" && (
                <> · {PARSE_METHOD_LABELS[previewResult.metadata.parseMethod]}</>
              )}
            </span>
          </h2>

          {/* Layer 1: Hard Requirements */}
          <section className="pref-section">
            <h2>📋 硬性要求</h2>
            <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="form-group">
                <label>学历</label>
                <input value={hard?.education || "未识别"} disabled style={{ opacity: hard?.education ? 1 : 0.5 }} />
              </div>
              <div className="form-group">
                <label>经验年限</label>
                <input value={hard?.experienceYears || "未识别"} disabled style={{ opacity: hard?.experienceYears ? 1 : 0.5 }} />
              </div>
              <div className="form-group">
                <label>薪资范围</label>
                <input
                  value={
                    hard?.salaryMin
                      ? `${hard.salaryMin / 1000}K${hard.salaryMax ? ` - ${hard.salaryMax / 1000}K` : "+"}`
                      : "未识别"
                  }
                  disabled
                  style={{ opacity: hard?.salaryMin ? 1 : 0.5 }}
                />
              </div>
              <div className="form-group">
                <label>工作地点</label>
                <input value={hard?.location || "未识别"} disabled style={{ opacity: hard?.location ? 1 : 0.5 }} />
              </div>
              <div className="form-group">
                <label>语言要求</label>
                <input value={hard?.language || "未识别"} disabled style={{ opacity: hard?.language ? 1 : 0.5 }} />
              </div>
              <div className="form-group">
                <label>紧急度</label>
                <input value={inferred?.urgency || "正常"} disabled style={{ opacity: inferred?.urgency && inferred.urgency !== "正常" ? 1 : 0.5 }} />
              </div>
            </div>
          </section>

          {/* Layer 2: Skills */}
          <section className="pref-section">
            <h2>🛠 技能要求</h2>
            <div className="form-group">
              <label>核心技术栈 (权重 ×2.0)</label>
              <div className="tag-grid">
                {skills?.directSkills?.length ? (
                  skills.directSkills.map((s) => (
                    <span key={s} className="tag-btn active">{s}</span>
                  ))
                ) : (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    未识别，保存后将使用 LLM 提取
                  </span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>通用技能 (权重 ×0.5)</label>
              <div className="tag-grid">
                {skills?.generalSkills?.length ? (
                  skills.generalSkills.map((s) => (
                    <span key={s} className="tag-btn">{s}</span>
                  ))
                ) : (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>无</span>
                )}
              </div>
            </div>
          </section>

          {/* Layer 3: Responsibilities */}
          {resp?.summary && (
            <section className="pref-section">
              <h2>📝 职责摘要</h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", lineHeight: 1.8 }}>
                {resp.summary}
              </p>
              {resp.keywords && resp.keywords.length > 0 && (
                <div className="form-group" style={{ marginTop: "0.75rem" }}>
                  <label>关键词</label>
                  <div className="tag-grid">
                    {resp.keywords.map((k) => (
                      <span key={k} className="tag-btn">{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Warnings */}
          {previewResult.warnings.length > 0 && (
            <div className="alert" style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", color: "var(--color-warning)", marginBottom: 0 }}>
              {previewResult.warnings.map((w, i) => (
                <div key={i}>⚠️ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

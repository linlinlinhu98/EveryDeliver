// ============================================
// 匹配度详情页面 (Phase 4.3)
// 展示匹配度 + 技能缺口 + AI 优化建议 + 改动高亮
// ============================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getParseResult } from "@/services/jd-service";
import { calculateMatch } from "@/services/match-engine";
import type { JobPosition, JDParseRecord } from "@/services/jd-service";
import type { MatchResult, OptimizationSuggestion, SkillGap } from "@/services/match-engine";
import { RISK_LABELS, RISK_COLORS } from "@/services/match-engine";

export default function MatchDetail() {
  const navigate = useNavigate();
  const [position, setPosition] = useState<JobPosition | null>(null);
  const [parseRecord, setParseRecord] = useState<JDParseRecord | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 从 URL 获取 position id（简化版：取第一个）
    const loadMatch = async () => {
      try {
        // 获取最新职位
        const { data: positions } = await supabase
          .from("job_positions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!positions || positions.length === 0) {
          setError("请先导入 JD");
          setLoading(false);
          return;
        }

        const pos = positions[0] as JobPosition;
        setPosition(pos);

        const parseData = await getParseResult(pos.id);
        setParseRecord(parseData);

        if (parseData) {
          // 构建简历档案（从 Supabase 获取最新简历）
          const { data: resumes } = await supabase
            .from("resumes")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1);

          let resumeText = "";
          if (resumes && resumes.length > 0) {
            const { data: versions } = await supabase
              .from("resume_versions")
              .select("content")
              .eq("resume_id", resumes[0].id)
              .order("version_number", { ascending: false })
              .limit(1)
              .single();
            resumeText = versions?.content || "";
          }

          const result = calculateMatch(parseData, {
            skills: parseData.direct_skills || [],
            education: parseData.education || "本科",
            experienceYears: parseExperienceYears(parseData.experience_years),
            currentTitle: pos.title,
            summary: resumeText.slice(0, 500),
            sections: [
              { name: "work_experience", title: "工作经历", content: resumeText.slice(0, 300) },
              { name: "skills", title: "技能", content: (parseData.direct_skills || []).join("、") },
            ],
          });

          setMatchResult(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadMatch();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <div className="spinner" style={{ margin: "0 auto" }} />
        <p style={{ marginTop: "1rem", color: "var(--color-text-muted)" }}>
          正在分析匹配度...
        </p>
      </div>
    );
  }

  if (error || !position) {
    return (
      <div className="page-container" style={{ maxWidth: "800px" }}>
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📊</p>
          <p>{error || "未找到职位数据"}</p>
          <button className="btn btn-primary" onClick={() => navigate("/positions/import")} style={{ width: "auto" }}>
            导入 JD
          </button>
        </div>
      </div>
    );
  }

  const scores = matchResult?.scores;

  return (
    <div className="page-container" style={{ maxWidth: "960px" }}>
      <div className="page-header">
        <h1>📊 匹配度评估</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("/positions")}>
          ← 返回职位列表
        </button>
      </div>

      {/* Position Header */}
      <div className="pref-section" style={{ marginBottom: "1.5rem" }}>
        <h2>{position.title}</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
          {position.company_name}
          {position.city && ` · ${position.city}`}
          {position.salary_min && ` · ${position.salary_min / 1000}K${position.salary_max ? `-${position.salary_max / 1000}K` : "+"}`}
        </p>
      </div>

      {scores && (
        <>
          {/* Overall Score */}
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              background: "var(--color-surface)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                border: `6px solid ${scores.overall >= 70 ? "var(--color-success)" : scores.overall >= 50 ? "var(--color-warning)" : "var(--color-error)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "2rem",
                fontWeight: 700,
                background: "var(--color-bg)",
              }}
            >
              {scores.overall}%
            </div>
            <h2 style={{ marginBottom: "0.5rem" }}>综合匹配度</h2>
            <p style={{ color: "var(--color-text-muted)", maxWidth: "500px", margin: "0 auto" }}>
              {matchResult?.summary}
            </p>
          </div>

          {/* Score Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <ScoreCard label="硬技能" score={scores.hardSkills} color="#3b82f6" />
            <ScoreCard label="学历" score={scores.education} color="#8b5cf6" />
            <ScoreCard label="经验" score={scores.experience} color="#06b6d4" />
            <ScoreCard label="软技能" score={scores.softSkills} color="#f59e0b" />
            <ScoreCard label="职责匹配" score={scores.responsibility} color="#10b981" />
            <ScoreCard label="综合" score={scores.overall} color={scores.overall >= 70 ? "#22c55e" : scores.overall >= 50 ? "#eab308" : "#ef4444"} />
          </div>

          {/* Skill Gaps */}
          {matchResult && matchResult.skillGaps.length > 0 && (
            <section className="pref-section">
              <h2>🛠 技能缺口分析</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {matchResult.skillGaps.map((gap, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      background: gap.matchType === "matched"
                        ? "rgba(34, 197, 94, 0.08)"
                        : gap.importance === "required"
                          ? "rgba(239, 68, 68, 0.08)"
                          : "rgba(234, 179, 8, 0.08)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>
                      {gap.matchType === "matched" ? "✅" : gap.importance === "required" ? "❌" : "⚠️"}
                    </span>
                    <span style={{ fontWeight: 600, minWidth: "100px" }}>{gap.skill}</span>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.65rem",
                        background: gap.importance === "required"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(234, 179, 8, 0.15)",
                        color: gap.importance === "required" ? "var(--color-error)" : "var(--color-warning)",
                      }}
                    >
                      {gap.importance === "required" ? "必须" : "加分"}
                    </span>
                    {gap.suggestion && (
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>
                        {gap.suggestion}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Optimization Suggestions */}
          {matchResult && matchResult.suggestions.length > 0 && (
            <section className="pref-section">
              <h2>💡 AI 优化建议</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {matchResult.suggestions.map((sug, i) => {
                  const color = RISK_COLORS[sug.riskLevel];
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "0.75rem 1rem",
                        background: "var(--color-bg)",
                        border: `1px solid ${color}33`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "3px",
                            background: `${color}22`,
                            color,
                            fontWeight: 700,
                          }}
                        >
                          风险 Lv{sug.riskLevel}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                          {sug.action === "add" ? "添加" : sug.action === "modify" ? "修改" : sug.action === "emphasize" ? "强调" : sug.action === "reorder" ? "重排" : "弱化"}
                          {" "}· {sug.section === "skills" ? "技能" : sug.section === "summary" ? "自我评价" : sug.section === "work_experience" ? "工作经历" : sug.section === "education" ? "教育背景" : sug.section}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}>
                        {sug.reason}
                      </p>
                      {sug.suggestedText && (
                        <p style={{ fontSize: "0.8rem", color: "var(--color-success)", margin: "0.3rem 0 0" }}>
                          建议: "{sug.suggestedText}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="btn-row" style={{ marginTop: "1rem" }}>
                <button className="btn btn-primary" style={{ width: "auto" }}
                  onClick={() => alert("AI 优化功能将调用 Edge Function 逐段优化简历，请确保已配置 DEEPSEEK_API_KEY")}>
                  🤖 一键 AI 优化简历
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 小型评分卡片
 */
function ScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div
      style={{
        padding: "1rem",
        background: "var(--color-surface)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--color-border)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{score}%</div>
      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
        {label}
      </div>
      {/* Mini progress bar */}
      <div
        style={{
          marginTop: "0.5rem",
          height: "4px",
          background: "var(--color-bg)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: color,
            borderRadius: "2px",
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

function parseExperienceYears(expStr: string | null): number {
  if (!expStr) return 3;
  const map: Record<string, number> = { "0-1": 0, "1-3": 2, "3-5": 4, "5-10": 7, "10+": 12 };
  return map[expStr] || 3;
}

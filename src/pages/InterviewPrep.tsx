// ============================================
// 面试准备页面 (Phase 7 完整版)
// AI 出题 + GitHub 联动 + 邀请联动 + 分类 + 进度
// ============================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPrepItems, createPrepItem, updatePrepItem, deletePrepItem,
  generateQuestionsAI, importGeneratedQuestions,
  syncFromGitHubProjects, syncAllInterviewInvitations,
  computePrepStats,
  INTERVIEW_CATEGORIES, CATEGORY_LABELS,
} from "@/services/interview-service";
import type {
  InterviewPrepItem, InterviewCategory,
  GeneratedQuestions, GeneratedCategory,
} from "@/services/interview-service";
import { supabase } from "@/lib/supabase";

export default function InterviewPrep() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InterviewPrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InterviewCategory | "all">("all");
  const [generated, setGenerated] = useState<GeneratedQuestions | null>(null);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState<string[]>([]);
  const [syncing, setSyncing] = useState<"github" | "invitations" | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<InterviewCategory>("tech");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getPrepItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = computePrepStats(items);
  const filtered = activeTab === "all"
    ? items
    : items.filter((i) => i.category === activeTab);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggle = async (item: InterviewPrepItem) => {
    const newStatus = item.status === "completed" ? "pending" : "completed";
    try {
      await updatePrepItem(item.id!, { status: newStatus } as any);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: newStatus } : i,
        ),
      );
    } catch {
      alert("更新失败");
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      await createPrepItem({
        title: newTitle, category: newCategory, source: "manual",
        status: "pending", priority: 3, tags: [],
      });
      setNewTitle("");
      setShowAdd(false);
      await load();
    } catch {
      alert("添加失败");
    }
  };

  // AI Generate via Edge Function
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data: positions } = await supabase
        .from("job_positions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      const { data: parseResults } = await supabase
        .from("jd_parse_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      const title = positions?.[0]?.title || "软件工程师";
      const skills = parseResults?.[0]?.direct_skills || [];
      const keywords = parseResults?.[0]?.keywords || [];
      const jdText = positions?.[0]?.jd_text || undefined;

      const result = await generateQuestionsAI(title, skills, keywords, jdText);
      setGenerated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  // Import generated questions
  const handleImportCategory = async (cat: GeneratedCategory) => {
    setImporting((prev) => [...prev, cat.category]);
    try {
      const single: GeneratedQuestions = { categories: [cat] };
      const count = await importGeneratedQuestions(single);
      showMessage(`已导入 ${count} 道${cat.categoryName}题目`);
      await load();
      // Remove imported category from preview
      setGenerated((prev) => {
        if (!prev) return null;
        const remaining = prev.categories.filter(
          (c) => c.category !== cat.category,
        );
        return remaining.length > 0 ? { categories: remaining } : null;
      });
    } catch {
      setError(`导入「${cat.categoryName}」失败`);
    } finally {
      setImporting((prev) => prev.filter((c) => c !== cat.category));
    }
  };

  const handleImportAll = async () => {
    if (!generated) return;
    setImporting(generated.categories.map((c) => c.category));
    try {
      const count = await importGeneratedQuestions(generated);
      showMessage(`已导入全部 ${count} 道面试题`);
      await load();
      setGenerated(null);
    } catch {
      setError("导入失败");
    } finally {
      setImporting([]);
    }
  };

  // GitHub sync
  const handleGitHubSync = async () => {
    setSyncing("github");
    setError(null);
    try {
      const count = await syncFromGitHubProjects();
      if (count > 0) {
        showMessage(`已从 GitHub 项目生成 ${count} 条面试准备项`);
        await load();
      } else {
        showMessage("未配置 GitHub Token，请在偏好设置中添加");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub 同步失败");
    } finally {
      setSyncing(null);
    }
  };

  // Interview invitation sync
  const handleInvitationSync = async () => {
    setSyncing("invitations");
    setError(null);
    try {
      const result = await syncAllInterviewInvitations();
      if (result.synced > 0) {
        showMessage(
          `已从 ${result.synced} 个面试邀请生成准备项 (共检查 ${result.checked} 个)`,
        );
        await load();
      } else {
        showMessage(
          result.checked > 0
            ? `${result.checked} 个面试邀请已有准备项，无需同步`
            : "暂无待处理的面试邀请",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <div className="spinner" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: "1000px" }}>
      <div className="page-header">
        <h1>🎯 面试准备</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{ width: "auto" }}
          >
            {generating ? "⏳ 生成中..." : "🤖 AI 出题"}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleGitHubSync}
            disabled={syncing === "github"}
            style={{ width: "auto" }}
          >
            {syncing === "github" ? "⏳" : "📦"} GitHub 联动
          </button>
          <button
            className="btn btn-outline"
            onClick={handleInvitationSync}
            disabled={syncing === "invitations"}
            style={{ width: "auto" }}
          >
            {syncing === "invitations" ? "⏳" : "📨"} 面试邀请同步
          </button>
          <button
            className="btn btn-outline"
            onClick={() => setShowAdd(true)}
            style={{ width: "auto" }}
          >
            + 添加
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate("/dashboard")}
          >
            ← 返回
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "inherit", cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {message && (
        <div
          className="alert"
          style={{
            marginBottom: "0.75rem", padding: "0.5rem 0.75rem",
            background: "rgba(34, 197, 94, 0.1)", color: "var(--color-success)",
            borderRadius: "var(--radius)", fontSize: "0.85rem",
          }}
        >
          ✓ {message}
        </div>
      )}

      {/* Progress Bar */}
      <div style={{
        marginBottom: "1.5rem", background: "var(--color-surface)",
        borderRadius: "var(--radius)", padding: "1rem",
        border: "1px solid var(--color-border)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginBottom: "0.5rem", fontSize: "0.85rem",
        }}>
          <span>总进度</span>
          <span style={{ fontWeight: 600 }}>
            {stats.completed}/{stats.total} ({stats.progressPercent}%)
          </span>
        </div>
        <div style={{ height: 8, background: "var(--color-bg)", borderRadius: 4 }}>
          <div style={{
            height: "100%", width: `${stats.progressPercent}%`,
            background: stats.progressPercent === 100
              ? "var(--color-success)"
              : "var(--color-primary)",
            borderRadius: 4, transition: "width 0.3s",
          }} />
        </div>
        <div style={{
          display: "flex", gap: "1rem", marginTop: "0.5rem",
          fontSize: "0.75rem", color: "var(--color-text-muted)",
          flexWrap: "wrap",
        }}>
          {INTERVIEW_CATEGORIES.map((cat) => {
            const cs = stats.byCategory[cat.id] || { total: 0, completed: 0 };
            return (
              <span key={cat.id}>
                {cat.icon} {cat.name}: {cs.completed}/{cs.total}
              </span>
            );
          })}
          <span>
            ⏱ 已完成 {stats.completedMinutes}/{stats.totalEstimatedMinutes} 分钟
          </span>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div style={{
          padding: "1rem", background: "var(--color-surface)",
          borderRadius: "var(--radius)", border: "1px solid var(--color-border)",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="面试准备项标题…"
                style={{ width: "100%" }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as InterviewCategory)}
              >
                {INTERVIEW_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAdd}
              style={{ width: "auto" }}
            >
              添加
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowAdd(false)}
              style={{ width: "auto" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div style={{
        display: "flex", gap: "0.4rem", marginBottom: "1rem",
        flexWrap: "wrap",
      }}>
        {[
          { id: "all", name: "全部", icon: "📋" } as any,
          ...INTERVIEW_CATEGORIES,
        ].map((cat) => (
          <button
            key={cat.id}
            className={`tag-btn ${activeTab === cat.id ? "active" : ""}`}
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Generated Questions Preview */}
      {generated && (
        <section
          className="pref-section"
          style={{ borderColor: "rgba(139, 92, 246, 0.3)" }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "0.75rem",
          }}>
            <h2 style={{ margin: 0 }}>🤖 AI 生成的面试题</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleImportAll}
                disabled={importing.length > 0}
                style={{ width: "auto" }}
              >
                {importing.length > 0 ? "导入中..." : "📥 全部导入"}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setGenerated(null)}
                style={{ width: "auto" }}
              >
                关闭
              </button>
            </div>
          </div>

          {generated.categories.map((cat) => (
            <div key={cat.category} style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  fontSize: "0.95rem", marginBottom: "0.5rem",
                  display: "flex", alignItems: "center", gap: "0.5rem",
                }}
              >
                {INTERVIEW_CATEGORIES.find((c) => c.id === cat.category)?.icon}{" "}
                {cat.categoryName}
                <span
                  className="badge"
                  style={{ fontSize: "0.65rem" }}
                >
                  {cat.questions.length} 题
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleImportCategory(cat)}
                  disabled={importing.includes(cat.category)}
                  style={{
                    marginLeft: "auto", padding: "0.2rem 0.5rem",
                    fontSize: "0.7rem", width: "auto",
                  }}
                >
                  {importing.includes(cat.category) ? "导入中..." : "📥 导入"}
                </button>
              </h3>
              {cat.questions.map((q, qi) => (
                <div
                  key={qi}
                  style={{
                    padding: "0.5rem 0.75rem", marginBottom: "0.3rem",
                    background: "var(--color-bg)", borderRadius: "6px",
                    borderLeft: `3px solid ${
                      q.difficulty === "hard"
                        ? "var(--color-error)"
                        : q.difficulty === "medium"
                        ? "var(--color-warning)"
                        : "var(--color-success)"
                    }`,
                    fontSize: "0.85rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex", alignItems: "center",
                      gap: "0.5rem", flexWrap: "wrap",
                    }}
                  >
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.6rem",
                        background: "rgba(139, 92, 246, 0.15)",
                        color: "#8b5cf6",
                      }}
                    >
                      {q.difficulty}
                    </span>
                    <span>{q.question}</span>
                  </div>
                  {q.hint && (
                    <div
                      style={{
                        fontSize: "0.75rem", color: "var(--color-text-muted)",
                        marginTop: "0.15rem", paddingLeft: "0.5rem",
                      }}
                    >
                      💡 {q.hint}
                    </div>
                  )}
                  {q.expectedPoints && q.expectedPoints.length > 0 && (
                    <div
                      style={{
                        fontSize: "0.7rem", color: "var(--color-text-muted)",
                        marginTop: "0.25rem", paddingLeft: "0.5rem",
                      }}
                    >
                      📌 {q.expectedPoints.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* Items List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>🎯</p>
          <p>暂无面试准备项</p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            点击「AI 出题」生成面试题，或「GitHub 联动」从项目生成准备项
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: "0.75rem",
                padding: "0.7rem 0.85rem",
                background: "var(--color-surface)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
                opacity: item.status === "completed" ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={item.status === "completed"}
                onChange={() => handleToggle(item)}
                style={{
                  accentColor: "var(--color-primary)", marginTop: "0.2rem",
                  width: 16, height: 16, flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.9rem", fontWeight: 500,
                    textDecoration: item.status === "completed"
                      ? "line-through"
                      : "none",
                    color: item.status === "completed"
                      ? "var(--color-text-muted)"
                      : undefined,
                  }}
                >
                  {item.title}
                </div>
                {item.content && (
                  <div
                    style={{
                      fontSize: "0.8rem", color: "var(--color-text-muted)",
                      marginTop: "0.15rem", whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.content.length > 150
                      ? item.content.slice(0, 150) + "..."
                      : item.content}
                  </div>
                )}
                <div
                  style={{
                    display: "flex", gap: "0.5rem", marginTop: "0.3rem",
                    flexWrap: "wrap", alignItems: "center",
                  }}
                >
                  <span className="badge" style={{ fontSize: "0.65rem" }}>
                    {INTERVIEW_CATEGORIES.find((c) => c.id === item.category)
                      ?.icon}{" "}
                    {CATEGORY_LABELS[item.category as InterviewCategory]}
                  </span>
                  {item.source === "ai_generated" && (
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.6rem",
                        background: "rgba(139, 92, 246, 0.1)",
                        color: "#8b5cf6",
                      }}
                    >
                      🤖 AI
                    </span>
                  )}
                  {item.source === "auto_sync" && (
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.6rem",
                        background: "rgba(34, 197, 94, 0.1)",
                        color: "var(--color-success)",
                      }}
                    >
                      🔄 自动
                    </span>
                  )}
                  {item.priority >= 4 && (
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.65rem",
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "var(--color-error)",
                      }}
                    >
                      ⭐ 高优先
                    </span>
                  )}
                  {item.tags?.map((t) => (
                    <span
                      key={t}
                      className="badge"
                      style={{
                        fontSize: "0.6rem",
                        background: "rgba(139, 92, 246, 0.1)",
                        color: "#8b5cf6",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  {item.estimated_minutes && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      ⏱ {item.estimated_minutes}min
                    </span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                style={{
                  padding: "0.15rem 0.4rem", fontSize: "0.7rem",
                  color: "var(--color-error)", flexShrink: 0,
                }}
                onClick={() => {
                  deletePrepItem(item.id!);
                  load();
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

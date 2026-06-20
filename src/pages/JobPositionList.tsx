// ============================================
// 职位列表页面 (Phase 3 增强)
// 三层过滤 + 批量操作 + 筛选摘要
// ============================================
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getUserPositions, deletePosition, refreshLifecycleStatuses } from "@/services/jd-service";
import { batchFilterPositions, summarizeFilterResults } from "@/services/filter-engine";
import { getPreferences } from "@/services/preferences-service";
import { supabase } from "@/lib/supabase";
import { LIFECYCLE_LABELS } from "@/services/jd-parser-types";
import type { JobPosition } from "@/services/jd-service";
import type { FilterResult } from "@/services/filter-engine";
import type { Preferences } from "@/services/preferences-service";

export default function JobPositionList() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [filterResults, setFilterResults] = useState<Map<string, FilterResult>>(new Map());
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewFilter, setViewFilter] = useState<string>("all"); // all | blocked | duplicate | warned | passed
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    setLoading(true);
    try {
      await refreshLifecycleStatuses().catch(() => {});

      const data = await getUserPositions({
        lifecycle: filterStatus === "all" ? undefined : (filterStatus as any),
      });
      setPositions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const runFilter = useCallback(async () => {
    if (positions.length === 0) return;
    setFiltering(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const prefs = await getPreferences();
      setPreferences(prefs);

      const results = await batchFilterPositions(positions, prefs, user.id);
      setFilterResults(results);
    } catch (err) {
      console.error("过滤失败:", err);
    } finally {
      setFiltering(false);
    }
  }, [positions]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  useEffect(() => {
    if (positions.length > 0) runFilter();
  }, [positions, runFilter]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除「${title}」？`)) return;
    try {
      await deletePosition(id);
      setPositions((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个职位？`)) return;

    let deleted = 0;
    for (const id of selected) {
      try { await deletePosition(id); deleted++; } catch { /* skip */ }
    }
    setPositions((prev) => prev.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
    alert(`已删除 ${deleted} 个职位`);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === displayPositions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayPositions.map((p) => p.id)));
    }
  };

  // 过滤显示
  const displayPositions = positions.filter((pos) => {
    if (viewFilter === "all") return true;
    const result = filterResults.get(pos.id);
    if (!result) return true;
    return result.action === viewFilter;
  });

  const summary = summarizeFilterResults(filterResults);

  const statusBadgeStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case "active":
        return { background: "rgba(34, 197, 94, 0.15)", color: "var(--color-success)" };
      case "expiring_soon":
        return { background: "rgba(234, 179, 8, 0.15)", color: "var(--color-warning)" };
      case "expired":
        return { background: "rgba(239, 68, 68, 0.15)", color: "var(--color-error)" };
      default:
        return {};
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: "1100px" }}>
      <div className="page-header">
        <h1>📋 职位列表</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" onClick={() => navigate("/positions/import")} style={{ width: "auto" }}>
            + 导入 JD
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate("/dashboard")}>
            ← 返回
          </button>
        </div>
      </div>

      {/* Filter Summary Bar */}
      {filterResults.size > 0 && (
        <div style={{
          display: "flex", gap: "1rem", flexWrap: "wrap",
          padding: "0.75rem 1rem", marginBottom: "1rem",
          background: "var(--color-surface)", borderRadius: "var(--radius)",
          border: "1px solid var(--color-border)", fontSize: "0.85rem",
        }}>
          {summary.blocked > 0 && (
            <span style={{ color: "var(--color-error)", fontWeight: 600 }}>
              🚫 黑名单 {summary.blocked}
            </span>
          )}
          {summary.duplicates > 0 && (
            <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>
              🔄 重复 {summary.duplicates}
            </span>
          )}
          {summary.warnings > 0 && (
            <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>
              ⚠️ 警告 {summary.warnings}
            </span>
          )}
          {summary.passed > 0 && (
            <span style={{ color: "var(--color-success)", fontWeight: 600 }}>
              ✅ 通过 {summary.passed}
            </span>
          )}
          <span style={{ color: "var(--color-text-muted)", marginLeft: "auto" }}>
            共 {summary.total} 个职位
          </span>
          {filtering && <span style={{ color: "var(--color-text-muted)" }}>过滤中...</span>}
        </div>
      )}

      {/* Controls Row */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {/* Lifecycle Filter */}
        {[
          { key: "all", label: "全部" },
          { key: "active", label: "活跃" },
          { key: "expiring_soon", label: "即将过期" },
          { key: "expired", label: "已过期" },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`tag-btn ${filterStatus === key ? "active" : ""}`}
            onClick={() => { setFilterStatus(key); setViewFilter("all"); }}
          >
            {label}
          </button>
        ))}

        <span style={{ color: "var(--color-border)", margin: "0 0.25rem" }}>|</span>

        {/* Filter Action Filter */}
        {[
          { key: "all", label: "不限" },
          { key: "block", label: "🚫 已屏蔽" },
          { key: "duplicate", label: "🔄 重复" },
          { key: "warn", label: "⚠️ 警告" },
          { key: "pass", label: "✅ 通过" },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`tag-btn ${viewFilter === key ? "active" : ""}`}
            onClick={() => setViewFilter(key)}
          >
            {label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          {selected.size > 0 && (
            <button className="btn btn-outline btn-sm" onClick={handleBatchDelete}
              style={{ color: "var(--color-error)", borderColor: "rgba(239, 68, 68, 0.3)", width: "auto" }}>
              删除选中 ({selected.size})
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={loadPositions} style={{ width: "auto" }}>
            🔄 刷新
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
          <p style={{ color: "var(--color-text-muted)", marginTop: "1rem" }}>加载中...</p>
        </div>
      ) : displayPositions.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📭</p>
          <p>{viewFilter !== "all" ? "没有匹配的职位" : "暂无职位数据"}</p>
          {viewFilter === "all" && (
            <button className="btn btn-primary" onClick={() => navigate("/positions/import")} style={{ width: "auto" }}>
              导入第一个 JD
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Select All */}
          {displayPositions.length > 1 && (
            <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={selected.size === displayPositions.length && displayPositions.length > 0}
                  onChange={toggleSelectAll}
                  style={{ accentColor: "var(--color-primary)" }}
                />
                全选 ({displayPositions.length} 个)
              </label>
            </div>
          )}

          <div className="resume-list">
            {displayPositions.map((pos) => {
              const result = filterResults.get(pos.id);
              const isBlocked = result?.action === "block";
              const isDup = result?.action === "duplicate";

              return (
                <div
                  key={pos.id}
                  className="resume-card"
                  style={{
                    flexWrap: "wrap", gap: "0.5rem",
                    opacity: isBlocked ? 0.5 : 1,
                    borderColor: isBlocked
                      ? "rgba(239, 68, 68, 0.3)"
                      : isDup
                        ? "rgba(234, 179, 8, 0.3)"
                        : undefined,
                  }}
                >
                  {/* Checkbox */}
                  <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(pos.id)}
                      onChange={() => toggleSelect(pos.id)}
                      style={{ accentColor: "var(--color-primary)", width: 16, height: 16 }}
                    />
                  </div>

                  <div className="resume-card-body" style={{ flex: 1, minWidth: "180px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h3 style={isBlocked ? { textDecoration: "line-through", color: "var(--color-text-muted)" } : {}}>
                        {pos.title}
                      </h3>
                      {pos.source_platform && (
                        <span className="badge" style={{ fontSize: "0.65rem" }}>
                          {pos.source_platform === "boss" ? "BOSS" : pos.source_platform === "liepin" ? "猎聘" : pos.source_platform}
                        </span>
                      )}
                      <span className="badge" style={{ fontSize: "0.65rem", ...statusBadgeStyle(pos.lifecycle_status) }}>
                        {LIFECYCLE_LABELS[pos.lifecycle_status] || pos.lifecycle_status}
                      </span>
                      {/* Filter action badges */}
                      {result?.action === "block" && (
                        <span className="badge" style={{ fontSize: "0.65rem", background: "rgba(239, 68, 68, 0.2)", color: "var(--color-error)" }}>
                          🚫 {result.reason?.slice(0, 20)}
                        </span>
                      )}
                      {result?.action === "duplicate" && (
                        <span className="badge" style={{ fontSize: "0.65rem", background: "rgba(234, 179, 8, 0.2)", color: "var(--color-warning)" }}>
                          🔄 重复
                        </span>
                      )}
                      {result?.action === "warn" && (
                        <span className="badge" style={{ fontSize: "0.65rem", background: "rgba(234, 179, 8, 0.15)", color: "var(--color-warning)" }}>
                          ⚠️ {result.warnings.length} 个警告
                        </span>
                      )}
                      {result?.action === "pass" && (
                        <span className="badge badge-ready" style={{ fontSize: "0.65rem" }}>✅</span>
                      )}
                    </div>
                    <div className="resume-meta">
                      <span>{pos.company_name}</span>
                      {pos.city && <span> · {pos.city}</span>}
                      {pos.salary_min && (
                        <span> · {pos.salary_min / 1000}K{pos.salary_max ? `-${pos.salary_max / 1000}K` : "+"}</span>
                      )}
                      {pos.quality_score !== null && (
                        <span> · 质量 {pos.quality_score}分</span>
                      )}
                    </div>
                    <div className="resume-meta" style={{ marginTop: "0.15rem" }}>
                      导入: {new Date(pos.created_at).toLocaleDateString("zh-CN")}
                      {pos.expires_at && (
                        <span style={{ color: pos.lifecycle_status === "expired" ? "var(--color-error)" : undefined }}>
                          {" "}
                          · {pos.lifecycle_status === "expired" ? "已过期" : `有效至 ${new Date(pos.expires_at).toLocaleDateString("zh-CN")}`}
                        </span>
                      )}
                    </div>
                    {/* Warnings detail */}
                    {result?.warnings && result.warnings.length > 0 && (
                      <div style={{ marginTop: "0.3rem" }}>
                        {result.warnings.map((w, i) => (
                          <div key={i} style={{
                            fontSize: "0.75rem", color: w.severity === "high" ? "var(--color-error)" : "var(--color-warning)",
                            paddingLeft: "0.5rem", borderLeft: `2px solid ${w.severity === "high" ? "var(--color-error)" : "var(--color-warning)"}`,
                          }}>
                            {w.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="resume-card-actions" style={{ gap: "0.35rem" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/positions/${pos.id}`)}>
                      查看
                    </button>
                    {pos.source_url && (
                      <button className="btn btn-outline btn-sm" onClick={() => window.open(pos.source_url!, "_blank")}>
                        打开原文 ↗
                      </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => handleDelete(pos.id, pos.title)}
                      style={{ color: "var(--color-error)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

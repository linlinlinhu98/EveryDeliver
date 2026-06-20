// ============================================
// 职位列表页面 (Phase 2)
// 展示已导入的 JD，含生命周期状态和快速操作
// ============================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserPositions, deletePosition, refreshLifecycleStatuses } from "@/services/jd-service";
import { LIFECYCLE_LABELS } from "@/services/jd-parser-types";
import type { JobPosition } from "@/services/jd-service";

export default function JobPositionList() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const loadPositions = async () => {
    setLoading(true);
    try {
      // 先刷新生命周期状态
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
  };

  useEffect(() => {
    loadPositions();
  }, [filterStatus]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除「${title}」？`)) return;
    try {
      await deletePosition(id);
      setPositions((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

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

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[
          { key: "all", label: "全部" },
          { key: "active", label: "活跃" },
          { key: "expiring_soon", label: "即将过期" },
          { key: "expired", label: "已过期" },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`tag-btn ${filterStatus === key ? "active" : ""}`}
            onClick={() => setFilterStatus(key)}
          >
            {label}
          </button>
        ))}
        <button
          className="btn btn-outline btn-sm"
          onClick={loadPositions}
          style={{ marginLeft: "auto", width: "auto" }}
        >
          🔄 刷新
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
          <p style={{ color: "var(--color-text-muted)", marginTop: "1rem" }}>加载中...</p>
        </div>
      ) : positions.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📭</p>
          <p>暂无职位数据</p>
          <button className="btn btn-primary" onClick={() => navigate("/positions/import")} style={{ width: "auto" }}>
            导入第一个 JD
          </button>
        </div>
      ) : (
        <div className="resume-list">
          {positions.map((pos) => (
            <div key={pos.id} className="resume-card" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <div className="resume-card-body" style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h3>{pos.title}</h3>
                  {pos.source_platform && (
                    <span className="badge" style={{ fontSize: "0.65rem" }}>
                      {pos.source_platform === "boss" ? "BOSS" : pos.source_platform === "liepin" ? "猎聘" : pos.source_platform}
                    </span>
                  )}
                  <span
                    className="badge"
                    style={{ fontSize: "0.65rem", ...statusBadgeStyle(pos.lifecycle_status) }}
                  >
                    {LIFECYCLE_LABELS[pos.lifecycle_status] || pos.lifecycle_status}
                  </span>
                </div>
                <div className="resume-meta">
                  <span>{pos.company_name}</span>
                  {pos.city && <span> · {pos.city}</span>}
                  {pos.salary_min && (
                    <span>
                      {" "}
                      · {pos.salary_min / 1000}K{pos.salary_max ? `-${pos.salary_max / 1000}K` : "+"}
                    </span>
                  )}
                  {pos.quality_score !== null && (
                    <span> · 质量 {pos.quality_score}分</span>
                  )}
                </div>
                <div className="resume-meta" style={{ marginTop: "0.15rem" }}>
                  导入: {new Date(pos.created_at).toLocaleDateString("zh-CN")}
                  {pos.fetch_count > 1 && ` · 抓取 ${pos.fetch_count} 次`}
                  {pos.expires_at && (
                    <span style={{ color: pos.lifecycle_status === "expired" ? "var(--color-error)" : undefined }}>
                      {" "}
                      · {pos.lifecycle_status === "expired" ? "已过期" : `有效期至 ${new Date(pos.expires_at).toLocaleDateString("zh-CN")}`}
                    </span>
                  )}
                </div>
              </div>

              <div className="resume-card-actions" style={{ gap: "0.35rem" }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/positions/${pos.id}`)}
                >
                  查看
                </button>
                {pos.source_url && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => window.open(pos.source_url!, "_blank")}
                  >
                    打开原文 ↗
                  </button>
                )}
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleDelete(pos.id, pos.title)}
                  style={{ color: "var(--color-error)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

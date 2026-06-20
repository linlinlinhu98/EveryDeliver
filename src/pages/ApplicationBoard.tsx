// ============================================
// 投递追踪看板 (Phase 6)
// 三视图：表格 / 看板 / 时间线 + 统计 + 提醒
// ============================================
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getApplications, updateStatus, deleteApplication,
  getReminders, computeStats,
  APPLICATION_STATUSES, STATUS_LABELS, STATUS_COLORS,
} from "@/services/application-service";
import type { ApplicationRecord, ApplicationStatus, ApplicationStats } from "@/services/application-service";

type ViewMode = "table" | "kanban" | "timeline";

export default function ApplicationBoard() {
  const navigate = useNavigate();
  const [applications, setApps] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getApplications();
      setApps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reminders = useMemo(() => getReminders(applications), [applications]);
  const stats = useMemo(() => computeStats(applications), [applications]);

  const handleStatusChange = async (id: string, newStatus: ApplicationStatus) => {
    try {
      await updateStatus(id, newStatus);
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除「${title}」的投递记录？`)) return;
    try {
      await deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <div className="spinner" style={{ margin: "0 auto" }} />
        <p style={{ marginTop: "1rem", color: "var(--color-text-muted)" }}>加载投递数据...</p>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: "1300px" }}>
      <div className="page-header">
        <h1>📊 投递追踪看板</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("/dashboard")}>← 返回</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <StatCard label="总投递" value={stats.total} color="#3b82f6" />
        <StatCard label="本周新增" value={stats.appliedThisWeek} color="#22c55e" />
        <StatCard label="面试率" value={`${stats.interviewRate}%`} color="#f59e0b" />
        <StatCard label="Offer率" value={`${stats.offerRate}%`} color="#8b5cf6" />
      </div>

      {/* Funnel + Platform breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <section className="pref-section" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>📈 转化漏斗</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            {(["pending", "applied", "resume_viewed", "interviewing", "offered"] as ApplicationStatus[]).map((s) => {
              const count = stats.byStatus[s] || 0;
              const maxCount = Math.max(1, stats.total);
              const height = Math.max(4, (count / maxCount) * 120);
              return (
                <div key={s} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>{count}</div>
                  <div style={{
                    height: `${height}px`, borderRadius: "4px 4px 0 0",
                    background: STATUS_COLORS[s],
                    opacity: count > 0 ? 0.8 : 0.2,
                    transition: "height 0.3s",
                  }} />
                  <div style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                    {STATUS_LABELS[s]}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pref-section" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>🏢 平台分布</h2>
          {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
            <div key={platform} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
              <span style={{ width: "70px" }}>{platform === "boss" ? "BOSS直聘" : platform === "liepin" ? "猎聘" : platform}</span>
              <div style={{ flex: 1, height: 8, background: "var(--color-bg)", borderRadius: 4 }}>
                <div style={{
                  height: "100%", width: `${(count / stats.total) * 100}%`,
                  background: "var(--color-primary)", borderRadius: 4,
                }} />
              </div>
              <span style={{ width: 30, textAlign: "right" }}>{count}</span>
            </div>
          ))}
        </section>
      </div>

      {/* Reminders */}
      {reminders.length > 0 && (
        <div style={{
          padding: "0.75rem 1rem", marginBottom: "1rem",
          background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)",
          borderRadius: "var(--radius)", fontSize: "0.85rem",
        }}>
          <strong>🔔 提醒 ({reminders.length})：</strong>
          {reminders.slice(0, 3).map((r, i) => (
            <span key={i} style={{ marginLeft: "1rem" }}>
              {r.reminder.title} — {r.application.title || r.application.company_name}
            </span>
          ))}
        </div>
      )}

      {/* View Toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {([
          { key: "table", label: "📋 表格" },
          { key: "kanban", label: "📌 看板" },
          { key: "timeline", label: "📅 时间线" },
        ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
          <button key={key} className={`tag-btn ${viewMode === key ? "active" : ""}`}
            onClick={() => setViewMode(key)}>{label}</button>
        ))}
        <button className="btn btn-outline btn-sm" onClick={load} style={{ marginLeft: "auto", width: "auto" }}>🔄 刷新</button>
      </div>

      {/* Views */}
      {applications.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📋</p>
          <p>暂无投递记录</p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            前往 <a href="#" onClick={() => navigate("/positions")}>职位列表</a> 选择职位开始投递
          </p>
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanView apps={applications} onStatusChange={handleStatusChange} onDelete={handleDelete} />
      ) : viewMode === "timeline" ? (
        <TimelineView apps={applications} />
      ) : (
        <TableView apps={applications} onStatusChange={handleStatusChange} onDelete={handleDelete} />
      )}
    </div>
  );
}

// ---- Stat Card ----
function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: "1rem", background: "var(--color-surface)", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{label}</div>
    </div>
  );
}

// ---- Table View ----
function TableView({ apps, onStatusChange, onDelete }: {
  apps: ApplicationRecord[];
  onStatusChange: (id: string, s: ApplicationStatus) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>职位</th>
            <th style={{ padding: "0.5rem" }}>公司</th>
            <th style={{ padding: "0.5rem" }}>薪资</th>
            <th style={{ padding: "0.5rem" }}>状态</th>
            <th style={{ padding: "0.5rem" }}>投递日期</th>
            <th style={{ padding: "0.5rem" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id} style={{ borderBottom: "1px solid var(--color-border)", opacity: app.status === "archived" ? 0.5 : 1 }}>
              <td style={{ padding: "0.5rem", fontWeight: 500 }}>{app.title || "—"}</td>
              <td style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>{app.company_name || "—"}</td>
              <td style={{ padding: "0.5rem" }}>
                {app.salary_min ? `${app.salary_min / 1000}K${app.salary_max ? `-${app.salary_max / 1000}K` : "+"}` : "—"}
              </td>
              <td style={{ padding: "0.5rem" }}>
                <select
                  value={app.status}
                  onChange={(e) => onStatusChange(app.id, e.target.value as ApplicationStatus)}
                  style={{
                    padding: "0.2rem 0.4rem", borderRadius: "4px", border: `1px solid ${STATUS_COLORS[app.status]}44`,
                    background: `${STATUS_COLORS[app.status]}22`, color: STATUS_COLORS[app.status],
                    fontSize: "0.8rem", fontWeight: 600,
                  }}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                {app.applied_at ? new Date(app.applied_at).toLocaleDateString("zh-CN") : "—"}
              </td>
              <td style={{ padding: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {app.source_url && (
                    <button className="btn btn-outline btn-sm" style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                      onClick={() => window.open(app.source_url!, "_blank")}>🔗</button>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem", color: "var(--color-error)" }}
                    onClick={() => onDelete(app.id, app.title || "")}>🗑</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Kanban View ----
function KanbanView({ apps, onStatusChange, onDelete }: {
  apps: ApplicationRecord[];
  onStatusChange: (id: string, s: ApplicationStatus) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const columns = ["pending", "applied", "interviewing", "offered", "rejected"] as ApplicationStatus[];

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`, gap: "0.75rem", overflowX: "auto" }}>
      {columns.map((col) => {
        const items = apps.filter((a) => a.status === col);
        return (
          <div key={col} style={{ minWidth: 180 }}>
            <div style={{
              padding: "0.5rem", borderRadius: "6px 6px 0 0",
              background: `${STATUS_COLORS[col]}22`, borderBottom: `3px solid ${STATUS_COLORS[col]}`,
              fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem",
            }}>
              {STATUS_LABELS[col]} ({items.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {items.map((app) => (
                <div key={app.id} style={{
                  padding: "0.6rem", background: "var(--color-surface)",
                  borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "0.8rem",
                }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{app.title || app.company_name}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                    {app.company_name} {app.city ? `· ${app.city}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.4rem" }}>
                    <select
                      value={app.status}
                      onChange={(e) => onStatusChange(app.id, e.target.value as ApplicationStatus)}
                      style={{ flex: 1, padding: "0.15rem", borderRadius: "3px", fontSize: "0.7rem", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button className="btn btn-outline btn-sm"
                      style={{ padding: "0.15rem 0.3rem", fontSize: "0.65rem", color: "var(--color-error)" }}
                      onClick={() => onDelete(app.id, app.title || "")}>✕</button>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                  暂无
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Timeline View ----
function TimelineView({ apps }: { apps: ApplicationRecord[] }) {
  const sorted = [...apps]
    .filter((a) => a.applied_at)
    .sort((a, b) => new Date(b.applied_at!).getTime() - new Date(a.applied_at!).getTime());

  if (sorted.length === 0) {
    return <div className="empty-state"><p>暂无已投递记录</p></div>;
  }

  return (
    <div style={{ maxWidth: "700px" }}>
      {sorted.map((app, i) => (
        <div key={app.id} style={{
          display: "flex", gap: "1rem", paddingBottom: "1.5rem",
          position: "relative",
        }}>
          {/* Timeline line */}
          {i < sorted.length - 1 && (
            <div style={{
              position: "absolute", left: "0.45rem", top: "1.2rem",
              width: "2px", height: "calc(100% - 0.5rem)",
              background: "var(--color-border)",
            }} />
          )}

          {/* Dot */}
          <div style={{
            width: "12px", height: "12px", borderRadius: "50%",
            background: STATUS_COLORS[app.status],
            flexShrink: 0, marginTop: "0.3rem",
          }} />

          {/* Content */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {app.title || app.company_name}
              <span className="badge" style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}>
                {STATUS_LABELS[app.status]}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
              {app.company_name}
              {app.city && ` · ${app.city}`}
              {app.salary_min && ` · ${app.salary_min / 1000}K${app.salary_max ? `-${app.salary_max / 1000}K` : ""}`}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
              📅 投递于 {new Date(app.applied_at!).toLocaleDateString("zh-CN")}
              {app.notes && <span style={{ marginLeft: "0.75rem" }}>📝 {app.notes}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

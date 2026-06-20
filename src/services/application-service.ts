// ============================================
// 投递应用服务 (Phase 6)
// 7 状态状态机 + 防重复 + 智能提醒引擎 + 统计数据
// ============================================
import { supabase } from "@/lib/supabase";

// ---- 7 标准投递状态 ----
export const APPLICATION_STATUSES = [
  "pending",           // 待投递
  "applied",           // 已投递
  "resume_viewed",     // 简历被查看
  "interviewing",      // 面试中
  "offered",           // 已获Offer
  "rejected",          // 已拒绝
  "archived",          // 已归档
] as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

// ---- 状态转换规则（状态机） ----
export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ["applied", "archived"],
  applied: ["resume_viewed", "interviewing", "rejected", "archived"],
  resume_viewed: ["interviewing", "rejected", "archived"],
  interviewing: ["offered", "rejected", "archived"],
  offered: ["pending", "archived"],  // offer 拒绝后可重新投递
  rejected: ["pending", "archived"],
  archived: ["pending"],
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "待投递",
  applied: "已投递",
  resume_viewed: "简历已查看",
  interviewing: "面试中",
  offered: "已获Offer",
  rejected: "已拒绝",
  archived: "已归档",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  pending: "#94a3b8",
  applied: "#3b82f6",
  resume_viewed: "#8b5cf6",
  interviewing: "#f59e0b",
  offered: "#22c55e",
  rejected: "#ef4444",
  archived: "#6b7280",
};

// ---- 8 类智能提醒 ----
export const REMINDER_TYPES = [
  "no_response_3d",       // 投递3天未回复
  "no_response_7d",       // 投递7天未回复
  "interview_tomorrow",   // 明天有面试
  "follow_up",            // 建议跟进
  "jd_expiring",          // JD即将过期
  "offer_deadline",       // Offer回复截止
  "resume_outdated",      // 简历需更新
  "weekly_summary",       // 每周总结
] as const;

export interface ReminderRule {
  type: typeof REMINDER_TYPES[number];
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  condition: (app: ApplicationRecord) => boolean;
}

export const REMINDER_RULES: ReminderRule[] = [
  {
    type: "no_response_3d",
    title: "投递 3 天未回复",
    description: "可以准备发送跟进消息",
    priority: "medium",
    condition: (a) => a.status === "applied" && daysSince(a.applied_at) >= 3,
  },
  {
    type: "no_response_7d",
    title: "投递 7 天未回复",
    description: "建议发跟进消息或继续投递其他职位",
    priority: "high",
    condition: (a) => a.status === "applied" && daysSince(a.applied_at) >= 7,
  },
  {
    type: "follow_up",
    title: "建议跟进",
    description: "简历已被查看但暂无后续，可发消息跟进",
    priority: "medium",
    condition: (a) => a.status === "resume_viewed" && daysSince(a.updated_at) >= 5,
  },
  {
    type: "weekly_summary",
    title: "本周投递总结",
    description: "查看本周投递统计与建议",
    priority: "low",
    condition: (_a) => new Date().getDay() === 1, // Monday
  },
];

// ---- 类型 ----
export interface ApplicationRecord {
  id: string;
  user_id: string;
  job_position_id: string;
  resume_snapshot_id: string | null;
  status: ApplicationStatus;
  applied_at: string | null;
  reminder_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  company_name?: string;
  title?: string;
  city?: string;
  salary_min?: number;
  salary_max?: number;
  source_platform?: string;
  source_url?: string;
}

// ---- CRUD ----

export async function createApplication(positionId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  // 检查是否已存在
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("job_position_id", positionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) throw new Error("该职位已有投递记录");

  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      job_position_id: positionId,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;

  // 记录状态变更
  await logStatusChange(data.id, null, "pending");

  return data.id;
}

export async function getApplications(): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from("applications")
    .select(`
      *,
      job_positions!inner(
        company_name, title, city, salary_min, salary_max,
        source_platform, source_url
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    ...row,
    company_name: row.job_positions?.company_name,
    title: row.job_positions?.title,
    city: row.job_positions?.city,
    salary_min: row.job_positions?.salary_min,
    salary_max: row.job_positions?.salary_max,
    source_platform: row.job_positions?.source_platform,
    source_url: row.job_positions?.source_url,
  }));
}

export async function updateStatus(
  applicationId: string,
  newStatus: ApplicationStatus,
  notes?: string
): Promise<void> {
  // 获取当前状态
  const { data: app } = await supabase
    .from("applications")
    .select("status")
    .eq("id", applicationId)
    .single();

  if (!app) throw new Error("投递记录不存在");

  const currentStatus = app.status as ApplicationStatus;
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`不允许从「${STATUS_LABELS[currentStatus]}」变更到「${STATUS_LABELS[newStatus]}」`);
  }

  const updates: any = { status: newStatus };
  if (newStatus === "applied" && !app.applied_at) {
    updates.applied_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("applications")
    .update(updates)
    .eq("id", applicationId);

  if (error) throw error;

  await logStatusChange(applicationId, currentStatus, newStatus, notes);

  // 记录 duplicate_key 防止重复投递
  if (newStatus === "applied") {
    await recordDuplicateKey(applicationId);
  }
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---- 提醒引擎 ----

export function getReminders(applications: ApplicationRecord[]): {
  application: ApplicationRecord;
  reminder: ReminderRule;
}[] {
  return applications.flatMap((app) =>
    REMINDER_RULES
      .filter((rule) => {
        try { return rule.condition(app); } catch { return false; }
      })
      .map((reminder) => ({ application: app, reminder }))
  );
}

// ---- 统计 ----

export interface ApplicationStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  appliedThisWeek: number;
  interviewRate: number;
  offerRate: number;
  avgResponseDays: number;
  platformBreakdown: Record<string, number>;
}

export function computeStats(applications: ApplicationRecord[]): ApplicationStats {
  const byStatus: Record<string, number> = {};
  for (const s of APPLICATION_STATUSES) byStatus[s] = 0;
  for (const a of applications) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const appliedThisWeek = applications.filter(
    (a) => a.applied_at && new Date(a.applied_at) > weekAgo
  ).length;

  const applied = byStatus.applied + byStatus.resume_viewed + byStatus.interviewing + byStatus.offered + byStatus.rejected;
  const interviewed = byStatus.interviewing + byStatus.offered;
  const offered = byStatus.offered;

  const interviewRate = applied > 0 ? Math.round((interviewed / applied) * 100) : 0;
  const offerRate = interviewed > 0 ? Math.round((offered / interviewed) * 100) : 0;

  // Avg response days
  const responded = applications.filter(
    (a) => a.applied_at && a.status !== "pending" && a.status !== "applied"
  );
  let avgResponseDays = 0;
  if (responded.length > 0) {
    avgResponseDays = Math.round(
      responded.reduce((sum, a) => sum + daysBetween(a.applied_at!, a.updated_at), 0) / responded.length
    );
  }

  // Platform breakdown
  const platformBreakdown: Record<string, number> = {};
  for (const a of applications) {
    const p = a.source_platform || "其他";
    platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
  }

  return {
    total: applications.length,
    byStatus: byStatus as Record<ApplicationStatus, number>,
    appliedThisWeek,
    interviewRate,
    offerRate,
    avgResponseDays,
    platformBreakdown,
  };
}

// ---- Helpers ----

async function logStatusChange(
  applicationId: string,
  fromStatus: string | null,
  toStatus: string,
  notes?: string
) {
  await supabase.from("application_status_history").insert({
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    notes: notes || null,
  }).catch(() => {}); // Non-critical
}

async function recordDuplicateKey(applicationId: string) {
  try {
    const { data: app } = await supabase
      .from("applications")
      .select("user_id, job_positions(duplicate_key)")
      .eq("id", applicationId)
      .single();

    if (app?.job_positions?.duplicate_key) {
      await supabase.from("duplicate_keys").insert({
        user_id: app.user_id,
        duplicate_key: app.job_positions.duplicate_key,
      }).select("*").maybeSingle(); // Ignore if exists
    }
  } catch { /* Non-critical */ }
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (86400000));
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}

// ============================================
// JD 服务 — CRUD + 生命周期 + 反馈 (Phase 2.9 + 2.10)
// ============================================
import { supabase } from "@/lib/supabase";
import type {
  JDParsePackage,
  JDImportRequest,
  JDFeedback,
  LifecycleStatus,
} from "./jd-parser-types";
import { JD_ACTIVE_DAYS, JD_EXPIRING_DAYS, LIFECYCLE_LABELS } from "./jd-parser-types";

// ---- 职位 CRUD ----

export interface JobPosition {
  id: string;
  company_name: string;
  title: string;
  standardized_title: string | null;
  jd_raw_text: string | null;
  source_url: string | null;
  source_platform: string | null;
  salary_min: number | null;
  salary_max: number | null;
  city: string | null;
  duplicate_key: string | null;
  import_source: string;
  import_status: string;
  quality_score: number | null;
  lifecycle_status: LifecycleStatus;
  expires_at: string | null;
  last_fetched_at: string | null;
  fetch_count: number;
  created_at: string;
  updated_at: string;
}

export interface JDParseRecord {
  id: string;
  job_position_id: string;
  education: string | null;
  experience_years: string | null;
  salary_range: number[] | null;
  location: string | null;
  language: string | null;
  direct_skills: string[];
  general_skills: string[];
  responsibility_summary: string | null;
  keywords: string[];
  team_size_guess: string | null;
  tech_trend: string | null;
  urgency: string | null;
  confidence: number;
  parse_method: string;
  parse_version: number;
  created_at: string;
}

/**
 * 导入 JD 并执行解析
 */
export async function importJD(req: JDImportRequest): Promise<{
  position: JobPosition;
  parseRecord: JDParseRecord | null;
  warnings: string[];
}> {
  // 生成去重 key
  const duplicateKey = generateDuplicateKey(
    req.companyName || "",
    req.title || "",
    req.sourceUrl || ""
  );

  // 1. 插入 job_position
  const { data: position, error: posError } = await supabase
    .from("job_positions")
    .insert({
      company_name: req.companyName || "未知公司",
      title: req.title || "未知职位",
      jd_raw_text: req.jdRawText,
      raw_html: req.jdRawHtml || null,
      source_url: req.sourceUrl || null,
      source_platform: req.sourcePlatform,
      duplicate_key: duplicateKey,
      import_source: req.sourcePlatform === "manual" ? "manual" : "plugin",
      import_status: "parsing",
      lifecycle_status: "active",
      expires_at: new Date(
        Date.now() + JD_ACTIVE_DAYS * 24 * 60 * 60 * 1000
      ).toISOString(),
      last_fetched_at: new Date().toISOString(),
      fetch_count: 1,
    })
    .select("*")
    .single();

  if (posError) throw new Error(`创建职位失败: ${posError.message}`);

  // 2. 调用编排器解析
  const { parseJD } = await import("./jd-parser-orchestrator");
  const parseResult: JDParsePackage = await parseJD(
    req.jdRawText,
    req.jdRawHtml,
    req.sourcePlatform
  );

  // 3. 存储解析结果
  const { data: parseRecord, error: parseError } = await supabase
    .from("jd_parse_results")
    .insert({
      job_position_id: position.id,
      education: parseResult.result.hardRequirements.education,
      experience_years: parseResult.result.hardRequirements.experienceYears,
      salary_range: [
        parseResult.result.hardRequirements.salaryMin,
        parseResult.result.hardRequirements.salaryMax,
      ].filter((v) => v !== null),
      location: parseResult.result.hardRequirements.location,
      language: parseResult.result.hardRequirements.language,
      direct_skills: parseResult.result.skills.directSkills,
      general_skills: parseResult.result.skills.generalSkills,
      responsibility_summary: parseResult.result.responsibilities.summary,
      keywords: parseResult.result.responsibilities.keywords,
      team_size_guess: parseResult.result.inferred.teamSizeGuess,
      tech_trend: parseResult.result.inferred.techTrend,
      urgency: parseResult.result.inferred.urgency,
      confidence: parseResult.metadata.confidence,
      parse_method: parseResult.metadata.parseMethod,
      parse_version: 1,
    })
    .select("*")
    .single();

  if (parseError) {
    console.warn("存储解析结果失败:", parseError.message);
  }

  // 4. 更新职位状态 + 质量分
  const qualityScore = computeQualityScore(parseResult);
  await supabase
    .from("job_positions")
    .update({
      import_status: "parsed",
      quality_score: qualityScore,
      salary_min: parseResult.result.hardRequirements.salaryMin,
      salary_max: parseResult.result.hardRequirements.salaryMax,
      city: parseResult.result.hardRequirements.location,
    })
    .eq("id", position.id);

  return {
    position: position as JobPosition,
    parseRecord: parseRecord as JDParseRecord | null,
    warnings: parseResult.warnings,
  };
}

/**
 * 获取用户的职位列表
 */
export async function getUserPositions(filters?: {
  status?: string;
  lifecycle?: LifecycleStatus;
  platform?: string;
  limit?: number;
}): Promise<JobPosition[]> {
  let query = supabase
    .from("job_positions")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("import_status", filters.status);
  }
  if (filters?.lifecycle) {
    query = query.eq("lifecycle_status", filters.lifecycle);
  }
  if (filters?.platform) {
    query = query.eq("source_platform", filters.platform);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as JobPosition[];
}

/**
 * 获取职位的解析结果
 */
export async function getParseResult(jobPositionId: string): Promise<JDParseRecord | null> {
  const { data, error } = await supabase
    .from("jd_parse_results")
    .select("*")
    .eq("job_position_id", jobPositionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return data as JDParseRecord;
}

/**
 * 删除职位
 */
export async function deletePosition(positionId: string): Promise<void> {
  const { error } = await supabase
    .from("job_positions")
    .delete()
    .eq("id", positionId);

  if (error) throw error;
}

/**
 * 重新解析职位（强制 LLM）
 */
export async function reParsePosition(
  positionId: string
): Promise<JDParsePackage> {
  // 获取原始 JD 文本
  const { data: position, error } = await supabase
    .from("job_positions")
    .select("*")
    .eq("id", positionId)
    .single();

  if (error || !position) throw new Error("职位不存在");

  const { parseJDWithLLM } = await import("./jd-parser-llm");
  const result = await parseJDWithLLM(
    position.jd_raw_text || "",
    position.source_platform || "generic"
  );

  // 存储新快照
  await supabase.from("jd_parse_snapshots").insert({
    job_position_id: positionId,
    parse_result_json: result,
    snapshot_reason: "reparse",
  });

  // 更新解析结果
  await supabase
    .from("jd_parse_results")
    .update({
      education: result.result.hardRequirements.education,
      experience_years: result.result.hardRequirements.experienceYears,
      salary_range: [
        result.result.hardRequirements.salaryMin,
        result.result.hardRequirements.salaryMax,
      ].filter((v) => v !== null),
      location: result.result.hardRequirements.location,
      language: result.result.hardRequirements.language,
      direct_skills: result.result.skills.directSkills,
      general_skills: result.result.skills.generalSkills,
      responsibility_summary: result.result.responsibilities.summary,
      keywords: result.result.responsibilities.keywords,
      team_size_guess: result.result.inferred.teamSizeGuess,
      tech_trend: result.result.inferred.techTrend,
      urgency: result.result.inferred.urgency,
      confidence: result.metadata.confidence,
      parse_method: "llm",
      parse_version: supabase.sql`parse_version + 1`,
    })
    .eq("job_position_id", positionId);

  return result;
}

// ---- 用户反馈 (Phase 2.10) ----

export interface JDFeedbackRecord {
  id: string;
  user_id: string;
  job_position_id: string;
  field_name: string;
  original_value: string | null;
  corrected_value: string;
  parse_method: string;
  created_at: string;
}

/**
 * 提交解析修正反馈
 */
export async function submitFeedback(feedback: JDFeedback): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase.from("jd_feedback").insert({
    user_id: user.id,
    job_position_id: "", // will be set by caller context
    field_name: feedback.fieldName,
    original_value: feedback.originalValue,
    corrected_value: feedback.correctedValue,
    parse_method: "rule",
  });

  if (error) throw error;
}

/**
 * 获取反馈统计（用于优化解析器）
 */
export async function getFeedbackStats(): Promise<{
  total: number;
  byField: Record<string, number>;
}> {
  const { data, error } = await supabase
    .from("jd_feedback")
    .select("field_name");

  if (error) return { total: 0, byField: {} };

  const byField: Record<string, number> = {};
  for (const row of data || []) {
    byField[row.field_name] = (byField[row.field_name] || 0) + 1;
  }

  return { total: (data || []).length, byField };
}

// ---- 生命周期管理 (Phase 2.9) ----

/**
 * 更新 JD 生命周期状态
 */
export async function updateLifecycleStatus(
  positionId: string,
  status: LifecycleStatus
): Promise<void> {
  const { error } = await supabase
    .from("job_positions")
    .update({
      lifecycle_status: status,
      ...(status === "active"
        ? { expires_at: new Date(Date.now() + JD_ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString() }
        : {}),
    })
    .eq("id", positionId);

  if (error) throw error;
}

/**
 * 批量更新过期 JD 的状态（定时任务）
 */
export async function refreshLifecycleStatuses(): Promise<{
  expiringCount: number;
  expiredCount: number;
}> {
  const now = new Date().toISOString();
  const expiringThreshold = new Date(
    Date.now() + (JD_ACTIVE_DAYS - JD_EXPIRING_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();

  // 标记即将过期
  const { count: expiringCount } = await supabase
    .from("job_positions")
    .update({ lifecycle_status: "expiring_soon" })
    .eq("lifecycle_status", "active")
    .lte("expires_at", expiringThreshold)
    .gt("expires_at", now)
    .select("*", { count: "exact", head: true });

  // 标记已过期
  const { count: expiredCount } = await supabase
    .from("job_positions")
    .update({ lifecycle_status: "expired" })
    .eq("lifecycle_status", "active")
    .lte("expires_at", now)
    .select("*", { count: "exact", head: true });

  return {
    expiringCount: expiringCount || 0,
    expiredCount: expiredCount || 0,
  };
}

// ---- Helpers ----

/**
 * 生成去重 key: company_name + standardized_title + source_url hash
 */
function generateDuplicateKey(
  companyName: string,
  title: string,
  sourceUrl: string
): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[（(].*?[)）]/g, "")
      .replace(/[【\[]/g, "[")
      .replace(/[】\]]/g, "]");

  const urlHash = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 50)
    : "";

  return `${norm(companyName)}|${norm(title)}|${urlHash}`;
}

/**
 * 计算质量分
 */
function computeQualityScore(parseResult: JDParsePackage): number {
  const scores: number[] = [];
  const r = parseResult.result;

  // 硬性要求完整性
  const hard = r.hardRequirements;
  const hardFields = [
    hard.education,
    hard.experienceYears,
    hard.location,
  ];
  const hardComplete = hardFields.filter(Boolean).length / hardFields.length;
  scores.push(hardComplete);

  // 薪资可直接验证
  if (hard.salaryMin && hard.salaryMax && hard.salaryMin <= hard.salaryMax) {
    scores.push(1.0);
  } else if (hard.salaryMin || hard.salaryMax) {
    scores.push(0.5);
  } else {
    scores.push(0);
  }

  // 技能数量
  const skillCount = r.skills.directSkills.length + r.skills.generalSkills.length;
  scores.push(Math.min(1, skillCount / 5));

  // 置信度
  scores.push(parseResult.metadata.confidence);

  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

// ============================================
// 三层过滤引擎 (Phase 3.8)
// Layer 1: 黑名单命中 → 丢弃
// Layer 2: 历史重复 → 移入重复列表
// Layer 3: 薪资/城市不匹配 → 标记警告
// ============================================
import type { JDParseRecord, JobPosition } from "./jd-service";
import type { Preferences } from "./preferences-service";
import type { BlacklistReport } from "./blacklist-detector";
import { detectBlacklist } from "./blacklist-detector";
import { supabase } from "@/lib/supabase";

export type FilterAction = "block" | "duplicate" | "warn" | "pass";

export interface FilterResult {
  action: FilterAction;
  reason: string | null;
  blacklistReport?: BlacklistReport;
  duplicateOf?: string; // job_position_id of the duplicate
  warnings: FilterWarning[];
}

export interface FilterWarning {
  type: "salary_mismatch" | "city_mismatch" | "industry_warning" | "quality_low";
  message: string;
  severity: "high" | "medium" | "low";
}

/**
 * 主过滤函数
 */
export async function filterJobPosition(
  position: JobPosition,
  parseResult: JDParseRecord | null,
  preferences: Preferences,
  userId: string
): Promise<FilterResult> {
  const warnings: FilterWarning[] = [];
  const jdText = position.jd_raw_text || "";
  const companyName = position.company_name || "";

  // ---- Layer 1: 黑名单检测 ----
  const blacklistReport = await detectBlacklist(
    jdText,
    companyName,
    null, // industry 从 JD 解析中获取
    preferences,
    userId
  );

  if (blacklistReport.recommendBlock) {
    return {
      action: "block",
      reason: blacklistReport.blockReason,
      blacklistReport,
      warnings,
    };
  }

  // ---- Layer 2: 历史重复检查 ----
  const duplicateKey = position.duplicate_key;
  if (duplicateKey) {
    const { data: duplicate } = await supabase
      .from("duplicate_keys")
      .select("*")
      .eq("user_id", userId)
      .eq("duplicate_key", duplicateKey)
      .maybeSingle();

    if (duplicate) {
      return {
        action: "duplicate",
        reason: "你之前已经投递过该职位",
        duplicateOf: duplicate.job_position_id,
        blacklistReport,
        warnings,
      };
    }
  }

  // ---- Layer 3: 薪资/城市不匹配 ----
  if (preferences.min_monthly_salary && position.salary_max) {
    const minPref = preferences.min_monthly_salary * 1000; // 转换为元
    if (position.salary_max < minPref) {
      warnings.push({
        type: "salary_mismatch",
        message: `最高薪资 ${position.salary_max / 1000}K 低于你的期望 ${preferences.min_monthly_salary}K`,
        severity: "medium",
      });
    }
  }

  if (preferences.target_cities && preferences.target_cities.length > 0 && position.city) {
    const cityMatch = preferences.target_cities.some(
      (c) => position.city!.includes(c) || c.includes(position.city!)
    );
    if (!cityMatch) {
      warnings.push({
        type: "city_mismatch",
        message: `工作地点 "${position.city}" 不在你的意向城市列表中`,
        severity: "low",
      });
    }
  }

  // 低质量
  if (position.quality_score !== null && position.quality_score < 50) {
    warnings.push({
      type: "quality_low",
      message: `JD 质量分仅 ${position.quality_score}，关键信息可能缺失`,
      severity: "medium",
    });
  }

  return {
    action: warnings.length > 0 ? "warn" : "pass",
    reason: warnings.length > 0 ? `${warnings.length} 个警告需要确认` : null,
    blacklistReport,
    warnings,
  };
}

/**
 * 批量过滤职位列表
 */
export async function batchFilterPositions(
  positions: JobPosition[],
  preferences: Preferences,
  userId: string
): Promise<Map<string, FilterResult>> {
  const results = new Map<string, FilterResult>();

  for (const pos of positions) {
    // 获取解析结果
    let parseResult: JDParseRecord | null = null;
    try {
      const { data } = await supabase
        .from("jd_parse_results")
        .select("*")
        .eq("job_position_id", pos.id)
        .single();
      parseResult = data as JDParseRecord | null;
    } catch {
      // Not critical
    }

    const result = await filterJobPosition(pos, parseResult, preferences, userId);
    results.set(pos.id, result);
  }

  return results;
}

/**
 * 黑名单过滤后的可操作摘要
 */
export function summarizeFilterResults(
  results: Map<string, FilterResult>
): {
  blocked: number;
  duplicates: number;
  warnings: number;
  passed: number;
  total: number;
} {
  let blocked = 0, duplicates = 0, warnings = 0, passed = 0;

  for (const result of results.values()) {
    switch (result.action) {
      case "block": blocked++; break;
      case "duplicate": duplicates++; break;
      case "warn": warnings++; break;
      case "pass": passed++; break;
    }
  }

  return { blocked, duplicates, warnings, passed, total: results.size };
}

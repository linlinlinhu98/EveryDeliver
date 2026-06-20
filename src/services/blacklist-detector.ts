// ============================================
// 黑名单自动检测器 (Phase 3.10-3.12)
// 4 种检测机制：关键词匹配 / 行业警告 / 历史行为 / 工商信息
// ============================================
import { supabase } from "@/lib/supabase";
import type { Preferences } from "@/services/preferences-service";

// ---- 黑名单关键词库 ----
export interface BlacklistKeyword {
  keyword: string;
  category: "work_hours" | "job_nature" | "risk_signal" | "vague_promise";
  severity: "high" | "medium" | "low";
  regex: RegExp;
}

export const BLACKLIST_KEYWORDS: BlacklistKeyword[] = [
  // 工作时间类
  { keyword: "大小周", category: "work_hours", severity: "high", regex: /大小周/i },
  { keyword: "单休", category: "work_hours", severity: "high", regex: /单休|做六休一|6天[工作制]/i },
  { keyword: "996", category: "work_hours", severity: "high", regex: /996|007|9\s*9\s*6/i },
  { keyword: "加班严重", category: "work_hours", severity: "medium", regex: /加班[严重多常频大]|大小周|弹性工作[制]?[（(]含加班[)）]/i },
  { keyword: "ICU", category: "work_hours", severity: "high", regex: /\bICU\b|加班至|通宵/i },
  // 工作性质类
  { keyword: "外包", category: "job_nature", severity: "high", regex: /外包|外派|人力外[包派]|驻场开发/i },
  { keyword: "派遣", category: "job_nature", severity: "high", regex: /派遣|劳务派遣|第三方[用工雇佣]/i },
  { keyword: "驻场", category: "job_nature", severity: "high", regex: /驻场|[长期驻]客户现场|onsite/i },
  // 风险信号类
  { keyword: "试用期长", category: "risk_signal", severity: "medium", regex: /试用期[3-9]个[月年]|试用期6|试用期1年/i },
  { keyword: "考核淘汰", category: "risk_signal", severity: "medium", regex: /末位淘汰|考核淘汰|强制分布|361|271/i },
  { keyword: "付费培训", category: "risk_signal", severity: "high", regex: /付费培训|培训费|入职[缴交]费|押金|保证金/i },
  { keyword: "股权激励", category: "risk_signal", severity: "low", regex: /股权[过度]承诺|期权[过度]承诺|全员持股[（(]空[）)]/i },
  // 模糊承诺类
  { keyword: "薪资面议", category: "vague_promise", severity: "low", regex: /薪资面议|工资面议|待遇面议/i },
  { keyword: "不加班（反讽）", category: "vague_promise", severity: "medium", regex: /不加班[（(]有加班费[)）]|不强制加班[（(]需完成任务[)）]/i },
];

// ---- 高风险行业清单 ----
export const HIGH_RISK_INDUSTRIES: { keyword: string; reason: string }[] = [
  { keyword: "教培|教育培训", reason: "教培行业政策风险高（P2P/学科类限制）" },
  { keyword: "房地产|房产中介", reason: "房地产行业下行周期" },
  { keyword: "区块链|加密货币|数字货币", reason: "区块链行业监管不确定" },
  { keyword: "外包|人力外包|软件外包", reason: "外包行业成长空间有限" },
  { keyword: "直播带货|直播电商|MCN", reason: "直播行业波动大、生命周期短" },
  { keyword: "跨境电商|跨境贸易", reason: "跨境政策风险、汇率波动" },
  { keyword: "P2P|网贷|小额贷款", reason: "金融灰色地带、违法风险高" },
];

// ---- 关键词公司黑名单 ----
export const KNOWN_BLACKLIST_COMPANIES = [
  "华为", "华为技术", "Huawei", // 用户明确禁止
];

// ---- 检测结果 ----
export interface BlacklistDetection {
  source: "keyword" | "industry" | "history" | "company";
  keyword?: string;
  category?: string;
  severity: "high" | "medium" | "low";
  reason: string;
  autoAction: "block" | "warn" | "mark";
}

export interface BlacklistReport {
  detections: BlacklistDetection[];
  recommendBlock: boolean;
  blockReason: string | null;
  signalCount: number;
}

/**
 * 主检测函数：对 JD 执行所有 4 种检测
 */
export async function detectBlacklist(
  jdText: string,
  companyName: string,
  industry: string | null,
  preferences: Preferences,
  userId?: string
): Promise<BlacklistReport> {
  const detections: BlacklistDetection[] = [];

  // ---- 1. JD 文本关键词匹配 ----
  for (const kw of BLACKLIST_KEYWORDS) {
    if (kw.regex.test(jdText)) {
      detections.push({
        source: "keyword",
        keyword: kw.keyword,
        category: kw.category,
        severity: kw.severity,
        reason: `JD 文本检测到关键词: "${kw.keyword}"`,
        autoAction: kw.severity === "high" ? "block" : "warn",
      });
    }
  }

  // ---- 2. 用户黑名单标签匹配 ----
  if (preferences.blacklist_tags && preferences.blacklist_tags.length > 0) {
    for (const tag of preferences.blacklist_tags) {
      const tagRegex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (tagRegex.test(jdText)) {
        detections.push({
          source: "keyword",
          keyword: tag,
          severity: "high",
          reason: `匹配用户黑名单标签: "${tag}"`,
          autoAction: "block",
        });
      }
    }
  }

  // ---- 3. 行业分类警告 ----
  if (industry && preferences.industry_warnings !== false) {
    for (const risk of HIGH_RISK_INDUSTRIES) {
      const riskRegex = new RegExp(risk.keyword, "i");
      if (riskRegex.test(industry)) {
        detections.push({
          source: "industry",
          keyword: risk.keyword,
          severity: "medium",
          reason: risk.reason,
          autoAction: "warn",
        });
      }
    }
  }

  // ---- 4. 公司名硬黑名单 ----
  for (const banned of KNOWN_BLACKLIST_COMPANIES) {
    if (companyName.toLowerCase().includes(banned.toLowerCase())) {
      detections.push({
        source: "company",
        keyword: banned,
        severity: "high",
        reason: `公司 "${companyName}" 在硬黑名单中`,
        autoAction: "block",
      });
      break;
    }
  }

  // ---- 5. 用户历史行为推断（如果提供 userId） ----
  if (userId) {
    try {
      const { data: rejected } = await supabase
        .from("applications")
        .select("job_position_id, job_positions!inner(company_name, title)")
        .eq("user_id", userId)
        .eq("status", "rejected")
        .limit(10);

      if (rejected && rejected.length > 0) {
        const rejectedCompanies = new Set(
          rejected.map((r: any) =>
            r.job_positions?.company_name?.toLowerCase()
          ).filter(Boolean)
        );

        // 检查当前公司是否之前被拒绝过
        if (rejectedCompanies.has(companyName.toLowerCase())) {
          detections.push({
            source: "history",
            keyword: companyName,
            severity: "high",
            reason: `你之前拒绝过 "${companyName}" 的职位`,
            autoAction: "block",
          });
        }

        // 检查是否存在模式：多次拒绝有相同黑名单标签的 JD
        const rejectedTags = new Set(
          rejected
            .filter((r: any) => r.job_positions?.title)
            .map((r: any) => extractTagsFromTitle(r.job_positions.title))
            .flat()
        );

        const currentTags = extractTagsFromTitle(jdText);
        const commonTags = currentTags.filter((t) => rejectedTags.has(t));
        if (commonTags.length >= 2) {
          detections.push({
            source: "history",
            keyword: commonTags.join(", "),
            severity: "medium",
            reason: `该 JD 包含你多次拒绝的标签: ${commonTags.join("、")}`,
            autoAction: "warn",
          });
        }
      }
    } catch {
      // History check is non-critical
    }
  }

  // 汇总决策
  const highSeverity = detections.filter((d) => d.severity === "high").length;
  const totalSignals = detections.length;

  // 自动阻断条件：高严重度 ≥ 1 或信号总数 ≥ 阈值
  const threshold = preferences.auto_join_threshold || 3;
  const recommendBlock = highSeverity >= 1 || totalSignals >= threshold;

  let blockReason: string | null = null;
  if (recommendBlock) {
    const reasons = detections
      .filter((d) => d.autoAction === "block")
      .map((d) => d.reason);
    blockReason = reasons.length > 0
      ? reasons.join("；")
      : `累计 ${totalSignals} 个风险信号超过阈值 ${threshold}`;
  }

  return {
    detections,
    recommendBlock,
    blockReason,
    signalCount: totalSignals,
  };
}

/**
 * 从 JD 标题提取标签
 */
function extractTagsFromTitle(title: string): string[] {
  const tags: string[] = [];
  for (const kw of BLACKLIST_KEYWORDS) {
    if (kw.regex.test(title)) tags.push(kw.keyword);
  }
  return tags;
}

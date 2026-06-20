// ============================================
// JD Parser — Type Definitions (Phase 2)
// ============================================

// ---- Layer 1: 硬性要求 ----
export interface HardRequirements {
  education: string | null;        // 本科 | 硕士 | 博士 | 不限
  experienceYears: string | null;  // 0-1 | 1-3 | 3-5 | 5-10 | 10+
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;         // 城市名 | 远程 | 混合
  language: string | null;         // 中文 | 英文 | 不限
}

// ---- Layer 2: 技能要求 ----
export interface SkillRequirements {
  directSkills: string[];   // 明确要求的技术栈 (权重 ×2.0)
  generalSkills: string[];  // 基础工具/软技能 (权重 ×0.5)
}

// ---- Layer 3: 职责描述 ----
export interface ResponsibilitySummary {
  summary: string | null;   // 核心职责摘要（1-2 句）
  keywords: string[];       // 关键词
}

// ---- Layer 4: 隐性要求 ----
export interface InferredInfo {
  teamSizeGuess: string | null;    // 小团队 | 中等 | 大型
  techTrend: string | null;       // 技术栈趋势描述
  urgency: string | null;         // 急聘 | 正常 | 储备
}

// ---- 完整解析结果 ----
export interface JDParseResult {
  hardRequirements: HardRequirements;
  skills: SkillRequirements;
  responsibilities: ResponsibilitySummary;
  inferred: InferredInfo;
}

// ---- 解析元数据 ----
export interface JDParseMetadata {
  confidence: number;           // 0.0 - 1.0
  parseMethod: "rule" | "llm" | "manual";
  parseVersion: number;
  coveredFields: string[];      // 规则成功解析的字段
  missingFields: string[];      // 规则未能解析的字段
  parseDurationMs: number;
}

// ---- 完整解析包 ----
export interface JDParsePackage {
  result: JDParseResult;
  metadata: JDParseMetadata;
  warnings: string[];
}

// ---- JD 生命周期状态 ----
export type LifecycleStatus = "active" | "expiring_soon" | "expired";

// ---- 职位导入请求 ----
export interface JDImportRequest {
  jdRawText: string;
  jdRawHtml?: string;
  sourceUrl?: string;
  sourcePlatform: "boss" | "liepin" | "generic" | "manual";
  companyName?: string;
  title?: string;
  forceReParse?: boolean;
}

// ---- 规则解析器接口 ----
export interface RuleParser {
  name: string;
  platform: string;
  parse(rawText: string, rawHtml?: string): Partial<JDParseResult>;
  canHandle(rawText: string, rawHtml?: string): boolean;
  fieldCoverage: string[];
}

// ---- 置信度评分 ----
export interface ConfidenceScores {
  education: number;
  experienceYears: number;
  salary: number;
  location: number;
  language: number;
  skills: number;
  responsibilities: number;
  overall: number;
}

// ---- 用户反馈 ----
export interface JDFeedback {
  fieldName: string;
  originalValue: string | null;
  correctedValue: string;
}

// ---- 技能词表条目 ----
export interface SkillEntry {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  weight: number;
  isDirect: boolean;
}

// ---- 技能匹配结果 ----
export interface SkillMatch {
  skill: SkillEntry;
  sourceText: string;
  confidence: number;
}

// ---- 常量 ----
export const CONFIDENCE_THRESHOLD = 0.7; // 低于此值触发 LLM 兜底
export const JD_ACTIVE_DAYS = 30;         // JD active 状态有效期
export const JD_EXPIRING_DAYS = 21;       // 21 天后进入 expiring_soon

export const PARSE_METHOD_LABELS: Record<string, string> = {
  rule: "规则解析",
  llm: "AI 解析",
  manual: "手动录入",
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  active: "活跃",
  expiring_soon: "即将过期",
  expired: "已过期",
};

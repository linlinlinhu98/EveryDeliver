// ============================================
// JD 三层解析编排器 (Phase 2.6 + 2.8)
// 规则解析（主力）→ LLM 解析（兜底）→ 用户反馈（持续优化）
// ============================================
import type {
  JDParseResult,
  JDParsePackage,
  JDParseMetadata,
  ConfidenceScores,
  RuleParser,
} from "./jd-parser-types";
import { CONFIDENCE_THRESHOLD } from "./jd-parser-types";
import { bossZhipinParser } from "./jd-parser-boss";
import { liepinParser } from "./jd-parser-liepin";
import { genericParser } from "./jd-parser-generic";
import { parseJDWithLLM } from "./jd-parser-llm";
import { matchSkills, classifySkills } from "./skill-vocabulary";

/**
 * 根据平台选择规则解析器
 */
function selectRuleParser(platform: string): RuleParser {
  switch (platform) {
    case "boss": return bossZhipinParser;
    case "liepin": return liepinParser;
    default: return genericParser;
  }
}

/**
 * 计算置信度分数 (Phase 2.8)
 */
function calculateConfidence(
  result: JDParseResult,
  parser: RuleParser,
  missingFields: string[]
): ConfidenceScores {
  const hard = result.hardRequirements;

  // 每个字段的置信度：有值 = 0.8，有值且值合理 = 0.9
  const scoreField = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (Array.isArray(value) && value.length === 0) return 0;
    if (typeof value === "string" && value.length === 0) return 0;
    return 0.85;
  };

  const scores: ConfidenceScores = {
    education: scoreField(hard.education),
    experienceYears: scoreField(hard.experienceYears),
    salary: hard.salaryMin && hard.salaryMax ? 0.9 : hard.salaryMin ? 0.5 : 0,
    location: scoreField(hard.location),
    language: scoreField(hard.language),
    skills: result.skills.directSkills.length > 0
      ? Math.min(1.0, result.skills.directSkills.length / 5)
      : 0,
    responsibilities: result.responsibilities.summary ? 0.8 : 0,
    overall: 0,
  };

  // 总体置信度：强制字段加权平均
  const weights: Record<keyof ConfidenceScores, number> = {
    education: 0.15,
    experienceYears: 0.15,
    salary: 0.2,
    location: 0.15,
    language: 0.05,
    skills: 0.15,
    responsibilities: 0.1,
    overall: 0, // 不算入
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (key === "overall") continue;
    weightedSum += scores[key as keyof ConfidenceScores] * weight;
    totalWeight += weight;
  }

  scores.overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

  // 如果解析器覆盖不到的字段多，惩罚
  if (missingFields.length > 0 && parser.fieldCoverage.length > 0) {
    const uncoveredRatio = missingFields.length / parser.fieldCoverage.length;
    scores.overall = Math.max(0.1, scores.overall - uncoveredRatio * 0.2);
  }

  return scores;
}

/**
 * 合并两个解析结果（规则为主，LLM 补充）
 */
function mergeResults(
  ruleResult: Partial<JDParseResult>,
  llmPackage: JDParsePackage | null
): JDParseResult {
  if (!llmPackage) {
    // LLM 不可用，使用规则结果 + 空默认值
    return {
      hardRequirements: {
        education: ruleResult.hardRequirements?.education || null,
        experienceYears: ruleResult.hardRequirements?.experienceYears || null,
        salaryMin: ruleResult.hardRequirements?.salaryMin || null,
        salaryMax: ruleResult.hardRequirements?.salaryMax || null,
        location: ruleResult.hardRequirements?.location || null,
        language: ruleResult.hardRequirements?.language || null,
      },
      skills: ruleResult.skills || { directSkills: [], generalSkills: [] },
      responsibilities: ruleResult.responsibilities || { summary: null, keywords: [] },
      inferred: ruleResult.inferred || { teamSizeGuess: null, techTrend: null, urgency: null },
    };
  }

  const r = ruleResult;
  const l = llmPackage.result;

  return {
    hardRequirements: {
      // 规则优先于 LLM（规则更精确）
      education: r.hardRequirements?.education || l.hardRequirements.education,
      experienceYears: r.hardRequirements?.experienceYears || l.hardRequirements.experienceYears,
      salaryMin: r.hardRequirements?.salaryMin || l.hardRequirements.salaryMin,
      salaryMax: r.hardRequirements?.salaryMax || l.hardRequirements.salaryMax,
      location: r.hardRequirements?.location || l.hardRequirements.location,
      language: r.hardRequirements?.language || l.hardRequirements.language,
    },
    skills: {
      // 规则优先，LLM 补充
      directSkills: dedupeMerge(
        r.skills?.directSkills || [],
        l.skills.directSkills || []
      ),
      generalSkills: dedupeMerge(
        r.skills?.generalSkills || [],
        l.skills.generalSkills || []
      ),
    },
    responsibilities: {
      // LLM 优先（语义理解更好）
      summary: l.responsibilities.summary || r.responsibilities?.summary || null,
      keywords: dedupeMerge(
        r.responsibilities?.keywords || [],
        l.responsibilities.keywords || []
      ),
    },
    inferred: {
      teamSizeGuess: r.inferred?.teamSizeGuess || l.inferred.teamSizeGuess,
      techTrend: r.inferred?.techTrend || l.inferred.techTrend,
      urgency: r.inferred?.urgency || l.inferred.urgency,
    },
  };
}

function dedupeMerge(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/**
 * 主编排函数
 * 流程：检测平台 → 规则解析 → 置信度判断 → LLM 兜底 → 合并结果
 */
export async function parseJD(
  jdText: string,
  jdHtml: string | undefined,
  platform: string
): Promise<JDParsePackage> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const ruleParser = selectRuleParser(platform);

  // ---- Stage 1: 规则解析 ----
  let ruleResult: Partial<JDParseResult> = {};
  let usedParser: RuleParser = ruleParser;

  if (ruleParser.canHandle(jdText, jdHtml)) {
    ruleResult = ruleParser.parse(jdText, jdHtml);
  } else {
    // 检测不到平台特征 → 尝试通用解析器
    warnings.push(`${platform} 特征未检测到，降级到通用解析器`);
    ruleResult = genericParser.parse(jdText, jdHtml);
    usedParser = genericParser;
  }

  // ---- Skill vocabulary matching (Phase 2.7) ----
  try {
    const skillMatches = await matchSkills(jdText);
    const classified = classifySkills(skillMatches);
    if (!ruleResult.skills) ruleResult.skills = { directSkills: [], generalSkills: [] };
    ruleResult.skills.directSkills = dedupeMerge(
      ruleResult.skills.directSkills || [],
      classified.direct
    );
    ruleResult.skills.generalSkills = dedupeMerge(
      ruleResult.skills.generalSkills || [],
      classified.general
    );
  } catch {
    // Skill matching is optional
  }

  // ---- Stage 2: 置信度计算 ----
  const missingFields = detectMissingFields(ruleResult, usedParser);
  const tempResult = normalizeResult(ruleResult);
  const confidenceScores = calculateConfidence(tempResult, usedParser, missingFields);

  let finalResult: JDParseResult;
  let finalMetadata: JDParseMetadata;
  let llmPackage: JDParsePackage | null = null;

  // ---- Stage 3: 判断是否需要 LLM 兜底 ----
  const needsLLM =
    confidenceScores.overall < CONFIDENCE_THRESHOLD ||
    missingFields.length > 0 ||
    platform === "generic";

  if (needsLLM) {
    warnings.push(
      `规则解析置信度 ${(confidenceScores.overall * 100).toFixed(0)}%，低于阈值 ` +
      `${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%，触发 LLM 解析`
    );

    try {
      llmPackage = await parseJDWithLLM(jdText, platform);
      warnings.push(...(llmPackage.warnings || []));
    } catch {
      warnings.push("LLM 解析失败，仅使用规则解析结果");
    }
  }

  // ---- Stage 4: 合并结果 ----
  finalResult = mergeResults(ruleResult, llmPackage);

  // 重新计算合并后的置信度
  const finalMissing = detectMissingFields(finalResult, usedParser);
  const finalConfidence = calculateConfidence(finalResult, usedParser, finalMissing);

  finalMetadata = {
    confidence: finalConfidence.overall,
    parseMethod: llmPackage ? "llm" : "rule",
    parseVersion: 1,
    coveredFields: usedParser.fieldCoverage.filter(
      (f) => !finalMissing.includes(f)
    ),
    missingFields: finalMissing,
    parseDurationMs: Date.now() - startTime,
  };

  return {
    result: finalResult,
    metadata: finalMetadata,
    warnings,
  };
}

/**
 * 检测缺失字段
 */
function detectMissingFields(
  result: Partial<JDParseResult>,
  parser: RuleParser
): string[] {
  const missing: string[] = [];
  const h = result.hardRequirements || {};

  if (!h.education) missing.push("education");
  if (!h.experienceYears) missing.push("experienceYears");
  if (!h.salaryMin && !h.salaryMax) missing.push("salary");
  if (!h.location) missing.push("location");
  if (!h.language) missing.push("language");

  const skills = result.skills;
  if (!skills || (skills.directSkills.length === 0 && skills.generalSkills.length === 0)) {
    missing.push("skills");
  }

  const resp = result.responsibilities;
  if (!resp || !resp.summary) missing.push("responsibilities");

  return missing;
}

/**
 * 将 Partial 结果标准化为完整的 JDParseResult
 */
function normalizeResult(partial: Partial<JDParseResult>): JDParseResult {
  return {
    hardRequirements: {
      education: partial.hardRequirements?.education || null,
      experienceYears: partial.hardRequirements?.experienceYears || null,
      salaryMin: partial.hardRequirements?.salaryMin || null,
      salaryMax: partial.hardRequirements?.salaryMax || null,
      location: partial.hardRequirements?.location || null,
      language: partial.hardRequirements?.language || null,
    },
    skills: partial.skills || { directSkills: [], generalSkills: [] },
    responsibilities: partial.responsibilities || { summary: null, keywords: [] },
    inferred: partial.inferred || { teamSizeGuess: null, techTrend: null, urgency: null },
  };
}

/**
 * 快速解析（不做 LLM 调用，仅规则）
 */
export function quickParse(
  jdText: string,
  jdHtml: string | undefined,
  platform: string
): { result: Partial<JDParseResult>; platformDetected: string } {
  const parser = selectRuleParser(platform);
  const canHandle = parser.canHandle(jdText, jdHtml);
  const actualParser = canHandle ? parser : genericParser;
  const actualPlatform = canHandle ? platform : "generic";

  return {
    result: actualParser.parse(jdText, jdHtml),
    platformDetected: actualPlatform,
  };
}

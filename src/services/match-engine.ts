// ============================================
// 匹配度评估引擎 (Phase 4.1)
// 公式: 硬性匹配(60%) + 软性匹配(30%) + 隐性匹配(10%)
// ============================================
import type { JDParseRecord } from "./jd-service";

// ---- 匹配结果类型 ----
export interface MatchScores {
  hardSkills: number;       // 硬技能匹配 0-100
  education: number;        // 学历匹配 0-100
  experience: number;       // 经验匹配 0-100
  softSkills: number;       // 软技能匹配 0-100
  responsibility: number;   // 职责匹配 0-100
  culture: number;          // 隐性匹配 0-100
  overall: number;          // 综合: 60% hard + 30% soft + 10% implicit
}

export interface SkillGap {
  skill: string;
  matchType: "matched" | "missing" | "partial";
  importance: "required" | "preferred" | "bonus";
  suggestion?: string;
}

export interface OptimizationSuggestion {
  section: string;            // resume section
  action: "add" | "modify" | "emphasize" | "de-emphasize" | "reorder";
  riskLevel: RiskLevel;
  originalText?: string;
  suggestedText?: string;
  reason: string;
}

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export const RISK_LABELS: Record<RiskLevel, string> = {
  1: "安全改动（格式/顺序）",
  2: "低风险（措辞优化）",
  3: "中风险（数据补充）",
  4: "高风险（技能改写，需确认）",
  5: "极高风险（经验改写，必须确认）",
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  1: "#22c55e",  // green
  2: "#eab308",  // yellow
  3: "#f97316",  // orange
  4: "#ef4444",  // red
  5: "#dc2626",  // dark red
};

export interface MatchResult {
  scores: MatchScores;
  skillGaps: SkillGap[];
  suggestions: OptimizationSuggestion[];
  summary: string;
}

// ---- 简历数据结构（简化版） ----
export interface ResumeProfile {
  skills: string[];
  education: string;
  experienceYears: number;
  currentTitle: string;
  summary: string;
  sections: ResumeSection[];
}

export interface ResumeSection {
  name: string;       // e.g. "work_experience", "projects", "skills", "education"
  title: string;      // display title
  content: string;     // raw text
}

/**
 * 主匹配函数
 */
export function calculateMatch(
  jd: JDParseRecord,
  resume: ResumeProfile
): MatchResult {
  const hardSkillsScore = matchHardSkills(jd, resume);
  const educationScore = matchEducation(jd, resume);
  const experienceScore = matchExperience(jd, resume);
  const softSkillsScore = matchSoftSkills(jd, resume);
  const responsibilityScore = matchResponsibility(jd, resume);
  const cultureScore = matchCulture(jd);

  // 硬性（60%）: 技能 + 学历 + 经验
  const hardMatch = (hardSkillsScore * 0.5 + educationScore * 0.25 + experienceScore * 0.25);
  // 软性（30%）: 软技能 + 职责匹配
  const softMatch = (softSkillsScore * 0.5 + responsibilityScore * 0.5);
  // 隐性（10%）
  const implicitMatch = cultureScore;

  const overall = Math.round(hardMatch * 0.6 + softMatch * 0.3 + implicitMatch * 0.1);

  const skillGaps = analyzeSkillGaps(jd, resume);
  const suggestions = generateSuggestions(jd, resume, skillGaps);

  let summary: string;
  if (overall >= 85) summary = "🎉 高度匹配！你的简历与 JD 非常契合，可以直接投递。";
  else if (overall >= 70) summary = "👍 良好匹配。建议针对性补充几个技能关键词。";
  else if (overall >= 50) summary = "⚠️ 中等匹配。存在明显技能缺口，建议优化简历后再投递。";
  else summary = "🔴 匹配度偏低。该职位与你的背景差距较大，是否仍然尝试？";

  return {
    scores: {
      hardSkills: hardSkillsScore,
      education: educationScore,
      experience: experienceScore,
      softSkills: softSkillsScore,
      responsibility: responsibilityScore,
      culture: cultureScore,
      overall,
    },
    skillGaps,
    suggestions,
    summary,
  };
}

// ---- 硬技能匹配 ----
function matchHardSkills(jd: JDParseRecord, resume: ResumeProfile): number {
  const required = jd.direct_skills || [];
  if (required.length === 0) return 70; // no skills specified

  const resumeSkills = resume.skills.map((s) => s.toLowerCase());
  let matched = 0;
  let weightedMatched = 0;
  let totalWeight = 0;

  for (const skill of required) {
    const weight = 1.0; // direct skills all weight 1.0
    totalWeight += weight;

    if (resumeSkills.some((rs) => rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs))) {
      matched++;
      weightedMatched += weight;
    }
  }

  if (totalWeight === 0) return 70;
  return Math.round((weightedMatched / totalWeight) * 100);
}

// ---- 学历匹配 ----
function matchEducation(jd: JDParseRecord, resume: ResumeProfile): number {
  const reqEdu = jd.education;
  if (!reqEdu || reqEdu === "不限") return 100;

  const eduLevels: Record<string, number> = {
    "博士": 5, "硕士": 4, "本科": 3, "大专": 2, "不限": 0,
  };
  const reqLevel = eduLevels[reqEdu] || 3;
  const resumeLevel = getResumeEduLevel(resume.education);

  if (resumeLevel >= reqLevel) return 100;
  if (resumeLevel === reqLevel - 1) return 60;
  return 30;
}

function getResumeEduLevel(education: string): number {
  if (/博士|Ph\.?D/i.test(education)) return 5;
  if (/硕士|Master|研究生/i.test(education)) return 4;
  if (/本科|Bachelor/i.test(education)) return 3;
  if (/大专|专科/i.test(education)) return 2;
  return 3; // default to 本科
}

// ---- 经验匹配 ----
function matchExperience(jd: JDParseRecord, resume: ResumeProfile): number {
  const reqExp = jd.experience_years;
  if (!reqExp) return 70;

  const expMap: Record<string, [number, number]> = {
    "0-1": [0, 1], "1-3": [1, 3], "3-5": [3, 5], "5-10": [5, 10], "10+": [10, 99],
  };
  const [minReq, maxReq] = expMap[reqExp] || [0, 99];
  const resumeExp = resume.experienceYears;

  if (resumeExp >= minReq && resumeExp <= maxReq) return 100;
  if (resumeExp > maxReq) return 85; // overqualified
  if (resumeExp >= minReq - 1) return 60; // slightly under
  return 30;
}

// ---- 软技能匹配 ----
function matchSoftSkills(jd: JDParseRecord, resume: ResumeProfile): number {
  const generalSkills = jd.general_skills || [];
  if (generalSkills.length === 0) return 70;

  const resumeSkills = resume.skills.map((s) => s.toLowerCase());
  let matched = 0;

  for (const skill of generalSkills) {
    if (resumeSkills.some((rs) => rs.includes(skill.toLowerCase()))) {
      matched++;
    }
  }

  return Math.round((matched / generalSkills.length) * 100);
}

// ---- 职责匹配 ----
function matchResponsibility(jd: JDParseRecord, resume: ResumeProfile): number {
  const keywords = jd.keywords || [];
  if (keywords.length === 0) return 60;

  const resumeText = resume.summary.toLowerCase() +
    resume.sections.map((s) => s.content.toLowerCase()).join(" ");

  let matched = 0;
  for (const kw of keywords) {
    if (resumeText.includes(kw.toLowerCase())) matched++;
  }

  return Math.round((matched / keywords.length) * 100);
}

// ---- 隐性匹配 ----
function matchCulture(_jd: JDParseRecord): number {
  // Simplified: always return moderate score
  // Future: analyze JD tone, company culture signals, etc.
  return 60;
}

// ---- 技能缺口分析 ----
function analyzeSkillGaps(jd: JDParseRecord, resume: ResumeProfile): SkillGap[] {
  const gaps: SkillGap[] = [];
  const resumeSkills = resume.skills.map((s) => s.toLowerCase());

  // Direct skills
  for (const skill of jd.direct_skills || []) {
    const matched = resumeSkills.some((rs) =>
      rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs)
    );
    gaps.push({
      skill,
      matchType: matched ? "matched" : "missing",
      importance: "required",
      suggestion: matched ? undefined : `建议在简历中突出或学习 ${skill}`,
    });
  }

  // General skills
  for (const skill of jd.general_skills || []) {
    const matched = resumeSkills.some((rs) =>
      rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs)
    );
    gaps.push({
      skill,
      matchType: matched ? "matched" : "missing",
      importance: "preferred",
      suggestion: matched ? undefined : `可补充 ${skill} 相关经验`,
    });
  }

  return gaps;
}

// ---- 优化建议生成 ----
function generateSuggestions(
  jd: JDParseRecord,
  resume: ResumeProfile,
  gaps: SkillGap[]
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // 1. Missing required skills → high risk suggestions
  const missingRequired = gaps.filter((g) => g.matchType === "missing" && g.importance === "required");
  for (const gap of missingRequired) {
    suggestions.push({
      section: "skills",
      action: "add",
      riskLevel: 4,
      reason: `JD 要求 ${gap.skill}，你的简历中未体现`,
      suggestedText: `掌握 ${gap.skill}，有实际项目经验`,
    });
  }

  // 2. Missing preferred skills → medium risk
  const missingPreferred = gaps.filter((g) => g.matchType === "missing" && g.importance === "preferred");
  for (const gap of missingPreferred.slice(0, 3)) {
    suggestions.push({
      section: "skills",
      action: "add",
      riskLevel: 3,
      reason: `JD 偏好 ${gap.skill}`,
      suggestedText: `了解 ${gap.skill}`,
    });
  }

  // 3. Responsibility keywords → reorder/emphasize
  const keywords = jd.keywords || [];
  const matchedKeywords = keywords.filter((kw) =>
    resume.summary.toLowerCase().includes(kw.toLowerCase())
  );
  const missingKeywords = keywords.filter((kw) => !matchedKeywords.includes(kw));

  if (missingKeywords.length > 0) {
    suggestions.push({
      section: "summary",
      action: "emphasize",
      riskLevel: 2,
      reason: `在自我评价中融入关键词: ${missingKeywords.slice(0, 5).join("、")}`,
    });
  }

  // 4. Education gap
  if (jd.education && jd.education !== "不限") {
    const eduMatch = matchEducation(jd, resume);
    if (eduMatch < 80) {
      suggestions.push({
        section: "education",
        action: "emphasize",
        riskLevel: 1,
        reason: "突出学历背景或相关证书/培训经历",
      });
    }
  }

  // 5. Title alignment
  if (jd.keywords?.length && resume.currentTitle) {
    const titleRelevance = jd.keywords.filter((kw) =>
      resume.currentTitle.toLowerCase().includes(kw.toLowerCase())
    ).length;
    if (titleRelevance < 2) {
      suggestions.push({
        section: "work_experience",
        action: "modify",
        riskLevel: 3,
        reason: "调整职位标题使其更贴近目标岗位",
      });
    }
  }

  return suggestions;
}

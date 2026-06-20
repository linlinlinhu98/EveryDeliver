// ============================================
// JD 入库质检 (Phase 3.7)
// 必填校验 / 格式检查 / 去重校验 / 完整性评分
// ============================================
import type { JDParseRecord } from "./jd-service";

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  checks: QualityCheck[];
  summary: string;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  score: number; // 0-1
  detail: string;
}

/**
 * 执行入库质检
 */
export function checkJDQuality(
  jdRawText: string,
  parseResult: JDParseRecord | null,
  sourceUrl?: string
): QualityCheckResult {
  const checks: QualityCheck[] = [];

  // 1. 必填字段检查
  checks.push(checkRequiredFields(parseResult));

  // 2. JD 文本长度
  checks.push(checkTextLength(jdRawText));

  // 3. URL 格式检查
  if (sourceUrl) {
    checks.push(checkUrl(sourceUrl));
  } else {
    checks.push({
      name: "来源链接",
      passed: true,
      score: 0.5,
      detail: "无来源链接（手动导入）",
    });
  }

  // 4. 薪资合理性
  checks.push(checkSalaryReasonable(parseResult));

  // 5. 公司名不为空
  checks.push(checkCompanyName(jdRawText));

  // 6. 技能数量
  checks.push(checkSkillsCount(parseResult));

  // 7. 职责摘要质量
  checks.push(checkResponsibilityQuality(parseResult));

  // 计算总分
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.length; // each max 1
  const normalizedScore = Math.round((totalScore / maxScore) * 100);

  const failedChecks = checks.filter((c) => !c.passed);

  return {
    passed: failedChecks.length <= 1, // 允许 1 个非关键检查失败
    score: normalizedScore,
    checks,
    summary:
      failedChecks.length === 0
        ? "✅ 质检通过"
        : `⚠️ ${failedChecks.length} 项检查未通过: ${failedChecks.map((c) => c.name).join("、")}`,
  };
}

function checkRequiredFields(parseResult: JDParseRecord | null): QualityCheck {
  if (!parseResult) {
    return {
      name: "必填字段",
      passed: false,
      score: 0,
      detail: "JD 尚未解析",
    };
  }

  const required = [
    { field: "education", value: parseResult.education, label: "学历" },
    { field: "experience_years", value: parseResult.experience_years, label: "经验" },
    { field: "location", value: parseResult.location, label: "地点" },
  ];

  const missing = required.filter((r) => !r.value);
  const filledCount = required.length - missing.length;
  const passed = filledCount >= 2; // 至少 2 个必填

  return {
    name: "必填字段",
    passed,
    score: filledCount / required.length,
    detail:
      missing.length === 0
        ? "全部必填字段已填写"
        : `缺失: ${missing.map((m) => m.label).join("、")}`,
  };
}

function checkTextLength(jdRawText: string): QualityCheck {
  const len = jdRawText.length;
  if (len < 50) {
    return {
      name: "JD 文本长度",
      passed: false,
      score: 0,
      detail: `JD 文本过短 (${len} chars)，建议 ≥ 50 字`,
    };
  }
  if (len < 200) {
    return {
      name: "JD 文本长度",
      passed: true,
      score: 0.5,
      detail: `JD 文本偏短 (${len} chars)，建议 ≥ 200 字以获得更完整解析`,
    };
  }
  return {
    name: "JD 文本长度",
    passed: true,
    score: 1,
    detail: `JD 文本充足 (${len} chars)`,
  };
}

function checkUrl(url: string): QualityCheck {
  try {
    const parsed = new URL(url);
    const validDomains = [
      "zhipin.com", "bosszhipin.com",
      "liepin.com",
      "lagou.com", "51job.com", "jobui.com",
      "linkedin.com", "indeed.com",
    ];
    const isJobSite = validDomains.some((d) => parsed.hostname.includes(d));
    return {
      name: "来源链接",
      passed: true,
      score: isJobSite ? 1 : 0.7,
      detail: isJobSite ? "来自已知招聘平台" : `来源: ${parsed.hostname}`,
    };
  } catch {
    return {
      name: "来源链接",
      passed: true,
      score: 0.3,
      detail: "URL 格式异常，建议检查",
    };
  }
}

function checkSalaryReasonable(parseResult: JDParseRecord | null): QualityCheck {
  if (!parseResult || !parseResult.salary_range || parseResult.salary_range.length < 2) {
    return {
      name: "薪资合理性",
      passed: true,
      score: 0.5,
      detail: "未提供薪资范围",
    };
  }

  const [min, max] = parseResult.salary_range;
  if (min <= 0 || max <= 0) {
    return {
      name: "薪资合理性",
      passed: false,
      score: 0,
      detail: "薪资数值异常（≤ 0）",
    };
  }

  if (min > max) {
    return {
      name: "薪资合理性",
      passed: false,
      score: 0,
      detail: "最低薪资大于最高薪资",
    };
  }

  if (max > min * 3) {
    return {
      name: "薪资合理性",
      passed: true,
      score: 0.6,
      detail: "薪资范围过大（超过 3 倍），可能是面议",
    };
  }

  return {
    name: "薪资合理性",
    passed: true,
    score: 1,
    detail: `薪资范围合理: ${min / 1000}K-${max / 1000}K`,
  };
}

function checkCompanyName(jdRawText: string): QualityCheck {
  const companyPatterns = [
    /公司名称[：:]\s*(\S+)/,
    /关于.{0,10}公司\s*[：:\n]/,
    /\b(科技|技术|网络|软件|信息|数据|云|智能).{0,6}(有限公司|股份|集团)/,
  ];

  const hasCompany = companyPatterns.some((p) => p.test(jdRawText));
  return {
    name: "公司信息",
    passed: hasCompany,
    score: hasCompany ? 1 : 0.3,
    detail: hasCompany ? "JD 中包含公司信息" : "JD 中未检测到公司名",
  };
}

function checkSkillsCount(parseResult: JDParseRecord | null): QualityCheck {
  const count = (parseResult?.direct_skills?.length || 0) +
    (parseResult?.general_skills?.length || 0);

  if (count === 0) {
    return {
      name: "技能提取",
      passed: false,
      score: 0,
      detail: "未提取到任何技能",
    };
  }
  if (count < 3) {
    return {
      name: "技能提取",
      passed: true,
      score: 0.5,
      detail: `仅提取 ${count} 个技能`,
    };
  }
  return {
    name: "技能提取",
    passed: true,
    score: 1,
    detail: `提取 ${count} 个技能`,
  };
}

function checkResponsibilityQuality(parseResult: JDParseRecord | null): QualityCheck {
  const summary = parseResult?.responsibility_summary;
  if (!summary) {
    return {
      name: "职责摘要",
      passed: true,
      score: 0.3,
      detail: "未提取到职责摘要",
    };
  }
  if (summary.length < 30) {
    return {
      name: "职责摘要",
      passed: true,
      score: 0.5,
      detail: "职责摘要偏短",
    };
  }
  return {
    name: "职责摘要",
    passed: true,
    score: 1,
    detail: "职责摘要完整",
  };
}

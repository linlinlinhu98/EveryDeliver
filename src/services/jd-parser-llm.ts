// ============================================
// LLM JD 解析器客户端 (Phase 2.5)
// 调用 Supabase Edge Function 进行 LLM 解析
// 包含本地 fallback 模拟
// ============================================
import { supabase } from "@/lib/supabase";
import type { JDParsePackage, JDParseResult } from "./jd-parser-types";

const EDGE_FUNCTION = "jd-parse-llm";

/**
 * 调用 LLM Edge Function 解析 JD
 */
export async function parseJDWithLLM(
  jdText: string,
  platform: string = "generic"
): Promise<JDParsePackage> {
  // 截断过长文本以控制成本
  const truncated = jdText.slice(0, 5000);

  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: {
        jdText: truncated,
        platform,
      },
    });

    if (!error && data?.result) {
      return {
        result: data.result,
        metadata: {
          confidence: data.metadata?.confidence || 0.8,
          parseMethod: "llm",
          parseVersion: 1,
          coveredFields: data.metadata?.coveredFields || [],
          missingFields: data.metadata?.missingFields || [],
          parseDurationMs: data.metadata?.parseDurationMs || 0,
        },
        warnings: data.warnings || [],
      };
    }

    throw new Error(error?.message || "Edge Function returned no result");
  } catch (err) {
    console.warn("LLM JD parse failed, using local fallback:", err);
    return localFallbackParse(jdText, platform);
  }
}

/**
 * 本地 fallback：基于规则的简单解析
 * 当 Edge Function 不可用时使用
 */
function localFallbackParse(jdText: string, platform: string): JDParsePackage {
  const result: JDParseResult = {
    hardRequirements: {
      education: extractLocal("education", jdText),
      experienceYears: extractLocal("experience", jdText),
      salaryMin: null,
      salaryMax: null,
      location: extractLocal("location", jdText),
      language: extractLocal("language", jdText),
    },
    skills: {
      directSkills: extractLocalSkills(jdText),
      generalSkills: [],
    },
    responsibilities: {
      summary: jdText.slice(0, 200).replace(/\s+/g, " "),
      keywords: extractLocalKeywords(jdText),
    },
    inferred: {
      teamSizeGuess: null,
      techTrend: null,
      urgency: extractLocal("urgency", jdText),
    },
  };

  return {
    result,
    metadata: {
      confidence: 0.4,
      parseMethod: "llm",
      parseVersion: 1,
      coveredFields: ["keywords"],
      missingFields: [
        "salaryMin", "salaryMax", "language",
        "generalSkills", "teamSizeGuess", "techTrend",
      ],
      parseDurationMs: 0,
    },
    warnings: [
      "LLM 解析器不可用，使用了本地降级方案",
      `平台 ${platform} 仅做了关键词提取`,
      "建议手动补充薪资、学历、经验等信息",
    ],
  };
}

// ---- 简单本地提取 ----

function extractLocal(field: string, text: string): string | null {
  const matchers: Record<string, [RegExp, string][]> = {
    education: [
      [/\b(博士|Ph\.?D)\b/i, "博士"],
      [/\b(硕士|研究生|Master)\b/i, "硕士"],
      [/\b(本科|Bachelor)\b/i, "本科"],
      [/\b(大专|专科)\b/i, "大专"],
    ],
    experience: [
      [/\b(应届|[在待]校|经验不限|无需经验)\b/i, "0-1"],
      [/\b(1-3\s*年|一到三年)\b/i, "1-3"],
      [/\b(3-5\s*年|三到五年)\b/i, "3-5"],
      [/\b(5-10\s*年|五到十年)\b/i, "5-10"],
      [/\b(10\s*年\s*以\s*上|十年以上)\b/i, "10+"],
    ],
    location: [
      [/北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|远程/g, "match"],
    ],
    language: [
      [/\b英语\b.*?(流利|精通|熟练|良好)/i, "match"],
      [/\bEnglish\b/i, "英文"],
    ],
    urgency: [
      [/急聘|急招|紧急|快速到岗/gi, "急聘"],
      [/储备|人才库/gi, "储备"],
    ],
  };

  const patterns = matchers[field];
  if (!patterns) return null;

  for (const [pat, label] of patterns) {
    const m = text.match(pat);
    if (m) {
      return label === "match" ? m[0] : label;
    }
  }
  return null;
}

function extractLocalSkills(text: string): string[] {
  const techs = [
    "Python", "Java", "JavaScript", "TypeScript", "Go", "Rust", "C++", "C#",
    "React", "Vue", "Angular", "Next.js", "Spring", "Django", "Flask",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
    "AWS", "Azure", "GCP", "TensorFlow", "PyTorch", "Flutter",
    "Android", "iOS", "Kafka", "Spark", "Hadoop", "LLM",
  ];
  return techs.filter((t) =>
    new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  );
}

function extractLocalKeywords(text: string): string[] {
  const keywords = new Set<string>();
  const words = [
    "负责", "主导", "开发", "设计", "维护", "优化", "架构",
    "高并发", "高可用", "分布式", "微服务", "性能优化",
    "SQL", "NoSQL", "数据分析", "机器学习",
    "前端", "后端", "全栈", "移动端",
    "部署", "运维", "CI/CD", "代码评审",
  ];
  for (const w of words) {
    if (text.includes(w)) keywords.add(w);
  }
  return Array.from(keywords);
}

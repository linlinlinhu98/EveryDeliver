// ============================================
// JD LLM 解析 Edge Function (Phase 2.5)
// 模型: DeepSeek-V3 (via Anthropic-compatible API)
// 输入: JD 文本 + 平台标识
// 输出: 4 层结构化解析结果
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const DEEPSEEK_BASE_URL =
  Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
const MODEL = Deno.env.get("JD_PARSE_MODEL") || "deepseek-chat";

interface ParseRequest {
  jdText: string;
  platform: string;
}

interface JDParseOutput {
  education: string | null;
  experienceYears: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  language: string | null;
  directSkills: string[];
  generalSkills: string[];
  responsibilitySummary: string | null;
  keywords: string[];
  teamSizeGuess: string | null;
  techTrend: string | null;
  urgency: string | null;
}

const PARSE_PROMPT = `你是一个专业的职位描述（JD）解析器。请从以下 JD 文本中提取结构化信息。

返回一个 JSON 对象，格式如下：
{
  "education": "博士" | "硕士" | "本科" | "大专" | "不限" | null,
  "experienceYears": "0-1" | "1-3" | "3-5" | "5-10" | "10+" | null,
  "salaryMin": 数字(月薪,元) 或 null,
  "salaryMax": 数字(月薪,元) 或 null,
  "location": "城市名" | "远程" | null,
  "language": "英文(精通)" | "英文(良好)" | "英文(基础)" | "英文" | null,
  "directSkills": ["核心技术栈名称列表"],
  "generalSkills": ["通用工具/软技能列表"],
  "responsibilitySummary": "1-2句话的职责摘要",
  "keywords": ["关键词列表，如负责、开发、架构设计等"],
  "teamSizeGuess": "小团队" | "中等" | "大型" | null,
  "techTrend": "技术趋势描述" | null,
  "urgency": "急聘" | "正常" | "储备" | null
}

规则：
1. 只返回 JSON，不要 Markdown 代码块包裹，不要额外解释
2. 未知字段返回 null，空数组返回 []
3. directSkills 是 JD 明确要求的技术栈（如 Python、React、PostgreSQL）
4. generalSkills 是基础工具/软技能（如 Git、Linux、Agile）
5. 如果 JD 提到"急聘/急招/立即到岗"→ urgency = "急聘"
6. 薪资优先提取月薪；如果是年薪(万/年)，除以 12 换算；如果显示"面议"，返回 null
7. 用中文输出字段值（如"本科"而非"Bachelor"）`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { jdText, platform } = (await req.json()) as ParseRequest;

    if (!jdText || jdText.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error: "JD 文本过短（< 20 字符），无法解析",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 截断到 3000 字符以控制 token 成本
    const truncated = jdText.slice(0, 3000);

    let parsedOutput: JDParseOutput;

    if (DEEPSEEK_API_KEY) {
      // ---- 调用 DeepSeek API ----
      const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: PARSE_PROMPT,
            },
            {
              role: "user",
              content: `平台: ${platform}\n\nJD 文本:\n${truncated}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || "";

      // 清理可能的 Markdown 代码块包裹
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      try {
        parsedOutput = JSON.parse(cleaned);
      } catch {
        // 尝试提取 JSON 子串
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedOutput = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("无法解析 LLM 返回的 JSON");
        }
      }
    } else {
      // ---- 无 API Key → 返回占位结果 ----
      console.warn("DEEPSEEK_API_KEY not configured, returning placeholder");
      parsedOutput = getPlaceholderParse(jdText);
    }

    // 验证与标准化输出
    const result = sanitizeOutput(parsedOutput);

    const metadata = {
      confidence: estimateConfidence(result),
      parseMethod: "llm",
      parseVersion: 1,
      coveredFields: getCoveredFields(result),
      missingFields: getMissingFields(result),
      parseDurationMs: Date.now() - startTime,
    };

    return new Response(
      JSON.stringify({ result, metadata, warnings: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("JD parse error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
        result: null,
        metadata: {
          confidence: 0,
          parseMethod: "llm",
          parseVersion: 1,
          coveredFields: [],
          missingFields: ["all"],
          parseDurationMs: Date.now() - startTime,
        },
        warnings: [`解析失败: ${err instanceof Error ? err.message : "Unknown"}`],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function sanitizeOutput(raw: any): JDParseOutput {
  const validEducation = ["博士", "硕士", "本科", "大专", "不限", null];
  const validExperience = ["0-1", "1-3", "3-5", "5-10", "10+", null];
  const validUrgency = ["急聘", "正常", "储备", null];

  return {
    education: validEducation.includes(raw.education) ? raw.education : null,
    experienceYears: validExperience.includes(raw.experienceYears)
      ? raw.experienceYears
      : null,
    salaryMin: typeof raw.salaryMin === "number" ? raw.salaryMin : null,
    salaryMax: typeof raw.salaryMax === "number" ? raw.salaryMax : null,
    location: typeof raw.location === "string" ? raw.location : null,
    language: typeof raw.language === "string" ? raw.language : null,
    directSkills: Array.isArray(raw.directSkills)
      ? raw.directSkills.filter((s: any) => typeof s === "string").slice(0, 20)
      : [],
    generalSkills: Array.isArray(raw.generalSkills)
      ? raw.generalSkills.filter((s: any) => typeof s === "string").slice(0, 10)
      : [],
    responsibilitySummary:
      typeof raw.responsibilitySummary === "string"
        ? raw.responsibilitySummary
        : null,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((s: any) => typeof s === "string").slice(0, 15)
      : [],
    teamSizeGuess: ["小团队", "中等", "大型", null].includes(raw.teamSizeGuess)
      ? raw.teamSizeGuess
      : null,
    techTrend: typeof raw.techTrend === "string" ? raw.techTrend : null,
    urgency: validUrgency.includes(raw.urgency) ? raw.urgency : null,
  };
}

function estimateConfidence(result: JDParseOutput): number {
  const fields = [
    result.education,
    result.experienceYears,
    result.location,
    result.language,
    result.responsibilitySummary,
    result.urgency,
  ];
  const filled = fields.filter((f) => f !== null && f !== undefined).length;
  const skillBonus = Math.min(1, (result.directSkills.length + result.generalSkills.length) / 3);

  return Math.round(((filled / fields.length) * 0.7 + skillBonus * 0.3) * 100) / 100;
}

function getCoveredFields(result: JDParseOutput): string[] {
  const covered: string[] = [];
  if (result.education) covered.push("education");
  if (result.experienceYears) covered.push("experienceYears");
  if (result.salaryMin || result.salaryMax) covered.push("salary");
  if (result.location) covered.push("location");
  if (result.language) covered.push("language");
  if (result.directSkills.length > 0) covered.push("directSkills");
  if (result.generalSkills.length > 0) covered.push("generalSkills");
  if (result.responsibilitySummary) covered.push("responsibilities");
  return covered;
}

function getMissingFields(result: JDParseOutput): string[] {
  const all = [
    "education", "experienceYears", "salary", "location",
    "language", "skills", "responsibilities",
  ];
  const covered = getCoveredFields(result);
  return all.filter((f) => {
    if (f === "skills") return !covered.includes("directSkills") && !covered.includes("generalSkills");
    return !covered.includes(f);
  });
}

function getPlaceholderParse(jdText: string): JDParseOutput {
  const text = jdText.toLowerCase();
  return {
    education: null,
    experienceYears: null,
    salaryMin: null,
    salaryMax: null,
    location: null,
    language: null,
    directSkills: [],
    generalSkills: [],
    responsibilitySummary: jdText.slice(0, 200),
    keywords: [],
    teamSizeGuess: null,
    techTrend: null,
    urgency: null,
  };
}

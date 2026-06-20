// ============================================
// AI 简历优化 Edge Function (Phase 4.5)
// 模型: Qwen-Plus (via API)
// 功能: 根据 JD 优化简历各段落，输出 diff 格式
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const API_BASE = Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
const MODEL = Deno.env.get("RESUME_OPTIMIZE_MODEL") || "deepseek-chat";

interface OptimizeRequest {
  jdText: string;
  jdSkills: string[];
  jdKeywords: string[];
  resumeSection: {
    name: string;
    title: string;
    content: string;
  };
  riskLevel?: number;
}

interface OptimizationResult {
  originalContent: string;
  optimizedContent: string;
  changes: OptimizationChange[];
  explanation: string;
}

interface OptimizationChange {
  type: "added" | "removed" | "modified";
  originalText?: string;
  newText: string;
  position: { start: number; end: number };
  reason: string;
  riskLevel: number; // 1-5
}

const SYSTEM_PROMPT = `你是一位专业简历优化师。根据 JD 要求优化简历段落，使其：
1. 突出与 JD 匹配的技能和关键词
2. 量化成果（添加数字、百分比）
3. 用动词开头，避免被动语态
4. 保持真实，不编造经历

输出 JSON 格式：
{
  "optimizedContent": "优化后的完整段落文本",
  "changes": [
    {
      "type": "added" | "removed" | "modified",
      "originalText": "原文（如适用）",
      "newText": "新文",
      "reason": "改动原因",
      "riskLevel": 1-5  // 1=安全 5=极高风险
    }
  ],
  "explanation": "一段话解释主要改动思路"
}

规则：
- 只返回 JSON，不要 Markdown 包裹
- Risk level: 1=格式顺序 2=措辞优化 3=数据补充 4=技能改写(需确认) 5=经验改写(必须确认)
- 保持专业，不要夸大或虚构`,

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { jdText, jdSkills, jdKeywords, resumeSection, riskLevel } =
      (await req.json()) as OptimizeRequest;

    if (!resumeSection?.content) {
      return new Response(
        JSON.stringify({ error: "简历段落内容为空" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sectionContent = resumeSection.content.slice(0, 1500);
    const jdSummary = jdText.slice(0, 1000);

    let result: OptimizationResult;

    if (API_KEY) {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `## JD 描述`,
                jdSummary,
                `## JD 要求的关键技能`,
                jdSkills.join("、"),
                `## JD 关键词`,
                jdKeywords.join("、"),
                `## 简历「${resumeSection.title}」段落`,
                sectionContent,
                `## 允许的最高风险级别: ${riskLevel || 3}`,
                `请优化上述简历段落以匹配 JD 要求。`,
              ].join("\n\n"),
            },
          ],
          temperature: 0.3,
          max_tokens: 1536,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || "";

      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      result = JSON.parse(cleaned);
    } else {
      // No API key → return basic placeholder optimization
      result = basicOptimize(resumeSection, jdSkills);
    }

    // Sanitize output
    result.optimizedContent = result.optimizedContent || sectionContent;
    result.changes = (result.changes || []).filter(
      (c: any) => c.type && c.newText
    );
    result.explanation = result.explanation || "基础格式优化";

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Resume optimize error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * 基础优化（无需 API）：格式化 + 常用词替换
 */
function basicOptimize(
  section: { title: string; content: string },
  jdSkills: string[]
): OptimizationResult {
  const original = section.content;
  let optimized = original;

  // 动词开头替换
  const verbMap: [RegExp, string][] = [
    [/\b(我)\s*(负责|参与|做了)/gi, "主导"],
    [/\b(协助|帮助)/gi, "推动"],
    [/\b(做|搞)/gi, "完成"],
    [/\b(用过|使用过)/gi, "熟练使用"],
  ];

  const changes: OptimizationChange[] = [];

  for (const [pat, replacement] of verbMap) {
    if (pat.test(optimized)) {
      const match = optimized.match(pat);
      if (match) {
        changes.push({
          type: "modified",
          originalText: match[0],
          newText: replacement,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          reason: `措辞优化: "${match[0]}" → "${replacement}"`,
          riskLevel: 2,
        });
      }
      optimized = optimized.replace(pat, replacement);
    }
  }

  // 如果在 JD 技能中有匹配，标记为突出
  for (const skill of jdSkills.slice(0, 5)) {
    if (original.includes(skill)) {
      changes.push({
        type: "added",
        newText: `✓ ${skill}`,
        position: { start: -1, end: -1 },
        reason: `JD 要求的关键技能已具备: ${skill}`,
        riskLevel: 1,
      });
    }
  }

  return {
    originalContent: original,
    optimizedContent: optimized,
    changes,
    explanation: "基础优化：动词替换 + 技能关键词标注",
  };
}

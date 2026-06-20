/**
 * AI 面试题生成 Edge Function (Phase 7.2)
 *
 * Model: DeepSeek-Chat (via API proxy)
 * Generates tailored interview questions based on JD skills, keywords, and job title.
 *
 * Request: { jobTitle, jdSkills, jdKeywords, jdText?, categories? }
 * Response: { categories: GeneratedQuestionCategory[] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const API_BASE = Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
const MODEL = Deno.env.get("INTERVIEW_MODEL") || "deepseek-chat";

interface QuestionRequest {
  jobTitle: string;
  jdSkills: string[];
  jdKeywords: string[];
  jdText?: string;
  categories?: string[]; // Which categories to generate (default: all)
}

interface GeneratedQuestion {
  question: string;
  hint?: string;
  difficulty: "easy" | "medium" | "hard";
  expectedPoints?: string[];
}

interface GeneratedCategory {
  category: string;
  categoryName: string;
  questions: GeneratedQuestion[];
}

const SYSTEM_PROMPT = `你是一位资深技术面试官和招聘顾问。根据职位描述(JD)生成有针对性的面试准备问题。

输出 JSON 格式（只返回 JSON，不要 Markdown 包裹）：
{
  "categories": [
    {
      "category": "tech|behavioral|system_design|culture|spirit",
      "categoryName": "中文分类名",
      "questions": [
        {
          "question": "面试问题",
          "hint": "回答要点提示",
          "difficulty": "easy|medium|hard",
          "expectedPoints": ["面试官期望听到的关键点1", "关键点2"]
        }
      ]
    }
  ]
}

规则：
- tech: 针对 JD 要求的技术栈出题（3-5题），难度根据技能要求深度
- behavioral: STAR 法则行为问题（3-4题）
- system_design: 如果 JD 涉及架构/系统/高并发才出题（2-3题）
- culture: 文化契合问题（2-3题）
- spirit: 精神准备建议（着装/设备/提问准备，2-3条）
- 所有问题使用中文
- question 字段要具体，不要泛泛而谈
- hint 字段给出简短回答方向
- expectedPoints 列出2-3个面试官想听到的要点`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      jobTitle,
      jdSkills,
      jdKeywords,
      jdText,
      categories,
    }: QuestionRequest = await req.json();

    if (!jobTitle || !jdSkills?.length) {
      return new Response(
        JSON.stringify({ error: "jobTitle and jdSkills are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let result: { categories: GeneratedCategory[] };

    if (API_KEY) {
      const userPrompt = [
        `## 岗位名称`,
        jobTitle,
        `## 要求技能`,
        jdSkills.join("、"),
        `## 关键词`,
        (jdKeywords || []).join("、"),
        jdText ? `## JD 描述\n${jdText.slice(0, 2000)}` : "",
        categories?.length
          ? `## 需要生成的类别\n${categories.join(", ")}`
          : `## 需要生成的类别\n全部（tech, behavioral, system_design, culture, spirit）`,
        `请生成面试准备问题。`,
      ].filter(Boolean).join("\n\n");

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
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
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
      // No API key → return template-based questions as fallback
      result = fallbackQuestions(jobTitle, jdSkills, jdKeywords);
    }

    // Sanitize output
    result.categories = (result.categories || []).map((cat) => ({
      ...cat,
      questions: (cat.questions || []).map((q) => ({
        question: q.question || "",
        hint: q.hint || undefined,
        difficulty: ["easy", "medium", "hard"].includes(q.difficulty)
          ? q.difficulty
          : "medium",
        expectedPoints: q.expectedPoints || [],
      })),
    }));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Interview questions error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Template-based fallback (no API key).
 * Generates reasonable questions from JD data.
 */
function fallbackQuestions(
  jobTitle: string,
  jdSkills: string[],
  jdKeywords: string[],
): { categories: GeneratedCategory[] } {
  const categories: GeneratedCategory[] = [];

  // Tech questions
  if (jdSkills.length > 0) {
    const techQs: GeneratedQuestion[] = [];
    for (const skill of jdSkills.slice(0, 5)) {
      techQs.push({
        question: `请详细介绍 ${skill} 的核心原理和你在项目中的实践经验`,
        hint: `从原理、实践、踩坑三个维度回答`,
        difficulty: "medium",
        expectedPoints: [`${skill} 的核心机制`, "实际应用场景", "性能优化经验"],
      });
      techQs.push({
        question: `在 ${skill} 方面，你遇到过最棘手的问题是什么？如何解决的？`,
        hint: "使用 STAR 法则描述",
        difficulty: "hard",
        expectedPoints: ["问题背景", "分析过程", "解决方案和效果"],
      });
    }
    categories.push({
      category: "tech",
      categoryName: "技术面试",
      questions: techQs.slice(0, 8),
    });
  }

  // Behavioral
  categories.push({
    category: "behavioral",
    categoryName: "行为面试",
    questions: [
      {
        question: "请介绍一个你主导的最有挑战的项目，你从中学到了什么？",
        hint: "STAR 法则：情境-任务-行动-结果",
        difficulty: "medium",
        expectedPoints: ["项目规模和复杂度", "你的具体角色", "量化成果", "反思和成长"],
      },
      {
        question: "描述一次你与同事产生技术分歧的经历，最终如何达成共识？",
        hint: "展现沟通能力和技术判断力",
        difficulty: "medium",
        expectedPoints: ["分歧背景", "你的观点和数据支持", "共识达成过程"],
      },
      {
        question: "你如何应对紧迫的截止日期和不断变化的需求？",
        hint: "展现项目管理能力和心态",
        difficulty: "easy",
        expectedPoints: ["优先级判断", "沟通策略", "具体案例"],
      },
      {
        question: `你为什么对这个${jobTitle}岗位感兴趣？你觉得自己能带来什么价值？`,
        hint: "结合 JD 要求回答",
        difficulty: "easy",
        expectedPoints: ["对公司的了解", "技能匹配", "职业规划一致性"],
      },
    ],
  });

  // System Design (if relevant)
  if (jdKeywords.some((k) => /架构|系统|设计|高并发|分布式|微服务|后端|全栈/.test(k))) {
    categories.push({
      category: "system_design",
      categoryName: "系统设计",
      questions: [
        {
          question: `请设计一个${jobTitle}相关的核心业务系统，你会考虑哪些方面？`,
          hint: "从需求分析→架构选型→数据模型→扩展性逐步展开",
          difficulty: "hard",
          expectedPoints: ["系统架构图", "技术选型理由", "数据一致性方案", "扩展性设计"],
        },
        {
          question: "如何处理系统的高可用和高并发？",
          hint: "从负载均衡、缓存、数据库、消息队列等方面回答",
          difficulty: "hard",
          expectedPoints: ["缓存策略", "数据库读写分离", "异步处理", "熔断降级"],
        },
        {
          question: "如果要重构一个遗留系统，你的方法论是什么？",
          hint: "渐进式重构 vs 重写",
          difficulty: "medium",
          expectedPoints: ["现状评估", "风险控制", "灰度策略", "回滚方案"],
        },
      ],
    });
  }

  // Culture fit
  categories.push({
    category: "culture",
    categoryName: "文化契合",
    questions: [
      {
        question: "你理想的工作环境和团队氛围是什么样的？",
        hint: "真诚表达，与公司文化匹配",
        difficulty: "easy",
        expectedPoints: ["工作节奏偏好", "团队协作方式", "成长期望"],
      },
      {
        question: "你如何保持技术学习和持续成长？",
        hint: "展现自主学习能力",
        difficulty: "easy",
        expectedPoints: ["学习渠道", "实践方式", "知识分享"],
      },
      {
        question: "面对你不熟悉的领域，你会如何快速上手？",
        hint: "展现学习能力和主动性",
        difficulty: "medium",
        expectedPoints: ["信息搜集", "请教策略", "实践验证"],
      },
    ],
  });

  // Spirit / preparation
  categories.push({
    category: "spirit",
    categoryName: "精神风貌",
    questions: [
      {
        question: "面试前 30 分钟：深呼吸练习 + 回顾 3 个核心优势 + 默念关键词",
        hint: "精神准备 checklist",
        difficulty: "easy",
        expectedPoints: ["心态调整", "优势回顾", "关键词记忆"],
      },
      {
        question: "准备 3-5 个有深度的反问问题",
        hint: "展现主动性和对岗位的认真程度",
        difficulty: "easy",
        expectedPoints: ["技术栈相关", "团队情况", "发展空间", "避免薪资类问题"],
      },
      {
        question: "整理仪表 + 检查设备 + 准备安静环境 + 提前 15 分钟上线",
        hint: "面试 checklist（线上/线下）",
        difficulty: "easy",
        expectedPoints: ["网络稳定", "摄像头麦克风", "背景整洁", "备用方案"],
      },
    ],
  });

  return { categories };
}

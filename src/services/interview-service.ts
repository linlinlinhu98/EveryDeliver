// ============================================
// 面试准备服务 (Phase 7)
// CRUD + AI 面试题生成 + 分类 + 进度追踪
// ============================================
import { supabase } from "@/lib/supabase";

// ---- 面试题分类 ----
export const INTERVIEW_CATEGORIES = [
  { id: "tech", name: "技术面试", icon: "💻" },
  { id: "behavioral", name: "行为面试", icon: "🗣" },
  { id: "system_design", name: "系统设计", icon: "🏗" },
  { id: "culture", name: "文化契合", icon: "🤝" },
  { id: "spirit", name: "精神风貌", icon: "✨" },
] as const;

export type InterviewCategory = typeof INTERVIEW_CATEGORIES[number]["id"];

export const CATEGORY_LABELS: Record<InterviewCategory, string> = {
  tech: "技术面试",
  behavioral: "行为面试",
  system_design: "系统设计",
  culture: "文化契合",
  spirit: "精神风貌",
};

// ---- 类型 ----
export interface InterviewPrepItem {
  id?: string;
  user_id?: string;
  application_id?: string | null;
  job_position_id?: string | null;
  title: string;
  category: InterviewCategory;
  content: string;
  source: "ai_generated" | "manual" | "template";
  status: "pending" | "preparing" | "completed";
  priority: number; // 1-5
  due_date?: string | null;
  estimated_minutes?: number;
  tags: string[];
  notes?: string;
}

// ---- CRUD ----
export async function getPrepItems(): Promise<InterviewPrepItem[]> {
  const { data, error } = await supabase
    .from("interview_prep_items")
    .select("*")
    .order("priority", { ascending: false });

  if (error) throw error;
  return (data || []) as InterviewPrepItem[];
}

export async function createPrepItem(item: Partial<InterviewPrepItem>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data, error } = await supabase
    .from("interview_prep_items")
    .insert({
      user_id: user.id,
      title: item.title || "未命名准备项",
      category: item.category || "tech",
      content: item.content || "",
      source: item.source || "manual",
      status: item.status || "pending",
      priority: item.priority || 3,
      due_date: item.due_date || null,
      estimated_minutes: item.estimated_minutes || null,
      tags: item.tags || [],
      notes: item.notes || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updatePrepItem(
  id: string,
  updates: Partial<InterviewPrepItem>
): Promise<void> {
  const { error } = await supabase
    .from("interview_prep_items")
    .update({
      ...updates,
      ...(updates.status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deletePrepItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("interview_prep_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---- AI 面试题生成（模拟） ----
export interface GeneratedQuestions {
  category: InterviewCategory;
  questions: {
    question: string;
    hint?: string;
    difficulty: "easy" | "medium" | "hard";
  }[];
}

/**
 * 根据 JD 关键词生成模拟面试题
 */
export function generateQuestions(
  jobTitle: string,
  jdSkills: string[],
  jdKeywords: string[]
): GeneratedQuestions[] {
  const categories: GeneratedQuestions[] = [];

  // 技术面试
  if (jdSkills.length > 0) {
    const techQs = jdSkills.slice(0, 5).flatMap((skill) => [
      { question: `请介绍 ${skill} 的核心原理和最佳实践`, difficulty: "medium" as const },
      { question: `你在项目中使用 ${skill} 解决过什么难题？`, difficulty: "medium" as const },
    ]);
    categories.push({ category: "tech", questions: techQs.slice(0, 8) });
  }

  // 行为面试
  categories.push({
    category: "behavioral",
    questions: [
      { question: "介绍一个你主导的失败项目，你从中学到了什么？", hint: "STAR 法则", difficulty: "medium" },
      { question: "如何处理与同事的技术分歧？", difficulty: "easy" },
      { question: "描述一次你在高压下完成任务的经历", difficulty: "medium" },
      { question: "你如何平衡技术债务和新功能开发？", difficulty: "hard" },
    ],
  });

  // 系统设计
  if (jdKeywords.some((k) => /架构|系统设计|高并发|分布式/.test(k))) {
    categories.push({
      category: "system_design",
      questions: [
        { question: `设计一个${jobTitle}相关的核心系统`, hint: "考虑扩展性和可靠性", difficulty: "hard" },
        { question: "如何处理百万级并发请求？", difficulty: "hard" },
        { question: "设计一个高可用的微服务架构", difficulty: "hard" },
      ],
    });
  }

  // 文化契合
  categories.push({
    category: "culture",
    questions: [
      { question: "你为什么选择这家公司？", difficulty: "easy" },
      { question: "你理想的工作环境是什么样的？", difficulty: "easy" },
      { question: "你如何看待加班？", difficulty: "medium" },
    ],
  });

  // 精神风貌
  categories.push({
    category: "spirit",
    questions: [
      { question: "面试前 30 分钟：深呼吸练习 + 回顾 3 个核心优势", hint: "精神准备", difficulty: "easy" },
      { question: "准备 3 个要向面试官提问的问题", hint: "展现主动性", difficulty: "easy" },
      { question: "整理仪表 + 测试设备 + 准备安静环境", hint: "面试 checklist", difficulty: "easy" },
    ],
  });

  return categories;
}

// ---- 进度统计 ----
export interface PrepStats {
  total: number;
  completed: number;
  byCategory: Record<string, { total: number; completed: number }>;
  totalEstimatedMinutes: number;
  completedMinutes: number;
  progressPercent: number;
}

export function computePrepStats(items: InterviewPrepItem[]): PrepStats {
  const total = items.length;
  const completed = items.filter((i) => i.status === "completed").length;

  const byCategory: Record<string, { total: number; completed: number }> = {};
  for (const item of items) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { total: 0, completed: 0 };
    }
    byCategory[item.category].total++;
    if (item.status === "completed") {
      byCategory[item.category].completed++;
    }
  }

  const totalEstimatedMinutes = items.reduce((s, i) => s + (i.estimated_minutes || 15), 0);
  const completedMinutes = items
    .filter((i) => i.status === "completed")
    .reduce((s, i) => s + (i.estimated_minutes || 15), 0);

  return {
    total,
    completed,
    byCategory,
    totalEstimatedMinutes,
    completedMinutes,
    progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

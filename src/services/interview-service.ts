// ============================================
// 面试准备服务 (Phase 7 完整版)
// CRUD + AI 面试题生成 + 联动 + 进度追踪
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
  source: "ai_generated" | "manual" | "template" | "auto_sync";
  status: "pending" | "preparing" | "completed";
  priority: number; // 1-5
  due_date?: string | null;
  estimated_minutes?: number;
  tags: string[];
  notes?: string;
  completed_at?: string | null;
}

export interface GeneratedQuestion {
  question: string;
  hint?: string;
  difficulty: "easy" | "medium" | "hard";
  expectedPoints?: string[];
}

export interface GeneratedCategory {
  category: InterviewCategory;
  categoryName: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedQuestions {
  categories: GeneratedCategory[];
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

export async function createPrepItem(
  item: Partial<InterviewPrepItem>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      application_id: item.application_id || null,
      job_position_id: item.job_position_id || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updatePrepItem(
  id: string,
  updates: Partial<InterviewPrepItem>,
): Promise<void> {
  const patch: Record<string, unknown> = { ...updates };
  if (updates.status === "completed" && !updates.completed_at) {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("interview_prep_items")
    .update(patch)
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

export async function batchCreatePrepItems(
  items: Partial<InterviewPrepItem>[],
): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const rows = items.map((item) => ({
    user_id: user.id,
    title: item.title || "未命名准备项",
    category: item.category || "tech",
    content: item.content || "",
    source: item.source || "ai_generated",
    status: "pending",
    priority: item.priority || 3,
    due_date: item.due_date || null,
    estimated_minutes: item.estimated_minutes || 15,
    tags: item.tags || [],
    notes: item.notes || null,
    application_id: item.application_id || null,
    job_position_id: item.job_position_id || null,
  }));

  const { data, error } = await supabase
    .from("interview_prep_items")
    .insert(rows)
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

// ---- AI 面试题生成 ----

/**
 * Generate interview questions using the LLM Edge Function.
 * Falls back to local template-based generation if the Edge Function is unavailable.
 */
export async function generateQuestionsAI(
  jobTitle: string,
  jdSkills: string[],
  jdKeywords: string[],
  jdText?: string,
  categories?: InterviewCategory[],
): Promise<GeneratedQuestions> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "interview-questions",
      {
        body: { jobTitle, jdSkills, jdKeywords, jdText, categories },
      },
    );

    if (error) throw error;
    if (data?.categories) {
      return data as GeneratedQuestions;
    }
    throw new Error("Empty response from Edge Function");
  } catch (err) {
    console.warn("[InterviewService] Edge Function failed, using fallback:", err);
    return localFallbackQuestions(jobTitle, jdSkills, jdKeywords);
  }
}

/**
 * Import generated questions as prep items.
 * Skips duplicates based on title+category match.
 */
export async function importGeneratedQuestions(
  generated: GeneratedQuestions,
  jobPositionId?: string | null,
  applicationId?: string | null,
): Promise<number> {
  // Get existing items to skip duplicates
  const existing = await getPrepItems();
  const existingKeys = new Set(
    existing.map((e) => `${e.title}|${e.category}`),
  );

  const toCreate: Partial<InterviewPrepItem>[] = [];

  for (const cat of generated.categories) {
    for (const q of cat.questions) {
      const key = `${q.question}|${cat.category}`;
      if (existingKeys.has(key)) continue;

      toCreate.push({
        title: q.question,
        category: cat.category,
        content: [
          q.hint ? `💡 提示: ${q.hint}` : "",
          q.expectedPoints?.length
            ? `📌 面试官期望:\n${q.expectedPoints.map((p) => `  • ${p}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n"),
        source: "ai_generated",
        priority: q.difficulty === "hard" ? 5 : q.difficulty === "medium" ? 4 : 3,
        estimated_minutes: q.difficulty === "hard" ? 30 : q.difficulty === "medium" ? 20 : 10,
        tags: [q.difficulty, cat.category],
        job_position_id: jobPositionId || null,
        application_id: applicationId || null,
      });
    }
  }

  if (toCreate.length === 0) return 0;

  return batchCreatePrepItems(toCreate);
}

/**
 * Local fallback question generation (no API key / Edge Function unavailable).
 */
function localFallbackQuestions(
  jobTitle: string,
  jdSkills: string[],
  jdKeywords: string[],
): GeneratedQuestions {
  const categories: GeneratedCategory[] = [];

  // Tech
  if (jdSkills.length > 0) {
    const techQs: GeneratedQuestion[] = jdSkills.slice(0, 5).flatMap((skill) => [
      {
        question: `请介绍 ${skill} 的核心原理和最佳实践`,
        hint: "从原理、实践、踩坑三个维度回答",
        difficulty: "medium",
        expectedPoints: [`${skill} 的核心机制`, "实际应用场景", "性能优化经验"],
      },
      {
        question: `在 ${skill} 方面，你遇到过最棘手的问题是什么？如何解决的？`,
        hint: "使用 STAR 法则：情境-任务-行动-结果",
        difficulty: "medium",
        expectedPoints: ["问题背景", "分析过程", "解决方案和量化效果"],
      },
    ]);
    categories.push({ category: "tech", categoryName: "技术面试", questions: techQs.slice(0, 8) });
  }

  // Behavioral
  categories.push({
    category: "behavioral",
    categoryName: "行为面试",
    questions: [
      {
        question: "介绍一个你主导的失败项目，你从中学到了什么？",
        hint: "STAR 法则：重点放在反思和成长",
        difficulty: "medium",
        expectedPoints: ["项目背景", "失败原因分析", "改进措施", "后续影响"],
      },
      {
        question: "如何处理与同事的技术分歧？",
        difficulty: "easy",
        expectedPoints: ["数据驱动决策", "尊重不同观点", "寻求共赢"],
      },
      {
        question: "描述一次你在高压下完成任务的经历",
        hint: "展现抗压能力和项目管理",
        difficulty: "medium",
        expectedPoints: ["压力来源", "应对策略", "最终结果"],
      },
      {
        question: "你如何平衡技术债务和新功能开发？",
        difficulty: "hard",
        expectedPoints: ["优先级判断", "沟通策略", "具体案例"],
      },
    ],
  });

  // System Design
  if (jdKeywords.some((k) => /架构|系统设计|高并发|分布式/.test(k))) {
    categories.push({
      category: "system_design",
      categoryName: "系统设计",
      questions: [
        {
          question: `设计一个${jobTitle}相关的核心系统`,
          hint: "从需求分析→架构选型→数据模型→扩展性逐步展开",
          difficulty: "hard",
          expectedPoints: ["系统架构图", "技术选型理由", "数据一致性", "扩展性设计"],
        },
        {
          question: "如何处理百万级并发请求？",
          difficulty: "hard",
          expectedPoints: ["缓存策略", "数据库优化", "异步处理", "熔断降级"],
        },
      ],
    });
  }

  // Culture
  categories.push({
    category: "culture",
    categoryName: "文化契合",
    questions: [
      {
        question: "你为什么选择这家公司？",
        difficulty: "easy",
        expectedPoints: ["对公司业务的了解", "价值观匹配", "个人成长规划"],
      },
      {
        question: "你理想的工作环境是什么样的？",
        difficulty: "easy",
        expectedPoints: ["团队氛围", "技术文化", "工作节奏"],
      },
    ],
  });

  // Spirit
  categories.push({
    category: "spirit",
    categoryName: "精神风貌",
    questions: [
      {
        question: "面试前 30 分钟：深呼吸 + 回顾核心优势 + 心态调整",
        hint: "精神准备 checklist",
        difficulty: "easy",
        expectedPoints: ["心态平和", "自信但不自负", "准备充分"],
      },
      {
        question: "准备 3 个有深度的反问问题",
        hint: "展现对岗位的认真和思考深度",
        difficulty: "easy",
        expectedPoints: ["技术栈相关", "团队情况", "发展空间"],
      },
      {
        question: "整理仪表 + 测试设备 + 准备安静环境",
        hint: "面试 checklist",
        difficulty: "easy",
        expectedPoints: ["网络稳定", "设备正常", "环境安静"],
      },
    ],
  });

  return { categories };
}

// ============================================================
// Auto-Sync: Interview Invitation → Prep Items (Phase 7.6)
// ============================================================

/**
 * When an application status changes to "interviewing",
 * auto-generate prep items for that job.
 */
export async function syncFromInterviewInvitation(
  applicationId: string,
  jobPositionId: string,
): Promise<number> {
  // Fetch job position details
  const { data: position } = await supabase
    .from("job_positions")
    .select("title, parsed_skills, parsed_keywords, jd_text")
    .eq("id", jobPositionId)
    .maybeSingle();

  if (!position) return 0;

  const jdSkills: string[] = position.parsed_skills || [];
  const jdKeywords: string[] = position.parsed_keywords || [];

  // Check if prep items already exist for this application
  const { data: existing } = await supabase
    .from("interview_prep_items")
    .select("id")
    .eq("application_id", applicationId);

  if (existing && existing.length > 0) {
    // Already synced — skip
    return 0;
  }

  // Generate and import
  const generated = await generateQuestionsAI(
    position.title || "未知岗位",
    jdSkills,
    jdKeywords,
    position.jd_text || undefined,
  );

  return importGeneratedQuestions(generated, jobPositionId, applicationId);
}

/**
 * Batch sync: check all "interviewing" applications and generate prep items
 * for those that don't have any yet.
 */
export async function syncAllInterviewInvitations(): Promise<{
  checked: number;
  synced: number;
}> {
  const { data: applications } = await supabase
    .from("applications")
    .select("id, job_position_id, status")
    .eq("status", "interviewing");

  if (!applications?.length) return { checked: 0, synced: 0 };

  let synced = 0;
  for (const app of applications) {
    if (!app.job_position_id) continue;
    try {
      const count = await syncFromInterviewInvitation(app.id, app.job_position_id);
      if (count > 0) synced++;
    } catch (err) {
      console.error("[InterviewService] sync failed for application", app.id, err);
    }
  }

  return { checked: applications.length, synced };
}

// ============================================================
// GitHub Project → Interview Prep Sync (Phase 7.5)
// ============================================================

interface GitHubProjectInfo {
  name: string;
  description?: string;
  language?: string;
  topics?: string[];
  url: string;
}

/**
 * Generate interview prep items based on a GitHub project.
 * Creates behavioral questions about the project and tech questions
 * based on the project's languages/topics.
 */
export function generateFromGitHubProject(
  project: GitHubProjectInfo,
): Partial<InterviewPrepItem>[] {
  const items: Partial<InterviewPrepItem>[] = [];

  // Behavioral: project storytelling
  items.push({
    title: `STAR 准备：「${project.name}」项目经历`,
    category: "behavioral",
    content: [
      project.description ? `项目简介: ${project.description}` : "",
      `项目地址: ${project.url}`,
      "准备要点:",
      "• 情境(S): 为什么做这个项目？解决了什么问题？",
      "• 任务(T): 你的角色和具体任务是什么？",
      "• 行动(A): 你采取了哪些技术方案？关键决策是什么？",
      "• 结果(R): 量化成果（star/下载/用户数/性能提升）",
    ].filter(Boolean).join("\n"),
    source: "auto_sync",
    priority: 5,
    estimated_minutes: 30,
    tags: ["github", "STAR", project.name],
    notes: `自动从 GitHub 项目生成: ${project.url}`,
  });

  // Tech questions based on project language/topics
  const projectSkills = [
    ...(project.language ? [project.language] : []),
    ...(project.topics || []).slice(0, 5),
  ];

  for (const skill of projectSkills) {
    items.push({
      title: `技术深挖：${skill} 在「${project.name}」中的应用`,
      category: "tech",
      content: [
        `准备要点:`,
        `• 为什么在「${project.name}」中选择 ${skill}？`,
        `• ${skill} 的核心机制和最佳实践`,
        `• 与其他技术方案的对比和取舍`,
        `• 性能优化和踩坑经验`,
      ].join("\n"),
      source: "auto_sync",
      priority: 4,
      estimated_minutes: 20,
      tags: ["github", skill, project.name],
      notes: `自动从 GitHub 项目 ${project.url} 生成`,
    });
  }

  return items;
}

/**
 * Fetch GitHub projects for the user and generate prep items.
 * Note: Requires GitHub token in Supabase vault or user preferences.
 */
export async function syncFromGitHubProjects(): Promise<number> {
  // Try to get GitHub token from user preferences
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("github_token")
    .maybeSingle();

  const githubToken = prefs?.github_token;
  if (!githubToken) {
    console.log("[InterviewService] No GitHub token configured — skipping sync");
    return 0;
  }

  try {
    // Fetch user's GitHub repos
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=10&type=owner",
      {
        headers: { Authorization: `Bearer ${githubToken}` },
      },
    );

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

    const repos: any[] = await response.json();
    const allItems: Partial<InterviewPrepItem>[] = [];

    for (const repo of repos.slice(0, 5)) {
      const project: GitHubProjectInfo = {
        name: repo.name,
        description: repo.description,
        language: repo.language,
        topics: repo.topics,
        url: repo.html_url,
      };
      const items = generateFromGitHubProject(project);
      allItems.push(...items);
    }

    if (allItems.length === 0) return 0;

    return batchCreatePrepItems(allItems);
  } catch (err) {
    console.error("[InterviewService] GitHub sync error:", err);
    return 0;
  }
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

  const totalEstimatedMinutes = items.reduce(
    (s, i) => s + (i.estimated_minutes || 15),
    0,
  );
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

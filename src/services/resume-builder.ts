// ============================================
// 简历拆解引擎 + 模块化系统 (Phase 5.1 + 5.3)
// 8 大模块类型、5 套模板、质量评分
// ============================================
import { supabase } from "@/lib/supabase";

// ---- 8 大模块类型 ----
export const MODULE_TYPES = [
  { id: "personal_info", name: "个人信息", icon: "👤", order: 1 },
  { id: "summary", name: "自我评价", icon: "💬", order: 2 },
  { id: "work_experience", name: "工作经历", icon: "💼", order: 3 },
  { id: "projects", name: "项目经验", icon: "🚀", order: 4 },
  { id: "skills", name: "技能特长", icon: "🛠", order: 5 },
  { id: "education", name: "教育背景", icon: "🎓", order: 6 },
  { id: "certifications", name: "证书资质", icon: "📜", order: 7 },
  { id: "additional", name: "其他信息", icon: "📌", order: 8 },
] as const;

export type ModuleTypeId = typeof MODULE_TYPES[number]["id"];

// ---- 5 套简历模板 ----
export const RESUME_TEMPLATES = [
  {
    id: "classic",
    name: "经典简洁",
    description: "黑白配色，层次分明，适合大多数岗位",
    layout: ["personal_info", "summary", "work_experience", "projects", "skills", "education", "certifications"],
    style: { fontFamily: "serif", primaryColor: "#1a1a1a", fontSize: "14px" },
  },
  {
    id: "modern",
    name: "现代科技",
    description: "蓝白配色，卡片式布局，适合技术岗位",
    layout: ["personal_info", "skills", "work_experience", "projects", "education", "summary"],
    style: { fontFamily: "sans-serif", primaryColor: "#3b82f6", fontSize: "14px" },
  },
  {
    id: "minimal",
    name: "极简风格",
    description: "大量留白，重点突出，适合设计岗位",
    layout: ["personal_info", "summary", "work_experience", "projects", "education", "skills"],
    style: { fontFamily: "sans-serif", primaryColor: "#374151", fontSize: "13px" },
  },
  {
    id: "professional",
    name: "专业商务",
    description: "深色标题栏，结构化呈现，适合管理岗位",
    layout: ["personal_info", "summary", "work_experience", "education", "certifications", "projects", "skills"],
    style: { fontFamily: "serif", primaryColor: "#1e3a5f", fontSize: "15px" },
  },
  {
    id: "creative",
    name: "创意设计",
    description: "彩色侧边栏，个性化展示，适合创意岗位",
    layout: ["personal_info", "skills", "summary", "work_experience", "projects", "education", "additional"],
    style: { fontFamily: "sans-serif", primaryColor: "#7c3aed", fontSize: "14px" },
  },
] as const;

export type TemplateId = typeof RESUME_TEMPLATES[number]["id"];

// ---- 模块实例 ----
export interface ResumeModuleInstance {
  id?: string;
  resume_id: string;
  module_type_id: ModuleTypeId;
  title: string;
  content: string;
  tags: string[];
  quality_score: number;
  sort_order: number;
  created_at?: string;
}

// ---- 拆解结果 ----
export interface SplitResult {
  modules: ResumeModuleInstance[];
  qualityReport: QualityReport;
}

export interface QualityReport {
  overallScore: number;
  dimensions: {
    name: string;
    score: number; // 0-100
    suggestion: string;
  }[];
  suggestions: string[];
}

/**
 * 拆解简历文本 → 8 大模块
 */
export function splitResume(resumeText: string): SplitResult {
  const modules: ResumeModuleInstance[] = [];
  const sections = detectSections(resumeText);

  // 个人信息
  const personalInfo = sections.find((s) => s.type === "personal_info")
    || extractPersonalInfo(resumeText.slice(0, 500));
  modules.push({
    resume_id: "",
    module_type_id: "personal_info",
    title: "个人信息",
    content: personalInfo || "",
    tags: ["基本信息"],
    quality_score: personalInfo ? 80 : 30,
    sort_order: 1,
  });

  // 自我评价
  const summary = sections.find((s) => s.type === "summary")
    || extractSummary(resumeText);
  modules.push({
    resume_id: "",
    module_type_id: "summary",
    title: "自我评价",
    content: summary || "",
    tags: ["个人简介"],
    quality_score: summary ? 70 : 20,
    sort_order: 2,
  });

  // 工作经历
  const workExp = sections.find((s) => s.type === "work_experience")?.content
    || extractSection(resumeText, /工作经历|工作经验|Work\s*Experience/i);
  modules.push({
    resume_id: "",
    module_type_id: "work_experience",
    title: "工作经历",
    content: workExp || "",
    tags: ["职业经历"],
    quality_score: scoreSection(workExp, ["公司", "负责", "成果"]),
    sort_order: 3,
  });

  // 项目经验
  const projects = sections.find((s) => s.type === "projects")?.content
    || extractSection(resumeText, /项目经验|项目经历|Projects/i);
  modules.push({
    resume_id: "",
    module_type_id: "projects",
    title: "项目经验",
    content: projects || "",
    tags: ["项目"],
    quality_score: scoreSection(projects, ["项目", "技术", "成果"]),
    sort_order: 4,
  });

  // 技能特长
  const skills = sections.find((s) => s.type === "skills")?.content
    || extractSection(resumeText, /技能|专业技能|技术栈|Skills/i);
  modules.push({
    resume_id: "",
    module_type_id: "skills",
    title: "技能特长",
    content: skills || "",
    tags: ["技术栈"],
    quality_score: scoreSection(skills, ["熟练", "掌握", "了解"]),
    sort_order: 5,
  });

  // 教育背景
  const education = sections.find((s) => s.type === "education")?.content
    || extractSection(resumeText, /教育背景|教育经历|学历|Education/i);
  modules.push({
    resume_id: "",
    module_type_id: "education",
    title: "教育背景",
    content: education || "",
    tags: ["学历"],
    quality_score: education ? 75 : 10,
    sort_order: 6,
  });

  // 证书资质
  const certs = sections.find((s) => s.type === "certifications")?.content
    || extractSection(resumeText, /证书|资质|认证|资格|Certification/i);
  modules.push({
    resume_id: "",
    module_type_id: "certifications",
    title: "证书资质",
    content: certs || "",
    tags: ["证书"],
    quality_score: certs ? 70 : 50,
    sort_order: 7,
  });

  // 其他信息
  const additional = sections.find((s) => s.type === "additional")?.content
    || extractSection(resumeText, /其他|附加|语言能力|兴趣爱好|Additional/i);
  modules.push({
    resume_id: "",
    module_type_id: "additional",
    title: "其他信息",
    content: additional || "",
    tags: ["补充"],
    quality_score: 50,
    sort_order: 8,
  });

  // 质量报告
  const qualityReport = buildQualityReport(modules);

  return { modules, qualityReport };
}

/**
 * 从 Markdown 式简历文本检测段落
 */
function detectSections(text: string): { type: ModuleTypeId; content: string }[] {
  const sections: { type: ModuleTypeId; content: string }[] = [];
  const lines = text.split("\n");

  const patterns: [RegExp, ModuleTypeId][] = [
    [/^(#{1,3}\s*)?(个人(信息|简介|资料)|基本信息|Personal\s*Info)/i, "personal_info"],
    [/^(#{1,3}\s*)?(自我(评价|描述|介绍)|个人总结|Summary|Profile)/i, "summary"],
    [/^(#{1,3}\s*)?(工作(经历|经验)|实习经历|Work\s*Experience|Employment)/i, "work_experience"],
    [/^(#{1,3}\s*)?(项目(经验|经历|展示)|Projects)/i, "projects"],
    [/^(#{1,3}\s*)?(技能(特长|描述)?|专业技能|技术栈|Skill)/i, "skills"],
    [/^(#{1,3}\s*)?(教育(背景|经历)?|学历|Education)/i, "education"],
    [/^(#{1,3}\s*)?(证书|资质|认证|培训|Certification)/i, "certifications"],
    [/^(#{1,3}\s*)?(其他|附加|语言|兴趣|Additional)/i, "additional"],
  ];

  let currentType: ModuleTypeId | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    let matched = false;
    for (const [pat, type] of patterns) {
      if (pat.test(line)) {
        if (currentType && currentContent.length > 0) {
          sections.push({ type: currentType, content: currentContent.join("\n").trim() });
        }
        currentType = type;
        currentContent = [line];
        matched = true;
        break;
      }
    }
    if (!matched && currentType) {
      currentContent.push(line);
    }
    // 如果没有当前类型，收集到第一个匹配
    if (!currentType && line.trim()) {
      currentType = "summary";
      currentContent = [line];
    }
  }

  if (currentType && currentContent.length > 0) {
    sections.push({ type: currentType, content: currentContent.join("\n").trim() });
  }

  return sections;
}

function extractPersonalInfo(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const infoLines: string[] = [];
  for (const line of lines.slice(0, 10)) {
    if (/姓名|电话|邮箱|手机|年龄|性别|籍贯|地址|生日/i.test(line)) {
      infoLines.push(line.trim());
    }
  }
  return infoLines.join("\n") || lines.slice(0, 3).join("\n");
}

function extractSummary(text: string): string {
  const patterns = [
    /自我评价[：:]*\s*([\s\S]{30,300}?)(?:工作|项目|技能|教育|证书|其他)/i,
    /个人总结[：:]*\s*([\s\S]{30,300}?)(?:工作|项目|技能|教育|证书)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].trim();
  }
  return text.slice(0, 200).trim();
}

function extractSection(text: string, headerPattern: RegExp): string {
  const match = text.match(new RegExp(
    headerPattern.source + /[：:]*\s*([\s\S]{30,2000}?)(?:#{1,3}\s|$)/.source,
    "im"
  ));
  return match ? match[1].trim() : "";
}

function scoreSection(content: string | undefined, keywords: string[]): number {
  if (!content || content.length < 10) return 0;
  let score = 50;
  for (const kw of keywords) {
    if (content.includes(kw)) score += 15;
  }
  return Math.min(100, score);
}

/**
 * 构建质量报告（5 维度）
 */
function buildQualityReport(modules: ResumeModuleInstance[]): QualityReport {
  const dimensions = [
    {
      name: "完整性",
      score: modules.filter((m) => m.content.length > 10).length / 8 * 100,
      suggestion: "补充缺失的模块",
    },
    {
      name: "详实度",
      score: Math.min(100, modules.reduce((sum, m) => sum + Math.min(50, m.content.length / 10), 0) / 8),
      suggestion: "增加具体数据和成果描述",
    },
    {
      name: "关键词密度",
      score: scoreKeywords(modules),
      suggestion: "在经历中融入更多技术关键词",
    },
    {
      name: "量化程度",
      score: scoreQuantified(modules),
      suggestion: "用数字量化成果（如提升效率30%）",
    },
    {
      name: "格式规范",
      score: 85,
      suggestion: "注意标点符号统一",
    },
  ];

  const overallScore = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);

  return {
    overallScore,
    dimensions,
    suggestions: dimensions.filter((d) => d.score < 70).map((d) => d.suggestion),
  };
}

function scoreKeywords(modules: ResumeModuleInstance[]): number {
  const keywords = [
    "负责", "主导", "设计", "开发", "优化", "提升", "降低", "实现",
    "Python", "Java", "React", "SQL", "Docker", "团队", "管理",
  ];
  const allText = modules.map((m) => m.content).join(" ");
  let found = 0;
  for (const kw of keywords) {
    if (allText.includes(kw)) found++;
  }
  return Math.round((found / keywords.length) * 100);
}

function scoreQuantified(modules: ResumeModuleInstance[]): number {
  const allText = modules.map((m) => m.content).join(" ");
  const numberPattern = /\d+[%％]|\d+\s*[人个次项]|\d+[万kK元]/g;
  const matches = allText.match(numberPattern);
  return Math.min(100, (matches?.length || 0) * 20);
}

// ---- 模块库 CRUD ----

export async function saveModuleToLibrary(module: ResumeModuleInstance): Promise<string> {
  const { data, error } = await supabase
    .from("resume_module_instances")
    .insert({
      resume_id: module.resume_id,
      module_type_id: module.module_type_id,
      title: module.title,
      content: module.content,
      tags: module.tags,
      quality_score: module.quality_score,
      sort_order: module.sort_order,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function getUserModules(): Promise<ResumeModuleInstance[]> {
  const { data, error } = await supabase
    .from("resume_module_instances")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data || []) as ResumeModuleInstance[];
}

/**
 * 按模板组装简历
 */
export function assembleResume(
  modules: ResumeModuleInstance[],
  templateId: TemplateId
): string {
  const template = RESUME_TEMPLATES.find((t) => t.id === templateId)
    || RESUME_TEMPLATES[0];

  const moduleMap = new Map(modules.map((m) => [m.module_type_id, m]));

  const parts: string[] = [];
  parts.push(`# 我的简历\n`);
  parts.push(`> 模板: ${template.name} | 生成于 ${new Date().toLocaleDateString("zh-CN")}\n`);

  for (const typeId of template.layout) {
    const mod = moduleMap.get(typeId);
    if (mod && mod.content.trim()) {
      parts.push(`## ${mod.title}\n`);
      parts.push(mod.content);
      parts.push("");
    }
  }

  return parts.join("\n");
}

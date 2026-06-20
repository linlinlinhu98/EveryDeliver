// ============================================
// 技能词表服务 (Phase 2.7)
// 从 Supabase skill_vocabulary 表加载，支持本地 fallback
// ============================================
import { supabase } from "@/lib/supabase";
import type { SkillEntry, SkillMatch } from "./jd-parser-types";

// ---- 本地 fallback 词表 ----
const LOCAL_VOCABULARY: Omit<SkillEntry, "id">[] = [
  // Direct skills (权重 ×2.0)
  { name: "Python", aliases: ["python3", "py"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "JavaScript", aliases: ["js", "es6", "es2015"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "TypeScript", aliases: ["ts"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Java", aliases: ["java8", "java11", "java17", "java21"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Go", aliases: ["golang"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Rust", aliases: ["rustlang"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "C++", aliases: ["cpp"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "C#", aliases: ["csharp"], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Kotlin", aliases: [], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Swift", aliases: [], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Ruby", aliases: [], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "PHP", aliases: [], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "Scala", aliases: [], category: "programming_language", weight: 2.0, isDirect: true },
  { name: "React", aliases: ["reactjs", "react.js"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Vue", aliases: ["vuejs", "vue.js", "vue3"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Angular", aliases: ["angular2", "angularjs"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Next.js", aliases: ["nextjs", "next"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Spring", aliases: ["springboot", "spring cloud"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Django", aliases: ["drf"], category: "framework", weight: 2.0, isDirect: true },
  { name: "Flask", aliases: [], category: "framework", weight: 2.0, isDirect: true },
  { name: "FastAPI", aliases: [], category: "framework", weight: 2.0, isDirect: true },
  { name: "Express", aliases: ["expressjs"], category: "framework", weight: 2.0, isDirect: true },
  { name: "NestJS", aliases: ["nestjs", "nest"], category: "framework", weight: 2.0, isDirect: true },
  { name: "TensorFlow", aliases: ["tf"], category: "framework", weight: 2.0, isDirect: true },
  { name: "PyTorch", aliases: [], category: "framework", weight: 2.0, isDirect: true },
  { name: "Flutter", aliases: [], category: "framework", weight: 2.0, isDirect: true },
  { name: "React Native", aliases: ["rn"], category: "framework", weight: 2.0, isDirect: true },
  { name: "PostgreSQL", aliases: ["postgres", "pgsql"], category: "database", weight: 2.0, isDirect: true },
  { name: "MySQL", aliases: [], category: "database", weight: 2.0, isDirect: true },
  { name: "MongoDB", aliases: ["mongo"], category: "database", weight: 2.0, isDirect: true },
  { name: "Redis", aliases: [], category: "database", weight: 2.0, isDirect: true },
  { name: "Elasticsearch", aliases: ["es", "elastic"], category: "database", weight: 2.0, isDirect: true },
  { name: "AWS", aliases: [], category: "cloud", weight: 2.0, isDirect: true },
  { name: "Azure", aliases: [], category: "cloud", weight: 2.0, isDirect: true },
  { name: "GCP", aliases: ["google cloud"], category: "cloud", weight: 2.0, isDirect: true },
  { name: "Docker", aliases: ["container"], category: "cloud", weight: 2.0, isDirect: true },
  { name: "Kubernetes", aliases: ["k8s", "kube"], category: "cloud", weight: 2.0, isDirect: true },
  { name: "CI/CD", aliases: ["cicd"], category: "cloud", weight: 2.0, isDirect: true },
  { name: "Terraform", aliases: ["iac"], category: "cloud", weight: 2.0, isDirect: true },
  { name: "Hadoop", aliases: [], category: "domain", weight: 2.0, isDirect: true },
  { name: "Spark", aliases: ["apache spark"], category: "domain", weight: 2.0, isDirect: true },
  { name: "Flink", aliases: ["apache flink"], category: "domain", weight: 2.0, isDirect: true },
  { name: "Kafka", aliases: ["apache kafka"], category: "domain", weight: 2.0, isDirect: true },
  { name: "LLM", aliases: ["大模型", "大语言模型", "GPT", "ChatGPT"], category: "domain", weight: 2.0, isDirect: true },
  { name: "Computer Vision", aliases: ["cv", "计算机视觉", "图像识别"], category: "domain", weight: 2.0, isDirect: true },
  { name: "NLP", aliases: ["自然语言处理", "文本分析"], category: "domain", weight: 2.0, isDirect: true },
  { name: "Android", aliases: ["安卓"], category: "domain", weight: 2.0, isDirect: true },
  { name: "iOS", aliases: ["苹果开发"], category: "domain", weight: 2.0, isDirect: true },
  // General skills (权重 ×0.5)
  { name: "Git", aliases: ["github", "gitlab", "版本控制"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Linux", aliases: ["unix", "shell", "bash"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Agile", aliases: ["scrum", "kanban", "敏捷"], category: "soft_skill", weight: 0.5, isDirect: false },
  { name: "REST API", aliases: ["restful"], category: "tool", weight: 0.5, isDirect: false },
  { name: "GraphQL", aliases: [], category: "tool", weight: 0.5, isDirect: false },
  { name: "WebSocket", aliases: ["ws"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Microservices", aliases: ["微服务"], category: "domain", weight: 0.5, isDirect: false },
  { name: "Jira", aliases: ["confluence"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Figma", aliases: ["sketch"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Unit Testing", aliases: ["jest", "pytest", "junit", "单元测试"], category: "tool", weight: 0.5, isDirect: false },
  { name: "Jenkins", aliases: [], category: "tool", weight: 0.5, isDirect: false },
];

let cachedVocabulary: SkillEntry[] | null = null;

/**
 * 加载技能词表（Supabase 优先，fallback 到本地）
 */
export async function loadVocabulary(): Promise<SkillEntry[]> {
  if (cachedVocabulary) return cachedVocabulary;

  try {
    const { data, error } = await supabase
      .from("skill_vocabulary")
      .select("*")
      .order("category");

    if (!error && data && data.length > 0) {
      cachedVocabulary = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        aliases: row.aliases || [],
        category: row.category,
        weight: row.weight,
        isDirect: row.is_direct,
      }));
      return cachedVocabulary;
    }
  } catch {
    // Supabase 不可用时使用本地词表
  }

  // 本地 fallback
  cachedVocabulary = LOCAL_VOCABULARY.map((s, i) => ({
    ...s,
    id: `local-${i}`,
  }));
  return cachedVocabulary;
}

/**
 * 在 JD 文本中匹配技能
 */
export async function matchSkills(text: string): Promise<SkillMatch[]> {
  const vocab = await loadVocabulary();
  const matches: SkillMatch[] = [];

  for (const skill of vocab) {
    // 检查技能名本身
    const namePattern = escapeRegex(skill.name);
    const nameMatch = text.match(new RegExp(`\\b${namePattern}\\b`, "i"));
    if (nameMatch) {
      matches.push({
        skill,
        sourceText: nameMatch[0],
        confidence: 0.95,
      });
      continue;
    }

    // 检查别名
    for (const alias of skill.aliases) {
      const aliasPattern = escapeRegex(alias);
      const aliasMatch = text.match(new RegExp(`\\b${aliasPattern}\\b`, "i"));
      if (aliasMatch) {
        matches.push({
          skill,
          sourceText: aliasMatch[0],
          confidence: 0.8,
        });
        break;
      }
    }
  }

  return matches;
}

/**
 * 按 direct/general 分类技能
 */
export function classifySkills(matches: SkillMatch[]): {
  direct: string[];
  general: string[];
} {
  const direct = new Set<string>();
  const general = new Set<string>();

  for (const { skill } of matches) {
    if (skill.isDirect) {
      direct.add(skill.name);
    } else {
      general.add(skill.name);
    }
  }

  // 去重
  for (const g of general) {
    if (direct.has(g)) general.delete(g);
  }

  return { direct: Array.from(direct), general: Array.from(general) };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

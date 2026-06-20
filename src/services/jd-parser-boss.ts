// ============================================
// BOSS 直聘 JD 规则解析器 (Phase 2.2)
// ============================================
import type { RuleParser, JDParseResult, HardRequirements, SkillRequirements, ResponsibilitySummary, InferredInfo } from "./jd-parser-types";

/**
 * BOSS 直聘平台 JD 解析器
 * 覆盖字段：薪资、地点、学历、经验、公司名、技能关键词
 * 规则覆盖率目标：薪资 95%、地点 90%、学历 85%、经验 80%、公司名 90%
 */
export const bossZhipinParser: RuleParser = {
  name: "BOSS Zhipin Parser",
  platform: "boss",
  fieldCoverage: [
    "education", "experienceYears", "salaryMin", "salaryMax",
    "location", "directSkills", "generalSkills", "keywords",
  ],

  canHandle(rawText: string, _rawHtml?: string): boolean {
    const indicators = [
      "BOSS直聘",
      "zhipin.com",
      "BOSS·",
      "直聘",
      "沟通率",
      "在线回复",
    ];
    return indicators.some((ind) => rawText.includes(ind));
  },

  parse(rawText: string, rawHtml?: string): Partial<JDParseResult> {
    const text = rawHtml ? stripHtml(rawHtml) + "\n" + rawText : rawText;

    const hard: Partial<HardRequirements> = {};
    const skills: Partial<SkillRequirements> = { directSkills: [], generalSkills: [] };
    const resp: Partial<ResponsibilitySummary> = { keywords: [] };
    const inferred: Partial<InferredInfo> = {};

    // ---- 薪资解析 ----
    // BOSS 格式: "15K-25K" | "15-25K" | "15K-25K·13薪" | "薪资面议"
    const salaryPatterns = [
      /(\d{1,3})\s*[kK]\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /(\d+)k\s*[-–—~至]\s*(\d+)k/i,
      /月薪[：:]?\s*(\d{1,3})\s*[kK]\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /薪资[：:]?\s*(\d{1,3})\s*[kK]\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /(\d{1,3})[kK]\s*[-–—~至]\s*(\d{1,3})[kK]/,
    ];

    for (const pat of salaryPatterns) {
      const m = text.match(pat);
      if (m) {
        hard.salaryMin = parseInt(m[1]) * 1000;
        hard.salaryMax = parseInt(m[2]) * 1000;
        break;
      }
    }

    // 年薪格式: "20万-30万/年"
    if (!hard.salaryMin) {
      const annualMatch = text.match(/(\d{1,3})\s*万\s*[-–—~至]\s*(\d{1,3})\s*万/);
      if (annualMatch) {
        hard.salaryMin = Math.round((parseInt(annualMatch[1]) * 10000) / 12);
        hard.salaryMax = Math.round((parseInt(annualMatch[2]) * 10000) / 12);
      }
    }

    // ---- 学历解析 ----
    const eduMap: Record<string, string> = {
      博士: "博士", "博士及以上": "博士", "Ph.D": "博士",
      硕士: "硕士", "硕士研究生": "硕士", "研究生": "硕士",
      本科: "本科", "大学本科": "本科", "统招本科": "本科", "全日制本科": "本科",
      大专: "大专", "专科": "大专",
      不限: "不限", "学历不限": "不限",
    };

    const eduPat = new RegExp(
      `(${Object.keys(eduMap).sort((a, b) => b.length - a.length).join("|")})`,
      "i"
    );
    const eduMatch = text.match(eduPat);
    if (eduMatch) hard.education = eduMap[eduMatch[1]] || eduMatch[1];

    // ---- 经验年限解析 ----
    const expPatterns: { pat: RegExp; label: string }[] = [
      { pat: /经验不限|无需经验|应届生/, label: "0-1" },
      { pat: /在校[./]应届|应届|校招/, label: "0-1" },
      { pat: /1[-\s]*3年|1-3年经验/, label: "1-3" },
      { pat: /3[-\s]*5年|3-5年经验/, label: "3-5" },
      { pat: /5[-\s]*10年|5-10年经验/, label: "5-10" },
      { pat: /10年以上|十年以上/, label: "10+" },
      { pat: /1年以内|1年以下/, label: "0-1" },
    ];

    for (const { pat, label } of expPatterns) {
      if (pat.test(text)) {
        hard.experienceYears = label;
        break;
      }
    }

    // ---- 地点解析 ----
    const cityList = [
      "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
      "西安", "苏州", "重庆", "长沙", "天津", "郑州", "厦门", "青岛",
      "大连", "宁波", "合肥", "福州", "济南", "沈阳", "昆明", "贵阳",
      "南昌", "南宁", "哈尔滨", "长春", "石家庄", "太原", "兰州", "海口",
      "珠海", "东莞", "佛山", "中山", "惠州", "无锡", "常州", "南通",
       "远程",
    ];

    const cityPat = new RegExp(
      `(?:工作地点|地点|base|城市)[：:]*\\s*(${cityList.join("|")})`,
      "i"
    );
    const cityMatch1 = text.match(cityPat);
    if (cityMatch1) {
      hard.location = cityMatch1[1];
    } else {
      // 尝试匹配城市名（优先匹配区号格式: "北京·朝阳区"）
      const areaPat = new RegExp(
        `(${cityList.join("|")})[·•\\s]`,
        "i"
      );
      const areaMatch = text.match(areaPat);
      if (areaMatch) hard.location = areaMatch[1];
    }

    // ---- 技能提取（Layer 2） ----
    const techSkills = extractTechSkills(text);
    skills.directSkills = techSkills.direct;
    skills.generalSkills = techSkills.general;

    // ---- 关键词提取（Layer 3） ----
    resp.keywords = extractKeywords(text);

    // ---- 职责摘要（Layer 3） ----
    resp.summary = extractBossSummary(text);

    // ---- 隐性推断（Layer 4） ----
    const urgencyMatch = text.match(/急聘|急招|紧急|快速到岗|立即到岗|尽快到岗/);
    if (urgencyMatch) inferred.urgency = "急聘";
    else inferred.urgency = "正常";

    if (/团队规模[：:]*\s*(\d+)\s*人/.test(text)) {
      const size = parseInt(RegExp.$1);
      inferred.teamSizeGuess = size < 10 ? "小团队" : size < 50 ? "中等" : "大型";
    }

    return {
      hardRequirements: {
        education: hard.education || null,
        experienceYears: hard.experienceYears || null,
        salaryMin: hard.salaryMin || null,
        salaryMax: hard.salaryMax || null,
        location: hard.location || null,
        language: hard.language || null,
      },
      skills: {
        directSkills: skills.directSkills || [],
        generalSkills: skills.generalSkills || [],
      },
      responsibilities: {
        summary: resp.summary || null,
        keywords: resp.keywords || [],
      },
      inferred: {
        teamSizeGuess: inferred.teamSizeGuess || null,
        techTrend: inferred.techTrend || null,
        urgency: inferred.urgency || null,
      },
    };
  },
};

// ============================================
// Helper functions
// ============================================

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 从 JD 文本中提取技术栈关键词
 */
function extractTechSkills(text: string): { direct: string[]; general: string[] } {
  const direct = new Set<string>();
  const general = new Set<string>();

  const directPatterns: [RegExp, string][] = [
    // 编程语言
    [/\bPython\b/i, "Python"], [/\bJava\b(?!\s*Script)/i, "Java"],
    [/\bJavaScript\b/i, "JavaScript"], [/\bTypeScript\b/i, "TypeScript"],
    [/\bGo(lang)?\b/i, "Go"], [/\bRust\b/i, "Rust"],
    [/\bC\+\+\b/i, "C++"], [/\bC#\b/i, "C#"],
    [/\bKotlin\b/i, "Kotlin"], [/\bSwift\b/i, "Swift"],
    [/\bRuby\b/i, "Ruby"], [/\bPHP\b/i, "PHP"],
    // 框架
    [/\bReact\b/i, "React"], [/\bVue\b/i, "Vue"],
    [/\bAngular\b/i, "Angular"], [/\bNext\.?js\b/i, "Next.js"],
    [/\bSpring\s?(Boot|Cloud)?\b/i, "Spring"],
    [/\bDjango\b/i, "Django"], [/\bFlask\b/i, "Flask"],
    [/\bFastAPI\b/i, "FastAPI"], [/\bExpress\b/i, "Express"],
    [/\bNestJS\b/i, "NestJS"],
    [/\bTensorFlow\b/i, "TensorFlow"], [/\bPyTorch\b/i, "PyTorch"],
    [/\bFlutter\b/i, "Flutter"], [/\bReact\s?Native\b/i, "React Native"],
    // 数据库
    [/\bPostgre(SQL)?\b/i, "PostgreSQL"], [/\bMySQL\b/i, "MySQL"],
    [/\bMongoDB\b/i, "MongoDB"], [/\bRedis\b/i, "Redis"],
    [/\bElasticsearch\b/i, "Elasticsearch"],
    // 云
    [/\bAWS\b/, "AWS"], [/\bAzure\b/i, "Azure"],
    [/\bGCP\b|Google\s?Cloud\b/i, "GCP"],
    [/\bDocker\b/i, "Docker"], [/\bKubernetes\b|\bK8s\b/i, "Kubernetes"],
    [/\bTerraform\b/i, "Terraform"],
    // AI/ML
    [/\b大模型\b|大语言模型/, "LLM"], [/\bLLM\b/i, "LLM"],
    [/\bNLP\b|自然语言/, "NLP"], [/\b计算机视觉\b/i, "Computer Vision"],
    // 移动端
    [/\bAndroid\b/i, "Android"], [/\biOS\b/i, "iOS"],
  ];

  const generalPatterns: [RegExp, string][] = [
    [/\bGit\b/i, "Git"], [/\bLinux\b/i, "Linux"],
    [/\bREST\s?(ful)?\s?API\b/i, "REST API"], [/\bGraphQL\b/i, "GraphQL"],
    [/\b微服务\b|Microservice/i, "Microservices"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\b敏捷\b|Scrum|Agile/i, "Agile"],
  ];

  for (const [pat, name] of directPatterns) {
    if (pat.test(text)) direct.add(name);
  }

  for (const [pat, name] of generalPatterns) {
    if (pat.test(text)) general.add(name);
  }

  // 去重：如果一个技能同时匹配了 direct 和 general，只保留 direct
  for (const g of general) {
    if (direct.has(g)) general.delete(g);
  }

  return {
    direct: Array.from(direct),
    general: Array.from(general),
  };
}

/**
 * 从 JD 文本中提取关键词
 */
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();

  const patterns = [
    /负责|主导|参与|协助|搭建|设计|开发|维护|优化|重构|制定|管理|推动|协调/g,
    /高并发|高可用|分布式|微服务|性能优化|架构设计/g,
    /数据驱动|用户增长|产品设计|项目管理|团队管理/g,
    /SQL|NoSQL|ETL|数据分析|数据挖掘|机器学习/g,
    /前端|后端|全栈|客户端|移动端|服务端/g,
    /上线|部署|运维|监控|告警|CI\/CD/g,
    /需求分析|方案设计|代码评审|技术分享|文档撰写/g,
  ];

  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      keywords.add(m[0]);
    }
  }

  return Array.from(keywords).slice(0, 15);
}

/**
 * 从 BOSS JD 提取职责摘要
 */
function extractBossSummary(text: string): string | null {
  // 尝试匹配"岗位职责"或"工作内容"段落
  const sectionPatterns = [
    /岗位职责[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利)/i,
    /工作内容[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利)/i,
    /职位描述[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利)/i,
  ];

  for (const pat of sectionPatterns) {
    const m = text.match(pat);
    if (m && m[1].trim().length > 10) {
      return m[1].trim().replace(/\s+/g, " ").slice(0, 300);
    }
  }

  return null;
}

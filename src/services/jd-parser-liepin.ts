// ============================================
// 猎聘 JD 规则解析器 (Phase 2.3)
// ============================================
import type { RuleParser, JDParseResult, HardRequirements, SkillRequirements, ResponsibilitySummary, InferredInfo } from "./jd-parser-types";

export const liepinParser: RuleParser = {
  name: "Liepin Parser",
  platform: "liepin",
  fieldCoverage: [
    "education", "experienceYears", "salaryMin", "salaryMax",
    "location", "directSkills", "generalSkills", "keywords",
  ],

  canHandle(rawText: string, _rawHtml?: string): boolean {
    const indicators = [
      "猎聘",
      "liepin.com",
      "猎聘网",
      "猎头",
      "推荐奖金",
      "职位类别",
    ];
    return indicators.some((ind) => rawText.includes(ind));
  },

  parse(rawText: string, rawHtml?: string): Partial<JDParseResult> {
    const text = (rawHtml ? stripHtml(rawHtml) + "\n" + rawText : rawText);

    const hard: Partial<HardRequirements> = {};
    const skills: Partial<SkillRequirements> = { directSkills: [], generalSkills: [] };
    const resp: Partial<ResponsibilitySummary> = { keywords: [] };
    const inferred: Partial<InferredInfo> = {};

    // ---- 薪资解析 ----
    // 猎聘格式: "15K-25K" | "15,000-25,000元/月" | "15-25万/年" | "面议"
    const salaryPatterns = [
      /(\d{1,3})\s*[kK]\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      /(\d{1,2}),?(\d{3})\s*[-–—~至]\s*(\d{1,2}),?(\d{3})\s*元?\s*[\/／]\s*月/,
      /月薪[：:]\s*(\d{1,2}),?(\d{3})\s*[-–—~至]\s*(\d{1,2}),?(\d{3})/,
      /(\d{1,3})k\s*[-–—~至]\s*(\d{1,3})k/i,
      /薪资范围[：:]\s*(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*[kK]/,
      // 年薪格式
      /(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*万\s*[\/／]\s*年/,
    ];

    for (const pat of salaryPatterns) {
      const m = text.match(pat);
      if (m) {
        if (m.length === 3) {
          // Simple K format
          hard.salaryMin = parseInt(m[1]) * 1000;
          hard.salaryMax = parseInt(m[2]) * 1000;
        } else if (m.length === 5) {
          // Comma-separated format
          hard.salaryMin = parseInt(m[1] + m[2]);
          hard.salaryMax = parseInt(m[3] + m[4]);
        }
        break;
      }
    }

    // 年薪 → 月薪转换
    if (hard.salaryMin && hard.salaryMin > 100000) {
      hard.salaryMin = Math.round(hard.salaryMin / 12);
      hard.salaryMax = hard.salaryMax ? Math.round(hard.salaryMax / 12) : undefined;
    }

    // ---- 学历解析 ----
    const eduMap: Record<string, string> = {
      博士: "博士", "博士及以上": "博士", "Ph.D": "博士",
      硕士: "硕士", "硕士研究生": "硕士", "研究生及以上": "硕士",
      本科: "本科", "大学本科": "本科", "统招本科": "本科", "全日制本科": "本科",
      大专: "大专", "专科及以上": "大专",
      不限: "不限", "学历不限": "不限",
    };

    // 猎聘特有格式: "最低学历：本科"
    const liepinEduPat = /最低学历[：:]\s*(\S+)/;
    const liepinEduMatch = text.match(liepinEduPat);
    if (liepinEduMatch) {
      const raw = liepinEduMatch[1];
      for (const [key, val] of Object.entries(eduMap)) {
        if (raw.includes(key)) { hard.education = val; break; }
      }
    } else {
      const eduPat = new RegExp(
        `(${Object.keys(eduMap).sort((a, b) => b.length - a.length).join("|")})`,
        "i"
      );
      const eduMatch = text.match(eduPat);
      if (eduMatch) hard.education = eduMap[eduMatch[1]] || eduMatch[1];
    }

    // ---- 经验年限 ----
    const expPatterns: { pat: RegExp; label: string }[] = [
      { pat: /经验不限|无需经验|应届生|在校生/, label: "0-1" },
      { pat: /1[-\s]*3年|1-3年工作经验/, label: "1-3" },
      { pat: /3[-\s]*5年|3-5年工作经验/, label: "3-5" },
      { pat: /5[-\s]*10年|5-10年工作经验/, label: "5-10" },
      { pat: /10年以上|十年以上|10\+/, label: "10+" },
    ];

    for (const { pat, label } of expPatterns) {
      if (pat.test(text)) {
        hard.experienceYears = label;
        break;
      }
    }

    // ---- 地点 ----
    const cityList = [
      "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
      "西安", "苏州", "重庆", "长沙", "天津", "郑州", "厦门", "青岛",
      "大连", "宁波", "合肥", "福州", "济南", "沈阳", "昆明", "贵阳",
      "南昌", "南宁", "哈尔滨", "长春", "石家庄", "太原", "兰州", "海口",
      "珠海", "东莞", "佛山", "中山", "惠州", "无锡", "常州", "南通", "远程",
    ];

    // 猎聘格式: "工作地点：北京-朝阳区"
    const locPat = new RegExp(
      `(?:工作地点|工作地址|地点|base|城市)[：:]*\\s*(${cityList.join("|")})`,
      "i"
    );
    const locMatch = text.match(locPat);
    if (locMatch) {
      hard.location = locMatch[1];
    }

    // ---- 语言要求 ----
    if (/英语|英文|English/i.test(text)) {
      const levelMatch = text.match(/(英语|英文|English)\s*(流利|熟练|良好|精通|六级|八级|CET[- ]?6|CET[- ]?4|雅思|托福)/i);
      hard.language = levelMatch ? `英文(${levelMatch[2] || levelMatch[3]})` : "英文";
    }

    // ---- 技能提取 ----
    const techSkills = extractTechSkills(text);
    skills.directSkills = techSkills.direct;
    skills.generalSkills = techSkills.general;

    // ---- 关键词 ----
    resp.keywords = extractKeywords(text);

    // ---- 职责摘要 ----
    resp.summary = extractLiepinSummary(text);

    // ---- 隐性推断 ----
    if (/急聘|急招|紧急|快速到岗|立即到岗|尽快到岗/.test(text)) {
      inferred.urgency = "急聘";
    } else if (/储备|人才库|长期/.test(text)) {
      inferred.urgency = "储备";
    } else {
      inferred.urgency = "正常";
    }

    // 猎聘有时会标明团队人数
    const teamMatch = text.match(/团队[规模人数]*[：:]*\s*(\d+[-–—~至]*\d*)\s*人/);
    if (teamMatch) {
      const num = parseInt(teamMatch[1]);
      inferred.teamSizeGuess = num < 10 ? "小团队" : num < 50 ? "中等" : "大型";
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

// ---- 复用 BOSS parser 的辅助函数 ----
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

function extractTechSkills(text: string): { direct: string[]; general: string[] } {
  const direct = new Set<string>();
  const general = new Set<string>();

  const directPatterns: [RegExp, string][] = [
    [/\bPython\b/i, "Python"], [/\bJava\b(?!\s*Script)/i, "Java"],
    [/\bJavaScript\b/i, "JavaScript"], [/\bTypeScript\b/i, "TypeScript"],
    [/\bGo(lang)?\b/i, "Go"], [/\bRust\b/i, "Rust"],
    [/\bC\+\+\b/i, "C++"], [/\bC#\b/i, "C#"],
    [/\bKotlin\b/i, "Kotlin"], [/\bSwift\b/i, "Swift"],
    [/\bScala\b/i, "Scala"],
    [/\bReact\b/i, "React"], [/\bVue\b/i, "Vue"],
    [/\bAngular\b/i, "Angular"], [/\bNext\.?js\b/i, "Next.js"],
    [/\bSpring\s?(Boot|Cloud)?\b/i, "Spring"],
    [/\bDjango\b/i, "Django"], [/\bFlask\b/i, "Flask"],
    [/\bFastAPI\b/i, "FastAPI"], [/\bExpress\b/i, "Express"],
    [/\bNestJS\b/i, "NestJS"],
    [/\bTensorFlow\b/i, "TensorFlow"], [/\bPyTorch\b/i, "PyTorch"],
    [/\bFlutter\b/i, "Flutter"], [/\bReact\s?Native\b/i, "React Native"],
    [/\bPostgre(SQL)?\b/i, "PostgreSQL"], [/\bMySQL\b/i, "MySQL"],
    [/\bMongoDB\b/i, "MongoDB"], [/\bRedis\b/i, "Redis"],
    [/\bElasticsearch\b/i, "Elasticsearch"],
    [/\bAWS\b/, "AWS"], [/\bAzure\b/i, "Azure"],
    [/\bGCP\b|Google\s?Cloud\b/i, "GCP"],
    [/\bDocker\b/i, "Docker"], [/\bKubernetes\b|\bK8s\b/i, "Kubernetes"],
    [/\bTerraform\b/i, "Terraform"],
    [/\b大模型\b|大语言模型/, "LLM"], [/\bLLM\b/i, "LLM"],
    [/\bNLP\b|自然语言/, "NLP"], [/\b计算机视觉\b/i, "Computer Vision"],
    [/\bAndroid\b/i, "Android"], [/\biOS\b/i, "iOS"],
    [/\bHadoop\b/i, "Hadoop"], [/\bSpark\b/i, "Spark"],
    [/\bFlink\b/i, "Flink"], [/\bKafka\b/i, "Kafka"],
    [/\bRabbitMQ\b/i, "RabbitMQ"],
  ];

  const generalPatterns: [RegExp, string][] = [
    [/\bGit\b/i, "Git"], [/\bLinux\b/i, "Linux"],
    [/\bREST\s?(ful)?\s?API\b/i, "REST API"], [/\bGraphQL\b/i, "GraphQL"],
    [/\b微服务\b|Microservice/i, "Microservices"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\b敏捷\b|Scrum|Agile/i, "Agile"],
    [/\bJira\b/i, "Jira"], [/\bFigma\b/i, "Figma"],
  ];

  for (const [pat, name] of directPatterns) {
    if (pat.test(text)) direct.add(name);
  }
  for (const [pat, name] of generalPatterns) {
    if (pat.test(text)) general.add(name);
  }

  for (const g of general) {
    if (direct.has(g)) general.delete(g);
  }

  return { direct: Array.from(direct), general: Array.from(general) };
}

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

function extractLiepinSummary(text: string): string | null {
  const patterns = [
    /职位描述[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利|工作地点)/i,
    /岗位职责[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利|工作地点)/i,
    /工作职责[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利|工作地点)/i,
    /职位信息[：:]*\s*([\s\S]*?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利|工作地点)/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[1].trim().length > 10) {
      return m[1].trim().replace(/\s+/g, " ").slice(0, 300);
    }
  }
  return null;
}

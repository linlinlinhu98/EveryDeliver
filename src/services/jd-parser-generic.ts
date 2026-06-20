// ============================================
// 通用 JD 规则解析器 — 兜底方案 (Phase 2.4)
// 不依赖特定平台 DOM 结构，纯文本规则匹配
// ============================================
import type { RuleParser, JDParseResult } from "./jd-parser-types";

export const genericParser: RuleParser = {
  name: "Generic JD Parser",
  platform: "generic",
  fieldCoverage: ["education", "experienceYears", "salary", "location", "skills", "keywords"],

  canHandle(_rawText: string, _rawHtml?: string): boolean {
    // 通用解析器始终可用
    return true;
  },

  parse(rawText: string, rawHtml?: string): Partial<JDParseResult> {
    const text = (rawHtml ? stripHtml(rawHtml) + "\n" + rawText : rawText);

    return {
      hardRequirements: {
        education: extractEducation(text),
        experienceYears: extractExperience(text),
        salaryMin: null,
        salaryMax: null,
        location: extractLocation(text),
        language: extractLanguage(text),
      },
      skills: extractSkills(text),
      responsibilities: {
        summary: extractSummary(text),
        keywords: extractKeywords(text),
      },
      inferred: {
        teamSizeGuess: null,
        techTrend: null,
        urgency: extractUrgency(text),
      },
    };
  },
};

// ============================================
// General helpers
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

function extractEducation(text: string): string | null {
  const patterns: [RegExp, string][] = [
    [/\b(博士|Ph\.?D)\b/i, "博士"],
    [/\b(硕士|研究生|Master)\b/i, "硕士"],
    [/\b(本科|Bachelor|大学本科|全日制本科|统招本科)\b/i, "本科"],
    [/\b(大专|专科|Associate)\b/i, "大专"],
    [/\b(学历不限|不限学历)\b/i, "不限"],
  ];

  for (const [pat, label] of patterns) {
    if (pat.test(text)) return label;
  }
  return null;
}

function extractExperience(text: string): string | null {
  const patterns: [RegExp, string][] = [
    [/\b(应届|[在待]校|经验不限|无需经验|毕业生|校招|Fresh\s*grad)\b/i, "0-1"],
    [/\b(1-3\s*年|一到三年|1\s*年\s*以\s*上)/i, "1-3"],
    [/\b(3-5\s*年|三到五年|3\s*年\s*以\s*上)/i, "3-5"],
    [/\b(5-10\s*年|五到十年|5\s*年\s*以\s*上)/i, "5-10"],
    [/\b(10\s*年\s*以\s*上|十年以上)\b/i, "10+"],
  ];

  for (const [pat, label] of patterns) {
    if (pat.test(text)) return label;
  }
  return null;
}

const CITY_LIST = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
  "西安", "苏州", "重庆", "长沙", "天津", "郑州", "厦门", "青岛",
  "大连", "宁波", "合肥", "福州", "济南", "沈阳", "昆明", "贵阳",
  "南昌", "南宁", "哈尔滨", "长春", "石家庄", "太原", "兰州", "海口",
  "珠海", "东莞", "佛山", "中山", "惠州", "无锡", "常州", "南通", "远程",
];

function extractLocation(text: string): string | null {
  // 尝试: "地点：北京"
  const locPatterns = [
    new RegExp(`(?:工作地点|地点|base|城市|地址|工作城市)[：:]*\\s*(${CITY_LIST.join("|")})`, "i"),
    new RegExp(`(${CITY_LIST.join("|")})[·•\\s]*[区县市]`, "i"),
  ];

  for (const pat of locPatterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }

  // 尝试匹配前 200 字符中的城市名
  const head = text.slice(0, 200);
  for (const city of CITY_LIST) {
    if (head.includes(city)) return city;
  }

  return null;
}

function extractLanguage(text: string): string | null {
  if (/英语|英文|English/i.test(text)) {
    if (/流利|熟练|精通|母语|Native/i.test(text)) return "英文(精通)";
    if (/良好|六级|CET[- ]?6|雅思|托福|TEM[- ]?8/i.test(text)) return "英文(良好)";
    if (/四级|CET[- ]?4|基本|读写/i.test(text)) return "英文(基础)";
    return "英文";
  }
  if (/日语|日文|Japanese/i.test(text)) return "日文";
  if (/韩语|韩文|Korean/i.test(text)) return "韩文";
  return null;
}

function extractSkills(text: string): { directSkills: string[]; generalSkills: string[] } {
  const direct = new Set<string>();
  const general = new Set<string>();

  const directSkills: [RegExp, string][] = [
    [/\bPython\b/i, "Python"], [/\bJava\b(?!\s*Script)/i, "Java"],
    [/\bJavaScript\b/i, "JavaScript"], [/\bTypeScript\b/i, "TypeScript"],
    [/\bGo(lang)?\b/i, "Go"], [/\bRust\b/i, "Rust"],
    [/\bC\+\+\b/i, "C++"], [/\bC#\b/i, "C#"],
    [/\bKotlin\b/i, "Kotlin"], [/\bSwift\b/i, "Swift"],
    [/\bRuby\b/i, "Ruby"], [/\bPHP\b/i, "PHP"],
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
    [/\bHadoop\b/i, "Hadoop"], [/\bSpark\b/i, "Spark"],
    [/\bFlink\b/i, "Flink"], [/\bKafka\b/i, "Kafka"],
    [/\bRabbitMQ\b/i, "RabbitMQ"],
    [/\b大模型\b|大语言模型/, "LLM"], [/\bLLM\b/i, "LLM"],
    [/\bNLP\b|自然语言/, "NLP"],
    [/\bAndroid\b/i, "Android"], [/\biOS\b/i, "iOS"],
  ];

  const generalSkills: [RegExp, string][] = [
    [/\bGit\b/i, "Git"], [/\bLinux\b/i, "Linux"],
    [/\bREST\s?(ful)?\s?API\b/i, "REST API"], [/\bGraphQL\b/i, "GraphQL"],
    [/\b微服务\b|Microservice/i, "Microservices"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\b敏捷\b|Scrum|Agile/i, "Agile"],
    [/\bJira\b/i, "Jira"], [/\bFigma\b/i, "Figma"],
    [/\b单元测试\b|Unit\s?Test/i, "Unit Testing"],
    [/\bJenkins\b/i, "Jenkins"],
  ];

  for (const [pat, name] of directSkills) {
    if (pat.test(text)) direct.add(name);
  }
  for (const [pat, name] of generalSkills) {
    if (pat.test(text)) general.add(name);
  }
  for (const g of general) {
    if (direct.has(g)) general.delete(g);
  }

  return { directSkills: Array.from(direct), generalSkills: Array.from(general) };
}

function extractKeywords(text: string): string[] {
  const kw = new Set<string>();
  const patterns = [
    /负责|主导|参与|协助|搭建|设计|开发|维护|优化|重构|制定|管理|推动|协调/g,
    /高并发|高可用|分布式|微服务|性能优化|架构设计/g,
    /数据驱动|用户增长|产品设计|项目管理|团队管理/g,
    /SQL|NoSQL|ETL|数据分析|数据挖掘|机器学习/g,
    /前端|后端|全栈|客户端|移动端|服务端/g,
    /上线|部署|运维|监控|告警|CI\/CD/g,
    /需求分析|方案设计|代码评审|技术分享|文档撰写/g,
    /沟通|协调|合作|跨部门|汇报|述职/g,
  ];

  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      kw.add(m[0]);
    }
  }
  return Array.from(kw).slice(0, 15);
}

function extractSummary(text: string): string | null {
  const patterns = [
    /(?:岗位职责|工作职责|职位描述|工作内容|Job\s*Description)[：:]*\s*([\s\S]{30,500}?)(?:任职|岗位要求|职位要求|技能要求|我们|薪资|福利|工作地点|要求|Qualifications|Requirements)/i,
    /(?:About\s*the\s*role|What\s*you('ll|.*will)\s*do)[：:]*\s*([\s\S]{30,500}?)(?:What|Require|Qualif|You|We)/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[1].trim().length > 10) {
      return m[1].trim().replace(/\s+/g, " ").slice(0, 300);
    }
  }

  // Fallback: 取前 300 字符作为简短描述
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 30 ? cleaned.slice(0, 300) : null;
}

function extractUrgency(text: string): string | null {
  if (/急聘|急招|紧急|快速到岗|立即到岗|尽快到岗|Immediate|Urgent/i.test(text)) {
    return "急聘";
  }
  if (/储备|人才库|长期|Future|Pipeline/i.test(text)) {
    return "储备";
  }
  return "正常";
}

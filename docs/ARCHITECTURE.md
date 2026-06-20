# 技术架构与数据模型（EveryDeliver）

> 版本：MVP v1.0 | 日期：2026-06-20

---

## 目录

1. [系统架构总览](#系统架构总览)
2. [数据模型](#数据模型)
3. [API 设计](#api-设计)
4. [安全架构](#安全架构)
5. [多端通信](#多端通信)

---

## 系统架构总览

```
┌────────────────────────────────────────────────────────────────┐
│                        客户端层                                  │
├──────────────┬──────────────────┬───────────────────────────────┤
│  桌面端       │  浏览器插件        │  微信小程序                    │
│  (Tauri)     │  (MV3)           │  (微信)                       │
│  Rust+前端   │  JS+ContentScript│  原生+WebView                 │
│              │                  │                              │
│  完整功能 ★   │  JD抓取+表单填充   │  查看+记录+下载                │
│  独享编辑权   │  只读+同步        │  只读+同步                     │
└──────┬───────┴────────┬─────────┴──────────┬────────────────────┘
       │                │                    │
       └────────────────┼────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                      Supabase 后端层                             │
├─────────────────────────────────────────────────────────────────┤
│  Auth (认证)    │  Postgres (数据库)  │  Storage (文件)           │
│  RLS (权限)     │  Realtime (实时)    │  Edge Functions (计算)     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                      AI 代理层                                   │
├─────────────────────────────────────────────────────────────────┤
│  Edge Function (LLM Proxy)                                     │
│  ├── 接收请求 → 路由模型 → 调用 API → 返回结果                     │
│  ├── 敏感字段过滤（不送 LLM）                                     │
│  └── 成本追踪 + 限流                                             │
│                                                                 │
│  模型池：                                                        │
│  ├── DeepSeek-V3  → JD解析 / 匹配评估 / 改动说明                   │
│  ├── Qwen-Plus    → 简历优化 / 面试建议                            │
│  └── Qwen-Max     → 面试题生成                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据模型

### 核心实体关系

```
User (1) ─────────────< Resume (N)
  │                        │
  │                        ├── ResumeVersion (N)
  │                        │     └── ModuleInstance (N) ────< ModuleTemplate (N)
  │                        │           └── 属于 ModuleType (1)
  │                        │
  │                        └── ResumeSnapshot (N) — 投递时冻结
  │
  ├── Preference (1) — 白名单/黑名单
  │
  ├── JobPosition (N) — 导入的 JD
  │     └── JDParseResult (1) — 解析结果
  │     └── JDParseSnapshot (N) — 旧快照
  │
  └── Application (N) — 投递记录
        ├── 关联 ResumeSnapshot
        ├── 关联 JobPosition
        └── ApplicationStatusHistory (N)

InterviewPrepItem (N) — 面试准备清单
  ├── 关联 Application
  └── 关联 JobPosition
```

### 表结构

#### users（Supabase Auth 扩展）

```sql
CREATE TABLE public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name      VARCHAR(100),
  avatar_url        TEXT,
  phone_encrypted   TEXT,              -- 加密存储
  email_verified    BOOLEAN DEFAULT FALSE,
  training_opt_in   BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### resumes

```sql
CREATE TABLE resumes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  title             VARCHAR(200),      -- 用户命名的简历名
  file_path         TEXT,              -- 原始文件 S3 key
  file_type         VARCHAR(20),       -- pdf/word/text
  is_primary        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### resume_versions

```sql
CREATE TABLE resume_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id         UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  full_content      TEXT,              -- 完整简历 Markdown
  change_summary    TEXT,              -- 改动摘要
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resume_id, version_number)
);
```

#### module_types

```sql
CREATE TABLE module_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(30) UNIQUE NOT NULL, -- education/internship/project/skill/certification/award/language/summary
  display_name      VARCHAR(50) NOT NULL,
  sort_order        INT DEFAULT 0
);
```

#### module_templates

```sql
CREATE TABLE module_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  module_type_id    UUID NOT NULL REFERENCES module_types(id),
  title             VARCHAR(200),
  content           TEXT NOT NULL,      -- Markdown
  tags              TEXT[],
  quality_score     FLOAT DEFAULT 1.0,
  quality_flags     TEXT[],            -- stale/brief/no_metrics/no_tags/time_conflict
  version           INT DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### resume_module_instances

```sql
CREATE TABLE resume_module_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id UUID NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  module_template_id UUID NOT NULL REFERENCES module_templates(id),
  override_content  TEXT,              -- 针对本简历的定制内容
  sort_order        INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### resume_snapshots

```sql
CREATE TABLE resume_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id UUID NOT NULL REFERENCES resume_versions(id),
  frozen_content    TEXT NOT NULL,
  frozen_at         TIMESTAMPTZ DEFAULT NOW()
);
```

#### preferences

```sql
CREATE TABLE preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  -- 白名单
  company_keywords  TEXT[],            -- 公司关键词
  industries        TEXT[],            -- 意向行业
  min_company_size  INT,               -- 企业规模下限
  min_monthly_salary INT,              -- 最低月薪
  target_cities     TEXT[],            -- 意向城市
  -- 黑名单
  blacklist_companies TEXT[],          -- 禁止投递的公司
  blacklist_tags    TEXT[],            -- 禁止标签（外包/大小周/单休等）
  -- 自动检测配置
  auto_detect_mode  VARCHAR(20) DEFAULT 'prompt',  -- prompt/auto_all/mark_only
  auto_join_threshold INT DEFAULT 3,   -- 置信度阈值（信号数）
  industry_warnings BOOLEAN DEFAULT TRUE, -- 行业默认警告开关
  -- 元数据
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### job_positions

```sql
CREATE TABLE job_positions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  company_name      VARCHAR(200) NOT NULL,
  title             VARCHAR(300) NOT NULL,
  standardized_title VARCHAR(300),     -- 标准化岗位名
  jd_raw_text       TEXT,              -- 原始 JD 文本
  source_url        TEXT,
  source_platform   VARCHAR(50),       -- boss/liepin/wechat/official/generic
  salary_min        INT,
  salary_max        INT,
  city              VARCHAR(100),
  duplicate_key     VARCHAR(500),      -- 公司名+标准化岗位名 hash
  import_source     VARCHAR(20),       -- manual/plugin
  import_status     VARCHAR(20) DEFAULT 'draft', -- draft/complete/needs_review
  quality_score     FLOAT,             -- 入库质检评分 0-1
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, duplicate_key)
);
```

#### jd_parse_results

```sql
CREATE TABLE jd_parse_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id   UUID NOT NULL UNIQUE REFERENCES job_positions(id) ON DELETE CASCADE,
  -- Layer 1: 硬性要求
  education         VARCHAR(50),       -- bachelor/master/phd/any
  experience_years  VARCHAR(20),       -- 0-1/1-3/3-5/5-10/10+
  salary_range      INT[],             -- [min, max]
  location          VARCHAR(100),
  language          VARCHAR(50),       -- chinese/english/any
  -- Layer 2: 技能
  direct_skills     TEXT[],            -- 直接相关技能（权重 ×2.0）
  general_skills    TEXT[],            -- 通用技能（权重 ×0.5）
  -- Layer 3: 职责
  responsibility_summary TEXT,
  keywords          TEXT[],
  -- Layer 4: 隐性推断
  team_size_guess   VARCHAR(20),
  tech_trend        TEXT,
  urgency           VARCHAR(20),       -- normal/urgent/immediate
  -- 元数据
  confidence        FLOAT,             -- 0-1 总体置信度
  parse_method      VARCHAR(20),       -- rule/llm/hybrid
  parse_version     INT DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### jd_parse_snapshots

```sql
CREATE TABLE jd_parse_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id   UUID NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  parse_result_json JSONB NOT NULL,
  snapshot_reason   VARCHAR(50),       -- update/expire/user_request
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### applications

```sql
CREATE TABLE applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  job_position_id   UUID NOT NULL REFERENCES job_positions(id),
  resume_snapshot_id UUID REFERENCES resume_snapshots(id),
  status            VARCHAR(30) DEFAULT 'pending',  -- 7 个标准状态
  applied_at        TIMESTAMPTZ,
  reminder_at       TIMESTAMPTZ,       -- 下次提醒日期
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### application_status_history

```sql
CREATE TABLE application_status_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status       VARCHAR(30),
  to_status         VARCHAR(30) NOT NULL,
  changed_by        VARCHAR(20) DEFAULT 'user',    -- user/system/email_parse
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### interview_prep_items

```sql
CREATE TABLE interview_prep_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth_users(id),
  application_id    UUID REFERENCES applications(id),
  job_position_id   UUID REFERENCES job_positions(id),
  title             VARCHAR(255) NOT NULL,
  category          VARCHAR(20) NOT NULL,  -- technical/behavioral/spirit/company
  content           TEXT,                  -- Markdown 笔记
  source            VARCHAR(20) DEFAULT 'ai_generated', -- ai_generated/manual/linked_from_jd
  status            VARCHAR(20) DEFAULT 'pending',      -- pending/in_progress/completed
  priority          INT DEFAULT 3,         -- 1-5
  due_date          DATE,
  estimated_minutes INT,
  tags              TEXT[],
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  notes             TEXT
);
```

#### duplicate_keys（防重复，独立于可删除的投递记录）

```sql
CREATE TABLE duplicate_keys (
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  duplicate_key     VARCHAR(500) NOT NULL,
  first_applied_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, duplicate_key)
);
```

---

## API 设计

### 桌面端 → Supabase（直接连接）

桌面端通过 Supabase SDK 直连数据库（经 RLS）：

```
supabase.from('resumes').select('*').eq('user_id', userId)
supabase.from('applications').insert({...})
```

### 浏览器插件 → Supabase（直接连接）

插件通过 Supabase JS SDK 连接（使用用户登录 token）：

```
// 抓取职位入库
supabase.from('job_positions').insert({
  company_name: parsed.company,
  title: parsed.title,
  jd_raw_text: parsed.jdText,
  source_url: window.location.href,
  source_platform: 'boss',
  import_source: 'plugin',
  import_status: needs_review ? 'needs_review' : 'complete',
  quality_score: qualityCheck(parsed)
})
```

### 微信小程序 → Supabase

小程序通过 Supabase 后端 API 连接，受限功能集。

### Edge Functions（AI 代理）

```
POST /functions/v1/parse-jd
  → 规则解析
  → (如需要) DeepSeek-V3 LLM
  → 返回 JDParseResult

POST /functions/v1/match-resume
  → DeepSeek-V3
  → 返回匹配度 + 缺失技能

POST /functions/v1/optimize-resume
  → Qwen-Plus
  → 返回修改版简历 + 改动列表(含三色标记)

POST /functions/v1/generate-interview-questions
  → Qwen-Max
  → 返回面试题列表
```

---

## 安全架构

### 隐私分级

```
Level 1 — 本地加密（永不上传）
├── 完整手机号
├── 身份证号
├── 籍贯（精确到区县）
└── 出生年月（精确到日）

Level 2 — 加密上传（可存储，不解密送 LLM）
├── 姓名
├── 邮箱
├── 手机号（脱敏后 138****1234）
└── 教育经历中学校全名

Level 3 — 可送 LLM（脱敏后）
├── 技能列表
├── 项目经历（公司名脱敏）
├── 工作年限
└── 学历层次（本科/硕士）
```

### Row Level Security (RLS)

```sql
-- 所有用户数据表强制 RLS
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own resumes" ON resumes
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE job_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own job positions" ON job_positions
  FOR ALL USING (auth.uid() = user_id);

-- 所有表同理：profiles / preferences / applications / module_templates / interview_prep_items
```

### LLM 代理安全

```
请求 → Edge Function
         ├── 1. 验证 JWT（用户身份）
         ├── 2. 过滤敏感字段（Level 1/2 内容剔除）
         ├── 3. 调用 LLM API（Key 仅服务端持有）
         └── 4. 记录用量（成本追踪 + 限流）
```

---

## 多端通信

### 编辑锁机制

```
桌面端打开编辑
    ↓
设置编辑锁：{resume_id, user_id, device_id, expires_at: NOW()+5min}
    ↓
其他端请求编辑 → 检查锁 → 存在且未过期 → 返回"桌面端编辑中"
    ↓
桌面端持续操作 → 每 2 分钟自动续锁
    ↓
桌面端关闭/保存 → 释放锁
    ↓
锁过期（网络断开 5 分钟）→ 自动释放 → 其他端可获取
```

### 同步策略

```
首次登录：全量拉取
后续：Realtime 订阅增量变更
       ├── resumes 变更 → 更新简历列表
       ├── applications 变更 → 更新看板
       └── job_positions 变更 → 更新职位列表

冲突处理：LWW + 冲突标记（#conflict 标签在 notes 字段）
```

### 状态同步（浏览器插件）

```
用户进入 BOSS 直聘"已投递"页面
    ↓
插件检测到投递状态变化
    ↓
对比本地记录 → 发现差异
    ↓
弹窗："检测到 3 条状态变更，是否同步？"
    ↓
用户确认 → 更新 applications 表
```

---

## 关键流程图

### 核心用户流程

```
首次使用
  ├── 注册/登录（Supabase Auth）
  ├── 上传简历 OR Agent 辅助填写
  ├── 设置偏好（白名单/黑名单/城市/薪资）
  └── 安装浏览器插件

日常使用
  ├── 浏览招聘网站 → 插件抓取 JD → 入库
  ├── OR 手动粘贴 JD → 入库
  ├── 系统自动三层过滤
  ├── 查看职位表格 → 勾选感兴趣
  ├── 查看匹配度 → AI 优化简历
  ├── 确认修改 → 生成投递版简历
  ├── 跳转平台 → 手动投递
  └── 看板追踪 → 收到面试邀请 → 准备清单
```

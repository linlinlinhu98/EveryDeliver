# EveryDeliver — 小浣熊全链路开发提示词策略

> 面向 OPC 能力挑战赛：**以办公小浣熊桌面版为主、代码小浣熊 VSCode 插件为辅**
> 核心理念：OPC = One Person Capability（一个人 + 一个工具 = 一支团队）

---

## 0. 为什么以办公小浣熊为主？

办公小浣熊桌面版本身就是**"数据分析 + 文档处理 + 代码生成 + 浏览器自动化 + PPT 制作"的融合体**，它的智能体工作流是：

```
Plan（规划）→ Analysis（分析）→ Write（创作输出，含代码文件）
```

本项目需要产出的三样东西——**代码、PPT、项目简介**——办公小浣熊都能做。对 OPC 比赛来说，叙事极其简洁：

> **"我一个人 + 办公小浣熊，完成了从需求分析、架构设计、代码生成、PPT 答辩到竞品调研的全链路闭环。"**

代码小浣熊只负责两个环节：**跨文件重构调试** 和 **Git 提交**。

---

## 0.1 开局宣言（每轮对话）

```
我是[你的名字]，正在参加商汤小浣熊 OPC 能力挑战赛。

我现在使用的是办公小浣熊桌面版，它具备：
• 本地文件直接处理 — 授权 d:/ALLPrograming/OPC/ 目录后直接读写项目文件
• 代码生成 — 内置代码模型，能生成 Tauri/React/TypeScript/SQL 等代码
• 截图生成代码 — 截 UI 图 → 一句话生成前端页面
• 数据分析 — 上传 CSV/Excel 自动分析、可视化
• PPT 生成 — 直接导出 .pptx
• 一图读懂 — 小红书风格信息图
• 浏览器自动化 — 竞品调研、技术文档搜索
• 定时任务 — 周期性自动执行

我的项目是"EveryDeliver"求职投递辅助平台，设计文档在本地的 docs/ 目录下。
请先读取 docs/DESIGN.md 和 docs/ARCHITECTURE.md 理解完整设计，然后开始。

本次使用办公小浣熊为主、代码小浣熊 VSCode 插件为辅：
- 办公小浣熊负责全部代码生成 + PPT + 项目简介 + 数据分析
- 代码小浣熊仅辅助跨文件重构、调试和 Git 提交
```

---

## 1. 总体策略：办公小浣熊一骑打天下

```
                    🧑 你（唯一决策者）
                         │
        ┌────────────────┤
        ▼                ▼
┌─────────────────┐  ┌─────────────────────┐
│  办公小浣熊桌面版  │  │ 代码小浣熊 VSCode 插件  │
│  ★ 主力（90%）   │  │ ☆ 辅助（10%）         │
├─────────────────┤  ├─────────────────────┤
│ ✅ 需求分析+架构  │  │ 🔧 跨文件重构         │
│ ✅ 全部代码生成   │  │ 🐛 断点调试           │
│ ✅ 截图→前端页面  │  │ 📦 Git 提交           │
│ ✅ PPT+信息图    │  │ 🧪 单元测试生成        │
│ ✅ 项目简介      │  │                      │
│ ✅ 竞品调研      │  └─────────────────────┘
│ ✅ 数据分析      │
│ ✅ 飞书文档导出   │
└─────────────────┘
```

### 每一 Phase 的标准流程

```
Step 1: 办公小浣熊 — 读取设计文档 → 规划 → 生成代码 → 写入本地文件
Step 2: 办公小浣熊 — 自检代码质量（如发现问题则自我修正）
Step 3: 代码小浣熊（仅在需要时）— 跨文件一致性检查 → git commit
Step 4: 办公小浣熊 — 更新 PPT 内容（每完成一个 Phase）
Step 5: git push
```

---

## 2. 办公小浣熊提示词库（分 Phase，可直接复制）

### Phase 0：基础设施搭建

```
【角色设定与任务】

你是我的 AI 开发合伙人。我正在构建"EveryDeliver"求职投递辅助平台，
参加商汤小浣熊 OPC 能力挑战赛。

【设计文档】
请先读取以下文件理解完整设计：
- d:/ALLPrograming/OPC/docs/DESIGN.md
- d:/ALLPrograming/OPC/docs/ARCHITECTURE.md

【Phase 0 任务：搭建三端骨架 + 数据库 + 认证】

任务 1 — 初始化 Tauri v2 桌面应用
- 在 d:/ALLPrograming/OPC/ 目录下创建 Tauri v2 + React + TypeScript 项目
- 项目名：everydeliver
- 窗口标题：EveryDeliver
- 窗口默认大小：1200×800
- 使用 create-tauri-app 或手动创建项目结构

任务 2 — Supabase 数据库迁移
- 在 d:/ALLPrograming/OPC/supabase/migrations/ 创建 SQL 迁移文件
- 包含以下所有表（参考 ARCHITECTURE.md 中的完整表结构）：
  • profiles — 用户信息
  • resumes — 简历主表
  • resume_versions — 简历版本
  • module_types — 模块类型（预填8类：education/internship/project/skill/
    certification/award/language/summary）
  • module_templates — 模块模板
  • resume_module_instances — 简历-模块关联
  • resume_snapshots — 投递快照
  • preferences — 求职偏好
  • job_positions — 职位信息
  • jd_parse_results — JD解析结果
  • jd_parse_snapshots — JD解析快照
  • applications — 投递记录
  • application_status_history — 状态变更历史
  • interview_prep_items — 面试准备清单
  • duplicate_keys — 防重复键
- 所有表启用 RLS：ALTER TABLE ... ENABLE ROW LEVEL SECURITY
- 所有表创建策略：CREATE POLICY ... USING (auth.uid() = user_id)
- 预填 module_types 的 8 条数据

任务 3 — 浏览器插件骨架
- 在 d:/ALLPrograming/OPC/plugin/ 创建 Manifest V3 项目
- manifest.json：声明 content_scripts、storage 权限
- content-script.ts：页面 DOM 监听入口
- popup.html + popup.ts：弹出面板

任务 4 — 桌面端 Supabase Auth 登录注册
- 安装 Supabase JS SDK
- 登录页面组件（邮箱+密码登录 + 注册）
- 注册成功后自动在 profiles 表创建记录
- 登录成功跳转到主页面
- 前端路由：/login → /dashboard

【代码规范】
- TypeScript 严格模式
- 每个函数 JSDoc 注释
- 完整错误处理
- React Hooks 写法

【输出方式】
请直接创建/修改 d:/ALLPrograming/OPC/ 目录下的文件。
每一步完成后告诉我创建了哪些文件、关键代码做了什么。
所有文件创建完毕后，请自己检查一遍有没有遗漏。
```

---

### Phase 1：用户画像与简历

```
【Phase 1 任务：用户画像与简历】

请先读取当前项目代码和 docs/DESIGN.md 模块 A 的设计。

任务 1 — PDF/Word 简历上传与解析
- 桌面端：拖拽上传组件（react-dropzone）
- 支持 .pdf / .docx / .txt
- 上传到 Supabase Storage（bucket: resumes）
- Supabase Edge Function 解析文档内容为纯文本
- 解析结果写入 resumes + resume_versions 表

任务 2 — Agent 对话式简历填写
- 对话 UI 组件（聊天气泡样式）
- AI 逐步引导用户填写：教育背景 → 技能 → 项目经历 → 实习 → 获奖
- 调用后端 LLM 代理 Edge Function（先创建 Edge Function 骨架）
- 填写完成后结构化存储到模块对应的表中

任务 3 — 隐私字段三级分级保护
- Level 1（手机号/身份证号/籍贯/生日）：本地 AES 加密，永不上传
  实现：前端 crypto-js AES 加密工具类
- Level 2（姓名/邮箱/脱敏手机号）：加密上传 Supabase，不送 LLM
- Level 3（技能/项目/年限/学历）：明文存储，可送 LLM
- 在 LLM 代理 Edge Function 中实现敏感字段过滤

任务 4 — 求职偏好设置页面
- 白名单表单：
  • 公司关键词（标签输入，支持多个）
  • 行业类型（多选下拉：互联网/金融/教育/医疗/制造/...）
  • 企业规模下限（下拉：不限/20人/50人/100人/500人/1000人+）
  • 最低月薪（滑块，范围 3K-50K）
  • 意向城市（多选+搜索）
- 黑名单表单：
  • 禁止公司（标签输入）
  • 禁止标签（多选：外包/大小周/单休/996/驻场/派遣/试用期长/...）
- 自动检测配置面板：
  • 检测模式（仅标记/弹窗询问/高置信度直接加入）
  • 置信度阈值（1/2/3 个信号）
  • 行业默认警告开关

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 2：JD Parser（核心模块）

```
【Phase 2 任务：JD Parser】

请先读取 docs/DESIGN.md 模块 G 和 docs/ARCHITECTURE.md 中 JD 相关表结构。

任务 1 — JD 数据模型检查
- 确认 job_positions / jd_parse_results / jd_parse_snapshots 表已创建
- 如未创建，补充迁移 SQL

任务 2 — BOSS 直聘规则解析器
- 创建 src/parser/boss-parser.ts
- 基于 BOSS 直聘 JD 文本特征编写规则：
  • 薪资格式"15K-25K"→ 提取 min/max
  • 地点关键词匹配（城市名正则）
  • 学历关键词（本科/硕士/博士/不限）
  • 经验年限（"3-5年""应届""不限"）
  • 公司名（通常在标题开头或固定位置）
- 每个字段返回 {value, confidence: 0-1}
- 编写至少 5 个测试用例（用真实 BOSS JD 样本）

任务 3 — 猎聘规则解析器
- 创建 src/parser/liepin-parser.ts
- 适配猎聘 JD 格式（薪资格式与 BOSS 不同）
- 同上每个字段返回置信度

任务 4 — LLM 解析 Edge Function
- 创建 supabase/functions/parse-jd/index.ts
- 接收 JD 原始文本 → 调用 DeepSeek-V3 → 返回结构化 JSON
- 输出格式对齐 JDParseResult 数据结构
- 触发条件：规则置信度 < 0.7 或 必填字段缺失 或 JD极端短(<50字)/长(>5000字)
- 超时 15 秒，错误时返回降级结果

任务 5 — 三层解析编排器
- 创建 src/parser/orchestrator.ts
- 流程：规则解析 → 置信度检查 → (不足降级) LLM解析 → 合并结果
- 缓存层：同一 source_url hash → 跳过解析直接返回缓存
- 置信度加权合并（规则×0.6 + LLM×0.4）

任务 6 — 技能词表
- 创建 src/data/skill-vocabulary.json
- 直接相关技能（权重×2.0）：编程语言/框架/数据库/云平台/工具等
- 通用技能（权重×0.5）：沟通/团队合作/文档编写/项目管理等
- 正则 + 词表匹配提取函数

任务 7 — JD 生命周期管理
- 导入时 status = 'active'
- 定时检查（30 天未更新 → 'expiring_soon'）
- 重抓发现停招 → 'expired' + 通知用户
- 重抓内容变化 → 更新 jd_parse_results + 旧结果存 jd_parse_snapshots

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 3：职位获取与过滤

```
【Phase 3 任务：职位获取与过滤】

请先读取 docs/DESIGN.md 模块 B。

任务 1 — 手动职位导入 UI
- 表单页面组件 src/pages/ImportJob.tsx
- 字段：公司名/岗位标题/JD文本(multiline,必填)/来源URL/来源平台(下拉:boss/liepin/wechat/official/generic)
- 粘贴 JD 后实时调用 JD Parser 预览解析结果
- 提交按钮 → 写入 job_positions 表 → 跳转到职位列表

任务 2 — 浏览器插件 BOSS 直聘抓取
- plugin/content-script.ts 增加 BOSS 直聘适配
- URL 匹配：*.zhipin.com/job_detail/*
- DOM 选择器提取：公司名/标题/JD文本/薪资/地点
- 消息通知 popup：显示抓取结果预览
- popup.ts "导入"按钮 → 调用 Supabase REST API 写入
- 写入前先在 popup 做客户端质检

任务 3 — 浏览器插件猎聘抓取
- 同上适配猎聘 URL：*.liepin.com/job/*
- 适配猎聘 DOM 结构

任务 4 — 浏览器插件合规告知
- 首次安装时 popup 显示告知弹窗
- 内容参考 DESIGN.md 模块B 的合规弹窗文案
- "我已了解"状态存入 chrome.storage.local
- 每月一次重提示（比较上次确认时间）

任务 5 — 入库质检流程
- 创建 src/services/job-validator.ts
- 必填字段检查：公司名非空 + 标题非空 + JD文本>50字 + URL格式合法
- 格式检查：薪资格式/地点识别到城市/公司名去重
- 完整性评分函数（0-1 输出）
- 分级：≥0.8 直接入库 / 0.5-0.8 入库+标记'needs_review' / <0.5 拒绝入库+提示

任务 6 — 三层过滤引擎
- 创建 src/services/job-filter.ts
- 第1层：黑名单命中？→ 直接丢弃，不入库
- 第2层：duplicate_key 已存在？→ 移入重复列表，提示"已投递过"
- 第3层：薪资低于偏好 or 城市不匹配？→ 入库但标记警告（不删除）

任务 7 — 黑名单自动检测（4种机制）
- 创建 src/services/blacklist-detector.ts
- A. JD关键词匹配（正则引擎，参考 DESIGN.md 模块A 的正则表）
- B. 行业分类警告（7类高风险行业清单匹配）
- C. 历史行为推断（用户拒绝过该公司→自动加入）
- D. 综合置信度计算（≥3信号 高 / 2信号 中 / 1信号 低）
- 检测结果弹窗 UI 组件

任务 8 — 可勾选职位表格
- 创建 src/pages/JobList.tsx
- 列：□勾选 | 标题 | 公司 | 薪资 | 来源 | 匹配度 | 位置 | 操作
- 匹配度颜色编码：绿(>70%)/黄(40-70%)/红(<40%)
- 待补全项橙黄色行背景
- 排序/筛选/多选/批量操作（批量标记/批量忽略/批量导出）
- "去投递"按钮 → 新标签页打开 source_url

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 4：匹配度评估与简历优化

```
【Phase 4 任务：匹配度评估与 AI 优化】

请先读取 docs/DESIGN.md 模块 C。

任务 1 — 匹配度评估引擎
- 创建 src/services/match-engine.ts
- 公式实现：总分 = 硬性(60%) + 软性(30%) + 隐性(10%)
  • 硬性(60%)：学历匹配×0.15 + 经验匹配×0.15 + 技能命中率×0.30
    - 技能命中 = (直接相关命中×2.0 + 通用技能命中×0.5) / (直接相关×2.0 + 通用×0.5)
  • 软性(30%)：LLM 语义相似度评分（调用 DeepSeek-V3）
  • 隐性(10%)：技术栈趋势+职业路径合理性（调用 DeepSeek-V3）
- Edge Function：supabase/functions/match-resume/index.ts
- 输入：user_id + job_position_id → 输出：{totalScore, breakdown, missingSkills, matchedSkills}

任务 2 — 匹配度展示 UI
- 组件 src/components/MatchScore.tsx
- 圆形进度条（百分比 + 颜色编码）
- 技能缺口雷达图（使用 ECharts 或 Chart.js）
- 缺失技能标签列表（红色，点击可查看替代建议）
- 匹配技能标签列表（绿色）

任务 3 — AI 简历优化 Edge Function
- 创建 supabase/functions/optimize-resume/index.ts
- 模型：Qwen-Plus
- 输入：{resumeMarkdown, jdParseResult, mode: 'ask'|'auto'}
- 输出：{
    optimizedMarkdown: string,
    changes: [{position, original, modified, color:'yellow'|'orange'|'red', reason, source?, interviewPrep?}]
  }
- Prompt 模板：让 LLM 按照 5 级风险分类输出改动

任务 4 — 改动风险分级
- 创建 src/services/change-classifier.ts
- 🟢 措辞优化（仅语言表达）→ 自动模式直接应用
- 🟡 侧重点调整（重排段落、调整强调）→ 自动模式直接应用
- 🟠 GitHub 化用（引用外部项目描述模板）→ 弹轻提示
- 🔴 新增关键词（JD要求但简历没有的技能）→ 弹窗确认
- 🔴 新增经历（添加不存在的项目/经验）→ 弹窗+强制确认

任务 5 — 改动高亮渲染
- 组件 src/components/ChangeHighlight.tsx
- 黄色背景：已有内容改写
- 橙色背景：外部参考内容
- 红色背景：新增内容
- 每处改动可点击展开：原因说明 + 参考来源链接 + 面试准备建议

任务 6 — 双模式系统
- 组件 src/components/OptimizationPanel.tsx
- 模式切换按钮（询问模式 / 自动模式）
- 询问模式：逐处弹窗确认（显示原文→新文→颜色→原因）
- 自动模式：🟢🟡直接应用，🟠轻提示，🔴弹窗
- AI 建议切换提示："当前已连续确认10处改动，是否切换到自动模式？"

任务 7 — GitHub 项目化用
- Edge Function：supabase/functions/github-project-search/index.ts
- 输入：JD 技能关键词 → GitHub Search API → 找高分项目
- 提取 README 描述 + 技术栈
- 生成"简历化"描述模板
- 标注来源：GitHub URL + Star 数
- 自动生成面试深挖问题（"这个项目你负责什么？""遇到什么难点？"）

任务 8 — 低匹配度提示
- 当匹配度 < 40% 时触发
- 弹出三选项：
  [💡 帮我提出更多优化建议]
  [⏹️ 就这样，不再继续改动]
  [🚪 考虑放弃该岗位]

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 5：简历库与模块化

```
【Phase 5 任务：简历模块化】

请先读取 docs/DESIGN.md 模块 F。

任务 1 — 简历自动拆解引擎
- 创建 src/services/resume-splitter.ts
- 输入：完整简历 Markdown
- 按标题关键词拆分为 8 类模块：
  • "教育背景/学历/Education" → education
  • "实习经历/Internship" → internship
  • "项目经历/Project" → project
  • "技能/证书/Skills" → skill
  • "资质/资格/Certification" → certification
  • "获奖/荣誉/Award" → award
  • "语言/Language" → language
  • "总结/自我介绍/Summary" → summary
- 无法匹配的段落 → 调用 DeepSeek-V3 辅助分类
- 每段存入 module_templates 表

任务 2 — 模块库管理 UI
- 页面 src/pages/ModuleLibrary.tsx
- 左侧：8 类分类树（每类显示模块数量）
- 右侧：该类下模块卡片列表
- 卡片内容：标题/标签/时间/质量评分/操作(编辑/复制/删除)
- 全局搜索：跨模块标题+标签模糊搜索

任务 3 — 模块质检（5维度）
- 创建 src/services/module-quality.ts
- 陈旧检测：时间 > 5年 + 无新技术标签 → flag 'stale'
- 简略检测：字数 < 50 或仅一行 → flag 'brief'
- 缺量化检测：无数字/百分比/具体指标 → flag 'no_metrics'
- 无标签检测：tags 为空 → flag 'no_tags'
- 时间冲突检测：同一时间段出现两次 → flag 'time_conflict'
- 质检结果映射到卡片角标（🔴>=2个问题 / 🟡1个问题 / 🟢无问题）

任务 4 — 模块拼接生成简历
- 页面 src/pages/ResumeBuilder.tsx
- 左侧：模块库（按类折叠，可搜索）
- 右侧：实时预览拼接效果
- 拖拽模块到简历槽位，可排序/删除/替换
- 自动依据用户选择的模板排列模块顺序

任务 5 — 5 套简历模板
- 创建 src/templates/
  • template-classic.tsx    — 极简经典（单栏，技术岗）
  • template-fresh.tsx      — 应届清新（单栏，应届生）
  • template-business.tsx   — 双栏商务（外企/管理）
  • template-english.tsx    — 英文标准（外企/海归）
  • template-creative.tsx   — 创意视觉（设计/创意）
- 每套模板定义：CSS 布局 + 默认模块顺序 + 配色变量
- 模板缩略图预览
- 切换模板实时更新预览，已选模块不变

任务 6 — PDF 导出
- Edge Function：supabase/functions/export-pdf/index.ts
- 接收：{htmlContent, templateName}
- Puppeteer 渲染 HTML → PDF（A4 纸张）
- 保持模板 CSS 样式
- 返回 PDF download URL

任务 7 — 投递快照
- 用户点击"去投递"时触发
- 冻结当前 resume_version 完整内容 → resume_snapshots 表
- 快照只读不可修改
- 投递记录关联快照 ID

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 6：投递与追踪看板

```
【Phase 6 任务：投递执行与追踪看板】

请先读取 docs/DESIGN.md 模块 D 和 E。

任务 1 — 投递跳转与自动记录
- 职位表格"去投递"按钮 → window.open(source_url, '_blank')
- 点击时自动执行：
  • applications 表插入记录（status='applied', applied_at=NOW()）
  • duplicate_keys 表写入防重复键
  • 如果简历已优化，触发投递快照冻结

任务 2 — 投递看板表格视图（默认视图）
- 页面 src/pages/Dashboard.tsx，默认显示表格视图
- 列：职位标题 | 公司 | 来源平台 | 投递日期 | 当前状态 | 下次提醒 | 操作
- 状态彩色胶囊标签：
  待投递(灰#94a3b8)/已投递(蓝#3b82f6)/HR已读(浅蓝#60a5fa)/
  已沟通(黄#eab308)/面试邀请(绿#22c55e)/已拒绝(红#ef4444)/已入职(紫#a855f7)
- 排序/筛选（按状态/日期/平台）
- 多选 + 批量操作：改状态/加提醒/导出CSV/归档/标记/删除

任务 3 — 投递看板看板视图
- 组件 src/components/KanbanBoard.tsx
- 按 7 个状态分列，每列显示该状态职位卡片
- 卡片内容：公司/标题/日期/下次提醒日期
- 拖拽卡片换列 = 改变状态
- 列头显示该状态下的职位数量

任务 4 — 投递看板时间线视图
- 组件 src/components/TimelineView.tsx
- 垂直时间线，按投递日期降序
- 每个节点：日期圆点(状态色) + 职位信息 + 状态变化记录
- 点击节点展开详情

任务 5 — 8 类智能提醒引擎
- 创建 src/services/reminder-engine.ts
- 提醒类型与触发条件：
  1. 7天无响应：投递后7天状态仍为'已投递' → reminder_at = applied_at + 7d
  2. 14天无响应：投递后14天无变化 → reminder_at = applied_at + 14d
  3. 面试前24h：interview_date - 24h → 桌面通知
  4. 面试前1h：interview_date - 1h → 强提醒（系统通知 + 声音）
  5. 面试后3天：面试后3天无反馈 → 跟进提醒
  6. JD过期：关联 JD status='expired' → 提示
  7. 批量投递后3天：批量投递3天后 → 提示检查
  8. 自定义：用户手动设置日期
- 桌面端通知使用 Tauri notification API

任务 6 — 看板可视化
- 组件 src/components/DashboardStats.tsx（看板顶部统计区）
- 四个统计卡：总投递数/面试邀请率/转化率/平均响应时间
- 组件 src/components/ConversionFunnel.tsx（转化漏斗图）
- 组件 src/components/PlatformComparison.tsx（平台对比柱状图）
- 组件 src/components/TimeTrend.tsx（时间趋势折线图）
- 使用 ECharts 实现

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 7：面试准备

```
【Phase 7 任务：面试准备清单】

请先读取 docs/DESIGN.md 和 docs/ARCHITECTURE.md 中 interview_prep_items 表设计。

任务 1 — CRUD 实现
- 前端：src/pages/InterviewPrep.tsx + src/components/PrepItemCard.tsx
- 后端：Supabase 直连（RLS 已保护）
- 字段对齐 ARCHITECTURE.md 中的表结构

任务 2 — AI 面试题生成 Edge Function
- 创建 supabase/functions/generate-interview-questions/index.ts
- 模型：Qwen-Max（质量优先）
- 输入：JD 解析结果 + 简历模块
- 输出分类：
  • technical：技术栈核心问题（如"Kafka 消息可靠性怎么保证？"）
  • behavioral：行为面试题（如"介绍一个最有挑战的项目"）
  • deep_dive：项目深挖题（基于简历中的具体项目生成）
- 每题附带：priority(1-5) / estimated_minutes / 参考答案提示

任务 3 — 精神风貌准备建议 Edge Function
- 创建 supabase/functions/generate-spirit-prep/index.ts
- 模型：Qwen-Plus
- JD 中模糊品质要求（"抗压能力强""owner意识""创业精神"）
  → 不进结构化数据
  → 进入面试准备清单
- 输出：具体准备策略 + 对应项目案例建议
  • 例如：JD 要求"抗压能力强" → "准备2个在高压下成功交付的项目案例，
    描述当时的时间压力、团队规模和你的应对措施"

任务 4 — 面试准备清单 UI
- 分类折叠面板：📚技术准备 | 🏃行为面试 | 🌟精神风貌 | 📝我的笔记
- 顶部进度条："准备项：5/12 已完成 ▓▓▓▓▓░░░░░ 42%"
- 每项展示：复选框 + 标题 + 类别标签 + 优先级(星星) + 预计时间 + 来源标签
- 点击展开：详细内容(Markdown渲染) + 个人笔记区（可编辑）
- 操作：标记完成/修改优先级/删除/+添加准备项

任务 5 — 联动功能
- 简历新增红色标记内容 → 自动在此生成面试准备项（优先解答"为什么加这个技能？"）
- 看板状态变为"面试邀请" → 自动加入准备清单 + 面试前24h提醒

【代码规范同上。请直接创建/修改文件。】
```

---

### Phase 8：多端完善与测试

```
【Phase 8 任务：多端完善 + 端到端测试】

任务 1 — 多端 Supabase Realtime 同步
- 桌面端订阅：resumes/applications/job_positions 表变更
- 收到变更 → UI 局部刷新（不整页重载）
- 编辑锁机制：
  • 打开编辑时设置锁 {resume_id, user_id, device='desktop', expires_at=NOW()+5min}
  • 其他端检测到锁 → 显示"桌面端正在编辑中，当前只读"
  • 桌面端每2分钟自动续锁
  • 锁过期 → 自动释放

任务 2 — 浏览器插件表单半自动填充
- plugin/content-script.ts 增加投递表单页检测
  • BOSS 直聘投递页 URL 匹配
  • 猎聘投递页 URL 匹配
- popup 显示预填内容预览（姓名/手机/邮箱/简历附件路径/打招呼语）
- 用户点击"填充"→ 填入表单字段 → 用户手动点击目标平台的"提交"按钮
- 不会自动提交（合规底线）

任务 3 — 浏览器插件状态同步
- 用户进入 BOSS/猎聘"已投递"或"沟通中"页面
- 插件检测页面上的状态信息
- 对比本地 applications 记录
- 发现差异 → popup 通知"检测到3条状态变更，是否同步？"
- 用户确认 → 批量更新 applications 表

任务 4 — 微信小程序基础框架
- 在 d:/ALLPrograming/OPC/miniapp/ 创建项目
- 页面：职位查看（只读）+ 看板查看（只读）+ 简历下载
- 连接 Supabase（使用 supabase-js）
- 小程序只读原则（编辑权归桌面端）

任务 5 — 端到端测试
- 编写核心流程测试脚本（src/__tests__/e2e/）
- 覆盖完整链路：
  注册→上传简历→设置偏好→导入JD→查看匹配度→AI优化简历
  →确认改动→点击投递→查看看板→收到提醒→准备面试
- 边界测试：
  • 黑名单过滤正确性
  • 重复职位拦截
  • 低匹配度提示触发
  • 编辑锁并发测试

【代码规范同上。请直接创建/修改文件。】
```

---

## 3. 办公小浣熊 PPT / 信息图 / 竞品调研提示词

### PPT 制作（3 轮对话）

```
=== 第 1 轮：PPT 大纲 ===

【上传参考文件】
请读取以下内容作为素材：
- d:/ALLPrograming/OPC/docs/DESIGN.md
- d:/ALLPrograming/OPC/docs/ARCHITECTURE.md
- d:/ALLPrograming/OPC/ppt/everydeliver-slides.md（已有的 Marp 草稿）

【任务】
为 EveryDeliver 设计 OPC 答辩 PPT 大纲，15-20 页，答辩时长 10 分钟。

结构：
1-2页：封面+痛点
3-5页：解决方案+产品架构
6-12页：核心功能演示（JD Parser/AI优化/匹配度/看板/模块化/多端）
13-15页：技术栈+隐私+合规
16-18页：竞品对比+商业模式+进度
19-20页：团队+总结

每页给我：标题 + 3-5个要点 + 是否需要配图/架构图。
```

```
=== 第 2 轮：生成架构图 ===

基于 ARCHITECTURE.md 的架构描述，请在 PPT 中生成以下图表：

1. 系统架构图（三端 → Supabase → AI层）
2. 核心用户使用流程图（完整链路）
3. JD Parser 三层解析架构图
4. 投递状态机（7状态转换）
5. 匹配度公式拆解图
6. 编辑锁机制流程图

使用你能生成的图表格式（Mermaid / 或直接生成 ASCII 图描述）。
```

```
=== 第 3 轮：生成最终 PPT ===

请基于前两轮的大纲和图表，直接生成 PPT。

如果支持直接导出 .pptx：
  → 导出到 d:/ALLPrograming/OPC/ppt/EveryDeliver答辩.pptx

如果不支持直接导出：
  → 生成完整 Markdown 文件到 d:/ALLPrograming/OPC/ppt/EveryDeliver答辩.md
  → 我用 Marp CLI 转换为 PPT

设计要求：
- 配色：深蓝#1a365d / 白#ffffff / 橙色强调#ed8936
- 关键数字大号字体
- 架构图清晰可读
- 代码/技术栈用等宽字体
```

---

### 项目简介 + 一图读懂

```
=== 项目简介（三版本） ===

请基于 docs/ 下的所有设计文档，为 EveryDeliver 生成三个版本的项目简介：

1. 一句话版（<50字）
   用于：海报+展板+GitHub description
   要求：抓眼球，突出 AI 差异化

2. 1分钟版（150-200字）
   用于：路演开场
   要求：痛点→方案→亮点，逻辑清晰

3. 完整版（800-1000字）
   用于：评委阅读材料
   要求：技术深度+设计细节+数据支撑

输出到：d:/ALLPrograming/OPC/docs/PROJECT_BRIEF.md
```

```
=== 一图读懂 EveryDeliver ===

请生成一张"一图读懂 EveryDeliver"信息图。

内容：
- 大字标题："EveryDeliver — AI 驱动的求职效率引擎"
- 痛点对比（左：多平台盲投耗时长 / 右：AI精准匹配一条龙）
- 核心流程：上传简历 → 导入JD → AI优化 → 投递 → 追踪
- 3个核心亮点（图标+一句话）：
  • 智能解析：规则+LLM三层架构解析JD
  • 精准优化：5级风险分级+三色高亮标记
  • 全程追踪：三视图看板+8类智能提醒
- 技术栈标签云
- GitHub 链接

输出：PNG 到 d:/ALLPrograming/OPC/ppt/infographic.png
```

---

### 竞品调研与数据分析

```
=== 浏览器自动化竞品调研 ===

请用浏览器自动打开并分析以下竞品：

1. BOSS直聘（zhipin.com）— 看它的投递追踪功能
2. 猎聘（liepin.com）— 看它的简历优化功能
3. 超级简历（wondercv.com）— 看它的AI简历功能

对每个竞品：
- 核心功能描述
- 定价模式
- 优点/缺点（各3点）
- 与 EveryDeliver 的差异点

输出竞品分析报告到：d:/ALLPrograming/OPC/docs/COMPETITOR_ANALYSIS.md
```

```
=== 投递数据分析（如有测试数据） ===

【上传文件】
d:/ALLPrograming/OPC/test-data/applications.csv

【分析任务】
1. 数据清洗
2. 核心指标：
   - 投递→面试转化率
   - 各平台效果对比
   - 各时段回复率
   - 各薪资段面试率
3. 生成可视化图表并导出为 PNG
4. 将分析结论加入 PPT
```

---

## 4. 代码小浣熊的使用时机（仅 3 个场景）

代码小浣熊只在下述情况使用，其他一切由办公小浣熊完成：

```
场景 1：跨文件重构
"我正在重构 EveryDeliver 项目。请将 resumes 表的 content 字段改名为 body_text，
同步修改所有引用该字段的 TypeScript 类型定义、前端组件、Edge Function 和 SQL 迁移文件。
先列出所有受影响的文件和行号。"

场景 2：断点调试
"这段代码运行时出现了 [描述错误]，请帮我分析可能的原因。
这里是相关文件的代码：[粘贴代码]"

场景 3：Git 提交
"请帮我审查当前的 diff，然后执行 git commit。
Commit message 格式：feat(module): 做了什么"
```

---

## 5. 小浣熊双工具协作矩阵

| 项目需求 | 主力工具 | 辅助工具 | 备注 |
|---------|---------|---------|------|
| 需求分析 + 架构 | **办公小浣熊** | — | 读取设计文档，Plan 能力 |
| 所有代码生成 | **办公小浣熊** | — | 直接写入本地文件 |
| 截图→前端页面 | **办公小浣熊** | — | UI 开发效率极高 |
| PPT 制作 | **办公小浣熊** | — | 支持 PPTX 导出 |
| 项目信息图 | **办公小浣熊** | — | 小红书风格 |
| 竞品调研 | **办公小浣熊** | — | 浏览器自动化 |
| 数据分析 | **办公小浣熊** | — | CSV 上传自动分析 |
| 跨文件重构 | — | **代码小浣熊** | IDE 内跨文件感知 |
| 断点调试 | — | **代码小浣熊** | VSCode 原生能力 |
| Git commit/push | — | **代码小浣熊** | VSCode 内置 Git |
| 单元测试生成 | **办公小浣熊** | 代码小浣熊 | 办公生成→IDE验证 |
| 飞书协作 | **办公小浣熊** | — | 一键导出飞书文档 |

---

## 6. OPC 比赛叙事

答辩时用一句话总结你的工作方式：

> **"我一个人，坐在办公小浣熊面前，完成了需求分析、架构设计、
> 前端/后端/插件/小程序四端代码生成、PPT 答辩材料、竞品调研和
> 数据分析的全链路闭环。代码小浣熊只帮我校验了跨文件一致性。
> 这就是 OPC — One Person Capability。"**

---

## 7. 快速启动

```
1. 打开办公小浣熊桌面版
2. 授权本地目录：d:/ALLPrograming/OPC/
3. 输入：请读取 docs/DESIGN.md 和 docs/ARCHITECTURE.md
4. 输入 Phase 0 提示词（从本文档第2节复制）
5. 办公小浣熊开始规划 → 生成代码 → 写入文件
6. 完成后用代码小浣熊做 git commit
```

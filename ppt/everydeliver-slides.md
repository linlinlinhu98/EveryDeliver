---
marp: true
theme: uncover
class:
  - lead
  - invert
paginate: true
backgroundColor: #0f172a
color: #e2e8f0
headingColor: #38bdf8
---

<!-- _class: lead -->

# EveryDeliver

## 求职者半自动投递辅助平台

### 通过 AI 智能筛选与适配提升投递效率

**OPC 能力挑战赛**

---

<!-- _class: default -->

## 痛点分析

<div style="display: flex; gap: 2rem;">

<div style="flex: 1; background: #1e293b; padding: 1.5rem; border-radius: 8px;">

### 😫 痛点 1

**多平台搜寻 + 简历定制 + 投递耗时巨大**

- 官网 / 公众号 / BOSS / 猎聘 / 小红书
- 每份岗位需要定制化简历
- 投递后缺乏系统性追踪

</div>

<div style="flex: 1; background: #1e293b; padding: 1.5rem; border-radius: 8px;">

### 🤔 痛点 2

**不确定简历与岗位的匹配度**

- 不知道哪里需要修改
- 不知道该突出什么
- 不知道如何提升命中率

</div>

</div>

---

## 解决方案

<div style="text-align: center; margin-top: 3rem;">

### 🎯 核心定位

# AI 驱动的求职效率引擎

### 不是盲投，而是精准适配

**上传简历 → 导入 JD → AI 优化 → 投递追踪**
**一站式闭环**

</div>

---

## 产品架构

```mermaid
graph TB
    subgraph 三端
        Desktop[桌面端 Tauri<br/>完整功能 ★]
        Plugin[浏览器插件 MV3<br/>JD抓取+表单填充]
        MiniApp[微信小程序<br/>查看+记录]
    end
    
    subgraph 后端
        Supabase[Supabase<br/>Auth+DB+Storage]
        EdgeFn[Edge Functions<br/>LLM代理]
    end
    
    subgraph AI
        DS[DeepSeek-V3<br/>JD解析+匹配]
        Qwen[Qwen-Plus/Max<br/>简历优化+面试]
    end
    
    Desktop --> Supabase
    Plugin --> Supabase
    MiniApp --> Supabase
    Supabase --> EdgeFn
    EdgeFn --> DS
    EdgeFn --> Qwen
```

---

## 8 大功能模块

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.7em;">

| 模块 | 核心 |
|------|------|
| **A. 用户画像** | 简历上传 / 隐私分级 / 黑白名单 |
| **B. 职位获取** | 插件抓取 + 手动导入 / 三层过滤 |
| **C. 匹配优化** | 匹配度评估 / AI 简历优化 / 双模式 |
| **D. 投递执行** | 跳转投递 + 插件半自动填充 |
| **E. 追踪看板** | 三视图 / 7状态 / 8类提醒 |
| **F. 简历模块化** | 8类模块 / 拼接 / 5模板 |
| **G. JD Parser** | 规则+LLM三层解析 / 生命周期 |
| **H. 多端架构** | Tauri + 插件 + 小程序 + 云同步 |

</div>

---

## 核心亮点：AI 简历优化

<div style="display: flex; gap: 1rem;">

<div style="flex: 1; background: #1e293b; padding: 1rem; border-radius: 8px;">

### 改动风险 5 级分级

| 级别 | 类型 | 处理 |
|------|------|------|
| 🟢 | 措辞优化 | 自动应用 |
| 🟡 | 侧重点调整 | 自动应用 |
| 🟠 | GitHub化用 | 轻提示 |
| 🔴 | 新增关键词 | 弹窗确认 |
| 🔴 | 新增经历 | 强制确认 |

</div>

<div style="flex: 1; background: #1e293b; padding: 1rem; border-radius: 8px;">

### 三色高亮 + 面试赋能

<span style="background:#eab308;color:#000;padding:2px 6px;">黄色</span> 已有改写
<span style="background:#f97316;color:#fff;padding:2px 6px;">橙色</span> 外部参考
<span style="background:#ef4444;color:#fff;padding:2px 6px;">红色</span> 新增内容

每处改动附带：
- 改动原因说明
- 参考来源链接
- 面试准备建议

</div>

</div>

---

## 核心亮点：JD Parser

```mermaid
graph LR
    JD[JD文本] --> Rule[规则解析<br/>BOSS/猎聘硬编码]
    Rule -->|置信度≥0.7| Output[结构化输出]
    Rule -->|置信度<0.7| LLM[LLM解析<br/>DeepSeek-V3]
    LLM --> Output
    Output --> Feedback[用户反馈<br/>修正→缓存→规则升级]
    Feedback -.-> Rule
    
    Output --> Lifecycle[JD生命周期]
    Lifecycle --> Active[active]
    Lifecycle --> Expiring[expiring_soon 30天]
    Lifecycle --> Expired[expired 停招]
```

---

## 核心亮点：隐私保护

<div style="text-align: left; font-size: 0.85em;">

### 三级分级存储

| Level | 内容 | 存储 | LLM |
|-------|------|------|-----|
| **L1** | 手机号/身份证/籍贯/生日 | 本地 AES 加密 | ❌ 永不上传 |
| **L2** | 姓名/邮箱/脱敏手机号 | 加密上传 | ❌ 不送 LLM |
| **L3** | 技能/项目/年限/学历 | Supabase | ✅ 脱敏后可送 |

### 关键原则
- 🔒 不存储任何第三方平台密码/Cookies
- 🔒 所有用户数据 RLS 强制隔离
- 🔒 LLM 调用经代理层过滤敏感字段
- 🔒 训练数据 opt-in，默认不参与

</div>

---

## 技术栈

```mermaid
graph TB
    subgraph 前端
        Tauri[Tauri v2<br/>Rust + React+TS]
        Plugin[浏览器插件<br/>Manifest V3]
        WeChat[微信小程序]
    end
    
    subgraph 后端
        Supabase[Supabase<br/>Postgres+Auth+RLS]
        Storage[S3 文件存储]
        PDF[PDF 生成<br/>Puppeteer]
    end
    
    subgraph AI 模型
        DS[DeepSeek-V3<br/>JD解析/匹配/说明]
        QP[Qwen-Plus<br/>简历优化/面试建议]
        QM[Qwen-Max<br/>面试题生成]
    end
    
    Tauri --> Supabase
    Plugin --> Supabase
    WeChat --> Supabase
    Supabase --> DS
    Supabase --> QP
    Supabase --> QM
```

---

## AI 模型策略

| 任务 | 模型 | 理由 | 成本 |
|------|------|------|------|
| JD 解析 | DeepSeek-V3 | 便宜稳定 | ¥0.004/JD |
| 简历优化 | Qwen-Plus | 语义改写要求高 | ¥0.03/次 |
| 匹配度评估 | DeepSeek-V3 | 公式化任务 | ¥0.002/次 |
| 改动说明 | DeepSeek-V3 | 模板化生成 | ¥0.001/次 |
| 面试题生成 | Qwen-Max | 质量优先 | ¥0.05/次 |
| 面试建议 | Qwen-Plus | 平衡 | ¥0.02/次 |

<div style="text-align: center; margin-top: 2rem;">

### 💰 约 ¥0.86/月/用户

**是 Claude API 的 1/15**

</div>

---

## 浏览器插件合规设计

<div style="display: flex; gap: 1rem; font-size: 0.75em;">

<div style="flex: 1; background: #1e293b; padding: 1rem; border-radius: 8px;">

### 🛡️ 法律合规

- ✅ 首次启用强制告知弹窗
- ✅ 用户协议明确声明风险
- ✅ 每月一次重提示
- ✅ 一键禁用按钮

</div>

<div style="flex: 1; background: #1e293b; padding: 1rem; border-radius: 8px;">

### 🔧 技术安全

- ✅ 借助用户登录态（非爬虫）
- ✅ 模拟真实操作（随机延迟）
- ✅ 不批量抓取（每平台每日上限）
- ✅ 夜间 0-7 点自动暂停

</div>

<div style="flex: 1; background: #1e293b; padding: 1rem; border-radius: 8px;">

### 🚫 不做的事

- ❌ 不自动提交投递
- ❌ 不存储密码/Cookies
- ❌ 不爬取聊天记录
- ❌ 不修改账号信息

</div>

</div>

---

## 竞品对比

| 维度 | BOSS直聘 | 猎聘 | 传统手动 | **EveryDeliver** |
|------|---------|------|---------|----------------|
| 多平台聚合 | ❌ | ❌ | ❌ | ✅ 插件+手动 |
| JD 智能解析 | ❌ | ❌ | ❌ | ✅ 规则+LLM |
| 简历 AI 优化 | ❌ | 付费 | ❌ | ✅ 双模式+分级 |
| 投递追踪 | 半自动 | 半自动 | 手动 | ✅ 三视图+提醒 |
| 隐私保护 | ❌ | ❌ | — | ✅ 三级分级 |
| 成本 | 免费 | 付费 | 时间 | ¥0.86/月 |

---

## 投递追踪看板

```mermaid
stateDiagram-v2
    [*] --> 待投递
    待投递 --> 已投递
    已投递 --> HR已读
    HR已读 --> 已沟通
    已沟通 --> 面试邀请
    已沟通 --> 已拒绝
    面试邀请 --> 已入职
    面试邀请 --> 已拒绝
    
    note right of 待投递: 8类智能提醒
    note right of 已投递: 7天/14天自动提醒
    note right of 面试邀请: 面试前24h/1h强提醒
```

---

## 简历模块化系统

<div style="display: flex; gap: 1rem; font-size: 0.8em;">

<div style="flex: 1;">

### 8 类模块
- 🎓 教育背景
- 💼 实习经历
- 📁 项目经历
- 🛠️ 技能证书
- 📜 资质证书
- 🏆 获奖荣誉
- 🌐 语言能力
- 📝 个人总结

</div>

<div style="flex: 1;">

### 5 套模板
- 极简经典（技术岗）
- 应届清新（应届生）
- 双栏商务（外企/管理）
- 英文标准（外企/海归）
- 创意视觉（设计/创意）

</div>

<div style="flex: 1;">

### 5 维质检
- ⏰ 陈旧检测
- 📏 简略检测
- 📊 缺量化检测
- 🏷️ 无标签检测
- ⚡ 时间冲突检测

</div>

</div>

---

## 项目进度

```mermaid
gantt
    title MVP 开发进度
    dateFormat  YYYY-MM-DD
    section Phase 0
    基础设施搭建      :p0, 2026-06-20, 14d
    section Phase 1-2
    用户画像+JD Parser :p1, after p0, 14d
    section Phase 3-4
    职位过滤+匹配优化   :p2, after p1, 21d
    section Phase 5-6
    简历模块化+投递看板 :p3, after p2, 21d
    section Phase 7-8
    面试准备+多端完善  :p4, after p3, 14d
```

---

## AI 协作方式

<div style="text-align: left; font-size: 0.85em;">

### 本项目由"人 + AI"协作开发

| 环节 | AI 做的 | 人做的 |
|------|---------|--------|
| 需求分析 | 🔍 挖掘痛点、发现模糊点 | ✅ 决策、拍板 |
| 设计文档 | 📝 生成完整设计规格 | ✅ 审查、确认 |
| 代码实现 | 💻 生成代码、调试 | ✅ Code Review |
| 测试 | 🧪 生成测试用例 | ✅ E2E 验证 |
| PPT/文档 | 📊 生成内容+图表 | ✅ 调整、演示 |

**核心理念**：AI 做 80% 的体力活，人做 20% 的关键决策

</div>

---

## OPC 参赛总结

<div style="text-align: center; margin-top: 2rem;">

### EveryDeliver

✅ **8 大模块** 完整设计
✅ **5 份文档** 从需求到代码
✅ **3 个端** 桌面 + 插件 + 小程序
✅ **国产模型** 成本仅 ¥0.86/月/用户
✅ **隐私优先** 三级分级 + RLS
✅ **合规设计** 不存密码不自动投递

# 🔗 github.com/linlinlinhu98/EveryDeliver

### 感谢评委！

</div>

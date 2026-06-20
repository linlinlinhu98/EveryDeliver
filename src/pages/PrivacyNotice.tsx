import { useState } from "react";

/**
 * Privacy notice displayed on first login after Phase 1 release.
 *
 * Informs the user about the three-level privacy classification
 * and asks for consent before processing their data.
 */
export default function PrivacyNotice() {
  const [accepted, setAccepted] = useState(false);

  if (accepted) return null;

  return (
    <div className="privacy-notice">
      <div className="privacy-card">
        <div className="privacy-icon">🔒</div>
        <h2>隐私保护声明</h2>

        <p className="privacy-intro">
          EveryDeliver 采用<b>三级分级存储</b>策略保护你的个人信息：
        </p>

        <div className="privacy-levels">
          <div className="privacy-level level-1">
            <h4>🔴 Level 1 — 本地加密，永不上传</h4>
            <p>完整手机号、身份证号、籍贯（精确到区县）、出生年月（精确到日）</p>
            <p className="level-desc">使用 AES-256-GCM 在浏览器本地加密，密钥仅你持有</p>
          </div>

          <div className="privacy-level level-2">
            <h4>🟡 Level 2 — 加密上传，不送 LLM</h4>
            <p>姓名、邮箱、脱敏手机号（138****1234）、学校全名</p>
            <p className="level-desc">加密后上传存储，AI 代理层自动过滤，绝不发送给语言模型</p>
          </div>

          <div className="privacy-level level-3">
            <h4>🟢 Level 3 — 脱敏后可送 LLM</h4>
            <p>技能列表、项目经历（公司名脱敏）、工作年限、学历层次</p>
            <p className="level-desc">脱敏处理后方可发送给 AI 进行简历优化</p>
          </div>
        </div>

        <div className="privacy-commitments">
          <h4>我们的承诺</h4>
          <ul>
            <li>✅ 不存储任何第三方平台密码 / Cookies</li>
            <li>✅ 所有用户数据通过 RLS 强制隔离</li>
            <li>✅ LLM 调用经代理层过滤敏感字段</li>
            <li>✅ 训练数据 opt-in，默认不参与</li>
          </ul>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "auto", marginTop: "1.5rem" }}
          onClick={() => {
            localStorage.setItem("privacy_notice_accepted", "true");
            setAccepted(true);
          }}
        >
          我已了解，继续使用
        </button>
      </div>
    </div>
  );
}

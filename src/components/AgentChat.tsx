import { useState, useRef, useEffect } from "react";

/** A single message in the chat */
interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

/** Steps the agent guides the user through */
const RESUME_STEPS = [
  { key: "education", label: "教育背景", prompt: "请告诉我你的教育背景：学校、专业、学历、毕业时间。" },
  { key: "skill", label: "技能特长", prompt: "接下来请列出你的技术技能和证书，例如编程语言、框架、工具、专业证书等。" },
  { key: "project", label: "项目经历", prompt: "请描述 1-3 个你参与过的项目：项目名称、你的角色、使用的技术栈、主要成果（尽量用数据量化）。" },
  { key: "internship", label: "实习/工作经历", prompt: "请描述你的实习或工作经历：公司名称、岗位、时间、主要职责和成果。" },
  { key: "award", label: "获奖与荣誉", prompt: "请列出你获得过的奖项或荣誉（可选，没有请说'跳过'）。" },
  { key: "language", label: "语言能力", prompt: "请说明你的语言能力，如英语水平（CET-4/6/雅思/托福）、其他语言等。" },
  { key: "summary", label: "个人总结", prompt: "最后，请用 2-3 句话做一个自我总结，突出你的专业方向和职业目标。" },
];

interface AgentChatProps {
  onComplete: (sections: Record<string, string>) => void;
}

/**
 * Agent-guided resume builder — conversational UI.
 *
 * The agent walks the user through 7 standard resume sections
 * one at a time, collecting free-text input for each.
 * On completion, returns a structured Record<sectionKey, content>.
 */
export default function AgentChat({ onComplete }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content:
        "你好！我将引导你逐步填写简历。整个过程大约需要 5-10 分钟。准备好了吗？我们开始吧！\n\n" +
        RESUME_STEPS[0].prompt,
    },
  ]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || finished) return;

    const stepKey = RESUME_STEPS[currentStep].key;

    // Add user message
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];

    // Save section content
    const newSections = { ...sections, [stepKey]: trimmed };

    // Move to next step or finish
    const nextStep = currentStep + 1;
    if (nextStep >= RESUME_STEPS.length) {
      // All steps complete
      newMessages.push({
        role: "agent",
        content:
          "🎉 简历信息收集完毕！我已将所有内容整理成结构化简历。点击下方按钮查看并保存。",
      });
      setMessages(newMessages);
      setSections(newSections);
      setFinished(true);
      setInput("");
      onComplete(newSections);
      return;
    }

    // Prompt next step
    const next = RESUME_STEPS[nextStep];
    newMessages.push({
      role: "agent",
      content: `好的，已记录你的${RESUME_STEPS[currentStep].label}信息！\n\n(${nextStep + 1}/${RESUME_STEPS.length}) ${next.prompt}`,
    });

    setMessages(newMessages);
    setSections(newSections);
    setCurrentStep(nextStep);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="agent-chat">
      <div className="chat-header">
        <span className="chat-avatar">🤖</span>
        <div>
          <strong>简历填写助手</strong>
          <p className="chat-progress">
            进度：{currentStep}/{RESUME_STEPS.length} · {RESUME_STEPS[currentStep]?.label}
          </p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message ${msg.role === "agent" ? "chat-agent" : "chat-user"}`}
          >
            <div className="chat-bubble">{msg.content}</div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {!finished && (
        <div className="chat-input-row">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`输入你的${RESUME_STEPS[currentStep].label}信息... (Enter 发送)`}
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!input.trim()}
            style={{ width: "auto", marginTop: 0 }}
          >
            发送
          </button>
        </div>
      )}
    </div>
  );
}

/** Build a Markdown resume from structured sections */
export function buildResumeMarkdown(sections: Record<string, string>): string {
  const labels: Record<string, string> = {
    education: "教育背景",
    skill: "技能特长",
    project: "项目经历",
    internship: "实习/工作经历",
    award: "获奖与荣誉",
    language: "语言能力",
    summary: "个人总结",
  };

  const parts: string[] = [];

  for (const [key, label] of Object.entries(labels)) {
    const content = sections[key];
    if (content && content.trim() && content !== "跳过") {
      parts.push(`## ${label}\n\n${content.trim()}\n`);
    }
  }

  return parts.join("\n\n");
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AgentChat, { buildResumeMarkdown } from "@/components/AgentChat";
import { createResume } from "@/services/resume-service";

export default function ResumeAgent() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"chat" | "review">("chat");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("我的简历");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const markdown = buildResumeMarkdown(sections);

  const handleComplete = (completedSections: Record<string, string>) => {
    setSections(completedSections);
    setStep("review");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      await createResume(
        title,
        "", // no file upload
        "agent",
        markdown
      );
      navigate("/resumes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Agent 对话填写简历</h1>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate("/resumes")}
        >
          ← 返回简历列表
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {step === "chat" && (
        <AgentChat onComplete={handleComplete} />
      )}

      {step === "review" && (
        <div className="review-section">
          <h2 style={{ marginBottom: "1rem" }}>预览生成的简历</h2>

          <div className="form-group">
            <label htmlFor="agentResumeTitle">简历标题</label>
            <input
              id="agentResumeTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>简历内容预览</label>
            <pre className="resume-preview">{markdown}</pre>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-outline"
              onClick={() => setStep("chat")}
            >
              ← 返回修改
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: "auto" }}
            >
              {saving ? "保存中..." : "保存简历"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

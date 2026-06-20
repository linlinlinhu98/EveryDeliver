import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FileUpload from "@/components/FileUpload";
import { parseResumeFile } from "@/services/resume-parser";
import { createResume } from "@/services/resume-service";

export default function ResumeUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"upload" | "review">("upload");

  /** Handle file selection: parse and move to review step */
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.[^.]+$/, ""));
    setParsing(true);
    setError("");

    try {
      const result = await parseResumeFile(selectedFile);
      setContent(result.text);
      setStep("review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "解析失败";
      setError(message);
    } finally {
      setParsing(false);
    }
  };

  /** Save resume and navigate to list */
  const handleSave = async () => {
    if (!file || !content.trim()) return;

    setSaving(true);
    setError("");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
      await createResume(title || file.name, file.name, ext, content);
      navigate("/resumes");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setError(message);
      setSaving(false);
    }
  };

  if (parsing) {
    return (
      <div className="page-container">
        <div className="loading-screen">
          <div className="spinner" />
          <p>正在解析简历文件...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>上传简历</h1>
        <p className="page-subtitle">
          {step === "upload"
            ? "支持 PDF、Word 或纯文本格式"
            : "请检查解析内容，确认后保存"}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {step === "upload" && (
        <FileUpload onFileSelect={handleFileSelect} />
      )}

      {step === "review" && (
        <div className="review-section">
          <div className="form-group">
            <label htmlFor="resumeTitle">简历标题</label>
            <input
              id="resumeTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：张三-后端开发-2026"
            />
          </div>

          <div className="form-group">
            <label htmlFor="resumeContent">简历内容</label>
            <textarea
              id="resumeContent"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              placeholder="在此编辑或粘贴简历内容..."
            />
          </div>

          <div className="btn-row">
            <button
              className="btn btn-outline"
              onClick={() => setStep("upload")}
            >
              重新上传
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !content.trim()}
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

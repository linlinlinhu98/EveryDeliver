import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getUserResumes,
  setPrimaryResume,
  deleteResume,
  type ResumeRecord,
} from "@/services/resume-service";

export default function ResumeList() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchResumes = async () => {
    try {
      const data = await getUserResumes();
      setResumes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  const handleSetPrimary = async (id: string) => {
    try {
      await setPrimaryResume(id);
      setResumes((prev) =>
        prev.map((r) => ({ ...r, is_primary: r.id === id }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确认删除该简历？所有版本将被永久删除。")) return;
    try {
      await deleteResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-screen">
          <div className="spinner" />
          <p>加载简历列表...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>我的简历</h1>
        <button
          className="btn btn-primary"
          style={{ width: "auto" }}
          onClick={() => navigate("/resumes/upload")}
        >
          + 上传新简历
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {resumes.length === 0 ? (
        <div className="empty-state">
          <p>还没有简历，上传第一份简历开始使用</p>
          <button
            className="btn btn-primary"
            style={{ width: "auto" }}
            onClick={() => navigate("/resumes/upload")}
          >
            + 上传简历
          </button>
        </div>
      ) : (
        <div className="resume-list">
          {resumes.map((resume) => (
            <div key={resume.id} className="resume-card">
              <div className="resume-card-body">
                <h3>
                  {resume.title}
                  {resume.is_primary && (
                    <span className="badge badge-primary">主简历</span>
                  )}
                </h3>
                <p className="resume-meta">
                  {resume.file_type?.toUpperCase()} ·{" "}
                  {new Date(resume.created_at).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <div className="resume-card-actions">
                <Link to={`/resumes/${resume.id}`} className="btn btn-outline btn-sm">
                  查看
                </Link>
                {!resume.is_primary && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleSetPrimary(resume.id)}
                  >
                    设为主简历
                  </button>
                )}
                <button
                  className="btn btn-outline btn-sm"
                  style={{ color: "#ef4444", borderColor: "#ef4444" }}
                  onClick={() => handleDelete(resume.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

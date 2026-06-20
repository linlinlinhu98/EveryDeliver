import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Profile {
  display_name: string | null;
  email_verified: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("display_name, email_verified")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
      }
    };

    fetchProfile();
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>EveryDeliver</h1>
        <p className="welcome-text">
          欢迎{profile?.display_name ? `，${profile.display_name}` : ""}
        </p>
      </div>

      <div className="dashboard-grid">
        <div
          className="dashboard-card clickable"
          onClick={() => navigate("/resumes")}
          style={{ cursor: "pointer" }}
        >
          <div className="card-icon">📄</div>
          <h2>我的简历</h2>
          <p>上传或创建简历，管理简历模块</p>
          <span className="badge badge-ready">已上线</span>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">🔍</div>
          <h2>职位搜索</h2>
          <p>导入 JD，智能匹配，AI 优化简历</p>
          <span className="badge">Phase 2-4 即将上线</span>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">📊</div>
          <h2>投递看板</h2>
          <p>追踪投递状态，智能提醒跟进</p>
          <span className="badge">Phase 6 即将上线</span>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">🎯</div>
          <h2>面试准备</h2>
          <p>AI 生成面试题，结构化备考</p>
          <span className="badge">Phase 7 即将上线</span>
        </div>
      </div>
    </div>
  );
}

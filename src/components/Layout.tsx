import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";

interface LayoutProps {
  session: Session;
  children: ReactNode;
}

export default function Layout({ session, children }: LayoutProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <div className="nav-brand">EveryDeliver</div>
        <div className="nav-links">
          <button className="nav-link" onClick={() => navigate("/dashboard")}>
            首页
          </button>
        </div>
        <div className="nav-user">
          <span className="user-email">{session.user.email}</span>
          <button className="btn btn-outline btn-sm" onClick={handleSignOut}>
            退出
          </button>
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}

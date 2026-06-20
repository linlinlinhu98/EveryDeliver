import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import ResumeList from "@/pages/ResumeList";
import ResumeUpload from "@/pages/ResumeUpload";
import Preferences from "@/pages/Preferences";
import ResumeAgent from "@/pages/ResumeAgent";
import JDImport from "@/pages/JDImport";
import JobPositionList from "@/pages/JobPositionList";
import MatchDetail from "@/pages/MatchDetail";
import ApplicationBoard from "@/pages/ApplicationBoard";
import ResumeBuilder from "@/pages/ResumeBuilder";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout session={session}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/resumes" element={<ResumeList />} />
        <Route path="/resumes/upload" element={<ResumeUpload />} />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="/resumes/agent" element={<ResumeAgent />} />
        <Route path="/positions" element={<JobPositionList />} />
        <Route path="/positions/import" element={<JDImport />} />
        <Route path="/positions/:id" element={<MatchDetail />} />
        <Route path="/resumes/builder" element={<ResumeBuilder />} />
        <Route path="/applications" element={<ApplicationBoard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    navigate("/dashboard");
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>EveryDeliver</h1>
          <p className="auth-subtitle">AI 驱动的求职效率引擎</p>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <h2>登录</h2>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="auth-footer">
          还没有账号？<Link to="/register">立即注册</Link>
        </p>
      </div>
    </div>
  );
}

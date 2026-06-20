import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  type Preferences,
} from "@/services/preferences-service";

const INDUSTRY_OPTIONS = [
  "互联网/IT", "金融", "教育/培训", "医疗/健康", "制造业",
  "房地产", "零售/电商", "媒体/广告", "咨询", "能源/环保",
];

const SIZE_OPTIONS = [
  { label: "不限", value: 0 },
  { label: "20人以上", value: 20 },
  { label: "50人以上", value: 50 },
  { label: "100人以上", value: 100 },
  { label: "500人以上", value: 500 },
  { label: "1000人以上", value: 1000 },
];

const CITY_OPTIONS = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
  "西安", "苏州", "重庆", "长沙", "天津", "郑州", "远程",
];

const BLACKLIST_TAG_OPTIONS = [
  "外包", "大小周", "单休", "996", "驻场", "派遣",
  "试用期长", "考核淘汰", "付费培训",
];

export default function PreferencesPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const toggleArray = <K extends keyof Preferences>(
    key: K,
    item: string
  ) => {
    const arr = prefs[key] as string[];
    update(
      key,
      arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-container"><div className="spinner" /></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>求职偏好设置</h1>
        <button className="btn btn-outline btn-sm" onClick={() => navigate("/dashboard")}>← 返回</button>
      </div>

      {/* === Whitelist === */}
      <section className="pref-section">
        <h2>✅ 白名单 — 期望条件</h2>

        <div className="form-group">
          <label>意向城市</label>
          <div className="tag-grid">
            {CITY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`tag-btn ${prefs.target_cities.includes(c) ? "active" : ""}`}
                onClick={() => toggleArray("target_cities", c)}
              >{c}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>意向行业</label>
          <div className="tag-grid">
            {INDUSTRY_OPTIONS.map((ind) => (
              <button
                key={ind}
                type="button"
                className={`tag-btn ${prefs.industries.includes(ind) ? "active" : ""}`}
                onClick={() => toggleArray("industries", ind)}
              >{ind}</button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>企业规模下限</label>
            <select
              value={prefs.min_company_size ?? 0}
              onChange={(e) => update("min_company_size", Number(e.target.value) || null)}
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>最低月薪 (K)</label>
            <input
              type="number"
              value={prefs.min_monthly_salary ?? ""}
              onChange={(e) => update("min_monthly_salary", e.target.value ? Number(e.target.value) : null)}
              placeholder="如 15"
              min={0}
              max={100}
            />
          </div>
        </div>
      </section>

      {/* === Blacklist === */}
      <section className="pref-section">
        <h2>🚫 黑名单 — 硬禁止</h2>

        <div className="form-group">
          <label>禁止标签</label>
          <div className="tag-grid">
            {BLACKLIST_TAG_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-btn danger ${prefs.blacklist_tags.includes(t) ? "active" : ""}`}
                onClick={() => toggleArray("blacklist_tags", t)}
              >{t}</button>
            ))}
          </div>
        </div>
      </section>

      {/* === Auto-detection === */}
      <section className="pref-section">
        <h2>🤖 自动检测</h2>

        <div className="form-group">
          <label>检测模式</label>
          <select
            value={prefs.auto_detect_mode}
            onChange={(e) => update("auto_detect_mode", e.target.value as Preferences["auto_detect_mode"])}
          >
            <option value="prompt">弹窗询问（推荐）</option>
            <option value="auto_all">高置信度自动加入</option>
            <option value="mark_only">仅标记不行动</option>
          </select>
        </div>

        <div className="form-group">
          <label>自动加入阈值：检测到 {prefs.auto_join_threshold} 个信号自动加入</label>
          <input
            type="range"
            min={1}
            max={5}
            value={prefs.auto_join_threshold}
            onChange={(e) => update("auto_join_threshold", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={prefs.industry_warnings}
              onChange={(e) => update("industry_warnings", e.target.checked)}
            />{" "}
            启用行业默认警告（教培/P2P/区块链等高风险行业）
          </label>
        </div>
      </section>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: "auto" }}>
          {saving ? "保存中..." : saved ? "✓ 已保存" : "保存设置"}
        </button>
      </div>
    </div>
  );
}

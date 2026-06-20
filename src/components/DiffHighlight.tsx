// ============================================
// 改动高亮三色渲染组件 (Phase 4.6)
// 黄(低风险) / 橙(中风险) / 红(高风险)
// ============================================
import type { OptimizationChange, RiskLevel } from "@/services/match-engine";
import { RISK_LABELS, RISK_COLORS } from "@/services/match-engine";

interface DiffHighlightProps {
  originalContent: string;
  optimizedContent: string;
  changes: OptimizationChange[];
  explanation: string;
  onAccept?: () => void;
  onReject?: () => void;
  onAcceptChange?: (index: number) => void;
  onRejectChange?: (index: number) => void;
  acceptedChanges?: Set<number>;
  rejectedChanges?: Set<number>;
}

export default function DiffHighlight({
  originalContent,
  optimizedContent,
  changes,
  explanation,
  onAccept,
  onReject,
  onAcceptChange,
  onRejectChange,
  acceptedChanges = new Set(),
  rejectedChanges = new Set(),
}: DiffHighlightProps) {
  const getRiskBadge = (level: RiskLevel) => {
    const color = RISK_COLORS[level];
    return (
      <span
        style={{
          display: "inline-block",
          padding: "0.1rem 0.4rem",
          borderRadius: "3px",
          fontSize: "0.7rem",
          fontWeight: 600,
          background: `${color}22`,
          color,
          border: `1px solid ${color}44`,
          whiteSpace: "nowrap",
        }}
      >
        Lv{level}
      </span>
    );
  };

  // 将文本按改动标记高亮
  const renderHighlightedText = (text: string, isOriginal: boolean) => {
    if (changes.length === 0) {
      return <span>{text}</span>;
    }

    const parts: React.ReactNode[] = [];
    let lastIdx = 0;

    // Sort changes by position
    const sorted = [...changes].sort((a, b) => a.position.start - b.position.start);

    for (const change of sorted) {
      const { start, end } = change.position;
      if (start < 0) continue; // Skip position-less changes

      // Add text before this change
      if (start > lastIdx) {
        parts.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx, start)}</span>);
      }

      // Add highlighted change
      const changeText = isOriginal ? change.originalText : change.newText;
      if (changeText) {
        const color = RISK_COLORS[change.riskLevel as RiskLevel];
        parts.push(
          <span
            key={`change-${start}`}
            style={{
              background: `${color}33`,
              borderBottom: `2px solid ${color}`,
              borderRadius: "2px",
              padding: "0 2px",
            }}
            title={`${RISK_LABELS[change.riskLevel as RiskLevel]}: ${change.reason}`}
          >
            {changeText}
          </span>
        );
      }

      lastIdx = end;
    }

    // Add remaining text
    if (lastIdx < text.length) {
      parts.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx)}</span>);
    }

    return parts.length > 0 ? <>{parts}</> : <span>{text}</span>;
  };

  return (
    <div>
      {/* Explanation */}
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "var(--radius)",
          marginBottom: "1rem",
          fontSize: "0.85rem",
          lineHeight: 1.7,
        }}
      >
        <strong>💡 优化说明：</strong> {explanation}
      </div>

      {/* Side-by-side diff */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {/* Original */}
        <div>
          <h4 style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
            📄 原始内容
          </h4>
          <div
            className="resume-preview"
            style={{ fontSize: "0.85rem", maxHeight: "400px" }}
          >
            {renderHighlightedText(originalContent, true)}
          </div>
        </div>

        {/* Optimized */}
        <div>
          <h4 style={{ fontSize: "0.85rem", color: "var(--color-success)", marginBottom: "0.5rem" }}>
            ✨ 优化后
          </h4>
          <div
            className="resume-preview"
            style={{ fontSize: "0.85rem", maxHeight: "400px", borderColor: "rgba(34, 197, 94, 0.3)" }}
          >
            {renderHighlightedText(optimizedContent, false)}
          </div>
        </div>
      </div>

      {/* Changes list */}
      <section className="pref-section">
        <h2>📝 改动列表 ({changes.length})</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {changes.map((change, i) => {
            const isAccepted = acceptedChanges.has(i);
            const isRejected = rejectedChanges.has(i);
            const color = RISK_COLORS[change.riskLevel as RiskLevel];

            return (
              <div
                key={i}
                style={{
                  padding: "0.65rem 0.85rem",
                  background: isRejected ? "rgba(239, 68, 68, 0.05)" : isAccepted ? "rgba(34, 197, 94, 0.05)" : "var(--color-bg)",
                  border: `1px solid ${isRejected ? "rgba(239, 68, 68, 0.2)" : isAccepted ? "rgba(34, 197, 94, 0.2)" : "var(--color-border)"}`,
                  borderRadius: "6px",
                  opacity: isRejected ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                  {getRiskBadge(change.riskLevel as RiskLevel)}
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    {change.type === "added" ? "➕ 新增" : change.type === "removed" ? "➖ 删除" : "✏️ 修改"}
                  </span>
                  <span style={{
                    fontSize: "0.7rem",
                    color,
                    fontWeight: 500,
                  }}>
                    {RISK_LABELS[change.riskLevel as RiskLevel]}
                  </span>
                  {onAcceptChange && onRejectChange && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: "0.3rem" }}>
                      <button
                        className={`tag-btn ${isAccepted ? "active" : ""}`}
                        onClick={() => onAcceptChange(i)}
                        style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
                      >
                        ✓ 接受
                      </button>
                      <button
                        className={`tag-btn danger ${isRejected ? "active" : ""}`}
                        onClick={() => onRejectChange(i)}
                        style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
                      >
                        ✗ 拒绝
                      </button>
                    </div>
                  )}
                </div>

                {change.originalText && (
                  <div style={{ fontSize: "0.8rem", marginBottom: "0.15rem" }}>
                    <span style={{ color: "var(--color-error)" }}>原文: </span>
                    {change.originalText}
                  </div>
                )}
                {change.newText && (
                  <div style={{ fontSize: "0.8rem", marginBottom: "0.15rem" }}>
                    <span style={{ color: "var(--color-success)" }}>改为: </span>
                    {change.newText}
                  </div>
                )}
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                  {change.reason}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Accept/Reject all buttons */}
      {onAccept && onReject && (
        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" onClick={onAccept} style={{ width: "auto", background: "var(--color-success)" }}>
            ✅ 接受全部改动
          </button>
          <button className="btn btn-outline" onClick={onReject} style={{ width: "auto", color: "var(--color-error)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
            ❌ 放弃优化
          </button>
        </div>
      )}
    </div>
  );
}

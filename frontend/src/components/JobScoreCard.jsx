/**
 * JobScoreCard
 * ============
 * Displays the job match score with a plain-language reasoning explanation.
 */

// ─── Score gauge (SVG circle) ────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const r = 48;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const dash = pct * circ;

  const color =
    score >= 75 ? "#3d7d52" :
    score >= 55 ? "#c49a28" :
    "#c0442a";

  const label =
    score >= 75 ? "Strong fit" :
    score >= 55 ? "Good fit" :
    "Consider carefully";

  return (
    <div className="jsc-gauge-wrap">
      <svg className="jsc-gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e8e0d4" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray 0.7s ease" }}
        />
        <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>{Math.round(score)}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="11" fill="#7a6e65">/100</text>
      </svg>
      <p className="jsc-gauge-label" style={{ color }}>{label}</p>
    </div>
  );
}

// ─── Reasoning lines parser ───────────────────────────────────────────────────
// The model returns reasoning as a multi-line string. We parse it into
// a readable list of bullet points for display.
function ReasoningSection({ reasoning }) {
  if (!reasoning) return null;

  // Split on newlines, strip bullet/dash prefixes, filter blanks
  const lines = reasoning
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  // Separate the intro sentence from the breakdown lines
  const intro = lines[0] || "";
  const bullets = lines.slice(1).filter((l) => l.includes("–") || l.includes(":") || l.startsWith("+") || l.startsWith("-"));
  const narrative = lines.slice(1).filter((l) => !bullets.includes(l));

  return (
    <div className="jsc-reasoning">
      {intro && <p className="jsc-reasoning-intro">{intro}</p>}
      {bullets.length > 0 && (
        <ul className="jsc-reasoning-list">
          {bullets.map((line, i) => {
            const isPositive = line.startsWith("+") || line.includes("+");
            const isNegative = line.startsWith("–") || line.includes("–") || (line.includes(":") && line.includes("-"));
            const color = isPositive && !isNegative ? "#3d7d52" : isNegative ? "#c0442a" : "#4b4035";
            return (
              <li key={i} className="jsc-reasoning-item" style={{ "--dot-color": color }}>
                {line}
              </li>
            );
          })}
        </ul>
      )}
      {narrative.map((line, i) => (
        <p key={i} className="jsc-reasoning-narrative">{line}</p>
      ))}
    </div>
  );
}

// ─── Tag list ────────────────────────────────────────────────────────────────
function TagList({ items, color }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="jsc-tag-list">
      {items.map((item, i) => (
        <li key={i} className="jsc-tag" style={{ borderColor: color, color }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function JobScoreCard({ result, occupationName, onClose }) {
  if (!result) return null;

  return (
    <div className="jsc-overlay" role="dialog" aria-modal="true" aria-label="Job match score">
      <div className="jsc-panel">

        {/* Header */}
        <div className="jsc-header">
          <div>
            <p className="jsc-eyebrow">Job Match Score</p>
            <h2 className="jsc-title">{occupationName || "This role"}</h2>
          </div>
          <button
            type="button"
            className="jsc-close"
            onClick={onClose}
            aria-label="Close job match score"
          >
            ×
          </button>
        </div>

        {/* Score + recommendation */}
        <div className="jsc-score-row">
          <ScoreGauge score={result.score} />
          <div className="jsc-recommendation">
            <p className="jsc-recommendation-text">{result.recommendation}</p>
            <p className="jsc-confidence">
              Confidence: <strong>{Math.round((result.match_confidence ?? 0) * 100)}%</strong>
            </p>
          </div>
        </div>

        {/* Why this score — plain language reasoning */}
        <div className="jsc-section">
          <h3 className="jsc-section-title">💬 Why this score?</h3>
          <ReasoningSection reasoning={result.reasoning} />
        </div>

        {/* Strengths + Challenges */}
        <div className="jsc-two-col">
          <div className="jsc-section">
            <h3 className="jsc-section-title">💪 Your strengths</h3>
            <TagList items={result.key_strengths} color="#3d7d52" />
          </div>
          <div className="jsc-section">
            <h3 className="jsc-section-title">⚠️ Watch out for</h3>
            <TagList items={result.key_challenges} color="#c49a28" />
          </div>
        </div>

        {/* Accommodations */}
        {result.suggested_accommodations?.length > 0 && (
          <div className="jsc-section jsc-callout">
            <h3 className="jsc-section-title">🤝 Suggested supports</h3>
            <TagList items={result.suggested_accommodations} color="#5a6e8f" />
          </div>
        )}

      </div>
    </div>
  );
}

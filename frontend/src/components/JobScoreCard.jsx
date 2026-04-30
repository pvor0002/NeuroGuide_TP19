/**
 * JobScoreCard
 * ============
 * Displays the job match score with skills breakdown:
 * matched, partially matched, and missing skills.
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

// ─── Skills breakdown logic ───────────────────────────────────────────────────
function categoriseSkills(userSkills = [], jobSkills = []) {
  const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const matched = [];
  const partial = [];
  const missing = [];

  jobSkills.forEach((jobSkill) => {
    const jobNorm = normalise(jobSkill);

    // Exact match
    const exactMatch = userSkills.find((u) => normalise(u) === jobNorm);
    if (exactMatch) {
      matched.push(jobSkill);
      return;
    }

    // Partial match — job skill word appears in any user skill or vice versa
    const jobWords = jobNorm.split(/\s+/);
    const partialMatch = userSkills.find((u) => {
      const uNorm = normalise(u);
      const uWords = uNorm.split(/\s+/);
      return (
        jobWords.some((w) => uNorm.includes(w) && w.length > 3) ||
        uWords.some((w) => jobNorm.includes(w) && w.length > 3)
      );
    });

    if (partialMatch) {
      partial.push(jobSkill);
    } else {
      missing.push(jobSkill);
    }
  });

  return { matched, partial, missing };
}

// ─── Skills breakdown component ───────────────────────────────────────────────
function SkillsBreakdown({ skillsFactor }) {
  if (!skillsFactor) return null;

  const userSkills = skillsFactor.user_skills || [];
  const jobSkills = skillsFactor.job_skills || [];

  if (jobSkills.length === 0) return null;

  const { matched, partial, missing } = categoriseSkills(userSkills, jobSkills);

  return (
    <div className="jsc-section">
      <h3 className="jsc-section-title">🧰 Skills breakdown</h3>
      <p className="jsc-skills-subtitle">
        Comparing your skills against what this job requires.
      </p>

      <div className="jsc-skills-grid">
        {/* Matched */}
        <div className="jsc-skills-col jsc-skills-col--matched">
          <div className="jsc-skills-col-header">
            <span className="jsc-skills-col-dot" style={{ background: "#3d7d52" }} />
            <span className="jsc-skills-col-title">You have</span>
            <span className="jsc-skills-col-count">{matched.length}</span>
          </div>
          {matched.length === 0
            ? <p className="jsc-skills-empty">None matched</p>
            : matched.map((s, i) => (
              <div key={i} className="jsc-skill-chip jsc-skill-chip--matched">{s}</div>
            ))
          }
        </div>

        {/* Partially matched */}
        <div className="jsc-skills-col jsc-skills-col--partial">
          <div className="jsc-skills-col-header">
            <span className="jsc-skills-col-dot" style={{ background: "#c49a28" }} />
            <span className="jsc-skills-col-title">Partial overlap</span>
            <span className="jsc-skills-col-count">{partial.length}</span>
          </div>
          {partial.length === 0
            ? <p className="jsc-skills-empty">None</p>
            : partial.map((s, i) => (
              <div key={i} className="jsc-skill-chip jsc-skill-chip--partial">{s}</div>
            ))
          }
        </div>

        {/* Missing */}
        <div className="jsc-skills-col jsc-skills-col--missing">
          <div className="jsc-skills-col-header">
            <span className="jsc-skills-col-dot" style={{ background: "#c0442a" }} />
            <span className="jsc-skills-col-title">You&apos;re missing</span>
            <span className="jsc-skills-col-count">{missing.length}</span>
          </div>
          {missing.length === 0
            ? <p className="jsc-skills-empty">None — great!</p>
            : missing.map((s, i) => (
              <div key={i} className="jsc-skill-chip jsc-skill-chip--missing">{s}</div>
            ))
          }
        </div>
      </div>
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

  const skillsFactor = result.factor_breakdown?.skills;

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

        {/* Skills breakdown */}
        <SkillsBreakdown skillsFactor={skillsFactor} />

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

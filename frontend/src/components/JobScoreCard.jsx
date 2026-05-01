import { Link } from "react-router-dom";

function shortLine(text, max = 90) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return `${(last > 30 ? cut.slice(0, last) : cut).trim()}...`;
}

function compactReasons(items = [], max = 2) {
  return items.filter(Boolean).slice(0, max).map((line) => shortLine(line, 90));
}

function compactPrefs(lines = [], max = 3) {
  return lines.slice(0, max).map((line) => {
    const m = String(line).match(/^(✅|⚠️)\s*(.+?):\s*(.+)$/);
    if (!m) return { ok: true, label: "Preference", text: shortLine(line, 72) };
    return { ok: m[1] === "✅", label: m[2], text: shortLine(m[3], 72) };
  });
}

function categoriseSkills(userSkills = [], jobSkills = []) {
  const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched = [];
  const partial = [];
  const missing = [];
  jobSkills.forEach((jobSkill) => {
    const jn = normalize(jobSkill);
    if (userSkills.some((u) => normalize(u) === jn)) {
      matched.push(jobSkill);
      return;
    }
    const partialHit = userSkills.some((u) => {
      const un = normalize(u);
      return (jn.length > 3 && un.includes(jn)) || (un.length > 3 && jn.includes(un));
    });
    if (partialHit) partial.push(jobSkill);
    else missing.push(jobSkill);
  });
  return { matched, partial, missing };
}

function chipList(items, tone) {
  if (!items.length) return <p className="jsc-muted-line">None</p>;
  return (
    <div className="jsc-chip-row">
      {items.slice(0, 6).map((it, idx) => (
        <span key={`${it}-${idx}`} className={`jsc-mini-chip jsc-mini-chip--${tone}`}>{it}</span>
      ))}
    </div>
  );
}

function scoreTone(score) {
  if (score >= 75) return "good";
  if (score >= 55) return "warn";
  return "risk";
}

function scoreLabel(score) {
  if (score >= 75) return "Strong match";
  if (score >= 55) return "Moderate match";
  return "Low match";
}

function capitalizeFirst(text) {
  const t = String(text || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function JobScoreCard({ result, occupationName, onOpenHistory }) {
  if (!result) return null;

  const score = Number(result.score || 0);
  const tone = scoreTone(score);
  const scorePct = Math.min(100, Math.max(0, score));
  const showInterviewCta = score > 70;
  const confidencePct = Math.round((result.match_confidence ?? 0) * 100);

  const skillsFactor = result.factor_breakdown?.skills || {};
  const split = categoriseSkills(skillsFactor.user_skills || [], skillsFactor.job_skills || []);
  const curatedStrengths = [
    "Best with Quiter Settings",
    "Low Interruptions",
    "Needs detail-orientation",
    "Needs hyperfocus",
  ];
  const challenges = compactReasons(result.key_challenges, 2);
  const prefs = compactPrefs(result.preference_alignment, 3);

  return (
    <div className="jsc-inline jsc-inline--fullbleed" role="region" aria-labelledby="jsc-inline-heading">
      <div className="jsc-panel jsc-panel--inline jsc-panel--assessment">
        <div className="jsc-assess-topbar">
          <div className="jsc-assess-brand">
            <p className="jsc-assess-brand-title">Career Compatibility Score</p>
            <p id="jsc-inline-heading" className="jsc-assess-role">
              Assessment for: <strong>{occupationName || "this role"}</strong>
            </p>
          </div>
          <div className="jsc-assess-top-actions">
            {typeof onOpenHistory === "function" ? (
              <button type="button" className="jsc-compare-btn" onClick={onOpenHistory}>
                Compare with Previous Simplified JDs
              </button>
            ) : null}
          </div>
        </div>

        <div className="jsc-assess-score-wrap">
          <div
            className={`jsc-assess-score-ring jsc-assess-score-ring--${tone}`}
            style={{ "--jsc-score-pct": `${scorePct}%` }}
          >
            <span className="jsc-assess-score-num">{Math.round(score)}</span>
            <span className="jsc-assess-score-den">/100</span>
          </div>
          <div className="jsc-assess-score-text">
            <p className="jsc-assess-score-title">
              Match Score <span>{Math.round(score)}/100</span>
            </p>
            <p className="jsc-assess-score-sub">{scoreLabel(score)} - explore based on your profile fit.</p>
            <p className="jsc-assess-score-meta">Model Confidence {confidencePct}%</p>
          </div>
          <div className="jsc-helpful-box" aria-label="Was it helpful?">
            <span className="jsc-helpful-label">Was it helpful?</span>
            <div className="jsc-helpful-actions">
              <button type="button" className="jsc-helpful-btn" aria-label="Helpful">
                <span className="jsc-helpful-emoji" aria-hidden="true">👍</span>
              </button>
              <button type="button" className="jsc-helpful-btn" aria-label="Not helpful">
                <span className="jsc-helpful-emoji" aria-hidden="true">👎</span>
              </button>
            </div>
          </div>
        </div>

        <div className="jsc-assess-grid jsc-assess-grid--two-col">
          <section className="jsc-assess-col">
            <h3 className="jsc-assess-col-title">Skills Match</h3>
            <div className="jsc-assess-box jsc-assess-box--good">
              <p className="jsc-assess-box-head">Skills You Have ({split.matched.length})</p>
              {chipList(split.matched, "good")}
            </div>
            <div className="jsc-assess-box jsc-assess-box--warn">
              <p className="jsc-assess-box-head">Partial Matches ({split.partial.length})</p>
              {chipList(split.partial, "warn")}
            </div>
            <div className="jsc-assess-box jsc-assess-box--risk">
              <p className="jsc-assess-box-head">Missing Critical Skills ({split.missing.length})</p>
              {chipList(split.missing, "risk")}
            </div>
          </section>

          <section className="jsc-assess-col">
            <h3 className="jsc-assess-col-title">ADHD Profile Compatibility</h3>
            <div className="jsc-assess-box jsc-assess-box--good">
              <p className="jsc-assess-box-head">Why is it good for you?</p>
              <ul className="jsc-simple-list jsc-simple-list--ticks">
                {curatedStrengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            {prefs.length > 0 ? (
              <div className="jsc-assess-box jsc-assess-box--neutral">
                <p className="jsc-assess-box-head">Preferences</p>
                <div className="jsc-pref-pill-row">
                  {prefs.map((p, i) => (
                    <div key={i} className={`jsc-pref-pill ${p.ok ? "jsc-pref-pill--ok" : "jsc-pref-pill--risk"}`}>
                      <span className="jsc-pref-pill-label">{p.label}</span>
                      <span className="jsc-pref-pill-text">{p.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="jsc-assess-box jsc-assess-box--warn">
              <p className="jsc-assess-box-head">Watch out for following in this type of environment</p>
              <ul className="jsc-simple-list jsc-simple-list--warn">
                {challenges.map((c, i) => <li key={i}>{capitalizeFirst(c)}</li>)}
              </ul>
            </div>
          </section>
        </div>

        {showInterviewCta ? (
          <div className="jsc-cta-wrap">
            <Link className="jsc-interview-cta" to="/interview-prep">
              Start preparing for interview
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

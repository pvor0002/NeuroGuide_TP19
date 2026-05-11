import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchDayInLife } from "../services/dayInLifeApi.js";

const ENERGY_LABELS = {
  high:   { label: "High focus required", colour: "#dc2626", bg: "#fff5f5", pillBg: "#fee2e2" },
  medium: { label: "Medium energy",       colour: "#d97706", bg: "#fffbf0", pillBg: "#fef3c7" },
  low:    { label: "Low energy",          colour: "#16a34a", bg: "#f4fdf6", pillBg: "#dcfce7" },
  break:  { label: "Break",               colour: "#3b82f6", bg: "#eff6ff", pillBg: "#dbeafe" },
};

/** Splits "9:00 AM" → { hm: "9:00", period: "AM" } */
function parseTime(t = "") {
  const m = t.match(/^(\d+:\d+)\s*(AM|PM)?/i);
  if (!m) return { hm: t, period: "" };
  return { hm: m[1], period: (m[2] || "").toUpperCase() };
}

export default function DayInLifePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { job_title, adhd_type } = location.state ?? {};

  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const jobKey = job_title && adhd_type ? `${job_title}|${adhd_type}` : null;
  const [prevJobKey, setPrevJobKey] = useState(null);
  if (jobKey !== prevJobKey) {
    setPrevJobKey(jobKey);
    if (jobKey) {
      setLoading(true);
      setError(null);
      setTimeline(null);
    }
  }

  useEffect(() => {
    if (!job_title || !adhd_type) return;
    fetchDayInLife(job_title, adhd_type)
      .then((data) => setTimeline(data.timeline))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [job_title, adhd_type]);

  // Guard: no job data
  if (!job_title) {
    return (
      <main className="day-in-life-page">
        <div className="day-in-life-no-data">
          <p>No job selected. Please go back and score a job first.</p>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            ← Go back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="day-in-life-page">
      <header className="simplify-hero dil-hero-override">
        <div className="simplify-hero-grid">
          <div className="simplify-hero-copy">
            <p className="simplify-hero-eyebrow">Energy mapped · Hour by hour</p>
            <h1 className="simplify-hero-title">A Day in the Life</h1>
            <p className="simplify-hero-lead">
              What a typical workday looks like for <strong>{job_title}</strong> with <strong>{adhd_type}</strong> ADHD, energy mapped hour by hour.
            </p>
            <p className="dil-disclaimer">
              This is a general simulation and may not reflect your exact experience. Schedules, demands, and support vary widely by company, team, and role.
            </p>
            <button type="button" className="simplify-hero-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>

          <div className="day-in-life-legend">
            {Object.entries(ENERGY_LABELS).map(([key, { label, colour }]) => (
              <span key={key} className="dil-legend-item">
                <span className="dil-legend-dot" style={{ background: colour }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Loading state */}
      {loading && (
        <div className="day-in-life-loading">
          <p>⏳ Generating your timeline...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="day-in-life-error">
          <p>Something went wrong: {error}</p>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            ← Go back
          </button>
        </div>
      )}

      {/* Timeline */}
      {timeline && !loading && (
        <div className="day-in-life-timeline">
          {timeline.map((block, i) => {
            const energy = ENERGY_LABELS[block.energy_level] ?? ENERGY_LABELS.medium;
            const { hm, period } = parseTime(block.time);
            return (
              <div key={i} className="timeline-block">
                <div className="timeline-time">
                  <span className="timeline-time-hm">{hm}</span>
                  {period && <span className="timeline-time-period">{period}</span>}
                </div>
                <div
                  className="timeline-content"
                  style={{
                    "--dot-color": energy.colour,
                    "--card-bg": energy.bg,
                  }}
                >
                  <p className="timeline-task">{block.task}</p>
                  <p className="timeline-description">{block.description}</p>
                  <div className="timeline-footer">
                    <span
                      className="timeline-energy-badge"
                      style={{ background: energy.pillBg, color: energy.colour }}
                    >
                      <span className="tl-dot" style={{ background: energy.colour }} />
                      {energy.label}
                    </span>
                    {block.adhd_tip && (
                      <span className="timeline-adhd-chip">💡 {block.adhd_tip}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
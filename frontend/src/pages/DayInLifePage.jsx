import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchDayInLife } from "../services/dayInLifeApi.js";

const ENERGY_LABELS = {
  high:   { label: "High Focus",  colour: "#e53e3e" },
  medium: { label: "Medium",      colour: "#d97706" },
  low:    { label: "Low Energy",  colour: "#38a169" },
  break:  { label: "Break",       colour: "#718096" },
};

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
      <div className="day-in-life-header">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>A Day in the Life</h1>
        <p className="day-in-life-subtitle">
          Here&apos;s what a typical workday might look like for a{" "}
          <strong>{job_title}</strong> with <strong>{adhd_type}</strong> ADHD.
        </p>
      </div>

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
            return (
              <div key={i} className="timeline-block">
                <div className="timeline-time">{block.time}</div>
                <div className="timeline-content">
                  <div className="timeline-task-row">
                    <span className="timeline-task">{block.task}</span>
                    <span
                      className="timeline-energy-badge"
                      style={{ background: energy.colour }}
                    >
                      {energy.label}
                    </span>
                  </div>
                  <p className="timeline-description">{block.description}</p>
                  {block.adhd_tip && (
                    <p className="timeline-adhd-tip">💡 {block.adhd_tip}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
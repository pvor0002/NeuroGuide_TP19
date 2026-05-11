import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import DayInLifeTimeline from "../components/DayInLifeTimeline.jsx";
import { fetchDayInLife } from "../services/dayInLifeApi.js";

function formatAdhdLabel(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "hyperactive" || s === "hyperactive-impulsive") return "Hyperactive";
  if (s === "inattentive") return "Inattentive";
  if (s === "combined") return "Combined";
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Matches Profile Wizard / career profile “Previous step” control (`profile-app.css`). */
function CareerProfileBackLink({ onClick, label }) {
  return (
    <div className="q-profile-prev-top day-in-life-back">
      <button type="button" className="button ghost q-profile-prev-btn q-profile-prev-btn--matrix" onClick={onClick}>
        <span className="q-profile-prev-icon" aria-hidden="true">
          ←
        </span>
        {label}
      </button>
    </div>
  );
}

export default function DayInLifePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const st = location.state ?? {};
  const job_title = String(st.job_title ?? searchParams.get("job_title") ?? "").trim();
  const adhd_type = String(st.adhd_type ?? searchParams.get("adhd_type") ?? "").trim();

  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDayInLife(job_title, adhd_type)
      .then((data) => {
        if (!cancelled) setTimeline(data.timeline);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job_title, adhd_type]);

  const adhdDisplay = formatAdhdLabel(adhd_type);

  // Guard: no job data
  if (!job_title) {
    return (
      <div className="day-in-life-page">
        <div className="day-in-life-no-data">
          <CareerProfileBackLink label="Go back" onClick={() => navigate(-1)} />
          <p>No job selected. Please go back and score a job first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="day-in-life-page">
      <div className="day-in-life-header">
        <CareerProfileBackLink label="Back" onClick={() => navigate(-1)} />
        <h1>A Day in the Life</h1>
        <p className="day-in-life-subtitle">
          Here&apos;s what a typical workday may look like for a <strong>{job_title}</strong>
          {adhdDisplay ? (
            <>
              {" "}
              with <strong>{adhdDisplay}</strong> ADHD.
            </>
          ) : (
            "."
          )}
        </p>
      </div>

      {loading && (
        <div className="day-life-loading" aria-busy="true" aria-live="polite">
          <div className="day-life-loading__inner">
            <span className="day-life-loading__pulse" aria-hidden="true" />
            <p className="day-life-loading__txt">Painting a gentle picture of your workday…</p>
          </div>
          <ul className="day-life-skeleton" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="day-life-skeleton__card" />
            ))}
          </ul>
        </div>
      )}

      {error && !loading ? (
        <div className="day-in-life-error">
          <p>Something went wrong: {error}</p>
          <CareerProfileBackLink label="Go back" onClick={() => navigate(-1)} />
        </div>
      ) : null}

      {timeline && !loading ? <DayInLifeTimeline blocks={timeline} /> : null}
    </div>
  );
}

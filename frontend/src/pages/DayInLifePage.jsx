import { useLocation, useNavigate } from "react-router-dom";

export default function DayInLifePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { job_title, adhd_type } = location.state ?? {};

  // Guard: user landed here without job data (e.g. typed URL directly)
  if (!job_title) {
    return (
      <main className="day-in-life-page">
        <div className="day-in-life-no-data">
          <p>No job selected. Please paste the Job Description to see the Day in Life.</p>
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
          Here's what a typical workday might look like for a{" "}
          <strong>{job_title}</strong> with <strong>{adhd_type}</strong> ADHD.
        </p>
      </div>

      {/* Placeholder — replaced with real timeline on Day 2 */}
      <div className="day-in-life-placeholder">
     
        <p className="day-in-life-debug">
          Job: {job_title} · ADHD type: {adhd_type}
        </p>
      </div>
    </main>
  );
}
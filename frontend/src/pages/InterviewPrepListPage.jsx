import { Link } from "react-router-dom";
import InterviewPrepSessionsList from "../components/interview-prep/InterviewPrepSessionsList.jsx";

export default function InterviewPrepListPage() {
  return (
    <div className="saved-results-page ip-list-page">
      <header className="saved-results-page__head">
        <h1 className="saved-results-page__title">Interview Prep</h1>
        <p className="saved-results-page__sub">
          Pick a job to practise STAR answers, or resume a session you already started. Each row is tied to a simplified
          job posting.
        </p>
        <p className="saved-results-page__sub">
          <Link to="/simplify-job-description">Simplify a new job description</Link> to start fresh interview prep for
          that role.
        </p>
      </header>

      <div className="saved-results-panel">
        <InterviewPrepSessionsList />
      </div>
    </div>
  );
}

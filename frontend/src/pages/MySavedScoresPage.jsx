import { useMemo } from "react";
import { Link } from "react-router-dom";
import { readJobScoreHistory } from "../utils/jobScorePersistence.js";

export default function MySavedScoresPage() {
  const rows = useMemo(() => readJobScoreHistory(), []);

  return (
    <div className="saved-scores-page">
      <header className="saved-scores-page__head">
        <h1 className="saved-scores-page__title">My Saved Scores</h1>
        <p className="saved-scores-page__sub">
          Simplified job titles and the career match score from when you last ran the match on each posting.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="saved-scores-page__empty">
          No saved scores yet. Open{" "}
          <Link to="/simplify-job-description">Simplify Job Description</Link>, paste a job description, then use{" "}
          <strong>See My Match Score</strong>. Each run is saved here.
        </p>
      ) : (
        <ul className="saved-scores-list">
          {rows.map((row, i) => {
            const score = row.result?.score;
            const title = (row.jobTitleDisplay && String(row.jobTitleDisplay).trim()) || row.jobTitleNorm || "Job";
            const occ = row.occupationName || "—";
            const date =
              row.createdAt != null
                ? new Date(row.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—";
            return (
              <li key={`${row.jobTitleNorm}-${String(row.simplifiedVerStamp)}-${i}`} className="saved-scores-card">
                <div className="saved-scores-card__text">
                  <p className="saved-scores-card__job">{title}</p>
                  <p className="saved-scores-card__occ">
                    <span className="saved-scores-card__occ-label">Role profile used:</span> {occ}
                  </p>
                  <p className="saved-scores-card__date">{date}</p>
                </div>
                <div className="saved-scores-card__score" aria-label="Match score">
                  <span className="saved-scores-card__score-num">
                    {score != null && Number.isFinite(Number(score)) ? Number(score).toFixed(1) : "—"}
                  </span>
                  <span className="saved-scores-card__score-suffix">/100</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

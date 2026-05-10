import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { JobHistoryDetailModal } from "./SimplifyJobDescriptionPage.jsx";
import {
  jobScoreHistoryEntriesEqual,
  readUserSavedJobScores,
  removeUserSavedJobScore,
} from "../utils/jobScorePersistence.js";

const CAREER_PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";

function getProfileTabFromCareerProfile() {
  try {
    const raw = window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const type =
      parsed?.answers?.adhdProfileType ||
      parsed?.answers?.quizInferredType ||
      "";
    if (type === "hyperactive-impulsive") return "hyperactive";
    if (type === "inattentive") return "inattentive";
    if (type === "combined") return "combined";
    return null;
  } catch {
    return null;
  }
}

export default function MySavedScoresPage() {
  const savedProfileKey = getProfileTabFromCareerProfile();
  const [rows, setRows] = useState(() => readUserSavedJobScores());
  const [detailItem, setDetailItem] = useState(null);

  const refreshRows = useCallback(() => {
    setRows(readUserSavedJobScores());
  }, []);

  const list = useMemo(() => rows, [rows]);

  return (
    <div className="saved-scores-page">
      <header className="saved-scores-page__head">
        <h1 className="saved-scores-page__title">My Saved Scores</h1>
        <p className="saved-scores-page__sub">
          Job descriptions you saved from Simplify Job Description after a match score above 50%.
        </p>
      </header>

      {list.length === 0 ? (
        <p className="saved-scores-page__empty">
          No saved scores yet. Open{" "}
          <Link to="/simplify-job-description">Simplify Job Description</Link>, run <strong>See My Match Score</strong>,
          and when your match is above 50%, choose <strong>Save this JD Score</strong>.
        </p>
      ) : (
        <ul className="saved-scores-list">
          {list.map((row, i) => {
            const rawScore = row.result?.score;
            const scoreInt =
              rawScore != null && Number.isFinite(Number(rawScore)) ? Math.round(Number(rawScore)) : null;
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
              <li key={`${row.jobTitleNorm}-${String(row.simplifiedVerStamp)}-${row.createdAt ?? i}`} className="saved-scores-card">
                <div className="saved-scores-card__text">
                  <p className="saved-scores-card__job">{title}</p>
                  <p className="saved-scores-card__occ">
                    <span className="saved-scores-card__occ-label">Role profile used:</span> {occ}
                  </p>
                  <p className="saved-scores-card__date">{date}</p>
                </div>
                <div className="saved-scores-card__right">
                  <div className="saved-scores-card__score" aria-label="Match score">
                    <span className="saved-scores-card__score-num">
                      {scoreInt != null ? scoreInt : "—"}
                    </span>
                    <span className="saved-scores-card__score-suffix">/100</span>
                  </div>
                  <div className="saved-scores-card__actions">
                    <button type="button" className="saved-scores-detail-btn" onClick={() => setDetailItem(row)}>
                      View full detail
                    </button>
                    <button
                      type="button"
                      className="saved-scores-delete-btn"
                      onClick={() => {
                        removeUserSavedJobScore(row);
                        refreshRows();
                        setDetailItem((cur) => (cur && jobScoreHistoryEntriesEqual(cur, row) ? null : cur));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <JobHistoryDetailModal
        open={Boolean(detailItem)}
        item={detailItem}
        fallbackProfileKey={savedProfileKey ?? "inattentive"}
        liveSimplifiedResult={null}
        inputMode="paste"
        text=""
        fileExtractedText=""
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}

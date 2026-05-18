import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import SavedScoresPanel from "../components/saved-results/SavedScoresPanel.jsx";
import { deleteDayInLifeSession, fetchDayInLifeSessions } from "../services/dayInLifeSessionsApi.js";
import { readDayInLifeRecents, removeDayInLifeRecent } from "../utils/dayInLifeRecents.js";
import { dilCacheRemove, dilCacheSet } from "../utils/dayInLifeCache.js";
import { hasCloudSessionCredentials, readCredentials } from "../utils/cloudSync.js";
import InterviewPrepSessionsList from "../components/interview-prep/InterviewPrepSessionsList.jsx";
import ListItemTrashButton from "../components/saved-results/ListItemTrashButton.jsx";
import { useConfirmAction } from "../hooks/useConfirmAction.jsx";

const TAB_IDS = ["scores", "day-in-life", "interview"];

const TAB_META = [
  { id: "scores", label: "My saved scores", path: "/saved-insights/scores" },
  { id: "day-in-life", label: "Saved day in the life", path: "/saved-insights/day-in-life" },
  { id: "interview", label: "Saved interview Q/A", path: "/saved-insights/interview" },
];

function formatAdhdLabel(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "hyperactive" || s === "hyperactive-impulsive") return "Hyperactive";
  if (s === "inattentive") return "Inattentive";
  if (s === "combined") return "Combined";
  if (!raw) return "";
  return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
}

function dilNormKey(job, adhd) {
  const j = String(job || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const a = String(adhd || "").trim().toLowerCase();
  return `${j}|${a}`;
}

function DayInLifeSavedPanel() {
  const navigate = useNavigate();
  const { confirm, modalElement } = useConfirmAction();
  const [localRecents, setLocalRecents] = useState(() => readDayInLifeRecents());
  const [cloudSessions, setCloudSessions] = useState([]);
  const [deletingKey, setDeletingKey] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (!hasCloudSessionCredentials()) return;
    let cancelled = false;
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) return;
    fetchDayInLifeSessions(cred)
      .then((d) => {
        if (cancelled) return;
        setCloudSessions(Array.isArray(d?.sessions) ? d.sessions : []);
      })
      .catch(() => {
        if (!cancelled) setCloudSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cloudKeys = new Set(cloudSessions.map((s) => dilNormKey(s.job_title, s.adhd_type)));
  const localOnly = localRecents.filter((r) => !cloudKeys.has(dilNormKey(r.job_title, r.adhd_type)));

  if (!cloudSessions.length && !localOnly.length) {
    return (
      <p className="saved-scores-page__empty">
        No saved timelines yet. Open <Link to="/day-in-life">Day in the Life</Link> from a job, use{" "}
        <strong>Save this day</strong> when signed in, or start from{" "}
        <Link to="/simplify-job-description">Simplify Job Description</Link>.
      </p>
    );
  }

  const openDil = (job, adhd, timeline) => {
    const j = String(job || "").trim();
    const a = String(adhd || "").trim();
    if (!j || !a) return;
    if (Array.isArray(timeline) && timeline.length) dilCacheSet(j, a, timeline);
    const q = new URLSearchParams({ job_title: j, adhd_type: a });
    navigate(`/day-in-life?${q.toString()}`);
  };

  const runDeleteCloudSession = async (sess) => {
    const key = `cloud-${sess.id}`;
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) return;
    setDeleteError(null);
    setDeletingKey(key);
    try {
      await deleteDayInLifeSession(cred, sess.id);
      const job = String(sess.job_title || "").trim();
      const adhd = String(sess.adhd_type || "").trim();
      dilCacheRemove(job, adhd);
      setCloudSessions((prev) => prev.filter((s) => String(s.id) !== String(sess.id)));
    } catch (err) {
      setDeleteError(err?.message || "Could not delete saved timeline.");
    } finally {
      setDeletingKey(null);
    }
  };

  const deleteCloudSession = (sess) => {
    if (deletingKey) return;
    const job = String(sess.job_title || "").trim();
    confirm({
      title: "Delete saved day in the life?",
      message: `Remove the saved timeline for "${job}" from your account. This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: () => runDeleteCloudSession(sess),
    });
  };

  const runDeleteLocalRecent = (job, adhd, rowKey) => {
    setDeleteError(null);
    setDeletingKey(rowKey);
    try {
      removeDayInLifeRecent(job, adhd);
      dilCacheRemove(job, adhd);
      setLocalRecents(readDayInLifeRecents());
    } finally {
      setDeletingKey(null);
    }
  };

  const deleteLocalRecent = (job, adhd, rowKey) => {
    if (deletingKey) return;
    confirm({
      title: "Remove recent timeline?",
      message: `Remove "${job}" from recent timelines on this device only.`,
      confirmLabel: "Remove",
      onConfirm: () => runDeleteLocalRecent(job, adhd, rowKey),
    });
  };

  return (
    <>
      {modalElement}
      {deleteError ? <p className="saved-results-panel__hint saved-results-panel__hint--error">{deleteError}</p> : null}
      {cloudSessions.length ? (
        <div className="saved-insights-subsect">
          <h3 className="saved-insights-subsect__title">Saved to your account</h3>
          <ul className="saved-results-sublist">
            {cloudSessions.map((sess) => {
              const job = String(sess.job_title || "").trim();
              const adhd = String(sess.adhd_type || "").trim();
              const tl = Array.isArray(sess.timeline) ? sess.timeline : [];
              const rowKey = `cloud-${sess.id}`;
              const isDeleting = deletingKey === rowKey;
              const when =
                sess.updated_at != null
                  ? new Date(sess.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "â€”";
              return (
                <li key={String(sess.id)} className="saved-results-subcard">
                  <div className="saved-results-subcard__text">
                    <p className="saved-results-subcard__title">{job}</p>
                    <p className="saved-results-subcard__meta">
                      ADHD lens: <strong>{formatAdhdLabel(adhd) || adhd}</strong>
                    </p>
                    <p className="saved-results-subcard__date">{when}</p>
                  </div>
                  <div className="saved-results-subcard__actions">
                    <button
                      type="button"
                      className="saved-results-resume-btn"
                      disabled={Boolean(deletingKey)}
                      onClick={() => openDil(job, adhd, tl)}
                    >
                      Open saved day
                    </button>
                    <ListItemTrashButton
                      busy={isDeleting}
                      disabled={Boolean(deletingKey)}
                      label="Delete saved day in the life"
                      onClick={() => deleteCloudSession(sess)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {localOnly.length ? (
        <div className="saved-insights-subsect">
          <h3 className="saved-insights-subsect__title">Recent on this device</h3>
          <ul className="saved-results-sublist">
            {localOnly.map((r, i) => {
              const job = String(r.job_title || "").trim();
              const adhd = String(r.adhd_type || "").trim();
              const rowKey = `local-${job}|${adhd}|${i}`;
              const isDeleting = deletingKey === rowKey;
              const when =
                r.updatedAt != null
                  ? new Date(r.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "â€”";
              return (
                <li key={`${job}|${adhd}|${i}`} className="saved-results-subcard">
                  <div className="saved-results-subcard__text">
                    <p className="saved-results-subcard__title">{job}</p>
                    <p className="saved-results-subcard__meta">
                      ADHD lens: <strong>{formatAdhdLabel(adhd) || adhd}</strong>
                    </p>
                    <p className="saved-results-subcard__date">{when}</p>
                  </div>
                  <div className="saved-results-subcard__actions">
                    <button
                      type="button"
                      className="saved-results-resume-btn"
                      disabled={Boolean(deletingKey)}
                      onClick={() => openDil(job, adhd, null)}
                    >
                      Open timeline
                    </button>
                    <ListItemTrashButton
                      busy={isDeleting}
                      disabled={Boolean(deletingKey)}
                      label="Remove recent timeline from this device"
                      onClick={() => deleteLocalRecent(job, adhd, rowKey)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
export default function SavedResultsPage() {
  const { tab } = useParams();
  const activeTab = TAB_IDS.includes(tab) ? tab : null;

  if (!activeTab) {
    return <Navigate to="/saved-insights/scores" replace />;
  }

  return (
    <div className="saved-results-page">
      <header className="saved-results-page__head">
        <h1 className="saved-results-page__title">Saved Insights</h1>
        <p className="saved-results-page__sub">
          Your saved match scores, day-in-the-life sessions, and interview prep for each job. Use the tabs to switch
          between them anytime.
        </p>
      </header>

      <div className="saved-results-tabs" role="tablist" aria-label="Saved insights categories">
        {TAB_META.map((t) => (
          <NavLink
            key={t.id}
            to={t.path}
            role="tab"
            aria-selected={tab === t.id}
            className={({ isActive }) => `saved-results-tabs__tab ${isActive ? "saved-results-tabs__tab--active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="saved-results-panel" role="tabpanel" aria-labelledby={`saved-tab-${tab}`}>
        {tab === "scores" ? (
          <>
            <h2 className="saved-results-panel__heading" id="saved-tab-scores">
              My saved scores
            </h2>
            <p className="saved-results-panel__hint">
              Job titles and match scores you saved from Simplify Job Description (whole numbers out of 100).
            </p>
            <SavedScoresPanel />
          </>
        ) : null}

        {tab === "day-in-life" ? (
          <>
            <h2 className="saved-results-panel__heading" id="saved-tab-day-in-life">
              Saved day in the life
            </h2>
            <p className="saved-results-panel__hint">
              Cloud saves (when signed in) and recent timelines from this browser. Open loads the day without
              regenerating when a cached or saved copy exists.
            </p>
            <DayInLifeSavedPanel />
          </>
        ) : null}

        {tab === "interview" ? (
          <>
            <h2 className="saved-results-panel__heading" id="saved-tab-interview">
              Saved interview Q/A
            </h2>
            <p className="saved-results-panel__hint">
              Each row is a job you saved with a simplified posting. Resume opens Interview Prep for that job (cloud
              backup applies when you are signed in).
            </p>
            <InterviewPrepSessionsList />
          </>
        ) : null}
      </div>
    </div>
  );
}

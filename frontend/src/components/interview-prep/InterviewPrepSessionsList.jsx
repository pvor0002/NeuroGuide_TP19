import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { fetchInterviewPrepSessions } from "../../services/interviewPrepProgressApi.js";
import { hasCloudSessionCredentials, readCredentials } from "../../utils/cloudSync.js";
import { displayTitleForScoreRow, mergeScoreRowsForHub } from "../../utils/experienceHubJobs.js";
import {
  deriveInterviewPrepJobFingerprint,
  jobContextFromInterviewSessionSummary,
  jobContextFromSavedScoreRow,
} from "../../utils/interviewPrepHelpers.js";
import {
  applyInterviewPrepJobContext,
  resumeInterviewPrepFromSavedScoreRow,
} from "../../utils/interviewPrepResume.js";
import { goToInterviewPrepWorkspaceFromListing } from "../../utils/interviewPrepNav.js";
import { interviewSessionLabelForSaved } from "../../utils/interviewPrepSessionLabels.js";

function formatListDate(value) {
  if (value == null) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function InterviewPrepSessionsList() {
  const navigate = useNavigate();
  const localRows = mergeScoreRowsForHub().filter((row) => jobContextFromSavedScoreRow(row));
  const [cloudSessions, setCloudSessions] = useState([]);

  useEffect(() => {
    if (!hasCloudSessionCredentials()) return;
    let cancelled = false;
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) return;
    fetchInterviewPrepSessions(cred)
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d?.sessions) ? d.sessions : [];
        setCloudSessions(list.filter((s) => jobContextFromInterviewSessionSummary(s)));
      })
      .catch(() => {
        if (!cancelled) setCloudSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listItems = useMemo(() => {
    const byFingerprint = new Map();

    for (const sess of cloudSessions) {
      const fp = String(sess?.job_fingerprint || "").trim();
      if (!fp) continue;
      byFingerprint.set(fp, {
        key: `cloud-${sess.id}`,
        source: "cloud",
        title: interviewSessionLabelForSaved(sess),
        occupation: null,
        date: sess.updated_at,
        sess,
        row: null,
      });
    }

    for (const row of localRows) {
      const ctx = jobContextFromSavedScoreRow(row);
      if (!ctx) continue;
      const fp = deriveInterviewPrepJobFingerprint(ctx);
      if (!fp || byFingerprint.has(fp)) continue;
      byFingerprint.set(fp, {
        key: `local-${fp}`,
        source: "local",
        title: displayTitleForScoreRow(row),
        occupation: row.occupationName || null,
        date: row.createdAt,
        sess: null,
        row,
      });
    }

    return [...byFingerprint.values()].sort((a, b) => {
      const ta = a.date != null ? new Date(a.date).getTime() : 0;
      const tb = b.date != null ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [cloudSessions, localRows]);

  const openItem = (item) => {
    if (item.source === "cloud" && item.sess) {
      const ctx = jobContextFromInterviewSessionSummary(item.sess);
      if (!ctx) return;
      applyInterviewPrepJobContext(ctx);
      goToInterviewPrepWorkspaceFromListing(navigate);
      return;
    }
    if (item.source === "local" && item.row && resumeInterviewPrepFromSavedScoreRow(item.row)) {
      goToInterviewPrepWorkspaceFromListing(navigate);
    }
  };

  if (!listItems.length) {
    return (
      <p className="saved-scores-page__empty">
        No saved interview prep yet.{" "}
        <Link to="/simplify-job-description">Simplify a job posting</Link> and choose{" "}
        <strong>Start preparing for interview</strong>, or sign in and work through a job here so it can sync to your
        account.
      </p>
    );
  }

  return (
    <ul className="saved-results-sublist">
      {listItems.map((item) => (
        <li key={item.key} className="saved-results-subcard">
          <div className="saved-results-subcard__text">
            <p className="saved-results-subcard__title">{item.title}</p>
            {item.occupation ? (
              <p className="saved-results-subcard__meta">
                <span className="saved-scores-card__occ-label">Role profile used:</span> {item.occupation}
              </p>
            ) : null}
            <p className="saved-results-subcard__date">{formatListDate(item.date)}</p>
          </div>
          <div className="saved-results-subcard__actions">
            <button type="button" className="saved-results-resume-btn" onClick={() => openItem(item)}>
              Resume interview prep
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

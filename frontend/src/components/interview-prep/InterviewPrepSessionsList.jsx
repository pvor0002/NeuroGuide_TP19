import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  deleteInterviewPrepProgress,
  fetchInterviewPrepSessions,
} from "../../services/interviewPrepProgressApi.js";
import { hasCloudSessionCredentials, readCredentials } from "../../utils/cloudSync.js";
import { displayTitleForScoreRow, mergeScoreRowsForHub } from "../../utils/experienceHubJobs.js";
import {
  deriveInterviewPrepJobFingerprint,
  jobContextFromInterviewSessionSummary,
  jobContextFromSavedScoreRow,
} from "../../utils/interviewPrepHelpers.js";
import {
  applyInterviewPrepJobContext,
  clearInterviewPrepLocalWorkspace,
  dismissInterviewPrepListingFingerprint,
  getActiveInterviewPrepFingerprint,
  readInterviewPrepDismissedFingerprints,
  resumeInterviewPrepFromSavedScoreRow,
} from "../../utils/interviewPrepResume.js";
import { clearWorkspaceForFingerprint } from "../../utils/interviewPrepStorage.js";
import { goToInterviewPrepWorkspaceFromListing } from "../../utils/interviewPrepNav.js";
import { interviewSessionLabelForSaved } from "../../utils/interviewPrepSessionLabels.js";
import ListItemTrashButton from "../saved-results/ListItemTrashButton.jsx";
import { useConfirmAction } from "../../hooks/useConfirmAction.jsx";

function formatListDate(value) {
  if (value == null) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function InterviewPrepSessionsList() {
  const navigate = useNavigate();
  const { confirm, modalElement } = useConfirmAction();
  const localRows = mergeScoreRowsForHub().filter((row) => jobContextFromSavedScoreRow(row));
  const [cloudSessions, setCloudSessions] = useState([]);
  const [dismissed, setDismissed] = useState(() => readInterviewPrepDismissedFingerprints());
  const [deletingKey, setDeletingKey] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

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
        fingerprint: fp,
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
      if (!fp || byFingerprint.has(fp) || dismissed.has(fp)) continue;
      byFingerprint.set(fp, {
        key: `local-${fp}`,
        fingerprint: fp,
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
  }, [cloudSessions, localRows, dismissed]);

  const openItem = (item) => {
    if (deletingKey) return;
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

  const runDeleteItem = async (item) => {
    setDeleteError(null);
    setDeletingKey(item.key);

    try {
      if (item.source === "cloud" && item.sess) {
        const cred = readCredentials();
        if (!cred?.userId || !cred?.passKey) {
          throw new Error("Sign in via Settings to delete cloud saves.");
        }
        await deleteInterviewPrepProgress(cred, item.fingerprint);
        setCloudSessions((prev) =>
          prev.filter((s) => String(s.job_fingerprint || "").trim() !== item.fingerprint),
        );
      } else {
        dismissInterviewPrepListingFingerprint(item.fingerprint);
        setDismissed(readInterviewPrepDismissedFingerprints());
      }

      clearWorkspaceForFingerprint(item.fingerprint);
      if (getActiveInterviewPrepFingerprint() === item.fingerprint) {
        clearInterviewPrepLocalWorkspace();
      }
    } catch (err) {
      setDeleteError(err?.message || "Could not delete interview prep.");
    } finally {
      setDeletingKey(null);
    }
  };

  const deleteItem = (item) => {
    if (deletingKey) return;
    const isCloud = item.source === "cloud";
    confirm({
      title: isCloud ? "Delete saved interview prep?" : "Remove from interview prep list?",
      message: isCloud
        ? `Remove interview prep for "${item.title}" from your account. This cannot be undone.`
        : `Hide "${item.title}" from this list on this device. Your saved job score is not deleted.`,
      confirmLabel: isCloud ? "Delete" : "Remove",
      onConfirm: () => runDeleteItem(item),
    });
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
    <>
      {modalElement}
      {deleteError ? <p className="saved-results-panel__hint saved-results-panel__hint--error">{deleteError}</p> : null}
      <ul className="saved-results-sublist">
        {listItems.map((item) => {
          const isDeleting = deletingKey === item.key;
          return (
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
                <button
                  type="button"
                  className="saved-results-resume-btn"
                  disabled={Boolean(deletingKey)}
                  onClick={() => openItem(item)}
                >
                  Resume interview prep
                </button>
                <ListItemTrashButton
                  busy={isDeleting}
                  disabled={Boolean(deletingKey)}
                  label="Delete interview prep"
                  onClick={() => deleteItem(item)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

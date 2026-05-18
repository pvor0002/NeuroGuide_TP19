import { deriveInterviewPrepJobFingerprint, jobContextFromSavedScoreRow } from "./interviewPrepHelpers.js";
import {
  clearAllInterviewPrepWorkspaces,
  clearWorkspaceForFingerprint,
  getActiveInterviewPrepFingerprint,
  setActiveInterviewPrepFingerprint,
  saveWorkspaceJobContext,
} from "./interviewPrepStorage.js";

const JOB_CTX_KEY = "neuroguide.interviewPrep.jobContext.v1";

function parseLocalJson(key) {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist job context for Interview Prep and mark the active per-job workspace.
 * @param {object} jobContext
 */
export function applyInterviewPrepJobContext(jobContext) {
  if (typeof window === "undefined" || !jobContext || typeof jobContext !== "object") return;
  const nextFp = deriveInterviewPrepJobFingerprint(jobContext);
  try {
    window.localStorage.setItem(JOB_CTX_KEY, JSON.stringify(jobContext));
    setActiveInterviewPrepFingerprint(nextFp);
    saveWorkspaceJobContext(nextFp, jobContext);
  } catch {
    /* ignore */
  }
}

/**
 * @param {unknown} savedScoreRow
 * @returns {boolean} true if a valid context was applied
 */
export function resumeInterviewPrepFromSavedScoreRow(savedScoreRow) {
  const ctx = jobContextFromSavedScoreRow(savedScoreRow);
  if (!ctx) return false;
  applyInterviewPrepJobContext(ctx);
  return true;
}

/** Clear local interview prep workspace keys (organised cards, saved answers). */
export { getActiveInterviewPrepFingerprint } from "./interviewPrepStorage.js";

export function clearInterviewPrepLocalWorkspace() {
  if (typeof window === "undefined") return;
  const fp = getActiveInterviewPrepFingerprint();
  if (fp) {
    clearWorkspaceForFingerprint(fp);
    return;
  }
  clearAllInterviewPrepWorkspaces();
}

const DISMISSED_KEY = "neuroguide.interviewPrep.dismissed.v1";

function readDismissedFingerprints() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function readInterviewPrepDismissedFingerprints() {
  return readDismissedFingerprints();
}

/** Hide a local-only listing row without deleting the underlying job score. */
export function dismissInterviewPrepListingFingerprint(jobFingerprint) {
  const fp = String(jobFingerprint || "").trim();
  if (!fp || typeof window === "undefined") return;
  const set = readDismissedFingerprints();
  set.add(fp);
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

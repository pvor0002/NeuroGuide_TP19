import { deriveInterviewPrepJobFingerprint, jobContextFromSavedScoreRow } from "./interviewPrepHelpers.js";

const JOB_CTX_KEY = "neuroguide.interviewPrep.jobContext.v1";
const ORG_KEY = "neuroguide.interviewPrep.organised.v1";
const SAVED_KEY = "neuroguide.interviewPrep.savedAnswers.v3";

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
 * Persist job context for Interview Prep. If the job fingerprint changes, clears local
 * organised workspace and saved answers so the next visit does not mix Q/A across jobs.
 * @param {object} jobContext
 */
export function applyInterviewPrepJobContext(jobContext) {
  if (typeof window === "undefined" || !jobContext || typeof jobContext !== "object") return;
  const prev = parseLocalJson(JOB_CTX_KEY);
  const nextFp = deriveInterviewPrepJobFingerprint(jobContext);
  const prevFp = prev ? deriveInterviewPrepJobFingerprint(prev) : null;
  try {
    window.localStorage.setItem(JOB_CTX_KEY, JSON.stringify(jobContext));
    if (prevFp !== nextFp) {
      window.localStorage.removeItem(ORG_KEY);
      window.localStorage.removeItem(SAVED_KEY);
    }
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

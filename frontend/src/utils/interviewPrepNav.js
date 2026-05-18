import { getActiveInterviewPrepFingerprint } from "./interviewPrepStorage.js";

/** sessionStorage: user is in an active interview prep workspace this browser tab session. */
const WORKSPACE_SESSION_KEY = "ng_interview_prep_in_workspace_v1";
/** One-shot: open workspace on Brain dump (step 1) after picking a job from the listing. */
const START_AT_STEP1_KEY = "ng_interview_prep_start_step1_v1";

export const INTERVIEW_PREP_LIST_PATH = "/interview-prep";
export const INTERVIEW_PREP_SESSION_PATH = "/interview-prep/session";

export function markInterviewPrepInWorkspace() {
  try {
    sessionStorage.setItem(WORKSPACE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearInterviewPrepWorkspaceSession() {
  try {
    sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
    sessionStorage.removeItem(START_AT_STEP1_KEY);
  } catch {
    /* ignore */
  }
}

export function isInterviewPrepInWorkspaceSession() {
  try {
    return sessionStorage.getItem(WORKSPACE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markInterviewPrepStartAtStep1() {
  try {
    sessionStorage.setItem(START_AT_STEP1_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Read without clearing (safe for render / Strict Mode double mount). */
export function peekInterviewPrepStartAtStep1() {
  try {
    return sessionStorage.getItem(START_AT_STEP1_KEY) === "1";
  } catch {
    return false;
  }
}

/** @returns {boolean} true only once per listing → workspace entry */
export function consumeInterviewPrepStartAtStep1() {
  try {
    if (sessionStorage.getItem(START_AT_STEP1_KEY) === "1") {
      sessionStorage.removeItem(START_AT_STEP1_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Listing → workspace: keep Brain dump (step 1) until the user moves forward manually.
 * Do not clear on cloud hydrate (Strict Mode may run hydrate twice).
 * @param {{ current: boolean }} lockRef
 */
export function isListingEntryStepLockActive(lockRef) {
  if (lockRef?.current) return true;
  if (peekInterviewPrepStartAtStep1()) {
    if (lockRef) lockRef.current = true;
    return true;
  }
  return false;
}

/** @param {{ current: boolean }} lockRef */
export function releaseListingEntryStepLock(lockRef) {
  if (lockRef) lockRef.current = false;
  consumeInterviewPrepStartAtStep1();
}

/** @param {import('react-router-dom').NavigateFunction} navigate */
export function goToInterviewPrepWorkspace(navigate) {
  markInterviewPrepInWorkspace();
  navigate(INTERVIEW_PREP_SESSION_PATH);
}

/** Listing → workspace: always land on Brain dump (step 1). */
export function goToInterviewPrepWorkspaceFromListing(navigate) {
  markInterviewPrepInWorkspace();
  markInterviewPrepStartAtStep1();
  const fp = getActiveInterviewPrepFingerprint() || "";
  navigate(INTERVIEW_PREP_SESSION_PATH, {
    state: { ipSessionKey: fp, ipMountNonce: Date.now() },
  });
}

export function goToInterviewPrepWorkspaceHard() {
  markInterviewPrepInWorkspace();
  window.location.assign(INTERVIEW_PREP_SESSION_PATH);
}

/** Leave workspace and show the job listing (clears in-tab return redirect). */
export function goToInterviewPrepListing(navigate) {
  clearInterviewPrepWorkspaceSession();
  navigate(INTERVIEW_PREP_LIST_PATH, { state: { preferListing: true } });
}

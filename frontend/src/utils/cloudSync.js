/**
 * Pack / unpack browser storage for RDS session sync.
 */

import {
  deleteCloudAllUserData,
  deleteCloudProfileOnly,
  fullSyncSession,
  isCloudSessionApiAvailable,
  loginWithPassKey,
  patchConsentSession,
  registerSession,
} from "../services/sessionApi.js";

async function registerThenRetrySync(cred, consent, payload) {
  await registerSession({
    user_id: cred.userId,
    pass_key: cred.passKey,
    consent,
    career_wizard: payload.career_wizard ?? null,
    job_workbench: payload.job_workbench ?? null,
  });
  const snap = await fullSyncSession(cred, payload);
  applySessionSnapshotToStorage(snap, { passKey: cred.passKey });
  return snap;
}

export const PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";
export const CONSENT_STORAGE_KEY = "ng_data_consent_v1";
export const USER_CREDENTIALS_STORAGE_KEY = "ng_local_user_credentials_v1";

const JOB_RESULT_KEY = "neuroguide.simplifiedResult.v1";
const JOB_INPUT_PREFIX = "neuroguide.jobInput.v1";
const JOB_SCORE_KEY = "neuroguide.jobScore.v1";
const JOB_SCORE_HISTORY_KEY = "neuroguide.jobScore.history.v1";

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readCredentials() {
  return readJSON(USER_CREDENTIALS_STORAGE_KEY);
}

export function readConsent() {
  return readJSON(CONSENT_STORAGE_KEY);
}

/** Cloud sync when consent is accepted, credentials exist, and API is configured. */
export function shouldSyncToCloud() {
  if (!isCloudSessionApiAvailable()) return false;
  const c = readConsent();
  const cred = readCredentials();
  return Boolean(c?.status === "accepted" && cred?.userId && cred?.passKey);
}

/** Pass key + user id exist (e.g. delete profile on server even if consent is withdrawn). */
export function hasCloudSessionCredentials() {
  if (!isCloudSessionApiAvailable()) return false;
  const cred = readCredentials();
  return Boolean(cred?.userId && cred?.passKey);
}

function notifySessionStorageApplied() {
  try {
    window.dispatchEvent(new CustomEvent("ng-cloud-session-applied"));
  } catch {
    /* ignore */
  }
}

/**
 * Pull latest snapshot from RDS without sending new career/job payloads (PUT body all null).
 * Use after server-side deletes or to resync localStorage from the database.
 */
export async function pullCloudSessionSnapshot() {
  const cred = readCredentials();
  if (!cred?.userId || !cred?.passKey || !isCloudSessionApiAvailable()) return null;
  const snap = await fullSyncSession(cred, {
    consent: null,
    career_wizard: null,
    job_workbench: null,
  });
  applySessionSnapshotToStorage(snap, { passKey: cred.passKey });
  return snap;
}

/**
 * When ``PUT /pg/session/sync`` fails with 404 (API not deployed or wrong URL), the app can
 * fall back to the older anonymous ``/profiles`` flow so the wizard still saves.
 */
export function isCloudSessionUnreachableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("could not reach the session")) return true;
  if (msg.includes("session api") && (msg.includes("404") || msg.includes("not found"))) return true;
  if (msg.includes("request failed (404)")) return true;
  return false;
}

export function buildCareerWizardBlob() {
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

export function buildJobWorkbenchBlob() {
  return {
    v: 1,
    [JOB_RESULT_KEY]: readJSON(JOB_RESULT_KEY),
    [`${JOB_INPUT_PREFIX}.mode`]: window.localStorage.getItem(`${JOB_INPUT_PREFIX}.mode`),
    [`${JOB_INPUT_PREFIX}.text`]: window.localStorage.getItem(`${JOB_INPUT_PREFIX}.text`),
    [`${JOB_INPUT_PREFIX}.fileText`]: window.localStorage.getItem(`${JOB_INPUT_PREFIX}.fileText`),
    [JOB_SCORE_KEY]: readJSON(JOB_SCORE_KEY),
    [JOB_SCORE_HISTORY_KEY]: readJSON(JOB_SCORE_HISTORY_KEY),
  };
}

function writeJSON(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function setItemRaw(key, value) {
  try {
    if (value == null || value === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

/**
 * Apply payload returned from login/sync (career_profile + job_workbench).
 * @param {object} snap
 * @param {{ passKey?: string }} [meta]
 */
export function applySessionSnapshotToStorage(snap, meta = {}) {
  if (snap.user_id && meta.passKey) {
    const created =
      snap.user_created_at != null
        ? typeof snap.user_created_at === "string"
          ? snap.user_created_at
          : new Date(snap.user_created_at).toISOString()
        : new Date().toISOString();
    writeJSON(USER_CREDENTIALS_STORAGE_KEY, {
      userId: snap.user_id,
      passKey: meta.passKey,
      createdAt: created,
    });
  }

  if (snap.consent && typeof snap.consent === "object") {
    writeJSON(CONSENT_STORAGE_KEY, snap.consent);
  } else if (snap.consent_granted === false) {
    writeJSON(CONSENT_STORAGE_KEY, {
      status: "declined",
      acknowledgedAt: new Date().toISOString(),
    });
  }

  if (Object.prototype.hasOwnProperty.call(snap, "career_profile")) {
    if (snap.career_profile && typeof snap.career_profile === "object") {
      writeJSON(PROFILE_STORAGE_KEY, snap.career_profile);
    } else {
      try {
        window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(snap, "job_workbench")) {
    if (snap.job_workbench && typeof snap.job_workbench === "object") {
      applyJobWorkbenchBlob(snap.job_workbench);
    } else {
      try {
        window.localStorage.removeItem(JOB_RESULT_KEY);
        window.localStorage.removeItem(JOB_SCORE_KEY);
        window.localStorage.removeItem(JOB_SCORE_HISTORY_KEY);
        window.localStorage.removeItem(`${JOB_INPUT_PREFIX}.mode`);
        window.localStorage.removeItem(`${JOB_INPUT_PREFIX}.text`);
        window.localStorage.removeItem(`${JOB_INPUT_PREFIX}.fileText`);
      } catch {
        /* ignore */
      }
    }
  }

  notifySessionStorageApplied();
}

function applyJobWorkbenchBlob(blob) {
  if (!blob || typeof blob !== "object") return;
  if (blob[JOB_RESULT_KEY] !== undefined) writeJSON(JOB_RESULT_KEY, blob[JOB_RESULT_KEY]);
  if (blob[JOB_SCORE_KEY] !== undefined) writeJSON(JOB_SCORE_KEY, blob[JOB_SCORE_KEY]);
  if (blob[JOB_SCORE_HISTORY_KEY] !== undefined) writeJSON(JOB_SCORE_HISTORY_KEY, blob[JOB_SCORE_HISTORY_KEY]);
  setItemRaw(`${JOB_INPUT_PREFIX}.mode`, blob[`${JOB_INPUT_PREFIX}.mode`]);
  setItemRaw(`${JOB_INPUT_PREFIX}.text`, blob[`${JOB_INPUT_PREFIX}.text`]);
  setItemRaw(`${JOB_INPUT_PREFIX}.fileText`, blob[`${JOB_INPUT_PREFIX}.fileText`]);
}

export async function registerCloudAccountFromLocalState() {
  const cred = readCredentials();
  const consent = readConsent();
  if (!cred?.userId || !cred?.passKey || consent?.status !== "accepted") {
    throw new Error("Consent and credentials must exist before registering.");
  }
  const snap = await registerSession({
    user_id: cred.userId,
    pass_key: cred.passKey,
    consent,
    career_wizard: buildCareerWizardBlob(),
    job_workbench: buildJobWorkbenchBlob(),
  });
  applySessionSnapshotToStorage(snap, { passKey: cred.passKey });
  return snap;
}

export async function syncFullCloudFromLocalState() {
  if (!shouldSyncToCloud()) return null;
  const cred = readCredentials();
  const consent = readConsent();
  const payload = {
    consent,
    career_wizard: buildCareerWizardBlob(),
    job_workbench: buildJobWorkbenchBlob(),
  };

  try {
    const snap = await fullSyncSession(cred, payload);
    applySessionSnapshotToStorage(snap, { passKey: cred.passKey });
    return snap;
  } catch (err) {
    const status = /** @type {{ status?: number }} */ (err)?.status;
    /* Sync requires rows in user_credentials — create them if consent modal skipped POST /register */
    if (status === 401) {
      try {
        return await registerThenRetrySync(cred, consent, payload);
      } catch (regErr) {
        const rs = /** @type {{ status?: number }} */ (regErr)?.status;
        if (rs === 409) {
          const snap = await fullSyncSession(cred, payload);
          applySessionSnapshotToStorage(snap, { passKey: cred.passKey });
          return snap;
        }
        throw regErr;
      }
    }
    throw err;
  }
}

export async function loginWithPassKeyAndApply(passKey) {
  const snap = await loginWithPassKey(passKey.trim());
  applySessionSnapshotToStorage(snap, { passKey: passKey.trim() });
  return snap;
}

export async function revokeConsentOnServer() {
  const cred = readCredentials();
  if (!cred?.userId || !cred?.passKey || !isCloudSessionApiAvailable()) return;
  const declined = {
    status: "declined",
    acknowledgedAt: new Date().toISOString(),
  };
  await patchConsentSession(cred, {
    consent_granted: false,
    consent: declined,
  });
}

export async function syncConsentToServer() {
  const cred = readCredentials();
  if (!cred?.userId || !cred?.passKey || !isCloudSessionApiAvailable()) return;
  const consent = readConsent();
  if (!consent) return;
  await patchConsentSession(cred, {
    consent_granted: consent.status === "accepted",
    consent,
  });
}

export async function clearCloudProfileAnswers() {
  const cred = readCredentials();
  if (!cred?.userId || !cred?.passKey || !isCloudSessionApiAvailable()) return;
  await deleteCloudProfileOnly(cred);
  await pullCloudSessionSnapshot();
}

export async function clearAllCloudUserData() {
  const cred = readCredentials();
  if (!cred?.userId || !cred?.passKey || !isCloudSessionApiAvailable()) return;
  await deleteCloudAllUserData(cred);
}

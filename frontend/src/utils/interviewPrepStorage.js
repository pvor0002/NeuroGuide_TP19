/**
 * Per-job interview prep workspace in localStorage (questions, bundles, answers).
 */

import { deriveInterviewPrepJobFingerprint } from "./interviewPrepHelpers.js";

const BY_JOB_KEY = "neuroguide.interviewPrep.byJob.v2";
const ACTIVE_FP_KEY = "neuroguide.interviewPrep.activeFingerprint.v1";

/** @deprecated — migrated into byJob */
const LEGACY_JOB_CTX = "neuroguide.interviewPrep.jobContext.v1";
const LEGACY_ORG = "neuroguide.interviewPrep.organised.v1";
const LEGACY_SAVED = "neuroguide.interviewPrep.savedAnswers.v3";
const LEGACY_AI = "neuroguide.interviewPrep.aiQuestions.v1";

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStore() {
  if (typeof window === "undefined") return {};
  const parsed = safeParse(window.localStorage.getItem(BY_JOB_KEY));
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeStore(store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BY_JOB_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

function normalizeFp(fp) {
  return String(fp || "").trim();
}

function emptyEntry() {
  return {
    org: null,
    savedAnswers: [],
    aiQuestions: null,
    jobContext: null,
  };
}

function migrateLegacyForFingerprint(fp) {
  if (typeof window === "undefined") return null;
  const key = normalizeFp(fp);
  if (!key) return null;

  const store = readStore();
  const existing = store[key];
  if (existing && (existing.org || (existing.savedAnswers || []).length)) {
    return existing;
  }

  const legacyOrg = safeParse(window.localStorage.getItem(LEGACY_ORG));
  const legacySaved = safeParse(window.localStorage.getItem(LEGACY_SAVED));
  const legacyCtx = safeParse(window.localStorage.getItem(LEGACY_JOB_CTX));
  const legacyAi = safeParse(window.localStorage.getItem(LEGACY_AI));

  const legacyFp = legacyCtx ? deriveInterviewPrepJobFingerprint(legacyCtx) : null;
  const hasLegacy = legacyOrg || (Array.isArray(legacySaved) && legacySaved.length > 0);
  if (!hasLegacy) return existing || null;

  if (legacyFp && legacyFp !== key) {
    return existing || null;
  }

  const entry = {
    org: legacyOrg && typeof legacyOrg === "object" ? legacyOrg : null,
    savedAnswers: Array.isArray(legacySaved) ? legacySaved : [],
    aiQuestions:
      legacyAi && typeof legacyAi === "object" && Array.isArray(legacyAi.questions)
        ? { simpVer: legacyAi.simpVer, questions: legacyAi.questions }
        : null,
    jobContext: legacyCtx && typeof legacyCtx === "object" ? legacyCtx : null,
  };

  store[key] = { ...emptyEntry(), ...entry };
  writeStore(store);
  return store[key];
}

export function getActiveInterviewPrepFingerprint() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_FP_KEY);
  return raw ? normalizeFp(raw) : null;
}

export function setActiveInterviewPrepFingerprint(fp) {
  if (typeof window === "undefined") return;
  const key = normalizeFp(fp);
  if (!key) return;
  try {
    window.localStorage.setItem(ACTIVE_FP_KEY, key);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} fp
 * @returns {{ org: object | null, savedAnswers: unknown[], aiQuestions: { simpVer: unknown, questions: string[] } | null, jobContext: object | null }}
 */
export function loadWorkspaceForFingerprint(fp) {
  const key = normalizeFp(fp);
  if (!key) return emptyEntry();

  migrateLegacyForFingerprint(key);
  const store = readStore();
  const row = store[key];
  if (!row || typeof row !== "object") return emptyEntry();

  return {
    org: row.org && typeof row.org === "object" ? row.org : null,
    savedAnswers: Array.isArray(row.savedAnswers) ? row.savedAnswers : [],
    aiQuestions:
      row.aiQuestions && typeof row.aiQuestions === "object" && Array.isArray(row.aiQuestions.questions)
        ? row.aiQuestions
        : null,
    jobContext: row.jobContext && typeof row.jobContext === "object" ? row.jobContext : null,
  };
}

function patchWorkspace(fp, patch) {
  const key = normalizeFp(fp);
  if (!key) return;
  const store = readStore();
  const prev = store[key] && typeof store[key] === "object" ? store[key] : emptyEntry();
  store[key] = { ...emptyEntry(), ...prev, ...patch };
  writeStore(store);
}

export function saveWorkspaceOrg(fp, org) {
  patchWorkspace(fp, { org });
}

export function saveWorkspaceSavedAnswers(fp, savedAnswers) {
  patchWorkspace(fp, { savedAnswers: Array.isArray(savedAnswers) ? savedAnswers : [] });
}

export function saveWorkspaceJobContext(fp, jobContext) {
  patchWorkspace(fp, { jobContext });
}

/**
 * @param {string} fp
 * @param {{ simpVer: unknown, questions: string[] }} payload
 */
export function saveWorkspaceAiQuestions(fp, payload) {
  patchWorkspace(fp, {
    aiQuestions: {
      simpVer: payload?.simpVer ?? null,
      questions: Array.isArray(payload?.questions) ? payload.questions : [],
    },
  });
}

/**
 * @param {object} jobContext
 * @param {unknown} simpVer
 * @returns {string[]}
 */
export function loadAiQuestionsForJob(jobContext, simpVer) {
  const fp = deriveInterviewPrepJobFingerprint(jobContext);
  const ws = loadWorkspaceForFingerprint(fp);
  const ai = ws.aiQuestions;
  if (!ai || ai.simpVer !== simpVer) return [];
  return Array.isArray(ai.questions) ? ai.questions : [];
}

/**
 * @param {object} jobContext
 * @param {{ simpVer: unknown, questions: string[] }} payload
 */
export function saveAiQuestionsForJob(jobContext, payload) {
  const fp = deriveInterviewPrepJobFingerprint(jobContext);
  saveWorkspaceAiQuestions(fp, payload);
}

export function clearWorkspaceForFingerprint(fp) {
  const key = normalizeFp(fp);
  if (!key || typeof window === "undefined") return;
  const store = readStore();
  if (store[key]) {
    delete store[key];
    writeStore(store);
  }
  if (getActiveInterviewPrepFingerprint() === key) {
    try {
      window.localStorage.removeItem(ACTIVE_FP_KEY);
      window.localStorage.removeItem(LEGACY_JOB_CTX);
    } catch {
      /* ignore */
    }
  }
}

/** Remove all per-job workspaces (settings / delete all). */
export function clearAllInterviewPrepWorkspaces() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BY_JOB_KEY);
    window.localStorage.removeItem(ACTIVE_FP_KEY);
    window.localStorage.removeItem(LEGACY_JOB_CTX);
    window.localStorage.removeItem(LEGACY_ORG);
    window.localStorage.removeItem(LEGACY_SAVED);
    window.localStorage.removeItem(LEGACY_AI);
  } catch {
    /* ignore */
  }
}

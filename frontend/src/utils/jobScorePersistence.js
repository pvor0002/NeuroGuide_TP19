export const JOB_SCORE_STORAGE_KEY = "neuroguide.jobScore.v1";
export const JOB_SCORE_HISTORY_STORAGE_KEY = "neuroguide.jobScore.history.v1";
/** User-explicit saves only (shown on My Saved Scores); not auto-filled from each match run. */
export const JOB_SCORE_SAVED_STORAGE_KEY = "neuroguide.jobScore.saved.v1";
const MAX_HISTORY_ITEMS = 12;
const MAX_SAVED_ITEMS = 24;

export function normalizeJobTitleKey(title) {
  return String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isJobScoreCacheValid(cached, simplifiedResult) {
  if (!cached?.result || !simplifiedResult?.job_title) return false;
  if (normalizeJobTitleKey(cached.jobTitleNorm) !== normalizeJobTitleKey(simplifiedResult.job_title)) return false;
  const curStamp = simplifiedResult._ng_simp_ver;
  if (curStamp != null) return cached.simplifiedVerStamp === curStamp;
  return cached.simplifiedVerStamp == null;
}

export function readPersistedJobScore() {
  try {
    const raw = window.localStorage.getItem(JOB_SCORE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.jobTitleNorm || !data?.result) return null;
    return {
      jobTitleNorm: String(data.jobTitleNorm),
      simplifiedVerStamp: data.simplifiedVerStamp ?? null,
      occupationName: String(data.occupationName || ""),
      result: data.result,
    };
  } catch {
    return null;
  }
}

export function writePersistedJobScore(jobTitleNorm, simplifiedVerStamp, occupationName, result) {
  try {
    if (!jobTitleNorm || !result) return;
    window.localStorage.setItem(
      JOB_SCORE_STORAGE_KEY,
      JSON.stringify({
        jobTitleNorm,
        simplifiedVerStamp: simplifiedVerStamp ?? null,
        occupationName: occupationName || "",
        result,
      }),
    );
  } catch {
    // ignore localStorage failures
  }
}

export function clearPersistedJobScore() {
  try {
    window.localStorage.removeItem(JOB_SCORE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readJobScoreHistory() {
  try {
    const raw = window.localStorage.getItem(JOB_SCORE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((it) => it && typeof it === "object").slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function appendJobScoreHistory(entry) {
  try {
    if (!entry?.jobTitleNorm || !entry?.result) return;
    const prev = readJobScoreHistory();
    const deduped = prev.filter(
      (it) => !(it.jobTitleNorm === entry.jobTitleNorm && it.simplifiedVerStamp === entry.simplifiedVerStamp),
    );
    const next = [
      {
        ...entry,
        jobTitleDisplay: entry.jobTitleDisplay != null ? String(entry.jobTitleDisplay) : "",
        createdAt: entry.createdAt || Date.now(),
      },
      ...deduped,
    ].slice(0, MAX_HISTORY_ITEMS);
    window.localStorage.setItem(JOB_SCORE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Same identity as used when de-duping history (title + simplify stamp + createdAt). */
export function jobScoreHistoryEntriesEqual(a, b) {
  if (!a || !b) return false;
  return (
    String(a.jobTitleNorm || "") === String(b.jobTitleNorm || "") &&
    (a.simplifiedVerStamp ?? null) === (b.simplifiedVerStamp ?? null) &&
    (a.createdAt ?? null) === (b.createdAt ?? null)
  );
}

export function removeJobScoreHistoryEntry(entry) {
  try {
    if (!entry?.jobTitleNorm) return readJobScoreHistory();
    const prev = readJobScoreHistory();
    const next = prev.filter((it) => !jobScoreHistoryEntriesEqual(it, entry));
    window.localStorage.setItem(JOB_SCORE_HISTORY_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readJobScoreHistory();
  }
}

export function readSavedJobScores() {
  try {
    const raw = window.localStorage.getItem(JOB_SCORE_SAVED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((it) => it && typeof it === "object").slice(0, MAX_SAVED_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Persist one explicit save. Stores score as a whole number (0–100).
 * De-dupes an existing row with the same normalized title + simplify stamp (latest save wins).
 */
export function appendSavedJobScore(entry) {
  try {
    if (!entry?.jobTitleNorm || !entry?.result) return;
    const rounded = Math.round(Number(entry.result.score ?? NaN));
    if (!Number.isFinite(rounded)) return;
    const prev = readSavedJobScores();
    const deduped = prev.filter(
      (it) => !(it.jobTitleNorm === entry.jobTitleNorm && it.simplifiedVerStamp === entry.simplifiedVerStamp),
    );
    const resultStored = { ...entry.result, score: rounded };
    const next = [
      {
        ...entry,
        jobTitleDisplay: entry.jobTitleDisplay != null ? String(entry.jobTitleDisplay) : "",
        createdAt: entry.createdAt || Date.now(),
        result: resultStored,
      },
      ...deduped,
    ].slice(0, MAX_SAVED_ITEMS);
    window.localStorage.setItem(JOB_SCORE_SAVED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Same identity keys as history rows (for delete / detail lookup). */
export function savedJobScoreEntriesEqual(a, b) {
  return jobScoreHistoryEntriesEqual(a, b);
}

export function removeSavedJobScoreEntry(entry) {
  try {
    if (!entry?.jobTitleNorm) return readSavedJobScores();
    const prev = readSavedJobScores();
    const next = prev.filter((it) => !savedJobScoreEntriesEqual(it, entry));
    window.localStorage.setItem(JOB_SCORE_SAVED_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readSavedJobScores();
  }
}

/** Minimum compatibility score (0–100) to open interview prep. */
export const INTERVIEW_PREP_MIN_SCORE = 50;

export function jobMatchScorePercent(result) {
  const n = Number(result?.score);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function titleNormsForScoreRow(row) {
  const keys = new Set();
  const add = (v) => {
    const k = normalizeJobTitleKey(v);
    if (k) keys.add(k);
  };
  add(row?.jobTitleNorm);
  add(row?.jobTitleDisplay);
  add(row?.simplifiedSnapshot?.job_title);
  return keys;
}

/** Best saved/history row for a job title (includes rows with simplify snapshot when available). */
export function findJobScoreRowForTitle(jobTitle) {
  const norm = normalizeJobTitleKey(jobTitle);
  if (!norm) return null;

  for (const row of [...readSavedJobScores(), ...readJobScoreHistory()]) {
    if (!row?.result) continue;
    if (titleNormsForScoreRow(row).has(norm)) return row;
  }

  const persisted = readPersistedJobScore();
  if (persisted?.result && normalizeJobTitleKey(persisted.jobTitleNorm) === norm) {
    return {
      jobTitleNorm: persisted.jobTitleNorm,
      jobTitleDisplay: "",
      simplifiedVerStamp: persisted.simplifiedVerStamp ?? null,
      occupationName: persisted.occupationName || "",
      result: persisted.result,
      simplifiedSnapshot: null,
    };
  }
  return null;
}

export function interviewPrepEligibilityForJobTitle(jobTitle) {
  const scoreRow = findJobScoreRowForTitle(jobTitle);
  if (!scoreRow?.result) {
    return { eligible: false, hasScore: false, scorePct: null, scoreRow: null };
  }
  const scorePct = jobMatchScorePercent(scoreRow.result);
  return {
    eligible: scorePct != null && scorePct >= INTERVIEW_PREP_MIN_SCORE,
    hasScore: scorePct != null,
    scorePct,
    scoreRow,
  };
}

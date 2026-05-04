export const JOB_SCORE_STORAGE_KEY = "neuroguide.jobScore.v1";
export const JOB_SCORE_HISTORY_STORAGE_KEY = "neuroguide.jobScore.history.v1";
const MAX_HISTORY_ITEMS = 12;

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

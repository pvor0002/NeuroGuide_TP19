const STORAGE_KEY = "neuroguide.dayInLife.recents.v1";
const MAX_ITEMS = 30;

/**
 * Remember a Day in the Life session so it appears under Saved Results.
 * @param {string} jobTitle
 * @param {string} adhdType
 */
export function recordDayInLifeRecent(jobTitle, adhdType) {
  if (typeof window === "undefined") return;
  const job = String(jobTitle || "").trim();
  const adhd = String(adhdType || "").trim().toLowerCase();
  if (!job || !adhd) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const prev = Array.isArray(parsed) ? parsed : [];
    const entry = { job_title: job, adhd_type: adhd, updatedAt: Date.now() };
    const deduped = prev.filter(
      (x) =>
        !(
          x &&
          String(x.job_title || "").trim() === job &&
          String(x.adhd_type || "").trim().toLowerCase() === adhd
        ),
    );
    const next = [entry, ...deduped].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Remove one recent timeline from this browser. */
export function removeDayInLifeRecent(jobTitle, adhdType) {
  if (typeof window === "undefined") return;
  const job = String(jobTitle || "").trim();
  const adhd = String(adhdType || "").trim().toLowerCase();
  if (!job || !adhd) return;
  try {
    const prev = readDayInLifeRecents();
    const next = prev.filter(
      (x) =>
        !(
          x &&
          String(x.job_title || "").trim() === job &&
          String(x.adhd_type || "").trim().toLowerCase() === adhd
        ),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** @returns {{ job_title: string, adhd_type: string, updatedAt: number }[]} */
export function readDayInLifeRecents() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x === "object" && String(x.job_title || "").trim());
  } catch {
    return [];
  }
}

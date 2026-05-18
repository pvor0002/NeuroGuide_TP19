/** Session cache keys for Day in the Life timelines (same tab / session). */

export function dilCacheKey(job, adhd) {
  const j = String(job || "").trim();
  const a = String(adhd || "").trim();
  return `dil_cache_${j}|${a}`;
}

export function dilCacheGet(job, adhd) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(dilCacheKey(job, adhd));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function dilCacheSet(job, adhd, timeline) {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(dilCacheKey(job, adhd), JSON.stringify(timeline));
  } catch {
    /* ignore */
  }
}

export function dilCacheRemove(job, adhd) {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(dilCacheKey(job, adhd));
  } catch {
    /* ignore */
  }
}

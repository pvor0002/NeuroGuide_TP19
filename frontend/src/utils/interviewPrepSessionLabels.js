/** Display title for a cloud interview-prep session row. */
export function interviewSessionLabelForSaved(sess) {
  const s = sess?.simplified_job;
  if (!s || typeof s !== "object") return "Saved interview prep";
  const t = String(s.job_title || "").trim();
  if (t) return t.slice(0, 120);
  const bi = String(s.basic_info || "").trim().split("\n")[0];
  return bi ? bi.slice(0, 120) : "Saved interview prep";
}

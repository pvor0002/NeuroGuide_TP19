import { readJobScoreHistory, readSavedJobScores } from "./jobScorePersistence.js";

/** Deduped rows (saved first, then history) for pickers on Day in the Life / Interview Prep. */
export function mergeScoreRowsForHub() {
  const saved = readSavedJobScores();
  const hist = readJobScoreHistory();
  const seen = new Set();
  const out = [];
  for (const row of [...saved, ...hist]) {
    if (!row || typeof row !== "object" || !row.jobTitleNorm) continue;
    const k = `${String(row.jobTitleNorm)}|${row.simplifiedVerStamp ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out.slice(0, 48);
}

export function displayTitleForScoreRow(row) {
  return (row.jobTitleDisplay && String(row.jobTitleDisplay).trim()) || row.jobTitleNorm || "Job";
}

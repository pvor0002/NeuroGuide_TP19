import { readJobScoreHistory } from "./jobScorePersistence.js";
import { parseJobTitleAndCompany } from "./simplifiedJobExport.js";

/**
 * Snapshot shape matches simplified job API / history row from Simplify Job Description.
 * @param {unknown} snap
 */
function simplifiedSnapshotHasContent(snap) {
  if (!snap || typeof snap !== "object") return false;
  if (String(snap.summary ?? "").trim()) return true;
  if (String(snap.job_title ?? "").trim()) return true;
  for (const k of ["basic_info", "responsibilities", "skills_qualifications"]) {
    if (String(snap[k] ?? "").trim()) return true;
  }
  return false;
}

const LAST_SIMPLIFIED_STORAGE_KEY = "neuroguide.simplifiedResult.v1";

/**
 * Latest simplified job from score history (preferred) or last simplified result from Simplify page.
 * @returns {null | { rawText: string, role: string, company: string, skills: string[], skillsManual: string, extractedFromApi: boolean, manualFallback: boolean, simplifiedVerStamp: string | null }}
 */
export function loadJobContextFromSimplifyHistory() {
  const history = readJobScoreHistory();
  const row = history[0];
  let snap = row?.simplifiedSnapshot;
  let stamp = row?.simplifiedVerStamp ?? null;

  if (!snap || !simplifiedSnapshotHasContent(snap)) {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LAST_SIMPLIFIED_STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && simplifiedSnapshotHasContent(parsed)) {
        snap = parsed;
        stamp = parsed._ng_simp_ver ?? stamp;
      }
    } catch {
      /* ignore */
    }
  }

  if (!snap || !simplifiedSnapshotHasContent(snap)) return null;

  const { jobTitle, companyName } = parseJobTitleAndCompany(snap.basic_info ?? "");
  const role = String(snap.job_title ?? "").trim() || jobTitle || String(row?.jobTitleDisplay ?? "").trim() || "";
  const skills = Array.isArray(snap.extracted_skills)
    ? snap.extracted_skills.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    rawText: "",
    role,
    company: companyName,
    skills,
    skillsManual: "",
    extractedFromApi: true,
    manualFallback: false,
    simplifiedVerStamp: stamp,
  };
}

/**
 * Client-side STAR sort when API is unavailable.
 * @param {DumpCard[]} cards
 * @returns {{ situation: string[], action: string[], result: string[], learning: string[] }}
 */
export function heuristicStarSort(cards) {
  /** @type {{ situation: string[], action: string[], result: string[], learning: string[] }} */
  const zones = {
    situation: [],
    action: [],
    result: [],
    learning: [],
  };

  for (const c of cards) {
    const t = String(c.text || "").toLowerCase();
    if (/\b(learned|learning|takeaway|take-away|realised|realized|next time|would do differently|reflect)\b/i.test(t)) {
      zones.learning.push(c.id);
    } else if (/\b(result|outcome|impact|metric|achieved|delivered|increased|reduced|saved|won|percent|%)\b/i.test(t)) {
      zones.result.push(c.id);
    } else if (
      /\b(i did|i built|i led|i owned|i implemented|i fixed|we decided|my role was|i collaborated|i coordinated)\b/i.test(t)
    ) {
      zones.action.push(c.id);
    } else if (
      /\b(when|context|situation|first|initially|challenge|deadline|pressure|at the time|before)\b/i.test(t)
    ) {
      zones.situation.push(c.id);
    } else {
      zones.action.push(c.id);
    }
  }
  return zones;
}

/**
 * @param {{ situation: string[], action: string[], result: string[], learning: string[] }} starZones
 * @param {DumpCard[]} dumpCards
 * @param {string} question
 */
export function buildAnswerDraftFromStar(starZones, dumpCards, question) {
  const byId = Object.fromEntries(dumpCards.map((c) => [c.id, c.text]));
  const parts = [];
  const pushZone = (label, keys) => {
    const texts = keys.map((id) => byId[id]).filter(Boolean);
    if (texts.length === 0) return;
    parts.push(`${label}\n${texts.join(" ")}`);
  };
  pushZone("Situation", starZones.situation);
  pushZone("What I did", starZones.action);
  pushZone("Result", starZones.result);
  pushZone("What I learned", starZones.learning);
  const body = parts.join("\n\n");
  if (!body.trim()) return "";
  return `For the question “${question}”:\n\n${body}`;
}

/**
 * @param {string | undefined} raw
 */
export function readProfileSkillSet(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    const sel = parsed?.answers?.selectedSkills || [];
    const auto = parsed?.answers?.autoSelectedSkills || [];
    const merged = [...new Set([...sel, ...auto].map((s) => String(s || "").trim()).filter(Boolean))];
    return new Set(merged.map((s) => s.toLowerCase()));
  } catch {
    return new Set();
  }
}

/**
 * Case-insensitive overlap between tag and profile skills.
 * @param {string} tag
 * @param {Set<string>} profileLc
 */
export function skillMatchesProfile(tag, profileLc) {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return false;
  for (const p of profileLc) {
    if (!p) continue;
    if (t === p || t.includes(p) || p.includes(t)) return true;
  }
  return false;
}

export function uid(prefix = "c") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/**
 *
 * Shared utility functions used across the Interview Prep feature.
 *
 * Exports used by the Brain Dump page:
 *  - uid()                    — generates unique card IDs
 *  - heuristicStarSort()      — client-side fallback STAR sort (no API needed)
 *  - buildAnswerDraftFromStar() — builds the initial answer draft from sorted cards
 *
 * Other exports (used by other pages):
 *  - loadJobContextFromSimplifyHistory()
 *  - readProfileSkillSet()
 *  - skillMatchesProfile()
 */

import { readJobScoreHistory } from "./jobScorePersistence.js";
import { parseJobTitleAndCompany } from "./simplifiedJobExport.js";

/**
 * Checks whether a simplified job snapshot has meaningful content.
 * Used to decide whether to load job context for the interview prep questions.
 * @param {unknown} snap
 */
export function simplifiedSnapshotHasContent(snap) {
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
 * loadJobContextFromSimplifyHistory
 *
 * Reads the most recent simplified job from score history (preferred) or
 * falls back to localStorage. Used to pre-populate interview questions
 * with job-specific context.
 *
 * @returns {null | object} Job context object or null if unavailable
 */
export function loadJobContextFromSimplifyHistory() {
  const history = readJobScoreHistory();
  const row = history[0];
  let snap = row?.simplifiedSnapshot;
  let stamp = row?.simplifiedVerStamp ?? null;

  // Fallback: check localStorage if history snapshot is empty/invalid
  if (!snap || !simplifiedSnapshotHasContent(snap)) {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LAST_SIMPLIFIED_STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && simplifiedSnapshotHasContent(parsed)) {
        snap = parsed;
        stamp = parsed._ng_simp_ver ?? stamp;
      }
    } catch {
      /* ignore storage errors */
    }
  }

  if (!snap || !simplifiedSnapshotHasContent(snap)) {
    console.log("[interviewPrepHelpers] loadJobContextFromSimplifyHistory: no usable job context found");
    return null;
  }

  const { jobTitle, companyName } = parseJobTitleAndCompany(snap.basic_info ?? "");
  const role = String(snap.job_title ?? "").trim() || jobTitle || String(row?.jobTitleDisplay ?? "").trim() || "";
  const skills = Array.isArray(snap.extracted_skills)
    ? snap.extracted_skills.map((s) => String(s).trim()).filter(Boolean)
    : [];

  console.log("[interviewPrepHelpers] loadJobContextFromSimplifyHistory: loaded →", { role, company: companyName, skillCount: skills.length });

  return {
    rawText: "",
    role,
    company: companyName,
    skills,
    skillsManual: "",
    extractedFromApi: true,
    manualFallback: false,
    simplifiedVerStamp: stamp,
    simplifiedSnapshot: snap,
  };
}

/**
 * Build interview prep job context from a saved score row (Simplify flow).
 * @param {unknown} row
 * @returns {null | ReturnType<typeof loadJobContextFromSimplifyHistory>}
 */
export function jobContextFromSavedScoreRow(row) {
  if (!row || typeof row !== "object") return null;
  const snap = row.simplifiedSnapshot;
  const stamp = row.simplifiedVerStamp ?? null;
  if (!snap || !simplifiedSnapshotHasContent(snap)) return null;
  const { jobTitle, companyName } = parseJobTitleAndCompany(snap.basic_info ?? "");
  const role = String(snap.job_title ?? "").trim() || jobTitle || String(row.jobTitleDisplay ?? "").trim() || "";
  const skills = Array.isArray(snap.extracted_skills)
    ? snap.extracted_skills.map((s) => String(s || "").trim()).filter(Boolean)
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
    simplifiedSnapshot: snap,
  };
}

/**
 * Build interview prep job context from a cloud session summary row (`/pg/interview-prep/sessions`).
 * @param {{ simplified_job?: object } | null} row
 */
export function jobContextFromInterviewSessionSummary(row) {
  if (!row || typeof row !== "object") return null;
  const snap = row.simplified_job;
  if (!snap || typeof snap !== "object") return null;
  return jobContextFromSavedScoreRow({
    simplifiedSnapshot: snap,
    simplifiedVerStamp: snap._ng_simp_ver ?? null,
    jobTitleDisplay: "",
  });
}

/** Minimum length before a brain-dump note may be split into multiple cards. */
export const BRAIN_DUMP_SPLIT_MIN_CHARS = 180;

/**
 * @param {string} text
 */
export function shouldSplitBrainDumpText(text) {
  const t = String(text || "").trim();
  if (t.length < BRAIN_DUMP_SPLIT_MIN_CHARS) return false;
  const parts = t.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 || t.length >= 300;
}

/**
 * Split a long note into 2–4 sentence-based points (no API).
 * @param {string} text
 * @returns {string[]}
 */
export function heuristicSplitBrainDumpText(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (!shouldSplitBrainDumpText(t)) return [t];

  let parts = t
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1 && t.length > 300) {
    parts = t
      .split(/;\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (parts.length <= 1) return [t];

  const merged = [];
  let buf = "";
  for (const part of parts) {
    const candidate = buf ? `${buf} ${part}`.trim() : part;
    if (candidate.length > 260 && buf) {
      merged.push(buf);
      buf = part;
    } else {
      buf = candidate;
    }
  }
  if (buf) merged.push(buf);

  const max = 4;
  if (merged.length > max) {
    const head = merged.slice(0, max - 1);
    head.push(merged.slice(max - 1).join(" ").trim());
    return head.filter(Boolean);
  }
  return merged.filter(Boolean).length ? merged : [t];
}

/**
 * @param {{ id: string, text: string }[]} cards
 * @returns {{ id: string, text: string }[]}
 */
/** All card ids currently placed in STAR zones (order preserved per zone). */
export function collectStarZoneCardIds(starZones) {
  const keys = ["situation", "task", "action", "result"];
  const out = [];
  for (const k of keys) {
    for (const id of starZones?.[k] || []) {
      if (typeof id === "string" && id.trim()) out.push(id.trim());
    }
  }
  return out;
}

/** True when every dump card appears exactly once across zones and zone ids are valid. */
export function starPartitionMatchesCards(dumpCards, starZones) {
  const cardIds = new Set((dumpCards || []).map((c) => c.id).filter(Boolean));
  const zoneIds = collectStarZoneCardIds(starZones);
  if (cardIds.size === 0) return zoneIds.length === 0;
  if (zoneIds.length !== cardIds.size) return false;
  const seen = new Set(zoneIds);
  if (seen.size !== zoneIds.length) return false;
  for (const id of zoneIds) {
    if (!cardIds.has(id)) return false;
  }
  return true;
}

/** Card ids present in dumpCards but not assigned to any STAR zone. */
export function unassignedDumpCardIds(dumpCards, starZones) {
  const placed = new Set(collectStarZoneCardIds(starZones));
  return (dumpCards || []).map((c) => c.id).filter((id) => id && !placed.has(id));
}

/**
 * Drop stale zone ids, then heuristic-sort any cards that were never placed.
 * @param {DumpCard[]} dumpCards
 * @param {{ situation: string[], task: string[], action: string[], result: string[] }} starZones
 */
export function reconcileStarZonesWithCards(dumpCards, starZones) {
  const cardIds = new Set((dumpCards || []).map((c) => c.id).filter(Boolean));
  const keys = ["situation", "task", "action", "result"];
  const next = { situation: [], task: [], action: [], result: [] };
  for (const k of keys) {
    next[k] = (starZones?.[k] || []).filter((id) => cardIds.has(id));
  }
  const placed = new Set(collectStarZoneCardIds(next));
  const orphans = (dumpCards || []).filter((c) => c.id && !placed.has(c.id));
  if (!orphans.length) return next;
  const orphanZones = heuristicStarSort(orphans);
  for (const k of keys) {
    next[k] = [...next[k], ...(orphanZones[k] || [])];
  }
  return next;
}

export function expandLongDumpCardsHeuristic(cards) {
  const out = [];
  for (const card of cards) {
    const text = String(card.text || "").trim();
    if (!shouldSplitBrainDumpText(text)) {
      out.push(card);
      continue;
    }
    const points = heuristicSplitBrainDumpText(text);
    if (points.length <= 1) {
      out.push({ ...card, text: points[0] || text });
      continue;
    }
    points.forEach((point, idx) => {
      out.push({
        id: points.length > 1 ? `${card.id}_s${idx + 1}` : card.id,
        text: point,
      });
    });
  }
  return out;
}

/**
 * Client-side STAR sort when API is unavailable.
 * @param {DumpCard[]} cards
 * @returns {{ situation: string[], task: string[], action: string[], result: string[] }}
 */
export function heuristicStarSort(cards) {
  console.log("[interviewPrepHelpers] heuristicStarSort: sorting", cards.length, "cards");

  const zones = {
    situation: [],
    task: [],
    action: [],
    result: [],
  };

  for (const c of cards) {
    const t = String(c.text || "").toLowerCase();
    let assigned;

    if (/\b(result|outcome|impact|metric|achieved|delivered|increased|reduced|saved|won|percent|%)\b/i.test(t)) {
      zones.result.push(c.id);
      assigned = "result";
    } else if (
      /\b(i did|i built|i led|i owned|i implemented|i fixed|we decided|i collaborated|i coordinated)\b/i.test(t)
    ) {
      zones.action.push(c.id);
      assigned = "action";
    } else if (
      /\b(goal|task|responsible for|needed to|objective|assigned to|my role was to|my job was to|was asked to)\b/i.test(
        t,
      )
    ) {
      zones.task.push(c.id);
      assigned = "task";
    } else if (
      /\b(when|context|situation|first|initially|challenge|deadline|pressure|at the time|before)\b/i.test(t)
    ) {
      zones.situation.push(c.id);
      assigned = "situation";
    } else if (
      /\b(learned|learning|takeaway|take-away|realised|realized|next time|would do differently|reflect)\b/i.test(t)
    ) {
      zones.result.push(c.id);
      assigned = "result (reflection)";
    } else {
      zones.action.push(c.id);
      assigned = "action (default)";
    }

    console.log(`[interviewPrepHelpers] heuristicStarSort: card "${c.id}" → ${assigned} | text: "${c.text}"`);
  }

  console.log("[interviewPrepHelpers] heuristicStarSort: result →", zones);
  return zones;
}

/**
 * buildAnswerDraftFromStar
 *
 * Assembles a plain-text answer draft from the sorted STAR zones.
 * Called after the sort step to pre-populate the answer textarea
 * in PractiseStage.
 *
 * Zone order: Situation → Task → Action → Result
 * Cards within each zone are joined with a space (order preserved from sort).
 *
 * @param {{ situation: string[], task: string[], action: string[], result: string[] }} starZones
 * @param {Array<{ id: string, text: string }>} dumpCards
 * @param {string} question
 * @returns {string} Pre-filled answer draft, or "" if no cards are assigned
 */
export function buildAnswerDraftFromStar(starZones, dumpCards, question) {
  console.log("[interviewPrepHelpers] buildAnswerDraftFromStar: building draft for question →", question);

  // Build a lookup map from card id → text for quick access
  const byId = Object.fromEntries(dumpCards.map((c) => [c.id, c.text]));
  const parts = [];

  const pushZone = (label, keys) => {
    const texts = keys.map((id) => byId[id]).filter(Boolean);
    if (texts.length === 0) {
      console.log(`[interviewPrepHelpers] buildAnswerDraftFromStar: zone "${label}" is empty — skipping`);
      return;
    }
    console.log(`[interviewPrepHelpers] buildAnswerDraftFromStar: zone "${label}" →`, texts);
    parts.push(`${label}\n${texts.join(" ")}`);
  };

  pushZone("Situation", starZones.situation);
  pushZone("Task", starZones.task);
  pushZone("What I did", starZones.action);
  pushZone("Result", starZones.result);

  const body = parts.join("\n\n");
  if (!body.trim()) {
    console.log("[interviewPrepHelpers] buildAnswerDraftFromStar: no content — returning empty string");
    return "";
  }

  const draft = `For the question "${question}":\n\n${body}`;
  console.log("[interviewPrepHelpers] buildAnswerDraftFromStar: draft built →", draft);
  return draft;
}

/**
 * readProfileSkillSet
 *
 * Parses the user's profile skills from a raw JSON string (from localStorage).
 * Returns a lowercase Set used for skill matching in the question selector.
 *
 * @param {string | undefined} raw — raw JSON string from localStorage
 * @returns {Set<string>}
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
 * skillMatchesProfile
 *
 * Returns true if a given tag string overlaps with a profile skill (case-insensitive,
 * partial match allowed in either direction).
 *
 * @param {string} tag
 * @param {Set<string>} profileLc — lowercase profile skill set from readProfileSkillSet
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

/**
 * uid
 *
 * Generates a unique ID string for new dump cards.
 * Format: "{prefix}_{random hex}_{timestamp hex}"
 * Example: "d_3f7a2c1_18d4e6f"
 *
 * @param {string} prefix — short prefix to identify the type (e.g. "d" for dump card)
 * @returns {string}
 */
export function uid(prefix = "c") {
  const id = `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  console.log("[interviewPrepHelpers] uid generated:", id);
  return id;
}

/** Stable key for linking interview prep to a simplified posting + role. */
export function deriveInterviewPrepJobFingerprint(jobContext) {
  const stamp = jobContext?.simplifiedVerStamp != null ? String(jobContext.simplifiedVerStamp) : "none";
  const role = String(jobContext?.role || "").trim().toLowerCase().slice(0, 160);
  const co = String(jobContext?.company || "").trim().toLowerCase().slice(0, 160);
  return `${stamp}|${role}|${co}`;
}

export function defaultQuestionBundle() {
  return {
    dumpCards: [],
    starZones: { situation: [], task: [], action: [], result: [] },
    answerDraft: "",
    stage: 1,
    usedFallbackSort: false,
    draftUpdatedAt: 0,
    finalizedAnswer: null,
    finalizedAt: null,
  };
}

/** Normalize bundle field names (camelCase) from server or older saves. */
export function normalizeQuestionBundle(raw) {
  const b = raw && typeof raw === "object" ? raw : {};
  const sz = b.starZones || b.star_zones;
  const zones =
    sz && typeof sz === "object"
      ? {
          situation: Array.isArray(sz.situation) ? sz.situation : [],
          task: Array.isArray(sz.task) ? sz.task : [],
          action: Array.isArray(sz.action) ? sz.action : [],
          result: [
            ...(Array.isArray(sz.result) ? sz.result : []),
            ...(Array.isArray(sz.learning) ? sz.learning : []),
          ],
        }
      : defaultQuestionBundle().starZones;
  return {
    dumpCards: Array.isArray(b.dumpCards) ? b.dumpCards : Array.isArray(b.dump_cards) ? b.dump_cards : [],
    starZones: zones,
    answerDraft: String(b.answerDraft ?? b.answer_draft ?? ""),
    stage: typeof b.stage === "number" && !Number.isNaN(b.stage) ? Math.min(3, Math.max(1, b.stage)) : 1,
    usedFallbackSort: Boolean(b.usedFallbackSort ?? b.used_fallback_sort),
    draftUpdatedAt: Number(b.draftUpdatedAt ?? b.draft_updated_at ?? 0) || 0,
    finalizedAnswer:
      b.finalizedAnswer != null
        ? String(b.finalizedAnswer)
        : b.finalized_answer != null
          ? String(b.finalized_answer)
          : null,
    finalizedAt: Number(b.finalizedAt ?? b.finalized_at ?? 0) || null,
  };
}

/**
 * Merge per-question bundles from server into local; newer draft or finalized wins per field.
 * @param {Record<string, object>} localBundles
 * @param {Record<string, object>} serverBundles
 * @param {string[]} questionOrder
 */
export function mergeQuestionBundlesFromServer(localBundles, serverBundles, questionOrder) {
  const L = localBundles && typeof localBundles === "object" ? { ...localBundles } : {};
  const S = serverBundles && typeof serverBundles === "object" ? serverBundles : {};
  for (const q of questionOrder) {
    const a = normalizeQuestionBundle(L[q]);
    const b = normalizeQuestionBundle(S[q]);
    if (!S[q]) continue;
    if (!L[q]) {
      L[q] = b;
      continue;
    }
    const base = a.draftUpdatedAt >= b.draftUpdatedAt ? { ...a } : { ...b };
    const fa = a.finalizedAt || 0;
    const fb = b.finalizedAt || 0;
    if (fb > fa) {
      base.finalizedAnswer = b.finalizedAnswer;
      base.finalizedAt = b.finalizedAt;
    } else if (fa > fb) {
      base.finalizedAnswer = a.finalizedAnswer;
      base.finalizedAt = a.finalizedAt;
    } else if (fb && fa && fb === fa) {
      base.finalizedAnswer = (b.finalizedAnswer || "").length >= (a.finalizedAnswer || "").length ? b.finalizedAnswer : a.finalizedAnswer;
    }
    L[q] = normalizeQuestionBundle(base);
  }
  return L;
}

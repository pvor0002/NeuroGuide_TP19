import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import StageTabs from "../components/interview-prep/StageTabs.jsx";
import BrainDumpStage from "../components/interview-prep/BrainDumpStage.jsx";
import OrganiseStage from "../components/interview-prep/OrganiseStage.jsx";
import PractiseStage from "../components/interview-prep/PractiseStage.jsx";
import {
  goToInterviewPrepListing,
  INTERVIEW_PREP_LIST_PATH,
  isListingEntryStepLockActive,
  peekInterviewPrepStartAtStep1,
  releaseListingEntryStepLock,
} from "../utils/interviewPrepNav.js";
import {
  formulateInterviewSpeech,
  reshapeSpeechFromStarNotes,
  liveSimplifyEnabled,
  starSortInterview,
} from "../services/interviewPrepApi.js";
import {
  fetchInterviewPrepProgress,
  fetchInterviewPrepSessions,
  putInterviewPrepProgress,
} from "../services/interviewPrepProgressApi.js";
import { hasCloudSessionCredentials, readCredentials } from "../utils/cloudSync.js";
import {
  buildAnswerDraftFromStar,
  cleanSpeechDraft,
  isHeuristicStarDraft,
  starContentFingerprint,
  starZoneTextsFromCards,
  defaultQuestionBundle,
  deriveInterviewPrepJobFingerprint,
  expandLongDumpCardsHeuristic,
  heuristicStarSort,
  reconcileStarZonesWithCards,
  starPartitionMatchesCards,
  loadJobContextFromSimplifyHistory,
  bundleForQuestionKey,
  mergeQuestionBundlesFromServer,
  normalizeInterviewPrepProgress,
  questionBundleHasWork,
  normalizeQuestionBundle,
  readProfileSkillSet,
  simplifiedSnapshotHasContent,
  skillMatchesProfile,
  uid,
} from "../utils/interviewPrepHelpers.js";
import {
  loadAiQuestionsForJob,
  loadWorkspaceForFingerprint,
  saveWorkspaceJobContext,
  saveWorkspaceOrg,
  saveWorkspaceSavedAnswers,
  getActiveInterviewPrepFingerprint,
  setActiveInterviewPrepFingerprint,
} from "../utils/interviewPrepStorage.js";

const JOB_CTX_KEY = "neuroguide.interviewPrep.jobContext.v1";
const PROFILE_KEY = "neuroguide.careerProfile.react.v2";
const MAX_CUSTOM_QUESTIONS = 10;
const MAX_CUSTOM_QUESTION_CHARS = 480;

/** Fixed pool — 2 are always picked from this list (not AI generated). */
const BEHAVIORAL_QUESTIONS = [
  "Tell me about a time you had to adapt quickly to an unexpected change.",
  "Describe a situation where you worked with someone very different from you.",
  "Tell me about a time you made a mistake and how you handled it.",
  "Describe a time when you had to manage more than one task at once.",
  "Tell me about a time you helped a teammate who was struggling.",
  "Describe a situation where you had to learn something new very quickly.",
  "Tell me about yourself",
];

/** Return 2 behavioral questions based on a seed (simpVer or 0). */
function pickBehavioralQuestions(seed = 0) {
  const i = Math.abs(Number(seed) || 0) % BEHAVIORAL_QUESTIONS.length;
  const j = (i + 1) % BEHAVIORAL_QUESTIONS.length;
  return [BEHAVIORAL_QUESTIONS[i], BEHAVIORAL_QUESTIONS[j]];
}

/** Load AI questions for this job only. Returns [] if none/stale. */
function loadAiQuestions(jobContext) {
  const simpVer = jobContext?.simplifiedVerStamp ?? null;
  if (!simpVer) return [];
  return loadAiQuestionsForJob(jobContext, simpVer);
}

function mergeCustomQuestionLists(local, remote) {
  const seen = new Set();
  const out = [];
  for (const list of [remote, local]) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const t = String(s || "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, MAX_CUSTOM_QUESTIONS);
}

function combineQuestionLists(baseList, customList) {
  const base = Array.isArray(baseList) ? baseList : [];
  const custom = Array.isArray(customList) ? customList.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const seen = new Set();
  const out = [];
  for (const q of base) {
    const k = String(q || "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  for (const k of custom) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function normalizeSavedAnswerRow(x) {
  if (!x || typeof x !== "object") return null;
  const question = String(x.question || x.q || "").trim();
  if (!question) return null;
  const answer = String(x.answer ?? x.answer_text ?? x.text ?? "").trim();
  return {
    id: x.id != null ? String(x.id) : undefined,
    question,
    answer,
    role: x.role != null ? String(x.role) : undefined,
    company: x.company != null ? String(x.company) : undefined,
    savedAt: Number(x.savedAt ?? x.saved_at ?? 0) || 0,
  };
}

/** One saved row per question text (newest wins). */
/** Build saved-answer rows from per-question bundles when progress.savedAnswers is missing. */
function savedAnswersFromBundles(bundles) {
  const out = [];
  for (const [qk, raw] of Object.entries(bundles || {})) {
    const n = normalizeQuestionBundle(raw);
    const text = String(n.finalizedAnswer || "").trim() || String(n.answerDraft || "").trim();
    if (!text) continue;
    const question = String(qk || "").trim();
    if (!question) continue;
    out.push({
      id: `bundle-${question.slice(0, 24)}`,
      question,
      answer: text,
      savedAt: Number(n.finalizedAt || n.draftUpdatedAt || 0) || Date.now(),
    });
  }
  return out;
}

function mergeSavedAnswersByQuestion(local, remote) {
  const norm = (q) => String(q || "").trim();
  const by = new Map();
  for (const raw of [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])]) {
    const x = normalizeSavedAnswerRow(raw);
    if (!x) continue;
    const k = norm(x.question);
    const prev = by.get(k);
    const ta = Number(x.savedAt || 0);
    const tb = Number(prev?.savedAt || 0);
    if (!prev || ta > tb || (ta === tb && x.answer.length >= String(prev.answer || "").length)) {
      by.set(k, { ...x, question: k });
    }
  }
  return [...by.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 40);
}

/** Prefer bundle finalization; fall back to saved-answers list (same question key). */
function finalizedTextForQuestion(normBundle, savedAnswersList, questionTrimmed) {
  const qt = String(questionTrimmed || "").trim();
  const fromB = String(normBundle?.finalizedAnswer || "").trim();
  if (fromB) return fromB;
  const row = (savedAnswersList || []).find((x) => String(x.question || "").trim() === qt);
  return String(row?.answer || "").trim();
}

/** Saved answer text from bundle and/or saved-answers list. */
function resolveAnswerTextForQuestion(normBundle, savedAnswersList, questionTrimmed) {
  const fromFinalized = finalizedTextForQuestion(normBundle, savedAnswersList, questionTrimmed);
  if (fromFinalized) return fromFinalized;
  return String(normBundle?.answerDraft || "").trim();
}

function computeAnsweredQuestionsMap(bundles, savedList) {
  const out = {};
  for (const [qk, b] of Object.entries(bundles || {})) {
    const nb = normalizeQuestionBundle(b);
    if (nb.dumpCards.length > 0 || nb.answerDraft || nb.finalizedAnswer) out[qk] = true;
  }
  for (const row of savedList || []) {
    const k = String(row?.question || "").trim();
    if (k && String(row?.answer || "").trim()) out[k] = true;
  }
  return out;
}

/** Pick UI stage when loading bundle / saved progress (respect listing-entry lock). */
function stageFromLoadedProgress(wb, answerText, listingStepLockRef) {
  if (isListingEntryStepLockActive(listingStepLockRef)) return 1;
  if (answerText) return Math.max(wb.stage, 3);
  const s = wb.stage;
  return s >= 1 && s <= 3 ? s : 1;
}

/**
 * When switching questions in the sidebar, keep the user on their current step
 * (Brain dump / Organise / Practise) so one saved question does not yank them to Practise.
 */
function stageWhenSelectingQuestion(currentStage, wb, hasSavedAnswer, listingStepLockRef) {
  if (isListingEntryStepLockActive(listingStepLockRef)) return 1;
  if (!hasSavedAnswer) return wb.stage;
  if (currentStage >= 1 && currentStage <= 3) return currentStage;
  return wb.stage >= 3 ? 3 : wb.stage;
}

function emptyZones() {
  return { situation: [], task: [], action: [], result: [] };
}

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function defaultJobContext() {
  return {
    rawText: "",
    role: "",
    company: "",
    skills: [],
    skillsManual: "",
    extractedFromApi: false,
    manualFallback: false,
    simplifiedVerStamp: null,
    simplifiedSnapshot: null,
  };
}

/**
 * Map persisted stage to the current 3-tab model.
 * Modern saves use 1–3 directly. Legacy 4-tab flow used 4+ for later steps (downshift once).
 */
function migrateLegacyStage(stored) {
  if (typeof stored !== "number" || Number.isNaN(stored)) return 1;
  if (stored <= 3) return Math.min(3, Math.max(1, stored));
  return Math.min(3, Math.max(1, stored - 1));
}

/** UI-only stage 4 (saved-answer review) is stored in bundles as 3 so STAR data stays valid. */
function persistableStage(stage) {
  return stage === 4 ? 3 : stage;
}

function zonesHaveCards(z) {
  return Object.values(z || {}).some((arr) => Array.isArray(arr) && arr.length > 0);
}

/** User reached Practise (Build my answer) or explicitly saved — show formulated-answer gate on Brain dump. */
function hasFormulatedSpeechForQuestion(normBundle, savedList, questionTrimmed, liveAnswerDraft) {
  const qt = String(questionTrimmed || "").trim();
  if (finalizedTextForQuestion(normBundle, savedList, qt)) return true;
  const nb = normalizeQuestionBundle(normBundle || null);
  return Boolean(String(liveAnswerDraft ?? nb.answerDraft ?? "").trim());
}

/** Text for the Brain dump revisit gate (saved / finalised / Practise draft only). */
function formulatedSpeechDisplayText(q, normBundle, savedList, liveAnswerDraft) {
  const qt = String(q || "").trim();
  const finalized = finalizedTextForQuestion(normBundle, savedList, qt);
  if (finalized) return finalized;
  const nb = normalizeQuestionBundle(normBundle || null);
  const fromBundle = String(nb.answerDraft || "").trim();
  if (fromBundle) return fromBundle;
  return String(liveAnswerDraft || "").trim();
}

/**
 * Migrate localStorage org blob to per-question bundles (v2).
 * @param {Record<string, unknown> | null} org
 */
function migrateOrgToBundles(org) {
  /** @type {Record<string, ReturnType<typeof normalizeQuestionBundle>>} */
  let bundles = {};
  if (org?.bundles && typeof org.bundles === "object") {
    for (const [k, v] of Object.entries(org.bundles)) {
      bundles[k] = normalizeQuestionBundle(v);
    }
  }
  const activeQuestion = typeof org?.activeQuestion === "string" ? org.activeQuestion : org?.selectedQuestion ?? null;
  const hasLegacy =
    org &&
    ((Array.isArray(org.dumpCards) && org.dumpCards.length > 0) ||
      zonesHaveCards(org.starZones) ||
      String(org.answerDraft || "").trim());
  if (!Object.keys(bundles).length && hasLegacy && typeof org?.selectedQuestion === "string" && org.selectedQuestion) {
    bundles[org.selectedQuestion] = normalizeQuestionBundle({
      dump_cards: org.dumpCards,
      star_zones: org.starZones,
      answer_draft: org.answerDraft,
      stage: org.stage,
      used_fallback_sort: org.usedFallbackSort,
      draft_updated_at: Date.now(),
    });
  }
  return { bundles, activeQuestion };
}

/** Pick the best RDS session row when fingerprint GET misses. */
function pickInterviewPrepSessionRow(sessions, jobContext, localFp) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (!list.length) return null;
  const exact = list.find((s) => String(s?.job_fingerprint || "") === localFp);
  if (exact) return exact;
  const stamp =
    jobContext?.simplifiedVerStamp != null ? String(jobContext.simplifiedVerStamp) : null;
  if (stamp) {
    const byStamp = list.find((s) => {
      const sj = s?.simplified_job;
      return sj && String(sj._ng_simp_ver ?? sj._ngSimpVer ?? "") === stamp;
    });
    if (byStamp) return byStamp;
  }
  const role = String(jobContext?.role || "").trim().toLowerCase();
  const co = String(jobContext?.company || "").trim().toLowerCase();
  if (role || co) {
    const byRole = list.find((s) => {
      const fp = String(s?.job_fingerprint || "");
      const parts = fp.split("|");
      if (parts.length < 3) return false;
      return parts[1] === role && parts[2] === co;
    });
    if (byRole) return byRole;
  }
  return null;
}

function pickHydrationQuestion(qs, merged, prog, localSelected, savedList) {
  const active = typeof prog?.activeQuestion === "string" ? prog.activeQuestion : null;
  for (const row of savedList || []) {
    const k = String(row?.question || "").trim();
    if (k && String(row?.answer || "").trim()) return k;
  }
  if (active && qs.includes(active)) return active;
  if (localSelected && qs.includes(localSelected)) return localSelected;
  for (const q of qs) {
    const b = normalizeQuestionBundle(merged[q]);
    if (b.dumpCards.length > 0 || zonesHaveCards(b.starZones) || b.finalizedAnswer || b.answerDraft) return q;
  }
  for (const [qk, raw] of Object.entries(merged || {})) {
    if (!qs.includes(qk) && questionBundleHasWork(raw)) return qk;
  }
  return qs[0] ?? null;
}

function mergeJobContextFromSources(stored, fromSimplify) {
  const base = stored && typeof stored === "object" ? { ...defaultJobContext(), ...stored } : defaultJobContext();
  if (!fromSimplify) return base;
  const stampNew = fromSimplify.simplifiedVerStamp ?? null;
  const stampOld = base.simplifiedVerStamp ?? null;
  if (stampNew != null && stampNew !== stampOld) {
    return { ...base, ...fromSimplify };
  }
  if (!base.role && fromSimplify.role) {
    return { ...base, ...fromSimplify };
  }
  if (fromSimplify.simplifiedSnapshot && !base.simplifiedSnapshot) {
    return {
      ...base,
      simplifiedSnapshot: fromSimplify.simplifiedSnapshot,
      simplifiedVerStamp: fromSimplify.simplifiedVerStamp ?? base.simplifiedVerStamp,
    };
  }
  return base;
}

function workspaceFromBundle(b) {
  const n = normalizeQuestionBundle(b);
  const draft = String(n.answerDraft || "").trim();
  const finalized = String(n.finalizedAnswer || "").trim();
  return {
    dumpCards: n.dumpCards,
    starZones: reconcileStarZonesWithCards(n.dumpCards, n.starZones),
    answerDraft: draft || finalized,
    stage: migrateLegacyStage(n.stage),
    usedFallbackSort: n.usedFallbackSort,
  };
}

function loadInterviewPrepBootstrap() {
  if (typeof window === "undefined") {
    const emptyCtx = defaultJobContext();
    return {
      stage: 1,
      jobContext: emptyCtx,
      jobFingerprint: deriveInterviewPrepJobFingerprint(emptyCtx),
      bundles: {},
      selectedQuestion: null,
      dumpCards: [],
      starZones: emptyZones(),
      answerDraft: "",
      savedAnswers: [],
      usedFallbackSort: false,
      customQuestions: [],
    };
  }
  const jc = safeParse(window.localStorage.getItem(JOB_CTX_KEY));
  const mergedJob =
    jc && jobContextHasInterviewSource(jc)
      ? { ...defaultJobContext(), ...jc }
      : mergeJobContextFromSources(null, loadJobContextFromSimplifyHistory());
  const jobFingerprint = deriveInterviewPrepJobFingerprint(mergedJob);
  setActiveInterviewPrepFingerprint(jobFingerprint);
  saveWorkspaceJobContext(jobFingerprint, mergedJob);

  const ws = loadWorkspaceForFingerprint(jobFingerprint);
  const org = ws.org;
  const saved = ws.savedAnswers;
  const { bundles, activeQuestion } = migrateOrgToBundles(org);
  const sel = typeof activeQuestion === "string" ? activeQuestion : null;
  const wb = workspaceFromBundle(sel ? bundles[sel] : null);

  const customQs = Array.isArray(org?.customQuestions)
    ? org.customQuestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_QUESTIONS)
    : [];

  const savedList = mergeSavedAnswersByQuestion([], Array.isArray(saved) ? saved : []);
  const bundleForSel = sel ? normalizeQuestionBundle(bundles[sel] || null) : null;
  const savedReviewText =
    bundleForSel && sel ? finalizedTextForQuestion(bundleForSel, savedList, String(sel).trim()) : "";
  const initialStage = savedReviewText ? Math.max(wb.stage, 3) : wb.stage;

  return {
    stage: initialStage,
    jobContext: mergedJob,
    jobFingerprint,
    bundles,
    selectedQuestion: sel,
    dumpCards: wb.dumpCards,
    starZones: wb.starZones,
    answerDraft: savedReviewText ? String(bundleForSel.answerDraft || "").trim() || savedReviewText : wb.answerDraft,
    savedAnswers: savedList,
    usedFallbackSort: wb.usedFallbackSort,
    customQuestions: customQs,
  };
}

function parseManualTags(skillsManual) {
  return String(skillsManual || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizedSkills(jobContext) {
  if (jobContext.skills?.length) return jobContext.skills;
  return parseManualTags(jobContext.skillsManual);
}

/**
 * Build the base question list (4 skill-based + 2 behavioral = 6 total).
 * Uses AI-generated questions if available for this job; otherwise falls back to templates.
 */
function buildQuestionList(jobContext, profileSkillSet) {
  const simpVer = jobContext?.simplifiedVerStamp ?? null;
  const behavioral = pickBehavioralQuestions(simpVer);

  // Try AI questions first
  const aiQuestions = loadAiQuestions(jobContext);
  if (aiQuestions.length >= 2) {
    const skillBased = aiQuestions.slice(0, 4);
    const out = [...skillBased];
    for (const b of behavioral) {
      if (!out.includes(b)) out.push(b);
    }
    const final = out.slice(0, 6);
    console.log(
      "%c[InterviewPrep] Source: AI (Gemini)",
      "color: #16a34a; font-weight: bold;",
      { simpVer, skillQuestions: skillBased, behavioralQuestions: behavioral, total: final }
    );
    return final;
  }

  // Fallback: template-based questions
  const skills = normalizedSkills(jobContext);
  const knownSkills = skills.filter((s) => skillMatchesProfile(s, profileSkillSet));
  const missingSkills = skills.filter((s) => !skillMatchesProfile(s, profileSkillSet));

  const tailored = [];

  const knownTemplates = [
    (s) => `Tell me about a time you used ${s} to solve a real problem.`,
    (s) => `Describe a project where ${s} was central to what you contributed.`,
    (s) => `How has working with ${s} shaped the way you approach this kind of work?`,
  ];
  knownSkills.slice(0, 3).forEach((s, i) => {
    tailored.push(knownTemplates[i % knownTemplates.length](s));
  });

  const missingTemplates = [
    (s) => `This role involves ${s}. How would you go about getting up to speed with it?`,
    (s) => `You'll be working with ${s} here. What's your strategy for picking up a new tool quickly?`,
    (s) => `What do you already know about ${s}, and what steps would you take to close any gaps?`,
  ];
  missingSkills.slice(0, 3).forEach((s, i) => {
    tailored.push(missingTemplates[i % missingTemplates.length](s));
  });

  const out = [...tailored.slice(0, 4)];
  for (const b of behavioral) {
    if (!out.includes(b)) out.push(b);
  }
  const final = out.slice(0, 6);
  console.log(
    "%c[InterviewPrep] Source: TEMPLATE (no AI questions found for this job)",
    "color: #d97706; font-weight: bold;",
    {
      simpVer,
      reason: aiQuestions.length === 0
        ? "No AI questions in localStorage for this simpVer"
        : `Only ${aiQuestions.length} AI question(s) found (need at least 2)`,
      knownSkills,
      missingSkills,
      templateQuestions: tailored.slice(0, 4),
      behavioralQuestions: behavioral,
      total: final,
    }
  );
  return final;
}

function jobContextHasInterviewSource(jc) {
  if (!jc || typeof jc !== "object") return false;
  if (String(jc.rawText || "").trim()) return true;
  if (String(jc.role || "").trim()) return true;
  if (simplifiedSnapshotHasContent(jc.simplifiedSnapshot)) return true;
  return false;
}

function syncWorkspaceToLocal(fp, jobContext, bundles, activeQuestion, customQuestions, savedAnswers) {
  const key = String(fp || "").trim();
  if (!key) return;
  saveWorkspaceJobContext(key, jobContext);
  saveWorkspaceOrg(key, {
    v: 2,
    bundles,
    activeQuestion,
    customQuestions,
  });
  saveWorkspaceSavedAnswers(key, savedAnswers);
}

function InterviewPrepContent({ initial }) {
  const navigate = useNavigate();
  const jobFingerprintRef = useRef(
    initial.jobContext?.cloudJobFingerprint ||
      initial.jobFingerprint ||
      deriveInterviewPrepJobFingerprint(initial.jobContext),
  );
  const bundlesRef = useRef(initial.bundles || {});
  const [questionBundles, setQuestionBundles] = useState(() => initial.bundles || {});
  const listingEntryFromListing = peekInterviewPrepStartAtStep1();
  const listingStepLockRef = useRef(listingEntryFromListing);
  const cloudHydrateWorkspaceAppliedRef = useRef(false);

  //Your current stage of the interview prep process (legacy stage 4 → 3)
  const [stage, setStageRaw] = useState(() =>
    listingEntryFromListing ? 1 : persistableStage(initial.stage),
  );
  const setStage = useCallback((next) => {
    setStageRaw((prev) => {
      let value = typeof next === "function" ? next(prev) : next;
      if (isListingEntryStepLockActive(listingStepLockRef) && persistableStage(value) > 1) {
        value = 1;
      }
      return persistableStage(value);
    });
  }, []);

  useLayoutEffect(() => {
    if (isListingEntryStepLockActive(listingStepLockRef)) {
      setStage(1);
    }
  }, [setStage]);
  //Your job context from the job posting and the job posting itself
  const [jobContext] = useState(() => initial.jobContext);
  const [selectedQuestion, setSelectedQuestion] = useState(() => initial.selectedQuestion);
  const [dumpCards, setDumpCards] = useState(() => initial.dumpCards);
  const [starZones, setStarZones] = useState(() => initial.starZones);
  const [answerDraft, setAnswerDraft] = useState(() => initial.answerDraft);
  const [savedAnswers, setSavedAnswers] = useState(() => initial.savedAnswers);
  const [usedFallbackSort, setUsedFallbackSort] = useState(() => initial.usedFallbackSort);
  const [organising, setOrganising] = useState(false);
  const [formulatingAnswer, setFormulatingAnswer] = useState(false);
  const [formulateNotice, setFormulateNotice] = useState("");
  const [cloudSaving, setCloudSaving] = useState(false);
  const [organiseSaveAck, setOrganiseSaveAck] = useState(false);
  const [customQuestions, setCustomQuestions] = useState(() => initial.customQuestions || []);
  /** When true, Brain dump shows the composer for a question that already has formulated speech. */
  const [brainDumpEditingRevisit, setBrainDumpEditingRevisit] = useState(false);
  // Tracks which questions have saved content — shown as ✓ badges in QuestionSelector.
  // Derived from bundlesRef on mount; refreshed when the user switches questions.
  const [answeredQuestions, setAnsweredQuestions] = useState(() =>
    computeAnsweredQuestionsMap(initial.bundles, initial.savedAnswers),
  );

  //Your profile skill set from the profile page
  const profileSkillSet = useMemo(() => {
    if (typeof window === "undefined") return new Set();
    return readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
  }, []);

  // Bumped whenever we should re-read AI questions from localStorage (e.g. tab regains focus after
  // score runs on the Simplify page and background generation finishes).
  const [aiQuestionsRevision, setAiQuestionsRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setAiQuestionsRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const baseQuestions = useMemo(
    () => buildQuestionList(jobContext, profileSkillSet),
    // aiQuestionsRevision intentionally included so we re-read localStorage when the tab refocuses
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobContext, profileSkillSet, aiQuestionsRevision],
  );

  const allQuestions = useMemo(
    () => combineQuestionLists(baseQuestions, customQuestions),
    [baseQuestions, customQuestions],
  );

  const resolvedQuestion = useMemo(() => {
    if (!allQuestions.length) return null;
    if (selectedQuestion && allQuestions.includes(selectedQuestion)) return selectedQuestion;
    return allQuestions[0];
  }, [allQuestions, selectedQuestion]);

  const selectedQuestionRef = useRef(selectedQuestion);
  const savedAnswersRef = useRef(savedAnswers);
  const customQuestionsRef = useRef(initial.customQuestions || []);

  useEffect(() => {
    selectedQuestionRef.current = selectedQuestion;
  }, [selectedQuestion]);

  useEffect(() => {
    customQuestionsRef.current = customQuestions;
  }, [customQuestions]);

  const cloudSaveTimerRef = useRef(null);
  /** Bumped when the user organises ideas so in-flight cloud hydration cannot overwrite fresh STAR state. */
  const workspaceApplyGenRef = useRef(0);
  /** Blocks local persist / cloud push until first cloud hydrate finishes (avoids wiping RDS with empty local). */
  const skipCloudHydrateOnMount = !hasCloudSessionCredentials();
  const hydrationReadyRef = useRef(skipCloudHydrateOnMount);
  const [hydrationReady, setHydrationReady] = useState(skipCloudHydrateOnMount);
  /** Fingerprint of the RDS row we loaded (PUT must use same key as GET). */
  const cloudJobFingerprintRef = useRef(null);
  /** False until cloud row is merged and UI workspace reflects it — blocks empty-state overwrites. */
  const cloudWorkspaceSyncedRef = useRef(skipCloudHydrateOnMount);

  const persistOrgLocal = useCallback((activeQ) => {
    if (typeof window === "undefined") return;
    saveWorkspaceOrg(jobFingerprintRef.current, {
      v: 2,
      bundles: bundlesRef.current,
      activeQuestion: activeQ ?? selectedQuestionRef.current,
      customQuestions: customQuestionsRef.current,
    });
  }, []);

  const commitWorkspaceToBundle = useCallback(
    (patch = {}) => {
      const q = patch.question ?? selectedQuestionRef.current;
      if (!q || !allQuestions.includes(q)) return;
      const prev = bundlesRef.current[q] || defaultQuestionBundle();
      const candidate = normalizeQuestionBundle({
        ...prev,
        dumpCards: patch.dumpCards !== undefined ? patch.dumpCards : dumpCards,
        starZones: patch.starZones !== undefined ? patch.starZones : starZones,
        answerDraft: patch.answerDraft !== undefined ? patch.answerDraft : answerDraft,
        stage: patch.stage !== undefined ? patch.stage : persistableStage(stage),
        usedFallbackSort: patch.usedFallbackSort !== undefined ? patch.usedFallbackSort : usedFallbackSort,
        finalizedAnswer: patch.finalizedAnswer !== undefined ? patch.finalizedAnswer : prev.finalizedAnswer,
        finalizedAt: patch.finalizedAt !== undefined ? patch.finalizedAt : prev.finalizedAt,
        speechFormulated:
          patch.speechFormulated !== undefined ? patch.speechFormulated : prev.speechFormulated,
        formulatedStarKey:
          patch.formulatedStarKey !== undefined ? patch.formulatedStarKey : prev.formulatedStarKey,
        draftUpdatedAt: Date.now(),
      });
      if (questionBundleHasWork(prev) && !questionBundleHasWork(candidate)) return;
      const nextAll = { ...bundlesRef.current, [q]: candidate };
      bundlesRef.current = nextAll;
      setQuestionBundles(nextAll);
      persistOrgLocal(q);
    },
    [allQuestions, dumpCards, starZones, answerDraft, stage, usedFallbackSort, persistOrgLocal],
  );

  const saveProgressToDatabase = useCallback(
    async ({ throwOnError = true, force = false } = {}) => {
      if (!hydrationReadyRef.current && !force) {
        return { ok: false, skipped: true };
      }
      if (!hasCloudSessionCredentials()) {
        return { ok: false, skipped: true };
      }
      const cred = readCredentials();
      if (!cred?.userId || !cred?.passKey) {
        return { ok: false, skipped: true };
      }
      if (!cloudWorkspaceSyncedRef.current && !force) {
        return { ok: false, skipped: true };
      }
      const fp =
        cloudJobFingerprintRef.current ||
        jobFingerprintRef.current ||
        deriveInterviewPrepJobFingerprint(jobContext);
      const iq = combineQuestionLists(
        buildQuestionList(jobContext, readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY))),
        customQuestionsRef.current,
      );
      setCloudSaving(true);
      try {
        await putInterviewPrepProgress(cred, {
          job_fingerprint: fp,
          simplified_job:
            jobContext.simplifiedSnapshot && typeof jobContext.simplifiedSnapshot === "object"
              ? jobContext.simplifiedSnapshot
              : null,
          interview_questions: iq,
          progress: {
            bundles: bundlesRef.current,
            activeQuestion: selectedQuestionRef.current,
            savedAnswers: savedAnswersRef.current,
            customQuestions: customQuestionsRef.current,
          },
        });
        return { ok: true };
      } catch (err) {
        if (throwOnError) throw err;
        return { ok: false, error: err };
      } finally {
        setCloudSaving(false);
      }
    },
    [jobContext],
  );

  const scheduleCloudSave = useCallback(() => {
    if (!hydrationReadyRef.current || !cloudWorkspaceSyncedRef.current) return;
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = window.setTimeout(() => {
      cloudSaveTimerRef.current = null;
      void saveProgressToDatabase({ throwOnError: false });
    }, 900);
  }, [saveProgressToDatabase]);

  const applyWorkspaceFromBundle = useCallback(
    (q, bundleRow, savedList) => {
      if (!q) return;
      const norm = normalizeQuestionBundle(bundleRow || null);
      const wb = workspaceFromBundle(bundleRow || null);
      const answerText = resolveAnswerTextForQuestion(norm, savedList, String(q).trim());
      setSelectedQuestion(q);
      setDumpCards(wb.dumpCards);
      setStarZones(reconcileStarZonesWithCards(wb.dumpCards, wb.starZones));
      setAnswerDraft(answerText || wb.answerDraft);
      setStage(stageFromLoadedProgress(wb, answerText, listingStepLockRef));
      setUsedFallbackSort(wb.usedFallbackSort);
      const hasSpeech = hasFormulatedSpeechForQuestion(norm, savedList, String(q).trim(), answerText || wb.answerDraft);
      setBrainDumpEditingRevisit(!hasSpeech);
    },
    [setStage],
  );

  const finishHydration = useCallback(() => {
    if (hydrationReadyRef.current) return;
    hydrationReadyRef.current = true;
    setHydrationReady(true);
  }, []);

  const hydrateFromCloud = useCallback(async () => {
    if (!hasCloudSessionCredentials()) {
      cloudWorkspaceSyncedRef.current = true;
      finishHydration();
      return;
    }
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) {
      cloudWorkspaceSyncedRef.current = true;
      finishHydration();
      return;
    }
    cloudWorkspaceSyncedRef.current = false;
    const hydrationGenAtStart = workspaceApplyGenRef.current;
    const fp =
      jobContext?.cloudJobFingerprint ||
      jobFingerprintRef.current ||
      deriveInterviewPrepJobFingerprint(jobContext);
    jobFingerprintRef.current = fp;
    const prof = readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
    try {
      let row = await fetchInterviewPrepProgress(cred, fp);
      if (!row) {
        try {
          const list = await fetchInterviewPrepSessions(cred);
          const sessions = Array.isArray(list?.sessions) ? list.sessions : [];
          const fallback = pickInterviewPrepSessionRow(sessions, jobContext, fp);
          if (fallback?.job_fingerprint) {
            row = await fetchInterviewPrepProgress(cred, String(fallback.job_fingerprint));
          }
        } catch {
          /* ignore list fallback */
        }
      }
      if (!row) {
        syncWorkspaceToLocal(
          fp,
          jobContext,
          bundlesRef.current,
          selectedQuestionRef.current,
          customQuestionsRef.current,
          savedAnswersRef.current,
        );
        cloudWorkspaceSyncedRef.current = true;
        finishHydration();
        return;
      }
      const rowFp = String(row.job_fingerprint || row.jobFingerprint || fp).trim();
      if (rowFp) cloudJobFingerprintRef.current = rowFp;
      const prog = normalizeInterviewPrepProgress(row.progress);
      const remoteCustom = prog.customQuestions;
      const serverBundles = prog.bundles;
      const bundleOnlyCustom = Object.keys(serverBundles).filter((k) => {
        const t = String(k || "").trim();
        return t && questionBundleHasWork(serverBundles[k]);
      });
      const mergedCustom = mergeCustomQuestionLists(customQuestionsRef.current, [
        ...remoteCustom,
        ...bundleOnlyCustom,
      ]);
      customQuestionsRef.current = mergedCustom;
      setCustomQuestions(mergedCustom);
      const qs = combineQuestionLists(buildQuestionList(jobContext, prof), mergedCustom);
      const merged = mergeQuestionBundlesFromServer(bundlesRef.current, serverBundles, [
        ...qs,
        ...Object.keys(serverBundles),
      ]);
      bundlesRef.current = merged;
      setQuestionBundles(merged);
      const remoteSaved =
        prog.savedAnswers.length > 0 ? prog.savedAnswers : savedAnswersFromBundles(serverBundles);
      const mergedSaved = mergeSavedAnswersByQuestion(savedAnswersRef.current, remoteSaved);
      savedAnswersRef.current = mergedSaved;
      setSavedAnswers(mergedSaved);
      setAnsweredQuestions(() => computeAnsweredQuestionsMap(bundlesRef.current, savedAnswersRef.current));
      const targetQ = pickHydrationQuestion(qs, merged, prog, selectedQuestionRef.current, mergedSaved);
      const skipWorkspaceApply = hydrationGenAtStart !== workspaceApplyGenRef.current;
      if (targetQ && !skipWorkspaceApply && !cloudHydrateWorkspaceAppliedRef.current) {
        cloudHydrateWorkspaceAppliedRef.current = true;
        if (!qs.includes(targetQ)) {
          const extra = mergeCustomQuestionLists(customQuestionsRef.current, [targetQ]);
          customQuestionsRef.current = extra;
          setCustomQuestions(extra);
        }
        const bundleRow = bundleForQuestionKey(merged, targetQ) || defaultQuestionBundle();
        applyWorkspaceFromBundle(targetQ, bundleRow, mergedSaved);
        persistOrgLocal(targetQ);
      } else if (isListingEntryStepLockActive(listingStepLockRef)) {
        setStage(1);
      } else {
        persistOrgLocal(targetQ || selectedQuestionRef.current);
      }
      syncWorkspaceToLocal(
        rowFp || fp,
        jobContext,
        bundlesRef.current,
        selectedQuestionRef.current,
        customQuestionsRef.current,
        savedAnswersRef.current,
      );
      cloudWorkspaceSyncedRef.current = true;
    } catch (err) {
      console.warn("[InterviewPrep] cloud hydrate failed:", err);
      cloudWorkspaceSyncedRef.current = true;
    } finally {
      finishHydration();
    }
  }, [jobContext, persistOrgLocal, applyWorkspaceFromBundle, finishHydration, setStage]);

  useEffect(() => {
    if (!allQuestions.length) return;
    if (selectedQuestion && allQuestions.includes(selectedQuestion)) return;
    const pick = allQuestions[0];
    const incoming = bundlesRef.current[pick] || defaultQuestionBundle();
    const norm = normalizeQuestionBundle(incoming);
    const wb = workspaceFromBundle(incoming);
    const answerText = resolveAnswerTextForQuestion(norm, savedAnswersRef.current, String(pick).trim());
    queueMicrotask(() => {
      setSelectedQuestion(pick);
      setDumpCards(wb.dumpCards);
      setStarZones(reconcileStarZonesWithCards(wb.dumpCards, wb.starZones));
      setAnswerDraft(answerText || wb.answerDraft);
      setStage(stageFromLoadedProgress(wb, answerText, listingStepLockRef));
      setUsedFallbackSort(wb.usedFallbackSort);
    });
  }, [allQuestions, selectedQuestion, savedAnswers, setStage]);

  useEffect(() => {
    if (!hydrationReady || !cloudWorkspaceSyncedRef.current) return;
    if (!selectedQuestion || !allQuestions.includes(selectedQuestion)) return;
    const prev = bundlesRef.current[selectedQuestion] || defaultQuestionBundle();
    const st = persistableStage(stage);
    const next = normalizeQuestionBundle({
      ...prev,
      dumpCards,
      starZones,
      answerDraft,
      stage: st,
      usedFallbackSort,
    });
    const prevWork = questionBundleHasWork(prev);
    const nextWork = questionBundleHasWork(next);
    if (prevWork && !nextWork) return;
    const changed =
      JSON.stringify(prev.dumpCards) !== JSON.stringify(next.dumpCards) ||
      JSON.stringify(prev.starZones) !== JSON.stringify(next.starZones) ||
      String(prev.answerDraft || "") !== String(next.answerDraft || "") ||
      prev.stage !== next.stage ||
      prev.usedFallbackSort !== next.usedFallbackSort ||
      String(prev.finalizedAnswer || "") !== String(next.finalizedAnswer || "");
    if (!changed && !nextWork) return;
    const nextEntry = {
      ...next,
      draftUpdatedAt: changed ? Date.now() : prev.draftUpdatedAt || Date.now(),
    };
    const nextAll = { ...bundlesRef.current, [selectedQuestion]: nextEntry };
    bundlesRef.current = nextAll;
    setQuestionBundles(nextAll);
    persistOrgLocal(selectedQuestion);
    scheduleCloudSave();
  }, [
    hydrationReady,
    dumpCards,
    starZones,
    answerDraft,
    stage,
    usedFallbackSort,
    selectedQuestion,
    allQuestions,
    persistOrgLocal,
    scheduleCloudSave,
  ]);

  useEffect(() => {
    void hydrateFromCloud();
  }, [hydrateFromCloud]);

  useEffect(() => {
    const onApplied = () => {
      cloudWorkspaceSyncedRef.current = false;
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
        cloudSaveTimerRef.current = null;
      }
      void hydrateFromCloud();
    };
    window.addEventListener("ng-cloud-session-applied", onApplied);
    return () => window.removeEventListener("ng-cloud-session-applied", onApplied);
  }, [hydrateFromCloud]);

  const starZonesForUi = useMemo(() => {
    if (stage !== 1) return starZones;
    return starPartitionMatchesCards(dumpCards, starZones) ? starZones : emptyZones();
  }, [stage, dumpCards, starZones]);

  const canOrganise = dumpCards.length >= 2 || zonesHaveCards(starZonesForUi);
  const canPractise = Boolean(answerDraft?.trim()) || stage === 3;

  const questionKey = String(resolvedQuestion || "").trim();

  const currentQuestionBundle = useMemo(() => {
    if (!questionKey) return null;
    const stored = bundleForQuestionKey(questionBundles, questionKey);
    return normalizeQuestionBundle({
      ...stored,
      dumpCards,
      starZones,
      answerDraft,
      stage: persistableStage(stage),
    });
  }, [questionKey, questionBundles, dumpCards, starZones, answerDraft, stage]);

  const hasFormulatedSpeech = useMemo(
    () =>
      questionKey
        ? hasFormulatedSpeechForQuestion(currentQuestionBundle, savedAnswers, questionKey, answerDraft)
        : false,
    [questionKey, savedAnswers, answerDraft, currentQuestionBundle],
  );

  const formulatedSpeechText = useMemo(() => {
    if (!hasFormulatedSpeech || !questionKey) return "";
    return formulatedSpeechDisplayText(resolvedQuestion, currentQuestionBundle, savedAnswers, answerDraft);
  }, [hasFormulatedSpeech, resolvedQuestion, questionKey, savedAnswers, answerDraft, currentQuestionBundle]);

  const showBrainDumpRevisitReadOnly =
    stage === 1 && hasFormulatedSpeech && !brainDumpEditingRevisit;

  const enterBrainDumpFromLaterStage = useCallback(() => {
    const qt = String(resolvedQuestion || "").trim();
    const bundle = normalizeQuestionBundle(bundlesRef.current[qt] || null);
    const hasSpeech = hasFormulatedSpeechForQuestion(
      bundle,
      savedAnswersRef.current,
      qt,
      answerDraft,
    );
    setBrainDumpEditingRevisit(!hasSpeech);
    setStage(1);
  }, [resolvedQuestion, answerDraft, setStage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(JOB_CTX_KEY, JSON.stringify(jobContext));
      saveWorkspaceJobContext(jobFingerprintRef.current, jobContext);
    } catch {
      /* ignore */
    }
  }, [jobContext]);

  useEffect(() => {
    const stateList = Array.isArray(savedAnswers) ? savedAnswers : [];
    const refList = Array.isArray(savedAnswersRef.current) ? savedAnswersRef.current : [];
    if (hydrationReady && stateList.length === 0 && refList.length > 0) {
      setSavedAnswers(refList);
      return;
    }
    if (stateList.length > 0 || refList.length === 0) {
      savedAnswersRef.current = stateList;
      saveWorkspaceSavedAnswers(jobFingerprintRef.current, stateList);
    }
    if (hydrationReady) scheduleCloudSave();
  }, [savedAnswers, scheduleCloudSave, hydrationReady]);

  useEffect(() => {
    if (!hydrationReady) return;
    persistOrgLocal(selectedQuestionRef.current);
    scheduleCloudSave();
  }, [customQuestions, persistOrgLocal, scheduleCloudSave, hydrationReady]);

  useEffect(() => {
    if (stage !== 3) return;
    const id = setInterval(() => {
    }, 9000);
    return () => clearInterval(id);
  }, [stage]);

  const flushBundleForQuestion = useCallback(
    (q) => {
      if (!q || !allQuestions.includes(q)) return;
      const prev = bundlesRef.current[q] || defaultQuestionBundle();
      const st = persistableStage(stage);
      const nextEntry = normalizeQuestionBundle({
        ...prev,
        dumpCards,
        starZones,
        answerDraft,
        stage: st,
        usedFallbackSort,
        draftUpdatedAt: Date.now(),
      });
      const nextAll = { ...bundlesRef.current, [q]: nextEntry };
      bundlesRef.current = nextAll;
      setQuestionBundles(nextAll);
    },
    [allQuestions, dumpCards, starZones, answerDraft, stage, usedFallbackSort],
  );

  const handleSelectQuestion = useCallback(
    (q) => {
      if (!allQuestions.includes(q) || q === selectedQuestion) return;
      flushBundleForQuestion(selectedQuestion);
      persistOrgLocal(selectedQuestion);
      // Refresh ✓ badges now that the outgoing bundle is flushed
      setAnsweredQuestions(() =>
        computeAnsweredQuestionsMap(bundlesRef.current, savedAnswersRef.current),
      );
      setSelectedQuestion(q);
      const incoming = bundleForQuestionKey(bundlesRef.current, q) || defaultQuestionBundle();
      const norm = normalizeQuestionBundle(incoming);
      const wb = workspaceFromBundle(incoming);
      const qt = String(q).trim();
      const answerText = resolveAnswerTextForQuestion(norm, savedAnswersRef.current, qt);
      setDumpCards(wb.dumpCards);
      setStarZones(reconcileStarZonesWithCards(wb.dumpCards, wb.starZones));
      setAnswerDraft(answerText || wb.answerDraft);
      setStage((prev) => stageWhenSelectingQuestion(prev, wb, Boolean(answerText), listingStepLockRef));
      setUsedFallbackSort(wb.usedFallbackSort);
      const bundle = normalizeQuestionBundle(incoming);
      const hasSpeech = hasFormulatedSpeechForQuestion(
        bundle,
        savedAnswersRef.current,
        qt,
        answerText || wb.answerDraft,
      );
      setBrainDumpEditingRevisit(!hasSpeech);
      persistOrgLocal(q);
      void saveProgressToDatabase({ throwOnError: false });
    },
    [allQuestions, selectedQuestion, flushBundleForQuestion, persistOrgLocal, saveProgressToDatabase, setStage],
  );

  const addCustomQuestion = useCallback(
    (raw) => {
      const t = String(raw || "").trim();
      if (!t || t.length > MAX_CUSTOM_QUESTION_CHARS) return;
      const base = buildQuestionList(jobContext, profileSkillSet);
      if (base.some((x) => String(x).trim() === t)) return;
      const cur = customQuestionsRef.current;
      if (cur.some((x) => String(x).trim() === t)) return;
      if (cur.length >= MAX_CUSTOM_QUESTIONS) return;
      flushBundleForQuestion(selectedQuestionRef.current);
      const next = [...cur, t];
      customQuestionsRef.current = next;
      setCustomQuestions(next);
      setSelectedQuestion(t);
      setDumpCards([]);
      setStarZones(emptyZones());
      setAnswerDraft("");
      setStage(1);
      setUsedFallbackSort(false);
      setBrainDumpEditingRevisit(false);
      persistOrgLocal(t);
      void saveProgressToDatabase({ throwOnError: false });
    },
    [jobContext, profileSkillSet, flushBundleForQuestion, persistOrgLocal, saveProgressToDatabase, setStage],
  );

  const runOrganise = useCallback(async () => {
    releaseListingEntryStepLock(listingStepLockRef);

    const alreadyOrganised =
      dumpCards.length > 0 &&
      zonesHaveCards(starZones) &&
      starPartitionMatchesCards(dumpCards, starZones);

    if (alreadyOrganised) {
      commitWorkspaceToBundle({ stage: 2 });
      setStage(2);
      try {
        await saveProgressToDatabase({ force: true });
      } catch {
        /* non-fatal */
      }
      return;
    }

    workspaceApplyGenRef.current += 1;
    const organiseGen = workspaceApplyGenRef.current;
    setOrganising(true);
    let fallback = false;
    let zones = emptyZones();
    let workingCards = dumpCards;
    try {
      if (liveSimplifyEnabled && dumpCards.length && resolvedQuestion) {
        try {
          const res = await starSortInterview(resolvedQuestion, dumpCards);
          if (Array.isArray(res.cards) && res.cards.length) {
            workingCards = res.cards.map((c) => ({
              id: String(c.id),
              text: String(c.text),
            }));
          }
          zones = {
            situation: res.situation || [],
            task: res.task || [],
            action: res.action || [],
            result: res.result || [],
          };
        } catch {
          fallback = true;
          workingCards = expandLongDumpCardsHeuristic(dumpCards);
          zones = heuristicStarSort(workingCards);
        }
      } else {
        fallback = true;
        workingCards = expandLongDumpCardsHeuristic(dumpCards);
        zones = heuristicStarSort(workingCards);
      }
      zones = reconcileStarZonesWithCards(workingCards, zones);
      if (organiseGen !== workspaceApplyGenRef.current) return;
      const q = resolvedQuestion;
      commitWorkspaceToBundle({
        question: q,
        dumpCards: workingCards,
        starZones: zones,
        stage: 2,
        usedFallbackSort: fallback,
        answerDraft: "",
        speechFormulated: false,
        formulatedStarKey: "",
      });
      setDumpCards(workingCards);
      setUsedFallbackSort(fallback);
      setStarZones(zones);
      setAnswerDraft("");
      setStage(2);
      await saveProgressToDatabase({ force: true });
    } finally {
      if (organiseGen === workspaceApplyGenRef.current) setOrganising(false);
    }
  }, [
    dumpCards,
    resolvedQuestion,
    starZones,
    setStage,
    commitWorkspaceToBundle,
    saveProgressToDatabase,
  ]);

  const saveOrganiseProgress = useCallback(async () => {
    commitWorkspaceToBundle({ stage: 2 });
    try {
      await saveProgressToDatabase({ force: true });
      setOrganiseSaveAck(true);
      window.setTimeout(() => setOrganiseSaveAck(false), 3200);
    } catch {
      /* user may be offline */
    }
  }, [commitWorkspaceToBundle, saveProgressToDatabase]);

  const goBuildAnswer = useCallback(async () => {
    releaseListingEntryStepLock(listingStepLockRef);

    const question = String(resolvedQuestion || "").trim();
    const existingAnswer = String(answerDraft || "").trim();
    const starKey = starContentFingerprint(question, starZones, dumpCards);
    const bundle = normalizeQuestionBundle(
      questionBundles[question] || defaultQuestionBundle(),
    );
    const starNotesUnchanged = bundle.formulatedStarKey === starKey;
    const alreadyAiSpeech =
      existingAnswer &&
      bundle.speechFormulated &&
      starNotesUnchanged &&
      !isHeuristicStarDraft(existingAnswer, question);

    if (alreadyAiSpeech) {
      setFormulateNotice("");
      commitWorkspaceToBundle({
        answerDraft: existingAnswer,
        stage: 3,
        speechFormulated: true,
        formulatedStarKey: starKey,
      });
      setStage(3);
      try {
        await saveProgressToDatabase({ force: true });
      } catch {
        /* non-fatal */
      }
      return;
    }

    setFormulateNotice("");
    setFormulatingAnswer(true);
    setStage(3);

    let draft = "";
    let speechFormulated = false;
    try {
      const starTexts = starZoneTextsFromCards(starZones, dumpCards);
      const hasStarContent = Object.values(starTexts).some((arr) => arr.length > 0);

      if (!liveSimplifyEnabled) {
        console.warn("[InterviewPrep] Gemini disabled (VITE_SIMPLIFY_API=0); using STAR outline draft.");
      } else if (!hasStarContent) {
        console.warn("[InterviewPrep] No STAR card text resolved for speech formulation.");
      }

      if (liveSimplifyEnabled && hasStarContent && question) {
        try {
          const res = await formulateInterviewSpeech(question, starTexts);
          draft = cleanSpeechDraft(String(res?.text || "").trim(), question);
          if (draft) {
            speechFormulated = true;
            setFormulateNotice("");
          }
        } catch (err) {
          console.warn("[InterviewPrep] formulate-speech failed:", err);
          draft = "";
        }
      }

      if (!draft && liveSimplifyEnabled && hasStarContent && question) {
        try {
          const res = await reshapeSpeechFromStarNotes(question, starTexts);
          draft = cleanSpeechDraft(String(res?.text || "").trim(), question);
          if (draft) {
            speechFormulated = true;
            setFormulateNotice("");
          }
        } catch (reshapeErr) {
          console.warn("[InterviewPrep] reshape speech fallback failed:", reshapeErr);
        }
      }

      if (!draft) {
        draft = cleanSpeechDraft(buildAnswerDraftFromStar(starZones, dumpCards), question);
        speechFormulated = false;
        if (liveSimplifyEnabled && hasStarContent) {
          setFormulateNotice(
            "Could not generate a spoken answer. Check that GEMINI_API_KEY is set on the API (Lambda or local backend).",
          );
        }
      }

      commitWorkspaceToBundle({
        answerDraft: draft,
        stage: 3,
        speechFormulated,
        formulatedStarKey: speechFormulated ? starKey : "",
      });
      setAnswerDraft(draft);
      try {
        await saveProgressToDatabase({ force: true });
      } catch {
        /* non-fatal */
      }
    } finally {
      setFormulatingAnswer(false);
    }
  }, [
    answerDraft,
    dumpCards,
    resolvedQuestion,
    starZones,
    questionBundles,
    setStage,
    commitWorkspaceToBundle,
    saveProgressToDatabase,
  ]);

  const handleStageSelect = useCallback(
    (nextStage) => {
      if (nextStage > 1) releaseListingEntryStepLock(listingStepLockRef);
      if (nextStage === 1 && stage > 1) {
        enterBrainDumpFromLaterStage();
        return;
      }
      if (nextStage === 2 && stage !== 2 && dumpCards.length > 0 && !starPartitionMatchesCards(dumpCards, starZones)) {
        void runOrganise();
        return;
      }
      if (nextStage === 3 && stage !== 3) {
        void goBuildAnswer();
        return;
      }
      setStage(nextStage);
    },
    [stage, dumpCards, starZones, enterBrainDumpFromLaterStage, runOrganise, goBuildAnswer, setStage],
  );

  const persistFormulatedAnswer = useCallback(() => {
    const q = selectedQuestion;
    if (!q || !allQuestions.includes(q)) return;
    const text = String(answerDraft || "").trim();
    if (!text) return;
    const now = Date.now();
    const qn = String(resolvedQuestion || "").trim();
    commitWorkspaceToBundle({
      finalizedAnswer: text,
      finalizedAt: now,
      answerDraft: text,
      stage: persistableStage(stage),
    });
    const existing = savedAnswersRef.current?.find((x) => String(x.question || "").trim() === qn);
    const entry = {
      id: existing?.id || uid("save"),
      question: qn,
      answer: text,
      role: jobContext.role,
      company: jobContext.company,
      savedAt: now,
    };
    savedAnswersRef.current = [entry, ...savedAnswersRef.current.filter((x) => String(x.question || "").trim() !== qn)].slice(
      0,
      40,
    );
    setSavedAnswers(savedAnswersRef.current);
    setAnsweredQuestions(() => computeAnsweredQuestionsMap(bundlesRef.current, savedAnswersRef.current));
    persistOrgLocal(q);
  }, [
    answerDraft,
    allQuestions,
    jobContext.company,
    jobContext.role,
    persistOrgLocal,
    resolvedQuestion,
    selectedQuestion,
    stage,
    commitWorkspaceToBundle,
  ]);

  const saveAnswer = useCallback(async () => {
    persistFormulatedAnswer();
    try {
      await saveProgressToDatabase({ force: true });
    } catch {
      /* non-fatal */
    }
  }, [persistFormulatedAnswer, saveProgressToDatabase]);

  const nextQuestion = useCallback(async () => {
    persistFormulatedAnswer();
    const qs = allQuestions;
    const idx = Math.max(0, qs.indexOf(resolvedQuestion));
    const next = qs[(idx + 1) % qs.length] || qs[0];
    try {
      await saveProgressToDatabase({ force: true });
    } catch {
      /* non-fatal */
    }
    setSelectedQuestion(next);
    const incoming = bundleForQuestionKey(bundlesRef.current, next) || defaultQuestionBundle();
    const norm = normalizeQuestionBundle(incoming);
    const wb = workspaceFromBundle(incoming);
    const answerText = resolveAnswerTextForQuestion(norm, savedAnswersRef.current, String(next).trim());
    setDumpCards(wb.dumpCards);
    setStarZones(reconcileStarZonesWithCards(wb.dumpCards, wb.starZones));
    setAnswerDraft(answerText || wb.answerDraft);
    setStage(stageFromLoadedProgress(wb, answerText, listingStepLockRef));
    setUsedFallbackSort(wb.usedFallbackSort);
    const hasSpeech = hasFormulatedSpeechForQuestion(
      norm,
      savedAnswersRef.current,
      String(next).trim(),
      answerText || wb.answerDraft,
    );
    setBrainDumpEditingRevisit(!hasSpeech);
    persistOrgLocal(next);
  }, [
    allQuestions,
    resolvedQuestion,
    persistFormulatedAnswer,
    saveProgressToDatabase,
    persistOrgLocal,
    setStage,
  ]);

  const skillsShow = normalizedSkills(jobContext);
  const hasJobHints = Boolean(jobContext.role || jobContext.company || skillsShow.length);

  return (
    <div className="ip-page">
      <a className="skip-link" href="#ip-main-content">
        Skip to interview prep
      </a>

      <header className="ip-hero-override">
        <div className="ip-hero-inner">
          <div className="ip-hero-top">
            <div className="ip-hero-copy">
              <p className="ip-hero-back">
                <Link
                  to={INTERVIEW_PREP_LIST_PATH}
                  onClick={(e) => {
                    e.preventDefault();
                    goToInterviewPrepListing(navigate);
                  }}
                  className="ip-hero-back__link"
                >
                  ← All jobs
                </Link>
              </p>
              <p className="simplify-hero-eyebrow">Step by step · STAR method</p>
              <h1 className="ip-hero-title">Interview Prep</h1>
              <p className="ip-hero-lead">
                Build confident, structured answers using the STAR method, tailored to your job and ADHD profile.
              </p>
            </div>

            {hasJobHints ? (
              <div className="ip-role-pill" aria-label="Role from your simplified posting">
                <span className="ip-role-pill__label">Preparing for</span>
                <strong className="ip-role-pill__role">{jobContext.role || "Role"}</strong>
                {jobContext.company ? <span className="ip-role-pill__company">at {jobContext.company}</span> : null}
              </div>
            ) : (
              <p className="ip-role-pill ip-role-pill--hint">
                <Link to="/simplify-job-description">Simplify a job posting</Link> for tailored questions.
              </p>
            )}
          </div>

          {skillsShow.length > 0 && (
            <div className="ip-skill-row">
              {skillsShow.slice(0, 10).map((tag) => (
                <span key={tag} className={`ip-tag ${skillMatchesProfile(tag, profileSkillSet) ? "ip-tag--match" : ""}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="ip-hero-tabs">
            <StageTabs stage={stage} onSelect={handleStageSelect} canOrganise={canOrganise} canPractise={canPractise} />
          </div>
        </div>
      </header>

      <main id="ip-main-content" className="ip-page-main">
        {stage === 1 ? (
          <section role="tabpanel" id="ip-tab-panel-1" aria-labelledby="ip-tab-1" className="ip-tab-panel">
            <BrainDumpStage
              questions={allQuestions}
              selectedQuestion={resolvedQuestion}
              onSelectQuestion={handleSelectQuestion}
              answeredQuestions={answeredQuestions}
              onAddCustomQuestion={addCustomQuestion}
              customQuestionMaxChars={MAX_CUSTOM_QUESTION_CHARS}
              customQuestionsUsed={customQuestions.length}
              customQuestionsMax={MAX_CUSTOM_QUESTIONS}
              dumpCards={dumpCards}
              onDumpChange={setDumpCards}
              onContinue={() => runOrganise()}
              organising={organising}
              revisitReadOnly={showBrainDumpRevisitReadOnly}
              revisitSpeechText={formulatedSpeechText}
              hasFormulatedSpeech={hasFormulatedSpeech}
              isEditingRevisit={brainDumpEditingRevisit}
              onStartEditRevisit={() => setBrainDumpEditingRevisit(true)}
              onBackToListing={() => goToInterviewPrepListing(navigate)}
            />
          </section>
        ) : null}

        {stage === 2 ? (
          <section role="tabpanel" id="ip-tab-panel-2" aria-labelledby="ip-tab-2" className="ip-tab-panel">
            <OrganiseStage
              dumpCards={dumpCards}
              onDumpChange={setDumpCards}
              starZones={starZones}
              onZonesChange={setStarZones}
              usedFallbackSort={usedFallbackSort}
              onSave={() => void saveOrganiseProgress()}
              onContinue={() => void goBuildAnswer()}
              onBack={enterBrainDumpFromLaterStage}
              needsStarSort={dumpCards.length >= 1 && !zonesHaveCards(starZonesForUi)}
              onSortNow={() => runOrganise()}
              organising={organising || formulatingAnswer}
              saving={cloudSaving}
              saveAck={organiseSaveAck}
            />
          </section>
        ) : null}

        {stage === 3 ? (
          <section role="tabpanel" id="ip-tab-panel-3" aria-labelledby="ip-tab-3" className="ip-tab-panel">
            <PractiseStage
              selectedQuestion={resolvedQuestion}
              answerDraft={answerDraft}
              formulating={formulatingAnswer}
              formulateNotice={formulateNotice}
              onAnswerChange={setAnswerDraft}
              onSave={() => void saveAnswer()}
              onNextQuestion={() => void nextQuestion()}
              onBack={() => setStage(2)}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

function resolveInterviewPrepMountKey(location) {
  const stateKey = location?.state?.ipSessionKey;
  const nonce = location?.state?.ipMountNonce ?? "";
  const fp =
    (stateKey && String(stateKey).trim()) ||
    getActiveInterviewPrepFingerprint() ||
    deriveInterviewPrepJobFingerprint(safeParse(window.localStorage.getItem(JOB_CTX_KEY)));
  return `${fp}::${nonce}`;
}

export default function InterviewPrepPage() {
  const location = useLocation();
  const mountKey = resolveInterviewPrepMountKey(location);
  const initial = useMemo(() => loadInterviewPrepBootstrap(), [mountKey]);
  if (!jobContextHasInterviewSource(initial.jobContext)) {
    return <Navigate to={INTERVIEW_PREP_LIST_PATH} replace />;
  }
  return <InterviewPrepContent key={mountKey} initial={initial} />;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StageTabs from "../components/interview-prep/StageTabs.jsx";
import BrainDumpStage from "../components/interview-prep/BrainDumpStage.jsx";
import OrganiseStage from "../components/interview-prep/OrganiseStage.jsx";
import PractiseStage from "../components/interview-prep/PractiseStage.jsx";
import JobExperienceHub from "../components/experience-hub/JobExperienceHub.jsx";
import { generateInterviewQuestions, liveSimplifyEnabled, starSortInterview } from "../services/interviewPrepApi.js";
import { fetchInterviewPrepProgress, putInterviewPrepProgress } from "../services/interviewPrepProgressApi.js";
import { hasCloudSessionCredentials, readCredentials } from "../utils/cloudSync.js";
import {
  buildAnswerDraftFromStar,
  defaultQuestionBundle,
  deriveInterviewPrepJobFingerprint,
  heuristicStarSort,
  loadJobContextFromSimplifyHistory,
  mergeQuestionBundlesFromServer,
  normalizeQuestionBundle,
  readProfileSkillSet,
  simplifiedSnapshotHasContent,
  skillMatchesProfile,
  uid,
} from "../utils/interviewPrepHelpers.js";

const JOB_CTX_KEY = "neuroguide.interviewPrep.jobContext.v1";
const ORG_KEY = "neuroguide.interviewPrep.organised.v1";
const SAVED_KEY = "neuroguide.interviewPrep.savedAnswers.v3";
const PROFILE_KEY = "neuroguide.careerProfile.react.v2";
// AI-generated questions cached per job fingerprint: { [fingerprint]: string[] }
const AI_QUESTIONS_KEY = "neuroguide.interviewPrep.aiQuestions.v1";
const MAX_CUSTOM_QUESTIONS = 10;
const MAX_CUSTOM_QUESTION_CHARS = 480;

//The page checks if it has already generated questions for this exact job before
function loadAiQuestionsFromCache(fingerprint) {
  if (!fingerprint || typeof window === "undefined") return null;
  const map = safeParse(window.localStorage.getItem(AI_QUESTIONS_KEY));
  if (!map || typeof map !== "object") return null;
  const qs = map[fingerprint];
  return Array.isArray(qs) && qs.length > 0 ? qs : null;
}

function saveAiQuestionsToCache(fingerprint, questions) {
  if (!fingerprint || typeof window === "undefined" || !Array.isArray(questions) || !questions.length) return;
  try {
    const existing = safeParse(window.localStorage.getItem(AI_QUESTIONS_KEY)) || {};
    existing[fingerprint] = questions;
    window.localStorage.setItem(AI_QUESTIONS_KEY, JSON.stringify(existing));
  } catch { /* ignore */ }
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

/** One saved row per question text (newest wins). */
function mergeSavedAnswersByQuestion(local, remote) {
  const norm = (q) => String(q || "").trim();
  const by = new Map();
  for (const x of [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])]) {
    if (!x || typeof x !== "object") continue;
    const k = norm(x.question);
    if (!k) continue;
    const prev = by.get(k);
    const ta = Number(x.savedAt || 0);
    const tb = Number(prev?.savedAt || 0);
    if (!prev || ta > tb || (ta === tb && String(x.answer || "").length >= String(prev.answer || "").length)) {
      by.set(k, { ...x, question: k });
    }
  }
  return [...by.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 40);
}

function emptyZones() {
  return { situation: [], action: [], result: [], learning: [] };
}

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadSavedAnswers() {
  const parsed = safeParse(typeof window !== "undefined" ? window.localStorage.getItem(SAVED_KEY) : null);
  if (Array.isArray(parsed)) return parsed;
  return [];
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


function migrateLegacyStage(stored) {
  if (typeof stored !== "number" || Number.isNaN(stored)) return 1;
  return Math.min(3, Math.max(1, stored));
}

function zonesHaveCards(z) {
  return Object.values(z || {}).some((arr) => Array.isArray(arr) && arr.length > 0);
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
  return {
    dumpCards: n.dumpCards,
    starZones: n.starZones,
    answerDraft: n.answerDraft,
    stage: migrateLegacyStage(n.stage),
    usedFallbackSort: n.usedFallbackSort,
  };
}

function loadInterviewPrepBootstrap() {
  if (typeof window === "undefined") {
    return {
      stage: 1,
      jobContext: defaultJobContext(),
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
  const org = safeParse(window.localStorage.getItem(ORG_KEY));
  const saved = loadSavedAnswers();
  const fromSimplify = loadJobContextFromSimplifyHistory();
  const mergedJob = mergeJobContextFromSources(jc, fromSimplify);
  const { bundles, activeQuestion } = migrateOrgToBundles(org);
  const sel = typeof activeQuestion === "string" ? activeQuestion : null;
  //If the active question was known, unpack its saved data into usable state. If not, give me a blank workspace.
  const wb = workspaceFromBundle(sel ? bundles[sel] : null);

  const customQs = Array.isArray(org?.customQuestions)
    ? org.customQuestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_QUESTIONS)
    : [];

  // Load AI-generated questions from localStorage cache (keyed by job fingerprint).
  const fp = deriveInterviewPrepJobFingerprint(mergedJob);
  const aiQuestions = loadAiQuestionsFromCache(fp);

  return {
    stage: migrateLegacyStage(org?.stage),
    jobContext: mergedJob,
    jobFingerprint: fp,
    bundles,
    selectedQuestion: sel,
    dumpCards: wb.dumpCards,
    starZones: wb.starZones,
    answerDraft: wb.answerDraft,
    savedAnswers: mergeSavedAnswersByQuestion([], Array.isArray(saved) ? saved : []),
    usedFallbackSort: wb.usedFallbackSort,
    customQuestions: customQs,
    aiQuestions,
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

function buildQuestionList(jobContext, profileSkillSet) {
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

  const universal = [
    "Tell me about a time you faced a difficult problem at work. How did you solve it?",
    "Describe a situation where things didn't go to plan. What did you do?",
    "Tell me about a time you had to make a decision with limited information.",
    "Tell me about a time you received critical feedback. How did you respond?",
    "Describe a situation where you had to quickly learn something new.",
    "Why do you want this role?",
    "Tell me about yourself.",
  ];

  const out = [...tailored.slice(0, 4)];
  for (const u of universal) {
    if (out.length >= 6) break;
    if (!out.includes(u)) out.push(u);
  }
  return out.slice(0, 6);
}

function readinessLabelFor(p) {
  if (p < 55) return "Getting there";
  if (p < 82) return "Almost ready";
  return "Ready to go";
}

function jobContextHasInterviewSource(jc) {
  if (!jc || typeof jc !== "object") return false;
  if (String(jc.rawText || "").trim()) return true;
  if (String(jc.role || "").trim()) return true;
  if (simplifiedSnapshotHasContent(jc.simplifiedSnapshot)) return true;
  return false;
}

function InterviewPrepContent({ initial }) {
  const bundlesRef = useRef(initial.bundles || {});

  const [stage, setStage] = useState(() => initial.stage);
  const [jobContext] = useState(() => initial.jobContext);
  const [selectedQuestion, setSelectedQuestion] = useState(() => initial.selectedQuestion);
  const [dumpCards, setDumpCards] = useState(() => initial.dumpCards);
  const [starZones, setStarZones] = useState(() => initial.starZones);
  const [answerDraft, setAnswerDraft] = useState(() => initial.answerDraft);
  const [savedAnswers, setSavedAnswers] = useState(() => initial.savedAnswers);
  const [usedFallbackSort, setUsedFallbackSort] = useState(() => initial.usedFallbackSort);
  const [readinessPercent, setReadinessPercent] = useState(40);
  const [organising, setOrganising] = useState(false);
  const [customQuestions, setCustomQuestions] = useState(() => initial.customQuestions || []);
  // Tracks which questions have saved content so QuestionSelector can show a ticked badge.
  // Derived from bundlesRef on mount and refreshed whenever the user switches questions.
  const [answeredQuestions, setAnsweredQuestions] = useState(() => {
    const out = {};
    for (const [q, b] of Object.entries(initial.bundles || {})) {
      const nb = normalizeQuestionBundle(b);
      if (nb.dumpCards.length > 0 || nb.answerDraft) out[q] = true;
    }
    return out;
  });

  // AI-generated questions for this job (null = not yet loaded / generating)
  const [aiQuestions, setAiQuestions] = useState(() => initial.aiQuestions ?? null);
  const aiQuestionsRef = useRef(initial.aiQuestions ?? null);
  const jobFingerprint = initial.jobFingerprint;
  // True while waiting for Gemini to return questions (only when no cache exists).
  // False once questions arrive, generation fails, or API is disabled — falls back to templates.
  const [aiQuestionsLoading, setAiQuestionsLoading] = useState(
    () => initial.aiQuestions === null && liveSimplifyEnabled,
  );

  useEffect(() => {
    aiQuestionsRef.current = aiQuestions;
  }, [aiQuestions]);

  const profileSkillSet = useMemo(() => {
    if (typeof window === "undefined") return new Set();
    return readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
  }, []);

  // Use AI questions when available.
  // While loading: return empty so QuestionSelector shows a skeleton (not stale templates).
  // Only fall back to templates if generation actually failed (loading done, still no questions).
  const baseQuestions = useMemo(
    () => aiQuestions ?? (aiQuestionsLoading ? [] : buildQuestionList(jobContext, profileSkillSet)),
    [aiQuestions, aiQuestionsLoading, jobContext, profileSkillSet],
  );

  // Combines baseQuestions (AI generated) with customQuestions (ones you added yourself) into one final list. This is what gets shown in the question selector.
  const allQuestions = useMemo(
    () => combineQuestionLists(baseQuestions, customQuestions),
    [baseQuestions, customQuestions],
  );
//It checks if your selected question still in the list? If yes, 
// use it. If no, quietly fall back to the first question in the new list.
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

  const persistOrgLocal = useCallback((activeQ) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ORG_KEY,
        JSON.stringify({
          v: 2,
          bundles: bundlesRef.current,
          activeQuestion: activeQ ?? selectedQuestionRef.current,
          customQuestions: customQuestionsRef.current,
        }),
      );
    } catch {
      /* ignore */
    }
  }, []);
//save to database
//Only runs if you're logged in
  const pushCloudProgress = useCallback(async () => {
    if (!hasCloudSessionCredentials()) return;
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) return;
    const fp = deriveInterviewPrepJobFingerprint(jobContext);
    // Prefer AI-generated questions for storage; fall back to template list.
    const base = aiQuestionsRef.current
      ?? buildQuestionList(jobContext, readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY)));
    const iq = combineQuestionLists(base, customQuestionsRef.current);
    try {
      await putInterviewPrepProgress(cred, {
        job_fingerprint: fp,
        simplified_job: jobContext.simplifiedSnapshot && typeof jobContext.simplifiedSnapshot === "object"
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
    } catch {
    
    }
  }, [jobContext]);

  useEffect(() => {
    if (!allQuestions.length) return;
    if (selectedQuestion && allQuestions.includes(selectedQuestion)) return;
    const pick = allQuestions[0];
    const wb = workspaceFromBundle(bundlesRef.current[pick]);
    queueMicrotask(() => {
      setSelectedQuestion(pick);
      setDumpCards(wb.dumpCards);
      setStarZones(wb.starZones);
      setAnswerDraft(wb.answerDraft);
      setStage(wb.stage);
      setUsedFallbackSort(wb.usedFallbackSort);
    });
  }, [allQuestions, selectedQuestion]);

  useEffect(() => {
    if (!selectedQuestion || !allQuestions.includes(selectedQuestion)) return;
    const prev = bundlesRef.current[selectedQuestion] || defaultQuestionBundle();
    bundlesRef.current[selectedQuestion] = normalizeQuestionBundle({
      ...prev,
      dumpCards,
      starZones,
      answerDraft,
      stage,
      usedFallbackSort,
      draftUpdatedAt: Date.now(),
    });
    persistOrgLocal(selectedQuestion);
  }, [dumpCards, starZones, answerDraft, stage, usedFallbackSort, selectedQuestion, allQuestions, persistOrgLocal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasCloudSessionCredentials()) return;
      const cred = readCredentials();
      if (!cred?.userId || !cred?.passKey) return;
      const fp = deriveInterviewPrepJobFingerprint(jobContext);
      const prof = readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
      try {
        const row = await fetchInterviewPrepProgress(cred, fp);
        if (!row || cancelled) return;
        // If the DB has AI-generated questions cached from a previous save, use them.
        if (Array.isArray(row.interview_questions) && row.interview_questions.length > 0 && !aiQuestionsRef.current) {
          const cloudQs = row.interview_questions.filter(Boolean);
          if (cloudQs.length > 0) {
            aiQuestionsRef.current = cloudQs;
            setAiQuestions(cloudQs);
            setAiQuestionsLoading(false);
            saveAiQuestionsToCache(fp, cloudQs);
          }
        }
        const prog = row.progress && typeof row.progress === "object" ? row.progress : {};
        const remoteCustom = Array.isArray(prog.customQuestions) ? prog.customQuestions : [];
        const mergedCustom = mergeCustomQuestionLists(customQuestionsRef.current, remoteCustom);
        customQuestionsRef.current = mergedCustom;
        setCustomQuestions(mergedCustom);
        const qs = combineQuestionLists(buildQuestionList(jobContext, prof), mergedCustom);
        const serverBundles = prog.bundles && typeof prog.bundles === "object" ? prog.bundles : {};
        const merged = mergeQuestionBundlesFromServer(bundlesRef.current, serverBundles, qs);
        bundlesRef.current = merged;
        const remoteSaved = Array.isArray(prog.savedAnswers) ? prog.savedAnswers : null;
        if (remoteSaved?.length) {
          setSavedAnswers((prev) => mergeSavedAnswersByQuestion(prev, remoteSaved));
        }
        const aq =
          typeof prog.activeQuestion === "string" && qs.includes(prog.activeQuestion) ? prog.activeQuestion : null;
        if (aq) {
          const wb = workspaceFromBundle(merged[aq]);
          queueMicrotask(() => {
            setSelectedQuestion(aq);
            setDumpCards(wb.dumpCards);
            setStarZones(wb.starZones);
            setAnswerDraft(wb.answerDraft);
            setStage(wb.stage);
            setUsedFallbackSort(wb.usedFallbackSort);
          });
        }
        persistOrgLocal(aq || selectedQuestionRef.current);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobContext, persistOrgLocal]);

  // Generate AI questions on first visit for this job (when not in localStorage or DB cache).
  useEffect(() => {
    if (aiQuestions !== null) return; // already have questions — cached or from cloud
    if (!liveSimplifyEnabled) {
      setAiQuestionsLoading(false); // API disabled — fall back to templates immediately
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const skills = normalizedSkills(jobContext);
        const knownSkills = skills.filter((s) => skillMatchesProfile(s, profileSkillSet));
        const learningSkills = skills.filter((s) => !skillMatchesProfile(s, profileSkillSet));
        const result = await generateInterviewQuestions({
          role: jobContext.role || "",
          company: jobContext.company || "",
          known_skills: knownSkills,
          learning_skills: learningSkills,
          simplified_snapshot: jobContext.simplifiedSnapshot || null,
        });
        if (cancelled) return;
        if (Array.isArray(result.questions) && result.questions.length) {
          setAiQuestions(result.questions);
          saveAiQuestionsToCache(jobFingerprint, result.questions);
        }
      } catch {
        // Gemini failed — fall back to templates silently.
      } finally {
        if (!cancelled) setAiQuestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiQuestions, jobContext, profileSkillSet, jobFingerprint]);

  const canOrganise = dumpCards.length >= 1 || zonesHaveCards(starZones);
  const canPractise = Boolean(answerDraft?.trim()) || stage === 3;

  useEffect(() => {
    window.localStorage.setItem(JOB_CTX_KEY, JSON.stringify(jobContext));
  }, [jobContext]);

  useEffect(() => {
    savedAnswersRef.current = savedAnswers;
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(savedAnswers));
  }, [savedAnswers]);

  useEffect(() => {
    persistOrgLocal(selectedQuestionRef.current);
  }, [customQuestions, persistOrgLocal]);

  useEffect(() => {
    if (stage !== 3) return;
    const id = setInterval(() => {
      setReadinessPercent((p) => Math.min(94, p + 1));
    }, 9000);
    return () => clearInterval(id);
  }, [stage]);

  const flushBundleForQuestion = useCallback(
    (q) => {
      if (!q || !allQuestions.includes(q)) return;
      const prev = bundlesRef.current[q] || defaultQuestionBundle();
      bundlesRef.current[q] = normalizeQuestionBundle({
        ...prev,
        dumpCards,
        starZones,
        answerDraft,
        stage,
        usedFallbackSort,
        draftUpdatedAt: Date.now(),
      });
    },
    [allQuestions, dumpCards, starZones, answerDraft, stage, usedFallbackSort],
  );

  const handleSelectQuestion = useCallback(
    (q) => {
      if (!allQuestions.includes(q) || q === selectedQuestion) return;
      flushBundleForQuestion(selectedQuestion);
      persistOrgLocal(selectedQuestion);
      // Refresh answered badges now that the outgoing question's bundle is flushed
      setAnsweredQuestions(() => {
        const out = {};
        for (const [qk, b] of Object.entries(bundlesRef.current)) {
          const nb = normalizeQuestionBundle(b);
          if (nb.dumpCards.length > 0 || nb.answerDraft) out[qk] = true;
        }
        return out;
      });
      setSelectedQuestion(q);
      const incoming = bundlesRef.current[q] || defaultQuestionBundle();
      const wb = workspaceFromBundle(incoming);
      setDumpCards(wb.dumpCards);
      setStarZones(wb.starZones);
      setAnswerDraft(wb.answerDraft);
      setStage(wb.stage);
      setUsedFallbackSort(wb.usedFallbackSort);
      setReadinessPercent(40);
      persistOrgLocal(q);
    },
    [allQuestions, selectedQuestion, flushBundleForQuestion, persistOrgLocal],
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
      setReadinessPercent(40);
      persistOrgLocal(t);
    },
    [jobContext, profileSkillSet, flushBundleForQuestion, persistOrgLocal],
  );

  const removeCustomQuestion = useCallback(
    (q) => {
      const t = String(q || "").trim();
      const cur = customQuestionsRef.current;
      if (!cur.some((x) => String(x).trim() === t)) return;
      const wasSelected = selectedQuestionRef.current === t;
      flushBundleForQuestion(selectedQuestionRef.current);
      const next = cur.filter((x) => String(x).trim() !== t);
      customQuestionsRef.current = next;
      setCustomQuestions(next);
      if (bundlesRef.current[t]) delete bundlesRef.current[t];
      setSavedAnswers((prev) => prev.filter((x) => String(x.question || "").trim() !== t));
      const combined = combineQuestionLists(baseQuestions, next);
      const pick = wasSelected ? combined[0] ?? null : selectedQuestionRef.current;
      if (wasSelected) {
        if (pick) {
          setSelectedQuestion(pick);
          const wb = workspaceFromBundle(bundlesRef.current[pick] || defaultQuestionBundle());
          setDumpCards(wb.dumpCards);
          setStarZones(wb.starZones);
          setAnswerDraft(wb.answerDraft);
          setStage(wb.stage);
          setUsedFallbackSort(wb.usedFallbackSort);
        } else {
          setSelectedQuestion(null);
          setDumpCards([]);
          setStarZones(emptyZones());
          setAnswerDraft("");
          setStage(1);
          setUsedFallbackSort(false);
        }
        setReadinessPercent(40);
      }
      persistOrgLocal(pick);
    },
    [baseQuestions, flushBundleForQuestion, persistOrgLocal],
  );

  const runOrganise = useCallback(async () => {
    setOrganising(true);
    let fallback = false;
    let zones = emptyZones();
    try {
      if (liveSimplifyEnabled && dumpCards.length && resolvedQuestion) {
        try {
          const res = await starSortInterview(resolvedQuestion, dumpCards);
          zones = {
            situation: res.situation || [],
            action: res.action || [],
            result: res.result || [],
            learning: res.learning || [],
          };
        } catch {
          fallback = true;
          zones = heuristicStarSort(dumpCards);
        }
      } else {
        fallback = true;
        zones = heuristicStarSort(dumpCards);
      }
      setUsedFallbackSort(fallback);
      setStarZones(zones);
      setStage(2);
    } finally {
      setOrganising(false);
    }
  }, [dumpCards, resolvedQuestion]);

  const goBuildAnswer = useCallback(() => {
    const draft = buildAnswerDraftFromStar(starZones, dumpCards, resolvedQuestion || "");
    setAnswerDraft(draft);
    setReadinessPercent(40);
    setStage(3);
  }, [dumpCards, resolvedQuestion, starZones]);

  const bumpReadiness = useCallback((n) => {
    setReadinessPercent((p) => Math.min(98, p + (n || 6)));
  }, []);

  const saveAnswer = useCallback(() => {
    const q = selectedQuestion;
    if (!q || !allQuestions.includes(q)) return;
    const prev = bundlesRef.current[q] || defaultQuestionBundle();
    const now = Date.now();
    bundlesRef.current[q] = normalizeQuestionBundle({
      ...prev,
      dumpCards,
      starZones,
      answerDraft,
      stage,
      usedFallbackSort,
      draftUpdatedAt: now,
      finalizedAnswer: answerDraft,
      finalizedAt: now,
    });
    const qn = String(resolvedQuestion || "").trim();
    const existing = savedAnswersRef.current?.find((x) => String(x.question || "").trim() === qn);
    const entry = {
      id: existing?.id || uid("save"),
      question: qn,
      answer: answerDraft,
      role: jobContext.role,
      company: jobContext.company,
      savedAt: now,
    };
    setSavedAnswers((prev) => {
      const rest = prev.filter((x) => String(x.question || "").trim() !== qn);
      return [entry, ...rest].slice(0, 40);
    });
    persistOrgLocal(q);
    void pushCloudProgress();
  }, [
    answerDraft,
    dumpCards,
    jobContext.company,
    jobContext.role,
    persistOrgLocal,
    pushCloudProgress,
    allQuestions,
    resolvedQuestion,
    selectedQuestion,
    stage,
    starZones,
    usedFallbackSort,
  ]);

  const nextQuestion = useCallback(() => {
    const qs = allQuestions;
    const qFlush = qs.includes(selectedQuestion) ? selectedQuestion : resolvedQuestion;
    const idx = Math.max(0, qs.indexOf(resolvedQuestion));
    const next = qs[(idx + 1) % qs.length] || qs[0];
    if (qFlush) flushBundleForQuestion(qFlush);
    persistOrgLocal(qFlush || null);
    setSelectedQuestion(next);
    const incoming = bundlesRef.current[next] || defaultQuestionBundle();
    const wb = workspaceFromBundle(incoming);
    setDumpCards(wb.dumpCards);
    setStarZones(wb.starZones);
    setAnswerDraft(wb.answerDraft);
    setUsedFallbackSort(wb.usedFallbackSort);
    setReadinessPercent(40);
    setStage(1);
    persistOrgLocal(next);
  }, [allQuestions, resolvedQuestion, selectedQuestion, flushBundleForQuestion, persistOrgLocal]);

  const readinessLabelFn = useCallback((p) => readinessLabelFor(p), []);

  const skillsShow = normalizedSkills(jobContext);
  const hasJobHints = Boolean(jobContext.role || jobContext.company || skillsShow.length);

  const customQuestionKeys = useMemo(
    () => new Set(customQuestions.map((s) => String(s || "").trim()).filter(Boolean)),
    [customQuestions],
  );

  return (
    <div className="ip-page">
      <a className="skip-link" href="#ip-main-content">
        Skip to interview prep
      </a>

      <header className="ip-hero-override">
        <div className="ip-hero-inner">
          <div className="ip-hero-top">
            <div className="ip-hero-copy">
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
            <StageTabs stage={stage} onSelect={setStage} canOrganise={canOrganise} canPractise={canPractise} />
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
              questionsLoading={aiQuestionsLoading}
              removableCustomQuestionKeys={customQuestionKeys}
              onRemoveCustomQuestion={removeCustomQuestion}
              onAddCustomQuestion={addCustomQuestion}
              customQuestionMaxChars={MAX_CUSTOM_QUESTION_CHARS}
              customQuestionsUsed={customQuestions.length}
              customQuestionsMax={MAX_CUSTOM_QUESTIONS}
              dumpCards={dumpCards}
              onDumpChange={setDumpCards}
              onContinue={() => runOrganise()}
              organising={organising}
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
              onContinue={goBuildAnswer}
              onBack={() => setStage(1)}
              needsStarSort={dumpCards.length >= 1 && !zonesHaveCards(starZones)}
              onSortNow={() => runOrganise()}
              organising={organising}
            />
          </section>
        ) : null}

        {stage === 3 ? (
          <section role="tabpanel" id="ip-tab-panel-3" aria-labelledby="ip-tab-3" className="ip-tab-panel">
            <PractiseStage
              selectedQuestion={resolvedQuestion}
              answerDraft={answerDraft}
              onAnswerChange={(t) => {
                setAnswerDraft(t);
                bumpReadiness(3);
              }}
              readinessPercent={readinessPercent}
              readinessLabel={readinessLabelFn}
              onBumpReadiness={bumpReadiness}
              onSave={saveAnswer}
              onNextQuestion={nextQuestion}
              onBack={() => setStage(2)}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default function InterviewPrepPage() {
  const initial = useMemo(() => loadInterviewPrepBootstrap(), []);
  if (!jobContextHasInterviewSource(initial.jobContext)) {
    return (
      <div className="ip-page">
        <JobExperienceHub mode="interview" />
      </div>
    );
  }
  return <InterviewPrepContent initial={initial} />;
}

/* Stage 1 → Brain Dump (type your thoughts)
Stage 2 → Organise (sort thoughts into STAR)
Stage 3 → Practise (refine and speak your answer) */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StageTabs from "../components/interview-prep/StageTabs.jsx";
import BrainDumpStage from "../components/interview-prep/BrainDumpStage.jsx";
import OrganiseStage from "../components/interview-prep/OrganiseStage.jsx";
import PractiseStage from "../components/interview-prep/PractiseStage.jsx";
import { liveSimplifyEnabled, starSortInterview } from "../services/interviewPrepApi.js";
import {
  buildAnswerDraftFromStar,
  heuristicStarSort,
  loadJobContextFromSimplifyHistory,
  readProfileSkillSet,
  skillMatchesProfile,
  uid,
} from "../utils/interviewPrepHelpers.js";

const JOB_CTX_KEY = "neuroguide.interviewPrep.jobContext.v1";
const ORG_KEY = "neuroguide.interviewPrep.organised.v1";
const SAVED_KEY = "neuroguide.interviewPrep.savedAnswers.v3";
const PROFILE_KEY = "neuroguide.careerProfile.react.v2";

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
  };
}

/** Old 4-step flow → 3 tabs (job context step removed). */
function migrateLegacyStage(stored) {
  if (typeof stored !== "number" || Number.isNaN(stored)) return 1;
  if (stored <= 2) return 1;
  return Math.min(3, stored - 1);
}

function zonesHaveCards(z) {
  return Object.values(z || {}).some((arr) => Array.isArray(arr) && arr.length > 0);
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
  return base;
}

// Loads your interview prep data from local storage
function loadInterviewPrepBootstrap() {
  if (typeof window === "undefined") {
    return {
      stage: 1,
      jobContext: defaultJobContext(),
      selectedQuestion: null,
      dumpCards: [],
      starZones: emptyZones(),
      answerDraft: "",
      savedAnswers: [],
      usedFallbackSort: false,
      questionHistory: {},
    };
  }
  //Your role, company, and skills from the job posting
  const jc = safeParse(window.localStorage.getItem(JOB_CTX_KEY));
  //Your organised thoughts into STAR format
  const org = safeParse(window.localStorage.getItem(ORG_KEY));
  //Your saved answers
  const saved = loadSavedAnswers();
  //Your job context from the job posting and the job posting itself
  const fromSimplify = loadJobContextFromSimplifyHistory(); 
  const mergedJob = mergeJobContextFromSources(jc, fromSimplify);

  return {
    stage: migrateLegacyStage(org?.stage),
    jobContext: mergedJob,
    selectedQuestion: org?.selectedQuestion ?? null,
    dumpCards: Array.isArray(org?.dumpCards) ? org.dumpCards : [],
    starZones: org?.starZones && typeof org.starZones === "object" ? org.starZones : emptyZones(),
    answerDraft: typeof org?.answerDraft === "string" ? org.answerDraft : "",
    savedAnswers: Array.isArray(saved) ? saved : [],
    //Whether AI sorting failed and the basic sort was used instead
    usedFallbackSort: Boolean(org?.usedFallbackSort),
    // Per-question history: { [questionText]: { dumpCards, starZones, answerDraft, stage } }
    questionHistory: org?.questionHistory && typeof org.questionHistory === "object" ? org.questionHistory : {},
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

  // Split into skills the candidate already has vs skills they're missing
  const knownSkills = skills.filter((s) => skillMatchesProfile(s, profileSkillSet));
  const missingSkills = skills.filter((s) => !skillMatchesProfile(s, profileSkillSet));

  const tailored = [];

  // Known skills → experience-based questions
  const knownTemplates = [
    (s) => `Tell me about a time you used ${s} to solve a real problem.`,
    (s) => `Describe a project where ${s} was central to what you contributed.`,
    (s) => `How has working with ${s} shaped the way you approach this kind of work?`,
  ];
  knownSkills.slice(0, 3).forEach((s, i) => {
    tailored.push(knownTemplates[i % knownTemplates.length](s));
  });

  // Missing skills → learning/growth questions
  const missingTemplates = [
    (s) => `This role involves ${s}. How would you go about getting up to speed with it?`,
    (s) => `You'll be working with ${s} here. What's your strategy for picking up a new tool quickly?`,
    (s) => `What do you already know about ${s}, and what steps would you take to close any gaps?`,
  ];
  missingSkills.slice(0, 3).forEach((s, i) => {
    tailored.push(missingTemplates[i % missingTemplates.length](s));
  });

  const universal = [
    "Tell me about a challenge you overcame.",
    "What are you most proud of professionally?",
    "Tell me about a time you worked with others.",
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

// Main Interview Prep Page component
export default function InterviewPrepPage() {
  // Loads your interview prep data from local storage
  const initial = useMemo(() => loadInterviewPrepBootstrap(), []);

  //Your current stage of the interview prep process
  const [stage, setStage] = useState(() => initial.stage);
  //Your job context from the job posting and the job posting itself
  const [jobContext] = useState(() => initial.jobContext);
  const [selectedQuestion, setSelectedQuestion] = useState(() => initial.selectedQuestion);
  const [dumpCards, setDumpCards] = useState(() => initial.dumpCards);
  const [starZones, setStarZones] = useState(() => initial.starZones);
  const [answerDraft, setAnswerDraft] = useState(() => initial.answerDraft);
  const [savedAnswers, setSavedAnswers] = useState(() => initial.savedAnswers);
  const [usedFallbackSort, setUsedFallbackSort] = useState(() => initial.usedFallbackSort);
  const [readinessPercent, setReadinessPercent] = useState(40);
  const [organising, setOrganising] = useState(false);
  // Stores full state per question so switching back restores cards, zones, and answer
  const [questionHistory, setQuestionHistory] = useState(() => initial.questionHistory);

  //Your profile skill set from the profile page
  const profileSkillSet = useMemo(() => {
    if (typeof window === "undefined") return new Set();
    return readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
  }, []);

  const questions = useMemo(() => buildQuestionList(jobContext, profileSkillSet), [jobContext, profileSkillSet]);

  const resolvedQuestion = useMemo(() => {
    if (!questions.length) return null;
    if (selectedQuestion && questions.includes(selectedQuestion)) return selectedQuestion;
    return questions[0];
  }, [questions, selectedQuestion]);

  const canOrganise = dumpCards.length >= 1 || zonesHaveCards(starZones);
  const canPractise = Boolean(answerDraft?.trim()) || stage === 3;

  useEffect(() => {
    window.localStorage.setItem(JOB_CTX_KEY, JSON.stringify(jobContext));
  }, [jobContext]);

  useEffect(() => {
    window.localStorage.setItem(
      ORG_KEY,
      JSON.stringify({
        starZones,
        dumpCards,
        selectedQuestion,
        stage,
        usedFallbackSort,
        answerDraft,
        questionHistory,
      }),
    );
  }, [starZones, dumpCards, selectedQuestion, stage, usedFallbackSort, answerDraft, questionHistory]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(savedAnswers));
  }, [savedAnswers]);

  useEffect(() => {
    if (stage !== 3) return;
    const id = setInterval(() => {
      setReadinessPercent((p) => Math.min(94, p + 1));
    }, 9000);
    return () => clearInterval(id);
  }, [stage]);

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
    const entry = {
      id: uid("save"),
      question: resolvedQuestion,
      answer: answerDraft,
      role: jobContext.role,
      company: jobContext.company,
      savedAt: Date.now(),
    };
    setSavedAnswers((prev) => [entry, ...prev].slice(0, 40));
  }, [answerDraft, jobContext.company, jobContext.role, resolvedQuestion]);

  /** Saves the current question's full state into questionHistory. */
  const saveCurrentToHistory = useCallback(() => {
    if (!resolvedQuestion) return;
    if (!dumpCards.length && !answerDraft) return; // nothing worth saving
    setQuestionHistory((prev) => ({
      ...prev,
      [resolvedQuestion]: { dumpCards, starZones, answerDraft, stage },
    }));
  }, [resolvedQuestion, dumpCards, starZones, answerDraft, stage]);

  /**
   * handleSelectQuestion — called when the user clicks a question in the list.
   * Saves the current question's state, then either restores the selected
   * question's previous state (if it exists) or starts fresh.
   */
  const handleSelectQuestion = useCallback((q) => {
    if (q === resolvedQuestion) return;
    saveCurrentToHistory();
    const hist = questionHistory[q];
    if (hist) {
      setDumpCards(hist.dumpCards || []);
      setStarZones(hist.starZones || emptyZones());
      setAnswerDraft(hist.answerDraft || "");
      setUsedFallbackSort(false);
      setReadinessPercent(hist.stage === 3 ? 60 : 40);
      setStage(hist.stage || 1);
    } else {
      setDumpCards([]);
      setStarZones(emptyZones());
      setAnswerDraft("");
      setUsedFallbackSort(false);
      setReadinessPercent(40);
      setStage(1);
    }
    setSelectedQuestion(q);
  }, [resolvedQuestion, questionHistory, saveCurrentToHistory]);

  const nextQuestion = useCallback(() => {
    saveCurrentToHistory();
    const qs = questions;
    const idx = Math.max(0, qs.indexOf(resolvedQuestion));
    const next = qs[(idx + 1) % qs.length] || qs[0];
    const hist = questionHistory[next];
    if (hist) {
      setDumpCards(hist.dumpCards || []);
      setStarZones(hist.starZones || emptyZones());
      setAnswerDraft(hist.answerDraft || "");
      setUsedFallbackSort(false);
      setReadinessPercent(hist.stage === 3 ? 60 : 40);
      setStage(hist.stage || 1);
    } else {
      setDumpCards([]);
      setStarZones(emptyZones());
      setAnswerDraft("");
      setUsedFallbackSort(false);
      setReadinessPercent(40);
      setStage(1);
    }
    setSelectedQuestion(next);
  }, [questions, resolvedQuestion, questionHistory, saveCurrentToHistory]);

  const readinessLabelFn = useCallback((p) => readinessLabelFor(p), []);

  const skillsShow = normalizedSkills(jobContext);
  const hasJobHints = Boolean(jobContext.role || jobContext.company || skillsShow.length);

  return (
    <div className="ip-page">
      <a className="skip-link" href="#ip-main-content">
        Skip to interview prep
      </a>

      {/* ── Hero header ── */}
      <header className="ip-hero-override">
        <div className="ip-hero-inner">

          {/* Top row: copy + job context pill */}
          <div className="ip-hero-top">
            <div className="ip-hero-copy">
              <p className="simplify-hero-eyebrow">Step by step · STAR method</p>
              <h1 className="ip-hero-title">Interview Prep</h1>
              <p className="ip-hero-lead">
                Build confident, structured answers using the STAR method, tailored to your job and ADHD profile.
              </p>
            </div>

            {/* Role pill — top-right on desktop */}
            {hasJobHints ? (
              <div className="ip-role-pill" aria-label="Role from your simplified posting">
                <span className="ip-role-pill__label">Preparing for</span>
                <strong className="ip-role-pill__role">{jobContext.role || "Role"}</strong>
                {jobContext.company ? (
                  <span className="ip-role-pill__company">at {jobContext.company}</span>
                ) : null}
              </div>
            ) : (
              <p className="ip-role-pill ip-role-pill--hint">
                <Link to="/simplify-job-description">Simplify a job posting</Link> for tailored questions.
              </p>
            )}
          </div>

          {/* Tags that match your profile get a green/highlighted style. Tags you don't have stay grey. */}
          {skillsShow.length > 0 && (
            <div className="ip-skill-row">
              {skillsShow.slice(0, 10).map((tag) => (
                <span key={tag} className={`ip-tag ${skillMatchesProfile(tag, profileSkillSet) ? "ip-tag--match" : ""}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Stage tabs — full-width strip at bottom of hero */}
          <div className="ip-hero-tabs">
            <StageTabs stage={stage} onSelect={setStage} canOrganise={canOrganise} canPractise={canPractise} />
          </div>

        </div>
      </header>

      {/* ── Main content ── */}
      <main id="ip-main-content" className="ip-page-main">
        {stage === 1 ? (
          <section role="tabpanel" id="ip-tab-panel-1" aria-labelledby="ip-tab-1" className="ip-tab-panel">
            <BrainDumpStage
              questions={questions}
              selectedQuestion={resolvedQuestion}
              onSelectQuestion={handleSelectQuestion}
              answeredQuestions={questionHistory}
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

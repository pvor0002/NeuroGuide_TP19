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
    };
  }
  const jc = safeParse(window.localStorage.getItem(JOB_CTX_KEY));
  const org = safeParse(window.localStorage.getItem(ORG_KEY));
  const saved = loadSavedAnswers();
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
    usedFallbackSort: Boolean(org?.usedFallbackSort),
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

function buildQuestionList(jobContext) {
  const skills = normalizedSkills(jobContext);
  const tailored = [];
  if (skills[0]) tailored.push(`How does your experience with ${skills[0]} apply in this role?`);
  if (skills[1]) tailored.push(`Tell me about a time you used ${skills[1]} when things were messy or unclear.`);
  const universal = [
    "Tell me about a challenge you overcame.",
    "What are you most proud of professionally?",
    "Tell me about a time you worked with others.",
    "Why do you want this role?",
    "Tell me about yourself.",
  ];
  const out = [...tailored.slice(0, 2)];
  for (const u of universal) {
    if (out.length >= 5) break;
    if (!out.includes(u)) out.push(u);
  }
  return out.slice(0, 5);
}

function readinessLabelFor(p) {
  if (p < 55) return "Getting there";
  if (p < 82) return "Almost ready";
  return "Ready to go";
}

export default function InterviewPrepPage() {
  const initial = useMemo(() => loadInterviewPrepBootstrap(), []);

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

  const profileSkillSet = useMemo(() => {
    if (typeof window === "undefined") return new Set();
    return readProfileSkillSet(window.localStorage.getItem(PROFILE_KEY));
  }, []);

  const questions = useMemo(() => buildQuestionList(jobContext), [jobContext]);

  const resolvedQuestion = useMemo(() => {
    if (!questions.length) return null;
    if (selectedQuestion && questions.includes(selectedQuestion)) return selectedQuestion;
    return questions[0];
  }, [questions, selectedQuestion]);

  const canOrganise = dumpCards.length >= 2 || zonesHaveCards(starZones);
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
      }),
    );
  }, [starZones, dumpCards, selectedQuestion, stage, usedFallbackSort, answerDraft]);

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

  const nextQuestion = useCallback(() => {
    const qs = questions;
    const idx = Math.max(0, qs.indexOf(resolvedQuestion));
    const next = qs[(idx + 1) % qs.length] || qs[0];
    setSelectedQuestion(next);
    setDumpCards([]);
    setStarZones(emptyZones());
    setAnswerDraft("");
    setUsedFallbackSort(false);
    setReadinessPercent(40);
    setStage(1);
  }, [questions, resolvedQuestion]);

  const readinessLabelFn = useCallback((p) => readinessLabelFor(p), []);

  const skillsShow = normalizedSkills(jobContext);
  const hasJobHints = Boolean(jobContext.role || jobContext.company || skillsShow.length);

  return (
    <div className="ip-builder ip-builder--flow ip-builder--site">
      <a className="skip-link" href="#ip-main-content">
        Skip to interview prep
      </a>
      <div className="ip-builder-inner">
        <header className="ip-builder-header ip-builder-header--compact">
          <div className="ip-builder-header__row">
            <div>
              <p className="ip-builder-eyebrow">Interview prep</p>
              <h1 className="ip-builder-title">Answer builder</h1>
            </div>
          </div>

          {hasJobHints ? (
            <div className="ip-job-strip" aria-label="Role from your simplified posting">
              <span className="ip-job-strip__main">
                <strong>{jobContext.role || "Role"}</strong>
                {jobContext.company ? (
                  <>
                    {" "}
                    <span className="ip-job-strip__at">at</span> {jobContext.company}
                  </>
                ) : null}
              </span>
              {skillsShow.length ? (
                <span className="ip-job-strip__tags">
                  {skillsShow.slice(0, 10).map((tag) => (
                    <span key={tag} className={`ip-tag ${skillMatchesProfile(tag, profileSkillSet) ? "ip-tag--match" : ""}`}>
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="ip-job-strip ip-job-strip--hint">
              <Link to="/simplify-job-description">Simplify a job posting</Link> first for tailored questions and skill tags.
            </p>
          )}

          <StageTabs stage={stage} onSelect={setStage} canOrganise={canOrganise} canPractise={canPractise} />
        </header>

        <main id="ip-main-content" className="ip-flow-main">
          {stage === 1 ? (
            <section role="tabpanel" id="ip-tab-panel-1" aria-labelledby="ip-tab-1" className="ip-tab-panel">
              <BrainDumpStage
                questions={questions}
                selectedQuestion={resolvedQuestion}
                onSelectQuestion={setSelectedQuestion}
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
                needsStarSort={dumpCards.length >= 2 && !zonesHaveCards(starZones)}
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
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DataConsentModal from "../components/DataConsentModal.jsx";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";
import UserIdEntryModal from "../components/UserIdEntryModal.jsx";
import {
  createProfile,
  fetchProfile,
  normalizeProfileId,
  updateProfile,
} from "../services/profileApi.js";

const USER_ID_PROMPT_DISMISSED_KEY = "neuroguide.userIdPrompt.careerProfile.dismissed";

const STORAGE_KEY = "neuroguide.careerProfile.react.v2";
const MAX_VISIBLE_SKILL_RESULTS = 20;
const MAX_VISIBLE_ROLE_RESULTS = 18;
const MAX_SELECTED_ROLES = 3;
const MAX_ENERGY_PATTERNS = 2;
const TRANSITION_MS = 260;

// Top-level "blocks" of the wizard. Replaces the old "Question X of N" counter
// with a segmented progress bar so the quiz feels broken into digestible
// chunks. Keep this list short — ADHD visitors should be able to see the
// whole shape of the flow at a glance.
const BLOCKS = [
  { id: "type",    label: "Type Classification" },
  { id: "work",    label: "Work Style" },
  { id: "support", label: "Support Setup" }, // includes Time and Energy
  { id: "jobs",    label: "Jobs & Skills" },
  { id: "profile", label: "User Profile" },  // the final overview screen
];
const BLOCK_IDS = BLOCKS.map((b) => b.id);
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const DURATION_OPTIONS = ["< 6 months", "6-12 months", "1-2 years", "2-5 years", "5+ years"];
const EXPERIENCE_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced"];
const ENERGY_PATTERN_OPTIONS = [
  "Best with routine",
  "Best with variety",
  "Best with clear deadlines",
  "Best with flexible pace",
  "Best with short focus sprints",
  "Best with frequent breaks",
  "Best with visual task boards",
  "Best with one task at a time",
  "Best in quieter settings",
  "Best with body-doubling/accountability",
  "Best with morning deep work",
  "Best with afternoon deep work",
];
const WORK_STYLE_OPTIONS = [
  "Clear priorities",
  "Short tasks",
  "Visual workflow",
  "Low interruptions",
  "Collaborative team",
  "Quiet work blocks",
];
const SUPPORT_NEED_OPTIONS = [
  "Written instructions",
  "Calendar reminders",
  "Checklists",
  "Regular check-ins",
  "Flexible start time",
  "Noise-reduced space",
  "Task batching",
  "Break prompts",
];

// Short self-report prompts, kept simple and concrete on purpose. Internal
// cluster tags drive the scoring; the user never sees them.
const ADHD_QUIZ_QUESTIONS = [
  { id: "q1", cluster: "inattentive", text: "How often do you have trouble staying focused on a task?" },
  { id: "q2", cluster: "inattentive", text: "How often do you forget deadlines or where you put things?" },
  { id: "q3", cluster: "inattentive", text: "How often do activity or noise around you pull your attention?" },
  { id: "q4", cluster: "inattentive", text: "How often do you struggle to finish tasks after the initial excitement?" },
  { id: "q5", cluster: "hyperactive", text: "How often do you feel restless or need to move?" },
  { id: "q6", cluster: "hyperactive", text: "How often do you interrupt others or finish their sentences?" },
  { id: "q7", cluster: "hyperactive", text: "How often do you act or speak before thinking it through?" },
  { id: "q8", cluster: "hyperactive", text: "How often do you feel 'on the go', as if driven by a motor?" },
];
const QUIZ_SCALE = [
  { value: 0, label: "Never" },
  { value: 1, label: "Sometimes" },
  { value: 2, label: "Often" },
  { value: 3, label: "Very often" },
];
const QUIZ_CLUSTER_THRESHOLD = 6; // sum >= 6 of 12 flags the cluster

// User-facing labels are intentionally soft — we never call these "ADHD
// types" in the UI. The internal keys keep the same names so backend
// storage / analytics stay consistent.
const ADHD_TYPE_LABELS = {
  inattentive: "Inattentive",
  "hyperactive-impulsive": "Hyperactive-Impulsive",
  combined: "Combined",
};
const ADHD_TYPE_DESCRIPTIONS = {
  inattentive: "Focus drifts and details slip — finishing is harder than starting.",
  "hyperactive-impulsive": "High energy — restlessness, quick talk, jumping in early.",
  combined: "A mix of both — attention wanders and there's restlessness driving you.",
};

const ROLE_KEYWORDS_FOR_BLUE_COLLAR = [
  "waiter", "barista", "cafe", "hospitality", "kitchen", "cleaner", "cleaning",
  "labour", "driver", "warehouse", "carpenter", "plumber", "mechanic", "retail",
];

const ROLE_SKILL_RULES = [
  {
    roleKeywords: ["farmer", "farming", "agriculture", "agricultural"],
    skillKeywords: ["crop", "harvest", "soil", "irrig", "livestock", "farm", "tractor", "pesticide"],
    presetSkills: ["Crop planning", "Irrigation management", "Soil preparation", "Harvest coordination", "Livestock care", "Farm equipment operation"],
  },
  {
    roleKeywords: ["barista", "cafe", "coffee", "waiter", "hospitality", "restaurant", "kitchen"],
    skillKeywords: ["customer service", "food", "beverage", "cash", "point of sale", "pos", "clean", "teamwork"],
    presetSkills: ["Customer service", "Food safety", "POS handling", "Order accuracy", "Team collaboration"],
  },
  {
    roleKeywords: ["retail", "sales assistant", "store", "cashier"],
    skillKeywords: ["customer service", "sales", "merchandising", "cash handling", "point of sale", "stock", "inventory"],
    presetSkills: ["Customer engagement", "Cash handling", "Stock replenishment", "Merchandising basics"],
  },
  {
    roleKeywords: ["cleaner", "cleaning", "housekeeper"],
    skillKeywords: ["clean", "sanit", "hygiene", "safety", "time management", "attention to detail"],
    presetSkills: ["Sanitisation routines", "Attention to detail", "Time management", "Workplace safety"],
  },
  {
    roleKeywords: ["warehouse", "logistics", "driver", "delivery", "forklift"],
    skillKeywords: ["warehouse", "inventory", "forklift", "dispatch", "loading", "route", "safety", "logistics"],
    presetSkills: ["Inventory handling", "Safe loading", "Route planning", "Warehouse safety"],
  },
  {
    roleKeywords: ["developer", "software", "it support", "programmer", "engineer"],
    skillKeywords: ["javascript", "python", "debug", "git", "api", "troubleshoot", "sql", "testing"],
    presetSkills: ["Debugging", "Version control (Git)", "API integration", "Testing and QA"],
  },
  {
    roleKeywords: ["admin", "administration", "reception", "office"],
    skillKeywords: ["scheduling", "calendar", "document", "data entry", "communication", "organis", "microsoft", "excel"],
    presetSkills: ["Calendar coordination", "Document management", "Data entry", "Professional communication"],
  },
];

const TRANSFERABLE_SKILL_KEYWORDS = [
  "communication", "team", "organis", "organization", "time management",
  "problem", "customer", "attention to detail", "planning", "safety",
];

function getRoleBasedSkillSuggestions(selectedRoles, skillTags) {
  if (!selectedRoles.length || !skillTags.length) return [];
  const roleText = selectedRoles.join(" ").toLowerCase();
  const matchedRules = ROLE_SKILL_RULES.filter((rule) =>
    rule.roleKeywords.some((keyword) => roleText.includes(keyword))
  );
  const presetPool = [...new Set(matchedRules.flatMap((rule) => rule.presetSkills || []))];
  const keywordPool = [...new Set(matchedRules.flatMap((rule) => rule.skillKeywords))];
  if (keywordPool.length > 0 || presetPool.length > 0) {
    const matchedFromTaxonomy = skillTags.filter((skill) => {
      const lower = skill.toLowerCase();
      return keywordPool.some((kw) => lower.includes(kw));
    });
    const combined = [...new Set([...matchedFromTaxonomy, ...presetPool])];
    if (combined.length > 0) return combined.slice(0, 12);
  }
  const roleWords = roleText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const overlap = skillTags.filter((skill) => {
    const lower = skill.toLowerCase();
    return roleWords.some((word) => lower.includes(word));
  });
  if (overlap.length > 0) return [...new Set(overlap)].slice(0, 12);
  const transferable = skillTags.filter((skill) => {
    const lower = skill.toLowerCase();
    return TRANSFERABLE_SKILL_KEYWORDS.some((kw) => lower.includes(kw));
  });
  if (transferable.length > 0) return [...new Set(transferable)].slice(0, 8);
  return skillTags.slice(0, 8);
}

function scoreAdhdQuiz(quizAnswers) {
  let inattentive = 0;
  let hyperactive = 0;
  ADHD_QUIZ_QUESTIONS.forEach((q) => {
    const v = Number(quizAnswers?.[q.id] ?? 0);
    if (q.cluster === "inattentive") inattentive += v;
    else hyperactive += v;
  });
  const inFlag = inattentive >= QUIZ_CLUSTER_THRESHOLD;
  const hyFlag = hyperactive >= QUIZ_CLUSTER_THRESHOLD;
  let type;
  if (inFlag && hyFlag) type = "combined";
  else if (inFlag) type = "inattentive";
  else if (hyFlag) type = "hyperactive-impulsive";
  else type = inattentive >= hyperactive ? "inattentive" : "hyperactive-impulsive";
  return { inattentive, hyperactive, type, bothBelowThreshold: !inFlag && !hyFlag };
}

function HeroPaperShapes() {
  return (
    <div className="simplify-hero-shapes" aria-hidden="true">
      <svg className="simplify-shape-svg" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
        <path fill="#c4e0c8" opacity="0.95" d="M40 120c20-50 80-90 140-70s80 70 50 120-90 50-140 20-70-60-50-70z" />
        <path fill="#e8b4a0" opacity="0.88" d="M120 40c45 8 85 50 75 100s-55 70-100 55-65-45-55-90 25-70 80-65z" />
        <circle cx="175" cy="55" r="18" fill="#d4a574" opacity="0.75" />
      </svg>
    </div>
  );
}

function getDefaultState() {
  return {
    view: "wizard",
    stepIndex: 0,
    completed: false,
    profileId: "",
    syncedAt: "",
    answers: {
      adhdAwareness: "",
      adhdProfileType: "",
      quizAnswers: {},
      quizInferredType: "",
      workStyles: [],
      supportNeeds: [],
      selectedRoles: [],
      roleSearchQuery: "",
      roleDuration: {},
      roleExperience: {},
      selectedSkills: [],
      autoSelectedSkills: [],
      removedAutoSkills: [],
      skillSearchQuery: "",
      energyPatterns: [],
    },
  };
}

/**
 * Fields from the answers object that we never want to sync to the server —
 * ephemeral UI-only values like search boxes.
 */
const EPHEMERAL_ANSWER_FIELDS = ["roleSearchQuery", "skillSearchQuery"];

function buildPayloadForSync(answers) {
  const payload = { ...answers };
  EPHEMERAL_ANSWER_FIELDS.forEach((field) => delete payload[field]);
  return payload;
}

function mergeLoadedAnswers(base, incoming) {
  const safeArray = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : []);
  const safeRecord = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const safeString = (value) => (typeof value === "string" ? value : "");
  return {
    ...base,
    ...incoming,
    adhdAwareness: safeString(incoming.adhdAwareness),
    adhdProfileType: safeString(incoming.adhdProfileType),
    quizAnswers: safeRecord(incoming.quizAnswers),
    quizInferredType: safeString(incoming.quizInferredType),
    workStyles: safeArray(incoming.workStyles),
    supportNeeds: safeArray(incoming.supportNeeds),
    selectedRoles: safeArray(incoming.selectedRoles),
    roleSearchQuery: "",
    roleDuration: safeRecord(incoming.roleDuration),
    roleExperience: safeRecord(incoming.roleExperience),
    selectedSkills: safeArray(incoming.selectedSkills),
    autoSelectedSkills: safeArray(incoming.autoSelectedSkills),
    removedAutoSkills: safeArray(incoming.removedAutoSkills),
    skillSearchQuery: "",
    energyPatterns: safeArray(incoming.energyPatterns).slice(0, MAX_ENERGY_PATTERNS),
  };
}

function loadPersistedState() {
  const fallback = getDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.answers !== "object") return fallback;
    const a = parsed.answers || {};
    const toArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);
    const toRec = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const toStr = (v) => (typeof v === "string" ? v : "");
    return {
      view: parsed.view === "overview" ? "overview" : "wizard",
      stepIndex: Number.isInteger(parsed.stepIndex) && parsed.stepIndex >= 0 ? parsed.stepIndex : 0,
      completed: Boolean(parsed.completed),
      profileId: typeof parsed.profileId === "string" ? parsed.profileId : "",
      syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : "",
      answers: {
        ...fallback.answers,
        ...a,
        adhdAwareness: toStr(a.adhdAwareness),
        adhdProfileType: toStr(a.adhdProfileType),
        quizAnswers: toRec(a.quizAnswers),
        quizInferredType: toStr(a.quizInferredType),
        workStyles: toArr(a.workStyles),
        supportNeeds: toArr(a.supportNeeds),
        selectedRoles: toArr(a.selectedRoles),
        roleSearchQuery: toStr(a.roleSearchQuery),
        roleDuration: toRec(a.roleDuration),
        roleExperience: toRec(a.roleExperience),
        selectedSkills: toArr(a.selectedSkills),
        autoSelectedSkills: toArr(a.autoSelectedSkills),
        removedAutoSkills: toArr(a.removedAutoSkills),
        skillSearchQuery: toStr(a.skillSearchQuery),
        energyPatterns: toArr(a.energyPatterns).slice(0, MAX_ENERGY_PATTERNS),
      },
    };
  } catch {
    return fallback;
  }
}

/**
 * Builds the dynamic, one-question-per-screen step list based on current answers.
 * Each step carries its ``block`` id so the top stepper and the right-hand
 * question panel can group them. "Time and Energy" is folded into the
 * Support Setup block.
 */
function buildSteps(answers) {
  const steps = [];

  // 1. Type Classification
  steps.push({ id: "adhd-awareness", block: "type", kind: "adhd-awareness" });
  if (answers.adhdAwareness === "yes") {
    steps.push({ id: "adhd-type-known", block: "type", kind: "adhd-type-known" });
  } else if (answers.adhdAwareness === "no") {
    ADHD_QUIZ_QUESTIONS.forEach((q, idx) => {
      steps.push({ id: `adhd-quiz-${q.id}`, block: "type", kind: "adhd-quiz", question: q, quizIndex: idx });
    });
    steps.push({ id: "adhd-quiz-result", block: "type", kind: "adhd-quiz-result" });
  }

  // 2. Work Style
  steps.push({ id: "work-style", block: "work", kind: "work-style" });

  // 3. Support Setup (supports + rhythm / time-and-energy)
  steps.push({ id: "support-needs", block: "support", kind: "support-needs" });
  steps.push({ id: "energy", block: "support", kind: "energy" });

  // 4. Jobs & Skills
  steps.push({ id: "roles-pick", block: "jobs", kind: "roles-pick" });
  answers.selectedRoles.forEach((role) => {
    steps.push({ id: `role-duration--${role}`, block: "jobs", kind: "role-duration", role });
    steps.push({ id: `role-experience--${role}`, block: "jobs", kind: "role-experience", role });
  });
  steps.push({ id: "skills", block: "jobs", kind: "skills" });

  // 5. User Profile is the overview destination — not a wizard step. It
  //    appears as the final segment in the top stepper so visitors see it
  //    lights up when they finish.

  return steps;
}

/** Short label for a step, shown in the right-hand "Questions in this block" panel. */
function shortLabelForStep(step) {
  if (!step) return "Question";
  switch (step.kind) {
    case "adhd-awareness":    return "Starting point";
    case "adhd-type-known":   return "Your profile";
    case "adhd-quiz":         return `Question ${step.quizIndex + 1}`;
    case "adhd-quiz-result":  return "Your result";
    case "work-style":        return "Ways of working";
    case "support-needs":     return "Supports that help";
    case "energy":            return "Rhythm";
    case "roles-pick":        return "Past roles";
    case "role-duration":     return `${step.role} · how long`;
    case "role-experience":   return `${step.role} · level`;
    case "skills":            return "Skills";
    default:                  return "Question";
  }
}

/** True once the answer for a given step is considered complete. */
function isStepAnswered(step, answers) {
  return validateStep(step, answers) === null;
}

function validateStep(step, answers) {
  if (!step) return null;
  switch (step.kind) {
    case "adhd-awareness":
      if (!answers.adhdAwareness) return "Pick Yes or No to continue.";
      return null;
    case "adhd-type-known":
      if (!answers.adhdProfileType) return "Choose your ADHD type.";
      return null;
    case "adhd-quiz":
      if (answers.quizAnswers?.[step.question.id] === undefined) return "Pick one of the four options.";
      return null;
    case "adhd-quiz-result":
      if (!answers.adhdProfileType) return "Accept the suggested type, or pick one that fits better.";
      return null;
    case "work-style":
      if (answers.workStyles.length === 0) return "Pick at least one work style.";
      return null;
    case "support-needs":
      if (answers.supportNeeds.length === 0) return "Pick at least one support that helps.";
      return null;
    case "roles-pick":
      if (answers.selectedRoles.length === 0) return "Add at least one role.";
      if (answers.selectedRoles.length > MAX_SELECTED_ROLES) return `Keep it to ${MAX_SELECTED_ROLES} roles.`;
      return null;
    case "role-duration":
      if (!answers.roleDuration?.[step.role]) return "Pick how long you've done this role.";
      return null;
    case "role-experience":
      if (!answers.roleExperience?.[step.role]) return "Pick your experience level for this role.";
      return null;
    case "skills":
      if (answers.selectedSkills.length === 0) return "Keep or add at least one skill.";
      return null;
    case "energy":
      if (!answers.energyPatterns || answers.energyPatterns.length === 0) return "Pick at least one rhythm.";
      if (answers.energyPatterns.length > MAX_ENERGY_PATTERNS) return `Pick up to ${MAX_ENERGY_PATTERNS} rhythms.`;
      return null;
    default:
      return null;
  }
}

export default function ProfileWizardPage() {
  const location = useLocation();
  const [roleTags, setRoleTags] = useState([]);
  const [skillTags, setSkillTags] = useState([]);
  const [state, setState] = useState(loadPersistedState);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("error");
  const [showSuitabilityPlaceholder, setShowSuitabilityPlaceholder] = useState(false);
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);
  const [phase, setPhase] = useState("in"); // "in" | "out-forward" | "out-back"
  const [progressBump, setProgressBump] = useState(false);
  const transitionTimerRef = useRef(null);

  // UI state for the "load from existing Profile ID" panel on step 1.
  const [loadIdOpen, setLoadIdOpen] = useState(false);
  const [loadIdInput, setLoadIdInput] = useState("");
  const [loadIdBusy, setLoadIdBusy] = useState(false);
  const [loadIdError, setLoadIdError] = useState("");

  // Sync (POST/PUT) status for the "save to cloud" affordance.
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [syncMessage, setSyncMessage] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  // Welcome modal that asks first-time visitors whether they already have a
  // saved User ID. It only opens once per tab-session and is skipped entirely
  // when we already have a profile id stored locally.
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);

  useEffect(() => {
    let innerId;
    const outerId = requestAnimationFrame(() => {
      setBrandFlowerActive(false);
      innerId = requestAnimationFrame(() => setBrandFlowerActive(true));
    });
    return () => {
      cancelAnimationFrame(outerId);
      if (innerId !== undefined) cancelAnimationFrame(innerId);
    };
  }, []);

  useEffect(() => {
    async function loadTaxonomy() {
      try {
        const [rolesRes, skillsRes] = await Promise.all([
          fetch("/au-role-taxonomy.json"),
          fetch("/au-skills-taxonomy.json"),
        ]);
        const roles = rolesRes.ok ? await rolesRes.json() : [];
        const skills = skillsRes.ok ? await skillsRes.json() : [];
        setRoleTags(Array.isArray(roles) ? roles : []);
        setSkillTags(Array.isArray(skills) ? skills : []);
      } catch {
        setRoleTags([]);
        setSkillTags([]);
      }
    }
    loadTaxonomy();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  // Show the "Do you already have a User ID?" greeting exactly once per tab
  // session, and only when the visitor doesn't already have a profile id
  // stored from a previous session in this browser.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(USER_ID_PROMPT_DISMISSED_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (!dismissed && !state.profileId) {
      setWelcomeModalOpen(true);
    }
    // Intentionally only runs on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markWelcomeDismissed = () => {
    try {
      window.sessionStorage.setItem(USER_ID_PROMPT_DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable — ignore */
    }
  };

  const handleWelcomeDismiss = () => {
    markWelcomeDismissed();
    setWelcomeModalOpen(false);
  };

  const handleWelcomeSubmit = async (idFromModal) => {
    // Throws back up to the modal on failure so it can show the error inline.
    await loadProfileById(idFromModal);
    markWelcomeDismissed();
    setWelcomeModalOpen(false);
  };

  const steps = useMemo(() => buildSteps(state.answers), [state.answers]);
  const safeStepIndex = Math.min(state.stepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[safeStepIndex];
  const totalSteps = steps.length;

  const featuredRoles = useMemo(() => {
    const top = roleTags.slice(0, 10);
    const blueCollar = roleTags.filter((role) =>
      ROLE_KEYWORDS_FOR_BLUE_COLLAR.some((keyword) => role.toLowerCase().includes(keyword))
    );
    return [...new Set([...top, ...blueCollar])].slice(0, MAX_VISIBLE_ROLE_RESULTS);
  }, [roleTags]);

  const roleOptions = useMemo(() => {
    const q = state.answers.roleSearchQuery.trim().toLowerCase();
    if (!q) return featuredRoles;
    return roleTags.filter((role) => role.toLowerCase().includes(q)).slice(0, MAX_VISIBLE_ROLE_RESULTS);
  }, [roleTags, featuredRoles, state.answers.roleSearchQuery]);

  const skillOptions = useMemo(() => {
    const q = state.answers.skillSearchQuery.trim().toLowerCase();
    if (!q) return skillTags.slice(0, MAX_VISIBLE_SKILL_RESULTS);
    return skillTags.filter((skill) => skill.toLowerCase().includes(q)).slice(0, MAX_VISIBLE_SKILL_RESULTS);
  }, [skillTags, state.answers.skillSearchQuery]);

  const autoSuggestedSkills = useMemo(
    () =>
      getRoleBasedSkillSuggestions(state.answers.selectedRoles, skillTags).filter(
        (skill) => !state.answers.removedAutoSkills.includes(skill)
      ),
    [state.answers.selectedRoles, state.answers.removedAutoSkills, skillTags]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setState((prev) => {
        const manualSkills = prev.answers.selectedSkills.filter((skill) => !prev.answers.autoSelectedSkills.includes(skill));
        const nextAuto = prev.answers.selectedRoles.length === 0 ? [] : autoSuggestedSkills;
        const nextSelected = [...manualSkills, ...nextAuto.filter((skill) => !manualSkills.includes(skill))];
        const noChanges =
          nextAuto.length === prev.answers.autoSelectedSkills.length &&
          nextAuto.every((skill, idx) => skill === prev.answers.autoSelectedSkills[idx]) &&
          nextSelected.length === prev.answers.selectedSkills.length &&
          nextSelected.every((skill, idx) => skill === prev.answers.selectedSkills[idx]);
        if (noChanges) return prev;
        return {
          ...prev,
          answers: { ...prev.answers, autoSelectedSkills: nextAuto, selectedSkills: nextSelected },
        };
      });
    });
  }, [autoSuggestedSkills, state.answers.selectedRoles]);

  const setAnswer = (field, value) =>
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [field]: value } }));

  const toggleMulti = (field, value) => {
    setState((prev) => {
      const values = prev.answers[field];
      const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      return { ...prev, answers: { ...prev.answers, [field]: next } };
    });
  };

  const toggleEnergyPattern = (value) => {
    setState((prev) => {
      const current = prev.answers.energyPatterns || [];
      if (current.includes(value)) {
        return { ...prev, answers: { ...prev.answers, energyPatterns: current.filter((v) => v !== value) } };
      }
      if (current.length >= MAX_ENERGY_PATTERNS) return prev;
      return { ...prev, answers: { ...prev.answers, energyPatterns: [...current, value] } };
    });
  };

  const toggleRole = (role) => {
    setState((prev) => {
      const current = prev.answers.selectedRoles;
      const already = current.includes(role);
      if (!already && current.length >= MAX_SELECTED_ROLES) {
        setMessage(`You can add up to ${MAX_SELECTED_ROLES} roles.`);
        setMessageTone("error");
        return prev;
      }
      const nextRoles = already ? current.filter((r) => r !== role) : [...current, role];
      const nextDuration = { ...prev.answers.roleDuration };
      const nextExperience = { ...prev.answers.roleExperience };
      if (already) {
        delete nextDuration[role];
        delete nextExperience[role];
      }
      const manualSkills = prev.answers.selectedSkills.filter(
        (skill) => !prev.answers.autoSelectedSkills.includes(skill)
      );
      return {
        ...prev,
        answers: {
          ...prev.answers,
          selectedRoles: nextRoles,
          roleDuration: nextDuration,
          roleExperience: nextExperience,
          selectedSkills: manualSkills,
          autoSelectedSkills: [],
          removedAutoSkills: [],
        },
      };
    });
  };

  const setRoleDuration = (role, duration) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        roleDuration: {
          ...prev.answers.roleDuration,
          [role]: prev.answers.roleDuration?.[role] === duration ? "" : duration,
        },
      },
    }));
  };

  const setRoleExperience = (role, level) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        roleExperience: {
          ...prev.answers.roleExperience,
          [role]: prev.answers.roleExperience?.[role] === level ? "" : level,
        },
      },
    }));
  };

  const addSkill = (raw) => {
    const skill = String(raw ?? "").trim();
    if (!skill) return;
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        selectedSkills: prev.answers.selectedSkills.includes(skill)
          ? prev.answers.selectedSkills
          : [...prev.answers.selectedSkills, skill],
        autoSelectedSkills: prev.answers.autoSelectedSkills.filter((s) => s !== skill),
        removedAutoSkills: prev.answers.removedAutoSkills.filter((s) => s !== skill),
        skillSearchQuery: "",
      },
    }));
  };

  const removeSkill = (skill) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        selectedSkills: prev.answers.selectedSkills.filter((s) => s !== skill),
        autoSelectedSkills: prev.answers.autoSelectedSkills.filter((s) => s !== skill),
        removedAutoSkills: prev.answers.removedAutoSkills.includes(skill)
          ? prev.answers.removedAutoSkills
          : [...prev.answers.removedAutoSkills, skill],
      },
    }));
  };

  const setQuizAnswer = (questionId, value) => {
    setState((prev) => {
      const nextQuiz = { ...prev.answers.quizAnswers, [questionId]: value };
      const allAnswered = ADHD_QUIZ_QUESTIONS.every((q) => nextQuiz[q.id] !== undefined);
      const inferred = allAnswered ? scoreAdhdQuiz(nextQuiz).type : "";
      return {
        ...prev,
        answers: {
          ...prev.answers,
          quizAnswers: nextQuiz,
          quizInferredType: inferred,
          // Auto-apply the inferred type if the user hasn't manually chosen another.
          adhdProfileType:
            prev.answers.adhdProfileType && prev.answers.adhdProfileType !== prev.answers.quizInferredType
              ? prev.answers.adhdProfileType
              : inferred,
        },
      };
    });
  };

  const runTransition = (direction, mutateFn) => {
    setMessage("");
    setPhase(direction === "forward" ? "out-forward" : "out-back");
    if (direction === "forward") {
      setProgressBump(true);
      setTimeout(() => setProgressBump(false), 420);
    }
    transitionTimerRef.current = setTimeout(() => {
      setState(mutateFn);
      setPhase("in");
    }, TRANSITION_MS);
  };

  const goNext = () => {
    const err = validateStep(currentStep, state.answers);
    if (err) {
      setMessage(err);
      setMessageTone("error");
      return;
    }
    if (safeStepIndex >= totalSteps - 1) {
      runTransition("forward", (prev) => ({ ...prev, completed: true, view: "overview" }));
      // Fire-and-forget sync so the user immediately sees their Profile ID on the overview.
      setTimeout(() => { void syncProfileToServer(); }, TRANSITION_MS + 50);
      return;
    }
    runTransition("forward", (prev) => ({ ...prev, stepIndex: safeStepIndex + 1 }));
  };

  const goBack = () => {
    if (safeStepIndex <= 0) return;
    runTransition("back", (prev) => ({ ...prev, stepIndex: safeStepIndex - 1 }));
  };

  const jumpToStepById = (stepId) => {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    setState((prev) => ({ ...prev, view: "wizard", stepIndex: idx }));
    setMessage("");
  };

  const saveAndExit = () => {
    setState((prev) => ({ ...prev, view: "overview" }));
    setMessage("Progress saved.");
    setMessageTone("info");
    void syncProfileToServer();
  };

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
    setMessage("");
    setSyncStatus("idle");
    setSyncMessage("");
    setCopyFeedback("");
  };

  /**
   * Sync the current answers to the backend. Creates a new anonymous profile
   * (and Profile ID) on first call, updates in place on subsequent calls.
   * Returns the issued id on success, or null on failure.
   */
  const syncProfileToServer = async () => {
    const payload = buildPayloadForSync(state.answers);
    setSyncStatus("saving");
    setSyncMessage("");
    try {
      const result = state.profileId
        ? await updateProfile(state.profileId, payload)
        : await createProfile(payload);
      setState((prev) => ({
        ...prev,
        profileId: result.id,
        syncedAt: result.updated_at || result.created_at || new Date().toISOString(),
      }));
      setSyncStatus("saved");
      setSyncMessage(state.profileId ? "Saved." : "Profile ID created. Copy it to reuse on another browser.");
      return result.id;
    } catch (err) {
      // If we have a cached id but the server no longer has it, fall back to create.
      if (state.profileId && String(err?.message || "").toLowerCase().includes("not found")) {
        try {
          const result = await createProfile(payload);
          setState((prev) => ({
            ...prev,
            profileId: result.id,
            syncedAt: result.updated_at || result.created_at || new Date().toISOString(),
          }));
          setSyncStatus("saved");
          setSyncMessage("Profile ID refreshed (old one was missing on the server).");
          return result.id;
        } catch (err2) {
          setSyncStatus("error");
          setSyncMessage(err2.message || "Could not save your profile right now.");
          return null;
        }
      }
      setSyncStatus("error");
      setSyncMessage(err.message || "Could not save your profile right now.");
      return null;
    }
  };

  /**
   * Core "load by ID" flow used from both the inline step-1 form and the
   * welcome modal. Throws an ``Error`` on failure so callers can show the
   * message in their own UI; resolves silently on success.
   */
  const loadProfileById = async (rawOrFormattedId) => {
    const normalized = normalizeProfileId(rawOrFormattedId);
    if (normalized.length !== 8) {
      throw new Error("User IDs are 8 letters/numbers — try again.");
    }
    const result = await fetchProfile(normalized);
    setState((prev) => ({
      ...prev,
      view: "overview",
      completed: true,
      stepIndex: 0,
      profileId: result.id,
      syncedAt: result.updated_at || result.created_at || new Date().toISOString(),
      answers: mergeLoadedAnswers(prev.answers, result.profile || {}),
    }));
    setSyncStatus("saved");
    setSyncMessage("Profile loaded.");
    setMessage("");
    return result;
  };

  const handleLoadById = async (event) => {
    event?.preventDefault?.();
    setLoadIdBusy(true);
    setLoadIdError("");
    try {
      await loadProfileById(loadIdInput);
      setLoadIdOpen(false);
      setLoadIdInput("");
    } catch (err) {
      setLoadIdError(err.message || "We couldn't load that profile.");
    } finally {
      setLoadIdBusy(false);
    }
  };

  const handleCopyProfileId = async () => {
    if (!state.profileId) return;
    try {
      await navigator.clipboard.writeText(state.profileId);
      setCopyFeedback("Copied!");
    } catch {
      setCopyFeedback("Press Ctrl+C to copy.");
    }
    setTimeout(() => setCopyFeedback(""), 1800);
  };

  /**
   * Minimal lettered option card (A/B/C/D). Used for every single-select
   * question so the UI stays scannable — ADHD visitors shouldn't have to
   * re-read long descriptions to pick.
   */
  const renderLetteredOption = (value, label, current, onSelect, letterIdx = 0) => {
    const isSelected = current === value;
    return (
      <button
        key={value}
        type="button"
        className={`q-choice ${isSelected ? "is-selected" : ""}`}
        onClick={() => onSelect(value)}
        aria-pressed={isSelected}
      >
        <span className="q-choice-letter" aria-hidden="true">{LETTERS[letterIdx] || "·"}</span>
        <span className="q-choice-label">{label}</span>
        <span className={`q-choice-check ${isSelected ? "is-on" : ""}`} aria-hidden="true">
          {isSelected ? "✓" : ""}
        </span>
      </button>
    );
  };

  const renderChips = (field, options, { mode = "multi", onToggle } = {}) => (
    <div className="chip-grid">
      {options.map((option) => {
        const selected =
          mode === "multi"
            ? state.answers[field]?.includes(option)
            : state.answers[field] === option;
        return (
          <button
            key={option}
            type="button"
            className={`choice-chip ${selected ? "is-selected" : ""}`}
            onClick={() => (onToggle ? onToggle(option) : toggleMulti(field, option))}
            aria-pressed={selected}
          >
            {option}
          </button>
        );
      })}
    </div>
  );

  const renderRoleSelector = () => {
    const selectedValues = state.answers.selectedRoles;
    const visible = roleOptions.filter((item) => !selectedValues.includes(item));
    return (
      <>
        <div className="tag-input-wrap">
          <div className="selected-tag-list">
            {selectedValues.map((tag) => (
              <span key={tag} className="selected-tag">
                {tag}
                <button type="button" className="tag-remove-button" onClick={() => toggleRole(tag)} aria-label={`Remove ${tag}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={state.answers.roleSearchQuery}
            onChange={(e) => setAnswer("roleSearchQuery", e.target.value)}
            placeholder={`Type to add up to ${MAX_SELECTED_ROLES} roles...`}
            aria-label="Search roles"
          />
        </div>
        <p className="role-limit-note">{selectedValues.length}/{MAX_SELECTED_ROLES} roles selected</p>
        <div className="suggestion-list">
          {visible.length === 0 ? (
            <div className="suggestion-empty">No matching keywords</div>
          ) : (
            visible.map((item) => (
              <button key={item} type="button" className="suggestion-row" onClick={() => toggleRole(item)}>
                <span>{item}</span>
              </button>
            ))
          )}
        </div>
      </>
    );
  };

  const renderSkillSelector = () => {
    const selectedValues = state.answers.selectedSkills;
    const query = state.answers.skillSearchQuery.trim();
    const visible = skillOptions.filter((item) => !selectedValues.includes(item));
    const hasExact =
      selectedValues.some((item) => item.toLowerCase() === query.toLowerCase()) ||
      visible.some((item) => item.toLowerCase() === query.toLowerCase());
    return (
      <>
        <div className="tag-input-wrap">
          <div className="selected-tag-list">
            {selectedValues.map((tag) => (
              <span key={tag} className="selected-tag">
                {tag}
                <button type="button" className="tag-remove-button" onClick={() => removeSkill(tag)} aria-label={`Remove ${tag}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={state.answers.skillSearchQuery}
            onChange={(e) => setAnswer("skillSearchQuery", e.target.value)}
            placeholder="Type a skill keyword..."
            aria-label="Search skills"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(state.answers.skillSearchQuery);
              }
            }}
          />
        </div>
        <div className="suggestion-list">
          {visible.slice(0, MAX_VISIBLE_SKILL_RESULTS).map((item) => (
            <button key={item} type="button" className="suggestion-row" onClick={() => addSkill(item)}>
              <span>{item}</span>
            </button>
          ))}
          {query && !hasExact ? (
            <button type="button" className="suggestion-row suggestion-row--custom" onClick={() => addSkill(query)}>
              <span>{`Add "${query}"`}</span>
            </button>
          ) : null}
          {!query && visible.length === 0 ? <div className="suggestion-empty">No matching keywords</div> : null}
        </div>
      </>
    );
  };

  const renderStepBody = (step) => {
    if (!step) return null;
    const a = state.answers;
    switch (step.kind) {
      case "adhd-awareness":
        return (
          <>
            <h2 className="q-title">Do you already know your focus profile?</h2>
            <div className="q-choice-stack">
              {renderLetteredOption("yes", "Yes, I know my profile", a.adhdAwareness, (v) => setAnswer("adhdAwareness", v), 0)}
              {renderLetteredOption("no", "Not sure yet — let's check", a.adhdAwareness, (v) => setAnswer("adhdAwareness", v), 1)}
            </div>
            <div className="q-load-id-panel">
              {!loadIdOpen ? (
                <button
                  type="button"
                  className="q-load-id-toggle"
                  onClick={() => { setLoadIdOpen(true); setLoadIdError(""); }}
                >
                  Already have a User ID? <span aria-hidden="true">→</span>
                </button>
              ) : (
                <form className="q-load-id-form" onSubmit={handleLoadById}>
                  <label htmlFor="profile-id-input" className="q-load-id-label">
                    Enter your User ID
                  </label>
                  <div className="q-load-id-row">
                    <input
                      id="profile-id-input"
                      className="q-load-id-input"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="K7X2-M4QR"
                      value={loadIdInput}
                      onChange={(e) => { setLoadIdInput(e.target.value); setLoadIdError(""); }}
                      disabled={loadIdBusy}
                      maxLength={12}
                    />
                    <button type="submit" className="button primary" disabled={loadIdBusy}>
                      {loadIdBusy ? "Loading..." : "Load"}
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => { setLoadIdOpen(false); setLoadIdError(""); }}
                      disabled={loadIdBusy}
                    >
                      Cancel
                    </button>
                  </div>
                  {loadIdError ? <p className="q-load-id-error">{loadIdError}</p> : null}
                </form>
              )}
            </div>
          </>
        );

      case "adhd-type-known":
        return (
          <>
            <h2 className="q-title">Which one best describes you?</h2>
            <div className="q-choice-stack">
              {Object.keys(ADHD_TYPE_LABELS).map((key, i) =>
                renderLetteredOption(
                  key,
                  ADHD_TYPE_LABELS[key],
                  a.adhdProfileType,
                  (v) => setAnswer("adhdProfileType", v),
                  i
                )
              )}
            </div>
          </>
        );

      case "adhd-quiz": {
        const q = step.question;
        const answer = a.quizAnswers?.[q.id];
        return (
          <>
            <h2 className="q-title">{q.text}</h2>
            <div className="q-choice-stack">
              {QUIZ_SCALE.map((opt, i) =>
                renderLetteredOption(
                  opt.value,
                  opt.label,
                  answer,
                  (v) => setQuizAnswer(q.id, v),
                  i
                )
              )}
            </div>
          </>
        );
      }

      case "adhd-quiz-result": {
        const score = scoreAdhdQuiz(a.quizAnswers);
        const inferredKey = a.quizInferredType || score.type;
        return (
          <>
            <h2 className="q-title">Your profile: {ADHD_TYPE_LABELS[inferredKey]}</h2>
            <p className="q-subtitle">{ADHD_TYPE_DESCRIPTIONS[inferredKey]}</p>
            <div className="q-choice-stack">
              {Object.keys(ADHD_TYPE_LABELS).map((key, i) =>
                renderLetteredOption(
                  key,
                  key === inferredKey ? `${ADHD_TYPE_LABELS[key]} — suggested` : ADHD_TYPE_LABELS[key],
                  a.adhdProfileType || inferredKey,
                  (v) => setAnswer("adhdProfileType", v),
                  i
                )
              )}
            </div>
          </>
        );
      }

      case "work-style":
        return (
          <>
            <h2 className="q-title">Which ways of working bring out your best?</h2>
            <p className="q-subtitle">Pick all that apply.</p>
            {renderChips("workStyles", WORK_STYLE_OPTIONS, { mode: "multi" })}
          </>
        );

      case "support-needs":
        return (
          <>
            <h2 className="q-title">Which supports help you most?</h2>
            <p className="q-subtitle">Pick all that apply.</p>
            {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, { mode: "multi" })}
          </>
        );

      case "roles-pick":
        return (
          <>
            <h2 className="q-title">What roles have you worked in?</h2>
            <p className="q-subtitle">Up to {MAX_SELECTED_ROLES}.</p>
            {renderRoleSelector()}
          </>
        );

      case "role-duration":
        return (
          <>
            <h2 className="q-title">How long have you done <em>{step.role}</em>?</h2>
            <div className="q-choice-stack">
              {DURATION_OPTIONS.map((d, i) =>
                renderLetteredOption(
                  d,
                  d,
                  a.roleDuration?.[step.role],
                  (v) => setRoleDuration(step.role, v),
                  i
                )
              )}
            </div>
          </>
        );

      case "role-experience":
        return (
          <>
            <h2 className="q-title">Your experience level as a <em>{step.role}</em>?</h2>
            <div className="q-choice-stack">
              {EXPERIENCE_LEVEL_OPTIONS.map((level, i) =>
                renderLetteredOption(
                  level,
                  level,
                  a.roleExperience?.[step.role],
                  (v) => setRoleExperience(step.role, v),
                  i
                )
              )}
            </div>
          </>
        );

      case "skills":
        return (
          <>
            <h2 className="q-title">Which skills match your experience?</h2>
            <p className="q-subtitle">We've added some based on your roles — keep, remove, or add more.</p>
            {renderSkillSelector()}
          </>
        );

      case "energy":
        return (
          <>
            <h2 className="q-title">When and how do you do your best work?</h2>
            <p className="q-subtitle">Pick up to {MAX_ENERGY_PATTERNS}.</p>
            <div className="energy-check-grid" role="group" aria-label="Rhythm options">
              {ENERGY_PATTERN_OPTIONS.map((option) => {
                const selected = (a.energyPatterns || []).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={`energy-check-item ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleEnergyPattern(option)}
                    aria-pressed={selected}
                  >
                    <span className={`energy-check-box ${selected ? "is-selected" : ""}`} aria-hidden="true">
                      {selected ? "✓" : ""}
                    </span>
                    <span className="energy-check-label">{option}</span>
                  </button>
                );
              })}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const summarySections = [
    {
      id: "type",
      title: "Type Classification",
      firstStepId: "adhd-awareness",
      rows: [
        { key: "Starting point", value: state.answers.adhdAwareness === "yes" ? "Knew my profile" : state.answers.adhdAwareness === "no" ? "Took the quiz" : "-" },
        { key: "Profile", value: ADHD_TYPE_LABELS[state.answers.adhdProfileType] || "-" },
      ],
    },
    {
      id: "work",
      title: "Work Style",
      firstStepId: "work-style",
      rows: [{ key: "Ways of working", value: state.answers.workStyles.join(", ") || "-" }],
    },
    {
      id: "support",
      title: "Support Setup",
      firstStepId: "support-needs",
      rows: [
        { key: "Supports", value: state.answers.supportNeeds.join(", ") || "-" },
        { key: "Rhythm", value: (state.answers.energyPatterns || []).join(", ") || "-" },
      ],
    },
    {
      id: "jobs",
      title: "Jobs & Skills",
      firstStepId: "roles-pick",
      rows: [
        {
          key: "Role(s)",
          value:
            state.answers.selectedRoles
              .map(
                (role) =>
                  `${role} (${state.answers.roleExperience?.[role] || "Level not set"}, ${state.answers.roleDuration?.[role] || "Duration not set"})`
              )
              .join(", ") || "-",
        },
        { key: "Skills", value: state.answers.selectedSkills.join(", ") || "-" },
      ],
    },
  ];

  const progressPct = totalSteps > 0 ? ((safeStepIndex + 1) / totalSteps) * 100 : 0;

  // Which block the current step belongs to, which sub-questions sit inside
  // it, and the index of the current step within that block. Powers the top
  // segmented stepper and the right-hand "Questions in this block" panel.
  const activeBlockId = currentStep?.block || "type";
  const activeBlock = BLOCKS.find((b) => b.id === activeBlockId) || BLOCKS[0];
  const activeBlockSteps = steps.filter((s) => s.block === activeBlockId);
  const activeBlockStepIndex = Math.max(0, activeBlockSteps.findIndex((s) => s.id === currentStep?.id));

  // Which blocks have been started / finished — used to style the segmented
  // stepper. The final "User Profile" block is considered started only once
  // every wizard step is answered (i.e. the user is on the overview).
  const blockStatus = BLOCKS.map((b) => {
    if (b.id === "profile") {
      const reached = state.view === "overview";
      return { ...b, status: reached ? "active" : "future" };
    }
    const stepsInBlock = steps.filter((s) => s.block === b.id);
    if (stepsInBlock.length === 0) return { ...b, status: "future" };
    const allAnswered = stepsInBlock.every((s) => isStepAnswered(s, state.answers));
    const isActive = activeBlockId === b.id && state.view === "wizard";
    if (isActive) return { ...b, status: "active" };
    if (allAnswered) return { ...b, status: "done" };
    const anyAnswered = stepsInBlock.some((s) => isStepAnswered(s, state.answers));
    return { ...b, status: anyAnswered ? "started" : "future" };
  });

  return (
    <div className="profile-app profile-app--fullscreen">
      <DataConsentModal />
      <UserIdEntryModal
        open={welcomeModalOpen}
        onDismiss={handleWelcomeDismiss}
        onSubmit={handleWelcomeSubmit}
        title="Do you already have a User ID?"
        description="If you've built a Career Profile before, enter your User ID to pick up right where you left off. We'll load the answers you saved — no personal info needed."
      />
      <header className="topbar">
        <div className="brand-wrap">
          <Link to="/" className="profile-header-brand-link" aria-label="NeuroGuide home">
            <div className="home-sticky-bar-brand">
              <NeuroBrandFlower svgClassName="home-sticky-bar-mark" animationActive={brandFlowerActive} />
              <div className="home-sticky-bar-copy">
                <span className="home-sticky-bar-kicker">NeuroGuide</span>
                <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
                <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
              </div>
            </div>
          </Link>
          <nav className="profile-top-nav" aria-label="Site">
            <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>Home</Link>
            <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined}>Career Profile</Link>
            <Link
              to="/simplify-job-description"
              aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined}
            >
              Simplify Job Description
            </Link>
          </nav>
        </div>
      </header>

      {state.view === "overview" ? (
        <>
          <header className="simplify-hero" aria-labelledby="intro-heading">
            <div className="simplify-hero-grid">
              <div className="simplify-hero-copy">
                <p className="simplify-hero-eyebrow">Your career snapshot</p>
                <h1 id="intro-heading" className="simplify-hero-title">
                  A tidy picture of the way you work.
                </h1>
                <p className="simplify-hero-lead">
                  Tap any section to edit.
                </p>
                <Link to="/" className="simplify-hero-back">← Back home</Link>
              </div>
              <HeroPaperShapes />
            </div>
          </header>

          <main className="app-shell">
            <section className="summary-card">
              <div className="profile-top">
                <div className="avatar">NG</div>
                <div>
                  <h2 id="summary-heading">Profile Ready</h2>
                  <p id="summary-subtitle">
                    {state.completed
                      ? "All sections completed. You can still edit any step."
                      : "Progress saved. Continue from any step below."}
                  </p>
                </div>
              </div>

              <aside
                className={`profile-id-card profile-id-card--${state.profileId ? "ready" : syncStatus}`}
                aria-label="Your anonymous Profile ID"
              >
                <div className="profile-id-card-head">
                  <span className="profile-id-card-eyebrow">Your Profile ID</span>
                  <h3 className="profile-id-card-title">
                    {state.profileId
                      ? "Keep this code — it's how you'll continue on another browser or device."
                      : syncStatus === "saving"
                      ? "Creating your Profile ID..."
                      : syncStatus === "error"
                      ? "We couldn't reach the server to save your profile."
                      : "We'll create a short code here as soon as your profile is synced."}
                  </h3>
                </div>
                {state.profileId ? (
                  <div className="profile-id-card-body">
                    <div className="profile-id-code" aria-live="polite">
                      <code>{state.profileId}</code>
                      <button
                        type="button"
                        className="button secondary profile-id-copy"
                        onClick={handleCopyProfileId}
                      >
                        {copyFeedback || "Copy"}
                      </button>
                    </div>
                    <p className="profile-id-card-note">
                      No personal info is stored — only the answers you gave above. To continue on another device,
                      open the Career Profile wizard, click <em>“Already have a Profile ID?”</em> and paste this code.
                    </p>
                    <div className="profile-id-card-actions">
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => { void syncProfileToServer(); }}
                        disabled={syncStatus === "saving"}
                      >
                        {syncStatus === "saving" ? "Saving..." : "Sync latest changes"}
                      </button>
                      {state.syncedAt ? (
                        <span className="profile-id-synced-at">
                          Last synced {new Date(state.syncedAt).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="profile-id-card-body">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => { void syncProfileToServer(); }}
                      disabled={syncStatus === "saving"}
                    >
                      {syncStatus === "saving" ? "Saving..." : "Create my Profile ID"}
                    </button>
                  </div>
                )}
                {syncMessage ? (
                  <p
                    className="profile-id-card-status"
                    data-tone={syncStatus === "error" ? "error" : "info"}
                    role="status"
                  >
                    {syncMessage}
                  </p>
                ) : null}
              </aside>
              <div className="summary-grid">
                {summarySections.map((section) => (
                  <article key={section.id} className="summary-block">
                    <h3>{section.title}</h3>
                    <ul className="summary-list">
                      {section.rows.map((row) => (
                        <li key={row.key} className="summary-item">
                          <span className="summary-key">{row.key}</span>
                          <span className="summary-value">{row.value}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => jumpToStepById(section.firstStepId)}
                    >
                      Edit this section
                    </button>
                  </article>
                ))}
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setShowSuitabilityPlaceholder(true)}
                >
                  Check job suitability score
                </button>
                <Link to="/simplify-job-description" className="button primary">
                  Explore job description simplification
                </Link>
                {showSuitabilityPlaceholder ? (
                  <p className="error-message" data-tone="info">Functionality part of iteration 3 development</p>
                ) : null}
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setState((prev) => ({ ...prev, view: "wizard" }))}
                >
                  Continue Editing
                </button>
                <button type="button" className="button secondary" onClick={resetAll}>
                  Start Over
                </button>
              </div>
            </section>
          </main>
        </>
      ) : (
        <main className="q-screen" aria-live="polite">
          {/* Segmented block stepper — replaces the old "Question 17 of 17" */}
          <nav className="q-blocks" aria-label="Profile sections">
            <ol className="q-blocks-list">
              {blockStatus.map((b, i) => (
                <li key={b.id} className={`q-blocks-item is-${b.status}`}>
                  <span className="q-blocks-dot" aria-hidden="true">
                    {b.status === "done" ? "✓" : i + 1}
                  </span>
                  <span className="q-blocks-label">{b.label}</span>
                </li>
              ))}
            </ol>
            <div className={`q-blocks-track ${progressBump ? "is-bumping" : ""}`} aria-hidden="true">
              <div className="q-blocks-track-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </nav>

          <div className="q-layout">
            {/* Main question column */}
            <section className="q-main">
              <div className={`q-screen-inner q-phase-${phase}`} key={currentStep?.id}>
                <article className="q-card">
                  <header className="q-card-head">
                    <span className="q-card-head-eyebrow">{activeBlock.label}</span>
                    {activeBlockSteps.length > 1 ? (
                      <span className="q-card-head-count">
                        Question {activeBlockStepIndex + 1} of {activeBlockSteps.length}
                      </span>
                    ) : null}
                  </header>

                  <div className="q-card-body">
                    {renderStepBody(currentStep)}
                  </div>

                  {message ? (
                    <p className="q-message" data-tone={messageTone} role="alert">{message}</p>
                  ) : null}

                  <div className="q-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={goBack}
                      disabled={safeStepIndex === 0}
                    >
                      Back
                    </button>
                    <button type="button" className="button secondary" onClick={saveAndExit}>
                      Save &amp; exit
                    </button>
                    <button type="button" className="button primary q-next" onClick={goNext}>
                      {safeStepIndex >= totalSteps - 1 ? "Finish" : "Next"}
                      <span className="q-next-arrow" aria-hidden="true">→</span>
                    </button>
                  </div>

                  <button type="button" className="q-clear-link" onClick={resetAll}>
                    Clear everything and start over
                  </button>
                </article>
              </div>
            </section>

            {/* Right panel — questions in the active block */}
            <aside className="q-sidepanel" aria-label={`Questions in ${activeBlock.label}`}>
              <header className="q-sidepanel-head">
                <h3 className="q-sidepanel-title">{activeBlock.label}</h3>
                <span className="q-sidepanel-sub">
                  {activeBlockSteps.length} question{activeBlockSteps.length === 1 ? "" : "s"}
                </span>
              </header>
              <ol className="q-sidepanel-list">
                {activeBlockSteps.map((s, i) => {
                  const answered = isStepAnswered(s, state.answers);
                  const isCurrent = s.id === currentStep?.id;
                  const stepGlobalIndex = steps.findIndex((x) => x.id === s.id);
                  return (
                    <li
                      key={s.id}
                      className={
                        "q-sidepanel-item" +
                        (isCurrent ? " is-current" : "") +
                        (answered ? " is-done" : "")
                      }
                    >
                      <button
                        type="button"
                        className="q-sidepanel-btn"
                        onClick={() => {
                          if (stepGlobalIndex < 0) return;
                          runTransition(
                            stepGlobalIndex >= safeStepIndex ? "forward" : "back",
                            (prev) => ({ ...prev, stepIndex: stepGlobalIndex })
                          );
                        }}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        <span className="q-sidepanel-btn-label">
                          {i + 1}. {shortLabelForStep(s)}
                        </span>
                        <span className="q-sidepanel-btn-check" aria-hidden="true">
                          {answered ? "✓" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}

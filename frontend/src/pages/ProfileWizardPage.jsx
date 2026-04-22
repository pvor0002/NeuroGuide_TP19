import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DataConsentModal from "../components/DataConsentModal.jsx";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";

const STORAGE_KEY = "neuroguide.careerProfile.react.v2";
const MAX_VISIBLE_SKILL_RESULTS = 20;
const MAX_VISIBLE_ROLE_RESULTS = 18;
const MAX_SELECTED_ROLES = 3;
const MAX_ENERGY_PATTERNS = 2;
const TRANSITION_MS = 220;

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

// Self-report prompts informed by DSM-5 + ASRS-style phrasing (not a diagnosis).
// Four items per cluster keeps the quiz short while still giving a stable signal.
const ADHD_QUIZ_QUESTIONS = [
  { id: "q1", cluster: "inattentive", text: "How often do you have trouble staying focused on a task, meeting, or conversation?" },
  { id: "q2", cluster: "inattentive", text: "How often do you forget appointments, deadlines, or where you put things?" },
  { id: "q3", cluster: "inattentive", text: "How often do you get distracted by activity or noise around you?" },
  { id: "q4", cluster: "inattentive", text: "How often do you struggle to finish tasks after the initial excitement wears off?" },
  { id: "q5", cluster: "hyperactive", text: "How often do you feel restless, fidgety, or an urge to move?" },
  { id: "q6", cluster: "hyperactive", text: "How often do you interrupt others or finish their sentences?" },
  { id: "q7", cluster: "hyperactive", text: "How often do you act or speak on impulse, without thinking it through?" },
  { id: "q8", cluster: "hyperactive", text: "How often do you feel 'on the go', as if driven by a motor?" },
];
const QUIZ_SCALE = [
  { value: 0, label: "Never" },
  { value: 1, label: "Sometimes" },
  { value: 2, label: "Often" },
  { value: 3, label: "Very often" },
];
const QUIZ_CLUSTER_THRESHOLD = 6; // sum >= 6 of 12 flags the cluster

const ADHD_TYPE_LABELS = {
  inattentive: "Inattentive",
  "hyperactive-impulsive": "Hyperactive-Impulsive",
  combined: "Combined",
};
const ADHD_TYPE_DESCRIPTIONS = {
  inattentive:
    "Often described as quiet-but-distracted: focus drifts, details slip, and finishing tasks can be harder than starting them.",
  "hyperactive-impulsive":
    "Often described as high-energy: restlessness, talking or acting quickly, and jumping in before thinking through the full picture.",
  combined:
    "A mix of both clusters — attention wanders and there is a consistent internal (or external) restlessness driving you to move.",
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
 * The list branches on the ADHD-awareness answer and expands per selected role.
 */
function buildSteps(answers) {
  const steps = [];
  // Entry — ADHD awareness gate.
  steps.push({ id: "adhd-awareness", group: "adhd", kind: "adhd-awareness" });

  if (answers.adhdAwareness === "yes") {
    steps.push({ id: "adhd-type-known", group: "adhd", kind: "adhd-type-known" });
  } else if (answers.adhdAwareness === "no") {
    ADHD_QUIZ_QUESTIONS.forEach((q, idx) => {
      steps.push({ id: `adhd-quiz-${q.id}`, group: "adhd", kind: "adhd-quiz", question: q, quizIndex: idx });
    });
    steps.push({ id: "adhd-quiz-result", group: "adhd", kind: "adhd-quiz-result" });
  }

  // Support setup — work style, then supports.
  steps.push({ id: "work-style", group: "support", kind: "work-style" });
  steps.push({ id: "support-needs", group: "support", kind: "support-needs" });

  // Background — pick roles, then per-role duration + experience.
  steps.push({ id: "roles-pick", group: "background", kind: "roles-pick" });
  answers.selectedRoles.forEach((role) => {
    steps.push({ id: `role-duration--${role}`, group: "background", kind: "role-duration", role });
    steps.push({ id: `role-experience--${role}`, group: "background", kind: "role-experience", role });
  });

  // Skills, then time and energy.
  steps.push({ id: "skills", group: "skills", kind: "skills" });
  steps.push({ id: "energy", group: "time", kind: "energy" });

  return steps;
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
  };

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
    setMessage("");
  };

  const renderBigOption = (value, label, description, current, onSelect) => (
    <button
      key={value}
      type="button"
      className={`q-option-big ${current === value ? "is-selected" : ""}`}
      onClick={() => onSelect(value)}
      aria-pressed={current === value}
    >
      <span className="q-option-big-label">{label}</span>
      {description ? <span className="q-option-big-desc">{description}</span> : null}
    </button>
  );

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
            <h2 className="q-title">Do you already know your ADHD type?</h2>
            <p className="q-subtitle">
              This helps us tailor the rest of the profile. If you're unsure, we'll walk through a short, self-reported quiz.
            </p>
            <div className="q-option-stack">
              {renderBigOption(
                "yes",
                "Yes, I know my type",
                "Go straight to picking it.",
                a.adhdAwareness,
                (v) => setAnswer("adhdAwareness", v)
              )}
              {renderBigOption(
                "no",
                "Not sure yet",
                "Take a quick 8-question check to find a starting point.",
                a.adhdAwareness,
                (v) => setAnswer("adhdAwareness", v)
              )}
            </div>
            <p className="q-footnote">Not a diagnosis. You can change your answer anytime.</p>
          </>
        );

      case "adhd-type-known":
        return (
          <>
            <h2 className="q-title">Which ADHD type best describes you?</h2>
            <p className="q-subtitle">Pick the one that feels closest. You can revisit this later.</p>
            <div className="q-option-stack">
              {Object.keys(ADHD_TYPE_LABELS).map((key) =>
                renderBigOption(
                  key,
                  ADHD_TYPE_LABELS[key],
                  ADHD_TYPE_DESCRIPTIONS[key],
                  a.adhdProfileType,
                  (v) => setAnswer("adhdProfileType", v)
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
            <p className="q-kicker">ADHD quiz · Question {step.quizIndex + 1} of {ADHD_QUIZ_QUESTIONS.length}</p>
            <h2 className="q-title">{q.text}</h2>
            <div className="q-scale-row" role="group" aria-label="Frequency scale">
              {QUIZ_SCALE.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`q-scale-btn ${answer === opt.value ? "is-selected" : ""}`}
                  onClick={() => setQuizAnswer(q.id, opt.value)}
                  aria-pressed={answer === opt.value}
                >
                  <span className="q-scale-dot" aria-hidden="true" />
                  <span className="q-scale-label">{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="q-footnote">Answer honestly — there are no right or wrong choices.</p>
          </>
        );
      }

      case "adhd-quiz-result": {
        const score = scoreAdhdQuiz(a.quizAnswers);
        const inferredKey = a.quizInferredType || score.type;
        return (
          <>
            <p className="q-kicker">Quiz result</p>
            <h2 className="q-title">Your responses suggest: {ADHD_TYPE_LABELS[inferredKey]}</h2>
            <p className="q-subtitle">{ADHD_TYPE_DESCRIPTIONS[inferredKey]}</p>
            <div className="q-quiz-bars">
              <div className="q-quiz-bar">
                <span className="q-quiz-bar-label">Inattentive signal</span>
                <div className="q-quiz-bar-track">
                  <div className="q-quiz-bar-fill" style={{ width: `${(score.inattentive / 12) * 100}%` }} />
                </div>
                <span className="q-quiz-bar-value">{score.inattentive}/12</span>
              </div>
              <div className="q-quiz-bar">
                <span className="q-quiz-bar-label">Hyperactive / Impulsive signal</span>
                <div className="q-quiz-bar-track">
                  <div className="q-quiz-bar-fill" style={{ width: `${(score.hyperactive / 12) * 100}%` }} />
                </div>
                <span className="q-quiz-bar-value">{score.hyperactive}/12</span>
              </div>
            </div>
            {score.bothBelowThreshold ? (
              <p className="q-footnote q-footnote--muted">
                Neither cluster is strongly flagged. We've picked the closer one as a starting point — feel free to override.
              </p>
            ) : null}
            <p className="q-subtitle q-subtitle--small">Confirm this, or pick a different type:</p>
            <div className="q-option-stack">
              {Object.keys(ADHD_TYPE_LABELS).map((key) =>
                renderBigOption(
                  key,
                  ADHD_TYPE_LABELS[key],
                  key === inferredKey ? "Suggested based on your answers" : ADHD_TYPE_DESCRIPTIONS[key],
                  a.adhdProfileType || inferredKey,
                  (v) => setAnswer("adhdProfileType", v)
                )
              )}
            </div>
            <p className="q-footnote">This is a self-report signal only, not a medical diagnosis.</p>
          </>
        );
      }

      case "work-style":
        return (
          <>
            <h2 className="q-title">Which ways of working bring out your best?</h2>
            <p className="q-subtitle">Pick all that apply — at least one.</p>
            {renderChips("workStyles", WORK_STYLE_OPTIONS, { mode: "multi" })}
          </>
        );

      case "support-needs":
        return (
          <>
            <h2 className="q-title">Which supports help you do your best work?</h2>
            <p className="q-subtitle">Pick all that apply — at least one.</p>
            {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, { mode: "multi" })}
          </>
        );

      case "roles-pick":
        return (
          <>
            <h2 className="q-title">What roles have you worked in?</h2>
            <p className="q-subtitle">
              Pick up to {MAX_SELECTED_ROLES}. We'll ask about each one next.
            </p>
            {renderRoleSelector()}
          </>
        );

      case "role-duration":
        return (
          <>
            <p className="q-kicker">About your role</p>
            <h2 className="q-title">How long have you done <em>{step.role}</em>?</h2>
            <p className="q-subtitle">Pick the closest range.</p>
            <div className="chip-grid">
              {DURATION_OPTIONS.map((d) => {
                const selected = a.roleDuration?.[step.role] === d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`choice-chip ${selected ? "is-selected" : ""}`}
                    onClick={() => setRoleDuration(step.role, d)}
                    aria-pressed={selected}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </>
        );

      case "role-experience":
        return (
          <>
            <p className="q-kicker">About your role</p>
            <h2 className="q-title">What's your experience level as a <em>{step.role}</em>?</h2>
            <p className="q-subtitle">Pick the level that feels most honest.</p>
            <div className="chip-grid">
              {EXPERIENCE_LEVEL_OPTIONS.map((level) => {
                const selected = a.roleExperience?.[step.role] === level;
                return (
                  <button
                    key={level}
                    type="button"
                    className={`choice-chip ${selected ? "is-selected" : ""}`}
                    onClick={() => setRoleExperience(step.role, level)}
                    aria-pressed={selected}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </>
        );

      case "skills":
        return (
          <>
            <h2 className="q-title">Which skills match your experience?</h2>
            <p className="q-subtitle">
              We've auto-added skills based on your roles — remove any that don't fit, or add more.
            </p>
            {renderSkillSelector()}
          </>
        );

      case "energy":
        return (
          <>
            <h2 className="q-title">When and how do you do your best work?</h2>
            <p className="q-subtitle">
              Pick up to {MAX_ENERGY_PATTERNS} rhythms — we'll use these to flag roles with matching pacing.
            </p>
            <div className="energy-check-grid" role="group" aria-label="Energy pattern options">
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
      id: "adhd",
      title: "ADHD profile",
      firstStepId: "adhd-awareness",
      rows: [
        { key: "Known at start", value: state.answers.adhdAwareness === "yes" ? "Yes" : state.answers.adhdAwareness === "no" ? "Took the quiz" : "-" },
        { key: "Type", value: ADHD_TYPE_LABELS[state.answers.adhdProfileType] || "-" },
      ],
    },
    {
      id: "support",
      title: "Support Setup",
      firstStepId: "work-style",
      rows: [
        { key: "Work style", value: state.answers.workStyles.join(", ") || "-" },
        { key: "Supports", value: state.answers.supportNeeds.join(", ") || "-" },
      ],
    },
    {
      id: "background",
      title: "Your Background",
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
      ],
    },
    {
      id: "skills",
      title: "Skills",
      firstStepId: "skills",
      rows: [{ key: "Skills", value: state.answers.selectedSkills.join(", ") || "-" }],
    },
    {
      id: "time",
      title: "Time and Energy",
      firstStepId: "energy",
      rows: [{ key: "Rhythm", value: (state.answers.energyPatterns || []).join(", ") || "-" }],
    },
  ];

  const progressPct = totalSteps > 0 ? ((safeStepIndex + 1) / totalSteps) * 100 : 0;

  return (
    <div className="profile-app profile-app--fullscreen">
      <DataConsentModal />
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
                <p className="simplify-hero-eyebrow">Your ADHD-friendly career snapshot</p>
                <h1 id="intro-heading" className="simplify-hero-title">
                  A tidy picture of the way you work — ready to carry into suitability scores and interview prep.
                </h1>
                <p className="simplify-hero-lead">
                  Each section below opens back into the guided flow, so you can adjust anything in seconds.
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
          <div className={`q-top-progress ${progressBump ? "is-bumping" : ""}`}>
            <div className="q-top-progress-meta">
              <span className="q-top-progress-label">Career Profile</span>
              <span className="q-top-progress-count">
                Question {Math.min(safeStepIndex + 1, totalSteps)} of {totalSteps}
              </span>
            </div>
            <div className="q-top-progress-track" aria-hidden="true">
              <div className="q-top-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="q-screen-scroll">
            <div className={`q-screen-inner q-phase-${phase}`} key={currentStep?.id}>
              <article className="q-card">
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
          </div>
        </main>
      )}
    </div>
  );
}

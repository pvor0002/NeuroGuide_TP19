import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DataConsentModal from "../components/DataConsentModal.jsx";
import SiteAppHeader from "../components/SiteAppHeader.jsx";
import QuizScene from "../components/QuizScene.jsx";
import ReadAloudButton from "../components/ReadAloudButton.jsx";
import UserIdEntryBox from "../components/UserIdEntryBox.jsx";
import WarmHeroPaperShapes from "../components/WarmHeroPaperShapes.jsx";
import {
  createProfile,
  fetchProfile,
  normalizeProfileId,
  updateProfile,
} from "../services/profileApi.js";
import { isCloudSessionApiAvailable } from "../services/sessionApi.js";
import {
  isCloudSessionUnreachableError,
  loginWithPassKeyAndApply,
  readCredentials,
  registerCloudAccountFromLocalState,
  shouldSyncToCloud,
  syncFullCloudFromLocalState,
} from "../utils/cloudSync.js";

/** Resolved asset URL so the Profile Ready portrait always maps to repo `data/images/dev.png`. */
import devPortraitUrl from "../../../data/images/dev.png";

const STORAGE_KEY = "neuroguide.careerProfile.react.v2";
const MAX_VISIBLE_SKILL_RESULTS = 20;
const MAX_VISIBLE_ROLE_RESULTS = 18;
const MAX_SELECTED_ROLES = 1;
const MAX_ENERGY_PATTERNS = 2;
const MAX_PICK_ALL_APPLY = 2;
const TRANSITION_MS = 260;

// Top-level "blocks" of the wizard. Replaces the old "Question X of N" counter
// with a segmented progress bar so the quiz feels broken into digestible
// chunks. Keep this list short - ADHD visitors should be able to see the
// whole shape of the flow at a glance.
const BLOCKS = [
  { id: "type",    label: "Profile type" },
  { id: "work",    label: "Work Preferences" },
  { id: "support", label: "Support Setup" }, // includes Time and Energy
  { id: "jobs",    label: "Jobs & Skills" },
  { id: "profile", label: "Profile Ready" },
];
// eslint-disable-next-line no-unused-vars
const _BLOCK_IDS = BLOCKS.map((b) => b.id);
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const DURATION_OPTIONS = ["Internship", "6 months", "1-2 years"];
const ENERGY_PATTERN_OPTIONS = [
  "Best with routine",
  "Best with variety",
  "Best with clear deadlines",
  "Best with flexible pace",
  "Best with short focus sprints",
  "Best with frequent breaks",
  "Best with one task at a time",
  "Best in quieter settings",
];

const LEGACY_ENERGY_PATTERN_BODY_DOUBLING = "Best with body-doubling/accountability";

/** Migrate older saved profiles to the current canonical string. */
function normalizeEnergyPatternStoredValue(value) {
  if (value === LEGACY_ENERGY_PATTERN_BODY_DOUBLING) return "Best with accountability";
  return value;
}

/** First letter uppercase; rest unchanged (after trimming prefix for display). */
function sentenceCaseLeading(s) {
  const t = String(s ?? "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Stored values keep canonical phrases for scoring; strip “Best with / Best in” for UI,
 * shorten legacy accountability wording, then capitalize the visible label.
 */
function energyPatternChoiceLabel(canonicalOption) {
  const normalized = normalizeEnergyPatternStoredValue(String(canonicalOption).trim());
  let rest = normalized;
  if (/^best with\s+/i.test(rest)) rest = rest.replace(/^best with\s+/i, "").trimStart();
  else if (/^best in\s+/i.test(rest)) rest = rest.replace(/^best in\s+/i, "").trimStart();
  else return sentenceCaseLeading(normalized);
  return sentenceCaseLeading(rest);
}
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

// User-facing labels are intentionally soft - we never call these "ADHD
// types" in the UI. The internal keys keep the same names so backend
// storage / analytics stay consistent.
const ADHD_TYPE_LABELS = {
  inattentive: "Inattentive",
  "hyperactive-impulsive": "Hyperactive-Impulsive",
  combined: "Combined",
};
const ADHD_TYPE_DESCRIPTIONS = {
  inattentive: "Focus drifts and details slip - finishing is harder than starting.",
  "hyperactive-impulsive": "High energy - restlessness, quick talk, jumping in early.",
  combined: "A mix of both - attention wanders and there's restlessness driving you.",
};

/** Choosing "a" vs "an" before the profile type phrase (e.g. "an Inattentive type"). */
function indefiniteArticleBeforeProfileLabel(label) {
  const t = String(label || "").trim();
  if (!t) return "a";
  const c = t[0].toLowerCase();
  return /^[aeiou]/.test(c) ? "an" : "a";
}

function ProfileReadySectionIcon({ sectionId }) {
  const common = {
    className: "pr-sec-ico",
    "aria-hidden": true,
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
  };
  switch (sectionId) {
    case "type":
      return (
        <svg {...common}>
          <path
            d="M12 12c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M6.2 20.1c.4-2.4 2.5-4.1 5.1-4.1h1.4c2.5 0 4.6 1.6 5.1 4.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "work":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v4.5L15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <path
            d="M12 3.2 20 6.5V12c0 4.5-3.1 7.2-7.4 8.8C8.1 19.1 4 16.2 4 12V6.5L12 3.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M9.2 12.3l1.5 1.4 3.1-2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "jobs":
      return (
        <svg {...common}>
          <path
            d="M4.5 9.5h15v8a1.2 1.2 0 0 1-1.2 1.2H5.7a1.2 1.2 0 0 1-1.2-1.2v-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 9.3V7.1a1.1 1.1 0 0 1 1-1.1h5a1.1 1.1 0 0 1 1 1.1v2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "roles":
      return (
        <svg {...common}>
          <path
            d="M4.5 9.5h15v8a1.2 1.2 0 0 1-1.2 1.2H5.7a1.2 1.2 0 0 1-1.2-1.2v-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 9.3V7.1a1.1 1.1 0 0 1 1-1.1h5a1.1 1.1 0 0 1 1 1.1v2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "skills":
      return (
        <svg {...common}>
          <path
            d="M7.8 9.8h8.8M7.8 13.8h11M7.8 17.8h6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M17.8 17.8l3.9 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

/** Build arcs for an N-segment donut (gaps between segments, flat caps). */
function segmentedProgressArcs(cx, cy, r, segmentCount, totalGapFrac = 0.11) {
  if (!segmentCount || segmentCount < 1) return [];
  const totalGapRad = Math.PI * 2 * Math.min(0.35, Math.max(0.04, totalGapFrac));
  const gapRad = totalGapRad / segmentCount;
  const sweepRad = (Math.PI * 2 - totalGapRad) / segmentCount;
  const large = sweepRad > Math.PI ? 1 : 0;
  return Array.from({ length: segmentCount }, (_, i) => {
    const start = -Math.PI / 2 + i * (sweepRad + gapRad);
    const end = start + sweepRad;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return {
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    };
  });
}

/** ANZSCO-style titles: only IT / software and closely related technology roles. */
const IT_SOFTWARE_ROLE_BLOCKLIST = /photographic|motion picture|film /i;
function isItSoftwareRoleName(role) {
  if (typeof role !== "string" || !role.trim() || IT_SOFTWARE_ROLE_BLOCKLIST.test(role)) {
    return false;
  }
  const t = role.toLowerCase();
  if (/\bict\b/.test(t) || t.includes("ict ")) return true;
  if (t.includes("software")) return true;
  if (t.includes("web developer") || t.includes("web developers")) return true;
  if (t.includes("web designer") || t.includes("web designers") || t.includes("web admin")) return true;
  if (t.includes("computer network")) return true;
  if (t.includes("database ")) return true;
  if (t.startsWith("database ")) return true;
  if (t.includes("developer programmer") || t.includes("analyst programmer")) return true;
  if (t.includes("systems admin")) return true;
  if (t === "systems analysts" || t.startsWith("systems analysts ")) return true;
  if (t.includes("network admin")) return true;
  if (t.includes("network analyst")) return true;
  if (t.includes("software test")) return true;
  if (t.includes("multimedia specialist") && t.includes("web")) return true;
  if (t.includes("game and multimedia develop")) return true;
  if (t.includes("telecommunications network") && (t.includes("engineer") || t.includes("planner")))
    return true;
  if (t.includes("programmer") && !/photographic/i.test(role)) return true;
  if (t.includes("developer") && !/photographic/i.test(role)) return true;
  return false;
}

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
 * Fields from the answers object that we never want to sync to the server -
 * ephemeral UI-only values like search boxes.
 */
const EPHEMERAL_ANSWER_FIELDS = ["roleSearchQuery", "skillSearchQuery"];

function buildPayloadForSync(answers) {
  const payload = { ...answers };
  EPHEMERAL_ANSWER_FIELDS.forEach((field) => delete payload[field]);
  return payload;
}

/** Hide generic browser network errors under the Profile ID / pass key controls. */
function profileSyncErrorMessage(err) {
  const m = String(err?.message ?? err ?? "").trim();
  if (!m) return "";
  const low = m.toLowerCase();
  if (low.includes("failed to fetch")) return "";
  if (low.includes("load failed")) return "";
  if (low.includes("networkerror when attempting to fetch")) return "";
  return m;
}

function mergeLoadedAnswers(base, incoming) {
  const safeArray = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : []);
  const safeRecord = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const safeString = (value) => (typeof value === "string" ? value : "");
  /** If the server blob omits a field, keep ``base`` so we do not wipe arrays with ``[]``. */
  const str = (key) => (incoming[key] !== undefined ? safeString(incoming[key]) : base[key]);
  const rec = (key) => (incoming[key] !== undefined ? safeRecord(incoming[key]) : base[key]);
  const arr = (key, max) =>
    incoming[key] !== undefined ? safeArray(incoming[key]).slice(0, max) : base[key];
  const energy = () =>
    incoming.energyPatterns !== undefined
      ? safeArray(incoming.energyPatterns)
          .map(normalizeEnergyPatternStoredValue)
          .slice(0, MAX_ENERGY_PATTERNS)
      : base.energyPatterns;
  return {
    ...base,
    ...incoming,
    adhdAwareness: str("adhdAwareness"),
    adhdProfileType: str("adhdProfileType"),
    quizAnswers: rec("quizAnswers"),
    quizInferredType: str("quizInferredType"),
    workStyles: arr("workStyles", MAX_PICK_ALL_APPLY),
    supportNeeds: arr("supportNeeds", MAX_PICK_ALL_APPLY),
    selectedRoles: arr("selectedRoles", MAX_SELECTED_ROLES),
    roleSearchQuery: "",
    roleDuration: rec("roleDuration"),
    roleExperience: rec("roleExperience"),
    selectedSkills: arr("selectedSkills", Infinity),
    autoSelectedSkills: arr("autoSelectedSkills", Infinity),
    removedAutoSkills: arr("removedAutoSkills", Infinity),
    skillSearchQuery: "",
    energyPatterns: energy(),
  };
}

/** Display 8-char pass key as ``abcd-efgh`` (matches product copy style). */
function formatPassKeyDisplay(passKey) {
  const s = String(passKey || "").replace(/\s+/g, "");
  if (s.length < 4) return s;
  if (s.length <= 4) return s;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
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
      view: "wizard",
      stepIndex:
        parsed.view === "overview"
          ? 9999
          : Number.isInteger(parsed.stepIndex) && parsed.stepIndex >= 0
            ? parsed.stepIndex
            : 0,
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
        workStyles: toArr(a.workStyles).slice(0, MAX_PICK_ALL_APPLY),
        supportNeeds: toArr(a.supportNeeds).slice(0, MAX_PICK_ALL_APPLY),
        selectedRoles: toArr(a.selectedRoles).slice(0, MAX_SELECTED_ROLES),
        roleSearchQuery: toStr(a.roleSearchQuery),
        roleDuration: toRec(a.roleDuration),
        roleExperience: toRec(a.roleExperience),
        selectedSkills: toArr(a.selectedSkills),
        autoSelectedSkills: toArr(a.autoSelectedSkills),
        removedAutoSkills: toArr(a.removedAutoSkills),
        skillSearchQuery: toStr(a.skillSearchQuery),
        energyPatterns: toArr(a.energyPatterns)
          .map(normalizeEnergyPatternStoredValue)
          .slice(0, MAX_ENERGY_PATTERNS),
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

  // Note: the "returning visitor" User ID prompt is handled by a pre-wizard
  // login gate (see renderLoginGate below) so it does *not* live in the
  // quiz step list and never counts toward any block's progress.

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
  });
  steps.push({ id: "skills", block: "jobs", kind: "skills" });
  // 5. Profile Ready: summary, Profile ID, and next-step CTAs (same page as the quiz).
  steps.push({ id: "profile-ready", block: "profile", kind: "profile-ready" });
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
    case "work-style":        return "Work preferences";
    case "support-needs":     return "Supports that help";
    case "energy":            return "Work style";
    case "roles-pick":        return "IT / software role";
    case "role-duration":     return `${step.role} · how long`;
    case "skills":            return "Skills";
    case "profile-ready":   return "Profile Ready";
    default:                  return "Question";
  }
}

/** True once the answer for a given step is considered complete. */
function isStepAnswered(step, answers) {
  if (!step) return false;
  // "Profile ready" is tracked via state.completed, not a field in answers.
  if (step.kind === "profile-ready") return false;
  return validateStep(step, answers) === null;
}

/** Profile Ready summary: comma-joined or multi-select data as sub-bullets. */
function renderSummaryValue(row, onRemoveValue) {
  const { value, values } = row;
  const summarizeItem = row.key === "Work style" ? energyPatternChoiceLabel : (x) => x;
  if (Array.isArray(values) && values.length > 0) {
    return (
      <ul className="summary-tag-list">
        {values.map((v, i) => (
          <li
            key={`${i}-${String(v).slice(0, 64)}`}
            className={`summary-tag${typeof onRemoveValue === "function" ? " summary-tag--removable" : ""}`}
          >
            <span className="summary-tag-label">{summarizeItem(v)}</span>
            {typeof onRemoveValue === "function" ? (
              <button
                type="button"
                className="summary-tag-remove"
                onClick={() => onRemoveValue(row, v)}
                aria-label={`Remove ${summarizeItem(v)}`}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  if (value != null && value !== "" && value !== "-") {
    const parts = String(value)
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return (
        <ul className="summary-tag-list">
          {parts.map((p, i) => (
            <li
              key={`${i}-${p.slice(0, 64)}`}
              className={`summary-tag${typeof onRemoveValue === "function" ? " summary-tag--removable" : ""}`}
            >
              <span className="summary-tag-label">{p}</span>
              {typeof onRemoveValue === "function" ? (
                <button
                  type="button"
                  className="summary-tag-remove"
                  onClick={() => onRemoveValue(row, p)}
                  aria-label={`Remove ${p}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    return <span className="summary-value">{value}</span>;
  }
  return <span className="summary-value">-</span>;
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
      if (answers.workStyles.length > MAX_PICK_ALL_APPLY) {
        return `Pick up to ${MAX_PICK_ALL_APPLY} work styles.`;
      }
      return null;
    case "support-needs":
      if (answers.supportNeeds.length === 0) return "Pick at least one support that helps.";
      if (answers.supportNeeds.length > MAX_PICK_ALL_APPLY) {
        return `Pick up to ${MAX_PICK_ALL_APPLY} supports.`;
      }
      return null;
    case "roles-pick":
      if (answers.selectedRoles.length === 0) {
        return "Search and select one IT or software job title to continue.";
      }
      if (answers.selectedRoles.length > MAX_SELECTED_ROLES) {
        return MAX_SELECTED_ROLES === 1
          ? "Keep it to 1 role."
          : `Keep it to ${MAX_SELECTED_ROLES} roles.`;
      }
      return null;
    case "role-duration":
      if (!answers.roleDuration?.[step.role]) return "Pick how long you've done this role.";
      return null;
    case "skills":
      if (answers.selectedSkills.length === 0) return "Keep or add at least one skill.";
      return null;
    case "profile-ready":
      return null;
    case "energy":
      if (!answers.energyPatterns || answers.energyPatterns.length === 0) return "Pick at least one work style.";
      if (answers.energyPatterns.length > MAX_ENERGY_PATTERNS) return `Pick up to ${MAX_ENERGY_PATTERNS} work styles.`;
      return null;
    default:
      return null;
  }
}

export default function ProfileWizardPage() {
  useLocation(); // keep router context subscribed
  const navigate = useNavigate();
  const [roleTags, setRoleTags] = useState([]);
  const [skillTags, setSkillTags] = useState([]);
  const [state, setState] = useState(loadPersistedState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("error");
  const [phase, setPhase] = useState("in"); // "in" | "out-forward" | "out-back"
  // eslint-disable-next-line no-unused-vars
  const [_progressBump, setProgressBump] = useState(false);
  const transitionTimerRef = useRef(null);
  const wizardProgressHeadingId = useId();

  // Sync (POST/PUT) status for the "save to cloud" affordance.
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [syncMessage, setSyncMessage] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showSuitabilityGate, setShowSuitabilityGate] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [roleSearchFocused, setRoleSearchFocused] = useState(false);

  // "Login" gate shown once per tab-session before the wizard starts. Not a
  // quiz step - it sits entirely outside buildSteps so it doesn't count toward
  // any block's progress. Skipped automatically when we already have a
  // profileId (either loaded from a previous session or just synced).
  const GATE_SESSION_KEY = "neuroguide.careerProfile.loginGateDismissed";
  const [showLoginGate, setShowLoginGate] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem(GATE_SESSION_KEY) === "1") return false;
    } catch {
      /* sessionStorage unavailable - still show the gate */
    }
    try {
      if (shouldSyncToCloud()) return false;
    } catch {
      /* ignore */
    }
    return true;
  });

  const dismissLoginGate = () => {
    try { window.sessionStorage.setItem(GATE_SESSION_KEY, "1"); } catch { /* ignore */ }
    setShowLoginGate(false);
  };

  useEffect(() => {
    async function loadTaxonomy() {
      try {
        const [rolesRes, skillsRes] = await Promise.all([
          fetch("/au-role-taxonomy.json"),
          fetch("/au-skills-taxonomy.json"),
        ]);
        const roles = rolesRes.ok ? await rolesRes.json() : [];
        const skills = skillsRes.ok ? await skillsRes.json() : [];
        setRoleTags(
          Array.isArray(roles) ? roles.filter((r) => isItSoftwareRoleName(String(r))) : []
        );
        setSkillTags(Array.isArray(skills) ? skills : []);
      } catch {
        setRoleTags([]);
        setSkillTags([]);
      }
    }
    loadTaxonomy();
  }, []);

  /* Every answer change is persisted in this browser immediately. Server / cloud sync is deferred to
   * Profile Ready (on mount), Save and exit, or Create my Profile ID — see syncProfileToServer. */
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const onCloudApplied = () => {
      setState(loadPersistedState());
    };
    window.addEventListener("ng-cloud-session-applied", onCloudApplied);
    return () => window.removeEventListener("ng-cloud-session-applied", onCloudApplied);
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  const steps = useMemo(() => buildSteps(state.answers), [state.answers]);
  const canCheckJobSuitability = useMemo(() => {
    const pre = steps.filter((s) => s.block !== "profile");
    return pre.length === 0 || pre.every((s) => isStepAnswered(s, state.answers));
  }, [steps, state.answers]);

  useEffect(() => {
    if (canCheckJobSuitability) setShowSuitabilityGate(false);
  }, [canCheckJobSuitability]);

  const safeStepIndex = Math.min(state.stepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[safeStepIndex];
  const totalSteps = steps.length;

  // When the visitor lands on the quiz-result step, auto-commit the inferred
  // profile so they don't need to pick it manually - the Next button validates
  // against ``adhdProfileType``.
  useEffect(() => {
    if (currentStep?.kind !== "adhd-quiz-result") return;
    if (state.answers.adhdProfileType) return;
    const inferred =
      state.answers.quizInferredType ||
      scoreAdhdQuiz(state.answers.quizAnswers).type;
    if (!inferred) return;
    setState((prev) => ({
      ...prev,
      answers: { ...prev.answers, adhdProfileType: inferred },
    }));
  }, [currentStep?.kind, state.answers.adhdProfileType, state.answers.quizInferredType, state.answers.quizAnswers]);

  const roleOptions = useMemo(() => {
    const q = state.answers.roleSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return roleTags.filter((role) => role.toLowerCase().includes(q)).slice(0, MAX_VISIBLE_ROLE_RESULTS);
  }, [roleTags, state.answers.roleSearchQuery]);

  const skillOptions = useMemo(() => {
    const q = state.answers.skillSearchQuery.trim().toLowerCase();
    if (!q) return [];
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
    const maxForField =
      field === "workStyles" || field === "supportNeeds" ? MAX_PICK_ALL_APPLY : Infinity;
    setState((prev) => {
      const values = prev.answers[field];
      if (values.includes(value)) {
        const next = values.filter((v) => v !== value);
        return { ...prev, answers: { ...prev.answers, [field]: next } };
      }
      if (values.length >= maxForField) {
        setMessage(`You can pick up to ${maxForField} — remove one to choose another.`);
        setMessageTone("error");
        return prev;
      }
      return { ...prev, answers: { ...prev.answers, [field]: [...values, value] } };
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
      if (already) {
        const nextDuration = { ...prev.answers.roleDuration };
        const nextExperience = { ...prev.answers.roleExperience };
        delete nextDuration[role];
        delete nextExperience[role];
        const manualSkills = prev.answers.selectedSkills.filter(
          (skill) => !prev.answers.autoSelectedSkills.includes(skill)
        );
        return {
          ...prev,
          answers: {
            ...prev.answers,
            selectedRoles: current.filter((r) => r !== role),
            roleDuration: nextDuration,
            roleExperience: nextExperience,
            selectedSkills: manualSkills,
            autoSelectedSkills: [],
            removedAutoSkills: [],
          },
        };
      }
      if (current.length >= MAX_SELECTED_ROLES) {
        if (MAX_SELECTED_ROLES === 1) {
          const old = current[0];
          const nextDuration = { ...prev.answers.roleDuration };
          const nextExperience = { ...prev.answers.roleExperience };
          if (old) {
            delete nextDuration[old];
            delete nextExperience[old];
          }
          const manualSkills = prev.answers.selectedSkills.filter(
            (skill) => !prev.answers.autoSelectedSkills.includes(skill)
          );
          return {
            ...prev,
            answers: {
              ...prev.answers,
              selectedRoles: [role],
              roleDuration: nextDuration,
              roleExperience: nextExperience,
              selectedSkills: manualSkills,
              autoSelectedSkills: [],
              removedAutoSkills: [],
            },
          };
        }
        setMessage(`You can add up to ${MAX_SELECTED_ROLES} roles.`);
        setMessageTone("error");
        return prev;
      }
      const nextRoles = [...current, role];
      const manualSkills = prev.answers.selectedSkills.filter(
        (skill) => !prev.answers.autoSelectedSkills.includes(skill)
      );
      return {
        ...prev,
        answers: {
          ...prev.answers,
          selectedRoles: nextRoles,
          roleDuration: prev.answers.roleDuration,
          roleExperience: prev.answers.roleExperience,
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

  // eslint-disable-next-line no-unused-vars
  const _setRoleExperience = (role, level) => {
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

  const handleProfileReadySkillRemove = (_row, rawValue) => {
    const skill = String(rawValue || "").trim();
    if (!skill) return;
    removeSkill(skill);
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
    if (currentStep?.kind === "profile-ready") {
      return;
    }
    if (currentStep?.kind === "skills") {
      runTransition("forward", (prev) => ({ ...prev, stepIndex: safeStepIndex + 1, completed: true, view: "wizard" }));
      /* DB sync runs when the Profile Ready step mounts (useEffect) and on Save and exit — not here. */
      return;
    }
    if (safeStepIndex >= totalSteps - 1) {
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
    const targetStep = steps[idx];
    const preProfile = steps.filter((s) => s.block !== "profile");
    const canOpenProfileReady =
      preProfile.length === 0 || preProfile.every((s) => isStepAnswered(s, state.answers));
    if (targetStep.block === "profile" && !canOpenProfileReady) {
      const firstMissing = preProfile.find((s) => !isStepAnswered(s, state.answers));
      setMessage("Please complete steps 1 to 4 before opening Profile Ready.");
      setMessageTone("error");
      if (firstMissing) {
        const missingIdx = steps.findIndex((s) => s.id === firstMissing.id);
        if (missingIdx >= 0) {
          setState((prev) => ({ ...prev, view: "wizard", stepIndex: missingIdx }));
        }
      }
      return;
    }
    setState((prev) => ({ ...prev, view: "wizard", stepIndex: idx }));
    setMessage("");
  };

  const handleJobSuitabilityClick = () => {
    if (!canCheckJobSuitability) {
      setShowSuitabilityGate(true);
      return;
    }
    setShowSuitabilityGate(false);
    navigate("/simplify-job-description");
  };

  const saveAndExit = () => {
    const target = steps.findIndex((s) => s.kind === "profile-ready");
    setState((prev) => ({
      ...prev,
      view: "wizard",
      stepIndex: target >= 0 ? target : prev.stepIndex,
    }));
    setMessage("Progress saved.");
    setMessageTone("info");
    /* Defer sync until after React commits so localStorage + stateRef match latest answers. */
    window.setTimeout(() => {
      void syncProfileToServer();
    }, 0);
  };

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
    setMessage("");
    setSyncStatus("idle");
    setSyncMessage("");
    setCopyFeedback("");
  };

  const confirmAndResetAll = () => {
    setShowResetConfirmModal(false);
    resetAll();
  };

  /**
   * Sync the current answers to the backend. Creates a new anonymous profile
   * (and Profile ID) on first call, updates in place on subsequent calls.
   * Returns the issued id on success, or null on failure.
   */
  const syncProfileToServer = async () => {
    const snap = stateRef.current;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      /* ignore */
    }
    let usedCloudSessionFallback = false;
    if (shouldSyncToCloud()) {
      setSyncStatus("saving");
      setSyncMessage("");
      try {
        await syncFullCloudFromLocalState();
        setSyncStatus("saved");
        setSyncMessage("Saved to your account.");
        return "cloud";
      } catch (err) {
        if (!isCloudSessionUnreachableError(err)) {
          const detail = profileSyncErrorMessage(err);
          if (detail) {
            setSyncStatus("error");
            setSyncMessage(detail);
          } else {
            setSyncStatus("idle");
            setSyncMessage("");
          }
          return null;
        }
        usedCloudSessionFallback = true;
        /* /pg/session not on this backend yet — use anonymous Profile ID sync instead */
      }
    }

    const payload = buildPayloadForSync(snap.answers);
    const profileIdBefore = snap.profileId;
    setSyncStatus("saving");
    setSyncMessage("");
    try {
      const result = profileIdBefore
        ? await updateProfile(profileIdBefore, payload)
        : await createProfile(payload);
      setState((prev) => ({
        ...prev,
        profileId: result.id,
        syncedAt: result.updated_at || result.created_at || new Date().toISOString(),
      }));
      setSyncStatus("saved");
      if (usedCloudSessionFallback) {
        setSyncMessage(
          profileIdBefore
            ? "Saved to your Profile ID. Deploy /pg/session on the API to enable full account backup."
            : "Profile ID created (anonymous sync). Your pass key is for a future cloud update when the server supports it.",
        );
      } else {
        setSyncMessage(profileIdBefore ? "Saved." : "Profile ID created. Copy it to reuse on another browser.");
      }
      return result.id;
    } catch (err) {
      // If we have a cached id but the server no longer has it, fall back to create.
      if (profileIdBefore && String(err?.message || "").toLowerCase().includes("not found")) {
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
          const d2 = profileSyncErrorMessage(err2);
          if (d2) {
            setSyncStatus("error");
            setSyncMessage(d2);
          } else {
            setSyncStatus("idle");
            setSyncMessage("");
          }
          return null;
        }
      }
      const d = profileSyncErrorMessage(err);
      if (d) {
        setSyncStatus("error");
        setSyncMessage(d);
      } else {
        setSyncStatus("idle");
        setSyncMessage("");
      }
      return null;
    }
  };

  /**
   * Core "load by ID" flow used from both the inline step-1 form and the
   * welcome modal. Throws an ``Error`` on failure so callers can show the
   * message in their own UI; resolves silently on success.
   */
  const loadProfileById = async (rawOrFormattedId) => {
    const trimmed = String(rawOrFormattedId || "").trim();
    if (!trimmed) {
      throw new Error("Enter your pass key or Profile ID to continue.");
    }

    if (isCloudSessionApiAvailable()) {
      try {
        await loginWithPassKeyAndApply(trimmed);
        const next = loadPersistedState();
        setState(next);
        setSyncStatus("saved");
        setSyncMessage("Welcome back — your saved data is loaded.");
        setMessage("");
        dismissLoginGate();
        return { id: "cloud" };
      } catch (cloudErr) {
        const msg = String(cloudErr?.message || "").toLowerCase();
        const notFound = msg.includes("not recognised") || msg.includes("404") || /\bnot found\b/.test(msg);
        if (!notFound) throw cloudErr;
        /* fall through to anonymous Profile ID lookup */
      }
    }

    const normalized = normalizeProfileId(rawOrFormattedId);
    if (normalized.length !== 8) {
      throw new Error("Enter an 8-character pass key or Profile ID.");
    }
    const result = await fetchProfile(normalized);
    setState((prev) => {
      const merged = mergeLoadedAnswers(prev.answers, result.profile || {});
      const lastIdx = Math.max(0, buildSteps(merged).length - 1);
      return {
        ...prev,
        view: "wizard",
        completed: true,
        stepIndex: lastIdx,
        profileId: result.id,
        syncedAt: result.updated_at || result.created_at || new Date().toISOString(),
        answers: merged,
      };
    });
    setSyncStatus("saved");
    setSyncMessage("Profile loaded.");
    setMessage("");
    dismissLoginGate();
    return result;
  };

  /* When the user lands on Profile Ready (first time or after editing earlier steps), push localStorage
   * to the server. syncProfileToServer reads stateRef at call time so the payload always matches local data. */
  useEffect(() => {
    if (currentStep?.kind !== "profile-ready") return;
    const id = setTimeout(() => {
      void syncProfileToServer();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only when navigating to this step, not on every answer keystroke
  }, [safeStepIndex, currentStep?.kind, currentStep?.id]);

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

  const handleCopyCloudPassKey = async () => {
    const pk = readCredentials()?.passKey;
    if (!pk) return;
    try {
      await navigator.clipboard.writeText(String(pk));
      setCopyFeedback("Copied!");
    } catch {
      setCopyFeedback("Press Ctrl+C to copy.");
    }
    setTimeout(() => setCopyFeedback(""), 1800);
  };

  /**
   * Lettered single-select (A/B/C) for type classification, quiz scale, and duration.
   */
  const renderLetteredOption = (value, label, current, onSelect, letterIdx = 0) => {
    const isSelected = current === value;
    return (
      <button
        key={String(value)}
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

  /** Row + mini checkbox — work preferences, supports, and work-style (energy) only. */
  const renderEnergyCheckRow = (key, label, selected, onClick, { ariaLabel } = {}) => (
    <button
      key={key}
      type="button"
      className={`energy-check-item ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
      {...(ariaLabel != null ? { "aria-label": ariaLabel } : {})}
    >
      <span className={`energy-check-box ${selected ? "is-selected" : ""}`} aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
      <span className="energy-check-label">{label}</span>
    </button>
  );

  const renderChips = (field, options, { mode = "multi", onToggle } = {}) => (
    <div className="energy-check-grid" role="group" aria-label="Options">
      {options.map((option) => {
        const selected =
          mode === "multi"
            ? state.answers[field]?.includes(option)
            : state.answers[field] === option;
        return renderEnergyCheckRow(
          option,
          option,
          selected,
          () => (onToggle ? onToggle(option) : toggleMulti(field, option))
        );
      })}
    </div>
  );

  const renderRoleSelector = () => {
    const selectedValues = state.answers.selectedRoles;
    const query = state.answers.roleSearchQuery.trim();
    const hasQuery = query.length > 0;
    const selectedOne = selectedValues[0];
    const defaultRoleSuggestions = roleTags.slice(0, 8);
    const rolePool = hasQuery ? roleOptions : defaultRoleSuggestions;
    const visible = rolePool.filter((item) => !selectedValues.includes(item));
    const showSuggestions = !selectedOne && (hasQuery || roleSearchFocused);
    return (
      <div className="roles-step-theme">
        {selectedOne ? (
          <div className="role-selected-field" role="status" aria-live="polite">
            <span className="role-selected-field__eyebrow">Your role</span>
            <div className="role-selected-field__body">
              <span className="role-selected-field__name">{selectedOne}</span>
              <button
                type="button"
                className="button ghost role-selected-field__change"
                onClick={() => {
                  toggleRole(selectedOne);
                  setAnswer("roleSearchQuery", "");
                }}
              >
                Change
              </button>
            </div>
          </div>
        ) : null}

        {!selectedOne ? (
          <div className="tag-input-wrap role-search-wrap">
            <input
              className="role-search-input"
              value={state.answers.roleSearchQuery}
              onChange={(e) => setAnswer("roleSearchQuery", e.target.value)}
              placeholder="Search IT and software job titles…"
              aria-label="Search IT and software job titles"
              autoComplete="off"
              onFocus={() => setRoleSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setRoleSearchFocused(false), 120);
              }}
            />
          </div>
        ) : null}
        <p className="role-limit-note" aria-live="polite">
          {selectedValues.length === 0
            ? "You can add 1 job title. Start typing to see suggestions from our IT and software list."
            : "1 of 1 role selected — click Change to search and pick a different title."}
        </p>
        {showSuggestions ? (
          <div className="suggestion-list suggestion-list--roles" role="listbox" aria-label="Role suggestions">
            {visible.length === 0 ? (
              <div className="suggestion-empty">No matching job titles. Try a shorter or different term.</div>
            ) : (
              visible.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="suggestion-row"
                  onClick={() => {
                    toggleRole(item);
                    setAnswer("roleSearchQuery", "");
                    setRoleSearchFocused(false);
                  }}
                >
                  <span>{item}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSkillSelector = () => {
    const selectedValues = state.answers.selectedSkills;
    const query = state.answers.skillSearchQuery.trim();
    const hasQuery = query.length > 0;
    const visible = skillOptions.filter((item) => !selectedValues.includes(item));
    const hasExact =
      selectedValues.some((item) => item.toLowerCase() === query.toLowerCase()) ||
      visible.some((item) => item.toLowerCase() === query.toLowerCase());
    return (
      <div className="skills-step-theme">
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
            className="skill-search-input"
            value={state.answers.skillSearchQuery}
            onChange={(e) => setAnswer("skillSearchQuery", e.target.value)}
            placeholder="Search skills…"
            aria-label="Search or add skills"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(state.answers.skillSearchQuery);
              }
            }}
          />
        </div>
        <p className="role-limit-note" aria-live="polite">
          {hasQuery
            ? "Choose from the list, or press Enter to add a custom skill."
            : "Type to see matching skills. Selected items appear as tags above."}
        </p>
        {hasQuery ? (
          <div
            className="suggestion-list suggestion-list--skills"
            role="listbox"
            aria-label="Skill suggestions"
          >
            {visible.map((item) => (
              <button key={item} type="button" className="suggestion-row" onClick={() => addSkill(item)}>
                <span>{item}</span>
              </button>
            ))}
            {visible.length === 0 && hasExact ? (
              <div className="suggestion-empty" role="status">
                That skill is already in your list.
              </div>
            ) : null}
            {query && !hasExact ? (
              <button
                type="button"
                className="suggestion-row suggestion-row--custom"
                onClick={() => addSkill(query)}
              >
                <span>{`Add "${query}"`}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderStepBody = (step) => {
    if (!step) return null;
    const a = state.answers;
    switch (step.kind) {
      case "adhd-awareness":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">Do you already know your focus profile?</h2>
              </div>
              <ReadAloudButton segments={["Do you already know your focus profile?"]} />
            </div>
            <div className="q-choice-stack">
              {renderLetteredOption("yes", "Yes, I know my profile", a.adhdAwareness, (v) => setAnswer("adhdAwareness", v), 0)}
              {renderLetteredOption("no", "Not sure yet - let's check", a.adhdAwareness, (v) => setAnswer("adhdAwareness", v), 1)}
            </div>
          </>
        );

      case "adhd-type-known":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">Which one best describes you?</h2>
              </div>
              <ReadAloudButton segments={["Which one best describes you?"]} />
            </div>
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
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">{q.text}</h2>
              </div>
              <ReadAloudButton segments={[q.text]} />
            </div>
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
        const quizResultSegments = [
          "Result",
          `Your profile: ${ADHD_TYPE_LABELS[inferredKey]}`,
          ADHD_TYPE_DESCRIPTIONS[inferredKey],
          "This is not a medical or diagnostic test. It is a brief self-report profile based on research and common patterns. Use it as context for your strengths and needs, not as a clinical label.",
        ];
        return (
          <div
            className="q-quiz-result"
            role="region"
            aria-labelledby="q-quiz-result-title"
            aria-describedby="q-quiz-result-footnote"
          >
            <div className="q-question-head q-question-head--quiz-result">
              <p className="q-quiz-result-eyebrow">Result</p>
              <ReadAloudButton segments={quizResultSegments} />
            </div>
            <div className="q-quiz-result-focal">
              <h2 className="q-quiz-result-focal-heading" id="q-quiz-result-title">
                <span className="q-quiz-result-focal-prefix">Your profile:</span>
                <span className="q-quiz-result-focal-type">{ADHD_TYPE_LABELS[inferredKey]}</span>
              </h2>
              <p className="q-quiz-result-focal-desc">{ADHD_TYPE_DESCRIPTIONS[inferredKey]}</p>
            </div>
            <p className="q-quiz-result-footnote" id="q-quiz-result-footnote">
              <span className="q-quiz-result-footnote-mark" aria-hidden="true">*</span> This is not a
              medical or diagnostic test. It is a brief self-report profile based on research and
              common patterns, use it as context for your strengths and needs, not as a clinical
              label.
            </p>
          </div>
        );
      }

      case "work-style":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">Which work preferences bring out your best?</h2>
                <p className="q-subtitle">Pick up to {MAX_PICK_ALL_APPLY} that apply.</p>
              </div>
              <ReadAloudButton
                segments={[
                  "Which work preferences bring out your best?",
                  `Pick up to ${MAX_PICK_ALL_APPLY} that apply.`,
                ]}
              />
            </div>
            {renderChips("workStyles", WORK_STYLE_OPTIONS, { mode: "multi" })}
          </>
        );

      case "support-needs":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">Which supports help you most?</h2>
                <p className="q-subtitle">Pick up to {MAX_PICK_ALL_APPLY} that apply.</p>
              </div>
              <ReadAloudButton
                segments={[
                  "Which supports help you most?",
                  `Pick up to ${MAX_PICK_ALL_APPLY} that apply.`,
                ]}
              />
            </div>
            <div className="support-needs-step">
              {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, { mode: "multi" })}
            </div>
          </>
        );

      case "roles-pick":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">What IT or software job role have you had?</h2>
                <p className="q-subtitle">
                  This step is for people with experience as <strong>recent graduates</strong> or with about{" "}
                  <strong>one to two years</strong> in a role. Please choose a <strong>single</strong> title that
                  best matches you—we only use software and IT-related job names so suggestions stay on-topic.
                </p>
              </div>
              <ReadAloudButton
                segments={[
                  "What IT or software job role have you had?",
                  "This step is for people with experience as recent graduates or with about one to two years in a role. Please choose a single title that best matches you. We only use software and IT-related job names so suggestions stay on-topic.",
                ]}
              />
            </div>
            {renderRoleSelector()}
          </>
        );

      case "role-duration":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">
                  How long have you done <em>{step.role}</em>?
                </h2>
              </div>
              <ReadAloudButton segments={[`How long have you done ${step.role}?`]} />
            </div>
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

      case "skills":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">Which skills match your experience?</h2>
                <p className="q-subtitle">We&apos;ve added some based on your roles - keep, remove, or add more.</p>
              </div>
              <ReadAloudButton
                segments={[
                  "Which skills match your experience?",
                  "We've added some based on your roles. Keep, remove, or add more.",
                ]}
              />
            </div>
            {renderSkillSelector()}
          </>
        );

      case "profile-ready":
        {
          const credForHero = readCredentials();
          const sessionPassKey =
            credForHero?.passKey && credForHero?.userId ? String(credForHero.passKey) : null;
          const requiredBlocks = BLOCKS.filter((b) => b.id !== "profile");
          const completionByBlock = requiredBlocks.map((b) => {
            const inBlock = steps.filter((s) => s.block === b.id);
            const done = inBlock.length > 0 && inBlock.every((s) => isStepAnswered(s, state.answers));
            return { ...b, done };
          });
          const completedRequiredCount = completionByBlock.filter((b) => b.done).length;
          const allRequiredDone = completedRequiredCount === requiredBlocks.length;
          const missingLabels = completionByBlock.filter((b) => !b.done).map((b) => b.label);
          const missingHint =
            missingLabels.length > 0
              ? `Still to complete: ${missingLabels.join(", ")}.`
              : "";

          const profileTypeLabel = ADHD_TYPE_LABELS[state.answers.adhdProfileType] || "Not set yet";

          const dashboardSections = [
            {
              id: "work",
              title: "Work Preferences",
              iconId: "work",
              firstStepId: "work-style",
              meaning:
                "Your picks on task size, interruptions, and pace shape every tailored timing tip.",
              rows: [{ key: "Preferences", values: state.answers.workStyles }],
            },
            {
              id: "skills",
              title: "Skills",
              iconId: "skills",
              firstStepId: "skills",
              meaning:
                "Every listed skill is a proof point for fit scores tied to real work.",
              rows: [{ key: "Skills", values: state.answers.selectedSkills }],
            },
            {
              id: "roles",
              title: "Job focus",
              iconId: "roles",
              firstStepId: "roles-pick",
              meaning:
                "Your saved title and stint length anchor scoring and examples to that role only.",
              rows: (() => {
                const roles = state.answers.selectedRoles || [];
                if (roles.length === 0) {
                  return [{ key: "Job role", values: [] }];
                }
                return [
                  { key: "Job role", values: [...roles] },
                  {
                    key: "Experience",
                    values: roles.map(
                      (role) => state.answers.roleDuration?.[role] || "Duration not set"
                    ),
                  },
                ];
              })(),
            },
            {
              id: "support",
              title: "ADHD Support Setup",
              iconId: "support",
              firstStepId: "support-needs",
              meaning:
                "Saved supports plus when you focus best set how check-ins and next steps get scheduled.",
              rows: [
                { key: "Supports", values: state.answers.supportNeeds },
                { key: "Work style", values: state.answers.energyPatterns || [] },
              ],
            },
          ];

          const profileSummaryMainSections = dashboardSections.filter((s) => s.id === "work" || s.id === "roles");
          const profileSkillsSection = dashboardSections.find((s) => s.id === "skills");
          const profileSupportSection = dashboardSections.find((s) => s.id === "support");

          const profileReadySpeakTitle = `Your profile is ${indefiniteArticleBeforeProfileLabel(profileTypeLabel)} ${profileTypeLabel} type.`;
          const profileReadySpeakChip = allRequiredDone ? "Completed." : `${completedRequiredCount} of 4 sections done.`;
          const profileReadySpeakDetail = allRequiredDone
            ? "Profile ready to use."
            : [missingHint || "", "Finish the rest to unlock full results."].filter(Boolean).join(" ");

          return (
            <div className="q-profile-ready q-profile-dashboard">
              <section
                className="q-profile-hero-card q-profile-hero-card--compact"
                aria-labelledby="summary-heading"
              >
                <div className="q-profile-hero-left">
                  <div className="q-profile-hero-identity">
                    <div className="q-profile-avatar-wrap">
                      <div className="avatar" aria-hidden="true">
                        NG
                      </div>
                    </div>
                    <div className="q-profile-hero-copy">
                      <div className="q-profile-title-row">
                        <h2 className="q-title q-title--profile-summary" id="summary-heading">
                          Your profile is{" "}
                          {indefiniteArticleBeforeProfileLabel(profileTypeLabel)}{" "}
                          <span className="q-profile-ready-type-accent">{`${profileTypeLabel} type`}</span>
                        </h2>
                        <p
                          className={`q-complete-chip ${allRequiredDone ? "is-complete" : "is-incomplete"}`}
                          role="status"
                          aria-live="polite"
                        >
                          {allRequiredDone ? "Completed" : `${completedRequiredCount}/4 done`}
                        </p>
                        <ReadAloudButton
                          className="q-read-aloud-btn--profile-hero"
                          segments={[profileReadySpeakTitle, profileReadySpeakChip, profileReadySpeakDetail]}
                        />
                      </div>
                      <p
                        className={`q-subtitle q-subtitle--hero-compact ${allRequiredDone ? "q-subtitle--success" : "q-subtitle--pending"}`}
                        id="summary-subtitle"
                      >
                        {allRequiredDone ? (
                          "Profile ready to use."
                        ) : (
                          <>
                            {missingHint ? (
                              <span className="q-subtitle-hero-hint" role="alert">
                                <span aria-hidden="true">⚠ </span>
                                {missingHint}
                              </span>
                            ) : null}
                            <span className="q-subtitle-hero-lead">
                              Finish the rest to unlock full results.
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="q-profile-hero-right">
                  {sessionPassKey ? (
                    <div className="q-profile-id-inline q-profile-id-inline--hero" aria-live="polite">
                      <span className="q-profile-id-inline-label">Your pass key</span>
                      <code className="q-profile-id-code-compact">
                        {formatPassKeyDisplay(sessionPassKey)}
                      </code>
                      <button
                        type="button"
                        className="button secondary q-profile-id-copy--compact"
                        onClick={() => void handleCopyCloudPassKey()}
                      >
                        {copyFeedback || "Copy"}
                      </button>
                    </div>
                  ) : state.profileId ? (
                    <div className="q-profile-id-inline q-profile-id-inline--hero" aria-live="polite">
                      <span className="q-profile-id-inline-label">Your code</span>
                      <code className="q-profile-id-code-compact">{state.profileId}</code>
                      <button
                        type="button"
                        className="button secondary q-profile-id-copy--compact"
                        onClick={handleCopyProfileId}
                      >
                        {copyFeedback || "Copy"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button secondary q-profile-id-create"
                        onClick={() => {
                          void syncProfileToServer();
                        }}
                        disabled={syncStatus === "saving"}
                      >
                        {syncStatus === "saving" ? "Creating…" : "Create my Profile ID"}
                      </button>
                      <p className="q-profile-id-help">Create your ID to save and reuse this profile.</p>
                    </>
                  )}
                  {syncMessage ? (
                    <p
                      className="q-profile-ready-sync q-profile-ready-sync--hero"
                      data-tone={syncStatus === "error" ? "error" : "info"}
                      role="status"
                    >
                      {syncMessage === "Not Found" ? "No Profile ID yet" : syncMessage}
                    </p>
                  ) : null}
                </div>
              </section>

              <div className="q-profile-dashboard-body">
                <div className="q-profile-dev-summary-aside">
                  <div className="q-profile-dev-stack">
                    <figure className="q-profile-dev-figure">
                      <div className="q-profile-dev-circle">
                        <img
                          src={devPortraitUrl}
                          alt=""
                          decoding="async"
                          loading="lazy"
                        />
                      </div>
                    </figure>
                    <aside
                      className="q-profile-next-aside q-profile-next-aside--rail q-profile-next-aside--under-portrait"
                      aria-label="Next steps"
                    >
                      <div className="q-profile-cta-section">
                        <h3 className="q-profile-cta-heading">
                          <span className="q-profile-cta-heading-inner">
                            <span className="q-profile-next-arrow-callout" aria-hidden="true">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </span>
                            Next step
                          </span>
                        </h3>
                        <ol className="q-profile-next-flow">
                          <li>Review your profile summary</li>
                          <li>Create your Profile ID</li>
                          <li>Check job suitability score</li>
                        </ol>
                        <div className="q-profile-cta-list">
                          <div className="q-profile-cta-item q-profile-cta-item--suitability">
                            <button
                              type="button"
                              className="button primary q-profile-cta-btn"
                              onClick={handleJobSuitabilityClick}
                            >
                              Check job suitability score
                            </button>
                            {showSuitabilityGate ? (
                              <div className="q-profile-cta-gate" role="alert">
                                <p className="q-profile-cta-gate-msg">
                                  Please complete every profile question before checking job suitability.
                                </p>
                                <p className="q-profile-cta-gate-hint">
                                  Use Progress at the top to see and finish any step you have not completed yet.
                                </p>
                              </div>
                            ) : null}
                          </div>
                          <div className="q-profile-cta-item">
                            <button
                              type="button"
                              className="button ghost q-profile-cta-btn q-profile-cta-btn--secondary"
                              onClick={() => jumpToStepById("adhd-awareness")}
                            >
                              Review from first step
                            </button>
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>

                  <div className="q-profile-summary-col q-profile-summary-col--dashboard">
                    <div className="summary-grid q-profile-summary-grid q-profile-summary-grid--dashboard-row">
                      {profileSummaryMainSections.map((section) => (
                        <article
                          key={section.id}
                          className={`summary-block summary-block--dashboard summary-block--${section.id}`}
                        >
                          <header className="summary-block-head">
                            <div className="summary-block-title-row">
                              <span className="summary-block-icon" aria-hidden="true">
                                <ProfileReadySectionIcon sectionId={section.iconId} />
                              </span>
                              <h3>{section.title}</h3>
                            </div>
                            <button
                              type="button"
                              className="summary-block-edit"
                              onClick={() => jumpToStepById(section.firstStepId)}
                            >
                              <span className="summary-block-edit-ico" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                                  <path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 16v4Z" />
                                  <path d="M13.5 6.5l4 4" />
                                </svg>
                              </span>
                              Edit
                            </button>
                          </header>
                          <p className="summary-block-meaning">{section.meaning}</p>
                          <ul className="summary-list">
                            {section.rows.map((row) => (
                              <li key={row.key} className="summary-item">
                                <span className="summary-key">{row.key}</span>
                                {renderSummaryValue(row)}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                      {profileSupportSection ? (
                        <article
                          className={`summary-block summary-block--dashboard summary-block--support summary-block--support-wide`}
                        >
                          <header className="summary-block-head">
                            <div className="summary-block-title-row">
                              <span className="summary-block-icon" aria-hidden="true">
                                <ProfileReadySectionIcon sectionId={profileSupportSection.iconId} />
                              </span>
                              <h3>{profileSupportSection.title}</h3>
                            </div>
                            <button
                              type="button"
                              className="summary-block-edit"
                              onClick={() => jumpToStepById(profileSupportSection.firstStepId)}
                            >
                              <span className="summary-block-edit-ico" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                                  <path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 16v4Z" />
                                  <path d="M13.5 6.5l4 4" />
                                </svg>
                              </span>
                              Edit
                            </button>
                          </header>
                          <p className="summary-block-meaning">{profileSupportSection.meaning}</p>
                          <div className="summary-support-two-col" role="presentation">
                            {profileSupportSection.rows.map((row) => (
                              <div key={row.key} className="summary-support-two-col-cell">
                                <span className="summary-key">{row.key}</span>
                                <div className="summary-support-two-col-value">
                                  {renderSummaryValue(row)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </article>
                      ) : null}
                    </div>
                  </div>

                  <div className="q-profile-skills-rail" aria-label="Skills summary">
                    {profileSkillsSection ? (
                      <article
                        className={`summary-block summary-block--dashboard summary-block--skills summary-block--skills-stretch`}
                      >
                        <header className="summary-block-head">
                          <div className="summary-block-title-row">
                            <span className="summary-block-icon" aria-hidden="true">
                              <ProfileReadySectionIcon sectionId={profileSkillsSection.iconId} />
                            </span>
                            <h3>{profileSkillsSection.title}</h3>
                          </div>
                          <button
                            type="button"
                            className="summary-block-edit"
                            onClick={() => jumpToStepById(profileSkillsSection.firstStepId)}
                          >
                            <span className="summary-block-edit-ico" aria-hidden="true">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                                <path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 16v4Z" />
                                <path d="M13.5 6.5l4 4" />
                              </svg>
                            </span>
                            Edit
                          </button>
                        </header>
                        <p className="summary-block-meaning">{profileSkillsSection.meaning}</p>
                        <ul className="summary-list">
                          {profileSkillsSection.rows.map((row) => (
                            <li key={row.key} className="summary-item summary-item--skills-ready">
                              <span className="summary-key">{row.key}</span>
                              <div className="summary-skills-ready">
                                <div className="summary-skills-tags">
                                  {renderSummaryValue(row, handleProfileReadySkillRemove)}
                                </div>
                                <div className="summary-skills-add-wrap">
                                  <button
                                    type="button"
                                    className="summary-add-skills-btn"
                                    onClick={() => jumpToStepById("skills")}
                                  >
                                    <span className="summary-add-skills-plus" aria-hidden="true">
                                      +
                                    </span>
                                    <span>Add skills</span>
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        }

      case "energy":
        return (
          <>
            <div className="q-question-head">
              <div className="q-question-head-copy">
                <h2 className="q-title">When and how do you do your best work?</h2>
                <p className="q-subtitle">Pick up to {MAX_ENERGY_PATTERNS}.</p>
              </div>
              <ReadAloudButton
                segments={[
                  "When and how do you do your best work?",
                  `Pick up to ${MAX_ENERGY_PATTERNS}.`,
                ]}
              />
            </div>
            <div className="energy-patterns-step">
              <div className="energy-check-grid" role="group" aria-label="Work style options">
                {ENERGY_PATTERN_OPTIONS.map((option) => {
                  const selected = (a.energyPatterns || []).includes(option);
                  const shortLabel = energyPatternChoiceLabel(option);
                  return renderEnergyCheckRow(option, shortLabel, selected, () => toggleEnergyPattern(option), {
                    ariaLabel: option,
                  });
                })}
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // Which block the current step belongs to, which sub-questions sit inside
  // it, and the index of the current step within that block. Powers the top
  // segmented stepper and the right-hand "Questions in this block" panel.
  const activeBlockId = currentStep?.block || "type";
  const activeBlock = BLOCKS.find((b) => b.id === activeBlockId) || BLOCKS[0];
  const activeBlockSteps = steps.filter((s) => s.block === activeBlockId);
  const activeBlockStepIndex = Math.max(0, activeBlockSteps.findIndex((s) => s.id === currentStep?.id));

  // Which blocks have been started / finished - used to style the segmented
  // stepper (Profile Ready is step 5, same URL as the rest of the wizard).
  const blockStatus = BLOCKS.map((b) => {
    if (b.id === "profile") {
      if (activeBlockId === "profile") {
        return { ...b, status: "active" };
      }
      if (state.completed) {
        return { ...b, status: "done" };
      }
      const preProfile = steps.filter((s) => s.block !== "profile");
      if (preProfile.length > 0 && preProfile.every((s) => isStepAnswered(s, state.answers))) {
        return { ...b, status: "future" };
      }
      return { ...b, status: "future" };
    }
    const stepsInBlock = steps.filter((s) => s.block === b.id);
    if (stepsInBlock.length === 0) return { ...b, status: "future" };
    const allAnswered = stepsInBlock.every((s) => isStepAnswered(s, state.answers));
    const isActive = activeBlockId === b.id;
    if (isActive) return { ...b, status: "active" };
    if (allAnswered) return { ...b, status: "done" };
    const anyAnswered = stepsInBlock.some((s) => isStepAnswered(s, state.answers));
    return { ...b, status: anyAnswered ? "started" : "future" };
  });

  const jumpToWizardBlock = (blockId) => {
    const firstStep = steps.find((s) => s.block === blockId);
    if (firstStep) jumpToStepById(firstStep.id);
  };

  const progressBlocksList = blockStatus;
  /* Ring counts only the four journey blocks; Profile Ready is the destination, not /5. */
  const progressRingBlocks = progressBlocksList.filter((b) => b.id !== "profile");
  const doneBlocksCount = progressRingBlocks.filter((b) => b.status === "done").length;
  const progressTotalBlocks = progressRingBlocks.length;
  const progressVB = 128;
  const progressRingCx = progressVB / 2;
  const progressRingR = 48;
  const progressRingStroke = 10;
  const progressSegArcs =
    progressTotalBlocks > 0
      ? segmentedProgressArcs(progressRingCx, progressRingCx, progressRingR, progressTotalBlocks, 0.11)
      : [];
  const progressFilledSegs =
    progressTotalBlocks === 0 ? 0 : Math.min(doneBlocksCount, progressTotalBlocks);
  const progressRingComplete =
    progressTotalBlocks > 0 && doneBlocksCount >= progressTotalBlocks;
  return (
    <div className="profile-app profile-app--fullscreen">
      <DataConsentModal
        open={showConsentModal}
        autoShow={false}
        onClose={() => setShowConsentModal(false)}
        onBeforeContinue={
          isCloudSessionApiAvailable()
            ? async () => {
                await registerCloudAccountFromLocalState();
              }
            : undefined
        }
        onComplete={() => {
          setShowConsentModal(false);
          dismissLoginGate();
        }}
      />
      <SiteAppHeader />

      {showLoginGate && !state.profileId && !shouldSyncToCloud() ? (
        <main className="login-gate" aria-labelledby="login-gate-title">
          <section className="login-gate-card" role="region">
            <p className="login-gate-eyebrow">Welcome back</p>
            <h1 id="login-gate-title" className="login-gate-title">Already have your pass key?</h1>
            <p className="login-gate-sub">
              Enter the 8-character pass key we gave you when you accepted data storage, or your
              legacy Profile ID (same length). We&apos;ll load your saved answers and tool state.
            </p>

            <UserIdEntryBox
              onSubmit={loadProfileById}
              defaultOpen
              showToggle={false}
              title="Pass key or Profile ID"
              description="8 letters or numbers — capitals don&apos;t matter for legacy IDs."
            />

            <div className="login-gate-divider" role="separator" aria-label="or">
              <span>or</span>
            </div>

            <button
              type="button"
              className="button primary login-gate-new"
              onClick={() => setShowConsentModal(true)}
            >
              Start a new profile
              <span aria-hidden="true">→</span>
            </button>

            <p className="login-gate-foot">
              You can save a new profile at the end of the quiz - we&apos;ll give you
              a User ID to remember it by.
            </p>
          </section>
        </main>
      ) : (
        <main className="q-screen" aria-live="polite">
          {currentStep?.kind !== "profile-ready" ? (
            <header className="simplify-hero simplify-hero--profile-wizard" aria-labelledby="wizard-profile-hero-title">
              <div className="simplify-hero-grid">
                <div className="simplify-hero-copy">
                  <p className="simplify-hero-eyebrow">Five short sections · your pace</p>
                  <h1 id="wizard-profile-hero-title" className="simplify-hero-title">
                    Build your Career Profile: focus style, supports, roles, and skills you can reuse.
                  </h1>
                  <Link to="/" className="simplify-hero-back">
                    ← Back home
                  </Link>
                </div>
                <WarmHeroPaperShapes />
              </div>
            </header>
          ) : null}
          {/* Progress ring: 4 segments (type, work, support, jobs). Stepper still lists Profile Ready as the fifth stop. */}
              <nav
                className="q-steps"
                aria-labelledby={wizardProgressHeadingId}
              >
                <div className="q-steps-inner">
                  <div
                    className="q-steps-completion-ring-wrap"
                    aria-label={`Completed sections ${doneBlocksCount} of ${progressTotalBlocks}`}
                    data-complete={progressRingComplete ? "true" : "false"}
                  >
                    <p className="q-steps-completion-heading" id={wizardProgressHeadingId}>
                      Progress
                    </p>
                    <div className="q-steps-completion-ring-body">
                      <svg
                        className="q-steps-completion-svg"
                        viewBox={`0 0 ${progressVB} ${progressVB}`}
                        aria-hidden="true"
                      >
                        {progressSegArcs.map((seg, i) => {
                          const filled = i < progressFilledSegs;
                          const strokeCol = filled ? "var(--q-ring-seg-done)" : "var(--q-ring-seg-track)";
                          return (
                            <path
                              key={`seg-${i}`}
                              d={seg.d}
                              fill="none"
                              stroke={strokeCol}
                              strokeWidth={progressRingStroke}
                              strokeLinecap="butt"
                            />
                          );
                        })}
                      </svg>
                      <div className="q-steps-completion-hub">
                        <span className="q-steps-completion-ratio">
                          {doneBlocksCount}
                          <span className="q-steps-completion-slash">/</span>
                          {progressTotalBlocks}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ol className="q-steps-list" role="list">
                  {progressBlocksList.map((b, i) => {
                    const stepNumber = i + 1;
                    const isDone = b.status === "done";
                    const isActive = b.status === "active";
                    const isProfile = b.id === "profile";
                    const prev = i > 0 ? progressBlocksList[i - 1] : null;
                    const prevFilled = prev && (prev.status === "done" || prev.status === "active");
                    return (
                      <li
                        key={b.id}
                        className={`q-steps-item is-${b.status}${isProfile ? " q-steps-item--profile-milestone" : ""}`}
                        aria-current={isActive ? "step" : undefined}
                      >
                        {i > 0 ? (
                          <span
                            className={`q-steps-connector ${prevFilled ? "is-filled" : ""}`}
                            aria-hidden="true"
                          />
                        ) : null}
                        <button
                          type="button"
                          className="q-steps-btn"
                          onClick={() => jumpToWizardBlock(b.id)}
                          aria-label={
                            b.id === "profile"
                              ? isDone
                                ? "Profile Ready — completed"
                                : isActive
                                  ? "Profile Ready — current step"
                                  : "Go to Profile Ready"
                              : `Go to step ${stepNumber}: ${b.label}`
                          }
                        >
                          <span className="q-steps-track-row">
                            <span
                              className={
                                "q-steps-dot" +
                                (isProfile ? " q-steps-dot--milestone" : "") +
                                (isProfile && isActive ? " q-steps-dot--milestone-active" : "") +
                                (isProfile && isDone ? " q-steps-dot--milestone-done" : "")
                              }
                              aria-hidden="true"
                            >
                              {isProfile ? (
                                <svg
                                  className="q-steps-milestone-ico"
                                  width="30"
                                  height="30"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.85"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="8" r="3.5" />
                                  <path d="M6 20v-.6A6 6 0 0 1 18 19.4V20" />
                                </svg>
                              ) : isDone ? (
                                "✓"
                              ) : (
                                stepNumber
                              )}
                            </span>
                          </span>
                          <span className="q-steps-caption">
                            {b.id === "profile" ? (
                              <>
                                <span className="q-steps-caption-eyebrow">STEP {stepNumber}</span>
                                <span className="q-steps-caption-title">Profile Ready</span>
                              </>
                            ) : (
                              <>
                                <span className="q-steps-caption-eyebrow">STEP {stepNumber}</span>
                                <span className="q-steps-caption-title">{b.label}</span>
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                </div>
              </nav>

          <div
            className={
              "q-layout" + (currentStep?.kind === "profile-ready" ? " q-layout--profile-ready" : "")
            }
          >
            {/* Main question column */}
            <section className="q-main">
              <div className={`q-screen-inner q-phase-${phase}`} key={currentStep?.id}>
                <article
                  className={
                    currentStep?.kind === "profile-ready"
                      ? "q-card q-card--profileready"
                      : activeBlockId === "support"
                        ? "q-card q-card--withscene q-card--support-scene"
                        : "q-card q-card--withscene"
                  }
                >
                  {currentStep?.kind === "profile-ready" ? (
                    <>
                      <div className="q-card-body q-card-body--profile-ready">
                        {renderStepBody(currentStep)}
                      </div>
                      {message ? (
                        <p className="q-message" data-tone={messageTone} role="alert">{message}</p>
                      ) : null}
                    </>
                  ) : (
                    <div
                      className={
                        activeBlockId === "support"
                          ? "q-card-grid q-card-grid--support-scenes"
                          : "q-card-grid"
                      }
                    >
                      <header
                        className={`q-card-matrix-head${
                          activeBlockId === "support" ? " q-card-matrix-head--support" : ""
                        }`}
                        aria-label="Section navigation"
                      >
                        <div className="q-card-matrix-head-prev">
                          {currentStep?.kind !== "adhd-awareness" ? (
                            <button
                              type="button"
                              className="button ghost q-profile-prev-btn q-profile-prev-btn--matrix"
                              onClick={goBack}
                              disabled={safeStepIndex === 0}
                            >
                              <span className="q-profile-prev-icon" aria-hidden="true">←</span>
                              Previous step
                            </button>
                          ) : (
                            <Link
                              to="/"
                              className="button ghost q-profile-prev-btn q-profile-prev-btn--matrix"
                              aria-label="Back to home"
                            >
                              <span className="q-profile-prev-icon" aria-hidden="true">←</span>
                              Home
                            </Link>
                          )}
                        </div>
                        <div className="q-card-matrix-head-meta">
                          <span className="q-card-head-eyebrow">{activeBlock.label}</span>
                          {activeBlockSteps.length > 0 ? (
                            <span className="q-card-head-count" aria-live="polite">
                              Question {activeBlockStepIndex + 1} of {activeBlockSteps.length}
                            </span>
                          ) : null}
                        </div>
                      </header>

                      <div className="q-scene-col">
                        <QuizScene
                          blockId={activeBlockId}
                          stepKind={currentStep?.kind}
                          stepId={currentStep?.id}
                        />
                      </div>

                      <div className="q-card-col">
                        <div className="q-card-body">
                          {renderStepBody(currentStep)}
                          <div className="q-clear-row">
                            <button type="button" className="q-clear-link" onClick={() => setShowResetConfirmModal(true)}>
                              Clear all and start over
                            </button>
                          </div>
                        </div>

                        <div className="q-card-foot">
                          {message ? (
                            <p className="q-message" data-tone={messageTone} role="alert">{message}</p>
                          ) : null}
                          <div className="q-actions">
                            <button type="button" className="button secondary" onClick={saveAndExit}>
                              Save &amp; exit
                            </button>
                            <button type="button" className="button primary q-next" onClick={goNext}>
                              Next
                              <span className="q-next-arrow" aria-hidden="true">→</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </article>
              </div>
            </section>

            {/* Right rail: first question = short “how it works” (not the long question list). */}
            {currentStep?.kind === "adhd-awareness" ? (
              <aside className="q-sidepanel q-sidepanel--how-it-works" aria-label="How NeuroGuide works">
                <div className="q-how-it-works-card">
                  <h3 className="q-how-it-works-heading">How this works</h3>
                  <div className="q-how-it-works-steps" role="list">
                    <div className="q-how-it-works-tile q-how-it-works-tile--guide" role="listitem">
                      <span className="q-how-it-works-step-num" aria-hidden="true">
                        1
                      </span>
                      <span className="q-how-it-works-step-label">Setup your support preferences</span>
                    </div>
                    <div className="q-how-it-works-arrow" aria-hidden="true">
                      ↓
                    </div>
                    <div className="q-how-it-works-tile q-how-it-works-tile--spark" role="listitem">
                      <span className="q-how-it-works-step-num" aria-hidden="true">
                        2
                      </span>
                      <span className="q-how-it-works-step-label">Get simplified Job Description</span>
                    </div>
                    <div className="q-how-it-works-arrow" aria-hidden="true">
                      ↓
                    </div>
                    <div className="q-how-it-works-tile q-how-it-works-tile--score" role="listitem">
                      <span className="q-how-it-works-step-num" aria-hidden="true">
                        3
                      </span>
                      <span className="q-how-it-works-step-label">View your job match score based on your work style.</span>
                    </div>
                  </div>
                </div>
              </aside>
            ) : null}

            {currentStep?.kind !== "profile-ready" && currentStep?.kind !== "adhd-awareness" ? (
              <aside className="q-sidepanel" aria-label={`Questions in ${activeBlock.label}`}>
                <header className="q-sidepanel-head">
                  <h3 className="q-sidepanel-title">{activeBlock.label}</h3>
                  <span className="q-sidepanel-sub">
                    {activeBlockSteps.length} question{activeBlockSteps.length === 1 ? "" : "s"}
                  </span>
                </header>
                <ol className="q-sidepanel-list">
                  {activeBlockSteps.map((s, i) => {
                    const answered =
                      s.kind === "profile-ready"
                        ? state.completed
                        : isStepAnswered(s, state.answers);
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
            ) : null}
          </div>
        </main>
      )}

      {showResetConfirmModal ? (
        <div className="ng-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="ng-reset-title">
          <div className="ng-confirm-modal">
            <h2 id="ng-reset-title" className="ng-confirm-title">
              Start over?
            </h2>
            <p className="ng-confirm-text">
              This will delete your current profile answers and return you to the beginning.
            </p>
            <div className="ng-confirm-actions">
              <button
                type="button"
                className="ng-consent-btn ng-consent-btn--ghost"
                onClick={() => setShowResetConfirmModal(false)}
              >
                Cancel
              </button>
              <button type="button" className="ng-consent-btn ng-consent-btn--primary" onClick={confirmAndResetAll}>
                Yes, start over
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

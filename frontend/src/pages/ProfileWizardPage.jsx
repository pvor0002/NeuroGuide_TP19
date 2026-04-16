import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";

const STORAGE_KEY = "neuroguide.skillBackgroundSupportProfile.react.v1";
const MAX_VISIBLE_SKILL_RESULTS = 20;
const MAX_VISIBLE_ROLE_RESULTS = 18;
const MAX_SELECTED_ROLES = 3;

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
  "Best with afternoon deep work"
];
const WORK_STYLE_OPTIONS = [
  "Clear priorities",
  "Short tasks",
  "Visual workflow",
  "Low interruptions",
  "Collaborative team",
  "Quiet work blocks"
];
const SUPPORT_NEED_OPTIONS = [
  "Written instructions",
  "Calendar reminders",
  "Checklists",
  "Regular check-ins",
  "Flexible start time",
  "Noise-reduced space",
  "Task batching",
  "Break prompts"
];

const ROLE_KEYWORDS_FOR_BLUE_COLLAR = [
  "waiter",
  "barista",
  "cafe",
  "hospitality",
  "kitchen",
  "cleaner",
  "cleaning",
  "labour",
  "driver",
  "warehouse",
  "carpenter",
  "plumber",
  "mechanic",
  "retail"
];

const ROLE_SKILL_RULES = [
  {
    roleKeywords: ["farmer", "farming", "agriculture", "agricultural"],
    skillKeywords: ["crop", "harvest", "soil", "irrig", "livestock", "farm", "tractor", "pesticide"],
    presetSkills: [
      "Crop planning",
      "Irrigation management",
      "Soil preparation",
      "Harvest coordination",
      "Livestock care",
      "Farm equipment operation",
    ],
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
  }
];

const TRANSFERABLE_SKILL_KEYWORDS = [
  "communication",
  "team",
  "organis",
  "organization",
  "time management",
  "problem",
  "customer",
  "attention to detail",
  "planning",
  "safety"
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

  // Conservative fallback: only keep explicit overlap between role words and skill labels.
  const roleWords = roleText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const overlap = skillTags.filter((skill) => {
    const lower = skill.toLowerCase();
    return roleWords.some((word) => lower.includes(word));
  });
  if (overlap.length > 0) return [...new Set(overlap)].slice(0, 12);

  // Final fallback: always provide core transferable skills so auto-populate never stays empty.
  const transferable = skillTags.filter((skill) => {
    const lower = skill.toLowerCase();
    return TRANSFERABLE_SKILL_KEYWORDS.some((kw) => lower.includes(kw));
  });
  if (transferable.length > 0) return [...new Set(transferable)].slice(0, 8);

  // Absolute fallback: deterministic first page of taxonomy skills.
  return skillTags.slice(0, 8);
}

const SECTION_ICONS = {
  background: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <path d="M9 5v3M15 5v3" />
    </svg>
  ),
  time: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h7l7 7-6 6-7-7z" />
      <circle cx="9" cy="10" r="1.4" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l7 3v5c0 4.2-2.6 7.2-7 8-4.4-.8-7-3.8-7-8V7z" />
      <path d="m9.5 12.5 1.8 1.8 3.5-3.5" />
    </svg>
  )
};

/** Decorative shapes (same motif as Simplify job description hero). */
function HeroPaperShapes() {
  return (
    <div className="simplify-hero-shapes" aria-hidden="true">
      <svg className="simplify-shape-svg" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
        <path
          fill="#c4e0c8"
          opacity="0.95"
          d="M40 120c20-50 80-90 140-70s80 70 50 120-90 50-140 20-70-60-50-70z"
        />
        <path
          fill="#e8b4a0"
          opacity="0.88"
          d="M120 40c45 8 85 50 75 100s-55 70-100 55-65-45-55-90 25-70 80-65z"
        />
        <circle cx="175" cy="55" r="18" fill="#d4a574" opacity="0.75" />
      </svg>
    </div>
  );
}

/**
 * Returns default profile state for first launch and reset.
 *
 * @returns {object} Default app state.
 */
function getDefaultState() {
  return {
    currentStepIndex: 0,
    visitedStepIndices: [0],
    completed: false,
    viewMode: "wizard",
    answers: {
      selectedRoles: [],
      roleSearchQuery: "",
      roleExperience: {},
      roleDuration: {},
      energyPatterns: [],
      selectedSkills: [],
      autoSelectedSkills: [],
      skillSearchQuery: "",
      removedAutoSkills: [],
      workStyles: [],
      adhdProfileType: "",
      supportNeeds: []
    }
  };
}

/**
 * Validates and normalizes local storage payload.
 *
 * @returns {object} Safe recovered state.
 */
function loadPersistedState() {
  const fallback = getDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.answers !== "object") {
      return fallback;
    }

    const toArray = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : []);
    const toText = (value) => (typeof value === "string" ? value : "");
    const toRecord = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
    const persistedAnswers = { ...parsed.answers };
    delete persistedAnswers.optionalNotes;

    return {
      ...fallback,
      ...parsed,
      currentStepIndex: Number.isInteger(parsed.currentStepIndex) ? parsed.currentStepIndex : 0,
      visitedStepIndices: Array.isArray(parsed.visitedStepIndices)
        ? parsed.visitedStepIndices.filter((idx) => Number.isInteger(idx) && idx >= 0)
        : [0],
      completed: Boolean(parsed.completed),
      viewMode: parsed.viewMode === "overview" ? "overview" : "wizard",
      answers: {
        ...fallback.answers,
        ...persistedAnswers,
        selectedRoles: toArray(parsed.answers.selectedRoles),
        roleSearchQuery: toText(parsed.answers.roleSearchQuery),
        roleExperience: toRecord(parsed.answers.roleExperience),
        roleDuration: toRecord(parsed.answers.roleDuration),
        energyPatterns: toArray(parsed.answers.energyPatterns).slice(0, 2),
        selectedSkills: toArray(parsed.answers.selectedSkills),
        autoSelectedSkills: toArray(parsed.answers.autoSelectedSkills),
        skillSearchQuery: toText(parsed.answers.skillSearchQuery),
        removedAutoSkills: toArray(parsed.answers.removedAutoSkills),
        workStyles: toArray(parsed.answers.workStyles),
        adhdProfileType: toText(parsed.answers.adhdProfileType),
        supportNeeds: toArray(parsed.answers.supportNeeds)
      }
    };
  } catch {
    return fallback;
  }
}

/**
 * Validates a single step and returns a message when invalid.
 *
 * @param {number} stepIndex - Current step index.
 * @param {object} answers - Current answer model.
 * @returns {string|null} Validation message or null.
 */
function validateStep(stepId, answers) {
  if (stepId === "support") {
    if (!answers.adhdProfileType) return "Choose ADHD profile type.";
    if (answers.workStyles.length === 0) return "Select work style.";
    if (answers.supportNeeds.length === 0) return "Select support preferences.";
    return null;
  }
  if (stepId === "background") {
    if (answers.selectedRoles.length === 0) return "Select at least one role.";
    if (answers.selectedRoles.length > MAX_SELECTED_ROLES) return `You can select up to ${MAX_SELECTED_ROLES} roles.`;
    const missingLevel = answers.selectedRoles.find((role) => !answers.roleExperience?.[role]);
    if (missingLevel) return "Set an experience level for each selected role.";
    const missingDuration = answers.selectedRoles.find((role) => !answers.roleDuration?.[role]);
    if (missingDuration) return "Set how long you have done each selected role.";
    return null;
  }
  if (stepId === "time") {
    if (!answers.energyPatterns || answers.energyPatterns.length === 0) return "Select at least one preferred rhythm.";
    if (answers.energyPatterns.length > 2) return "Select up to 2 preferred rhythms.";
    return null;
  }
  if (stepId === "skills") {
    if (answers.selectedSkills.length === 0) return "Select at least one skill.";
    return null;
  }
  return null;
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
      const [rolesRes, skillsRes] = await Promise.all([
        fetch("/au-role-taxonomy.json"),
        fetch("/au-skills-taxonomy.json")
      ]);
      const roles = rolesRes.ok ? await rolesRes.json() : [];
      const skills = skillsRes.ok ? await skillsRes.json() : [];
      setRoleTags(Array.isArray(roles) ? roles : []);
      setSkillTags(Array.isArray(skills) ? skills : []);
    }
    loadTaxonomy();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

  const steps = [
    { id: "support", title: "Step 1: Support Setup", subtitle: "Choose ADHD profile, work style, and supports." },
    { id: "background", title: "Step 2: Your Background", subtitle: "What roles have you done, and at what level?" },
    { id: "skills", title: "Step 3: Skills", subtitle: "Which skills fit your role experience?" },
    { id: "time", title: "Step 4: Time and Energy", subtitle: "When do you do your best work?" }
  ];

  const currentStep = steps[state.currentStepIndex];
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
          answers: {
            ...prev.answers,
            autoSelectedSkills: nextAuto,
            selectedSkills: nextSelected,
          },
        };
      });
    });
  }, [autoSuggestedSkills, state.answers.selectedRoles]);

  /**
   * Updates nested answer fields in one immutable state update.
   *
   * @param {string} field - Answer key.
   * @param {string|Array<string>} value - New field value.
   * @returns {void}
   */
  const setAnswer = (field, value) =>
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [field]: value } }));

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

  /**
   * Toggles multi-select value in array-based answer field.
   *
   * @param {string} field - Target array field.
   * @param {string} value - Candidate option value.
   * @returns {void}
   */
  const toggleMulti = (field, value) => {
    setState((prev) => {
      const values = prev.answers[field];
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...prev, answers: { ...prev.answers, [field]: next } };
    });
  };

  const toggleRole = (role) => {
    setState((prev) => {
      const current = prev.answers.selectedRoles;
      const alreadySelected = current.includes(role);
      if (!alreadySelected && current.length >= MAX_SELECTED_ROLES) {
        setMessage(`You can add up to ${MAX_SELECTED_ROLES} roles.`);
        setMessageTone("error");
        return prev;
      }
      const nextRoles = alreadySelected ? current.filter((item) => item !== role) : [...current, role];
      const nextRoleExperience = { ...prev.answers.roleExperience };
      const nextRoleDuration = { ...prev.answers.roleDuration };
      if (alreadySelected) {
        delete nextRoleExperience[role];
        delete nextRoleDuration[role];
      }
      const manualSkills = prev.answers.selectedSkills.filter((skill) => !prev.answers.autoSelectedSkills.includes(skill));
      return {
        ...prev,
        answers: {
          ...prev.answers,
          selectedRoles: nextRoles,
          roleExperience: nextRoleExperience,
          roleDuration: nextRoleDuration,
          selectedSkills: manualSkills,
          autoSelectedSkills: [],
          removedAutoSkills: [],
        },
      };
    });
  };

  const addSkill = (raw) => {
    const skill = String(raw ?? "").trim();
    if (!skill) return;
    setState((prev) => {
      if (prev.answers.selectedSkills.includes(skill)) {
        return { ...prev, answers: { ...prev.answers, skillSearchQuery: "" } };
      }
      return {
        ...prev,
        answers: {
          ...prev.answers,
          selectedSkills: prev.answers.selectedSkills.includes(skill) ? prev.answers.selectedSkills : [...prev.answers.selectedSkills, skill],
          autoSelectedSkills: prev.answers.autoSelectedSkills.filter((item) => item !== skill),
          removedAutoSkills: prev.answers.removedAutoSkills.filter((item) => item !== skill),
          skillSearchQuery: "",
        },
      };
    });
  };

  const removeSkill = (skill) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        selectedSkills: prev.answers.selectedSkills.filter((item) => item !== skill),
        autoSelectedSkills: prev.answers.autoSelectedSkills.filter((item) => item !== skill),
        removedAutoSkills: prev.answers.removedAutoSkills.includes(skill)
          ? prev.answers.removedAutoSkills
          : [...prev.answers.removedAutoSkills, skill],
      },
    }));
  };

  /**
   * Toggles a single-select string field.
   *
   * @param {string} field - Target field name.
   * @param {string} value - Selected option value.
   * @returns {void}
   */
  const toggleSingle = (field, value) => setAnswer(field, state.answers[field] === value ? "" : value);

  const toggleEnergyPattern = (value) => {
    setState((prev) => {
      const current = prev.answers.energyPatterns || [];
      const alreadySelected = current.includes(value);
      if (alreadySelected) {
        return { ...prev, answers: { ...prev.answers, energyPatterns: current.filter((item) => item !== value) } };
      }
      if (current.length >= 2) return prev;
      return { ...prev, answers: { ...prev.answers, energyPatterns: [...current, value] } };
    });
  };

  const nextStep = () => {
    const err = validateStep(currentStep.id, state.answers);
    if (err) {
      setMessage(err);
      setMessageTone("error");
      return;
    }
    setMessage("");
    if (state.currentStepIndex < steps.length - 1) {
      setState((prev) => {
        const nextIndex = prev.currentStepIndex + 1;
        const visited = prev.visitedStepIndices.includes(nextIndex)
          ? prev.visitedStepIndices
          : [...prev.visitedStepIndices, nextIndex];
        return { ...prev, currentStepIndex: nextIndex, visitedStepIndices: visited };
      });
      return;
    }
    setState((prev) => ({ ...prev, completed: true, viewMode: "overview" }));
  };

  const saveAndExit = () => {
    setState((prev) => ({ ...prev, viewMode: "overview" }));
    setMessage("Progress saved.");
    setMessageTone("info");
  };

  const sectionLabel = (label, filled) => <p className={`micro-label ${filled ? "is-filled" : ""}`}>{label}</p>;

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
                <button type="button" className="tag-remove-button" onClick={() => toggleRole(tag)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={state.answers.roleSearchQuery}
            onChange={(e) => setAnswer("roleSearchQuery", e.target.value)}
            placeholder="Type to add up to 5 roles..."
          />
        </div>
        <p className="role-limit-note">
          {selectedValues.length}/{MAX_SELECTED_ROLES} roles selected
        </p>
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
    const hasExact = selectedValues.some((item) => item.toLowerCase() === query.toLowerCase()) ||
      visible.some((item) => item.toLowerCase() === query.toLowerCase());

    return (
      <>
        <div className="tag-input-wrap">
          <div className="selected-tag-list">
            {selectedValues.map((tag) => (
              <span key={tag} className="selected-tag">
                {tag}
                <button type="button" className="tag-remove-button" onClick={() => removeSkill(tag)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={state.answers.skillSearchQuery}
            onChange={(e) => setAnswer("skillSearchQuery", e.target.value)}
            placeholder="Type a skill keyword..."
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

  const renderChips = (field, options, mode) => (
    <div className="chip-grid">
      {options.map((option) => {
        const selected = mode === "multi" ? state.answers[field].includes(option) : state.answers[field] === option;
        return (
          <button
            key={option}
            type="button"
            className={`choice-chip ${selected ? "is-selected" : ""}`}
            onClick={() => (mode === "multi" ? toggleMulti(field, option) : toggleSingle(field, option))}
          >
            {option}
          </button>
        );
      })}
    </div>
  );

  const renderEnergyPatternCheckboxes = () => (
    <div className="energy-check-grid" role="group" aria-label="Energy pattern options">
      {ENERGY_PATTERN_OPTIONS.map((option) => {
        const selected = (state.answers.energyPatterns || []).includes(option);
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
  );

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
    setMessage("");
  };

  const summarySections = [
    {
      id: "support",
      title: "Step 1: Support Setup",
      rows: [
        { key: "ADHD type", value: state.answers.adhdProfileType || "-" },
        { key: "Work style", value: state.answers.workStyles.join(", ") || "-" },
        { key: "Support", value: state.answers.supportNeeds.join(", ") || "-" }
      ]
    },
    {
      id: "background",
      title: "Step 2: Your Background",
      rows: [
        {
          key: "Role(s)",
          value:
            state.answers.selectedRoles
              .map(
                (role) =>
                  `${role} (${state.answers.roleExperience?.[role] || "Level not set"}, ${
                    state.answers.roleDuration?.[role] || "Duration not set"
                  })`
              )
              .join(", ") || "-",
        }
      ]
    },
    {
      id: "skills",
      title: "Step 3: Skills",
      rows: [
        { key: "Skills", value: state.answers.selectedSkills.join(", ") || "-" }
      ]
    },
    {
      id: "time",
      title: "Step 4: Time and Energy",
      rows: [
        { key: "Rhythm", value: (state.answers.energyPatterns || []).join(", ") || "-" }
      ]
    }
  ];

  const previewRows = [
    { label: "ADHD type", value: state.answers.adhdProfileType || "-" },
    { label: "Work style", value: state.answers.workStyles.join(", ") || "-" },
    { label: "Supports", value: state.answers.supportNeeds.join(", ") || "-" },
    {
      label: "Roles",
      value:
        state.answers.selectedRoles
          .map((role) => `${role} (${state.answers.roleDuration?.[role] || "-"}, ${state.answers.roleExperience?.[role] || "-"})`)
          .join(", ") || "-",
    },
    { label: "Energy rhythm", value: (state.answers.energyPatterns || []).join(", ") || "-" },
    { label: "Skills", value: state.answers.selectedSkills.join(", ") || "-" },
  ];

  return (
    <div className="profile-app">
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
            <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>
              Home
            </Link>
            <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined}>
              Profile builder
            </Link>
            <Link
              to="/simplify-job-description"
              aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined}
            >
              Simplify Job Description
            </Link>
          </nav>
        </div>
      </header>

      <header className="simplify-hero" aria-labelledby="intro-heading">
        <div className="simplify-hero-grid">
          <div className="simplify-hero-copy">
            <p className="simplify-hero-eyebrow">Short prompts, deliberate choices</p>
            <h1 id="intro-heading" className="simplify-hero-title">
              Turn scattered experience into a profile that reads cleanly on the page.
            </h1>
            <p className="simplify-hero-lead">
              Layer roles, skills and support preferences in quick steps - then carry the result into suitability
              scores and interview prep.
            </p>
            <Link to="/" className="simplify-hero-back">
              ← Back home
            </Link>
          </div>
          <HeroPaperShapes />
        </div>
      </header>

      <main className="app-shell">
        <div className={`wizard-layout ${state.viewMode === "overview" ? "overview-mode" : ""}`}>
          {state.viewMode === "wizard" && (
            <section className="progress-topbar" aria-label="Progress">
              <h2 className="progress-inline-title">
                Progress{" "}
                <span className="progress-text">
                  {state.currentStepIndex + 1}/{steps.length}
                </span>
              </h2>
              <ol className="progress-list">
                {steps.map((step, idx) => {
                  const done = state.visitedStepIndices.includes(idx) && validateStep(step.id, state.answers) === null;
                  return (
                    <li key={step.title} className={`progress-item ${idx === state.currentStepIndex ? "is-active" : ""} ${done ? "is-done" : ""}`}>
                      <button
                        type="button"
                        className="progress-step-button"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            currentStepIndex: idx,
                            visitedStepIndices: p.visitedStepIndices.includes(idx)
                              ? p.visitedStepIndices
                              : [...p.visitedStepIndices, idx],
                          }))
                        }
                      >
                        <span className="progress-step-top" aria-hidden="true">
                          <span className="progress-step-dot">{done ? "✓" : idx + 1}</span>
                          {idx < steps.length - 1 ? <span className="progress-step-link" /> : null}
                        </span>
                        <span className="progress-step-copy">
                          <span className="progress-step-kicker">Step {idx + 1}</span>
                          <span className="progress-step-title">{step.title.replace(/^Step \d+:\s*/, "")}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {state.viewMode === "wizard" && (
            <div className="wizard-main-grid">
              <section className="wizard-card">
                <h2 className="step-title">{currentStep.title}</h2>
                <p className="step-description">{currentStep.subtitle}</p>

                <div className="step-content">
                {currentStep.id === "support" && (
                  <>
                    <section className="group-card">
                      {sectionLabel("Pick your ADHD profile", Boolean(state.answers.adhdProfileType))}
                      <select
                        value={state.answers.adhdProfileType}
                        onChange={(e) => setAnswer("adhdProfileType", e.target.value)}
                      >
                        <option value="">Select</option>
                        <option value="inattentive">Inattentive</option>
                        <option value="hyperactive-impulsive">Hyperactive-Impulsive</option>
                        <option value="combined">Combined</option>
                      </select>
                    </section>
                    <section className="group-card support-step-theme">
                      {sectionLabel("Choose your best work style", state.answers.workStyles.length > 0)}
                      {renderChips("workStyles", WORK_STYLE_OPTIONS, "multi")}
                    </section>
                    <section className="group-card support-step-theme">
                      {sectionLabel("Choose supports that help you", state.answers.supportNeeds.length > 0)}
                      {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, "multi")}
                    </section>
                  </>
                )}

                {currentStep.id === "background" && (
                  <>
                    <section className="group-card roles-step-theme">
                      {sectionLabel("What roles have you worked in?", state.answers.selectedRoles.length > 0)}
                      {renderRoleSelector()}
                    </section>
                    <section className="group-card">
                      {sectionLabel(
                        "Set your experience level for each selected role",
                        state.answers.selectedRoles.length > 0 &&
                          state.answers.selectedRoles.every(
                            (role) => Boolean(state.answers.roleExperience?.[role]) && Boolean(state.answers.roleDuration?.[role])
                          ),
                      )}
                      {state.answers.selectedRoles.length === 0 ? (
                        <p className="role-level-empty">Add role(s) above to unlock your level-up cards.</p>
                      ) : (
                        <div className="role-level-grid">
                          {state.answers.selectedRoles.map((role, idx) => (
                            <article key={role} className="role-level-card">
                              <p className="role-level-order">Role {idx + 1}</p>
                              <h3 className="role-level-title">{role}</h3>
                              <p className="role-level-subtitle">How long have you done this role?</p>
                              <div className="chip-grid role-duration-grid">
                                {DURATION_OPTIONS.map((duration) => {
                                  const selected = state.answers.roleDuration?.[role] === duration;
                                  return (
                                    <button
                                      key={`${role}-${duration}`}
                                      type="button"
                                      className={`choice-chip ${selected ? "is-selected" : ""}`}
                                      onClick={() => setRoleDuration(role, duration)}
                                    >
                                      {duration}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="role-level-subtitle">What is your experience level in this role?</p>
                              <div className="chip-grid">
                                {EXPERIENCE_LEVEL_OPTIONS.map((level) => {
                                  const selected = state.answers.roleExperience?.[role] === level;
                                  return (
                                    <button
                                      key={`${role}-${level}`}
                                      type="button"
                                      className={`choice-chip ${selected ? "is-selected" : ""}`}
                                      onClick={() => setRoleExperience(role, level)}
                                    >
                                      {level}
                                    </button>
                                  );
                                })}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}

                {currentStep.id === "time" && (
                  <>
                    <section className="group-card time-step-theme">
                      {sectionLabel("What rhythm helps you most?", (state.answers.energyPatterns || []).length > 0)}
                      {renderEnergyPatternCheckboxes()}
                    </section>
                  </>
                )}

                {currentStep.id === "skills" && (
                  <>
                    <section className="group-card skills-step-theme">
                      {sectionLabel("Skills auto-added from selected roles (you can edit)", state.answers.selectedSkills.length > 0)}
                      {renderSkillSelector()}
                    </section>
                  </>
                )}
                </div>

                <p className="error-message" data-tone={messageTone}>
                  {message}
                </p>

                <div className="button-row">
                  <button type="button" className="button ghost button-clear-all" onClick={resetAll}>
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={state.currentStepIndex === 0}
                    onClick={() =>
                      setState((p) => {
                        const nextIndex = Math.max(0, p.currentStepIndex - 1);
                        const visited = p.visitedStepIndices.includes(nextIndex)
                          ? p.visitedStepIndices
                          : [...p.visitedStepIndices, nextIndex];
                        return { ...p, currentStepIndex: nextIndex, visitedStepIndices: visited };
                      })
                    }
                  >
                    Back
                  </button>
                  <button type="button" className="button secondary" onClick={saveAndExit}>
                    Save & Exit
                  </button>
                  <button type="button" className="button primary" onClick={nextStep}>
                    {state.currentStepIndex === steps.length - 1 ? "Finish" : "Next"}
                  </button>
                </div>
              </section>
              <aside className="profile-preview-card" aria-live="polite">
                <div className="profile-preview-header">
                  <div className="profile-preview-avatar" aria-hidden="true">
                    NG
                  </div>
                  <div className="profile-preview-headcopy">
                    <h3 className="profile-preview-title">Live profile preview</h3>
                    <p className="profile-preview-subtitle">Dashboard view of your profile progress</p>
                  </div>
                </div>
                <ul className="profile-preview-list">
                  {previewRows.map((row) => (
                    <li key={row.label} className="profile-preview-item">
                      <span className="profile-preview-key">{row.label}</span>
                      <span className="profile-preview-value">{row.value}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          )}

          {state.viewMode === "overview" && (
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
                {summarySections.map((section, index) => (
                  <article key={section.title} className="summary-block">
                    <span className="summary-icon">{SECTION_ICONS[section.id]}</span>
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
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          viewMode: "wizard",
                          currentStepIndex: index,
                          visitedStepIndices: prev.visitedStepIndices.includes(index)
                            ? prev.visitedStepIndices
                            : [...prev.visitedStepIndices, index],
                        }))
                      }
                    >
                      Edit this step
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
                  <p className="error-message" data-tone="info">
                    Functionality part of iteration 3 development
                  </p>
                ) : null}
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setState((prev) => ({ ...prev, viewMode: "wizard" }))}
                >
                  Continue Editing
                </button>
                <button type="button" className="button secondary" onClick={resetAll}>
                  Start Over
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

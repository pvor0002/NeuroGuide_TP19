import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";

const STORAGE_KEY = "neuroguide.skillBackgroundSupportProfile.react.v1";
const MAX_VISIBLE_SKILL_RESULTS = 20;
const MAX_VISIBLE_ROLE_RESULTS = 18;
const MAX_VISIBLE_TOOLS = 18;

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

const BASE_TOOLS = [
  "Google Sheets",
  "Microsoft Excel",
  "Microsoft Teams",
  "Slack",
  "Trello",
  "Notion",
  "Canva",
  "Jira"
];

const TOOL_MAP_BY_ROLE = [
  {
    keywords: ["waiter", "barista", "cafe", "restaurant", "hospitality", "kitchen"],
    tools: ["Square POS", "Lightspeed POS", "Toast POS", "OpenTable", "Deputy"]
  },
  {
    keywords: ["customer service", "call", "contact centre", "reception"],
    tools: ["ServiceNow", "Zendesk", "Salesforce Service Cloud", "Freshdesk", "HubSpot CRM"]
  },
  {
    keywords: ["cleaner", "cleaning", "housekeeper", "commercial cleaner"],
    tools: ["Deputy", "Tanda", "SafetyCulture iAuditor", "Google Keep Checklists"]
  },
  {
    keywords: ["retail", "checkout", "sales assistant", "storeperson"],
    tools: ["Square POS", "Shopify POS", "Vend POS", "Cin7", "MYOB"]
  },
  {
    keywords: ["warehouse", "logistics", "truck", "delivery", "forklift"],
    tools: ["SAP EWM", "Fishbowl Inventory", "Unleashed", "Samsara", "GeoOp"]
  },
  {
    keywords: ["software", "ict", "developer", "programmer", "it support"],
    tools: ["GitHub", "VS Code", "Jira", "Postman", "ServiceNow"]
  }
];

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
    completed: false,
    viewMode: "wizard",
    answers: {
      selectedRoles: [],
      roleSearchQuery: "",
      experienceLevel: "",
      durationBand: "",
      energyPattern: "",
      selectedSkills: [],
      skillSearchQuery: "",
      selectedTools: [],
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
    const persistedAnswers = { ...parsed.answers };
    delete persistedAnswers.optionalNotes;

    return {
      ...fallback,
      ...parsed,
      currentStepIndex: Number.isInteger(parsed.currentStepIndex) ? parsed.currentStepIndex : 0,
      completed: Boolean(parsed.completed),
      viewMode: parsed.viewMode === "overview" ? "overview" : "wizard",
      answers: {
        ...fallback.answers,
        ...persistedAnswers,
        selectedRoles: toArray(parsed.answers.selectedRoles),
        roleSearchQuery: toText(parsed.answers.roleSearchQuery),
        experienceLevel: toText(parsed.answers.experienceLevel),
        durationBand: toText(parsed.answers.durationBand),
        energyPattern: toText(parsed.answers.energyPattern),
        selectedSkills: toArray(parsed.answers.selectedSkills),
        skillSearchQuery: toText(parsed.answers.skillSearchQuery),
        selectedTools: toArray(parsed.answers.selectedTools),
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
 * Returns role-context tool recommendations.
 *
 * @param {object} answers - Current answer model.
 * @returns {string[]} Unique tools list.
 */
function getRoleBasedToolSuggestions(answers) {
  const roleText = [...answers.selectedRoles].join(" ").toLowerCase();
  const matched = [];
  for (const rule of TOOL_MAP_BY_ROLE) {
    if (rule.keywords.some((keyword) => roleText.includes(keyword))) {
      matched.push(...rule.tools);
    }
  }
  return [...new Set([...matched, ...BASE_TOOLS])].slice(0, MAX_VISIBLE_TOOLS);
}

/**
 * Validates a single step and returns a message when invalid.
 *
 * @param {number} stepIndex - Current step index.
 * @param {object} answers - Current answer model.
 * @returns {string|null} Validation message or null.
 */
function validateStep(stepIndex, answers) {
  if (stepIndex === 0) {
    if (answers.selectedRoles.length === 0) return "Select at least one role.";
    if (!answers.experienceLevel) return "Choose experience level.";
    return null;
  }
  if (stepIndex === 1) {
    if (!answers.durationBand) return "Select duration.";
    if (!answers.energyPattern) return "Select preferred rhythm.";
    return null;
  }
  if (stepIndex === 2) {
    if (answers.selectedSkills.length === 0) return "Select at least one skill.";
    if (answers.selectedTools.length === 0) return "Select at least one tool.";
    return null;
  }
  if (!answers.adhdProfileType) return "Choose ADHD profile type.";
  if (answers.workStyles.length === 0) return "Select work style.";
  if (answers.supportNeeds.length === 0) return "Select support preferences.";
  return null;
}

export default function ProfileWizardPage() {
  const [roleTags, setRoleTags] = useState([]);
  const [skillTags, setSkillTags] = useState([]);
  const [state, setState] = useState(loadPersistedState);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("error");
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);

  useEffect(() => {
    setBrandFlowerActive(false);
    const id = requestAnimationFrame(() => {
      setBrandFlowerActive(true);
    });
    return () => cancelAnimationFrame(id);
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

  const toolOptions = useMemo(() => getRoleBasedToolSuggestions(state.answers), [state.answers]);

  const steps = [
    { title: "Step 1: Your Background", subtitle: "Search role first, then choose level." },
    { title: "Step 2: Time and Energy", subtitle: "Quick choices only." },
    { title: "Step 3: Skills and Tools", subtitle: "Search by keyword and choose relevant tools." },
    { title: "Step 4: Support Setup", subtitle: "Choose ADHD profile, work style, and supports." }
  ];

  const currentStep = steps[state.currentStepIndex];
  const progressPercent = Math.round(((state.currentStepIndex + 1) / steps.length) * 100);

  /**
   * Updates nested answer fields in one immutable state update.
   *
   * @param {string} field - Answer key.
   * @param {string|Array<string>} value - New field value.
   * @returns {void}
   */
  const setAnswer = (field, value) =>
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [field]: value } }));

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

  /**
   * Toggles a single-select string field.
   *
   * @param {string} field - Target field name.
   * @param {string} value - Selected option value.
   * @returns {void}
   */
  const toggleSingle = (field, value) => setAnswer(field, state.answers[field] === value ? "" : value);

  const nextStep = () => {
    const err = validateStep(state.currentStepIndex, state.answers);
    if (err) {
      setMessage(err);
      setMessageTone("error");
      return;
    }
    setMessage("");
    if (state.currentStepIndex < steps.length - 1) {
      setState((prev) => ({ ...prev, currentStepIndex: prev.currentStepIndex + 1 }));
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

  const renderTagSearch = (field, queryField, options, placeholder) => {
    const selectedValues = state.answers[field];
    const visible = options.filter((item) => !selectedValues.includes(item));
    return (
      <>
        <div className="tag-input-wrap">
          <div className="selected-tag-list">
            {selectedValues.map((tag) => (
              <span key={tag} className="selected-tag">
                {tag}
                <button type="button" className="tag-remove-button" onClick={() => toggleMulti(field, tag)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={state.answers[queryField]}
            onChange={(e) => setAnswer(queryField, e.target.value)}
            placeholder={placeholder}
          />
        </div>
        <div className="suggestion-list">
          {visible.length === 0 ? (
            <div className="suggestion-empty">No matching keywords</div>
          ) : (
            visible.map((item) => (
              <button key={item} type="button" className="suggestion-row" onClick={() => toggleMulti(field, item)}>
                <span>{item}</span>
              </button>
            ))
          )}
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

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(getDefaultState());
    setMessage("");
  };

  const summarySections = [
    {
      id: "background",
      title: steps[0].title,
      rows: [
        { key: "Role(s)", value: state.answers.selectedRoles.join(", ") || "-" },
        { key: "Level", value: state.answers.experienceLevel || "-" }
      ]
    },
    {
      id: "time",
      title: steps[1].title,
      rows: [
        { key: "Duration", value: state.answers.durationBand || "-" },
        { key: "Rhythm", value: state.answers.energyPattern || "-" }
      ]
    },
    {
      id: "skills",
      title: steps[2].title,
      rows: [
        { key: "Skills", value: state.answers.selectedSkills.join(", ") || "-" },
        { key: "Tools", value: state.answers.selectedTools.join(", ") || "-" }
      ]
    },
    {
      id: "support",
      title: steps[3].title,
      rows: [
        { key: "ADHD type", value: state.answers.adhdProfileType || "-" },
        { key: "Work style", value: state.answers.workStyles.join(", ") || "-" },
        { key: "Support", value: state.answers.supportNeeds.join(", ") || "-" }
      ]
    }
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
            <Link to="/">Home</Link>
            <Link to="/simplify-job-description">Simplify job description</Link>
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
            <aside className="progress-sidebar">
              <h2>Progress</h2>
              <p className="progress-text">
                {state.currentStepIndex + 1}/{steps.length}
              </p>
              <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <ol className="progress-list">
                {steps.map((step, idx) => {
                  const done = validateStep(idx, state.answers) === null;
                  return (
                    <li key={step.title} className={`progress-item ${idx === state.currentStepIndex ? "is-active" : ""} ${done ? "is-done" : ""}`}>
                      <button type="button" className="progress-step-button" onClick={() => setState((p) => ({ ...p, currentStepIndex: idx }))}>
                        Step {idx + 1}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          )}

          {state.viewMode === "wizard" && (
            <section className="wizard-card">
              <h2 className="step-title">{currentStep.title}</h2>
              <p className="step-description">{currentStep.subtitle}</p>

              <div className="step-content">
                {state.currentStepIndex === 0 && (
                  <>
                    <section className="group-card">
                      {sectionLabel("Search role", state.answers.selectedRoles.length > 0)}
                      {renderTagSearch(
                        "selectedRoles",
                        "roleSearchQuery",
                        roleOptions,
                        "e.g. waiter, cleaner, barista, customer service"
                      )}
                    </section>
                    <section className="group-card">
                      {sectionLabel("Experience level", Boolean(state.answers.experienceLevel))}
                      {renderChips("experienceLevel", EXPERIENCE_LEVEL_OPTIONS, "single")}
                    </section>
                  </>
                )}

                {state.currentStepIndex === 1 && (
                  <>
                    <section className="group-card">
                      {sectionLabel("How long have you done this work?", Boolean(state.answers.durationBand))}
                      {renderChips("durationBand", DURATION_OPTIONS, "single")}
                    </section>
                    <section className="group-card">
                      {sectionLabel("What rhythm helps you most?", Boolean(state.answers.energyPattern))}
                      {renderChips("energyPattern", ENERGY_PATTERN_OPTIONS, "single")}
                    </section>
                  </>
                )}

                {state.currentStepIndex === 2 && (
                  <>
                    <section className="group-card">
                      {sectionLabel("Search skill", state.answers.selectedSkills.length > 0)}
                      {renderTagSearch(
                        "selectedSkills",
                        "skillSearchQuery",
                        skillOptions,
                        "e.g. service, communication, planning"
                      )}
                    </section>
                    <section className="group-card">
                      {sectionLabel("Tools (based on role type)", state.answers.selectedTools.length > 0)}
                      {renderChips("selectedTools", toolOptions, "multi")}
                    </section>
                  </>
                )}

                {state.currentStepIndex === 3 && (
                  <>
                    <section className="group-card">
                      {sectionLabel("ADHD profile type", Boolean(state.answers.adhdProfileType))}
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
                    <section className="group-card">
                      {sectionLabel("Work style", state.answers.workStyles.length > 0)}
                      {renderChips("workStyles", WORK_STYLE_OPTIONS, "multi")}
                    </section>
                    <section className="group-card">
                      {sectionLabel("Support that helps", state.answers.supportNeeds.length > 0)}
                      {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, "multi")}
                    </section>
                  </>
                )}
              </div>

              <p className="error-message" data-tone={messageTone}>
                {message}
              </p>

              <div className="button-row">
                <button
                  type="button"
                  className="button ghost"
                  disabled={state.currentStepIndex === 0}
                  onClick={() => setState((p) => ({ ...p, currentStepIndex: Math.max(0, p.currentStepIndex - 1) }))}
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
                      onClick={() => setState((prev) => ({ ...prev, viewMode: "wizard", currentStepIndex: index }))}
                    >
                      Edit this step
                    </button>
                  </article>
                ))}
              </div>
              <div className="button-row">
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

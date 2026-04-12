import { useEffect, useMemo, useState } from "react";

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
      preferredRoles: [],
      workStyles: [],
      adhdProfileType: "",
      supportNeeds: [],
      optionalNotes: ""
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

    return {
      ...fallback,
      ...parsed,
      currentStepIndex: Number.isInteger(parsed.currentStepIndex) ? parsed.currentStepIndex : 0,
      completed: Boolean(parsed.completed),
      viewMode: parsed.viewMode === "overview" ? "overview" : "wizard",
      answers: {
        ...fallback.answers,
        ...parsed.answers,
        selectedRoles: toArray(parsed.answers.selectedRoles),
        roleSearchQuery: toText(parsed.answers.roleSearchQuery),
        experienceLevel: toText(parsed.answers.experienceLevel),
        durationBand: toText(parsed.answers.durationBand),
        energyPattern: toText(parsed.answers.energyPattern),
        selectedSkills: toArray(parsed.answers.selectedSkills),
        skillSearchQuery: toText(parsed.answers.skillSearchQuery),
        selectedTools: toArray(parsed.answers.selectedTools),
        preferredRoles: toArray(parsed.answers.preferredRoles),
        workStyles: toArray(parsed.answers.workStyles),
        adhdProfileType: toText(parsed.answers.adhdProfileType),
        supportNeeds: toArray(parsed.answers.supportNeeds),
        optionalNotes: toText(parsed.answers.optionalNotes)
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
  const roleText = [...answers.selectedRoles, ...answers.preferredRoles].join(" ").toLowerCase();
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
  if (stepIndex === 3) {
    if (answers.preferredRoles.length === 0) return "Select role target.";
    if (answers.workStyles.length === 0) return "Select work style.";
    return null;
  }
  if (!answers.adhdProfileType) return "Choose ADHD profile type.";
  if (answers.supportNeeds.length === 0) return "Select support preferences.";
  return null;
}

function App() {
  const [roleTags, setRoleTags] = useState([]);
  const [skillTags, setSkillTags] = useState([]);
  const [state, setState] = useState(loadPersistedState);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("error");

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

  const roleTargets = useMemo(
    () => [...new Set([...state.answers.selectedRoles, ...featuredRoles])].slice(0, MAX_VISIBLE_ROLE_RESULTS),
    [state.answers.selectedRoles, featuredRoles]
  );

  const steps = [
    { title: "Step 1: Your Background", subtitle: "Search role first, then choose level." },
    { title: "Step 2: Time and Energy", subtitle: "Quick choices only." },
    { title: "Step 3: Skills and Tools", subtitle: "Search by keyword and choose relevant tools." },
    { title: "Step 4: Job Fit", subtitle: "Set role target and work style." },
    { title: "Step 5: Support Setup", subtitle: "Choose ADHD profile and supports." }
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
      title: steps[0].title,
      rows: [
        { key: "Role(s)", value: state.answers.selectedRoles.join(", ") || "-" },
        { key: "Level", value: state.answers.experienceLevel || "-" }
      ]
    },
    {
      title: steps[1].title,
      rows: [
        { key: "Duration", value: state.answers.durationBand || "-" },
        { key: "Rhythm", value: state.answers.energyPattern || "-" }
      ]
    },
    {
      title: steps[2].title,
      rows: [
        { key: "Skills", value: state.answers.selectedSkills.join(", ") || "-" },
        { key: "Tools", value: state.answers.selectedTools.join(", ") || "-" }
      ]
    },
    {
      title: steps[3].title,
      rows: [
        { key: "Role target", value: state.answers.preferredRoles.join(", ") || "-" },
        { key: "Work style", value: state.answers.workStyles.join(", ") || "-" }
      ]
    },
    {
      title: steps[4].title,
      rows: [
        { key: "ADHD type", value: state.answers.adhdProfileType || "-" },
        { key: "Support", value: state.answers.supportNeeds.join(", ") || "-" }
      ]
    }
  ];

  return (
    <>
      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-mark">NG</span>
          <div>
            <h1>NeuroGuide</h1>
            <p>ADHD-friendly job description simplifieer and interview preparation tool</p>
          </div>
        </div>
      </header>

      <main className="app-shell">
        <section className="intro-banner">
          <h2>Build your profile with less typing</h2>
          <p>
            Add your background and skills preferences in guided steps. NeuroGuide turns this into profile data for
            job suitability and interview preparation.
          </p>
        </section>

        <div className="wizard-layout">
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
                      {sectionLabel("Role target", state.answers.preferredRoles.length > 0)}
                      {renderChips("preferredRoles", roleTargets, "multi")}
                    </section>
                    <section className="group-card">
                      {sectionLabel("Work style", state.answers.workStyles.length > 0)}
                      {renderChips("workStyles", WORK_STYLE_OPTIONS, "multi")}
                    </section>
                  </>
                )}

                {state.currentStepIndex === 4 && (
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
                      {sectionLabel("Support that helps", state.answers.supportNeeds.length > 0)}
                      {renderChips("supportNeeds", SUPPORT_NEED_OPTIONS, "multi")}
                      <label htmlFor="optional-notes">Optional short note</label>
                      <textarea
                        id="optional-notes"
                        value={state.answers.optionalNotes}
                        onChange={(e) => setAnswer("optionalNotes", e.target.value)}
                        maxLength={120}
                        placeholder="Anything else?"
                      />
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
    </>
  );
}

export default App;

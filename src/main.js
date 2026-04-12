/**
 * @fileoverview
 * NeuroGuide ADHD-friendly guided profile flow.
 *
 * This script powers:
 * - step-by-step profile capture with low typing effort,
 * - live keyword filtering for roles/skills (no long scroll dropdown),
 * - role-aware tool suggestions,
 * - clickable left progress steps for direct navigation,
 * - save-and-exit profile overview with editable sections.
 */

const STORAGE_KEY = "neuroguide.skillBackgroundSupportProfile.v4";
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

let allRoleTags = [];
let allSkillTags = [];

/**
 * Returns the default normalized state model.
 *
 * `viewMode` controls whether users are currently on the wizard or profile
 * overview page. Search query fields are persisted so users can pause/resume
 * without losing context while filtering.
 *
 * @returns {{
 *   currentStepIndex: number,
 *   completed: boolean,
 *   viewMode: "wizard" | "overview",
 *   answers: {
 *     selectedRoles: string[],
 *     roleSearchQuery: string,
 *     experienceLevel: string,
 *     durationBand: string,
 *     energyPattern: string,
 *     selectedSkills: string[],
 *     skillSearchQuery: string,
 *     selectedTools: string[],
 *     customSkill: string,
 *     preferredRoles: string[],
 *     workStyles: string[],
 *     adhdProfileType: string,
 *     supportNeeds: string[],
 *     optionalNotes: string
 *   }
 * }}
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
      customSkill: "",
      preferredRoles: [],
      workStyles: [],
      adhdProfileType: "",
      supportNeeds: [],
      optionalNotes: ""
    }
  };
}

/**
 * Loads persisted state and sanitizes the structure.
 *
 * @returns {ReturnType<typeof getDefaultState>} Safe profile state.
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

    return {
      ...fallback,
      ...parsed,
      currentStepIndex: Number.isInteger(parsed.currentStepIndex) ? parsed.currentStepIndex : 0,
      completed: Boolean(parsed.completed),
      viewMode: parsed.viewMode === "overview" ? "overview" : "wizard",
      answers: {
        ...fallback.answers,
        ...parsed.answers,
        selectedRoles: toStringArray(parsed.answers.selectedRoles),
        roleSearchQuery: toStringSafe(parsed.answers.roleSearchQuery),
        experienceLevel: toStringSafe(parsed.answers.experienceLevel),
        durationBand: toStringSafe(parsed.answers.durationBand),
        energyPattern: toStringSafe(parsed.answers.energyPattern),
        selectedSkills: toStringArray(parsed.answers.selectedSkills),
        skillSearchQuery: toStringSafe(parsed.answers.skillSearchQuery),
        selectedTools: toStringArray(parsed.answers.selectedTools),
        customSkill: toStringSafe(parsed.answers.customSkill),
        preferredRoles: toStringArray(parsed.answers.preferredRoles),
        workStyles: toStringArray(parsed.answers.workStyles),
        adhdProfileType: toStringSafe(parsed.answers.adhdProfileType),
        supportNeeds: toStringArray(parsed.answers.supportNeeds),
        optionalNotes: toStringSafe(parsed.answers.optionalNotes)
      }
    };
  } catch (error) {
    return fallback;
  }
}

/**
 * Converts any value to a trimmed string.
 *
 * @param {unknown} value - Unknown source value.
 * @returns {string} Trimmed string or empty fallback.
 */
function toStringSafe(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Converts unknown input into a clean string array.
 *
 * @param {unknown} value - Unknown source array value.
 * @returns {string[]} Clean string list.
 */
function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => toStringSafe(item)).filter(Boolean);
}

/**
 * Persists current state in localStorage.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current app state.
 * @returns {void}
 */
function persistState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save state.", error);
  }
}

/**
 * Clears persisted profile state.
 *
 * @returns {void}
 */
function clearPersistedState() {
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Loads skill taxonomy tags from JSON.
 *
 * @returns {Promise<string[]>} Skill labels.
 */
async function loadSkillTags() {
  try {
    const response = await fetch("./data/au-skills-taxonomy.json");
    if (!response.ok) {
      throw new Error("skills unavailable");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("skills invalid");
    }
    return payload.filter((value) => typeof value === "string" && value.trim().length > 0);
  } catch (error) {
    return ["Communication", "Team Collaboration", "Planning", "Service Delivery"];
  }
}

/**
 * Loads role taxonomy tags from JSON.
 *
 * @returns {Promise<string[]>} Role labels.
 */
async function loadRoleTags() {
  try {
    const response = await fetch("./data/au-role-taxonomy.json");
    if (!response.ok) {
      throw new Error("roles unavailable");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("roles invalid");
    }
    return payload.filter((value) => typeof value === "string" && value.trim().length > 0);
  } catch (error) {
    return ["Waiters", "Commercial Cleaners", "Sales Assistants (General)", "General Clerks"];
  }
}

/**
 * Returns core DOM references used by render/event logic.
 *
 * @returns {{
 *   progressSidebar: HTMLElement,
 *   wizardCard: HTMLElement,
 *   progressText: HTMLElement,
 *   progressFill: HTMLElement,
 *   progressBar: HTMLElement,
 *   progressList: HTMLElement,
 *   stepTitle: HTMLElement,
 *   stepDescription: HTMLElement,
 *   stepContent: HTMLElement,
 *   form: HTMLFormElement,
 *   errorMessage: HTMLElement,
 *   backButton: HTMLButtonElement,
 *   saveExitButton: HTMLButtonElement,
 *   nextButton: HTMLButtonElement,
 *   summaryCard: HTMLElement,
 *   summarySubtitle: HTMLElement,
 *   summaryGrid: HTMLElement,
 *   continueButton: HTMLButtonElement,
 *   restartButton: HTMLButtonElement
 * }}
 */
function getDomElements() {
  return {
    progressSidebar: document.querySelector(".progress-sidebar"),
    wizardCard: document.getElementById("wizard-card"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    progressBar: document.querySelector(".progress-track"),
    progressList: document.getElementById("progress-list"),
    stepTitle: document.getElementById("wizard-heading"),
    stepDescription: document.getElementById("step-description"),
    stepContent: document.getElementById("step-content"),
    form: document.getElementById("profile-form"),
    errorMessage: document.getElementById("error-message"),
    backButton: document.getElementById("back-button"),
    saveExitButton: document.getElementById("save-exit-button"),
    nextButton: document.getElementById("next-button"),
    summaryCard: document.getElementById("summary-card"),
    summarySubtitle: document.getElementById("summary-subtitle"),
    summaryGrid: document.getElementById("summary-grid"),
    continueButton: document.getElementById("continue-button"),
    restartButton: document.getElementById("restart-button")
  };
}

/**
 * Creates step definitions and validation rules.
 *
 * Step 4 intentionally avoids repeated role search to reduce perceived
 * duplication. It builds on previous role choices and focuses on fit preference.
 *
 * @returns {Array<{
 *   key: string,
 *   title: string,
 *   subtitle: string,
 *   render: (container: HTMLElement, state: ReturnType<typeof getDefaultState>) => void,
 *   validate: (state: ReturnType<typeof getDefaultState>) => string | null
 * }>}
 */
function createSteps() {
  return [
    {
      key: "background",
      title: "Step 1: Your Background",
      subtitle: "Search role first, then choose level.",
      render: renderBackgroundStep,
      validate: (state) => {
        if (state.answers.selectedRoles.length === 0) {
          return "Select at least one role.";
        }
        if (!state.answers.experienceLevel) {
          return "Choose experience level.";
        }
        return null;
      }
    },
    {
      key: "timeAndEnergy",
      title: "Step 2: Time and Energy",
      subtitle: "Quick choices only.",
      render: renderTimeAndEnergyStep,
      validate: (state) => {
        if (!state.answers.durationBand) {
          return "Select duration.";
        }
        if (!state.answers.energyPattern) {
          return "Select preferred rhythm.";
        }
        return null;
      }
    },
    {
      key: "skillsAndTools",
      title: "Step 3: Skills and Tools",
      subtitle: "Search by keyword and choose relevant tools.",
      render: renderSkillsAndToolsStep,
      validate: (state) => {
        if (state.answers.selectedSkills.length === 0) {
          return "Select at least one skill.";
        }
        if (state.answers.selectedTools.length === 0) {
          return "Select at least one tool.";
        }
        return null;
      }
    },
    {
      key: "jobFit",
      title: "Step 4: Job Fit",
      subtitle: "Set role target and work style.",
      render: renderJobFitStep,
      validate: (state) => {
        if (state.answers.preferredRoles.length === 0) {
          return "Select role target.";
        }
        if (state.answers.workStyles.length === 0) {
          return "Select work style.";
        }
        return null;
      }
    },
    {
      key: "support",
      title: "Step 5: Support Setup",
      subtitle: "Choose ADHD profile and supports.",
      render: renderSupportStep,
      validate: (state) => {
        if (!state.answers.adhdProfileType) {
          return "Choose ADHD profile type.";
        }
        if (state.answers.supportNeeds.length === 0) {
          return "Select support preferences.";
        }
        return null;
      }
    }
  ];
}

/**
 * Returns a curated starter role list with blue-collar/hospitality coverage.
 *
 * @returns {string[]} Featured role options.
 */
function getFeaturedRoleOptions() {
  const topRanked = allRoleTags.slice(0, 10);
  const blueCollar = allRoleTags.filter((role) =>
    ROLE_KEYWORDS_FOR_BLUE_COLLAR.some((keyword) => role.toLowerCase().includes(keyword))
  );
  return dedupeStrings([...topRanked, ...blueCollar]).slice(0, MAX_VISIBLE_ROLE_RESULTS);
}

/**
 * Filters role list using user keyword input.
 *
 * @param {string} query - User search input.
 * @returns {string[]} Matching roles.
 */
function searchRoles(query) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    return getFeaturedRoleOptions();
  }
  return allRoleTags.filter((role) => role.toLowerCase().includes(normalized)).slice(0, MAX_VISIBLE_ROLE_RESULTS);
}

/**
 * Filters skill list using user keyword input.
 *
 * @param {string} query - User search input.
 * @returns {string[]} Matching skills.
 */
function searchSkills(query) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    return allSkillTags.slice(0, MAX_VISIBLE_SKILL_RESULTS);
  }
  return allSkillTags.filter((skill) => skill.toLowerCase().includes(normalized)).slice(0, MAX_VISIBLE_SKILL_RESULTS);
}

/**
 * Builds dynamic tool suggestions using selected role context.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current profile state.
 * @returns {string[]} Role-relevant tool options.
 */
function getRoleBasedToolSuggestions(state) {
  const roleText = [...state.answers.selectedRoles, ...state.answers.preferredRoles].join(" ").toLowerCase();
  const matchedTools = [];

  for (const mapRule of TOOL_MAP_BY_ROLE) {
    if (mapRule.keywords.some((keyword) => roleText.includes(keyword))) {
      matchedTools.push(...mapRule.tools);
    }
  }

  return dedupeStrings([...matchedTools, ...BASE_TOOLS]).slice(0, MAX_VISIBLE_TOOLS);
}

/**
 * Renders Step 1 (role search + experience level).
 *
 * @param {HTMLElement} container - Target step container.
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @returns {void}
 */
function renderBackgroundStep(container, state) {
  const roleOptions = searchRoles(state.answers.roleSearchQuery);
  container.innerHTML = `
    <section class="group-card">
      ${renderSectionLabel("Search role", state.answers.selectedRoles.length > 0)}
      ${renderTagSearchInput("role-search", state.answers.roleSearchQuery, state.answers.selectedRoles, "selectedRoles")}
      ${renderSuggestionList(roleOptions, state.answers.selectedRoles, "selectedRoles")}
    </section>
    <section class="group-card">
      ${renderSectionLabel("Experience level", Boolean(state.answers.experienceLevel))}
      ${renderChipGroup(EXPERIENCE_LEVEL_OPTIONS, state.answers.experienceLevel, "experienceLevel", "single")}
    </section>
  `;
}

/**
 * Renders Step 2 (time + energy).
 *
 * @param {HTMLElement} container - Target step container.
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @returns {void}
 */
function renderTimeAndEnergyStep(container, state) {
  container.innerHTML = `
    <section class="group-card">
      ${renderSectionLabel("How long have you done this work?", Boolean(state.answers.durationBand))}
      ${renderChipGroup(DURATION_OPTIONS, state.answers.durationBand, "durationBand", "single")}
    </section>
    <section class="group-card">
      ${renderSectionLabel("What rhythm helps you most?", Boolean(state.answers.energyPattern))}
      ${renderChipGroup(ENERGY_PATTERN_OPTIONS, state.answers.energyPattern, "energyPattern", "single")}
    </section>
  `;
}

/**
 * Renders Step 3 (skill search + role-aware tool options).
 *
 * @param {HTMLElement} container - Target step container.
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @returns {void}
 */
function renderSkillsAndToolsStep(container, state) {
  const skillOptions = searchSkills(state.answers.skillSearchQuery);
  const toolOptions = getRoleBasedToolSuggestions(state);
  const skillSectionFilled = state.answers.selectedSkills.length > 0;

  container.innerHTML = `
    <section class="group-card">
      ${renderSectionLabel("Search skill", skillSectionFilled)}
      ${renderTagSearchInput("skill-search", state.answers.skillSearchQuery, state.answers.selectedSkills, "selectedSkills")}
      ${renderSuggestionList(skillOptions, state.answers.selectedSkills, "selectedSkills")}
    </section>
    <section class="group-card">
      ${renderSectionLabel("Tools (based on role type)", state.answers.selectedTools.length > 0)}
      ${renderChipGroup(toolOptions, state.answers.selectedTools, "selectedTools", "multi")}
    </section>
  `;
}

/**
 * Renders Step 4 (job-fit) using role targets from existing role choices.
 *
 * This avoids asking users to repeat full role search again.
 *
 * @param {HTMLElement} container - Target step container.
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @returns {void}
 */
function renderJobFitStep(container, state) {
  const roleTargets = dedupeStrings([...state.answers.selectedRoles, ...getFeaturedRoleOptions()]).slice(
    0,
    MAX_VISIBLE_ROLE_RESULTS
  );
  container.innerHTML = `
    <section class="group-card">
      ${renderSectionLabel("Role target", state.answers.preferredRoles.length > 0)}
      ${renderChipGroup(roleTargets, state.answers.preferredRoles, "preferredRoles", "multi")}
    </section>
    <section class="group-card">
      ${renderSectionLabel("Work style", state.answers.workStyles.length > 0)}
      ${renderChipGroup(WORK_STYLE_OPTIONS, state.answers.workStyles, "workStyles", "multi")}
    </section>
  `;
}

/**
 * Renders Step 5 support preferences.
 *
 * @param {HTMLElement} container - Target step container.
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @returns {void}
 */
function renderSupportStep(container, state) {
  container.innerHTML = `
    <section class="group-card">
      ${renderSectionLabel("ADHD profile type", Boolean(state.answers.adhdProfileType))}
      <select id="adhd-profile-type">
        <option value="">Select</option>
        <option value="inattentive" ${state.answers.adhdProfileType === "inattentive" ? "selected" : ""}>Inattentive</option>
        <option value="hyperactive-impulsive" ${
          state.answers.adhdProfileType === "hyperactive-impulsive" ? "selected" : ""
        }>Hyperactive-Impulsive</option>
        <option value="combined" ${state.answers.adhdProfileType === "combined" ? "selected" : ""}>Combined</option>
      </select>
    </section>
    <section class="group-card">
      ${renderSectionLabel("Support that helps", state.answers.supportNeeds.length > 0)}
      ${renderChipGroup(SUPPORT_NEED_OPTIONS, state.answers.supportNeeds, "supportNeeds", "multi")}
      <label for="optional-notes">Optional short note</label>
      <textarea id="optional-notes" maxlength="120" placeholder="Anything else?">${escapeHtml(
        state.answers.optionalNotes
      )}</textarea>
    </section>
  `;
}

/**
 * Renders a subsection heading that highlights when the section is filled.
 *
 * Filled state gives users visual confirmation that required inputs under that
 * heading already contain a meaningful selection.
 *
 * @param {string} text - Heading label text.
 * @param {boolean} isFilled - Whether section contains user-selected values.
 * @returns {string} HTML markup for heading chip.
 */
function renderSectionLabel(text, isFilled) {
  return `<p class="micro-label ${isFilled ? "is-filled" : ""}">${escapeHtml(text)}</p>`;
}

/**
 * Renders tag-style selected values inside the same input container.
 *
 * This mirrors classic tag input UX where selected items remain visible and can
 * be removed inline, while users continue typing search keywords.
 *
 * @param {string} inputId - Input id used for query typing.
 * @param {string} query - Current text query in input.
 * @param {string[]} selectedValues - Currently selected tag values.
 * @param {string} field - State field name for remove actions.
 * @returns {string} HTML markup for tag-input wrapper.
 */
function renderTagSearchInput(inputId, query, selectedValues, field) {
  const tagsMarkup = selectedValues
    .map(
      (value) => `
        <span class="selected-tag">
          ${escapeHtml(value)}
          <button type="button" class="tag-remove-button" data-tag-remove-field="${escapeHtml(field)}" data-tag-remove-value="${escapeHtml(value)}">×</button>
        </span>
      `
    )
    .join("");

  return `
    <div class="tag-input-wrap">
      <div class="selected-tag-list">${tagsMarkup}</div>
      <input id="${escapeHtml(inputId)}" type="text" value="${escapeHtml(query)}" placeholder="Type keyword to search">
    </div>
  `;
}

/**
 * Renders scrollable suggestion rows with plus-add actions.
 *
 * Suggestions exclude already selected values. Each row shows a label and a
 * plus icon button to make adding consistent with the requested interaction.
 *
 * @param {string[]} options - Search result options.
 * @param {string[]} selectedValues - Existing selected values.
 * @param {string} field - Target state field for add action.
 * @returns {string} HTML markup for suggestion list.
 */
function renderSuggestionList(options, selectedValues, field) {
  const available = options.filter((option) => !selectedValues.includes(option));

  if (available.length === 0) {
    return `<div class="suggestion-list"><div class="suggestion-empty">No matching keywords</div></div>`;
  }

  return `
    <div class="suggestion-list">
      ${available
        .map(
          (option) => `
            <button type="button" class="suggestion-row" data-tag-add-field="${escapeHtml(field)}" data-tag-add-value="${escapeHtml(option)}">
              <span>${escapeHtml(option)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

/**
 * Renders chip groups for single/multi select fields.
 *
 * @param {string[]} options - Chip labels.
 * @param {string[] | string} selectedValue - Selected value(s).
 * @param {string} field - Target state field.
 * @param {"single"|"multi"} mode - Selection mode.
 * @returns {string} HTML markup string.
 */
function renderChipGroup(options, selectedValue, field, mode) {
  const selected = Array.isArray(selectedValue) ? new Set(selectedValue) : new Set([selectedValue]);
  return `
    <div class="chip-grid">
      ${options
        .map((option) => {
          const isSelected = selected.has(option);
          return `<button type="button" class="choice-chip ${isSelected ? "is-selected" : ""}" data-choice-field="${escapeHtml(
            field
          )}" data-choice-value="${escapeHtml(option)}" data-choice-mode="${mode}">${escapeHtml(option)}</button>`;
        })
        .join("")}
    </div>
  `;
}

/**
 * Renders current step plus progress visuals.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @param {ReturnType<typeof getDomElements>} dom - DOM map.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {void}
 */
function renderCurrentStep(state, dom, steps) {
  const step = steps[state.currentStepIndex];
  const progress = Math.round(((state.currentStepIndex + 1) / steps.length) * 100);

  dom.progressText.textContent = `${state.currentStepIndex + 1}/${steps.length}`;
  dom.progressFill.style.width = `${progress}%`;
  dom.progressBar.setAttribute("aria-valuenow", String(progress));
  dom.stepTitle.textContent = step.title;
  dom.stepDescription.textContent = step.subtitle;
  dom.stepContent.innerHTML = "";
  step.render(dom.stepContent, state);
  renderSidebarProgress(state, dom, steps);

  dom.backButton.disabled = state.currentStepIndex === 0;
  dom.nextButton.textContent = state.currentStepIndex === steps.length - 1 ? "Finish" : "Next";
}

/**
 * Renders left sidebar step list and enables direct-step navigation.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @param {ReturnType<typeof getDomElements>} dom - DOM map.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {void}
 */
function renderSidebarProgress(state, dom, steps) {
  dom.progressList.innerHTML = steps
    .map((step, index) => {
      const done = step.validate(state) === null;
      const classes = ["progress-item", index === state.currentStepIndex ? "is-active" : "", done ? "is-done" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <li class="${classes}">
          <button type="button" class="progress-step-button" data-jump-step="${index}">
            Step ${index + 1}
          </button>
        </li>
      `;
    })
    .join("");
}

/**
 * Synchronizes current step text/select inputs into state.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Mutable state object.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {void}
 */
function syncCurrentStepInputsToState(state, steps) {
  const stepKey = steps[state.currentStepIndex].key;

  if (stepKey === "background") {
    state.answers.roleSearchQuery = getValue("role-search");
  }
  if (stepKey === "skillsAndTools") {
    state.answers.skillSearchQuery = getValue("skill-search");
  }
  if (stepKey === "support") {
    state.answers.adhdProfileType = getValue("adhd-profile-type");
    state.answers.optionalNotes = getValue("optional-notes");
  }
}

/**
 * Handles chip click selections.
 *
 * @param {MouseEvent} event - Click event.
 * @param {ReturnType<typeof getDefaultState>} state - Mutable state object.
 * @returns {boolean} True when handled.
 */
function handleChoiceChipClick(event, state) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const chip = target.closest(".choice-chip");
  if (!(chip instanceof HTMLElement)) {
    return false;
  }

  const field = chip.dataset.choiceField;
  const value = chip.dataset.choiceValue;
  const mode = chip.dataset.choiceMode;
  if (!field || !value || (mode !== "single" && mode !== "multi")) {
    return false;
  }

  if (mode === "single") {
    state.answers[field] = state.answers[field] === value ? "" : value;
    return true;
  }

  const values = Array.isArray(state.answers[field]) ? state.answers[field] : [];
  state.answers[field] = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  return true;
}

/**
 * Handles plus-button tag addition from suggestion rows.
 *
 * @param {MouseEvent} event - Click event.
 * @param {ReturnType<typeof getDefaultState>} state - Mutable state object.
 * @returns {boolean} True when a suggestion add action is handled.
 */
function handleTagAddClick(event, state) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("[data-tag-add-field]");
  if (!(button instanceof HTMLElement)) {
    return false;
  }

  const field = button.dataset.tagAddField;
  const value = button.dataset.tagAddValue;
  if (!field || !value) {
    return false;
  }

  const current = Array.isArray(state.answers[field]) ? state.answers[field] : [];
  if (!current.includes(value)) {
    state.answers[field] = [...current, value];
  }

  if (field === "selectedRoles") {
    state.answers.roleSearchQuery = "";
  }
  if (field === "selectedSkills") {
    state.answers.skillSearchQuery = "";
  }

  return true;
}

/**
 * Handles inline selected-tag removal actions.
 *
 * @param {MouseEvent} event - Click event.
 * @param {ReturnType<typeof getDefaultState>} state - Mutable state object.
 * @returns {boolean} True when a remove action is handled.
 */
function handleTagRemoveClick(event, state) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("[data-tag-remove-field]");
  if (!(button instanceof HTMLElement)) {
    return false;
  }

  const field = button.dataset.tagRemoveField;
  const value = button.dataset.tagRemoveValue;
  if (!field || !value) {
    return false;
  }

  const current = Array.isArray(state.answers[field]) ? state.answers[field] : [];
  state.answers[field] = current.filter((item) => item !== value);
  return true;
}

/**
 * Shows profile overview page and hides wizard/progress sidebar.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @param {ReturnType<typeof getDomElements>} dom - DOM map.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @param {boolean} isCompleted - True if all steps completed.
 * @returns {void}
 */
function showProfileOverview(state, dom, steps, isCompleted) {
  state.viewMode = "overview";
  if (isCompleted) {
    state.completed = true;
  }
  persistState(state);

  dom.progressSidebar.classList.add("hidden");
  dom.wizardCard.classList.add("hidden");
  dom.summaryCard.classList.remove("hidden");
  dom.summarySubtitle.textContent = isCompleted
    ? "All sections completed. You can still edit any step."
    : "Progress saved. Continue from any step below.";
  dom.summaryGrid.innerHTML = buildSummaryGridMarkup(state, steps);
}

/**
 * Shows wizard screen and progress sidebar.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @param {ReturnType<typeof getDomElements>} dom - DOM map.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {void}
 */
function showWizard(state, dom, steps) {
  state.viewMode = "wizard";
  persistState(state);
  dom.summaryCard.classList.add("hidden");
  dom.progressSidebar.classList.remove("hidden");
  dom.wizardCard.classList.remove("hidden");
  renderCurrentStep(state, dom, steps);
}

/**
 * Builds readable profile summary cards (not single-line compressed text).
 *
 * @param {ReturnType<typeof getDefaultState>} state - Current state.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {string} HTML summary cards.
 */
function buildSummaryGridMarkup(state, steps) {
  const linesByStep = [
    [
      { key: "Role(s)", value: listOrDash(state.answers.selectedRoles) },
      { key: "Level", value: state.answers.experienceLevel || "-" }
    ],
    [
      { key: "Duration", value: state.answers.durationBand || "-" },
      { key: "Rhythm", value: state.answers.energyPattern || "-" }
    ],
    [
      { key: "Skills", value: listOrDash(state.answers.selectedSkills) },
      { key: "Tools", value: listOrDash(state.answers.selectedTools) }
    ],
    [
      { key: "Role target", value: listOrDash(state.answers.preferredRoles) },
      { key: "Work style", value: listOrDash(state.answers.workStyles) }
    ],
    [
      { key: "ADHD type", value: state.answers.adhdProfileType || "-" },
      { key: "Support", value: listOrDash(state.answers.supportNeeds) }
    ]
  ];

  return steps
    .map(
      (step, index) => `
      <article class="summary-block">
        <h3>${escapeHtml(step.title)}</h3>
        <ul class="summary-list">
          ${linesByStep[index]
            .map(
              (line) => `
            <li class="summary-item">
              <span class="summary-key">${escapeHtml(line.key)}</span>
              <span class="summary-value">${escapeHtml(line.value)}</span>
            </li>
          `
            )
            .join("")}
        </ul>
        <button type="button" class="button secondary" data-go-step="${index}">Edit this step</button>
      </article>
    `
    )
    .join("");
}

/**
 * Returns input/select/textarea value by id.
 *
 * @param {string} id - DOM id for the input-like element.
 * @returns {string} Trimmed value.
 */
function getValue(id) {
  const field = document.getElementById(id);
  if (!field || !("value" in field)) {
    return "";
  }
  return String(field.value).trim();
}

/**
 * Escapes HTML-sensitive characters.
 *
 * @param {string} value - Raw unescaped string.
 * @returns {string} Escaped safe string.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Returns list as comma-separated text or a dash.
 *
 * @param {string[]} values - String list.
 * @returns {string} Display output.
 */
function listOrDash(values) {
  return values.length > 0 ? values.join(", ") : "-";
}

/**
 * Deduplicates preserving original order.
 *
 * @param {string[]} values - Input string list.
 * @returns {string[]} Unique list.
 */
function dedupeStrings(values) {
  return [...new Set(values)];
}

/**
 * Updates inline error/info text region.
 *
 * @param {HTMLElement} target - UI text element.
 * @param {string} text - Message text.
 * @param {"error"|"info"} tone - Tone style key.
 * @returns {void}
 */
function setMessage(target, text, tone = "error") {
  target.textContent = text;
  target.dataset.tone = tone;
}

/**
 * Resets full state and returns to wizard start.
 *
 * @param {ReturnType<typeof getDefaultState>} state - Mutable state object.
 * @param {ReturnType<typeof getDomElements>} dom - DOM map.
 * @param {ReturnType<typeof createSteps>} steps - Step definitions.
 * @returns {void}
 */
function restartWizard(state, dom, steps) {
  clearPersistedState();
  Object.assign(state, getDefaultState());
  setMessage(dom.errorMessage, "", "info");
  showWizard(state, dom, steps);
}

/**
 * Initializes data loading, rendering, and event wiring.
 *
 * @returns {Promise<void>}
 */
async function initProfileWizard() {
  const dom = getDomElements();
  [allSkillTags, allRoleTags] = await Promise.all([loadSkillTags(), loadRoleTags()]);
  const state = loadPersistedState();
  const steps = createSteps();

  renderCurrentStep(state, dom, steps);

  dom.stepContent.addEventListener("click", (event) => {
    const handled =
      handleTagAddClick(event, state) || handleTagRemoveClick(event, state) || handleChoiceChipClick(event, state);
    if (!handled) {
      return;
    }
    persistState(state);
    renderCurrentStep(state, dom, steps);
  });

  dom.stepContent.addEventListener("input", (event) => {
    syncCurrentStepInputsToState(state, steps);
    persistState(state);

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (["role-search", "skill-search"].includes(target.id)) {
      const cursorPos = "selectionStart" in target ? target.selectionStart : null;
      renderCurrentStep(state, dom, steps);
      const fieldAfterRender = document.getElementById(target.id);
      if (fieldAfterRender && "focus" in fieldAfterRender) {
        fieldAfterRender.focus();
        if (cursorPos !== null && "setSelectionRange" in fieldAfterRender) {
          fieldAfterRender.setSelectionRange(cursorPos, cursorPos);
        }
      }
    }
  });

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncCurrentStepInputsToState(state, steps);
    const error = steps[state.currentStepIndex].validate(state);
    if (error) {
      setMessage(dom.errorMessage, error, "error");
      persistState(state);
      return;
    }

    setMessage(dom.errorMessage, "", "info");
    if (state.currentStepIndex < steps.length - 1) {
      state.currentStepIndex += 1;
      persistState(state);
      renderCurrentStep(state, dom, steps);
      return;
    }

    showProfileOverview(state, dom, steps, true);
  });

  dom.backButton.addEventListener("click", () => {
    syncCurrentStepInputsToState(state, steps);
    state.currentStepIndex = Math.max(0, state.currentStepIndex - 1);
    persistState(state);
    renderCurrentStep(state, dom, steps);
  });

  dom.saveExitButton.addEventListener("click", () => {
    syncCurrentStepInputsToState(state, steps);
    showProfileOverview(state, dom, steps, false);
  });

  dom.progressList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("[data-jump-step]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const raw = button.dataset.jumpStep;
    const index = raw ? Number(raw) : NaN;
    if (!Number.isInteger(index)) {
      return;
    }

    syncCurrentStepInputsToState(state, steps);
    state.currentStepIndex = Math.max(0, Math.min(index, steps.length - 1));
    persistState(state);
    renderCurrentStep(state, dom, steps);
  });

  dom.summaryGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("[data-go-step]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const raw = button.dataset.goStep;
    const index = raw ? Number(raw) : NaN;
    if (!Number.isInteger(index)) {
      return;
    }

    state.currentStepIndex = Math.max(0, Math.min(index, steps.length - 1));
    showWizard(state, dom, steps);
  });

  dom.continueButton.addEventListener("click", () => {
    showWizard(state, dom, steps);
  });

  dom.restartButton.addEventListener("click", () => {
    restartWizard(state, dom, steps);
  });

  if (state.viewMode === "overview") {
    showProfileOverview(state, dom, steps, state.completed);
  } else {
    showWizard(state, dom, steps);
  }
}

initProfileWizard();

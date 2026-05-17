import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import WorkEnvironmentFitPanel from "./WorkEnvironmentFitPanel.jsx";
import ExperienceMatchPanel from "./ExperienceMatchPanel.jsx";

const CAREER_PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";

function getAdhdTypeFromProfile() {
  try {
    const raw = window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY);
    if (!raw) return "inattentive";
    const parsed = JSON.parse(raw);
    const type =
      parsed?.answers?.adhdProfileType ||
      parsed?.answers?.quizInferredType ||
      "";
    if (type === "hyperactive-impulsive") return "hyperactive";
    if (type === "combined") return "combined";
    if (type === "inattentive") return "inattentive";
    return "inattentive";
  } catch {
    return "inattentive";
  }
}

const ASSESSMENT_CONFIDENCE_TOOLTIP =
  "Confidence is based on:\n- % of skills matched\n- Completeness of user profile\n- Gemini feature completeness";

function capitalizeFirst(text) {
  const t = String(text || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Strong = normalized equality; weak = substring overlap (per product spec). */
function categoriseSkills(userSkills = [], jobSkills = []) {
  const normalize = (s) => String(s || "").toLowerCase().trim();
  const matched = [];
  const partial = [];
  const missing = [];
  jobSkills.forEach((jobSkill) => {
    const js = normalize(jobSkill);
    const strong = userSkills.some((us) => normalize(us) === js);
    const weak =
      !strong &&
      userSkills.some((us) => {
        const u = normalize(us);
        if (!u.length || !js.length) return false;
        return js.includes(u) || u.includes(js);
      });
    if (strong) matched.push(jobSkill);
    else if (weak) partial.push(jobSkill);
    else missing.push(jobSkill);
  });
  return { matched, partial, missing };
}

const TOOL_KEYWORDS = [
  "python",
  "javascript",
  "typescript",
  "java",
  "golang",
  "rust",
  "c++",
  "c#",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "sql",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "k8s",
  "helm",
  "terraform",
  "ansible",
  "jenkins",
  "gitlab",
  "github",
  "linux",
  "bash",
  "powershell",
  "network",
  "react",
  "angular",
  "vue",
  "node",
  "django",
  "flask",
  "fastapi",
  "graphql",
  "redis",
  "kafka",
  "mongodb",
  "mysql",
  "postgres",
  "snowflake",
  "tensorflow",
  "pytorch",
  "pandas",
  "spark",
  "hadoop",
  "airflow",
  "ci/cd",
  "cicd",
  "microservices",
  "selenium",
  "jest",
  "git",
  "openapi",
  "grpc",
  "rest",
  "api",
  "nosql",
  "elasticsearch",
  "debugging",
  "coding",
  "programming",
  "scripting",
  "devops",
];

const SOFT_KEYWORDS = [
  "reliability",
  "reliable",
  "communication",
  "communicate",
  "teamwork",
  "problem-solving",
  "problem solving",
  "leadership",
  "management",
  "manager",
  "mentoring",
  "mentor",
  "coaching",
  "presentation",
  "presentations",
  "writing",
  "written",
  "empathy",
  "collaboration",
  "stakeholder",
  "negotiation",
  "time management",
  "organization",
  "organisational",
  "organizational",
  "creativity",
  "creative thinking",
  "critical thinking",
  "adaptability",
  "adaptable",
  "conflict",
  "facilitation",
  "listening",
  "interpersonal",
  "accountability",
  "initiative",
  "delegation",
  "coordination",
  "influence",
  "patience",
  "resilience",
  "emotional intelligence",
  "customer service",
  "client relations",
  "people skills",
  "work ethic",
  "attention to detail",
  "detail-oriented",
  "multitasking",
  "prioritization",
  "prioritisation",
];

function classifySkillType(skill) {
  const s = String(skill || "").toLowerCase().trim();
  for (const k of SOFT_KEYWORDS) {
    if (s === k.trim() || s.includes(k.trim())) return "soft";
  }
  for (const k of TOOL_KEYWORDS) {
    if (s === k || s.includes(k)) return "tool";
  }
  if (s.split(/\s+/).filter(Boolean).length >= 3) return "soft";
  return "tool";
}

function partitionByType(items) {
  const tool = [];
  const soft = [];
  items.forEach((it) => {
    (classifySkillType(it) === "soft" ? soft : tool).push(it);
  });
  return { tool, soft };
}

/** Soft “gap” list: treat partial-overlap soft skills as gaps (no separate Partial row for soft). */
function mergeSoftGaps(partialSoft, missingSoft) {
  const seen = new Set();
  const out = [];
  [...partialSoft, ...missingSoft].forEach((x) => {
    const k = String(x).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(x);
  });
  return out;
}

/** Labels for structured soft_skill_requirements keys (aligned with backend _SOFT_SKILL_KEYS). */
const SOFT_DIM_LABELS = {
  communication: "Communication",
  time_management: "Time management",
  problem_solving: "Problem-solving",
  leadership: "Leadership",
  teamwork: "Teamwork",
  adaptability: "Adaptability",
  self_motivation: "Self-motivation",
};

function softDemandToNum(level) {
  const s = String(level || "").toLowerCase();
  if (s === "high") return 2;
  if (s === "medium" || s === "moderate") return 1;
  if (s === "low") return 0;
  return -1;
}

/**
 * Job score `factor_breakdown.skills.job_skills` is technical-only from Gemini; soft dimensions
 * live in `soft_skills_debug.soft_skills_extracted`. When present, drive the soft buckets from that.
 */
function splitSoftSkillsFromDebug(softDebug) {
  const ext = softDebug?.soft_skills_extracted;
  if (!ext || typeof ext !== "object") return null;
  const keys = Object.keys(ext).filter((k) => ext[k] != null && String(ext[k]).trim() !== "");
  if (!keys.length) return null;

  const user = softDebug?.soft_skills_user_inferred || {};
  const matched = [];
  const partial = [];
  const missing = [];

  for (const key of keys) {
    const demandRaw = ext[key];
    const dn = softDemandToNum(demandRaw);
    if (dn < 0) continue;

    const uRaw = user[key] ?? "medium";
    let un = softDemandToNum(uRaw);
    if (un < 0) un = 1;

    const labelBase = SOFT_DIM_LABELS[key] || capitalizeFirst(String(key).replace(/_/g, " "));
    const label = `${labelBase} | role: ${String(demandRaw).toLowerCase()} |`;

    if (un >= dn) matched.push(label);
    else if (un === dn - 1) partial.push(label);
    else missing.push(label);
  }

  if (!matched.length && !partial.length && !missing.length) return null;
  return { matched, partial, missing };
}

function parseRoleDemandFromSoftLabel(label) {
  const s = String(label || "").toLowerCase();
  const m = s.match(/\|\s*role:\s*(high|medium|low)\s*\|/);
  return m ? m[1] : null;
}

function softScoreFromBuckets(softBuckets) {
  if (!softBuckets) return null;
  const scored = [];
  const matched = softBuckets.matched || [];
  const partial = softBuckets.partial || [];
  const missing = softBuckets.missing || [];

  matched.forEach(() => scored.push(100));
  partial.forEach(() => scored.push(60));
  missing.forEach((label) => {
    const role = parseRoleDemandFromSoftLabel(label);
    if (role === "high") scored.push(20);
    else if (role === "medium") scored.push(40);
    else scored.push(60);
  });

  if (!scored.length) return null;
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
}

function parseSoftDimKeyFromLabel(label) {
  const head = String(label || "").split("|")[0].trim().toLowerCase();
  const byHead = {
    communication: "communication",
    "time management": "time_management",
    "problem-solving": "problem_solving",
    "problem solving": "problem_solving",
    leadership: "leadership",
    teamwork: "teamwork",
    adaptability: "adaptability",
    "self-motivation": "self_motivation",
    "self motivation": "self_motivation",
  };
  return byHead[head] || null;
}

/** Map symmetric factor adjustment to 0–100 (best at +maxPoints). */
function factorToPct(adjustment, maxPoints) {
  const max = Number(maxPoints) || 0;
  if (!max) return null;
  const adj = Number(adjustment);
  if (!Number.isFinite(adj)) return null;
  const pct = ((adj + max) / (2 * max)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function workStyleMatchPct(factors) {
  const wp = factors?.work_preferences;
  const en = factors?.energy_patterns;
  const p1 = factorToPct(wp?.adjustment, wp?.max_points ?? 15);
  const p2 = factorToPct(en?.adjustment, en?.max_points ?? 10);
  if (p1 == null && p2 == null) return null;
  if (p1 == null) return p2;
  if (p2 == null) return p1;
  const w1 = 15;
  const w2 = 10;
  return Math.round((p1 * w1 + p2 * w2) / (w1 + w2));
}

function zoneKind(zone) {
  if (String(zone).startsWith("tool_")) return "tool";
  if (String(zone).startsWith("soft_")) return "soft";
  return null;
}

function dropActionFor(fromZone, toZone) {
  if (!fromZone || !toZone || fromZone === toZone) return null;
  if (zoneKind(fromZone) !== zoneKind(toZone)) return null;

  const toMatched = toZone === "tool_matched" || toZone === "soft_matched";
  const fromMatched = fromZone === "tool_matched" || fromZone === "soft_matched";
  const fromMissing = fromZone === "tool_missing" || fromZone === "soft_missing";
  const toMissing = toZone === "tool_missing" || toZone === "soft_missing";
  const fromPartial = fromZone === "tool_partial";
  const toPartial = toZone === "tool_partial";

  if (toMatched && (fromMissing || fromPartial)) return "add";
  if (toPartial && fromMissing) return "add";
  if ((toMissing || toPartial) && fromMatched) return "remove";
  if (toMissing && fromPartial) return "remove";

  return null;
}

/** Ring / tone colors aligned with legend: Low 0–40, Mid 41–70, High 71–100. */
function scoreTone(score) {
  if (score >= 71) return "good";
  if (score >= 41) return "warn";
  return "risk";
}

function scoreLabel(score) {
  if (score >= 71) return "Strong match";
  if (score >= 41) return "Moderate match";
  return "Low match";
}

/** Short tier under donut — same breakpoints as the color-coded legend. */
function donutTierLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "—";
  if (n >= 71) return "HIGH";
  if (n >= 41) return "MID";
  return "LOW";
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * SVG donut: progress arc fills smoothly to the target % (not a spinning loader).
 * While `loading`, the arc sweeps 0→100% in a loop; when idle, animates from 0 (or prior)
 * to the score.
 */
function JobMatchDonut({ score, tone, loading = false }) {
  const size = 200;
  const stroke = 13;
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;

  const targetPct = Math.min(100, Math.max(0, Number(score) || 0));
  const [displayPct, setDisplayPct] = useState(0);
  const rafRef = useRef(null);
  const stableFromRef = useRef(null);

  useEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    let cancelled = false;

    if (loading) {
      stableFromRef.current = null;
      const t0 = performance.now();
      const loop = (now) => {
        if (cancelled) return;
        const u = ((now - t0) % 2600) / 2600;
        const p = ((1 - Math.cos(u * Math.PI * 2)) / 2) * 100;
        setDisplayPct(p);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        cancelled = true;
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }

    const from = stableFromRef.current ?? 0;
    const startT = performance.now();
    const dur = 1600;

    const tick = (now) => {
      if (cancelled) return;
      const t = Math.min(1, (now - startT) / dur);
      const p = from + (targetPct - from) * easeOutCubic(t);
      setDisplayPct(p);
      stableFromRef.current = p;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        stableFromRef.current = targetPct;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [loading, targetPct]);

  const dash = (displayPct / 100) * c;

  return (
    <div
      className={`jsc-jobmatch-donut jsc-jobmatch-donut--${tone}${loading ? " jsc-jobmatch-donut--loading" : ""}`}
      role={loading ? "status" : undefined}
      aria-live={loading ? "polite" : undefined}
      aria-busy={loading ? "true" : undefined}
      aria-label={loading ? "Calculating job match score" : undefined}
    >
      <svg className="jsc-jobmatch-donut__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="jsc-jobmatch-donut__track" cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={`jsc-jobmatch-donut__prog jsc-jobmatch-donut__prog--${tone}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className={`jsc-jobmatch-donut__center${loading ? " jsc-jobmatch-donut__center--loading" : ""}`}>
        {loading ? (
          <span className="jsc-jobmatch-donut__loading-dots" aria-hidden="true">
            ···
          </span>
        ) : (
          <>
            <span className="jsc-assess-score-num jsc-assess-score-num--donut">
              {Math.round(displayPct)}
              <span className="jsc-jobmatch-donut__pct-sym" aria-hidden="true">
                %
              </span>
            </span>
            <span className="jsc-assess-score-tier">{donutTierLabel(score)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Coverage % from matched / partial / missing job-skill buckets (0–100). */
function bucketCoveragePct(matched, partial, missing) {
  const m = matched?.length ?? 0;
  const p = partial?.length ?? 0;
  const x = missing?.length ?? 0;
  const t = m + p + x;
  if (!t) return null;
  return Math.round(((m + 0.5 * p) / t) * 100);
}

function barToneClass(pct) {
  if (pct == null) return "risk";
  if (pct >= 70) return "good";
  if (pct >= 45) return "warn";
  return "risk";
}

/** Hide provider / pipeline jargon from cached or legacy API strings. */
function neutralizeScoringCopy(text) {
  if (text == null || typeof text !== "string") return text;
  return text
    .replace(/\bGemini\b/gi, "This posting")
    .replace(/gemini[- ]structured/gi, "structured job signals")
    .replace(/gemini job-fit/gi, "job posting signals")
    .replace(/\(Gemini\)/gi, "(from posting)")
    .trim();
}

function BreakdownRowIcon({ variant }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const cls = "jsc-bd-icon";
  if (variant === "workStyle") {
    return (
      <svg className={cls} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
          {...stroke}
        />
        <path
          d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
          {...stroke}
        />
        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" {...stroke} />
        <path d="M12 18v2" {...stroke} />
        <path d="M8 19h8" {...stroke} />
      </svg>
    );
  }
  if (variant === "technical") {
    return (
      <svg className={cls} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="m18 16 4-4-4-4" {...stroke} />
        <path d="m6 8-4 4 4 4" {...stroke} />
        <path d="m14.5 4-5 16" {...stroke} />
      </svg>
    );
  }
  if (variant === "experience") {
    return (
      <svg className={cls} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...stroke} />
        <rect x="5" y="7" width="14" height="13" rx="2" {...stroke} />
        <path d="M9 12h6M9 16h4" {...stroke} />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...stroke} />
      <circle cx="9" cy="7" r="4" {...stroke} />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" {...stroke} />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" {...stroke} />
    </svg>
  );
}

function ScoreBreakdownRow({ rowId, label, pct, expanded, onToggle, children, variant = "soft", hint, statusCallout }) {
  const safe = pct == null ? null : Math.max(0, Math.min(100, Number(pct)));
  const tone = barToneClass(safe);
  const showBar = statusCallout == null && safe != null;
  const scoreText = showBar ? String(Math.round(safe)) : "—";
  const ariaScore = statusCallout
    ? statusCallout.label
    : showBar
      ? `Score ${scoreText} out of 100`
      : "Score not available yet";
  const ariaExpand = expanded ? "Collapse details" : "Expand for details";
  return (
    <div className={`jsc-bd-row${expanded ? " jsc-bd-row--expanded" : ""}`}>
      <button
        type="button"
        className="jsc-bd-row__head"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`jsc-bd-panel-${rowId}`}
        id={`jsc-bd-trigger-${rowId}`}
        aria-label={`${label}. ${ariaScore}. ${ariaExpand}.`}
        title={expanded ? "Collapse this section" : "Expand this section"}
      >
        <span className="jsc-bd-row__lead">
          <span className="jsc-bd-row__icon-wrap">
            <BreakdownRowIcon variant={variant} />
          </span>
          <span className="jsc-bd-row__titles">
            <span className="jsc-bd-row__label">{label}</span>
            {hint ? <span className="jsc-bd-row__hint">{hint}</span> : null}
          </span>
        </span>
        {statusCallout ? (
          <span className="jsc-bd-row__callout-slot">
            <span className={`jsc-bd-row__callout jsc-bd-row__callout--${statusCallout.tone}`}>{statusCallout.label}</span>
          </span>
        ) : (
          <>
            <span className="jsc-bd-row__track" aria-hidden="true">
              <span
                className={`jsc-bd-row__fill jsc-bd-row__fill--${tone}`}
                style={{ width: showBar ? `${safe}%` : "0%" }}
              />
            </span>
            <span className="jsc-bd-row__score">
              <span className="jsc-bd-row__val">{scoreText}</span>
              <span className="jsc-bd-row__outof">/ 100</span>
            </span>
          </>
        )}
        <span className="jsc-bd-row__expand" aria-hidden="true">
          <span className="jsc-bd-row__expand-label">Details</span>
          <span className="jsc-bd-row__chev-wrap">
            <svg
              className={`jsc-bd-chevron${expanded ? " jsc-bd-chevron--open" : ""}`}
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 9l6 6 6-6"
              />
            </svg>
          </span>
        </span>
      </button>
      {expanded ? (
        <div className="jsc-bd-row__panel" id={`jsc-bd-panel-${rowId}`} role="region" aria-labelledby={`jsc-bd-trigger-${rowId}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function parseDragPayload(e) {
  try {
    const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function DraggableChip({ skill, tone, zone, busy, draggable: draggableProp }) {
  const draggable = draggableProp !== undefined ? draggableProp && !busy : !busy;
  return (
    <span
      className={`jsc-mini-chip jsc-mini-chip--${tone} jsc-mini-chip--drag`}
      draggable={draggable}
      onDragStart={(e) => {
        const payload = JSON.stringify({ skill, fromZone: zone });
        e.dataTransfer.setData("application/json", payload);
        e.dataTransfer.setData("text/plain", payload);
        e.dataTransfer.effectAllowed = "move";
      }}
      title="Drag to another skills row to update your profile"
    >
      {skill}
    </span>
  );
}

function SkillDropBucket({
  zoneId,
  title,
  ariaLabel,
  items,
  tone,
  busy,
  onDropSkill,
  allowDrop,
  allowDrag = true,
}) {
  const [over, setOver] = useState(false);
  const showEmpty = !items.length;
  const labelForBucket = ariaLabel || title || zoneId;
  return (
    <div
      className={`jsc-assess-box jsc-assess-box--${tone === "good" ? "good" : tone === "warn" ? "warn" : "risk"} jsc-skill-subbox jsc-drop-bucket${over ? " jsc-drop-bucket--over" : ""}`}
      data-jsc-drop-zone={zoneId}
      aria-label={labelForBucket}
      onDragOver={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragOverCapture={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!allowDrop) return;
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        setOver(false);
        const payload = parseDragPayload(e);
        if (!payload?.skill || !payload?.fromZone) return;
        const action = dropActionFor(payload.fromZone, zoneId);
        if (!action) return;
        onDropSkill?.({ skill: payload.skill, action, fromZone: payload.fromZone, toZone: zoneId });
      }}
    >
      {title ? <p className="jsc-assess-box-head">{title}</p> : null}
      {showEmpty ? (
        <p className="jsc-muted-line">Drag skills here</p>
      ) : (
        <div className="jsc-chip-row">
          {items.map((it, idx) => (
            <DraggableChip
              key={`${it}-${idx}`}
              skill={it}
              tone={tone}
              zone={zoneId}
              busy={busy}
              draggable={allowDrag}
            />
          ))}
          </div>
      )}
    </div>
  );
}

export default function JobScoreCard({
  result,
  occupationName,
  careerProfileJobRoles = [],
  questionnaireBaseline = null,
  onQuestionnairePreviewPatch,
  onQuestionnaireSaveToProfile,
  onOpenHistory,
  onSaveJobScore,
  onSkillProfileChange,
  jobScoreBusy = false,
  ariaHeadingId = "jsc-inline-heading",
  /** When true, omit the inline “Start preparing for interview” link (e.g. modal provides its own CTA). */
  hideInterviewPrepCta = false,
  /** When true, hide Compare / Save / Interview toolbar (e.g. history detail modal). */
  hidePostScoreActions = false,
}) {
  const navigate = useNavigate();
  const [bdOpen, setBdOpen] = useState({ adhd: false, experience: false, technical: true, soft: false });
  const assessmentConfidenceTipId = useId();
  const [showAssessmentConfidenceTip, setShowAssessmentConfidenceTip] = useState(false);

  const skillsFactor = result?.factor_breakdown?.skills || {};
  const factors = result?.factor_breakdown || {};
  const softDebug = result?.soft_skills_debug;

  const split = useMemo(
    () => categoriseSkills(skillsFactor.user_skills || [], skillsFactor.job_skills || []),
    [skillsFactor.user_skills, skillsFactor.job_skills],
  );

  const softDebugSplit = useMemo(() => splitSoftSkillsFromDebug(softDebug), [softDebug]);
  const softBucketsFromDebug = softDebugSplit != null;
  const [softDnDState, setSoftDnDState] = useState(null);
  const [prevSoftDebugSplit, setPrevSoftDebugSplit] = useState(softDebugSplit);
  if (prevSoftDebugSplit !== softDebugSplit) {
    setPrevSoftDebugSplit(softDebugSplit);
    setSoftDnDState(null);
  }

  const skillBuckets = useMemo(() => {
    const pM = partitionByType(split.matched);
    const pP = partitionByType(split.partial);
    const pMi = partitionByType(split.missing);
    const softSource = softDnDState || softDebugSplit;
    if (softSource) {
      return {
        matched: { tool: pM.tool, soft: softSource.matched },
        partial: { tool: pP.tool, soft: softSource.partial },
        missing: { tool: pMi.tool, soft: softSource.missing },
      };
    }
    return { matched: pM, partial: pP, missing: pMi };
  }, [split.matched, split.partial, split.missing, softDebugSplit, softDnDState]);
  const matchedByType = skillBuckets.matched;
  const partialByType = skillBuckets.partial;
  const missingByType = skillBuckets.missing;
  const softGaps = useMemo(
    () => mergeSoftGaps(partialByType.soft, missingByType.soft),
    [partialByType.soft, missingByType.soft],
  );

  const workStylePct = workStyleMatchPct(factors);
  const technicalPct = useMemo(
    () => bucketCoveragePct(matchedByType.tool, partialByType.tool, missingByType.tool),
    [matchedByType.tool, partialByType.tool, missingByType.tool],
  );
  const softRowPct = useMemo(() => {
    if (softBucketsFromDebug) {
      return softScoreFromBuckets({
        matched: matchedByType.soft,
        partial: partialByType.soft,
        missing: missingByType.soft,
      });
    }
    const s = softDebug?.soft_skills_score;
    if (s != null && Number.isFinite(Number(s))) return Math.round(Number(s));
    return bucketCoveragePct(matchedByType.soft, partialByType.soft, missingByType.soft);
  }, [softBucketsFromDebug, softDebug, matchedByType.soft, partialByType.soft, missingByType.soft]);

  const experienceStatusCallout = useMemo(() => {
    const st = result?.experience_fit?.status;
    if (st === "good") return { label: "Good to go", tone: "good" };
    if (st === "moderate") return { label: "Tight fit, proceed carefully", tone: "warn" };
    if (st === "gap") return { label: "Should not proceed, posting asks more experience", tone: "risk" };
    return null;
  }, [result?.experience_fit?.status]);

  const softCollapsedHint =
    softRowPct == null && softDebug?.soft_skills_ui_hint
      ? neutralizeScoringCopy(softDebug.soft_skills_ui_hint)
      : undefined;

  const canDnD = typeof onSkillProfileChange === "function";

  const handleDrop = ({ skill, action, fromZone, toZone }) => {
    if (!canDnD || jobScoreBusy) return;
    const softZone = String(fromZone || "").startsWith("soft_") && String(toZone || "").startsWith("soft_");
    if (softZone && softBucketsFromDebug) {
      const softOverrideKey = parseSoftDimKeyFromLabel(skill);
      const softOverrideLevel = toZone === "soft_matched" ? "high" : "low";
      setSoftDnDState((prev) => {
        const base = prev || {
          matched: [...(softDebugSplit?.matched || [])],
          partial: [...(softDebugSplit?.partial || [])],
          missing: [...(softDebugSplit?.missing || [])],
        };
        const eq = (a, b) => String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
        const next = {
          matched: base.matched.filter((x) => !eq(x, skill)),
          partial: base.partial.filter((x) => !eq(x, skill)),
          missing: base.missing.filter((x) => !eq(x, skill)),
        };
        if (toZone === "soft_matched") next.matched.push(skill);
        else if (toZone === "soft_missing") next.missing.push(skill);
        else next.partial.push(skill);
        return next;
      });
      onSkillProfileChange({
        skill,
        action,
        fromZone,
        toZone,
        softOverrideKey,
        softOverrideLevel,
      });
      return;
    }
    onSkillProfileChange({ skill, action });
  };

  if (!result && !jobScoreBusy) return null;

  const hasResult = Boolean(result);
  const score = hasResult ? Number(result.score || 0) : 0;
  const tone = scoreTone(score);
  const scorePct = Math.min(100, Math.max(0, score));
  const canPrepareInterview = hasResult && scorePct >= 50;
  const scoreBand = !hasResult ? null : scorePct >= 71 ? "high" : scorePct >= 41 ? "mid" : "low";
  const confidencePct = hasResult ? Math.round((result.match_confidence ?? 0) * 100) : 0;
  const donutLoading = Boolean(jobScoreBusy);

  const adhdWorkStylePct = workStylePct;

  const collapseBreakdown = () => setBdOpen({ adhd: false, experience: false, technical: false, soft: false });

  return (
    <div className="jsc-inline jsc-inline--fullbleed" role="region" aria-labelledby={ariaHeadingId}>
      <div className="jsc-panel jsc-panel--inline jsc-panel--assessment jsc-panel--jobmatch-shell">
        <div className="jsc-assess-topbar">
          <div className="jsc-assess-brand">
            <p className="jsc-assess-brand-title">Career Compatibility Score</p>
            <div id={ariaHeadingId} className="jsc-assess-role-stack">
              <p className="jsc-assess-role">
                Assessment for: <strong>{occupationName || "this role"}</strong>
              </p>
              {careerProfileJobRoles.length > 0 ? (
                <p className="jsc-assess-role jsc-assess-role--profile">
                  Career profile role{careerProfileJobRoles.length > 1 ? "s" : ""}:{" "}
                  <strong>{careerProfileJobRoles.join(", ")}</strong>
                </p>
              ) : null}
            </div>
          </div>
          <div className="jsc-assess-top-actions">
          {/* <div className="jsc-helpful-box" aria-label="Was it helpful?">
            <span className="jsc-helpful-label">Was it helpful?</span>
            <div className="jsc-helpful-actions" role="group" aria-label="Feedback">
              <button
                type="button"
                className={`jsc-helpful-btn jsc-helpful-btn--up${helpfulVote === "up" ? " jsc-helpful-btn--selected" : ""}`}
                aria-label="Helpful"
                aria-pressed={helpfulVote === "up"}
                onClick={() => setHelpfulVote("up")}
              >
                <span className="jsc-helpful-emoji" aria-hidden="true">👍</span>
              </button>
              <button
                type="button"
                className={`jsc-helpful-btn jsc-helpful-btn--down${helpfulVote === "down" ? " jsc-helpful-btn--selected" : ""}`}
                aria-label="Not helpful"
                aria-pressed={helpfulVote === "down"}
                onClick={() => setHelpfulVote("down")}
              >
                <span className="jsc-helpful-emoji" aria-hidden="true">👎</span>
              </button>
            </div>
            </div> */}
          </div>
        </div>

        <h2 className="jsc-jobmatch-title">Job Match Overview</h2>

        <div className="jsc-jobmatch-card">
          <div className="jsc-jobmatch-donut-col">
            <div className="jsc-jobmatch-hero">
              {donutLoading ? (
                <div className="jsc-jobmatch-donut-hit jsc-jobmatch-donut-hit--idle" aria-busy="true">
                  <JobMatchDonut loading />
            </div>
              ) : (
                <button
                  type="button"
                  className="jsc-jobmatch-donut-hit"
                  onClick={() => {
                    setBdOpen((o) => ({ ...o, technical: true }));
                    requestAnimationFrame(() => {
                      document.getElementById("jsc-bd-panel-technical")?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                    });
                  }}
                  aria-label={`Job match score ${Math.round(score)} percent. Open technical skills matrix.`}
                >
                  <JobMatchDonut score={score} tone={tone} />
                </button>
              )}
              <p className="jsc-jobmatch-sub">{donutLoading ? "Calculating your match…" : scoreLabel(score)}</p>
              <ul className="jsc-jobmatch-legend" aria-label="Score range guide">
                <li
                  className={`jsc-jobmatch-legend__item jsc-jobmatch-legend__item--low${
                    hasResult && scoreBand === "low" ? " jsc-jobmatch-legend__item--active" : ""
                  }`}
                >
                  <span className="jsc-jobmatch-legend__swatch" aria-hidden="true" />
                  <span className="jsc-jobmatch-legend__text">
                    <span className="jsc-jobmatch-legend__title">Low match</span>
                    <span className="jsc-jobmatch-legend__range">0–40%</span>
                  </span>
                </li>
                <li
                  className={`jsc-jobmatch-legend__item jsc-jobmatch-legend__item--mid${
                    hasResult && scoreBand === "mid" ? " jsc-jobmatch-legend__item--active" : ""
                  }`}
                >
                  <span className="jsc-jobmatch-legend__swatch" aria-hidden="true" />
                  <span className="jsc-jobmatch-legend__text">
                    <span className="jsc-jobmatch-legend__title">Mid match</span>
                    <span className="jsc-jobmatch-legend__range">41–70%</span>
                  </span>
                </li>
                <li
                  className={`jsc-jobmatch-legend__item jsc-jobmatch-legend__item--high${
                    hasResult && scoreBand === "high" ? " jsc-jobmatch-legend__item--active" : ""
                  }`}
                >
                  <span className="jsc-jobmatch-legend__swatch" aria-hidden="true" />
                  <span className="jsc-jobmatch-legend__text">
                    <span className="jsc-jobmatch-legend__title">High match</span>
                    <span className="jsc-jobmatch-legend__range">71–100%</span>
                  </span>
                </li>
              </ul>
              <div
                className={`jsc-jobmatch-confidence-anchor${showAssessmentConfidenceTip ? " jsc-jobmatch-confidence-anchor--open" : ""}`}
                role="group"
                aria-label="Assessment confidence"
                onMouseEnter={() => setShowAssessmentConfidenceTip(true)}
                onMouseLeave={() => setShowAssessmentConfidenceTip(false)}
                onFocus={() => setShowAssessmentConfidenceTip(true)}
                onBlur={() => setShowAssessmentConfidenceTip(false)}
                tabIndex={0}
              >
                {showAssessmentConfidenceTip ? (
                  <div
                    id={assessmentConfidenceTipId}
                    className="jsc-jobmatch-confidence-tooltip"
                    role="tooltip"
                  >
                    {ASSESSMENT_CONFIDENCE_TOOLTIP}
                  </div>
                ) : null}
                {hasResult ? (
                  <p
                    className="jsc-jobmatch-confidence"
                    aria-describedby={showAssessmentConfidenceTip ? assessmentConfidenceTipId : undefined}
                  >
                    <span>Assessment Confidence {confidencePct}%</span>
                    <span className="jsc-jobmatch-confidence-info" aria-hidden="true">
                      i
                    </span>
                  </p>
                ) : (
                  <p
                    className="jsc-jobmatch-confidence jsc-jobmatch-confidence--pending"
                    aria-describedby={showAssessmentConfidenceTip ? assessmentConfidenceTipId : undefined}
                  >
                    Computing assessment confidence…
                  </p>
                )}
              </div>
            </div>
            </div>

          <div className="jsc-jobmatch-divider" aria-hidden="true" />

          {hasResult ? (
          <div className="jsc-jobmatch-breakdown-col">
            <div className="jsc-jobmatch-bd-head">
              <h3 className="jsc-jobmatch-bd-title">Compatibility Factors</h3>
              <button type="button" className="jsc-jobmatch-collapse-all" onClick={collapseBreakdown}>
                Collapse All
              </button>
            </div>

            <ScoreBreakdownRow
              rowId="adhd"
              label="Work Environment Fit"
              variant="workStyle"
              hint="How this posting’s pace and structure line up with how you like to work."
              pct={adhdWorkStylePct}
              expanded={bdOpen.adhd}
              onToggle={() => setBdOpen((o) => ({ ...o, adhd: !o.adhd }))}
            >
              <WorkEnvironmentFitPanel
                workEnvironmentFit={result?.work_environment_fit}
                busy={jobScoreBusy}
                questionnaireBaseline={questionnaireBaseline}
                onPreviewPatch={onQuestionnairePreviewPatch}
                onSavePatchToProfile={onQuestionnaireSaveToProfile}
              />
            </ScoreBreakdownRow>

            <ScoreBreakdownRow
              rowId="experience"
              label="Experience Match"
              variant="experience"
              hint="Quick read on whether this posting’s experience bar fits your band."
              pct={null}
              statusCallout={experienceStatusCallout}
              expanded={bdOpen.experience}
              onToggle={() => setBdOpen((o) => ({ ...o, experience: !o.experience }))}
            >
              <ExperienceMatchPanel experienceFit={result?.experience_fit} />
            </ScoreBreakdownRow>

            <ScoreBreakdownRow
              rowId="technical"
              label="Technical Skills Matrix"
              variant="technical"
              pct={technicalPct}
              expanded={bdOpen.technical}
              onToggle={() => setBdOpen((o) => ({ ...o, technical: !o.technical }))}
            >
              {canDnD ? (
                <p className="jsc-dnd-hint">Drag skill chips between columns to explore recalculated scores.</p>
              ) : null}
              <div className="jsc-skill-buckets-row jsc-skill-buckets-row--3" role="group" aria-label="Technical skills: matching, partial, missing">
                <SkillDropBucket
                  zoneId="tool_matched"
                  title="Fully matching"
                  ariaLabel="Fully matching technical skills"
                  items={matchedByType.tool}
                  tone="good"
                  busy={jobScoreBusy}
                  allowDrop={canDnD}
                  onDropSkill={handleDrop}
                />
                <SkillDropBucket
                  zoneId="tool_partial"
                  title="Partially aligned"
                  ariaLabel="Partially aligned technical skills"
                  items={partialByType.tool}
                  tone="warn"
                  busy={jobScoreBusy}
                  allowDrop={canDnD}
                  onDropSkill={handleDrop}
                />
                <SkillDropBucket
                  zoneId="tool_missing"
                  title="Missing essentials"
                  ariaLabel="Missing technical skills"
                  items={missingByType.tool}
                  tone="risk"
                  busy={jobScoreBusy}
                  allowDrop={canDnD}
                  onDropSkill={handleDrop}
                />
                    </div>
            </ScoreBreakdownRow>

            <ScoreBreakdownRow
              rowId="soft"
              label="Soft Skills"
              variant="soft"
              pct={softRowPct}
              hint={softCollapsedHint}
              expanded={bdOpen.soft}
              onToggle={() => setBdOpen((o) => ({ ...o, soft: !o.soft }))}
            >
              {softDebug?.soft_skills_ui_hint && softCollapsedHint == null ? (
                <p className="jsc-breakdown-explainer" role="note">
                  {neutralizeScoringCopy(softDebug.soft_skills_ui_hint)}
                </p>
              ) : null}
              {softBucketsFromDebug ? (
                <p className="jsc-dnd-hint">Drag chips between columns to update your profile. Scores refresh after save.</p>
              ) : canDnD ? (
                <p className="jsc-dnd-hint">Drag chips between columns to update your profile. Scores refresh after save.</p>
            ) : null}
              <div className="jsc-skill-buckets-row jsc-skill-buckets-row--2" role="group" aria-label="Soft skills: matching and missing">
                <SkillDropBucket
                  zoneId="soft_matched"
                  title="Aligned"
                  ariaLabel="Aligned soft skills"
                  items={matchedByType.soft}
                  tone="good"
                  busy={jobScoreBusy}
                  allowDrop={canDnD}
                  allowDrag
                  onDropSkill={handleDrop}
                />
                <SkillDropBucket
                  zoneId="soft_missing"
                  title="Gaps to develop"
                  ariaLabel="Soft skill gaps"
                  items={softGaps}
                  tone="risk"
                  busy={jobScoreBusy}
                  allowDrop={canDnD}
                  allowDrag
                  onDropSkill={handleDrop}
                />
                </div>
            </ScoreBreakdownRow>
              </div>
          ) : (
            <div className="jsc-jobmatch-breakdown-col jsc-jobmatch-breakdown-col--loading" aria-busy="true" aria-live="polite">
              <p className="jsc-jobmatch-loading-factors">Calculating compatibility factors…</p>
            </div>
          )}
        </div>

        {hasResult && !hidePostScoreActions ? (
          <div className="jsc-post-score-actions" role="group" aria-label="Next steps after your score">
            {typeof onOpenHistory === "function" ? (
              <button type="button" className="jsc-post-score-btn jsc-post-score-btn--compare" onClick={onOpenHistory}>
                Compare with previous JDs
              </button>
            ) : null}
            {typeof onSaveJobScore === "function" ? (
              <button type="button" className="jsc-post-score-btn jsc-post-score-btn--save" onClick={onSaveJobScore}>
                Save this job Score
              </button>
            ) : null}
            {!hideInterviewPrepCta ? (
              canPrepareInterview ? (
                <Link
                  className="jsc-post-score-btn jsc-post-score-btn--interview jsc-post-score-btn--interview-ready"
                  to="/interview-prep/session"
                  state={{ directWorkspace: true }}
                >
                  Start preparing for interview
                </Link>
              ) : (
                <button
                  type="button"
                  className="jsc-post-score-btn jsc-post-score-btn--interview jsc-post-score-btn--interview-locked"
                  disabled
                  title="Reach at least a 50% match score to open interview prep."
                >
                  Start preparing for interview
                </button>
              )
            ) : null}
            <button
              type="button"
              className="jsc-post-score-btn jsc-interview-cta--secondary"
              onClick={() => {
                const jobTitle = occupationName || "this role";
                const adhdType = getAdhdTypeFromProfile();
                const q = new URLSearchParams({
                  job_title: jobTitle,
                  adhd_type: adhdType,
                });
                navigate({ pathname: "/day-in-life", search: `?${q.toString()}` }, { state: { job_title: jobTitle, adhd_type: adhdType } });
              }}
            >
              See a day in this job
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate  } from "react-router-dom";


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

function humanizeFitValue(v) {
  const s = String(v ?? "").replace(/_/g, " ").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map client / API job-fit object keys to a stable shape for display. */
function coerceJobFitShape(raw) {
  if (!raw || typeof raw !== "object") return {};
  const o = { ...raw };
  if (o.interruptions != null && o.interrupt_frequency == null) {
    o.interrupt_frequency = o.interruptions;
  }
  return o;
}

function fitToRowTone(fit) {
  if (fit === "bad") return "mismatch";
  if (fit === "warn") return "partial";
  return "aligned";
}

/** Maps posting/user strings to meter position: low / mid / high / none. */
function meterLevelFromText(s, kind) {
  const t = String(s ?? "")
    .toLowerCase()
    .trim();
  if (!t || t === "—") return "none";
  if (t.includes("high") || t.includes("fast-paced")) return "high";
  if (t.includes("low interruptions") || t.includes("quieter") || t.includes("shorter") || t.includes("quiet blocks"))
    return "low";
  if (t.includes("low") && !t.includes("slow")) return "low";
  if (t.includes("deep-focus") || t.includes("deep focus")) return "high";
  if (t.includes("mixed") || t.includes("medium") || t.includes("moderate")) return "mid";
  if (kind === "task" && (t.includes("structured") || t.includes("unstructured"))) return "mid";
  if (t.includes("collaborative") || t.includes("variety")) return "mid";
  return "mid";
}

function meterFromInterruptJob(raw) {
  const j = String(raw || "").toLowerCase();
  if (j === "high") return "high";
  if (j === "low") return "low";
  if (j === "medium" || j === "mid") return "mid";
  return "none";
}

function meterFromCognitiveJob(raw) {
  const j = String(raw || "").toLowerCase();
  if (j === "high") return "high";
  if (j === "low") return "low";
  if (j === "medium") return "mid";
  return "none";
}

/** fit: good | warn | bad — bad sorts first (mismatch spotlight). */
function buildWorkStyleMismatchRows(fitObj, workPrefs = [], energyPrefs = []) {
  const fit = coerceJobFitShape(fitObj);
  const prefs = workPrefs || [];
  const energy = energyPrefs || [];
  const hasP = (s) => prefs.includes(s);
  const hasE = (s) => energy.includes(s);

  const rows = [];

  const jobTs = String(fit.task_structure || "").toLowerCase();
  let userTs = "—";
  if (hasP("Clear priorities") || hasP("Visual workflow")) userTs = "Clear priorities / structure";
  else if (hasP("Short tasks")) userTs = "Shorter tasks";
  else if (prefs.length) userTs = prefs.slice(0, 2).join(" · ");
  let fitTs = "warn";
  if (jobTs === "structured" && (hasP("Clear priorities") || hasP("Visual workflow") || hasP("Short tasks"))) {
    fitTs = hasP("Short tasks") && !hasP("Clear priorities") ? "warn" : "good";
  } else if (jobTs === "unstructured" && (hasP("Clear priorities") || hasP("Visual workflow"))) fitTs = "bad";
  else if (jobTs === "mixed") fitTs = "warn";
  else if (jobTs === "structured") fitTs = hasP("Clear priorities") || hasP("Visual workflow") ? "good" : "warn";
  if (!jobTs) fitTs = "warn";

  const jobTaskMeter = jobTs === "structured" || jobTs === "unstructured" ? "mid" : jobTs === "mixed" ? "mid" : "none";
  const userTaskMeter = meterLevelFromText(userTs, "task");

  rows.push({
    key: "task_structure",
    label: "Task structure",
    jobText: humanizeFitValue(fit.task_structure) || "—",
    userText: userTs,
    fit: fitTs,
    rank: fitTs === "bad" ? 0 : fitTs === "warn" ? 1 : 2,
    rowTone: fitToRowTone(fitTs),
    jobLevel: jobTaskMeter,
    userLevel: userTaskMeter,
  });

  const jobInt = String(fit.interrupt_frequency || fit.attention_switching || "").toLowerCase();
  let userInt = "—";
  if (hasP("Low interruptions")) userInt = "Low interruptions";
  else if (hasE("Best in quieter settings")) userInt = "Quieter settings";
  let fitInt = "warn";
  if (jobInt === "high" && hasP("Low interruptions")) fitInt = "bad";
  else if (jobInt === "low" && hasP("Low interruptions")) fitInt = "good";
  else if (jobInt === "medium" || jobInt === "") fitInt = "warn";
  else if (jobInt === "low") fitInt = hasP("Low interruptions") ? "good" : "warn";
  else if (jobInt === "high") fitInt = hasE("Best in quieter settings") ? "warn" : "bad";
  if (!jobInt && !fit.attention_switching) fitInt = "warn";

  const intRaw = fit.interrupt_frequency || fit.attention_switching;
  const jobIntMeter = meterFromInterruptJob(intRaw);
  let userIntMeter = "none";
  if (hasP("Low interruptions")) userIntMeter = "low";
  else if (hasE("Best in quieter settings")) userIntMeter = "low";

  rows.push({
    key: "interruptions",
    label: "Interruptions",
    jobText: humanizeFitValue(intRaw) || "—",
    userText: userInt,
    fit: fitInt,
    rank: fitInt === "bad" ? 0 : fitInt === "warn" ? 1 : 2,
    rowTone: fitToRowTone(fitInt),
    jobLevel: jobIntMeter,
    userLevel: userIntMeter,
  });

  const jobCog = String(fit.cognitive_load || "").toLowerCase();
  let userCog = "—";
  if (hasE("Best with short focus sprints") || hasE("Best with frequent breaks")) userCog = "Shorter bursts / breaks";
  else if (hasE("Best with morning deep work") || hasE("Best with afternoon deep work")) userCog = "Deep-focus blocks";
  else if (hasE("Best with one task at a time")) userCog = "One task at a time";
  else if (energy.length) userCog = energy.slice(0, 2).join(" · ");
  let fitCog = "warn";
  if (jobCog === "high" && (hasE("Best with short focus sprints") || hasE("Best with frequent breaks"))) fitCog = "warn";
  else if (jobCog === "high" && (hasE("Best with morning deep work") || hasE("Best with afternoon deep work"))) fitCog = "bad";
  else if (jobCog === "low") fitCog = "good";
  else if (jobCog === "medium") fitCog = "warn";
  if (!jobCog) fitCog = "warn";

  let userCogMeter = "none";
  if (hasE("Best with short focus sprints") || hasE("Best with frequent breaks")) userCogMeter = "low";
  else if (hasE("Best with morning deep work") || hasE("Best with afternoon deep work")) userCogMeter = "high";
  else if (hasE("Best with one task at a time")) userCogMeter = "mid";
  else if (energy.length) userCogMeter = meterLevelFromText(userCog, "cog");

  rows.push({
    key: "cognitive_load",
    label: "Cognitive load",
    jobText: humanizeFitValue(fit.cognitive_load) || "—",
    userText: userCog,
    fit: fitCog,
    rank: fitCog === "bad" ? 0 : fitCog === "warn" ? 1 : 2,
    rowTone: fitToRowTone(fitCog),
    jobLevel: meterFromCognitiveJob(fit.cognitive_load),
    userLevel: userCogMeter,
  });

  const jobWe = String(fit.work_environment || "").toLowerCase();
  let userWe = "—";
  if (hasP("Collaborative team")) userWe = "Collaborative";
  else if (hasP("Quiet work blocks")) userWe = "Quiet blocks";
  else if (hasE("Best with variety")) userWe = "Variety / pace";
  let fitWe = "warn";
  if (jobWe === "fast-paced" && (hasP("Quiet work blocks") || hasP("Low interruptions"))) fitWe = "bad";
  else if (jobWe === "quiet" && hasP("Quiet work blocks")) fitWe = "good";
  else if (jobWe === "collaborative" && hasP("Collaborative team")) fitWe = "good";
  else if (jobWe === "mixed") fitWe = "warn";
  if (!jobWe) fitWe = "warn";

  rows.push({
    key: "work_environment",
    label: "Work environment",
    jobText: humanizeFitValue(fit.work_environment) || "—",
    userText: userWe,
    fit: fitWe,
    rank: fitWe === "bad" ? 0 : fitWe === "warn" ? 1 : 2,
    rowTone: fitToRowTone(fitWe),
    jobLevel: meterLevelFromText(humanizeFitValue(fit.work_environment), "env"),
    userLevel: meterLevelFromText(userWe, "env"),
  });

  const sorted = [...rows].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  return sorted.slice(0, 4);
}

const WS_ROW_ORDER = ["interruptions", "cognitive_load", "task_structure", "work_environment"];

function sortWorkStyleRowsForDisplay(rows) {
  const ix = (k) => {
    const i = WS_ROW_ORDER.indexOf(k);
    return i === -1 ? 99 : i;
  };
  return [...rows].sort((a, b) => ix(a.key) - ix(b.key));
}

function WorkStyleFeatureGlyph({ rowKey }) {
  if (rowKey === "interruptions") {
    return (
      <span className="jsc-ws-feat-ico jsc-ws-feat-ico--alert" aria-hidden="true">
        A
      </span>
    );
  }
  return (
    <span className="jsc-ws-feat-ico jsc-ws-feat-ico--plus" aria-hidden="true">
      +
    </span>
  );
}

function WorkStyleMatchMeter({ level }) {
  const pos = { none: 50, low: 10, mid: 50, high: 90 }[level] ?? 50;
  return (
    <div className="jsc-ws-meter" aria-hidden="true">
      <div className="jsc-ws-meter__track" />
      <span className="jsc-ws-meter__dot" style={{ left: `${pos}%` }} />
    </div>
  );
}

function WorkStyleMatchCard({
  matchPct,
  comparisonRows,
  hasJobSignals,
  profileFitReason,
  strengths = [],
  challenges = [],
}) {
  const pctLabel = matchPct != null ? `${Math.round(matchPct)}%` : "—";
  const rows = sortWorkStyleRowsForDisplay(comparisonRows);
  const safeTone = (row) => row.rowTone || (row.fit === "bad" ? "mismatch" : row.fit === "warn" ? "partial" : "aligned");
  const jl = (row) => row.jobLevel || "none";

  return (
    <div className="jsc-ws-detailed">
      <div className="jsc-ws-detailed__head">
        <span className="jsc-ws-detailed__head-title">Detailed Breakdown</span>
        <span className="jsc-ws-detailed__head-pct">Match {pctLabel}</span>
      </div>

      {!hasJobSignals ? (
        <p className="jsc-ws-detailed__fallback jsc-muted-line">
          Environment signals weren&apos;t extracted from this posting—your score still uses your profile and occupation.
          Add work preferences in your career profile for a richer comparison.
        </p>
      ) : null}

      <div className="jsc-ws-grid" role="table" aria-label="Job environment compared to your preferences">
        <div className="jsc-ws-grid__head" role="row">
          <span className="jsc-ws-grid__h jsc-ws-grid__h--feat" role="columnheader">
            Feature
          </span>
          <span className="jsc-ws-grid__h" role="columnheader">
            Job environment
          </span>
          <span className="jsc-ws-grid__h jsc-ws-grid__h--fit" role="columnheader">
            Fit
          </span>
          <span className="jsc-ws-grid__h" role="columnheader">
            Your preference
          </span>
          </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className={`jsc-ws-grid__row jsc-ws-grid__row--${safeTone(row)}`}
            role="row"
          >
            <div className="jsc-ws-grid__feat" role="rowheader">
              <WorkStyleFeatureGlyph rowKey={row.key} />
              <span className="jsc-ws-grid__feat-label">{row.label}</span>
            </div>
            <div className="jsc-ws-grid__cell jsc-ws-grid__cell--job">
              <div className="jsc-ws-grid__job-row">
                <span className="jsc-ws-grid__val">{row.jobText}</span>
                <div className="jsc-ws-grid__meter-block">
                  <WorkStyleMatchMeter level={jl(row)} />
                  <span className="jsc-ws-grid__cap">{meterCaption(jl(row))}</span>
                </div>
              </div>
            </div>
            <div className="jsc-ws-grid__fit" role="cell">
              <span
                className={`jsc-ws-fit-pill jsc-ws-fit-pill--${row.fit}`}
                title={
                  row.fit === "good" ? "Aligned" : row.fit === "bad" ? "Misaligned" : "Partial / mixed"
                }
              >
                {row.fit === "good" ? "✓" : row.fit === "bad" ? "!" : "≈"}
              </span>
            </div>
            <div className="jsc-ws-grid__cell jsc-ws-grid__cell--you">
              <span className="jsc-ws-grid__val">{row.userText}</span>
            </div>
          </div>
        ))}
      </div>

      {profileFitReason || strengths.length > 0 || challenges.length > 0 ? (
        <div className="jsc-ws-footer">
          {profileFitReason ? (
            <div className="jsc-ws-footer__block jsc-ws-footer__block--profile">
              <span className="jsc-ws-footer__badge">Profile fit</span>
              <p className="jsc-ws-footer__text">{neutralizeScoringCopy(profileFitReason)}</p>
            </div>
            ) : null}
          {strengths.length > 0 ? (
            <div className="jsc-ws-footer__block jsc-ws-footer__block--strengths">
              <span className="jsc-ws-footer__badge jsc-ws-footer__badge--on-dark">Strengths</span>
              <ul className="jsc-ws-footer__list">
                {strengths.slice(0, 5).map((s, i) => (
                  <li key={i}>{capitalizeFirst(s)}</li>
                ))}
              </ul>
          </div>
          ) : null}
          {challenges.length > 0 ? (
            <div className="jsc-ws-footer__block jsc-ws-footer__block--watch">
              <span className="jsc-ws-footer__badge">Watch-outs</span>
              <ul className="jsc-ws-footer__list jsc-ws-footer__list--watch">
                {challenges.slice(0, 5).map((c, i) => (
                  <li key={i}>{capitalizeFirst(c)}</li>
                ))}
              </ul>
        </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function meterCaption(level) {
  if (level === "high") return "HIGH";
  if (level === "low") return "LOW";
  if (level === "mid") return "MIXED";
  return "—";
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
  return (
    <svg className={cls} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...stroke} />
      <circle cx="9" cy="7" r="4" {...stroke} />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" {...stroke} />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" {...stroke} />
    </svg>
  );
}

function ScoreBreakdownRow({ rowId, label, pct, expanded, onToggle, children, variant = "soft", hint }) {
  const safe = pct == null ? null : Math.max(0, Math.min(100, Number(pct)));
  const tone = barToneClass(safe);
  const showBar = safe != null;
  const scoreText = showBar ? String(Math.round(safe)) : "—";
  const ariaScore = showBar ? `Score ${scoreText} out of 100` : "Score not available yet";
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
  onOpenHistory,
  onSkillProfileChange,
  jobScoreBusy = false,
  jobFitFeatures = null,
  ariaHeadingId = "jsc-inline-heading",
  /** When true, omit the inline “Start preparing for interview” link (e.g. modal provides its own CTA). */
  hideInterviewPrepCta = false,
}) {
  const navigate = useNavigate();
  const [helpfulVote, setHelpfulVote] = useState(null);
  const [bdOpen, setBdOpen] = useState({ adhd: false, technical: true, soft: false });
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

  const softCollapsedHint =
    softRowPct == null && softDebug?.soft_skills_ui_hint
      ? neutralizeScoringCopy(softDebug.soft_skills_ui_hint)
      : undefined;

  const canDnD = typeof onSkillProfileChange === "function";

  const geminiFit = result?.factor_breakdown?.gemini_job_fit;
  const normalizedJobFit = useMemo(() => {
    const norm = geminiFit?.normalized;
    if (norm && typeof norm === "object" && Object.keys(norm).length > 0) return norm;
    if (jobFitFeatures && typeof jobFitFeatures === "object") return jobFitFeatures;
    return {};
  }, [geminiFit, jobFitFeatures]);

  const hasJobFitSignals = useMemo(() => {
    const f = coerceJobFitShape(normalizedJobFit);
    return [
      f.task_structure,
      f.interrupt_frequency,
      f.attention_switching,
      f.cognitive_load,
      f.work_environment,
    ].some((v) => v != null && String(v).trim());
  }, [normalizedJobFit]);

  const workStyleComparisonRows = useMemo(
    () =>
      buildWorkStyleMismatchRows(
        normalizedJobFit,
        factors.work_preferences?.selected,
        factors.energy_patterns?.selected,
      ),
    [normalizedJobFit, factors.work_preferences?.selected, factors.energy_patterns?.selected],
  );

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
  const scoreBand = !hasResult ? null : scorePct >= 71 ? "high" : scorePct >= 41 ? "mid" : "low";
  const showInterviewCta = hasResult && score >= 71 && !hideInterviewPrepCta;
  const confidencePct = hasResult ? Math.round((result.match_confidence ?? 0) * 100) : 0;
  const donutLoading = Boolean(jobScoreBusy);

  const strengths = (result?.key_strengths || []).map((s) => String(s).trim()).filter(Boolean);
  const challenges = (result?.key_challenges || []).map((s) => String(s).trim()).filter(Boolean);

  const adhdWorkStylePct = workStylePct;

  const workStyleRowHint =
    adhdWorkStylePct == null
      ? "Expand to compare once work preferences are saved."
      : adhdWorkStylePct < 50
        ? "Alignment is limited; expand for suggestions."
        : "Expand to compare job vs. your preferences.";

  const collapseBreakdown = () => setBdOpen({ adhd: false, technical: false, soft: false });

  return (
    <div className="jsc-inline jsc-inline--fullbleed" role="region" aria-labelledby={ariaHeadingId}>
      <div className="jsc-panel jsc-panel--inline jsc-panel--assessment jsc-panel--jobmatch-shell">
        <div className="jsc-assess-topbar">
          <div className="jsc-assess-brand">
            <p className="jsc-assess-brand-title">Career Compatibility Score</p>
            <p id={ariaHeadingId} className="jsc-assess-role">
              Assessment for: <strong>{occupationName || "this role"}</strong>
            </p>
          </div>
          <div className="jsc-assess-top-actions">
          <div className="jsc-helpful-box" aria-label="Was it helpful?">
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
            </div>
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
              label="Work Style & Focus Alignment"
              variant="workStyle"
              hint={workStyleRowHint}
              pct={adhdWorkStylePct}
              expanded={bdOpen.adhd}
              onToggle={() => setBdOpen((o) => ({ ...o, adhd: !o.adhd }))}
            >
              <WorkStyleMatchCard
                matchPct={adhdWorkStylePct}
                comparisonRows={workStyleComparisonRows}
                hasJobSignals={hasJobFitSignals}
                profileFitReason={factors.adhd_type?.reasoning}
                strengths={strengths}
                challenges={challenges}
              />
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
                <p className="jsc-dnd-hint">Drag chips between columns to update your profile — scores refresh after save.</p>
              ) : canDnD ? (
                <p className="jsc-dnd-hint">Drag chips between columns to update your profile — scores refresh after save.</p>
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

        {hasResult && typeof onOpenHistory === "function" ? (
          <div className="jsc-compare-footer">
            <button type="button" className="simplify-next-step-btn jsc-compare-btn" onClick={onOpenHistory}>
              Compare with Previous Simplified JDs
            </button>
          </div>
        ) : null}

{showInterviewCta ? (
          <div className="jsc-cta-wrap">
            <Link className="jsc-interview-cta" to="/interview-prep">
              Start preparing for interview
            </Link>
          </div>
        ) : null}

        {hasResult ? (
          <div className="jsc-cta-wrap">
            <button
              type="button"
              className="jsc-interview-cta"
              onClick={() =>
                navigate("/day-in-life", {
                  state: {
                    job_title: occupationName || "this role",
                    adhd_type: getAdhdTypeFromProfile(),
                  },
                })
              }
            >
            See a day in this job
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import JobExperienceHub from "../components/experience-hub/JobExperienceHub.jsx";
import { fetchDayInLife } from "../services/dayInLifeApi.js";
import { putDayInLifeSession } from "../services/dayInLifeSessionsApi.js";
import { DayInLifeCardIcon } from "../components/DayInLifeCardIcon.jsx";
import { dilIconVariantForBlock } from "../components/dayInLifeCardIconPick.js";
import { recordDayInLifeRecent } from "../utils/dayInLifeRecents.js";
import { dilCacheGet, dilCacheSet } from "../utils/dayInLifeCache.js";
import { getDefaultAdhdSlugForDayInLife } from "../utils/experienceHubProfile.js";
import { hasCloudSessionCredentials, readCredentials } from "../utils/cloudSync.js";
import {
  INTERVIEW_PREP_MIN_SCORE,
  interviewPrepEligibilityForDayInLife,
} from "../utils/jobScorePersistence.js";
import { goToInterviewPrepWorkspaceFromListing } from "../utils/interviewPrepNav.js";
import { resumeInterviewPrepFromSavedScoreRow } from "../utils/interviewPrepResume.js";

const ENERGY_LABELS = {
  high:   { label: "High focus required", colour: "#dc2626", bg: "#fff5f5", pillBg: "#fee2e2" },
  medium: { label: "Medium energy",       colour: "#d97706", bg: "#fffbf0", pillBg: "#fef3c7" },
  low:    { label: "Low energy",          colour: "#16a34a", bg: "#f4fdf6", pillBg: "#dcfce7" },
  break:  { label: "Break",               colour: "#3b82f6", bg: "#eff6ff", pillBg: "#dbeafe" },
};

const LAST_PARAMS_KEY = "dil_last_params";

function _saveLastParams(job, adhd) {
  try {
    sessionStorage.setItem(LAST_PARAMS_KEY, JSON.stringify({ job_title: job, adhd_type: adhd }));
  } catch {
    /* ignore */
  }
}
function _loadLastParams() {
  try {
    const raw = sessionStorage.getItem(LAST_PARAMS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatAdhdLabel(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "hyperactive" || s === "hyperactive-impulsive") return "Hyperactive";
  if (s === "inattentive") return "Inattentive";
  if (s === "combined") return "Combined";
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function CareerProfileBackLink({ onClick, label }) {
  return (
    <div className="q-profile-prev-top day-in-life-back">
      <button type="button" className="button ghost q-profile-prev-btn q-profile-prev-btn--matrix" onClick={onClick}>
        <span className="q-profile-prev-icon" aria-hidden="true">
          ←
        </span>
        {label}
      </button>
    </div>
  );
}

function parseTime(t = "") {
  const m = t.match(/^(\d+:\d+)\s*(AM|PM)?/i);
  if (!m) return { hm: t, period: "" };
  return { hm: m[1], period: (m[2] || "").toUpperCase() };
}

export default function DayInLifePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const st = location.state ?? {};
  const _last = (!st.job_title && !searchParams.get("job_title")) ? _loadLastParams() : null;
  const job_title_raw = String(st.job_title ?? searchParams.get("job_title") ?? _last?.job_title ?? "").trim();
  const adhd_raw = String(st.adhd_type ?? searchParams.get("adhd_type") ?? _last?.adhd_type ?? "").trim();
  const defaultAdhd = useMemo(() => getDefaultAdhdSlugForDayInLife(), []);
  const job_title = job_title_raw;
  const adhd_type = adhd_raw || (job_title ? defaultAdhd : "");

  const cachedTimeline = useMemo(
    () => (job_title && adhd_type ? dilCacheGet(job_title, adhd_type) : null),
    [job_title, adhd_type],
  );
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveMsgTone, setSaveMsgTone] = useState("info");

  useEffect(() => {
    if (!job_title || !adhd_type) return;
    let cancelled = false;

    _saveLastParams(job_title, adhd_type);

    if (cachedTimeline) {
      return;
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setTimeline(null);
    });
    fetchDayInLife(job_title, adhd_type)
      .then((data) => {
        if (!cancelled) {
          dilCacheSet(job_title, adhd_type, data.timeline);
          setTimeline(data.timeline);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job_title, adhd_type, cachedTimeline]);

  const visibleTimeline = timeline ?? cachedTimeline;

  const occupationHint = String(st.occupation ?? searchParams.get("occupation") ?? "").trim();
  const matchScoreHint = st.match_score_pct ?? searchParams.get("match_score") ?? null;

  const interviewPrepAccess = useMemo(
    () =>
      interviewPrepEligibilityForDayInLife({
        titleCandidates: [job_title, occupationHint],
        overrideScorePct: matchScoreHint,
      }),
    [job_title, occupationHint, matchScoreHint],
  );

  const interviewPrepLockedHint = useMemo(() => {
    if (!interviewPrepAccess.hasScore) {
      return `Run a job match score for this role on Simplify Job Description first. Interview prep unlocks at ${INTERVIEW_PREP_MIN_SCORE}% compatibility.`;
    }
    if (interviewPrepAccess.eligible) return "";
    const gap = INTERVIEW_PREP_MIN_SCORE - (interviewPrepAccess.scorePct ?? 0);
    return `Interview prep unlocks at ${INTERVIEW_PREP_MIN_SCORE}% compatibility. Your score is ${interviewPrepAccess.scorePct}% (${gap}% below). Improve your match to unlock.`;
  }, [interviewPrepAccess]);

  const openInterviewPrep = () => {
    if (!interviewPrepAccess.eligible) return;
    if (interviewPrepAccess.scoreRow) {
      resumeInterviewPrepFromSavedScoreRow(interviewPrepAccess.scoreRow);
    }
    goToInterviewPrepWorkspaceFromListing(navigate);
  };

  useEffect(() => {
    if (!job_title || !adhd_type || !visibleTimeline || loading) return;
    if (error) return;
    recordDayInLifeRecent(job_title, adhd_type);
  }, [job_title, adhd_type, visibleTimeline, loading, error]);

  const saveToAccount = async () => {
    if (!visibleTimeline?.length) return;
    setSaveMsg(null);
    if (!hasCloudSessionCredentials()) {
      setSaveMsgTone("info");
      setSaveMsg("Sign in via Settings to save this day to your account.");
      return;
    }
    setSaveBusy(true);
    try {
      await putDayInLifeSession(readCredentials(), {
        job_title,
        adhd_type,
        timeline: visibleTimeline,
      });
      setSaveMsgTone("success");
      setSaveMsg("Saved to your account.");
    } catch (e) {
      setSaveMsgTone("error");
      setSaveMsg(e?.message || "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  };

  if (!job_title) {
    return (
      <main className="day-in-life-page">
        <JobExperienceHub mode="dil" />
      </main>
    );
  }

  const adhdDisplay = formatAdhdLabel(adhd_type);

  return (
    <main className="day-in-life-page">
      <header className="simplify-hero dil-hero-override">
        <div className="simplify-hero-grid">
          <div className="simplify-hero-copy">
            <p className="simplify-hero-eyebrow">Energy mapped · Hour by hour</p>
            <h1 className="simplify-hero-title">A Day in the Life</h1>
            <p className="simplify-hero-lead">
              What a typical workday looks like for <strong>{job_title}</strong> with <strong>{adhdDisplay || adhd_type}</strong> ADHD, energy mapped hour by hour.
            </p>
            <p className="dil-disclaimer">
              This is a general simulation and may not reflect your exact experience. Schedules, demands, and support vary widely by company, team, and role.
            </p>
            <div className="dil-hero-actions">
              <button type="button" className="simplify-hero-back" onClick={() => navigate(-1)}>
                ← Back
              </button>
              <div className="dil-hero-actions__end">
                {interviewPrepAccess.hasScore || matchScoreHint != null ? (
                  interviewPrepAccess.eligible ? (
                    <button
                      type="button"
                      className="dil-interview-prep-btn"
                      onClick={openInterviewPrep}
                    >
                      Start preparing for interview
                    </button>
                  ) : (
                    <span
                      className="dil-btn-locked-wrap"
                      title={interviewPrepLockedHint}
                      tabIndex={0}
                      aria-label={`Start preparing for interview. ${interviewPrepLockedHint}`}
                    >
                      <button
                        type="button"
                        className="dil-interview-prep-btn dil-interview-prep-btn--locked"
                        disabled
                        aria-disabled="true"
                        tabIndex={-1}
                      >
                        Start preparing for interview
                      </button>
                      <span className="dil-btn-locked-hint" role="tooltip">
                        {interviewPrepLockedHint}
                      </span>
                    </span>
                  )
                ) : null}
                {visibleTimeline && !loading ? (
                  <div className="dil-hero-actions__save-stack">
                    <button
                      type="button"
                      className="dil-save-day-btn"
                      onClick={() => void saveToAccount()}
                      disabled={saveBusy}
                    >
                      {saveBusy ? "Saving…" : "Save this day"}
                    </button>
                    {saveMsg ? (
                      <p className={`dil-save-msg dil-save-msg--${saveMsgTone}`} role="status">
                        {saveMsg}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="day-in-life-legend">
            {Object.entries(ENERGY_LABELS).map(([key, { label, colour }]) => (
              <span key={key} className="dil-legend-item">
                <span className="dil-legend-dot" style={{ background: colour }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {loading && (
        <div className="day-life-loading" aria-busy="true" aria-live="polite">
          <div className="day-life-loading__inner">
            <span className="day-life-loading__pulse" aria-hidden="true" />
            <p className="day-life-loading__txt">Painting a gentle picture of your workday…</p>
          </div>
          <ul className="day-life-skeleton" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="day-life-skeleton__card" />
            ))}
          </ul>
        </div>
      )}

      {error && !loading ? (
        <div className="day-in-life-error">
          <p>Something went wrong: {error}</p>
          <CareerProfileBackLink label="Go back" onClick={() => navigate(-1)} />
        </div>
      ) : null}

      {visibleTimeline && !loading && (
        <div className="day-in-life-timeline">
          {visibleTimeline.map((block, i) => {
            const energy = ENERGY_LABELS[block.energy_level] ?? ENERGY_LABELS.medium;
            const { hm, period } = parseTime(block.time);
            const iconVariant = dilIconVariantForBlock(block, i);
            return (
              <div
                key={i}
                className="timeline-block"
                style={{ "--dot-color": energy.colour }}
              >
                <div className="timeline-time">
                  <span className="timeline-time-hm">{hm}</span>
                  {period && <span className="timeline-time-period">{period}</span>}
                </div>
                <div className="timeline-rail" aria-hidden="true" />
                <div
                  className="timeline-content"
                  style={{
                    "--card-bg": energy.bg,
                  }}
                >
                  <div className="timeline-content-head">
                    <DayInLifeCardIcon variant={iconVariant} />
                    <div className="timeline-content-text">
                      <p className="timeline-task">{block.task}</p>
                      <p className="timeline-description">{block.description}</p>
                    </div>
                  </div>
                  <div className="timeline-footer">
                    <span
                      className="timeline-energy-badge"
                      style={{ background: energy.pillBg, color: energy.colour }}
                    >
                      <span className="tl-dot" style={{ background: energy.colour }} />
                      {energy.label}
                    </span>
                    {block.adhd_tip && (
                      <span className="timeline-adhd-chip">💡 {block.adhd_tip}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

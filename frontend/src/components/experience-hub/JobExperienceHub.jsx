import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchDayInLifeSessions } from "../../services/dayInLifeSessionsApi.js";
import { fetchInterviewPrepSessions } from "../../services/interviewPrepProgressApi.js";
import { hasCloudSessionCredentials, readCredentials } from "../../utils/cloudSync.js";
import { dilCacheSet } from "../../utils/dayInLifeCache.js";
import { readDayInLifeRecents } from "../../utils/dayInLifeRecents.js";
import { displayTitleForScoreRow, mergeScoreRowsForHub } from "../../utils/experienceHubJobs.js";
import { getDefaultAdhdSlugForDayInLife } from "../../utils/experienceHubProfile.js";
import {
  jobContextFromInterviewSessionSummary,
  jobContextFromSavedScoreRow,
} from "../../utils/interviewPrepHelpers.js";
import { applyInterviewPrepJobContext } from "../../utils/interviewPrepResume.js";

function formatAdhdLabel(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "hyperactive" || s === "hyperactive-impulsive") return "Hyperactive";
  if (s === "inattentive") return "Inattentive";
  if (s === "combined") return "Combined";
  if (!raw) return "";
  return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
}

function interviewSessionLabel(sess) {
  const s = sess?.simplified_job;
  if (!s || typeof s !== "object") return "Saved interview prep";
  const t = String(s.job_title || "").trim();
  if (t) return t.slice(0, 120);
  const bi = String(s.basic_info || "").trim().split("\n")[0];
  return bi ? bi.slice(0, 120) : "Saved interview prep";
}

/**
 * @param {{ mode: 'dil' | 'interview' }} props
 */
export default function JobExperienceHub({ mode }) {
  const navigate = useNavigate();
  const defaultAdhd = getDefaultAdhdSlugForDayInLife();
  const [localRecents] = useState(() => readDayInLifeRecents());
  const [cloudDil, setCloudDil] = useState([]);
  const [cloudInterview, setCloudInterview] = useState([]);
  const [cloudErr, setCloudErr] = useState(null);

  const jobRows = mergeScoreRowsForHub().filter((row) => jobContextFromSavedScoreRow(row));

  useEffect(() => {
    let cancelled = false;
    if (!hasCloudSessionCredentials()) return undefined;
    const cred = readCredentials();
    if (!cred?.userId || !cred?.passKey) return undefined;

    (async () => {
      try {
        if (mode === "dil") {
          const data = await fetchDayInLifeSessions(cred);
          if (cancelled) return;
          const list = Array.isArray(data?.sessions) ? data.sessions : [];
          setCloudDil(list);
        } else {
          const data = await fetchInterviewPrepSessions(cred);
          if (cancelled) return;
          const list = Array.isArray(data?.sessions) ? data.sessions : [];
          setCloudInterview(list.filter((s) => jobContextFromInterviewSessionSummary(s)));
        }
      } catch (e) {
        if (!cancelled) setCloudErr(e?.message || "Could not load cloud saves.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const openDil = (job, adhd) => {
    const j = String(job || "").trim();
    const a = String(adhd || "").trim() || defaultAdhd;
    if (!j) return;
    const q = new URLSearchParams({ job_title: j, adhd_type: a });
    navigate(`/day-in-life?${q.toString()}`);
  };

  const openDilFromCloud = (sess) => {
    const tl = Array.isArray(sess.timeline) ? sess.timeline : [];
    dilCacheSet(sess.job_title, sess.adhd_type, tl);
    openDil(sess.job_title, sess.adhd_type);
  };

  const openInterviewFromRow = (row) => {
    const ctx = jobContextFromSavedScoreRow(row);
    if (!ctx) return;
    applyInterviewPrepJobContext(ctx);
    window.location.assign("/interview-prep");
  };

  const openInterviewFromCloud = (sess) => {
    const ctx = jobContextFromInterviewSessionSummary(sess);
    if (!ctx) return;
    applyInterviewPrepJobContext(ctx);
    window.location.assign("/interview-prep");
  };

  const title = mode === "dil" ? "Day in the Life" : "Interview Prep";
  const lead =
    mode === "dil"
      ? "Pick a job you have already simplified, reopen a timeline from this device, or load one saved to your account."
      : "Pick a simplified job from your history, or continue interview prep you saved to your account.";

  return (
    <div className="experience-hub">
      <header className="experience-hub__head">
        <p className="experience-hub__eyebrow">{mode === "dil" ? "Energy mapped" : "STAR method"}</p>
        <h1 className="experience-hub__title">{title}</h1>
        <p className="experience-hub__lead">{lead}</p>
        <p className="experience-hub__actions">
          <Link className="experience-hub__link" to="/simplify-job-description">
            Simplify a new job description
          </Link>
          <span className="experience-hub__dot" aria-hidden="true">
            ·
          </span>
          <Link className="experience-hub__link" to={mode === "interview" ? "/saved-insights/interview" : "/saved-insights/day-in-life"}>
            Saved Insights
          </Link>
        </p>
      </header>

      {cloudErr ? <p className="experience-hub__warn">{cloudErr}</p> : null}

      <section className="experience-hub__section" aria-labelledby="hub-jd-heading">
        <h2 className="experience-hub__h2" id="hub-jd-heading">
          Jobs from your saved scores &amp; recent matches
        </h2>
        <p className="experience-hub__hint">
          These come from <strong>Simplify Job Description</strong> (saved scores and recent runs). ADHD lens defaults
          to your career profile ({formatAdhdLabel(defaultAdhd)}).
        </p>
        {!jobRows.length ? (
          <p className="experience-hub__empty">No simplified jobs found yet. Simplify a posting first.</p>
        ) : (
          <ul className="experience-hub__list">
            {jobRows.map((row, i) => {
              const titleText = displayTitleForScoreRow(row);
              const apiTitle = String(row?.simplifiedSnapshot?.job_title || "").trim() || titleText;
              return (
                <li key={`${row.jobTitleNorm}|${row.simplifiedVerStamp}|${i}`} className="experience-hub__card">
                  <div className="experience-hub__card-text">
                    <p className="experience-hub__card-title">{titleText}</p>
                    {row.occupationName ? (
                      <p className="experience-hub__card-meta">Profile: {row.occupationName}</p>
                    ) : null}
                  </div>
                  <div className="experience-hub__card-actions">
                    {mode === "dil" ? (
                      <button type="button" className="experience-hub__btn" onClick={() => openDil(apiTitle, defaultAdhd)}>
                        Open day in the life
                      </button>
                    ) : (
                      <button type="button" className="experience-hub__btn" onClick={() => openInterviewFromRow(row)}>
                        Open interview prep
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mode === "dil" ? (
        <>
          <section className="experience-hub__section" aria-labelledby="hub-recent-dil-heading">
            <h2 className="experience-hub__h2" id="hub-recent-dil-heading">
              Recent timelines (this browser)
            </h2>
            {!localRecents.length ? (
              <p className="experience-hub__empty">None yet — generate a day in the life and it will show here.</p>
            ) : (
              <ul className="experience-hub__list">
                {localRecents.map((r, i) => (
                  <li key={`${r.job_title}|${r.adhd_type}|${i}`} className="experience-hub__card">
                    <div className="experience-hub__card-text">
                      <p className="experience-hub__card-title">{r.job_title}</p>
                      <p className="experience-hub__card-meta">{formatAdhdLabel(r.adhd_type) || r.adhd_type}</p>
                    </div>
                    <div className="experience-hub__card-actions">
                      <button type="button" className="experience-hub__btn" onClick={() => openDil(r.job_title, r.adhd_type)}>
                        Open
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="experience-hub__section" aria-labelledby="hub-cloud-dil-heading">
            <h2 className="experience-hub__h2" id="hub-cloud-dil-heading">
              Saved to your account
            </h2>
            {!hasCloudSessionCredentials() ? (
              <p className="experience-hub__empty">
                <Link to="/settings">Sign in via Settings</Link> to save and load timelines from any device.
              </p>
            ) : !cloudDil.length ? (
              <p className="experience-hub__empty">No saved timelines yet. Generate a day, then use &quot;Save this day&quot;.</p>
            ) : (
              <ul className="experience-hub__list">
                {cloudDil.map((sess) => (
                  <li key={String(sess.id)} className="experience-hub__card">
                    <div className="experience-hub__card-text">
                      <p className="experience-hub__card-title">{sess.job_title}</p>
                      <p className="experience-hub__card-meta">{formatAdhdLabel(sess.adhd_type) || sess.adhd_type}</p>
                    </div>
                    <div className="experience-hub__card-actions">
                      <button type="button" className="experience-hub__btn" onClick={() => openDilFromCloud(sess)}>
                        Open saved day
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section className="experience-hub__section" aria-labelledby="hub-cloud-ip-heading">
          <h2 className="experience-hub__h2" id="hub-cloud-ip-heading">
            Interview prep saved to your account
          </h2>
          {!hasCloudSessionCredentials() ? (
            <p className="experience-hub__empty">
              <Link to="/settings">Sign in via Settings</Link> to list cloud-saved prep for this account.
            </p>
          ) : !cloudInterview.length ? (
            <p className="experience-hub__empty">No cloud saves yet — your work is still stored locally per job.</p>
          ) : (
            <ul className="experience-hub__list">
              {cloudInterview.map((sess) => (
                <li key={String(sess.id)} className="experience-hub__card">
                  <div className="experience-hub__card-text">
                    <p className="experience-hub__card-title">{interviewSessionLabel(sess)}</p>
                    <p className="experience-hub__card-meta">
                      {sess.updated_at
                        ? new Date(sess.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                        : ""}
                    </p>
                  </div>
                  <div className="experience-hub__card-actions">
                    <button type="button" className="experience-hub__btn" onClick={() => openInterviewFromCloud(sess)}>
                      Resume
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

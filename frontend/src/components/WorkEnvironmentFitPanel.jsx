import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  WORK_STYLE_OPTIONS,
  SUPPORT_NEED_OPTIONS,
  ENERGY_PATTERN_OPTIONS,
  MAX_WORK_ENV_PICKS,
} from "../constants/careerProfileWorkOptions.js";
import { SimplifyLineIcon } from "./SimplifyLineIcons.jsx";

function WefColumn({ title, tone, items }) {
  const boxClass =
    tone === "good" ? "good" : tone === "warn" ? "warn" : "neutral";
  const chipClass =
    tone === "good" ? "good" : tone === "warn" ? "warn" : "neutral";
  const empty = !items?.length;

  return (
    <div
      className={`jsc-assess-box jsc-assess-box--${boxClass} jsc-skill-subbox jsc-wef-bucket`}
      role="group"
      aria-label={title}
    >
      <p className="jsc-assess-box-head">{title}</p>
      {empty ? (
        <p className="jsc-muted-line">Nothing listed yet</p>
      ) : (
        <div className="jsc-chip-row" role="list">
          {items.map((t) => (
            <span key={t} className={`jsc-mini-chip jsc-mini-chip--${chipClass}`} role="listitem">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function toggleInList(list, value, max) {
  const i = list.indexOf(value);
  if (i >= 0) {
    return list.filter((_, idx) => idx !== i);
  }
  if (list.length >= max) return list;
  return [...list, value];
}

function PrefChip({ label, selected, disabled, onToggle }) {
  return (
    <button
      type="button"
      className={`jsc-wef-chip-opt${selected ? " jsc-wef-chip-opt--on" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="jsc-wef-chip-opt__txt">{label}</span>
      {selected ? (
        <span className="jsc-wef-chip-opt__check" aria-hidden="true">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function DrawerSection({ id, title, badge, spaced, children }) {
  return (
    <section
      id={id}
      className={`jsc-wef-drawer-section${spaced ? " jsc-wef-drawer-section--spaced" : ""}`}
      aria-labelledby={id ? `${id}-heading` : undefined}
    >
      <div className="jsc-wef-drawer-section-head">
        <div className="jsc-wef-drawer-section-titles">
          <h4 id={id ? `${id}-heading` : undefined} className="jsc-wef-drawer-section-title">
            {title}
          </h4>
          <span className="jsc-wef-drawer-badge">{badge}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

export function WorkEnvironmentFitPanel({
  workEnvironmentFit,
  busy,
  questionnaireBaseline,
  onPreviewPatch,
  onSavePatchToProfile,
}) {
  const dialogTitleId = useId();
  const workSectionId = useId();
  const supportSectionId = useId();
  const energySectionId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({
    work_preferences: [],
    support_needs: [],
    energy_patterns: [],
  }));
  const closeBtnRef = useRef(null);

  const baselineKey = useMemo(
    () =>
      questionnaireBaseline
        ? JSON.stringify(questionnaireBaseline)
        : "",
    [questionnaireBaseline],
  );

  useEffect(() => {
    if (!drawerOpen || !questionnaireBaseline) return;
    const allowedEnergy = new Set(ENERGY_PATTERN_OPTIONS);
    setDraft({
      work_preferences: [...(questionnaireBaseline.work_preferences || [])],
      support_needs: [...(questionnaireBaseline.support_needs || [])],
      energy_patterns: [...(questionnaireBaseline.energy_patterns || [])].filter((x) =>
        allowedEnergy.has(x),
      ),
    });
  }, [drawerOpen, baselineKey, questionnaireBaseline]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [drawerOpen]);

  const allowPreview = typeof onPreviewPatch === "function";
  const allowSaveProfile = typeof onSavePatchToProfile === "function";

  const comfortable = workEnvironmentFit?.comfortable_areas || [];
  const challenges = workEnvironmentFit?.challenge_areas || [];
  const supports = workEnvironmentFit?.recommended_supports || [];

  const patchFromDraft = useCallback(
    () => ({
      work_preferences: draft.work_preferences,
      support_needs: draft.support_needs,
      energy_patterns: draft.energy_patterns,
    }),
    [draft],
  );

  const handleRecalculate = useCallback(async () => {
    if (typeof onPreviewPatch !== "function") return;
    await onPreviewPatch(patchFromDraft());
  }, [onPreviewPatch, patchFromDraft]);

  const handleSaveProfile = useCallback(() => {
    if (typeof onSavePatchToProfile !== "function") return;
    onSavePatchToProfile(patchFromDraft());
    setDrawerOpen(false);
  }, [onSavePatchToProfile, patchFromDraft]);

  const handleClearAll = useCallback(() => {
    setDraft({
      work_preferences: [],
      support_needs: [],
      energy_patterns: [],
    });
  }, []);

  const pickBadge = `Pick up to ${MAX_WORK_ENV_PICKS}`;

  return (
    <div className="jsc-wef">
      {allowPreview ? (
        <div className="jsc-wef-head">
          <button
            type="button"
            className="jsc-wef-adjust-btn"
            onClick={() => setDrawerOpen(true)}
            disabled={busy}
          >
            <SimplifyLineIcon name="edit" className="jsc-wef-adjust-btn__ico" aria-hidden />
            Adjust preferences
          </button>
        </div>
      ) : null}

      <div
        className="jsc-skill-buckets-row jsc-skill-buckets-row--3 jsc-wef-columns"
        role="group"
        aria-label="Work environment: comfortable areas, challenges, and supports"
      >
        <WefColumn title="Comfortable areas" tone="good" items={comfortable} />
        <WefColumn title="Potential challenges" tone="warn" items={challenges} />
        <WefColumn title="Helpful supports" tone="neutral" items={supports} />
      </div>

      {allowPreview && drawerOpen ? (
        <div
          className="jsc-wef-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div
            className="jsc-wef-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jsc-wef-drawer-handle" aria-hidden="true" />

            <div className="jsc-wef-drawer-scroll">
              <header className="jsc-wef-drawer-head">
                <h3 id={dialogTitleId} className="jsc-wef-drawer-title">
                  Adjust work preferences
                </h3>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="jsc-wef-drawer-close"
                  aria-label="Close"
                  onClick={() => setDrawerOpen(false)}
                >
                  ×
                </button>
              </header>

              <div className="jsc-wef-drawer-banner" role="note">
                <p className="jsc-wef-drawer-banner__txt">
                  Try different combinations. <strong>Recalculate match</strong> updates this page temporarily.{" "}
                  <strong>Save to profile</strong> keeps your picks in your career profile.
                </p>
              </div>

              <DrawerSection
                id={workSectionId}
                title="Work preferences"
                badge={pickBadge}
                spaced={false}
              >
                <div className="jsc-wef-chip-grid">
                  {WORK_STYLE_OPTIONS.map((opt) => (
                    <PrefChip
                      key={opt}
                      label={opt}
                      selected={draft.work_preferences.includes(opt)}
                      disabled={busy}
                      onToggle={() =>
                        setDraft((d) => ({
                          ...d,
                          work_preferences: toggleInList(d.work_preferences, opt, MAX_WORK_ENV_PICKS),
                        }))
                      }
                    />
                  ))}
                </div>
              </DrawerSection>

              <DrawerSection
                id={supportSectionId}
                title="Support needs"
                badge={pickBadge}
                spaced
              >
                <div className="jsc-wef-chip-grid">
                  {SUPPORT_NEED_OPTIONS.map((opt) => (
                    <PrefChip
                      key={opt}
                      label={opt}
                      selected={draft.support_needs.includes(opt)}
                      disabled={busy}
                      onToggle={() =>
                        setDraft((d) => ({
                          ...d,
                          support_needs: toggleInList(d.support_needs, opt, MAX_WORK_ENV_PICKS),
                        }))
                      }
                    />
                  ))}
                </div>
              </DrawerSection>

              <DrawerSection
                id={energySectionId}
                title="Energy patterns"
                badge={pickBadge}
                spaced
              >
                <div className="jsc-wef-chip-grid jsc-wef-chip-grid--scroll">
                  {ENERGY_PATTERN_OPTIONS.map((opt) => (
                    <PrefChip
                      key={opt}
                      label={opt}
                      selected={draft.energy_patterns.includes(opt)}
                      disabled={busy}
                      onToggle={() =>
                        setDraft((d) => ({
                          ...d,
                          energy_patterns: toggleInList(d.energy_patterns, opt, MAX_WORK_ENV_PICKS),
                        }))
                      }
                    />
                  ))}
                </div>
              </DrawerSection>
            </div>

            <footer className="jsc-wef-drawer-foot">
              <button type="button" className="jsc-wef-foot-clear" onClick={handleClearAll}>
                Clear all
              </button>
              <div className="jsc-wef-foot-actions">
                <button
                  type="button"
                  className="jsc-wef-foot-btn jsc-wef-foot-btn--outline"
                  disabled={busy}
                  onClick={() => void handleRecalculate()}
                >
                  Recalculate match
                </button>
                <button
                  type="button"
                  className="jsc-wef-foot-btn jsc-wef-foot-btn--solid"
                  disabled={!allowSaveProfile}
                  onClick={handleSaveProfile}
                >
                  Save to profile
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default WorkEnvironmentFitPanel;

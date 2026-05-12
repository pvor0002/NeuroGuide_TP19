import { useId, useMemo, useState } from "react";

function normEnergy(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "high") return "high";
  if (s === "medium" || s === "moderate") return "medium";
  if (s === "low") return "low";
  if (s === "break") return "break";
  return "medium";
}

const ENERGY_META = {
  high: {
    key: "high",
    emoji: "🟢",
    label: "High Focus",
    ariaLabel: "High focus energy",
    wave: "day-life-card__wave--high",
  },
  medium: {
    key: "medium",
    emoji: "🟡",
    label: "Medium Energy",
    ariaLabel: "Medium energy",
    wave: "day-life-card__wave--medium",
  },
  low: {
    key: "low",
    emoji: "🔴",
    label: "Low Energy",
    ariaLabel: "Lower energy — lighter cognitive load",
    wave: "day-life-card__wave--low",
  },
  break: {
    key: "break",
    emoji: "🔵",
    label: "Break",
    ariaLabel: "Break or recovery",
    wave: "day-life-card__wave--break",
  },
};

function cognitiveGuidance(energyKey) {
  switch (energyKey) {
    case "high":
      return "Estimated cognitive load: higher. Batch similar tasks and protect this window from interruptions where you can.";
    case "medium":
      return "Estimated cognitive load: moderate. Alternate focused stretches with lighter tasks so attention can recover.";
    case "low":
      return "Estimated cognitive load: lighter. A good stretch for email, planning, or tidying loose ends.";
    case "break":
      return "Recovery time — step away from screens when possible and reset before the next block.";
    default:
      return "";
  }
}

function focusGuidance(energyKey) {
  switch (energyKey) {
    case "high":
      return "Focus tip: pick one outcome for this block, set a visible timer, and close extra tabs.";
    case "medium":
      return "Focus tip: use a short checklist and check items off to maintain momentum.";
    case "low":
      return "Focus tip: pair admin work with movement (standing, pacing) to stay engaged.";
    case "break":
      return "Focus tip: avoid “quick checks” that pull you back into work — hydrate and breathe.";
    default:
      return "";
  }
}

function RailIcon({ energyKey }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  if (energyKey === "break") {
    return (
      <svg className="day-life-rail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3v18M8 10h8M8 14h5" {...stroke} />
      </svg>
    );
  }
  if (energyKey === "high") {
    return (
      <svg className="day-life-rail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="7" {...stroke} />
        <path d="M12 8v4l2.5 2.5" {...stroke} />
      </svg>
    );
  }
  return (
    <svg className="day-life-rail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M8 12h8M12 8v8" {...stroke} />
      <circle cx="12" cy="12" r="9" {...stroke} />
    </svg>
  );
}

export default function DayInLifeTimeline({ blocks = [] }) {
  const uid = useId();
  const [openIndex, setOpenIndex] = useState(null);

  const focusWindowIndex = useMemo(() => blocks.findIndex((b) => normEnergy(b.energy_level) === "high"), [blocks]);

  if (!blocks.length) return null;

  return (
    <div className="day-life-timeline" role="list" aria-label="Workday timeline">
      <div className="day-life-timeline__track" aria-hidden="true" />

      {blocks.map((block, index) => {
        const eKey = normEnergy(block.energy_level);
        const meta = ENERGY_META[eKey] ?? ENERGY_META.medium;
        const panelId = `${uid}-panel-${index}`;
        const headId = `${uid}-head-${index}`;
        const expanded = openIndex === index;
        const isFocusWindow = index === focusWindowIndex && focusWindowIndex >= 0;

        return (
          <article
            key={`${block.time}-${index}`}
            className={`day-life-card day-life-card--${eKey}${isFocusWindow ? " day-life-card--focus-window" : ""}`}
            role="listitem"
            style={{ animationDelay: `${Math.min(index * 55, 440)}ms` }}
          >
            <div className="day-life-card__rail" aria-hidden="true">
              <time className="day-life-card__time" dateTime={block.time}>
                {block.time}
              </time>
              <span className={`day-life-card__dot day-life-card__dot--${eKey}`}>
                <RailIcon energyKey={eKey} />
              </span>
            </div>

            <div className="day-life-card__shell">
              <div className={`day-life-card__wave ${meta.wave}`} aria-hidden="true" />

              <div className="day-life-card__inner">
                <div className="day-life-card__title-row">
                  <h3 className="day-life-card__task" id={headId}>
                    {block.task}
                  </h3>
                  <span
                    className={`day-life-badge day-life-badge--${eKey}`}
                    role="status"
                    aria-label={`${meta.ariaLabel}. ${meta.emoji} ${meta.label}.`}
                  >
                    <span aria-hidden="true">{meta.emoji}</span>
                    <span className="day-life-badge__text">{meta.label}</span>
                  </span>
                </div>

                {isFocusWindow ? (
                  <p className="day-life-focus-strip" role="note">
                    <span className="day-life-focus-strip__star" aria-hidden="true">
                      ✦
                    </span>
                    Best time for deeper focus work
                  </p>
                ) : null}

                <p className="day-life-card__desc">{block.description}</p>

                {block.adhd_tip ? (
                  <div className="day-life-tip">
                    <span className="day-life-tip__bulb" aria-hidden="true">
                      💡
                    </span>
                    <div>
                      <span className="day-life-tip__label">ADHD support tip</span>
                      <p className="day-life-tip__txt">{block.adhd_tip}</p>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="day-life-card__more"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  id={`${uid}-btn-${index}`}
                  onClick={() => setOpenIndex(expanded ? null : index)}
                >
                  <span>{expanded ? "Hide extra detail" : "More detail"}</span>
                  <svg
                    className={`day-life-card__chev${expanded ? " day-life-card__chev--open" : ""}`}
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {expanded ? (
                  <div className="day-life-card__expanded" id={panelId} role="region" aria-labelledby={`${uid}-btn-${index}`}>
                    {block.adhd_tip ? (
                      <div className="day-life-detail">
                        <h4 className="day-life-detail__h">Support strategy</h4>
                        <p className="day-life-detail__p">{block.adhd_tip}</p>
                      </div>
                    ) : null}
                    <div className="day-life-detail">
                      <h4 className="day-life-detail__h">Estimated cognitive load</h4>
                      <p className="day-life-detail__p">{cognitiveGuidance(eKey)}</p>
                    </div>
                    <div className="day-life-detail">
                      <h4 className="day-life-detail__h">Focus recommendation</h4>
                      <p className="day-life-detail__p">{focusGuidance(eKey)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

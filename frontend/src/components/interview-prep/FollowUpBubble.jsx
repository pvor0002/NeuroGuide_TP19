import { useId, useState } from "react";
import { ZONES } from "./StarGrid.jsx";

const PROMPTS = {
  situation:
    "Situation: set the scene. Where were you, what was going on, and what made it challenging?",
  task: "Task: what were you responsible for or trying to achieve in that moment?",
  action: 'Action: what did you personally do? Use "I" and name the steps you took.',
  result: "Result: what changed because of your work? Outcomes, impact, or rough numbers are fine.",
};

export default function FollowUpBubble({ onAddToZone }) {
  const [activeKey, setActiveKey] = useState(ZONES[0].key);
  const [line, setLine] = useState("");
  const fieldId = useId();

  const active = ZONES.find((z) => z.key === activeKey) || ZONES[0];
  const prompt = PROMPTS[active.key] || "";

  const submit = () => {
    const t = line.trim();
    if (!t) return;
    onAddToZone(active.key, t);
    setLine("");
  };

  return (
    <section className="ip-follow-bubble" aria-labelledby="ip-follow-title">
      <p id="ip-follow-title" className="ip-follow-bubble__title">
        Add another point
      </p>

      <div className="ip-follow-pills" role="tablist" aria-label="STAR sections">
        {ZONES.map((z) => {
          const selected = z.key === activeKey;
          return (
            <button
              key={z.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`ip-follow-pill ${selected ? "ip-follow-pill--active" : ""}`}
              onClick={() => {
                setActiveKey(z.key);
                setLine("");
              }}
            >
              <span className={`ip-follow-pill__letter ip-follow-pill__letter--${z.letterClass}`} aria-hidden="true">
                {z.letter}
              </span>
              <span className="ip-follow-pill__text">{z.title}</span>
            </button>
          );
        })}
      </div>

      <p className="ip-follow-bubble__q">{prompt}</p>

      <div className="ip-follow-bubble__row">
        <label className="ip-visually-hidden" htmlFor={fieldId}>
          Add point for {active.title}
        </label>
        <input
          id={fieldId}
          className="ip-input ip-input--grow"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && line.trim()) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Write a ${active.title.toLowerCase()} point…`}
        />
        <button type="button" className="ip-btn ip-btn--secondary" disabled={!line.trim()} onClick={submit}>
          Add to {active.title}
        </button>
      </div>
    </section>
  );
}

export { PROMPTS };

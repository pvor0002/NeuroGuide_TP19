import { useId, useMemo, useState } from "react";
import { ZONES } from "./StarGrid.jsx";

const PROMPTS = {
  situation: "What was the situation or main constraint? Just a sentence is fine.",
  task: "What was your goal or what were you responsible for?",
  action: "What did you personally do in that moment?",
  result: "What was the outcome, even roughly or in plain words?",
};

function firstEmptyZone(starZones) {
  for (const z of ZONES) {
    if (!(starZones[z.key] || []).length) return z.key;
  }
  return null;
}

export default function FollowUpBubble({ starZones, onAddToZone }) {
  const empty = useMemo(() => firstEmptyZone(starZones), [starZones]);
  const [line, setLine] = useState("");
  const fieldId = useId();

  if (!empty) return null;

  const q = PROMPTS[empty] || "";

  return (
    <div className="ip-follow-bubble">
      <p className="ip-follow-bubble__title">One small question</p>
      <p className="ip-follow-bubble__q">{q}</p>
      <div className="ip-follow-bubble__row">
        <label className="ip-visually-hidden" htmlFor={fieldId}>
          Your answer
        </label>
        <input
          id={fieldId}
          className="ip-input ip-input--grow"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && line.trim()) {
              e.preventDefault();
              onAddToZone(empty, line.trim());
              setLine("");
            }
          }}
          placeholder="Type a short sentence…"
        />
        <button
          type="button"
          className="ip-btn ip-btn--secondary"
          disabled={!line.trim()}
          onClick={() => {
            onAddToZone(empty, line.trim());
            setLine("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

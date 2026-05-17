import { useCallback, useState } from "react";
import { liveSimplifyEnabled, reshapeInterviewAnswer } from "../../services/interviewPrepApi.js";

const ACTIONS = [
  { key: "shorter", label: "✂️ Shorter", instruction: "Rewrite shorter while keeping STAR ideas and true facts. Plain spoken English." },
  { key: "clearer", label: "👁 Clearer", instruction: "Rewrite for clarity and ease when spoken aloud. Short sentences." },
  { key: "detail", label: "➕ More detail", instruction: "Add helpful detail and specificity without inventing facts." },
];

export default function AnswerEditor({
  answerDraft,
  onAnswerChange,
  onReshapeSuccess,
  composing = false,
  formulateNotice = "",
  aside = null,
}) {
  const [busyKey, setBusyKey] = useState(null);
  const [fade, setFade] = useState("in");

  const runReshape = useCallback(
    async (instruction, key) => {
      if (!liveSimplifyEnabled) return;
      const base = String(answerDraft || "").trim();
      if (!base) return;
      setBusyKey(key);
      setFade("out");
      try {
        const res = await reshapeInterviewAnswer(base, instruction);
        const next = String(res.text || "").trim();
        if (next) {
          await new Promise((r) => setTimeout(r, 160));
          onAnswerChange(next);
          onReshapeSuccess?.();
          setFade("in");
        }
      } catch {
        setFade("in");
      } finally {
        setBusyKey(null);
      }
    },
    [answerDraft, onAnswerChange, onReshapeSuccess],
  );

  const disabled = !liveSimplifyEnabled;
  const editorBusy = composing || busyKey !== null;

  return (
    <div className={`ip-answer-editor ${aside ? "ip-answer-editor--with-aside" : ""}`}>
      <div className="ip-answer-editor__main">
        <label className="ip-label ip-answer-editor__label" htmlFor="ip-answer-draft">
          Your answer
        </label>
        <textarea
          id="ip-answer-draft"
          className={`ip-textarea ip-textarea--answer ${fade === "out" ? "ip-fade-out" : "ip-fade-in"} ${composing ? "ip-textarea--composing" : ""}`}
          rows={14}
          value={composing ? "" : answerDraft}
          placeholder={composing ? "Turning your ideas into spoken answer…" : undefined}
          readOnly={composing}
          aria-busy={composing}
          onChange={(e) => onAnswerChange(e.target.value)}
        />
        {aside ? <div className="ip-answer-editor__aside">{aside}</div> : null}
      </div>

      {formulateNotice ? (
        <p className="ip-formulate-notice" role="status">
          {formulateNotice}
        </p>
      ) : null}

      <div className="ip-reshape-row" role="toolbar" aria-label="Reshape answer">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            className="ip-btn ip-btn--outline"
            disabled={disabled || editorBusy || !String(answerDraft || "").trim()}
            title={disabled ? "Connect backend for AI reshaping" : undefined}
            onClick={() => runReshape(a.instruction, a.key)}
          >
            {busyKey === a.key ? "…" : a.label}
          </button>
        ))}
      </div>

      {disabled ? (
        <p className="ip-muted ip-muted--tight" role="status">
          Connect backend for AI reshaping (set{" "}
          <code className="ip-code">GEMINI_API_KEY</code> and keep <code className="ip-code">VITE_SIMPLIFY_API</code> on).
        </p>
      ) : null}
    </div>
  );
}

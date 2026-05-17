import { useCallback, useEffect, useRef, useState } from "react";
import AnswerEditor from "./AnswerEditor.jsx";
import SpeechCoach from "./SpeechCoach.jsx";

function StarCheatSheet() {
  return (
    <aside className="ip-practise-tips-card ip-practise-tips-card--aside" aria-label="STAR cheat sheet">
      <p className="ip-practise-tips-title">STAR cheat sheet</p>
      <ul className="ip-practise-cheatsheet">
        <li>
          <span className="ip-cs-zone ip-cs-zone--s">S</span>
          <span className="ip-cs-body">
            <strong>Situation</strong>
            <span>Set the scene in 1–2 sentences</span>
          </span>
        </li>
        <li>
          <span className="ip-cs-zone ip-cs-zone--t">T</span>
          <span className="ip-cs-body">
            <strong>Task</strong>
            <span>Your specific role or goal</span>
          </span>
        </li>
        <li>
          <span className="ip-cs-zone ip-cs-zone--a">A</span>
          <span className="ip-cs-body">
            <strong>Action</strong>
            <span>{'Say "I did…" then name each step'}</span>
          </span>
        </li>
        <li>
          <span className="ip-cs-zone ip-cs-zone--r">R</span>
          <span className="ip-cs-body">
            <strong>Result</strong>
            <span>Numbers or concrete impact</span>
          </span>
        </li>
      </ul>
      <div className="ip-cs-reminders">
        <span className="ip-cs-reminder ip-cs-reminder--time">⏱ Under 2 min</span>
        <span className="ip-cs-reminder ip-cs-reminder--story">🎯 One story only</span>
        <span className="ip-cs-reminder ip-cs-reminder--words">💬 Plain words win</span>
      </div>
    </aside>
  );
}

export default function PractiseStage({
  selectedQuestion,
  answerDraft,
  formulating = false,
  formulateNotice = "",
  onAnswerChange,
  onSave,
  onNextQuestion,
  onBack,
}) {
  const [saveAck, setSaveAck] = useState(false);
  const saveAckTimerRef = useRef(null);

  const handleSave = useCallback(() => {
    onSave?.();
    setSaveAck(true);
    if (saveAckTimerRef.current) window.clearTimeout(saveAckTimerRef.current);
    saveAckTimerRef.current = window.setTimeout(() => {
      saveAckTimerRef.current = null;
      setSaveAck(false);
    }, 3200);
  }, [onSave]);

  useEffect(() => {
    return () => {
      if (saveAckTimerRef.current) window.clearTimeout(saveAckTimerRef.current);
    };
  }, []);

  return (
    <section className="ip-stage ip-practise" aria-labelledby="ip-stage-practise-title">
      <div className="ip-practise-q-banner">
        <span className="ip-practise-q-eyebrow">Practise your answer</span>
        <h2 id="ip-stage-practise-title" className="ip-practise-q-text">
          {selectedQuestion}
        </h2>
      </div>

      <div className="ip-practise-layout">
        <AnswerEditor
          answerDraft={answerDraft}
          onAnswerChange={onAnswerChange}
          composing={formulating}
          formulateNotice={formulateNotice}
          aside={<StarCheatSheet />}
        />
      </div>

      <div className="ip-practise-coach-row">
        <SpeechCoach question={selectedQuestion} answerDraft={answerDraft} />
      </div>

      <footer className="ip-stage-footer">
        <button type="button" className="ip-btn ip-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="ip-stage-footer__right">
          {saveAck ? (
            <p className="ip-save-ack" role="status" aria-live="polite">
              Answer saved
            </p>
          ) : null}
          <button type="button" className="ip-btn ip-btn--secondary" onClick={handleSave} disabled={formulating}>
            Save answer
          </button>
          <button
            type="button"
            className="ip-btn ip-btn--primary"
            onClick={onNextQuestion}
            disabled={formulating || !String(answerDraft || "").trim()}
          >
            Next question →
          </button>
        </div>
      </footer>
    </section>
  );
}

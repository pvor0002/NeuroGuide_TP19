import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnswerEditor from "./AnswerEditor.jsx";
import ReadinessBar from "./ReadinessBar.jsx";
import SpeechCoach from "./SpeechCoach.jsx";

export default function PractiseStage({
  selectedQuestion,
  answerDraft,
  onAnswerChange,
  readinessPercent,
  readinessLabel,
  onBumpReadiness,
  onSave,
  onNextQuestion,
  onBack,
}) {
  const [playing, setPlaying] = useState(false);
  const utterRef = useRef(null);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    return () => stopSpeaking();
  }, [stopSpeaking]);

  const speak = useCallback(() => {
    const text = String(answerDraft || "").trim();
    if (!text || !window.speechSynthesis) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = (navigator.language || "en-AU").replace("_", "-");
    utterRef.current = u;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    onBumpReadiness(8);
    window.speechSynthesis.speak(u);
  }, [answerDraft, onBumpReadiness, stopSpeaking]);

  const label = useMemo(() => readinessLabel(readinessPercent), [readinessLabel, readinessPercent]);

  return (
    <section className="ip-stage ip-practise" aria-labelledby="ip-stage-practise-title">

      {/* Full-width question banner */}
      <div className="ip-practise-q-banner">
        <span className="ip-practise-q-eyebrow">Practise your answer</span>
        <h2 id="ip-stage-practise-title" className="ip-practise-q-text">{selectedQuestion}</h2>
      </div>

      {/* Two-column: editor left, tools right */}
      <div className="ip-practise-layout">

        {/* Left — answer editor */}
        <div className="ip-practise-editor-col">
          <AnswerEditor
            answerDraft={answerDraft}
            onAnswerChange={onAnswerChange}
            onReshapeSuccess={() => onBumpReadiness(12)}
          />
        </div>

        {/* Right — tools panel: speak+readiness left, cheat sheet right */}
        <div className="ip-practise-tools-col">

          {/* Left sub-col: speak + readiness */}
          <div className="ip-practise-tools-left">
            {/* Hear it card */}
            <div className="ip-practise-speak-card">
              <p className="ip-practise-speak-label">
                <span aria-hidden="true">🎤</span> Hear how it sounds
              </p>
              <button
                type="button"
                className={`ip-practise-speak-btn ${playing ? "ip-practise-speak-btn--active" : ""}`}
                onClick={playing ? stopSpeaking : speak}
                disabled={!answerDraft.trim()}
              >
                {playing ? (
                  <>
                    <span className="ip-wave" aria-hidden="true">
                      <span /><span /><span /><span />
                    </span>
                    Stop
                  </>
                ) : (
                  "Read aloud"
                )}
              </button>
              <p className="ip-practise-speak-tip">
                Hearing your answer out loud reveals exactly what to tighten up.
              </p>
            </div>

            {/* Readiness card */}
            <div className="ip-practise-readiness-card">
              <ReadinessBar value={readinessPercent} labelText={label} />
            </div>
          </div>

          {/* Right sub-col: cheat sheet */}
          <div className="ip-practise-tips-card ip-practise-tools-right">
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
                  <span>Say "I did…" then name each step</span>
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
          </div>

        </div>
      </div>

      {/* Full-width speech coach — sits between the editor and the footer */}
      <div className="ip-practise-coach-row">
        <SpeechCoach
          question={selectedQuestion}
          answerDraft={answerDraft}
          onBumpReadiness={onBumpReadiness}
        />
      </div>

      <footer className="ip-stage-footer">
        <button type="button" className="ip-btn ip-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="ip-stage-footer__right">
          <button type="button" className="ip-btn ip-btn--secondary" onClick={onSave}>
            Save answer
          </button>
          <button type="button" className="ip-btn ip-btn--primary" onClick={onNextQuestion}>
            Next question →
          </button>
        </div>
      </footer>
    </section>
  );
}

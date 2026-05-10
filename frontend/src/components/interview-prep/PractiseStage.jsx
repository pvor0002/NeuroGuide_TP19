import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnswerEditor from "./AnswerEditor.jsx";
import ReadinessBar from "./ReadinessBar.jsx";

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
    <section className="ip-stage ip-card ip-stage--compact" aria-labelledby="ip-stage-practise-title">
      <h2 id="ip-stage-practise-title" className="ip-card-title ip-card-title--soft">
        Practise
      </h2>
      <p className="ip-confidence ip-confidence--soft ip-confidence--tight">Strong material — we’re just shaping how you say it.</p>

      <blockquote className="ip-quote">{selectedQuestion}</blockquote>

      <AnswerEditor
        answerDraft={answerDraft}
        onAnswerChange={onAnswerChange}
        onReshapeSuccess={() => onBumpReadiness(12)}
      />

      <ReadinessBar value={readinessPercent} labelText={label} />

      <div className="ip-practise-actions">
        <button type="button" className="ip-btn ip-btn--primary ip-btn--xl" onClick={playing ? stopSpeaking : speak}>
          {playing ? (
            <>
              <span className="ip-wave" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              Stop playback
            </>
          ) : (
            <>
              <span aria-hidden="true">🎤</span> Practise aloud
            </>
          )}
        </button>
      </div>

      <footer className="ip-footer-actions ip-footer-actions--split">
        <button type="button" className="ip-btn ip-btn--quiet" onClick={onBack}>
          ← Back
        </button>
        <div className="ip-footer-actions__cluster">
          <button type="button" className="ip-btn ip-btn--secondary" onClick={onSave}>
            Save this answer
          </button>
          <button type="button" className="ip-btn ip-btn--primary" onClick={onNextQuestion}>
            Next question →
          </button>
        </div>
      </footer>
    </section>
  );
}

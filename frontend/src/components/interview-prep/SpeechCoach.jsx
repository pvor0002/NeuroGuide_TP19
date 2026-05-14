import { useCallback, useEffect, useRef, useState } from "react";
import { coachSpeechAnswer } from "../../services/interviewPrepApi.js";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getSpeechRecognition() {
  return (
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null
  );
}

const STAR_ZONES = [
  { key: "situation", label: "Situation", color: "#3b82f6" },
  { key: "task",      label: "Task",      color: "#f59e0b" },
  { key: "action",    label: "Action",    color: "#10b981" },
  { key: "result",    label: "Result",    color: "#8b5cf6" },
];

/* ─── component ───────────────────────────────────────────────────────────── */

export default function SpeechCoach({ question, answerDraft, onBumpReadiness }) {
  const [phase, setPhase]             = useState("idle");   // idle | recording | loading | done | error
  const [transcript, setTranscript]   = useState("");
  const [interim, setInterim]         = useState("");
  const [feedback, setFeedback]       = useState(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const recognitionRef                = useRef(null);
  const finalRef                      = useRef("");          // accumulates final segments
  // Prevents the API call from being cancelled by the phase→"loading" re-render.
  // React's useEffect cleanup fires whenever dependencies change (including phase),
  // so a plain `let cancelled` closure variable gets set to true the moment
  // setPhase("loading") triggers a re-render — before the fetch resolves.
  // Using a ref means the flag survives across re-renders and is only reset
  // deliberately (on reset() or a new recording).
  const submittedRef                  = useRef(false);

  const SpeechRecognition = getSpeechRecognition();
  const supported = Boolean(SpeechRecognition);

  /* Stop recognition cleanly */
  const stopRecognition = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  /* Cleanup on unmount */
  useEffect(() => () => stopRecognition(), [stopRecognition]);

  /* Start recording */
  const startRecording = useCallback(() => {
    if (!SpeechRecognition) return;
    setPhase("recording");
    setTranscript("");
    setInterim("");
    setFeedback(null);
    setErrorMsg("");
    finalRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.lang = (navigator.language || "en-AU").replace("_", "-");
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript + " ";
        } else {
          interimText += res[0].transcript;
        }
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are non-fatal — onend will still fire and
      // the empty-transcript check there will show a friendly message.
      if (event.error === "no-speech" || event.error === "aborted") return;
      // Fatal errors: show message immediately (onend will fire too but we guard against double-set)
      setErrorMsg(`Microphone error: ${event.error}. Please try again.`);
      setPhase("error");
    };

    recognition.onend = () => {
      // onend always fires AFTER the last onresult, so finalRef.current is
      // fully populated by the time we advance the phase.
      setInterim("");
      setPhase("recording_ended");
    };

    recognition.start();
  }, [SpeechRecognition]);

  /* Manual stop — just tell the API to stop; onend will advance the phase */
  const stopRecording = useCallback(() => {
    stopRecognition();
    // Do NOT call setPhase here — wait for onend so finalRef is fully flushed
  }, [stopRecognition]);

  /* Submit transcript for feedback once recording ends.
   *
   * Why submittedRef instead of a `let cancelled` closure variable:
   * Calling setPhase("loading") inside this effect causes React to re-render,
   * which triggers the effect cleanup, which would set `cancelled = true` — right
   * before the fetch resolves. The API would return 200 but setFeedback would
   * never be called and the UI would hang on the loading spinner forever.
   *
   * submittedRef persists across re-renders, so once we mark the call as submitted
   * the guard at the top prevents re-entry, and the .then() / .catch() handlers
   * are free to update state without being cancelled mid-flight.
   */
  useEffect(() => {
    if (phase !== "recording_ended") return;
    if (submittedRef.current) return; // already submitted — phase just re-triggered the effect

    const text = finalRef.current.trim();
    const q = question;
    const draft = answerDraft || "";

    if (!text) {
      setErrorMsg(
        "No speech was captured. Check that your microphone is allowed in the browser, then try again."
      );
      setPhase("error");
      return;
    }

    // Mark as submitted before any state updates to block re-entry
    submittedRef.current = true;
    setTranscript(text);
    setPhase("loading");

    coachSpeechAnswer(q, text, draft)
      .then((data) => {
        setFeedback(data);
        setPhase("done");
        if (data.readiness_bump > 0) {
          onBumpReadiness?.(data.readiness_bump);
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || "Could not get feedback. Please try again.");
        setPhase("error");
      })
      .finally(() => {
        submittedRef.current = false;
      });
  }, [phase, question, answerDraft, onBumpReadiness]);

  /* Reset */
  const reset = useCallback(() => {
    stopRecognition();
    submittedRef.current = false;
    setPhase("idle");
    setTranscript("");
    setInterim("");
    setFeedback(null);
    setErrorMsg("");
    finalRef.current = "";
  }, [stopRecognition]);

  /* ── render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="ip-speech-coach-card" aria-live="polite">
      <p className="ip-speech-coach-label">
        <span aria-hidden="true">🎙</span> Speech coach
      </p>

      {/* ── Idle ── */}
      {phase === "idle" && (
        <>
          {supported ? (
            <button
              type="button"
              className="ip-sc-mic-btn"
              onClick={startRecording}
              disabled={!question}
              aria-label="Start speaking your answer"
            >
              <span className="ip-sc-mic-icon" aria-hidden="true">🎤</span>
              Speak your answer
            </button>
          ) : (
            <p className="ip-sc-unsupported">
              {"Speech recognition isn't supported in this browser. Try Chrome or Edge."}
            </p>
          )}
          <p className="ip-speech-coach-tip">
            Say your answer out loud and get instant feedback on your STAR structure. Aim to finish within <mark className="ip-sc-highlight">2 minutes</mark>.
          </p>
        </>
      )}

      {/* ── Recording ── */}
      {phase === "recording" && (
        <>
          <div className="ip-sc-recording-indicator" aria-label="Recording in progress">
            <span className="ip-sc-pulse" aria-hidden="true" />
            <span className="ip-sc-recording-label">Listening…</span>
          </div>
          {(transcript || interim) && (
            <div className="ip-sc-transcript" aria-label="Live transcript">
              <span>{transcript}</span>
              {interim && <span className="ip-sc-interim">{interim}</span>}
            </div>
          )}
          <button
            type="button"
            className="ip-sc-stop-btn"
            onClick={stopRecording}
            aria-label="Stop recording"
          >
            ⏹ Done speaking
          </button>
        </>
      )}

      {/* ── Loading ── */}
      {(phase === "loading" || phase === "recording_ended") && (
        <div className="ip-sc-loading" role="status">
          <span className="ip-sc-spinner" aria-hidden="true" />
          Getting your feedback…
        </div>
      )}

      {/* ── Error ── */}
      {phase === "error" && (
        <>
          <p className="ip-sc-error" role="alert">{errorMsg}</p>
          <button type="button" className="ip-sc-retry-btn" onClick={reset}>
            Try again
          </button>
        </>
      )}

      {/* ── Done — feedback panel ── */}
      {phase === "done" && feedback && (
        <div className="ip-sc-feedback">

          {/* Summary pill */}
          {feedback.summary && (
            <p className="ip-sc-summary">{feedback.summary}</p>
          )}

          {/* STAR coverage bars */}
          <div className="ip-sc-star-section">
            <p className="ip-sc-section-title">STAR coverage</p>
            <ul className="ip-sc-star-bars" aria-label="STAR coverage">
              {STAR_ZONES.map(({ key, label, color }) => {
                const pct = feedback.star_coverage?.[key] ?? 0;
                return (
                  <li key={key} className="ip-sc-bar-row">
                    <span className="ip-sc-bar-label">{label}</span>
                    <div
                      className="ip-sc-bar-track"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${label} ${pct}%`}
                    >
                      <div
                        className="ip-sc-bar-fill"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <span className="ip-sc-bar-pct">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Strengths */}
          {feedback.strengths?.length > 0 && (
            <div className="ip-sc-section ip-sc-section--str">
              <p className="ip-sc-section-title">✅ What worked</p>
              <ul className="ip-sc-list ip-sc-list--green">
                {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {feedback.improvements?.length > 0 && (
            <div className="ip-sc-section ip-sc-section--imp">
              <p className="ip-sc-section-title">💡 To strengthen</p>
              <ul className="ip-sc-list ip-sc-list--amber">
                {feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Filler words */}
          {feedback.filler_words?.length > 0 && (
            <div className="ip-sc-section ip-sc-section--fill">
              <p className="ip-sc-section-title">🗣 Filler words spotted</p>
              <div className="ip-sc-filler-chips">
                {feedback.filler_words.map((w, i) => (
                  <span key={i} className="ip-sc-filler-chip">{`"${w}"`}</span>
                ))}
              </div>
            </div>
          )}

          {/* Transcript toggle */}
          <details className="ip-sc-transcript-details">
            <summary className="ip-sc-transcript-summary">View transcript</summary>
            <p className="ip-sc-transcript-text">{transcript}</p>
          </details>

          <button type="button" className="ip-sc-retry-btn" onClick={reset}>
            🔄 Try again
          </button>
        </div>
      )}
    </div>
  );
}

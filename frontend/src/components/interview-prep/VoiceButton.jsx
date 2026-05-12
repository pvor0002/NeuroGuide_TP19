import { useCallback, useEffect, useRef, useState } from "react";

function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceButton({ onTranscript, disabled }) {
  const [supported] = useState(() => typeof window !== "undefined" && Boolean(getRecognitionCtor()));
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (!supported || disabled) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    if (recording && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      setRecording(false);
      return;
    }

    const rec = new Ctor();
    rec.lang = (navigator.language || "en-AU").replace("_", "-");
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (ev) => {
      let chunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        chunk += ev.results[i][0].transcript;
      }
      const t = chunk.trim();
      if (t) onTranscript(t);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [disabled, onTranscript, recording, supported]);

  if (!supported) {
    return (
      <p className="ip-voice-fallback" role="status">
        Voice not supported in this browser. Type your ideas below.
      </p>
    );
  }

  return (
    <button
      type="button"
      className={`ip-btn ip-voice-btn ${recording ? "ip-voice-btn--rec" : ""}`}
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start speaking"}
      disabled={disabled}
      onClick={toggle}
    >
      <span className="ip-voice-btn__mic" aria-hidden="true">
        🎤
      </span>
      <span>{recording ? "Recording… tap to stop" : "Start speaking"}</span>
      {recording ? <span className="ip-voice-btn__pulse" aria-hidden="true" /> : null}
    </button>
  );
}

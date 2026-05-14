/**
 * VoiceButton.jsx
 *
 * A toggle button that starts and stops browser-native speech recognition
 * (Web Speech API — SpeechRecognition / webkitSpeechRecognition).
 *
 * Behaviour:
 *  - First click  → starts recognition, enters "recording" state
 *  - Second click → stops recognition
 *  - Speech results fire onTranscript() with the recognised text chunk.
 *    NOTE: In BrainDumpStage, onTranscript populates the textarea rather
 *    than immediately saving a card, so the user can review and edit first.
 *
 * Recognition settings:
 *  - continuous: true      → keeps listening across pauses (doesn't stop after one sentence)
 *  - interimResults: false → only fires for finalised, confirmed results (not live partial text)
 *
 * Props:
 *  - onTranscript {fn}      Called with each finalised speech chunk (string)
 *  - disabled     {boolean} Disables the button (e.g. no question selected yet)
 */

import { useCallback, useEffect, useRef, useState } from "react";

function getRecognitionCtor() {
  // Browser compatibility: standard API or webkit-prefixed (Safari/older Chrome)
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceButton({ onTranscript, disabled }) {
  // Check once on mount whether speech recognition is available in this browser
  const [supported] = useState(() => {
    const available = typeof window !== "undefined" && Boolean(getRecognitionCtor());
    console.log("[VoiceButton] SpeechRecognition supported:", available);
    return available;
  });

  const [recording, setRecording] = useState(false);
  const recRef = useRef(null); // Holds the active SpeechRecognition instance

  // Cleanup: stop any active recognition session when the component unmounts
  useEffect(() => {
    return () => {
      if (recRef.current) {
        console.log("[VoiceButton] unmount — stopping recognition");
        try { recRef.current.stop?.(); } catch { /* ignore */ }
      }
    };
  }, []);

  /**
   * toggle — starts recognition if idle, stops it if already recording.
   */
  const toggle = useCallback(() => {
    if (!supported || disabled) {
      console.log("[VoiceButton] toggle blocked — supported:", supported, "disabled:", disabled);
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // ── Stop if already recording ──
    if (recording && recRef.current) {
      console.log("[VoiceButton] stopping recognition");
      try { recRef.current.stop(); } catch { /* ignore */ }
      setRecording(false);
      return;
    }

    // ── Start a new recognition session ──
    console.log("[VoiceButton] starting recognition");
    const rec = new Ctor();
    rec.lang = (navigator.language || "en-AU").replace("_", "-");
    rec.interimResults = false; // Only fire onresult for confirmed final results
    rec.continuous = true;      // Keep listening until manually stopped

    rec.onresult = (ev) => {
      // Accumulate all new result chunks from this event
      let chunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        chunk += ev.results[i][0].transcript;
      }
      const t = chunk.trim();
      if (t) {
        console.log("[VoiceButton] onresult: transcript chunk →", t);
        // Pass the chunk up — BrainDumpStage appends it to the textarea
        onTranscript(t);
      }
    };

    rec.onerror = (ev) => {
      console.warn("[VoiceButton] onerror:", ev.error);
      setRecording(false);
    };

    rec.onend = () => {
      // Fires when recognition ends — either manually stopped or browser timed out
      console.log("[VoiceButton] onend — recognition session ended");
      setRecording(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
      console.log("[VoiceButton] recognition started successfully");
    } catch (err) {
      console.error("[VoiceButton] failed to start recognition:", err);
      setRecording(false);
    }
  }, [disabled, onTranscript, recording, supported]);

  // ── Unsupported browser fallback ──
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
      <span className="ip-voice-btn__mic" aria-hidden="true">🎤</span>
      <span>{recording ? "Recording… tap to stop" : "Start speaking"}</span>
      {/* Pulse animation shown only while actively recording */}
      {recording ? <span className="ip-voice-btn__pulse" aria-hidden="true" /> : null}
    </button>
  );
}

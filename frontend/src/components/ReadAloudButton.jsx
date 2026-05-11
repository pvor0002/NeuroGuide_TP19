import { useCallback, useEffect, useMemo, useState } from "react";

/** True when the browser can speak text (may still require user gesture on first use). */
export function isReadAloudSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis;
}

/**
 * Reads plain-text segments aloud using Web Speech API (joins segments with a pause).
 * @param {{ segments?: string[], className?: string }} props
 */
export default function ReadAloudButton({ segments = [], className = "" }) {
  const text = useMemo(() => {
    const parts = (segments || []).filter((s) => s != null && String(s).trim() !== "");
    return parts.map((s) => String(s).trim()).join(". ");
  }, [segments]);

  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const start = useCallback(() => {
    if (!isReadAloudSupported() || !text) return;
    stop();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }, [text, stop]);

  useEffect(() => () => stop(), [stop]);

  if (!isReadAloudSupported()) return null;

  return (
    <button
      type="button"
      className={["q-read-aloud-btn", "button", "secondary", className].filter(Boolean).join(" ")}
      onClick={() => {
        if (speaking) stop();
        else start();
      }}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading aloud" : "Read question aloud"}
    >
      {speaking ? "Stop" : "Read aloud"}
    </button>
  );
}

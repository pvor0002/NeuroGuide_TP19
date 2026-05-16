import { useId, useRef, useState } from "react";
import {
  formatPassKeyDisplay,
  rawIndexFromDisplayCursor,
  restorePassKeyCaret,
  stripPassKeyRaw,
} from "../utils/passKeyFormat.js";

/**
 * Inline pass key / User ID entry. Default variant: optional shortcut on wizard steps.
 * `login-gate` variant: minimal stacked field used on the welcome-back screen.
 *
 * @param {object} props
 * @param {"default"|"login-gate"} [props.variant]
 * @param {(id: string) => Promise<void>} [props.onSubmit]
 * @param {boolean} [props.loadEnabled=true]
 * @param {string} [props.submitLabel]
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {string} [props.unavailableMessage]
 */
export default function UserIdEntryBox({
  variant = "default",
  onSubmit,
  loadEnabled = true,
  submitLabel,
  title = "Already have a User ID?",
  description = "Enter it to load the profile you saved last time.",
  unavailableMessage = "Loading saved work by User ID isn't wired up on this page yet - coming soon.",
  defaultOpen = false,
  showToggle = true,
}) {
  const isGate = variant === "login-gate";
  const [open, setOpen] = useState(defaultOpen || isGate);
  const [idInput, setIdInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef(null);
  const titleId = useId();

  const loadButtonLabel =
    submitLabel || (isGate ? "Load profile" : loadEnabled ? "Load" : "Continue");

  const reveal = () => {
    setOpen(true);
    setErrorMessage("");
    setInfoMessage("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyPassKeyInput = (rawValue, inputEl, previousDisplay, previousCursor) => {
    const nextDisplay = formatPassKeyDisplay(rawValue);
    setIdInput(nextDisplay);
    setErrorMessage("");
    setInfoMessage("");
    if (inputEl) {
      restorePassKeyCaret(inputEl, previousDisplay, previousCursor, nextDisplay);
    }
  };

  const handlePassKeyChange = (e) => {
    const input = e.target;
    const prevDisplay = idInput;
    const prevCursor = input.selectionStart ?? prevDisplay.length;
    applyPassKeyInput(input.value, input, prevDisplay, prevCursor);
  };

  const handlePassKeyKeyDown = (e) => {
    if (isBusy) return;
    const input = e.target;
    const pos = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? pos;
    if (pos !== end) return;

    if (e.key === "Backspace" && pos > 0 && idInput[pos - 1] === "-") {
      e.preventDefault();
      const raw = stripPassKeyRaw(idInput);
      const rawBefore = rawIndexFromDisplayCursor(pos, idInput);
      const newRaw = raw.slice(0, Math.max(0, rawBefore - 1));
      applyPassKeyInput(newRaw, input, idInput, pos);
      return;
    }

    if (e.key === "Delete" && pos < idInput.length && idInput[pos] === "-") {
      e.preventDefault();
      const raw = stripPassKeyRaw(idInput);
      const rawAt = rawIndexFromDisplayCursor(pos, idInput);
      const newRaw = raw.slice(0, rawAt) + raw.slice(rawAt + 1);
      applyPassKeyInput(newRaw, input, idInput, pos);
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
      const raw = stripPassKeyRaw(idInput);
    const trimmed = String(idInput || "").trim();
    if (!raw && !trimmed) {
      setErrorMessage(isGate ? "Enter your pass key to continue." : "Enter your User ID to continue.");
      return;
    }
    if (raw && raw.length !== 8) {
      setErrorMessage("Enter all 8 characters of your pass key.");
      return;
    }
    if (!loadEnabled) {
      setInfoMessage(unavailableMessage);
      return;
    }
    if (typeof onSubmit !== "function") return;
    setIsBusy(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      await onSubmit(raw || trimmed);
    } catch (err) {
      setErrorMessage(
        err?.message || "We couldn't find that pass key. Check for typos and try again.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const sectionClass = ["userid-box", isGate && "userid-box--login-gate"].filter(Boolean).join(" ");

  return (
    <section
      className={sectionClass}
      aria-labelledby={isGate ? undefined : titleId}
      aria-label={isGate ? "Pass key sign in" : undefined}
    >
      {!isGate ? (
        <div className="userid-box-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="12" r="4" />
            <path d="M13 12h8" />
            <path d="M17 12v3" />
            <path d="M20 12v2" />
          </svg>
        </div>
      ) : null}

      <div className="userid-box-body">
        {!isGate ? (
          <>
            <h3 id={titleId} className="userid-box-title">
              {title}
            </h3>
            <p className="userid-box-desc">{description}</p>
          </>
        ) : null}

        {!open && showToggle ? (
          <button type="button" className="userid-box-toggle" onClick={reveal}>
            Enter my User ID
            <span aria-hidden="true">→</span>
          </button>
        ) : open ? (
          <form className="userid-box-form" onSubmit={handleSubmit}>
            <label htmlFor={`${titleId}-input`} className="visually-hidden-label">
              Pass key
            </label>
            <div className="userid-box-row">
              <input
                ref={inputRef}
                id={`${titleId}-input`}
                className="userid-box-input"
                type="text"
                placeholder="K7X2-M4QR"
                value={idInput}
                onChange={handlePassKeyChange}
                onKeyDown={handlePassKeyKeyDown}
                disabled={isBusy}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={9}
                inputMode="text"
              />
              <button
                type="submit"
                className="button primary userid-box-submit"
                disabled={isBusy}
              >
                {isBusy ? "Loading…" : loadButtonLabel}
              </button>
            </div>
            {errorMessage ? (
              <p className="userid-box-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
            {infoMessage ? (
              <p className="userid-box-info" role="status">
                {infoMessage}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}

import { useEffect, useId, useRef, useState } from "react";

/**
 * Greeting modal asking visitors whether they already have a saved User ID.
 *
 * The modal is reused on both the Career Profile and the Simplify Job
 * Description pages. Pages that can actually load saved data pass
 * ``onSubmit`` to perform the load; pages where the retrieve-by-id feature
 * isn't wired yet can set ``loadEnabled={false}`` so the input shows a
 * "coming soon" note instead of submitting.
 *
 * @param {object} props
 * @param {boolean} props.open                  Controlled open state.
 * @param {() => void} props.onDismiss          Called on Esc / close / "No, start fresh".
 * @param {(id: string) => Promise<void>} [props.onSubmit]
 *        Async handler invoked when the user submits an ID. Throw an ``Error``
 *        to surface a message back into the modal.
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {boolean} [props.loadEnabled=true]
 *        When false, the "Yes" branch shows a friendly "not available yet"
 *        note instead of calling ``onSubmit``.
 * @param {string} [props.unavailableMessage]
 *        Override for the ``loadEnabled=false`` note.
 */
export default function UserIdEntryModal({
  open,
  onDismiss,
  onSubmit,
  title = "Do you already have a User ID?",
  description = "If you've used NeuroGuide before, enter your User ID to continue where you left off. We'll pull back the answers you saved — no other personal info required.",
  loadEnabled = true,
  unavailableMessage = "Loading saved work by User ID isn't wired into this page yet — it's coming soon. For now, continue and we'll keep any work you do on this page locally.",
}) {
  const [branch, setBranch] = useState("choose"); // "choose" | "enter-id"
  const [idInput, setIdInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const titleId = useId();
  const descId = useId();
  const inputRef = useRef(null);
  const firstOptionRef = useRef(null);

  // Reset internal state whenever the modal is re-opened so it always starts
  // at the primary "Yes / No" question.
  useEffect(() => {
    if (open) {
      setBranch("choose");
      setIdInput("");
      setErrorMessage("");
      setIsBusy(false);
    }
  }, [open]);

  // Focus management: put focus on the first option / the input depending on
  // which branch is visible.
  useEffect(() => {
    if (!open) return;
    if (branch === "enter-id") {
      inputRef.current?.focus();
    } else {
      firstOptionRef.current?.focus();
    }
  }, [open, branch]);

  // Dismiss with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !isBusy) {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isBusy, onDismiss]);

  if (!open) return null;

  const handleLoad = async (event) => {
    event?.preventDefault?.();
    const trimmed = String(idInput || "").trim();
    if (!trimmed) {
      setErrorMessage("Enter your User ID to continue.");
      return;
    }
    if (!loadEnabled) {
      // "Coming soon" branch: we don't call onSubmit, just show the note.
      setErrorMessage(unavailableMessage);
      return;
    }
    if (typeof onSubmit !== "function") return;
    setErrorMessage("");
    setIsBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setErrorMessage(err?.message || "We couldn't load that User ID. Check for typos and try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleBackdropClick = () => {
    if (isBusy) return;
    onDismiss();
  };

  return (
    <div className="userid-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="userid-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="userid-modal-close"
          aria-label="Close"
          onClick={onDismiss}
          disabled={isBusy}
        >
          ×
        </button>

        <p className="userid-modal-eyebrow">Welcome back</p>
        <h2 id={titleId} className="userid-modal-title">{title}</h2>
        <p id={descId} className="userid-modal-desc">{description}</p>

        {branch === "choose" ? (
          <div className="userid-modal-options">
            <button
              ref={firstOptionRef}
              type="button"
              className="userid-modal-option"
              onClick={() => setBranch("enter-id")}
            >
              <span className="userid-modal-option-label">Yes, I have a User ID</span>
              <span className="userid-modal-option-desc">Enter it to pull back your saved answers.</span>
            </button>
            <button
              type="button"
              className="userid-modal-option userid-modal-option--secondary"
              onClick={onDismiss}
            >
              <span className="userid-modal-option-label">No, start fresh</span>
              <span className="userid-modal-option-desc">You'll get a new User ID at the end you can save.</span>
            </button>
          </div>
        ) : (
          <form className="userid-modal-form" onSubmit={handleLoad}>
            <label htmlFor={`${titleId}-input`} className="userid-modal-input-label">
              Your User ID
            </label>
            <input
              ref={inputRef}
              id={`${titleId}-input`}
              className="userid-modal-input"
              type="text"
              placeholder="e.g. K7X2-M4QR"
              value={idInput}
              onChange={(e) => { setIdInput(e.target.value); setErrorMessage(""); }}
              disabled={isBusy}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
            />
            <p className="userid-modal-hint">
              8 letters or numbers. Dashes and capitalisation are ignored.
            </p>
            {errorMessage ? (
              <p className="userid-modal-error" role="alert">{errorMessage}</p>
            ) : null}
            <div className="userid-modal-actions">
              <button
                type="button"
                className="button ghost userid-modal-back"
                onClick={() => { setBranch("choose"); setErrorMessage(""); }}
                disabled={isBusy}
              >
                Back
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={onDismiss}
                disabled={isBusy}
              >
                Skip for now
              </button>
              <button type="submit" className="button primary" disabled={isBusy}>
                {isBusy ? "Loading..." : loadEnabled ? "Load my profile" : "Continue"}
              </button>
            </div>
          </form>
        )}

        <button
          type="button"
          className="userid-modal-skiplink"
          onClick={onDismiss}
          disabled={isBusy}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

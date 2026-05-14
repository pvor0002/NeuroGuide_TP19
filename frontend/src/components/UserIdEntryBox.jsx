import { useId, useRef, useState } from "react";

/**
 * Inline "Already have a User ID?" card. Lives directly inside the page (no
 * backdrop / modal) so it doesn't compete with the consent popup. Used both
 * on the first step of the Career Profile wizard and at the top of the
 * Simplify Job Description page.
 *
 * Visually it intentionally looks different from the question option cards
 * - softer tint, dashed border, key icon - so visitors can tell it's an
 * optional shortcut and not "another question to answer".
 *
 * @param {object} props
 * @param {(id: string) => Promise<void>} [props.onSubmit]
 *        Async handler invoked when the user clicks Load. Throw to surface
 *        an error message back into the box.
 * @param {boolean} [props.loadEnabled=true]
 *        When false, the box still collects the ID but shows a "coming soon"
 *        note instead of calling ``onSubmit``.
 * @param {string}  [props.title]
 * @param {string}  [props.description]
 * @param {string}  [props.unavailableMessage]
 */
export default function UserIdEntryBox({
  onSubmit,
  loadEnabled = true,
  title = "Already have a User ID?",
  description = "Enter it to load the profile you saved last time.",
  unavailableMessage = "Loading saved work by User ID isn't wired up on this page yet - coming soon.",
  defaultOpen = false,
  showToggle = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [idInput, setIdInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef(null);
  const titleId = useId();

  const reveal = () => {
    setOpen(true);
    setErrorMessage("");
    setInfoMessage("");
    // Delay focus so the input has mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const trimmed = String(idInput || "").trim();
    if (!trimmed) {
      setErrorMessage("Enter your User ID to continue.");
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
      await onSubmit(trimmed);
    } catch (err) {
      setErrorMessage(err?.message || "We couldn't load that User ID. Check for typos and try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="userid-box" aria-labelledby={titleId}>
      <div className="userid-box-icon" aria-hidden="true">
        {/* simple key glyph - purely decorative */}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="12" r="4" />
          <path d="M13 12h8" />
          <path d="M17 12v3" />
          <path d="M20 12v2" />
        </svg>
      </div>

      <div className="userid-box-body">
        <h3 id={titleId} className="userid-box-title">{title}</h3>
        <p className="userid-box-desc">{description}</p>

        {!open && showToggle ? (
          <button
            type="button"
            className="userid-box-toggle"
            onClick={reveal}
          >
            Enter my User ID
            <span aria-hidden="true">→</span>
          </button>
        ) : open ? (
          <form className="userid-box-form" onSubmit={handleSubmit}>
            <label htmlFor={`${titleId}-input`} className="visually-hidden-label">
              Your User ID
            </label>
            <div className="userid-box-row">
              <input
                ref={inputRef}
                id={`${titleId}-input`}
                className="userid-box-input"
                type="text"
                placeholder="K7X2-M4QR"
                value={idInput}
                onChange={(e) => { setIdInput(e.target.value); setErrorMessage(""); setInfoMessage(""); }}
                disabled={isBusy}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
              />
              <button type="submit" className="button primary userid-box-submit" disabled={isBusy}>
                {isBusy ? "Loading..." : loadEnabled ? "Load" : "Continue"}
              </button>
              <button
                type="button"
                className="userid-box-cancel"
                onClick={() => { setOpen(false); setErrorMessage(""); setInfoMessage(""); setIdInput(""); }}
                disabled={isBusy}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
            {errorMessage ? <p className="userid-box-error" role="alert">{errorMessage}</p> : null}
            {infoMessage ? <p className="userid-box-info" role="status">{infoMessage}</p> : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}

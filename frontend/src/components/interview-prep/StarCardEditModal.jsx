import { useEffect, useId, useRef, useState } from "react";

export default function StarCardEditModal({ open, initialText, onSave, onClose }) {
  const titleId = useId();
  const fieldId = useId();
  const [draft, setDraft] = useState(initialText || "");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initialText || "");
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialText]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = draft.trim();
  const canSave = Boolean(trimmed);

  return (
    <div className="ip-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ip-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ip-modal__head">
          <h3 id={titleId} className="ip-modal__title">
            Edit idea
          </h3>
          <button type="button" className="ip-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="ip-modal__lead">Update the wording on this card. Drag it between STAR zones after saving.</p>
        <label className="ip-modal__label" htmlFor={fieldId}>
          Idea text
        </label>
        <textarea
          ref={textareaRef}
          id={fieldId}
          className="ip-modal__textarea"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
              e.preventDefault();
              onSave(trimmed);
            }
          }}
        />
        <footer className="ip-modal__footer">
          <button type="button" className="ip-btn ip-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ip-btn ip-btn--primary"
            disabled={!canSave}
            onClick={() => onSave(trimmed)}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

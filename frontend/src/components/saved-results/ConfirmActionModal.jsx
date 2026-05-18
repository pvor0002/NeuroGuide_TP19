import { useEffect, useId, useRef } from "react";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {boolean} [props.destructive]
 * @param {boolean} [props.busy]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const handleBackdrop = () => {
    if (!busy) onCancel();
  };

  return (
    <div className="confirm-action-modal-backdrop" onClick={handleBackdrop}>
      <div
        className="confirm-action-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="confirm-action-modal-title">
          {title}
        </h2>
        {message ? (
          <p id={descId} className="confirm-action-modal-message">
            {message}
          </p>
        ) : null}
        <div className="confirm-action-modal-actions">
          <button type="button" className="confirm-action-modal-btn confirm-action-modal-btn--ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`confirm-action-modal-btn ${destructive ? "confirm-action-modal-btn--danger" : "confirm-action-modal-btn--primary"}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

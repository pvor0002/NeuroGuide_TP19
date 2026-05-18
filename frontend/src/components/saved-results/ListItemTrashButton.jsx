function TrashIcon() {
  return (
    <svg
      className="saved-list-trash-btn__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/**
 * Icon-only delete control for saved listing rows (to the right of the primary CTA).
 */
export default function ListItemTrashButton({
  onClick,
  disabled = false,
  busy = false,
  label = "Delete",
}) {
  return (
    <button
      type="button"
      className="saved-list-trash-btn"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-label={busy ? "Deleting…" : label}
      title={label}
    >
      {busy ? <span className="saved-list-trash-btn__spinner" aria-hidden="true" /> : <TrashIcon />}
    </button>
  );
}

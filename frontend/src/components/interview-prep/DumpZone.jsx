export default function DumpZone({ cards, onRemove }) {
  if (cards.length === 0) return null;
  return (
    <div className="ip-dump-zone">
      <p className="ip-dump-zone__label">Your ideas ({cards.length})</p>
      <div className="ip-dump-cards">
        {cards.map((c) => (
          <div key={c.id} className="ip-dump-chip">
            <span className="ip-dump-chip__text">{c.text}</span>
            <button type="button" className="ip-dump-chip__x" onClick={() => onRemove(c.id)} aria-label="Remove idea">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

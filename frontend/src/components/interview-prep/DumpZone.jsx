export default function DumpZone({ cards, onRemove }) {
  return (
    <div className="ip-dump-zone">
      <p className="ip-dump-zone__label">Just talk it out, anything goes</p>
      <p className="ip-placeholder-hint">Try: &quot;the time I had to deal with a difficult deadline…&quot;</p>
      <div className="ip-dump-cards">
        {cards.length === 0 ? (
          <p className="ip-dump-empty">Ideas will appear here as cards while you type or speak.</p>
        ) : (
          cards.map((c) => (
            <div key={c.id} className="ip-dump-chip">
              <span className="ip-dump-chip__text">{c.text}</span>
              <button type="button" className="ip-dump-chip__x" onClick={() => onRemove(c.id)} aria-label={`Remove idea`}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

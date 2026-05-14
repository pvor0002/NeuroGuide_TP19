/**
 * DumpZone.jsx
 *
 * Displays the user's saved brain dump ideas as removable chips.
 *
 * Responsibilities:
 *  - Render nothing when there are no cards (the input area is enough on its own)
 *  - Show a "YOUR IDEAS (n)" label above the chips when cards exist
 *  - Each chip shows the idea text and an × button to remove it
 *
 * Props:
 *  - cards    {Card[]}   Array of { id: string, text: string } objects
 *  - onRemove {fn}       Called with the card id when × is clicked
 */

export default function DumpZone({ cards, onRemove }) {
  // Nothing to render until at least one card has been added
  if (cards.length === 0) {
    console.log("[DumpZone] no cards — rendering nothing");
    return null;
  }

  console.log("[DumpZone] rendering", cards.length, "card(s):", cards);

  return (
    <div className="ip-dump-zone">
      {/* Label shows live count so user always knows how many ideas they have saved */}
      <p className="ip-dump-zone__label">Your ideas ({cards.length})</p>

      <div className="ip-dump-cards">
        {cards.map((c) => (
          <div key={c.id} className="ip-dump-chip">
            <span className="ip-dump-chip__text">{c.text}</span>

            {/*
              Remove button — calls onRemove with this card's id.
              BrainDumpStage filters the card out and calls onDumpChange
              with the updated array, which updates state in InterviewPrepPage.
            */}
            <button
              type="button"
              className="ip-dump-chip__x"
              onClick={() => {
                console.log("[DumpZone] remove clicked — card id:", c.id, "text:", c.text);
                onRemove(c.id);
              }}
              aria-label="Remove idea"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

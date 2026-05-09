import StarGrid from "./StarGrid.jsx";
import FollowUpBubble from "./FollowUpBubble.jsx";
import { uid } from "../../utils/interviewPrepHelpers.js";

export default function OrganiseStage({
  dumpCards,
  onDumpChange,
  starZones,
  onZonesChange,
  usedFallbackSort,
  onContinue,
  onBack,
  needsStarSort,
  onSortNow,
  organising,
}) {
  const addToZone = (zoneKey, text) => {
    const id = uid("z");
    onDumpChange([...dumpCards, { id, text }]);
    onZonesChange({
      ...starZones,
      [zoneKey]: [...(starZones[zoneKey] || []), id],
    });
  };

  return (
    <section className="ip-stage ip-card ip-stage--compact" aria-labelledby="ip-stage-org-title">
      <h2 id="ip-stage-org-title" className="ip-card-title ip-card-title--soft">
        Organise
      </h2>
      <p className="ip-card-intro ip-card-intro--tight">
        Drag cards between STAR zones, or tap a card then a zone. Add a missing detail below if needed.
      </p>

      {needsStarSort ? (
        <div className="ip-inline-msg ip-inline-msg--action" role="status">
          <span>Your ideas aren’t sorted into STAR yet.</span>
          <button type="button" className="ip-btn ip-btn--secondary ip-btn--compact" disabled={organising} onClick={onSortNow}>
            {organising ? "Sorting…" : "Sort into STAR"}
          </button>
        </div>
      ) : usedFallbackSort ? (
        <p className="ip-inline-msg" role="status">
          Drag cards into the right zones, or add a quick line below if something is missing.
        </p>
      ) : (
        <p className="ip-muted ip-muted--tight">Fine-tune with drag or tap-to-move.</p>
      )}

      <StarGrid dumpCards={dumpCards} starZones={starZones} onZonesChange={onZonesChange} />

      <FollowUpBubble starZones={starZones} onAddToZone={addToZone} />

      <footer className="ip-footer-actions ip-footer-actions--split">
        <button type="button" className="ip-btn ip-btn--quiet" onClick={onBack}>
          ← Brain dump
        </button>
        <button type="button" className="ip-btn ip-btn--primary" disabled={needsStarSort} onClick={onContinue}>
          Build my answer →
        </button>
      </footer>
    </section>
  );
}

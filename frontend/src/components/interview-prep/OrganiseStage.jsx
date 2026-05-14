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
    <section className="ip-stage" aria-labelledby="ip-stage-org-title">

      <div className="ip-stage-head">
        <div>
          <h2 id="ip-stage-org-title" className="ip-stage-title">Organise into STAR</h2>
          <p className="ip-stage-lead">Drag cards between zones, or tap a card then tap a zone to move it.</p>
        </div>

        {needsStarSort && (
          <button type="button" className="ip-btn ip-btn--secondary" disabled={organising} onClick={onSortNow}>
            {organising ? "Sorting…" : "✦ Auto-sort into STAR"}
          </button>
        )}
      </div>

      {usedFallbackSort && !needsStarSort && (
        <div className="ip-stage-notice" role="status">
          Cards were sorted automatically. Drag to fine-tune, or add a missing detail below.
        </div>
      )}

      <StarGrid dumpCards={dumpCards} starZones={starZones} onZonesChange={onZonesChange} />

      <FollowUpBubble starZones={starZones} onAddToZone={addToZone} />

      <footer className="ip-stage-footer">
        <button type="button" className="ip-btn ip-btn--ghost" onClick={onBack}>
          ← Brain dump
        </button>
        <button type="button" className="ip-btn ip-btn--primary" disabled={needsStarSort} onClick={onContinue}>
          Build my answer →
        </button>
      </footer>
    </section>
  );
}

import StarGrid from "./StarGrid.jsx";
import FollowUpBubble from "./FollowUpBubble.jsx";
import { uid } from "../../utils/interviewPrepHelpers.js";

export default function OrganiseStage({
  dumpCards,
  onDumpChange,
  starZones,
  onZonesChange,
  usedFallbackSort,
  onSave,
  onContinue,
  onBack,
  needsStarSort,
  onSortNow,
  organising,
  saving = false,
  saveAck = false,
}) {
  const addToZone = (zoneKey, text) => {
    const id = uid("z");
    onDumpChange([...dumpCards, { id, text }]);
    onZonesChange({
      ...starZones,
      [zoneKey]: [...(starZones[zoneKey] || []), id],
    });
  };

  const editCard = (id, text) => {
    onDumpChange(dumpCards.map((c) => (c.id === id ? { ...c, text } : c)));
  };

  const removeCard = (id) => {
    onDumpChange(dumpCards.filter((c) => c.id !== id));
    onZonesChange({
      situation: (starZones.situation || []).filter((x) => x !== id),
      task: (starZones.task || []).filter((x) => x !== id),
      action: (starZones.action || []).filter((x) => x !== id),
      result: (starZones.result || []).filter((x) => x !== id),
    });
  };

  const busy = organising || saving;

  return (
    <section className="ip-stage" aria-labelledby="ip-stage-org-title">

      <div className="ip-stage-head">
        <div>
          <h2 id="ip-stage-org-title" className="ip-stage-title">Organise into STAR</h2>
          <p className="ip-stage-lead">Drag cards between zones, or tap a card then tap a zone to move it.</p>
          <p className="ip-star-legend" aria-label="STAR method">
            <span className="ip-star-legend__item">
              <span className="ip-star-legend__letter ip-star-legend__letter--s">S</span>
              Situation
            </span>
            <span className="ip-star-legend__item">
              <span className="ip-star-legend__letter ip-star-legend__letter--t">T</span>
              Task
            </span>
            <span className="ip-star-legend__item">
              <span className="ip-star-legend__letter ip-star-legend__letter--a">A</span>
              Action
            </span>
            <span className="ip-star-legend__item">
              <span className="ip-star-legend__letter ip-star-legend__letter--r">R</span>
              Result
            </span>
          </p>
        </div>

        {needsStarSort && (
          <button type="button" className="ip-btn ip-btn--secondary" disabled={busy} onClick={onSortNow}>
            {organising ? "Sorting…" : "✦ Auto-sort into STAR"}
          </button>
        )}
      </div>

      {usedFallbackSort && !needsStarSort && (
        <div className="ip-stage-notice" role="status">
          Cards were sorted automatically. Long notes were split into separate points. Drag to fine-tune, or add a missing detail below.
        </div>
      )}

      <StarGrid
        dumpCards={dumpCards}
        starZones={starZones}
        onZonesChange={onZonesChange}
        onEditCard={editCard}
        onRemoveCard={removeCard}
      />

      {!needsStarSort ? <FollowUpBubble onAddToZone={addToZone} /> : null}

      <footer className="ip-stage-footer">
        <button type="button" className="ip-btn ip-btn--ghost" onClick={onBack} disabled={busy}>
          ← Brain dump
        </button>
        <div className="ip-stage-footer__right">
          {saveAck ? <p className="ip-save-ack" role="status">Saved</p> : null}
          <button type="button" className="ip-btn ip-btn--secondary" disabled={needsStarSort || busy} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="ip-btn ip-btn--primary" disabled={needsStarSort || busy} onClick={onContinue}>
            {saving ? "Saving…" : "Build my answer →"}
          </button>
        </div>
      </footer>
    </section>
  );
}

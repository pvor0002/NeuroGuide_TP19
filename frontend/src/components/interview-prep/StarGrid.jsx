import { useCallback, useMemo, useState } from "react";
import { unassignedDumpCardIds } from "../../utils/interviewPrepHelpers.js";
import StarCardEditModal from "./StarCardEditModal.jsx";

/** Organise-stage zones: Situation, Task, Action, Result. */
const ZONES = [
  {
    key: "situation",
    letter: "S",
    letterClass: "s",
    title: "Situation",
    label: "The situation",
    help: "Set the scene: where you were, what was going on, and any constraints.",
  },
  {
    key: "task",
    letter: "T",
    letterClass: "t",
    title: "Task",
    label: "Your goal or role",
    help: "Your goal or what you were responsible for in that moment.",
  },
  {
    key: "action",
    letter: "A",
    letterClass: "a",
    title: "Action",
    label: "What you did",
    help: 'What you did. Say "I" and name the steps you took.',
  },
  {
    key: "result",
    letter: "R",
    letterClass: "r",
    title: "Result",
    label: "The result",
    help: "What changed: outcomes, impact, or rough numbers.",
  },
];

function StarZoneHelp({ helpId, helpText }) {
  return (
    <span className="ip-star-zone__help-wrap">
      <span className="ip-star-zone__help-btn" aria-describedby={helpId}>
        ?
      </span>
      <span id={helpId} role="tooltip" className="ip-star-zone__tooltip">
        {helpText}
      </span>
    </span>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconRemove() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7h12M9 7V5h6v2M10 11v6M14 11v6M8 7l1 12h6l1-12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StarGrid({ dumpCards, starZones, onZonesChange, onEditCard, onRemoveCard }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editingCard, setEditingCard] = useState(null);

  const byId = useMemo(() => Object.fromEntries(dumpCards.map((c) => [c.id, c])), [dumpCards]);
  const unplacedIds = useMemo(() => unassignedDumpCardIds(dumpCards, starZones), [dumpCards, starZones]);

  const moveToZone = useCallback(
    (cardId, zoneKey) => {
      if (!cardId || !ZONES.some((z) => z.key === zoneKey)) return;
      const next = {
        situation: [...(starZones.situation || [])],
        task: [...(starZones.task || [])],
        action: [...(starZones.action || [])],
        result: [...(starZones.result || [])],
      };
      for (const k of Object.keys(next)) {
        next[k] = next[k].filter((id) => id !== cardId);
      }
      next[zoneKey].push(cardId);
      onZonesChange(next);
      setSelectedId(null);
    },
    [onZonesChange, starZones],
  );

  const onDragStart = (e, cardId) => {
    e.dataTransfer.setData("text/card-id", cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e, zoneKey) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/card-id");
    if (cardId) moveToZone(cardId, zoneKey);
  };

  const openEdit = (id, e) => {
    e.stopPropagation();
    const c = byId[id];
    if (!c) return;
    setEditingCard({ id, text: c.text });
  };

  const confirmRemove = (id, e) => {
    e.stopPropagation();
    if (typeof onRemoveCard === "function") onRemoveCard(id);
    if (selectedId === id) setSelectedId(null);
    if (editingCard?.id === id) setEditingCard(null);
  };

  const renderChip = (id, extraClass = "") => {
    const c = byId[id];
    if (!c) return null;
    const labelSnippet = c.text.slice(0, 40) + (c.text.length > 40 ? "…" : "");
    return (
      <div key={id} className={`ip-star-chip-wrap ${selectedId === id ? "ip-star-chip-wrap--pick" : ""}`}>
        <div
          className={`ip-star-chip ${extraClass}`}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => onDragStart(e, id)}
          onClick={(e) => {
            if (e.target.closest(".ip-star-chip__act")) return;
            setSelectedId((p) => (p === id ? null : id));
          }}
          onKeyDown={(e) => {
            if (e.target.closest(".ip-star-chip__act")) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelectedId((p) => (p === id ? null : id));
            }
          }}
        >
          <div className="ip-star-chip__actions">
            <button
              type="button"
              className="ip-star-chip__act ip-star-chip__act--edit"
              aria-label={`Edit "${labelSnippet}"`}
              onClick={(e) => openEdit(id, e)}
            >
              <IconEdit />
            </button>
            <button
              type="button"
              className="ip-star-chip__act ip-star-chip__act--remove"
              aria-label={`Remove "${labelSnippet}"`}
              onClick={(e) => confirmRemove(id, e)}
            >
              <IconRemove />
            </button>
          </div>
          <span className="ip-star-chip__text">{c.text}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <StarCardEditModal
        open={Boolean(editingCard)}
        initialText={editingCard?.text ?? ""}
        onClose={() => setEditingCard(null)}
        onSave={(text) => {
          if (editingCard?.id && typeof onEditCard === "function") onEditCard(editingCard.id, text);
          setEditingCard(null);
        }}
      />

      {unplacedIds.length > 0 ? (
        <div className="ip-star-unplaced" role="region" aria-label="Ideas not yet in STAR">
          <p className="ip-star-unplaced__label">
            Not placed yet ({unplacedIds.length}). Drag into a zone, or tap a card then tap a zone.
          </p>
          <div className="ip-star-unplaced__chips">
            {unplacedIds.map((id) => renderChip(id, "ip-star-chip--unplaced"))}
          </div>
        </div>
      ) : null}

      <div className="ip-star-grid">
        {ZONES.map(({ key, letter, letterClass, title, label, help }) => {
          const ids = starZones[key] || [];
          const empty = ids.length === 0;
          const helpId = `ip-star-help-${key}`;
          return (
            <div
              key={key}
              className={`ip-star-zone ${empty ? "ip-star-zone--empty" : ""}`}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, key)}
              onClick={() => {
                if (selectedId) moveToZone(selectedId, key);
              }}
              role="group"
              aria-label={`${letter}, ${title}: ${label}`}
            >
              <div className="ip-star-zone__head">
                <span className={`ip-star-zone__letter ip-star-zone__letter--${letterClass}`} aria-hidden="true">
                  {letter}
                </span>
                <span className="ip-star-zone__titles">
                  <span className="ip-star-zone__title">{title}</span>
                  <span className="ip-star-zone__subtitle">{label}</span>
                </span>
                <StarZoneHelp helpId={helpId} helpText={help} />
              </div>
              <div className="ip-star-zone__body">
                {empty ? <p className="ip-star-placeholder">Nothing here yet</p> : ids.map((id) => renderChip(id))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export { ZONES };

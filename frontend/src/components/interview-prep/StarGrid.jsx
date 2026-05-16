import { useCallback, useMemo, useState } from "react";

/** Organise-stage zones — classic STAR (Situation, Task, Action, Result). */
const ZONES = [
  {
    key: "situation",
    letter: "S",
    letterClass: "s",
    title: "Situation",
    label: "The situation",
    help: "Set the scene: where you were, what was going on, and any constraints. Often 1–2 sentences.",
  },
  {
    key: "task",
    letter: "T",
    letterClass: "t",
    title: "Task",
    label: "Your goal or role",
    help: "Your specific responsibility or goal — what you were asked to achieve or own in that moment.",
  },
  {
    key: "action",
    letter: "A",
    letterClass: "a",
    title: "Action",
    label: "What you did",
    help: "What you personally did — say “I…” and name the steps you took, not only what the team did overall.",
  },
  {
    key: "result",
    letter: "R",
    letterClass: "r",
    title: "Result",
    label: "The result",
    help: "What changed because of your work: outcomes, impact, or numbers if you have them — even rough ones.",
  },
];

function StarZoneHelp({ helpId, helpText }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="ip-star-zone__help-wrap">
      <button
        type="button"
        className="ip-star-zone__help-btn"
        aria-label="What this zone means"
        aria-expanded={open}
        aria-controls={helpId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      <span
        id={helpId}
        role="tooltip"
        className={`ip-star-zone__tooltip ${open ? "ip-star-zone__tooltip--open" : ""}`}
      >
        {helpText}
      </span>
    </span>
  );
}

export default function StarGrid({ dumpCards, starZones, onZonesChange }) {
  const [selectedId, setSelectedId] = useState(null);

  const byId = useMemo(() => Object.fromEntries(dumpCards.map((c) => [c.id, c])), [dumpCards]);

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

  return (
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
            aria-label={`${letter} — ${title}: ${label}`}
          >
            <div className="ip-star-zone__head">
              <span
                className={`ip-star-zone__letter ip-star-zone__letter--${letterClass}`}
                aria-hidden="true"
              >
                {letter}
              </span>
              <span className="ip-star-zone__titles">
                <span className="ip-star-zone__title">{title}</span>
                <span className="ip-star-zone__subtitle">{label}</span>
              </span>
              <StarZoneHelp helpId={helpId} helpText={help} />
            </div>
            <div className="ip-star-zone__body">
              {empty ? (
                <p className="ip-star-placeholder">Nothing here yet</p>
              ) : (
                ids.map((id) => {
                  const c = byId[id];
                  if (!c) return null;
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => onDragStart(e, id)}
                      className={`ip-star-chip ${selectedId === id ? "ip-star-chip--pick" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId((p) => (p === id ? null : id));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId((p) => (p === id ? null : id));
                        }
                      }}
                    >
                      {c.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ZONES };

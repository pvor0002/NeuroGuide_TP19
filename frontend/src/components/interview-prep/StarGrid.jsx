import { useCallback, useMemo, useState } from "react";

const ZONES = [
  { key: "situation", icon: "📍", label: "The situation" },
  { key: "action", icon: "🤝", label: "What you did" },
  { key: "result", icon: "🏆", label: "The result" },
  { key: "learning", icon: "📖", label: "What you learned" },
];

export default function StarGrid({ dumpCards, starZones, onZonesChange }) {
  const [selectedId, setSelectedId] = useState(null);

  const byId = useMemo(() => Object.fromEntries(dumpCards.map((c) => [c.id, c])), [dumpCards]);

  const moveToZone = useCallback(
    (cardId, zoneKey) => {
      if (!cardId || !ZONES.some((z) => z.key === zoneKey)) return;
      const next = {
        situation: [...starZones.situation],
        action: [...starZones.action],
        result: [...starZones.result],
        learning: [...starZones.learning],
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
      {ZONES.map(({ key, icon, label }) => {
        const ids = starZones[key] || [];
        const empty = ids.length === 0;
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
            aria-label={label}
          >
            <div className="ip-star-zone__head">
              <span aria-hidden="true">{icon}</span>
              <span className="ip-star-zone__title">{label}</span>
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

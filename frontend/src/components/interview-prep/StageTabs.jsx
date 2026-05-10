/**
 * Compact stage navigation — matches site tabs; reduces vertical scrolling vs a tall stepper.
 */
export default function StageTabs({ stage, onSelect, canOrganise, canPractise }) {
  const tabs = [
    { id: 1, label: "Brain dump", disabled: false },
    { id: 2, label: "Organise", disabled: !canOrganise },
    { id: 3, label: "Practise", disabled: !canPractise },
  ];

  return (
    <div className="ip-stage-tabs-wrap">
      <div className="ip-stage-tabs" role="tablist" aria-label="Interview prep steps">
        {tabs.map((t, i) => {
          const selected = stage === t.id;
          const cls = ["ip-stage-tab"];
          if (selected) cls.push("ip-stage-tab--active");
          if (t.disabled) cls.push("ip-stage-tab--disabled");

          return (
            <span key={t.id} className="ip-stage-tabs__seg">
              {i > 0 ? (
                <span className="ip-stage-tabs__sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                aria-disabled={t.disabled}
                disabled={t.disabled}
                className={cls.join(" ")}
                id={`ip-tab-${t.id}`}
                aria-controls={`ip-tab-panel-${t.id}`}
                onClick={() => {
                  if (!t.disabled) onSelect(t.id);
                }}
              >
                <span className="ip-stage-tab__n" aria-hidden="true">
                  {t.id}
                </span>
                {t.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

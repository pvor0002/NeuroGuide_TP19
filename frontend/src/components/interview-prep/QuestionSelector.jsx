export default function QuestionSelector({
  questions,
  selectedQuestion,
  onSelect,
  removableQuestionKeys,
  onRemove,
}) {
  const canRemove = (q) => {
    const k = String(q || "").trim();
    return Boolean(removableQuestionKeys?.has(k) && typeof onRemove === "function");
  };

  return (
    <div className="ip-q-list" role="listbox" aria-label="Interview questions">
      {questions.map((q) => {
        const selected = q === selectedQuestion;
        const showRemove = canRemove(q);
        return (
          <div
            key={q}
            className={`ip-q-row ${selected ? "ip-q-row--selected" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={`ip-q-card ${selected ? "ip-q-card--selected" : ""}`}
              onClick={() => onSelect(q)}
            >
              <span className="ip-q-card__text">{q}</span>
            </button>
            {showRemove ? (
              <button
                type="button"
                className="ip-q-remove"
                aria-label={`Remove custom question: ${q}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(q);
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

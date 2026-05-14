export default function QuestionSelector({
  questions,
  selectedQuestion,
  onSelect,
  answeredQuestions = {},
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
        const answered = !selected && Boolean(answeredQuestions[q]);
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
              className={`ip-q-card ${selected ? "ip-q-card--selected" : ""} ${answered ? "ip-q-card--answered" : ""}`}
              onClick={() => onSelect(q)}
            >
              <span className="ip-q-card__text">{q}</span>
              {answered && (
                <span className="ip-q-card__done" aria-label="Previously answered" title="You have a saved answer for this question">✓</span>
              )}
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

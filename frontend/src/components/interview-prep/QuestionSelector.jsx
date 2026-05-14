export default function QuestionSelector({ questions, selectedQuestion, onSelect, answeredQuestions = {} }) {
  return (
    <div className="ip-q-list" role="listbox" aria-label="Interview questions">
      {questions.map((q) => {
        const selected = q === selectedQuestion;
        const answered = !selected && Boolean(answeredQuestions[q]);
        return (
          <button
            key={q}
            type="button"
            role="option"
            aria-selected={selected}
            className={`ip-q-card ${selected ? "ip-q-card--selected" : ""} ${answered ? "ip-q-card--answered" : ""}`}
            onClick={() => onSelect(q)}
          >
            <span className="ip-q-card__text">{q}</span>
            {answered && (
              <span className="ip-q-card__done" aria-label="Previously answered" title="You have a saved answer for this question">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

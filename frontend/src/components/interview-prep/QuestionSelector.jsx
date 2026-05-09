export default function QuestionSelector({ questions, selectedQuestion, onSelect }) {
  return (
    <div className="ip-q-list" role="listbox" aria-label="Interview questions">
      {questions.map((q) => {
        const selected = q === selectedQuestion;
        return (
          <button
            key={q}
            type="button"
            role="option"
            aria-selected={selected}
            className={`ip-q-card ${selected ? "ip-q-card--selected" : ""}`}
            onClick={() => onSelect(q)}
          >
            <span className="ip-q-card__text">{q}</span>
          </button>
        );
      })}
    </div>
  );
}

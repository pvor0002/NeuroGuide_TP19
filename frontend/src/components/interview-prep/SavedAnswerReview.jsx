/**
 * Read-only view when returning to a question that already has a saved answer.
 * "Edit answer" sends the user back through Brain dump → Organise → Practise.
 */
export default function SavedAnswerReview({ question, answerText, onEditAnswer, onNextQuestion }) {
  const text = String(answerText || "").trim();

  return (
    <section className="ip-stage ip-saved-review" aria-labelledby="ip-saved-review-title">
      <div className="ip-practise-q-banner">
        <span className="ip-practise-q-eyebrow">Saved answer</span>
        <h2 id="ip-saved-review-title" className="ip-practise-q-text">
          {question}
        </h2>
      </div>

      <div className="ip-saved-review-body">
        <div className="ip-saved-review-card" role="region" aria-label="Your saved answer">
          {text ? (
            <div className="ip-saved-review-text">{text}</div>
          ) : (
            <p className="ip-saved-review-empty">No answer text on file. Use Edit to build this answer.</p>
          )}
        </div>

        <footer className="ip-stage-footer ip-saved-review-footer">
          <button type="button" className="ip-btn ip-btn--secondary" onClick={onEditAnswer}>
            Edit answer (brain dump & STAR)
          </button>
          <div className="ip-stage-footer__right">
            <button type="button" className="ip-btn ip-btn--primary" onClick={onNextQuestion}>
              Next question →
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

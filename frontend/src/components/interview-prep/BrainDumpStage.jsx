import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DumpZone from "./DumpZone.jsx";
import QuestionSelector from "./QuestionSelector.jsx";
import VoiceButton from "./VoiceButton.jsx";
import { uid } from "../../utils/interviewPrepHelpers.js";

export default function BrainDumpStage({
  questions,
  selectedQuestion,
  onSelectQuestion,
  dumpCards,
  onDumpChange,
  onContinue,
  organising,
}) {
  const [line, setLine] = useState("");

  const addCard = useCallback(
    (text) => {
      const t = String(text || "").trim();
      if (!t) return;
      onDumpChange([...dumpCards, { id: uid("d"), text: t }]);
    },
    [dumpCards, onDumpChange],
  );

  // Voice fills the textarea so the user can review and edit before adding
  const onVoice = useCallback((transcript) => {
    setLine((prev) => prev ? `${prev} ${transcript}` : transcript);
  }, []);

  const onSubmitLine = useCallback(() => {
    addCard(line);
    setLine("");
  }, [addCard, line]);

  const listOk = useMemo(() => selectedQuestion && dumpCards.length >= 2, [dumpCards.length, selectedQuestion]);

  return (
    <section className="ip-stage" aria-labelledby="ip-stage-dump-title">

      {/* Two-column layout */}
      <div className="ip-bd-layout">

        {/* Left — question picker */}
        <div className="ip-bd-left">
          <div className="ip-bd-section-head">
            <span className="ip-bd-step-badge">1</span>
            <h2 className="ip-bd-section-title" id="ip-stage-dump-title">Pick a question</h2>
          </div>
          <p className="ip-bd-hint">Choose one to focus on. You can come back and try others.</p>
          <QuestionSelector questions={questions} selectedQuestion={selectedQuestion} onSelect={onSelectQuestion} />
        </div>

        {/* Divider */}
        <div className="ip-bd-divider" aria-hidden="true" />

        {/* Right — ideas */}
        <div className="ip-bd-right">
          <div className="ip-bd-section-head">
            <span className="ip-bd-step-badge">2</span>
            <h2 className="ip-bd-section-title">Brain dump</h2>
          </div>
          <p className="ip-bd-hint">Anything that comes to mind, messy is fine. Add as many ideas as you like.</p>

          {/* Chat-style input */}
          <div className="ip-dump-entry">
            <label className="ip-visually-hidden" htmlFor="ip-dump-line">Add an idea</label>
            <textarea
              id="ip-dump-line"
              className="ip-dump-textarea"
              rows={4}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmitLine(); }
              }}
              placeholder={`Think out loud. A project, a moment, a problem you solved. Anything that comes to mind.\n\nTry: "fixed a bug before a big launch" or "helped a teammate through a tough deadline"`}
              disabled={!selectedQuestion}
            />
            <div className="ip-dump-entry-bar">
              <VoiceButton onTranscript={onVoice} disabled={!selectedQuestion} />
              <button
                type="button"
                className="ip-dump-send-btn"
                onClick={onSubmitLine}
                disabled={!line.trim() || !selectedQuestion}
                aria-label="Add idea"
              >
                ↑
              </button>
            </div>
          </div>

          {/* Chips — appear below as ideas are added */}
          <DumpZone
            cards={dumpCards}
            onRemove={(id) => onDumpChange(dumpCards.filter((c) => c.id !== id))}
          />

          {!selectedQuestion && (
            <p className="ip-bd-nudge">← Pick a question first to start adding ideas.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="ip-stage-footer">
        <Link to="/simplify-job-description" className="ip-btn ip-btn--ghost">
          ← Job posting
        </Link>
        <div className="ip-stage-footer__right">
          {dumpCards.length > 0 && dumpCards.length < 2 && (
            <span className="ip-stage-footer__hint">Add at least one more idea to continue</span>
          )}
          <button
            type="button"
            className="ip-btn ip-btn--primary"
            disabled={!listOk || organising}
            onClick={onContinue}
          >
            {organising ? "Organising…" : "Organise my ideas →"}
          </button>
        </div>
      </footer>
    </section>
  );
}

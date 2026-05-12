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

  const onVoice = useCallback((transcript) => addCard(transcript), [addCard]);

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

          <DumpZone
            cards={dumpCards}
            onRemove={(id) => onDumpChange(dumpCards.filter((c) => c.id !== id))}
          />

          <div className="ip-dump-input-row">
            <label className="ip-visually-hidden" htmlFor="ip-dump-line">Add an idea</label>
            <input
              id="ip-dump-line"
              className="ip-input ip-input--grow"
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onSubmitLine(); }
              }}
              placeholder="Type an idea, then Enter…"
              disabled={!selectedQuestion}
            />
            <button
              type="button"
              className="ip-btn ip-btn--add"
              onClick={onSubmitLine}
              disabled={!line.trim() || !selectedQuestion}
            >
              Add
            </button>
            <VoiceButton onTranscript={onVoice} disabled={!selectedQuestion} />
          </div>

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

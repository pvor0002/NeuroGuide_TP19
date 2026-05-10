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

  const onVoice = useCallback(
    (transcript) => {
      addCard(transcript);
    },
    [addCard],
  );

  const onSubmitLine = useCallback(() => {
    addCard(line);
    setLine("");
  }, [addCard, line]);

  const listOk = useMemo(() => selectedQuestion && dumpCards.length >= 2, [dumpCards.length, selectedQuestion]);

  return (
    <section className="ip-stage ip-card ip-stage--compact" aria-labelledby="ip-stage-dump-title">
      <h2 id="ip-stage-dump-title" className="ip-card-title ip-card-title--soft">
        Brain dump
      </h2>
      <p className="ip-card-intro ip-card-intro--tight">Pick a question, then add ideas — messy is fine.</p>

      <h3 className="ip-subheading">Question</h3>
      <QuestionSelector questions={questions} selectedQuestion={selectedQuestion} onSelect={onSelectQuestion} />

      <DumpZone cards={dumpCards} onRemove={(id) => onDumpChange(dumpCards.filter((c) => c.id !== id))} />

      <div className="ip-dump-input-row">
        <label className="ip-visually-hidden" htmlFor="ip-dump-line">
          Add an idea
        </label>
        <input
          id="ip-dump-line"
          className="ip-input ip-input--grow"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmitLine();
            }
          }}
          placeholder="Snippet, then Enter or Add"
        />
        <button type="button" className="ip-btn ip-btn--quiet" onClick={onSubmitLine} disabled={!line.trim()}>
          Add
        </button>
      </div>

      <VoiceButton onTranscript={onVoice} disabled={!selectedQuestion} />

      <footer className="ip-footer-actions ip-footer-actions--split">
        <Link to="/simplify-job-description" className="ip-btn ip-btn--quiet ip-text-link">
          ← Job posting
        </Link>
        <button type="button" className="ip-btn ip-btn--primary" disabled={!listOk || organising} onClick={onContinue}>
          {organising ? "Organising…" : "Organise my ideas →"}
        </button>
      </footer>
    </section>
  );
}

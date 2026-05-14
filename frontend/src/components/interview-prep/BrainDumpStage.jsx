/**
 * BrainDumpStage.jsx
 *
 * Stage 1 of Interview Prep — "Brain Dump".
 *
 * Responsibilities:
 *  - Let the user pick one interview question from the left panel
 *  - Let the user add freeform ideas via:
 *      (a) Typing in the textarea and pressing Enter or clicking the send button
 *      (b) Speaking via the VoiceButton, which populates the textarea for editing
 *  - Display saved ideas as chips in the DumpZone below the input
 *  - Gate the "Organise my ideas" button until at least 2 cards exist
 *
 * Props:
 *  - questions        {string[]}   All available interview questions
 *  - selectedQuestion {string}     Currently selected question (or "")
 *  - onSelectQuestion {fn}         Called when user picks a question
 *  - dumpCards        {Card[]}     Current list of idea cards [{ id, text }]
 *  - onDumpChange     {fn}         Called with updated card array on any add/remove
 *  - onContinue       {fn}         Called when user clicks "Organise my ideas"
 *  - organising       {boolean}    True while the AI sort is in flight
 */

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
  // Local state: the current value of the textarea input
  const [line, setLine] = useState("");

  /**
   * addCard — creates a new card object and appends it to the dumpCards array.
   * Skips empty/whitespace-only text.
   * Generates a unique ID using uid() from interviewPrepHelpers.
   *
   * @param {string} text — the idea text to save
   */
  const addCard = useCallback(
    (text) => {
      const t = String(text || "").trim();
      if (!t) {
        console.log("[BrainDump] addCard: skipped — empty text");
        return;
      }
      const newCard = { id: uid("d"), text: t };
      console.log("[BrainDump] addCard: adding card", newCard);
      console.log("[BrainDump] addCard: total cards after add →", dumpCards.length + 1);
      onDumpChange([...dumpCards, newCard]);
    },
    [dumpCards, onDumpChange],
  );

  /**
   * onVoice — called by VoiceButton when speech recognition returns a transcript chunk.
   * Instead of immediately saving as a card, the transcript is appended to the textarea
   * so the user can review and edit it before adding.
   *
   * If the textarea already has text, a space is added between existing text and new chunk.
   *
   * @param {string} transcript — raw transcript from the browser speech API
   */
  const onVoice = useCallback((transcript) => {
    console.log("[BrainDump] onVoice: transcript received →", transcript);
    setLine((prev) => {
      const next = prev ? `${prev} ${transcript}` : transcript;
      console.log("[BrainDump] onVoice: textarea updated →", next);
      return next;
    });
  }, []);

  /**
   * onSubmitLine — saves the current textarea value as a card and clears the input.
   * Called by: Enter key (without Shift), send button click.
   */
  const onSubmitLine = useCallback(() => {
    console.log("[BrainDump] onSubmitLine: attempting to add →", line);
    addCard(line);
    setLine("");
  }, [addCard, line]);

  /**
   * listOk — controls whether the "Organise my ideas" button is enabled.
   * Requires: a question is selected AND at least 2 cards exist.
   */
  const listOk = useMemo(() => {
    const ok = selectedQuestion && dumpCards.length >= 2;
    console.log("[BrainDump] listOk:", ok, `(question: "${selectedQuestion}", cards: ${dumpCards.length})`);
    return ok;
  }, [dumpCards.length, selectedQuestion]);

  return (
    <section className="ip-stage" aria-labelledby="ip-stage-dump-title">

      {/* Two-column layout */}
      <div className="ip-bd-layout">

        {/* ── Left column: question picker ── */}
        <div className="ip-bd-left">
          <div className="ip-bd-section-head">
            <span className="ip-bd-step-badge">1</span>
            <h2 className="ip-bd-section-title" id="ip-stage-dump-title">Pick a question</h2>
          </div>
          <p className="ip-bd-hint">Choose one to focus on. You can come back and try others.</p>

          {/*
            QuestionSelector renders the list of questions.
            Selecting a question calls onSelectQuestion which updates
            selectedQuestion in InterviewPrepPage state.
          */}
          <QuestionSelector
            questions={questions}
            selectedQuestion={selectedQuestion}
            onSelect={onSelectQuestion}
          />
        </div>

        {/* Divider */}
        <div className="ip-bd-divider" aria-hidden="true" />

        {/* ── Right column: brain dump input + idea chips ── */}
        <div className="ip-bd-right">
          <div className="ip-bd-section-head">
            <span className="ip-bd-step-badge">2</span>
            <h2 className="ip-bd-section-title">Brain dump</h2>
          </div>
          <p className="ip-bd-hint">Anything that comes to mind, messy is fine. Add as many ideas as you like.</p>

          {/* ── Chat-style input ── */}
          <div className="ip-dump-entry">
            <label className="ip-visually-hidden" htmlFor="ip-dump-line">Add an idea</label>
            <textarea
              id="ip-dump-line"
              className="ip-dump-textarea"
              rows={4}
              value={line}
              onChange={(e) => {
                // Controlled input — update local state on every keystroke
                setLine(e.target.value);
              }}
              onKeyDown={(e) => {
                // Enter (without Shift) submits the current line as a card
                // Shift+Enter inserts a newline (default textarea behaviour)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  console.log("[BrainDump] textarea: Enter key pressed, submitting line");
                  onSubmitLine();
                }
              }}
              placeholder={`Think out loud. A project, a moment, a problem you solved. Anything that comes to mind.\n\nTry: "fixed a bug before a big launch" or "helped a teammate through a tough deadline"`}
              disabled={!selectedQuestion}
            />

            {/*
              Bottom toolbar:
              - VoiceButton (left): starts/stops browser speech recognition.
                When speech is detected, onVoice populates the textarea.
              - Send button (right): saves current textarea content as a card.
            */}
            <div className="ip-dump-entry-bar">
              <VoiceButton onTranscript={onVoice} disabled={!selectedQuestion} />
              <button
                type="button"
                className="ip-dump-send-btn"
                onClick={() => {
                  console.log("[BrainDump] send button clicked");
                  onSubmitLine();
                }}
                disabled={!line.trim() || !selectedQuestion}
                aria-label="Add idea"
              >
                ↑
              </button>
            </div>
          </div>

          {/*
            DumpZone — renders the saved idea chips below the input.
            Hidden when no cards exist.
            Removing a chip calls onDumpChange with the card filtered out.
          */}
          <DumpZone
            cards={dumpCards}
            onRemove={(id) => {
              console.log("[BrainDump] removing card id →", id);
              onDumpChange(dumpCards.filter((c) => c.id !== id));
            }}
          />

          {/* Shown when no question has been selected yet */}
          {!selectedQuestion && (
            <p className="ip-bd-nudge">← Pick a question first to start adding ideas.</p>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="ip-stage-footer">
        <Link to="/simplify-job-description" className="ip-btn ip-btn--ghost">
          ← Job posting
        </Link>
        <div className="ip-stage-footer__right">
          {/* Helper hint shown when the user has started but not yet added enough cards */}
          {dumpCards.length > 0 && dumpCards.length < 2 && (
            <span className="ip-stage-footer__hint">Add at least one more idea to continue</span>
          )}
          {/*
            "Organise my ideas" — triggers AI STAR sort in InterviewPrepPage.
            Disabled until listOk (question selected + 2+ cards).
            "organising" prop is true while the API call is in flight.
          */}
          <button
            type="button"
            className="ip-btn ip-btn--primary"
            disabled={!listOk || organising}
            onClick={() => {
              console.log("[BrainDump] Organise clicked — cards:", dumpCards, "question:", selectedQuestion);
              onContinue();
            }}
          >
            {organising ? "Organising…" : "Organise my ideas →"}
          </button>
        </div>
      </footer>
    </section>
  );
}

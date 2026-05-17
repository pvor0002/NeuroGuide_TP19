/**

 * BrainDumpStage.jsx — Stage 1 of Interview Prep ("Brain dump").

 */



import { useCallback, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { INTERVIEW_PREP_LIST_PATH } from "../../utils/interviewPrepNav.js";

import DumpZone from "./DumpZone.jsx";

import QuestionSelector from "./QuestionSelector.jsx";

import VoiceButton from "./VoiceButton.jsx";

import { liveSimplifyEnabled, splitBrainDumpText } from "../../services/interviewPrepApi.js";

import { heuristicSplitBrainDumpText, shouldSplitBrainDumpText, uid } from "../../utils/interviewPrepHelpers.js";



const BRAIN_DUMP_HINT =

  "Anything that comes to mind, messy is fine. Add as many ideas as you like.";

const BRAIN_DUMP_PLACEHOLDER = `Think out loud. A project, a moment, a problem you solved. Anything that comes to mind.



Try: "fixed a bug before a big launch" or "helped a teammate through a tough deadline"`;



export default function BrainDumpStage({

  questions,

  selectedQuestion,

  onSelectQuestion,

  answeredQuestions = {},

  onAddCustomQuestion,

  customQuestionMaxChars = 480,

  customQuestionsUsed = 0,

  customQuestionsMax = 20,

  dumpCards,

  onDumpChange,

  onContinue,

  organising,

  revisitReadOnly = false,

  revisitSpeechText = "",

  hasFormulatedSpeech = false,

  isEditingRevisit = false,

  onStartEditRevisit,

  onBackToListing,

}) {

  const [line, setLine] = useState("");

  const [customLine, setCustomLine] = useState("");

  const [splitting, setSplitting] = useState(false);



  const showRevisitGate = revisitReadOnly && hasFormulatedSpeech && !isEditingRevisit;

  const showComposer = !showRevisitGate;

  const showSpeechReference =

    showComposer && hasFormulatedSpeech && Boolean(String(revisitSpeechText || "").trim());



  const appendCards = useCallback(

    (text) => {

      const t = String(text || "").trim();

      if (!t) return;

      const baseId = uid("d");

      const points = shouldSplitBrainDumpText(t) ? heuristicSplitBrainDumpText(t) : [t];

      const newCards =

        points.length > 1

          ? points.map((point, idx) => ({ id: `${baseId}_s${idx + 1}`, text: point }))

          : [{ id: baseId, text: t }];

      onDumpChange([...dumpCards, ...newCards]);

    },

    [dumpCards, onDumpChange],

  );



  const addCard = useCallback(

    async (text) => {

      const t = String(text || "").trim();

      if (!t) return;



      if (!shouldSplitBrainDumpText(t)) {

        appendCards(t);

        return;

      }



      if (liveSimplifyEnabled && selectedQuestion) {

        setSplitting(true);

        try {

          const points = await splitBrainDumpText(selectedQuestion, t);

          const baseId = uid("d");

          const newCards =

            points.length > 1

              ? points.map((point, idx) => ({ id: `${baseId}_s${idx + 1}`, text: point }))

              : [{ id: baseId, text: t }];

          onDumpChange([...dumpCards, ...newCards]);

        } catch {

          appendCards(t);

        } finally {

          setSplitting(false);

        }

        return;

      }



      appendCards(t);

    },

    [appendCards, dumpCards, onDumpChange, selectedQuestion],

  );



  const onVoice = useCallback((transcript) => {

    setLine((prev) => (prev ? `${prev} ${transcript}` : transcript));

  }, []);



  const onSubmitLine = useCallback(() => {

    void addCard(line);

    setLine("");

  }, [addCard, line]);



  const canAddMoreCustom = customQuestionsUsed < customQuestionsMax;



  const submitCustomQuestion = useCallback(() => {

    if (!canAddMoreCustom || typeof onAddCustomQuestion !== "function") return;

    const t = String(customLine || "").trim();

    if (!t) return;

    onAddCustomQuestion(t);

    setCustomLine("");

  }, [canAddMoreCustom, customLine, onAddCustomQuestion]);



  const listOk = useMemo(() => selectedQuestion && dumpCards.length >= 1, [dumpCards.length, selectedQuestion]);



  return (

    <section className="ip-stage" aria-labelledby="ip-stage-dump-title">

      <div className="ip-bd-layout">

        <div className="ip-bd-left">

          <div className="ip-bd-section-head">

            <span className="ip-bd-step-badge">1</span>

            <h2 className="ip-bd-section-title" id="ip-stage-dump-title">Pick a question</h2>

          </div>

          <p className="ip-bd-hint">Choose one to focus on. You can come back and try others.</p>

          <QuestionSelector

            questions={questions}

            selectedQuestion={selectedQuestion}

            onSelect={onSelectQuestion}

            answeredQuestions={answeredQuestions}

          />

          <div className="ip-add-custom-q">

            <label className="ip-add-custom-q__label" htmlFor="ip-custom-q-input">

              Add your own question

            </label>

            <div className="ip-add-custom-q__row">

              <input

                id="ip-custom-q-input"

                type="text"

                className="ip-add-custom-q__input"

                value={customLine}

                maxLength={customQuestionMaxChars}

                placeholder="e.g. Why this team?"

                disabled={!canAddMoreCustom}

                onChange={(e) => setCustomLine(e.target.value)}

                onKeyDown={(e) => {

                  if (e.key === "Enter") {

                    e.preventDefault();

                    submitCustomQuestion();

                  }

                }}

              />

              <button

                type="button"

                className="ip-btn ip-btn--secondary ip-add-custom-q__btn"

                onClick={submitCustomQuestion}

                disabled={!customLine.trim() || !canAddMoreCustom}

              >

                Add

              </button>

            </div>

            <p className="ip-bd-hint ip-add-custom-q__meta">

              {canAddMoreCustom

                ? `Saved with this job (${customQuestionsUsed}/${customQuestionsMax} custom). Same list as the suggested questions above.`

                : `You have reached the limit of ${customQuestionsMax} custom questions for this job.`}

            </p>

          </div>

        </div>



        <div className="ip-bd-divider" aria-hidden="true" />



        <div className="ip-bd-right">

          <div className="ip-bd-section-head">

            <span className="ip-bd-step-badge">2</span>

            <h2 className="ip-bd-section-title">Brain dump</h2>

          </div>



          {showRevisitGate ? (

            <div className="ip-bd-revisit">

              <p className="ip-bd-hint ip-bd-hint--tight">

                You already built a speech for this question. Review it below, or edit to change your ideas and

                answer.

              </p>

              <div className="ip-revisit-panel">

                <p className="ip-revisit-panel__label">Your formulated answer</p>

                <div className="ip-revisit-speech" role="region" aria-label="Formulated interview answer">

                  {revisitSpeechText}

                </div>

                <div className="ip-revisit-actions">

                  <button

                    type="button"

                    className="ip-btn ip-btn--primary ip-revisit-edit-btn"

                    onClick={() => {

                      if (typeof onStartEditRevisit === "function") onStartEditRevisit();

                    }}

                  >

                    Edit ideas and answer

                  </button>

                  {listOk ? (

                    <button

                      type="button"

                      className="ip-btn ip-btn--secondary"

                      disabled={organising}

                      onClick={() => onContinue()}

                    >

                      {organising ? "Organising…" : "Organise without editing →"}

                    </button>

                  ) : null}

                </div>

              </div>

              {dumpCards.length > 0 ? (

                <p className="ip-bd-hint ip-bd-meta">

                  {dumpCards.length} idea{dumpCards.length === 1 ? "" : "s"} saved — edit to view or change them.

                </p>

              ) : null}

            </div>

          ) : null}



          {showComposer ? (

            <div className="ip-bd-composer">

              {showSpeechReference ? (

                <div className="ip-revisit-panel ip-revisit-panel--compact">

                  <p className="ip-revisit-panel__label">Your formulated answer (for reference)</p>

                  <div className="ip-revisit-speech ip-revisit-speech--compact" role="region">

                    {revisitSpeechText}

                  </div>

                </div>

              ) : null}



              <p className="ip-bd-hint">{BRAIN_DUMP_HINT}</p>

              {shouldSplitBrainDumpText(line) ? (

                <p className="ip-bd-hint ip-bd-hint--ai" role="status">

                  Long notes are split into separate idea cards with AI when you add them.

                </p>

              ) : null}



              <div className="ip-dump-entry-block">
              <div className="ip-dump-entry">

                <label className="ip-visually-hidden" htmlFor="ip-dump-line">Add an idea</label>

                <textarea

                  id="ip-dump-line"

                  className="ip-dump-textarea"

                  rows={4}

                  value={line}

                  onChange={(e) => setLine(e.target.value)}

                  onKeyDown={(e) => {

                    if (e.key === "Enter" && !e.shiftKey) {

                      e.preventDefault();

                      void onSubmitLine();

                    }

                  }}

                  placeholder={BRAIN_DUMP_PLACEHOLDER}

                  disabled={!selectedQuestion || splitting}

                />

                <div className="ip-dump-entry-bar">

                  <VoiceButton onTranscript={onVoice} disabled={!selectedQuestion || splitting} />

                  <button

                    type="button"

                    className="ip-dump-send-btn"

                    onClick={() => void onSubmitLine()}

                    disabled={!line.trim() || !selectedQuestion || splitting}

                    aria-label="Add idea"

                  >

                    {splitting ? "…" : "↑"}

                  </button>

                </div>
              </div>

                <div className="ip-dump-organise-row">
                  {!listOk ? (
                    <span className="ip-dump-organise-row__hint">Add at least one idea to continue</span>
                  ) : null}
                  <button
                    type="button"
                    className="ip-btn ip-btn--primary ip-dump-organise-btn"
                    disabled={!listOk || organising || splitting}
                    onClick={() => onContinue()}
                  >
                    {organising ? "Organising…" : "Organise my ideas →"}
                  </button>
                </div>
              </div>

              <DumpZone
                cards={dumpCards}
                onRemove={(id) => onDumpChange(dumpCards.filter((c) => c.id !== id))}
              />



              {!selectedQuestion ? (

                <p className="ip-bd-nudge">← Pick a question first to start adding ideas.</p>

              ) : null}

            </div>

          ) : null}

        </div>

      </div>



      <footer className="ip-stage-footer">
        {typeof onBackToListing === "function" ? (
          <button type="button" className="ip-btn ip-btn--ghost" onClick={() => onBackToListing()}>
            ← All jobs
          </button>
        ) : (
          <Link to={INTERVIEW_PREP_LIST_PATH} className="ip-btn ip-btn--ghost">
            ← All jobs
          </Link>
        )}
      </footer>

    </section>

  );

}


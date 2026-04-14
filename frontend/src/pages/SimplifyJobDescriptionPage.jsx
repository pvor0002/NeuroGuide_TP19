import { useId, useRef } from "react";
import { Link } from "react-router-dom";
import { useJobDescriptionSimplification } from "../hooks/useJobDescriptionSimplification.js";

const OUTPUT_SECTIONS = [
  { key: "quick_snapshot", label: "Quick snapshot" },
  { key: "what_youll_do", label: "What you'll do" },
  { key: "skills_you_need", label: "Skills you need" },
  { key: "nice_to_haves", label: "Nice to haves" },
  { key: "what_the_role_offers", label: "What the role offers" },
];

function hasRenderableSimplifiedOutput(result) {
  if (!result || typeof result !== "object") return false;
  return OUTPUT_SECTIONS.some(({ key }) => {
    const v = result[key];
    return v != null && String(v).trim() !== "";
  });
}

function PaperclipIcon() {
  return (
    <svg className="simplify-attach-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.55 12.7l-6.35 6.35a4.2 4.2 0 1 1-5.95-5.95l8.9-8.9a2.9 2.9 0 0 1 4.1 4.1l-7.55 7.55a1.55 1.55 0 1 1-2.2-2.2l6.75-6.75"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileDocIcon() {
  return (
    <svg className="simplify-file-preview-doc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

/** ChatGPT-style file row: red doc tile, name + type, black circular remove. */
function FileAttachmentPreview({ name, typeLabel, isBusy, onRemove }) {
  return (
    <div className={`simplify-file-preview ${isBusy ? "simplify-file-preview--busy" : ""}`}>
      <button
        type="button"
        className="simplify-file-preview-dismiss"
        onClick={onRemove}
        aria-label="Remove attachment"
        title="Remove"
      >
        <span aria-hidden="true">×</span>
      </button>
      <div className="simplify-file-preview-icon" aria-hidden="true">
        {isBusy ? <span className="spinner simplify-file-preview-spinner" /> : <FileDocIcon />}
      </div>
      <div className="simplify-file-preview-text">
        <div className="simplify-file-preview-name">{name}</div>
        <div className="simplify-file-preview-type">{typeLabel}</div>
      </div>
    </div>
  );
}

/** Decorative shapes only (warm colors, no blue/purple as the main theme). */
function HeroPaperShapes() {
  return (
    <div className="simplify-hero-shapes" aria-hidden="true">
      <svg className="simplify-shape-svg" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
        <path
          fill="#c4e0c8"
          opacity="0.95"
          d="M40 120c20-50 80-90 140-70s80 70 50 120-90 50-140 20-70-60-50-70z"
        />
        <path
          fill="#e8b4a0"
          opacity="0.88"
          d="M120 40c45 8 85 50 75 100s-55 70-100 55-65-45-55-90 25-70 80-65z"
        />
        <circle cx="175" cy="55" r="18" fill="#d4a574" opacity="0.75" />
      </svg>
    </div>
  );
}

export default function SimplifyJobDescriptionPage() {
  const {
    text,
    setText,
    simplifiedResult,
    attachment,
    removeAttachment,
    composerFileError,
    composerActionError,
    composerInfo,
    warnings,
    infoMessage,
    isBusy,
    isExtracting,
    isSimplifying,
    validation,
    onFileSelected,
    onSimplify,
  } = useJobDescriptionSimplification();

  const fileInputRef = useRef(null);
  const inputId = useId();
  const composerMetaId = useId();

  const simplifyEnabled = validation.ok && !isBusy;

  return (
    <div className="simplify-page">
      <div className="simplify-page-noise" aria-hidden="true" />

      <header className="simplify-hero" aria-labelledby="simplify-title">
        <div className="simplify-hero-grid">
          <div className="simplify-hero-copy">
            <p className="simplify-hero-eyebrow">Paste or attach, then simplify</p>
            <h1 id="simplify-title" className="simplify-hero-title">
              Turn dense postings into something you can actually read.
            </h1>
            <Link to="/" className="simplify-hero-back">
              ← Back home
            </Link>
          </div>
          <HeroPaperShapes />
        </div>
      </header>

      <div className="simplify-studio">
        <aside className="simplify-rail" aria-hidden="true">
          <div className="simplify-rail-track">
            <span className="simplify-rail-node">1</span>
            <span className="simplify-rail-spine" />
            <span className="simplify-rail-node">2</span>
          </div>
        </aside>

        <div className="simplify-workspace">
          <section className="simplify-card simplify-card--a simplify-chat-card" aria-labelledby="simplify-input-heading">
            <div className="simplify-card-tag">Your posting</div>
            <h2 id="simplify-input-heading" className="simplify-card-title">
              Job posting
            </h2>

            <div className="simplify-composer" aria-busy={isExtracting}>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                tabIndex={-1}
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                aria-hidden="true"
                disabled={isBusy}
                onChange={(e) => {
                  onFileSelected(e.target.files);
                  e.target.value = "";
                }}
              />

              {attachment ? (
                <div className="simplify-composer-attachments">
                  <FileAttachmentPreview
                    name={attachment.name}
                    typeLabel={attachment.typeLabel}
                    isBusy={isExtracting}
                    onRemove={removeAttachment}
                  />
                  {composerInfo ? (
                    <p className="simplify-composer-info" role="status">
                      {composerInfo}
                    </p>
                  ) : null}
                  {warnings.length > 0 ? (
                    <ul className="simplify-composer-warnings">
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <label className="sr-only" htmlFor={inputId}>
                Job description text
              </label>
              <textarea
                id={inputId}
                className="simplify-composer-input"
                aria-describedby={composerMetaId}
                aria-invalid={Boolean(
                  composerActionError || (!attachment && composerFileError),
                )}
                spellCheck="true"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the job posting here."
              />

              {composerActionError || (!attachment && composerFileError) ? (
                <div className="simplify-composer-error" role="alert">
                  {composerActionError || composerFileError}
                </div>
              ) : null}

              <div className="simplify-composer-footer">
                <button
                  type="button"
                  className="simplify-attach-icon"
                  disabled={isBusy}
                  aria-label={isExtracting ? "Reading file" : "Attach job file"}
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isExtracting && !attachment ? (
                    <span className="spinner simplify-attach-spinner" aria-hidden="true" />
                  ) : (
                    <PaperclipIcon />
                  )}
                </button>

                <p id={composerMetaId} className="simplify-composer-meta" role="status">
                  {!validation.ok && text.trim().length > 0 ? (
                    <span className="simplify-composer-meta--warn">{validation.message}</span>
                  ) : (
                    <span className="simplify-composer-meta--muted">PDF, Word, or .txt · max 5 MB</span>
                  )}
                </p>

                <button
                  type="button"
                  className="simplify-composer-send"
                  onClick={onSimplify}
                  disabled={!simplifyEnabled}
                  aria-busy={isSimplifying}
                  aria-label={isSimplifying ? "Simplifying" : "Simplify posting"}
                  title="Simplify"
                >
                  {isSimplifying ? (
                    <span className="spinner simplify-composer-send-spinner" aria-hidden="true" />
                  ) : (
                    <svg className="simplify-send-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 5v14M5 12l7-7 7 7"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </section>

          {hasRenderableSimplifiedOutput(simplifiedResult) ? (
            <section className="simplify-output" aria-labelledby="simplify-output-heading">
              <h2 id="simplify-output-heading" className="simplify-output-title">
                Simplified breakdown
              </h2>
              <div className="simplify-output-grid">
                {OUTPUT_SECTIONS.map(({ key, label }) => {
                  const body = simplifiedResult[key];
                  if (body == null || String(body).trim() === "") return null;
                  return (
                    <div key={key} className="simplify-output-block">
                      <h3 className="simplify-output-block-title">{label}</h3>
                      <p className="simplify-output-block-body">{String(body)}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {isSimplifying ? "Simplifying job description" : ""}
      </div>

      <div className="simplify-alerts">
        {infoMessage ? (
          <section className="simplify-alert simplify-alert--ok" role="status" aria-live="polite">
            {infoMessage}
          </section>
        ) : null}
      </div>
    </div>
  );
}

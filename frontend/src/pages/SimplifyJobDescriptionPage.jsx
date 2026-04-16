import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useJobDescriptionSimplification } from "../hooks/useJobDescriptionSimplification.js";
import {
  buildExportPdfFilename,
  buildExportTxtFilename,
  buildPlainTextExport,
  buildSimplifiedJobPdfBlob,
  downloadBlob,
  parseJobTitleAndCompany
} from "../utils/simplifiedJobExport.js";

const CARD_SECTIONS = [
  { key: "basic_info", label: "Basic information", emoji: "" },
  { key: "responsibilities", label: "Responsibilities", emoji: "" },
  { key: "skills_qualifications", label: "Skills & Qualifications", emoji: "" },
];

const CARD_POINT_LIMIT = {
  responsibilities: 4,
  skills_qualifications: 4,
};

function shortenLine(line, maxChars = 88) {
  const src = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!src) return "";
  if (src.length <= maxChars) return src;
  const firstClause = src.split(/[,;:]\s+/)[0].trim();
  if (firstClause.length >= 18 && firstClause.length <= maxChars) return `${firstClause}…`;
  return `${src.slice(0, maxChars - 1).trimEnd()}…`;
}

function extractTopPoints(text, limit) {
  const src = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return [];

  const explicitBullets = src
    .split("\n")
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter((line) => line && !/^[A-Za-z][A-Za-z0-9 &'/().-]{2,40}:\s*$/.test(line));

  const candidates =
    explicitBullets.length > 0
      ? explicitBullets
      : src
          .split(/\n+|;\s+|(?<=[.!?])\s+(?=[A-Z])/)
          .map((line) => line.replace(/^\d+[.)]\s+/, "").trim())
          .filter(Boolean);

  const uniq = [];
  const seen = new Set();
  for (const item of candidates) {
    const cleaned = shortenLine(item);
    const key = cleaned.toLowerCase();
    if (!cleaned || cleaned.length < 8 || seen.has(key)) continue;
    seen.add(key);
    uniq.push(cleaned);
    if (uniq.length >= limit) break;
  }
  return uniq;
}

function getCardViewModel(cardKey, body) {
  const text = String(body ?? "").trim();
  if (!text) return { text: "", points: [] };
  const limit = CARD_POINT_LIMIT[cardKey];
  if (!limit) return { text, points: [] };
  return { text, points: extractTopPoints(text, limit) };
}

function hasRenderableSimplifiedOutput(result) {
  if (!result || typeof result !== "object") return false;
  if (result.summary != null && String(result.summary).trim() !== "") return true;
  return CARD_SECTIONS.some(({ key }) => {
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

function FlipCardsIcon() {
  return (
    <svg className="simplify-flip-card__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h9a2 2 0 0 1 2 2v12M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function renderImportantLines(text) {
  const src = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;

  const lines = src.split("\n");
  const blocks = [];
  let list = [];

  const flushList = (key) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="simplify-flip-card__list">
        {list.map((li, i) => (
          <li key={`${key}-${i}`} className="simplify-flip-card__li">
            {li}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, idx) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      flushList(`ul-${idx}`);
      blocks.push(<div key={`sp-${idx}`} className="simplify-flip-card__spacer" />);
      return;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }

    flushList(`ul-${idx}`);

    // Bold "Label:" prefixes to make scanning easier (Basic info / Requirements / Pay / Location, etc.)
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9 &'/().-]{2,40}):\s*(.+)$/);
    if (m) {
      const [, label, rest] = m;
      blocks.push(
        <p key={`l-${idx}`} className="simplify-flip-card__line">
          <strong className="simplify-flip-card__label">{label}:</strong> {rest}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={`t-${idx}`} className="simplify-flip-card__line">
        {trimmed}
      </p>,
    );
  });

  flushList("ul-end");
  return blocks;
}

/** Front shows title only; click flips to content (ADHD-friendly: one focus at a time). */
function SimplifyFlipCard({ cardKey, label, emoji, body }) {
  const [flipped, setFlipped] = useState(false);
  const { text, points } = getCardViewModel(cardKey, body);
  const hasPoints = points.length > 0;
  const focusHint = "Quick view";
  const toggle = () => setFlipped((v) => !v);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className="simplify-flip-card">
      <div
        className={`simplify-flip-card__hitbox ${flipped ? "simplify-flip-card__hitbox--flipped" : ""}`}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-expanded={flipped}
        aria-controls={`simplify-flip-panel-${cardKey}`}
        id={`simplify-flip-trigger-${cardKey}`}
        aria-label={
          flipped
            ? `${label}: details open. Activate to return to the title.`
            : `${label}. Activate to read this section.`
        }
      >
        <div className="simplify-flip-card__inner">
          <div className="simplify-flip-card__face simplify-flip-card__face--front">
            <p className="simplify-flip-card__chip" aria-hidden="true">
              <span>{emoji}</span>
              <span>{focusHint}</span>
            </p>
            <h3 className="simplify-flip-card__title">{label}</h3>
            <p className="simplify-flip-card__cta">
              <FlipCardsIcon />
              <span>Click to open</span>
            </p>
          </div>
          <div
            className="simplify-flip-card__face simplify-flip-card__face--back"
            id={`simplify-flip-panel-${cardKey}`}
            aria-label={`${label} details`}
          >
            <div className="simplify-flip-card__back-head">
              <span className="simplify-flip-card__back-title">
                {emoji} {label}
              </span>
            </div>
            <div className="simplify-flip-card__body">
              {hasPoints ? (
                <ul className="simplify-flip-card__focus-list">
                  {points.map((point, idx) => (
                    <li key={`${cardKey}-focus-${idx}`} className="simplify-flip-card__focus-item">
                      <span className="simplify-flip-card__focus-dot" aria-hidden="true">
                        {idx + 1}
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                renderImportantLines(text)
              )}
            </div>
            <p className="simplify-flip-card__cta simplify-flip-card__cta--back">
              <FlipCardsIcon />
              <span>Flip back</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportDownloadIcon() {
  return (
    <svg className="simplify-export-trigger__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4v11.5M8.5 12L12 15.5l3.5-3.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function SimplifyExportToolbar({ outputVisible, simplifiedResult, warnings, syncing }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  if (!outputVisible) return null;

  const { jobTitle, companyName } = parseJobTitleAndCompany(simplifiedResult?.basic_info ?? "");
  const disabled = exportBusy || syncing;

  const runPlainText = () => {
    setExportError("");
    setMenuOpen(false);
    setExportBusy(true);
    window.setTimeout(() => {
      try {
        const content = buildPlainTextExport(simplifiedResult, warnings);
        const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, buildExportTxtFilename(jobTitle, companyName));
      } catch (err) {
        setExportError(err?.message || "Plain text export failed. You can try again.");
      } finally {
        setExportBusy(false);
      }
    }, 0);
  };

  const runPdf = () => {
    setExportError("");
    setMenuOpen(false);
    setExportBusy(true);
    window.requestAnimationFrame(() => {
      void (async () => {
        try {
          const blob = await buildSimplifiedJobPdfBlob(simplifiedResult, warnings);
          downloadBlob(blob, buildExportPdfFilename(jobTitle, companyName));
        } catch (err) {
          setExportError(err?.message || "PDF export failed. You can try again.");
        } finally {
          setExportBusy(false);
        }
      })();
    });
  };

  return (
    <div className="simplify-export-column">
      <div className="simplify-export" ref={wrapRef}>
        <button
          type="button"
          className="simplify-export-trigger"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls="simplify-export-menu"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setExportError("");
            setMenuOpen((o) => !o);
          }}
        >
          {exportBusy ? (
            <>
              <span className="spinner simplify-export-spinner" aria-hidden="true" />
              <span className="simplify-export-trigger__label">Preparing download…</span>
            </>
          ) : (
            <>
              <ExportDownloadIcon />
              <span className="simplify-export-trigger__label">Export</span>
              <span className="simplify-export-trigger__chevron" aria-hidden="true" />
            </>
          )}
        </button>
        {menuOpen && !exportBusy ? (
          <div id="simplify-export-menu" className="simplify-export-menu" role="group" aria-label="Export options">
            <button type="button" className="simplify-export-option" onClick={runPlainText}>
              Plain text (.txt)
            </button>
            <button type="button" className="simplify-export-option" onClick={runPdf}>
              PDF
            </button>
          </div>
        ) : null}
      </div>
      {exportError ? (
        <p className="simplify-export-error" role="alert">
          {exportError}
        </p>
      ) : null}
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
    inputMode,
    setInputMode,
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
    simplifyEnabled,
  } = useJobDescriptionSimplification();

  const fileInputRef = useRef(null);
  const outputRef = useRef(null);
  const inputId = useId();
  const composerMetaId = useId();
  const [scrollToOutputOnResult, setScrollToOutputOnResult] = useState(false);
  const [showInterviewPrepPrompt, setShowInterviewPrepPrompt] = useState(false);

  const outputVisible = hasRenderableSimplifiedOutput(simplifiedResult);

  useEffect(() => {
    if (!scrollToOutputOnResult) return;
    if (!outputVisible) return;
    // Let the DOM paint the output first, then scroll.
    const t = window.setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToOutputOnResult(false);
    }, 50);
    return () => window.clearTimeout(t);
  }, [scrollToOutputOnResult, outputVisible]);

  return (
    <div className="simplify-page">
      <div className="simplify-page-noise" aria-hidden="true" />

      <header className="simplify-hero" aria-labelledby="simplify-title">
        <div className="simplify-hero-grid">
          <div className="simplify-hero-copy">
            <p className="simplify-hero-eyebrow">Paste or upload, then simplify</p>
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

            <div className="simplify-input-mode" role="group" aria-label="How you want to add the posting">
              <button
                type="button"
                className={`simplify-input-mode-btn ${inputMode === "text" ? "simplify-input-mode-btn--active" : ""}`}
                aria-pressed={inputMode === "text"}
                onClick={() => setInputMode("text")}
              >
                Paste text
              </button>
              <button
                type="button"
                className={`simplify-input-mode-btn ${inputMode === "file" ? "simplify-input-mode-btn--active" : ""}`}
                aria-pressed={inputMode === "file"}
                onClick={() => setInputMode("file")}
              >
                Upload file
              </button>
            </div>
            <p className="simplify-input-mode-hint">
              Choose one: paste the posting as text, or upload a single file (.txt, .pdf, .doc, .docx). Not both.
            </p>

            <div className="simplify-composer" aria-busy={isExtracting}>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                tabIndex={-1}
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                aria-hidden="true"
                disabled={isBusy || inputMode !== "file"}
                onChange={(e) => {
                  onFileSelected(e.target.files);
                  e.target.value = "";
                }}
              />

              {inputMode === "file" && attachment ? (
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

              {inputMode === "text" ? (
                <>
                  <label className="sr-only" htmlFor={inputId}>
                    Job description text
                  </label>
                  <textarea
                    id={inputId}
                    className="simplify-composer-input"
                    aria-describedby={composerMetaId}
                    aria-invalid={Boolean(composerActionError || composerFileError)}
                    spellCheck="true"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste the job posting here."
                  />
                </>
              ) : (
                <div className="simplify-file-placeholder">
                  {!attachment && !isExtracting ? (
                    <p className="simplify-file-placeholder-lead">
                      Upload one file with the job posting. We&apos;ll read the text when you submit.
                    </p>
                  ) : null}
                  {attachment && !isExtracting ? (
                    <button
                      type="button"
                      className="simplify-file-replace"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      Choose a different file
                    </button>
                  ) : null}
                </div>
              )}

              {composerActionError || (inputMode === "text" && composerFileError) || (inputMode === "file" && composerFileError) ? (
                <div className="simplify-composer-error" role="alert">
                  {composerActionError || composerFileError}
                </div>
              ) : null}

              <div className="simplify-composer-footer">
                {inputMode === "file" ? (
                  <button
                    type="button"
                    className="simplify-attach-icon simplify-attach-icon--file"
                    disabled={isBusy || Boolean(attachment)}
                    aria-label={attachment ? "File selected" : "Choose job file"}
                    title={attachment ? "File selected" : "Choose file"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isExtracting && !attachment ? (
                      <span className="spinner simplify-attach-spinner" aria-hidden="true" />
                    ) : (
                      <PaperclipIcon />
                    )}
                  </button>
                ) : (
                  <span className="simplify-composer-footer-spacer" aria-hidden="true" />
                )}

                <p id={composerMetaId} className="simplify-composer-meta" role="status">
                  {inputMode === "text" ? (
                    !validation.ok && text.trim().length > 0 ? (
                      <span className="simplify-composer-meta--warn">{validation.message}</span>
                    ) : (
                      <span className="simplify-composer-meta--muted">Paste the full posting · max 5,000 words</span>
                    )
                  ) : (
                    <span className="simplify-composer-meta--muted">
                      {attachment
                        ? "Submit when ready, or replace the file."
                        : ".txt, .pdf, .doc, or .docx · max 5 MB"}
                    </span>
                  )}
                </p>

                <button
                  type="button"
                  className="simplify-composer-send"
                  onClick={() => {
                    setScrollToOutputOnResult(true);
                    onSimplify();
                  }}
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

          <div className="simplify-alerts">
            {infoMessage ? (
              <section className="simplify-alert simplify-alert--ok" role="status" aria-live="polite">
                {infoMessage}
              </section>
            ) : null}
          </div>

          {outputVisible ? (
            <section ref={outputRef} className="simplify-output" aria-labelledby="simplify-output-heading">
              <div className="simplify-output-heading-row">
                <h2 id="simplify-output-heading" className="simplify-output-title">
                  Simplified breakdown
                </h2>
                <SimplifyExportToolbar
                  outputVisible={outputVisible}
                  simplifiedResult={simplifiedResult}
                  warnings={warnings}
                  syncing={isSimplifying}
                />
              </div>
              {simplifiedResult.summary != null && String(simplifiedResult.summary).trim() !== "" ? (
                <div className="simplify-summary-block">
                  <h3 className="simplify-summary-title">Easy summary</h3>
                  <div className="simplify-summary-body">{String(simplifiedResult.summary)}</div>
                </div>
              ) : null}
              <div className="simplify-output-grid simplify-output-grid--cards">
                {CARD_SECTIONS.map(({ key, label, emoji }) => {
                  const body = simplifiedResult[key];
                  if (body == null || String(body).trim() === "") return null;
                  return <SimplifyFlipCard key={key} cardKey={key} label={label} emoji={emoji} body={body} />;
                })}
              </div>
              <div className="simplify-next-step">
                <button
                  type="button"
                  className="simplify-next-step-btn"
                  onClick={() => setShowInterviewPrepPrompt(true)}
                >
                  Start interview preparation
                </button>
                {showInterviewPrepPrompt ? (
                  <p className="simplify-next-step-prompt" role="status">
                    functionaloty part of iteration 2 development
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {isSimplifying ? "Simplifying job description" : ""}
      </div>
    </div>
  );
}

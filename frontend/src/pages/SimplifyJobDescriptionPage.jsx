import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DataConsentModal from "../components/DataConsentModal.jsx";
import { SimplifyLineIcon } from "../components/SimplifyLineIcons.jsx";
import WarmHeroPaperShapes from "../components/WarmHeroPaperShapes.jsx";
import JobScoreCard from "../components/JobScoreCard.jsx";
import { useJobDescriptionSimplification } from "../hooks/useJobDescriptionSimplification.js";
import { findOccupation, predictJobScore } from "../services/jobDescriptionApi.js";
import {
  buildExportPdfFilename,
  buildExportTxtFilename,
  buildPlainTextExport,
  buildSimplifiedJobPdfBlob,
  downloadBlob,
  parseJobTitleAndCompany,
} from "../utils/simplifiedJobExport.js";
import {
  appendJobScoreHistory,
  clearPersistedJobScore,
  isJobScoreCacheValid,
  normalizeJobTitleKey,
  readJobScoreHistory,
  readPersistedJobScore,
  writePersistedJobScore,
} from "../utils/jobScorePersistence.js";
import { registerCloudAccountFromLocalState } from "../utils/cloudSync.js";
import { isCloudSessionApiAvailable } from "../services/sessionApi.js";
import jobMatchConversationUrl from "../../../data/images/job-match-conversation.png";

// ─── Profile definitions ────────────────────────────────────────────────────
const PROFILE_META = {
  inattentive: { label: "Calm & Clear",  desc: "Structured, low-overload" },
  hyperactive: { label: "High Energy",   desc: "Action-oriented, fast" },
  combined:    { label: "Balanced",       desc: "Structure + engagement" },
};

const CAREER_PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";

/**
 * Reads the user's saved career profile from localStorage and returns the
 * matching simplify profile key ("inattentive" | "hyperactive" | "combined"),
 * or null if no profile has been set.
 * Prefers the manually chosen adhdProfileType; falls back to quiz-inferred.
 */
function getProfileTabFromCareerProfile() {
  try {
    const raw = window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const type =
      parsed?.answers?.adhdProfileType ||
      parsed?.answers?.quizInferredType ||
      "";
    if (type === "hyperactive-impulsive") return "hyperactive";
    if (type === "inattentive") return "inattentive";
    if (type === "combined") return "combined";
    return null;
  } catch {
    return null;
  }
}

const CARD_SECTIONS = [
  { key: "basic_info", label: "Basic info", icon: "mapPin" },
  { key: "responsibilities", label: "Responsibilities", icon: "briefcase" },
  { key: "skills_qualifications", label: "Skills needed", icon: "clipboard" },
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

function shortText(value, max = 92) {
  const src = String(value || "").trim();
  if (src.length <= max) return src;
  const cut = src.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return `${(last > 30 ? cut.slice(0, last) : cut).trim()}...`;
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

/**
 * Basic info often arrives as one line: "Job Title: X | Company: Y | ...".
 * It can also arrive as multiple lines, each "Label: value" (see flip-card back).
 */
function parseBasicInfoPipeFields(text) {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const labelValueFromLine = (line) => {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9 &'/().-]{1,60}):\s*(.+)$/);
    if (!m) return null;
    const labelPart = m[1].trim();
    const valuePart = m[2].trim();
    if (!labelPart || !valuePart) return null;
    return { label: labelPart, value: valuePart };
  };

  const segments = [];
  raw.split("\n").forEach((ln) => {
    const t = String(ln ?? "").trim();
    if (!t) return;
    t.split(/\s*\|\s*/).forEach((piece) => {
      const p = String(piece ?? "").trim();
      if (p) segments.push(p);
    });
  });

  const rows = [];
  const seen = new Set();
  const pushRow = (label, value) => {
    const key = `${label.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ label, value });
  };

  for (const chunk of segments) {
    const fromLv = labelValueFromLine(chunk);
    if (fromLv) {
      pushRow(fromLv.label, fromLv.value);
      continue;
    }
    const idx = chunk.indexOf(":");
    if (idx > 0 && idx < chunk.length - 1) {
      const lbl = chunk.slice(0, idx).trim();
      const val = chunk.slice(idx + 1).trim();
      if (lbl && val) pushRow(lbl, val);
    }
  }
  return rows;
}

function renderBasicInfoBulletRows(text) {
  const rows = parseBasicInfoPipeFields(text);
  if (rows.length === 0) return null;

  return (
    <ul className="simplify-dash-bullets">
      {rows.map(({ label, value }, i) => (
        <li key={`${label}-${i}`} className="simplify-dash-bullets__item">
          <div className="simplify-dash-bullets__pill">
            <span className="simplify-dash-bullets__dot" aria-hidden="true" />
            <span className="simplify-dash-bullets__text">
              <strong className="simplify-dash-bullets__label">{label}:</strong>
              <span className="simplify-dash-bullets__value">{value}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ~18rem baseline; JS syncs to taller face so lists stay visible without inner scroll. */
const FLIP_CARD_MIN_PX = 288;

/** Front shows title only; click flips to content (ADHD-friendly: one focus at a time). */
function SimplifyFlipCard({ cardKey, label, icon, body }) {
  const [flipped, setFlipped] = useState(false);
  const innerRef = useRef(null);
  const frontFaceRef = useRef(null);
  const backFaceRef = useRef(null);
  const { text, points } = getCardViewModel(cardKey, body);
  const hasPoints = points.length > 0;
  const basicBulletRows =
    cardKey === "basic_info" ? renderBasicInfoBulletRows(text) : null;
  const focusHint = "Quick view";
  const toggle = () => setFlipped((v) => !v);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const front = frontFaceRef.current;
    const back = backFaceRef.current;
    if (!inner || !front || !back) return;

    const syncHeight = () => {
      const fh = front.scrollHeight;
      const bh = back.scrollHeight;
      inner.style.minHeight = `${Math.max(fh, bh, FLIP_CARD_MIN_PX)}px`;
    };

    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(front);
    ro.observe(back);
    const bodyEl = back.querySelector(".simplify-flip-card__body");
    if (bodyEl) ro.observe(bodyEl);
    return () => ro.disconnect();
  }, [body, cardKey]);

  return (
    <div className={`simplify-flip-card simplify-flip-card--${cardKey}`}>
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
        <div className="simplify-flip-card__inner" ref={innerRef}>
          <div
            ref={frontFaceRef}
            className="simplify-flip-card__face simplify-flip-card__face--front"
          >
            <span className="simplify-flip-card__icon-tile" aria-hidden="true">
              <SimplifyLineIcon name={icon} />
            </span>
            <div className="simplify-flip-card__heading">
              <h3 className="simplify-flip-card__title">{label}</h3>
              <p className="simplify-flip-card__chip">{focusHint}</p>
            </div>
            <p className="simplify-flip-card__cta">
              <FlipCardsIcon />
              <span>Tap to open</span>
            </p>
          </div>
          <div
            ref={backFaceRef}
            className="simplify-flip-card__face simplify-flip-card__face--back"
            id={`simplify-flip-panel-${cardKey}`}
            aria-label={`${label} details`}
          >
            <div className="simplify-flip-card__back-head">
              <span className="simplify-flip-card__icon-tile simplify-flip-card__icon-tile--compact" aria-hidden="true">
                <SimplifyLineIcon name={icon} />
              </span>
              <span className="simplify-flip-card__back-title">{label}</span>
            </div>
            <div className="simplify-flip-card__body">
              {basicBulletRows ??
                (hasPoints ? (
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
              ))}
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

function FlipCardRow({ result }) {
  if (!result) return null;
  return (
    <div className="simplify-flip-row" aria-label="Quick-view cards">
      <p className="simplify-flip-row__label">Flip for details</p>
      <div className="simplify-flip-row__grid">
        {CARD_SECTIONS.map(({ key, label, icon }) => {
          const body = result[key];
          if (!body || String(body).trim() === "-") return null;
          return (
            <SimplifyFlipCard
              key={key}
              cardKey={key}
              label={label}
              icon={icon}
              body={body}
            />
          );
        })}
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

/** Text shown in a Quick snapshot chip (drops a leading emoji from model text when present). */
function snapshotChipText(chip) {
  const { label } = splitChipContent(chip);
  const t = label.trim();
  if (t) return t;
  return String(chip ?? "").trim();
}
function hasLeadingEmoji(str) {
  if (!str) return false;
  const cp = str.codePointAt(0);
  return cp > 127;
}

function splitChipContent(text) {
  const s = String(text ?? "").trim();
  if (!s) return { emoji: "", label: s };
  if (hasLeadingEmoji(s)) {
    // emoji may be 1 or 2 code units; find first space after it
    const spaceIdx = s.indexOf(" ");
    if (spaceIdx > 0) return { emoji: s.slice(0, spaceIdx), label: s.slice(spaceIdx + 1).trim() };
    return { emoji: s, label: "" };
  }
  return { emoji: "", label: s };
}

// Filter out backend placeholder values ("-") to get real content only
function isRealContent(s) {
  if (!s) return false;
  const t = String(s).trim();
  return t.length > 0 && t !== "-";
}

// Resolve chips: prefer quick_snapshot; fall back through several sources
function resolveSnapshotChips(result) {
  if (!result) return [];

  // 1. quick_snapshot from AI (filter placeholder "-" fills)
  const qs = result.quick_snapshot;
  if (Array.isArray(qs)) {
    const real = qs.slice(0, 3).filter(isRealContent);
    if (real.length >= 1) return real;
  }

  // 2. requirements from inattentive profile
  const inattReqs = result?.profile_inattentive?.requirements;
  if (Array.isArray(inattReqs)) {
    const real = inattReqs.slice(0, 3).filter(isRealContent);
    if (real.length >= 1) return real;
  }

  // 3. requirements from combined profile
  const combReqs = result?.profile_combined?.requirements;
  if (Array.isArray(combReqs)) {
    const real = combReqs.slice(0, 3).filter(isRealContent);
    if (real.length >= 1) return real;
  }

  // 4. last resort: parse bullet lines from skills_qualifications
  const skills = result.skills_qualifications || "";
  const lines = skills
    .split("\n")
    .map(l => l.replace(/^[-•*]\s*/, "").trim())
    .filter(isRealContent)
    .slice(0, 3);
  return lines;
}

/** Icons for the three Quick snapshot requirement chips (ordered: location, commitment, eligibility). */
const SNAPSHOT_CHIP_ICONS = ["mapPin", "briefcase", "bookmark"];

function QuickSnapshotBar({ result, profileKey }) {
  const chips = resolveSnapshotChips(result);
  if (chips.length === 0) return null;
  const profileMod = profileKey === "hyperactive" ? " simplify-snapshot-bar--hyperactive"
    : profileKey === "combined" ? " simplify-snapshot-bar--combined"
    : " simplify-snapshot-bar--inattentive";
  return (
    <div className={`simplify-snapshot-bar${profileMod}`} aria-label="Quick snapshot: must-have requirements">
      <div className="simplify-snapshot-header">
        <span className="simplify-snapshot-icon" aria-hidden="true">
          <SimplifyLineIcon name="bolt" />
        </span>
        <span className="simplify-snapshot-title">Quick snapshot</span>
        <span className="simplify-snapshot-label">3 must-haves at a glance</span>
      </div>
      <div className="simplify-snapshot-chips">
        {chips.map((chip, i) => (
          <span key={i} className="simplify-snapshot-chip">
            <span className="simplify-snapshot-chip__mark" aria-hidden="true">
              <SimplifyLineIcon name={SNAPSHOT_CHIP_ICONS[i % SNAPSHOT_CHIP_ICONS.length]} />
            </span>
            <span className="simplify-snapshot-chip__text">{snapshotChipText(chip)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Active profile label (shown when a profile is set) ─────────────────────
function ProfileLabel({ profileKey }) {
  if (!profileKey) return null;
  const meta = PROFILE_META[profileKey];
  if (!meta) return null;
  return (
    <div className="simplify-profile-label">
      <span className="simplify-profile-label__name">{meta.label}</span>
      <span className="simplify-profile-label__badge">From your profile</span>
    </div>
  );
}

// ─── Calm & Clear (Inattentive) ──────────────────────────────────────────────
const INATTENTIVE_TABS = [
  { key: "what_you_do", label: "What you'll do", icon: "briefcase" },
  { key: "skills_you_learn", label: "Skills you'll learn", icon: "clipboard" },
  { key: "important_notes", label: "Important notes", icon: "alert" },
];

function ProfileInattentive({ data }) {
  const [activeTab, setActiveTab] = useState("what_you_do");
  if (!data) return null;

  // Only show tabs that have content
  const availableTabs = INATTENTIVE_TABS.filter(({ key }) => {
    const val = data[key];
    return Array.isArray(val) && val.length > 0;
  });

  return (
    <div className="sp-profile sp-profile--inattentive">
      <div className="sp-inattentive-row">
        {/* 2-line summary */}
        {data.job_summary?.length > 0 && (
          <div className="sp-section sp-summary-lines sp-summary-lines--compact">
            {data.job_summary.map((line, i) => (
              <p key={i} className={`sp-summary-line${i === 0 ? " sp-summary-line--main" : " sp-summary-line--hook"}`}>
                {line}
              </p>
            ))}
          </div>
        )}

      {/* Tabbed content */}
      {availableTabs.length > 0 && (
        <div className="sp-tabs-wrap">
          <div className="sp-tabs" role="tablist">
            {availableTabs.map(({ key, label, icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                className={`sp-tab ${activeTab === key ? "sp-tab--active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                <SimplifyLineIcon name={icon} className="sp-tab__glyph" aria-hidden /> {label}
              </button>
            ))}
          </div>

          <div className="sp-tab-panel sp-section" role="tabpanel">
            {activeTab === "what_you_do" && data.what_you_do?.length > 0 && (
              <ol className="sp-numbered-list">
                {data.what_you_do.map((item, i) => (
                  <li key={i} className="sp-numbered-item">
                    <span className="sp-num">{i + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            )}

            {activeTab === "skills_you_learn" && data.skills_you_learn?.length > 0 && (
              <ul className="sp-tag-list">
                {data.skills_you_learn.map((s, i) => (
                  <li key={i} className="sp-tag">{s}</li>
                ))}
              </ul>
            )}

            {activeTab === "important_notes" && data.important_notes?.length > 0 && (
              <ul className="sp-note-list">
                {data.important_notes.map((n, i) => (
                  <li key={i} className="sp-note-item">{n}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      </div>{/* end sp-inattentive-row */}
    </div>
  );
}

// ─── High Energy (Hyperactive) ───────────────────────────────────────────────
function ProfileHyperactive({ data }) {
  if (!data) return null;
  return (
    <div className="sp-profile sp-profile--hyperactive">

      {/* Headline hook — full width banner */}
      {data.headline && (
        <div className="sp-section sp-headline-block sp-headline-block--hyper">
          <p className="sp-headline">{data.headline}</p>
        </div>
      )}

      {/* Why exciting + What you'll do — two columns */}
      {(data.why_exciting?.length > 0 || data.what_you_do?.length > 0) && (
        <div className="sp-hyper-two-col">
          {data.why_exciting?.length > 0 && (
            <div className="sp-hyper-col">
              <p className="sp-hyper-col-label">
                <SimplifyLineIcon name="sparkle" aria-hidden /> Why this is exciting
              </p>
              <ul className="sp-hyper-pills">
                {data.why_exciting.map((r, i) => (
                  <li key={i} className="sp-hyper-pill">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {data.what_you_do?.length > 0 && (
            <div className="sp-hyper-col">
              <p className="sp-hyper-col-label">
                <SimplifyLineIcon name="bolt" aria-hidden /> What you&apos;ll actually do
              </p>
              <ol className="sp-numbered-list">
                {data.what_you_do.map((d, i) => (
                  <li key={i} className="sp-numbered-item">
                    <span className="sp-num">{i + 1}</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* How it works — full-width horizontal timeline */}
      {data.programme_flow?.length > 0 && (
        <div className="sp-section sp-section--flow">
          <h3 className="sp-section-title sp-section-title--with-icon">
            <SimplifyLineIcon name="milestones" aria-hidden />
            How it works
          </h3>
          <ol className="sp-timeline">
            {data.programme_flow.map((step, i) => (
              <li key={i} className="sp-timeline-step">
                <div className="sp-timeline-top">
                  <span className="sp-flow-badge">{i + 1}</span>
                  {i < data.programme_flow.length - 1 && (
                    <span className="sp-timeline-connector" aria-hidden="true" />
                  )}
                </div>
                <span className="sp-timeline-label">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  );
}

// ─── Balanced (Combined) ─────────────────────────────────────────────────────
function ProfileCombined({ data }) {
  if (!data) return null;
  return (
    <div className="sp-profile sp-profile--combined">

      {/* Quick overview — 2-line summary */}
      {data.quick_overview?.length > 0 && (
        <div className="sp-section sp-summary-lines">
          {data.quick_overview.map((line, i) => (
            <p key={i} className={`sp-summary-line${i === 0 ? " sp-summary-line--main" : " sp-summary-line--hook"}`}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* What makes it good — horizontal pill row */}
      {data.what_makes_it_good?.length > 0 && (
        <div className="sp-combined-good-row">
          <p className="sp-combined-good-label">
            <SimplifyLineIcon name="bookmark" aria-hidden /> What makes it good
          </p>
          <ul className="sp-combined-good-pills">
            {data.what_makes_it_good.map((v, i) => (
              <li key={i} className="sp-combined-good-pill">{v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* What you'll learn + Simple steps — two columns */}
      {(data.what_you_learn?.length > 0 || data.simple_steps?.length > 0) && (
        <div className="sp-hyper-two-col">
          {data.what_you_learn?.length > 0 && (
            <div className="sp-hyper-col">
              <p className="sp-hyper-col-label">
                <SimplifyLineIcon name="bookOpen" aria-hidden /> What you&apos;ll learn
              </p>
              <ul className="sp-tag-list">
                {data.what_you_learn.map((s, i) => (
                  <li key={i} className="sp-tag">{s}</li>
                ))}
              </ul>
            </div>
          )}

          {data.simple_steps?.length > 0 && (
            <div className="sp-hyper-col">
              <p className="sp-hyper-col-label">
                <SimplifyLineIcon name="listOrdered" aria-hidden /> Simple steps
              </p>
              <ol className="sp-numbered-list">
                {data.simple_steps.map((step, i) => (
                  <li key={i} className="sp-numbered-item">
                    <span className="sp-num">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Important — full-width callout */}
      {data.important?.length > 0 && (
        <div className="sp-section sp-combined-important">
          <h3 className="sp-section-title sp-section-title--with-icon">
            <SimplifyLineIcon name="alert" aria-hidden />
            Important to know
          </h3>
          <ul className="sp-combined-important-list">
            {data.important.map((n, i) => (
              <li key={i} className="sp-combined-important-item">
                <span className="sp-combined-important-dot" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

// ─── Profile router ──────────────────────────────────────────────────────────
function ActiveProfile({ activeKey, result }) {
  if (activeKey === "inattentive") return <ProfileInattentive data={result?.profile_inattentive} />;
  if (activeKey === "hyperactive") return <ProfileHyperactive data={result?.profile_hyperactive} />;
  return <ProfileCombined data={result?.profile_combined} />;
}

function readCareerProfileForJobScore() {
  try {
    const raw = window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildJobScoreQuestionnaire(answers, skillsList) {
  const roleDurationRaw = answers.roleDuration;
  const roleDuration =
    typeof roleDurationRaw === "string"
      ? roleDurationRaw
      : Object.values(roleDurationRaw || {}).find(Boolean) || "Internship";

  return {
    adhd_profile_type: answers.adhdProfileType || "inattentive",
    work_preferences: answers.workStyles ?? answers.workPreferences ?? [],
    support_needs: answers.supportNeeds ?? [],
    energy_patterns: answers.energyPatterns ?? [],
    primary_role: answers.selectedRoles?.[0] || answers.primaryRole || "",
    role_duration: roleDuration,
    skills: [...skillsList],
  };
}

/** Wizard stores skills in selectedSkills and/or autoSelectedSkills — scoring must see both. */
function mergeProfileSkillLists(answers) {
  if (!answers) return [];
  return [
    ...new Set([
      ...(answers.selectedSkills || []),
      ...(answers.autoSelectedSkills || []),
    ]),
  ];
}

export default function SimplifyJobDescriptionPage() {
  // Derive directly from stored career profile; no manual switching.
  const savedProfileKey = getProfileTabFromCareerProfile();
  const activeProfile = savedProfileKey ?? "inattentive";
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
  const fileDropDepthRef = useRef(0);
  const outputRef = useRef(null);
  const inputId = useId();
  const composerMetaId = useId();
  const [scrollToOutputOnResult, setScrollToOutputOnResult] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);

  // Job score state
  const [jobScoreResult, setJobScoreResult] = useState(null);
  const [jobScoreOccupationName, setJobScoreOccupationName] = useState("");
  const [jobScoreBusy, setJobScoreBusy] = useState(false);
  const [jobScoreError, setJobScoreError] = useState("");
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [jobScoreHistory, setJobScoreHistory] = useState([]);

  const outputVisible = hasRenderableSimplifiedOutput(simplifiedResult);

  const simplifiedResultRef = useRef(simplifiedResult);
  simplifiedResultRef.current = simplifiedResult;

  const jobScoreCacheSyncKey = useMemo(() => {
    if (!simplifiedResult?.job_title) return "";
    return `${normalizeJobTitleKey(simplifiedResult.job_title)}|${String(simplifiedResult._ng_simp_ver ?? "")}`;
  }, [simplifiedResult?.job_title, simplifiedResult?._ng_simp_ver]);

  const runJobScoreForSkills = useCallback(
    async (options) => {
      setJobScoreError("");
      const profile = readCareerProfileForJobScore();
      if (!profile?.answers) {
        setJobScoreError("Complete your profile first so we can calculate your match score.");
        return;
      }
      const jobTitle = simplifiedResult?.job_title || "";
      if (!jobTitle) {
        setJobScoreError("No job title found. Try simplifying the job description again.");
        return;
      }
      const mergedSkills = mergeProfileSkillLists(profile.answers);
      const userQuestionnaire = buildJobScoreQuestionnaire(profile.answers, mergedSkills);
      const extractedSkills = simplifiedResult?.extracted_skills ?? [];
      const fitFeatures = simplifiedResult?.job_fit_features ?? null;

      setJobScoreBusy(true);
      try {
        const occResult = await findOccupation(jobTitle);
        const occupationId = occResult.occupation_id;
        const occupationName = occResult.occupation_name;

        const scoreResult = await predictJobScore(
          userQuestionnaire,
          occupationId,
          extractedSkills.length > 0 ? extractedSkills : null,
          null,
          fitFeatures && typeof fitFeatures === "object" ? fitFeatures : null,
        );

        setJobScoreOccupationName(occupationName);
        setJobScoreResult(scoreResult);
        writePersistedJobScore(
          normalizeJobTitleKey(jobTitle),
          simplifiedResult?._ng_simp_ver ?? null,
          occupationName,
          scoreResult,
        );
        if (options?.appendHistory !== false) {
          appendJobScoreHistory({
            jobTitleNorm: normalizeJobTitleKey(jobTitle),
            jobTitleDisplay: jobTitle,
            simplifiedVerStamp: simplifiedResult?._ng_simp_ver ?? null,
            occupationName,
            result: scoreResult,
            createdAt: Date.now(),
          });
        }
      } catch (err) {
        setJobScoreError(err?.message || "Could not calculate job match score. Please try again.");
      } finally {
        setJobScoreBusy(false);
      }
    },
    [simplifiedResult],
  );

  const handleSkillProfileChange = useCallback(
    ({ skill, action }) => {
      const label = String(skill || "").trim();
      if (!label || (action !== "add" && action !== "remove")) return;
      try {
        const raw = window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!p.answers) return;
        const cmp = (x) => String(x).trim().toLowerCase();
        const lc = cmp(label);
        const sel = [...(p.answers.selectedSkills || [])];
        const auto = [...(p.answers.autoSelectedSkills || [])];
        if (action === "add") {
          const nextSel = [...new Set([...sel, label])];
          p.answers.selectedSkills = nextSel;
          p.answers.autoSelectedSkills = auto.filter((s) => cmp(s) !== lc);
        } else {
          p.answers.selectedSkills = sel.filter((s) => cmp(s) !== lc);
          p.answers.autoSelectedSkills = auto.filter((s) => cmp(s) !== lc);
        }
        window.localStorage.setItem(CAREER_PROFILE_STORAGE_KEY, JSON.stringify(p));
      } catch {
        return;
      }
      const profile = readCareerProfileForJobScore();
      if (!profile?.answers) return;
      void runJobScoreForSkills({ appendHistory: false });
    },
    [runJobScoreForSkills],
  );

  useEffect(() => {
    const sr = simplifiedResultRef.current;
    if (!jobScoreCacheSyncKey || !sr || !hasRenderableSimplifiedOutput(sr)) return;
    const cached = readPersistedJobScore();
    if (!cached) {
      setJobScoreResult(null);
      setJobScoreOccupationName("");
      return;
    }
    if (!isJobScoreCacheValid(cached, sr)) {
      clearPersistedJobScore();
      setJobScoreResult(null);
      setJobScoreOccupationName("");
      return;
    }
    setJobScoreResult(cached.result);
    setJobScoreOccupationName(cached.occupationName || "");
    setJobScoreError("");
  }, [jobScoreCacheSyncKey]);

  useEffect(() => {
    if (!jobScoreResult) return;
    const dbg = jobScoreResult.ml_inference_debug || jobScoreResult.ml_layer?.ml_debug;
    if (typeof console !== "undefined" && console.info) {
      console.info(
        "[JobScore]",
        "ml_source=",
        jobScoreResult.ml_source ?? jobScoreResult.ml_layer?.ml_source,
        "ml_inference_debug=",
        dbg,
      );
    }
  }, [jobScoreResult]);

  useEffect(() => {
    if (!historyDrawerOpen) return;
    setJobScoreHistory(readJobScoreHistory());
  }, [historyDrawerOpen, jobScoreResult]);

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

  useEffect(() => {
    if (inputMode !== "file") {
      fileDropDepthRef.current = 0;
      setFileDropActive(false);
    }
  }, [inputMode]);

  return (
    <div className="simplify-page">
      <DataConsentModal
        onBeforeContinue={
          isCloudSessionApiAvailable()
            ? async () => {
                await registerCloudAccountFromLocalState();
              }
            : undefined
        }
      />
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
          <WarmHeroPaperShapes />
        </div>
      </header>

      <div className="simplify-studio">
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
                    <button
                      type="button"
                      className={`simplify-file-dropzone ${fileDropActive ? "simplify-file-dropzone--active" : ""}`}
                      disabled={isBusy}
                      aria-describedby={composerMetaId}
                      aria-label="Add job posting file: drag and drop here, or click to browse"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      onKeyDown={(e) => {
                        if (isBusy || (e.key !== "Enter" && e.key !== " ")) return;
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        fileDropDepthRef.current += 1;
                        setFileDropActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        fileDropDepthRef.current = Math.max(0, fileDropDepthRef.current - 1);
                        if (fileDropDepthRef.current === 0) setFileDropActive(false);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        fileDropDepthRef.current = 0;
                        setFileDropActive(false);
                        if (!isBusy) {
                          const files = e.dataTransfer?.files;
                          if (files?.length) onFileSelected(files);
                        }
                      }}
                    >
                      <span className="simplify-file-dropzone-plus-wrap" aria-hidden="true">
                        <svg className="simplify-file-dropzone-plus" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10.75" stroke="currentColor" strokeWidth="1.35" opacity="0.45" />
                          <path d="M12 7.75v8.5M7.75 12h8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="simplify-file-dropzone-title">Drag a file here or click to browse</span>
                      <span className="simplify-file-dropzone-sub">
                        Accepts .txt, .pdf, .doc, or .docx · one file · max 5 MB
                      </span>
                    </button>
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
        </div>
      </div>

      {/* ── Results: full-width section, outside the narrow studio column ── */}
      {outputVisible ? (
        <section ref={outputRef} className="simplify-results" aria-labelledby="simplify-output-heading">
          <div className="simplify-results-inner">

            {/* heading + export */}
            <div className="simplify-results-header">
              <div className="simplify-results-title-row">
                <h2 id="simplify-output-heading" className="simplify-results-title">
                  Simplified breakdown
                </h2>
                <ProfileLabel profileKey={savedProfileKey} />
              </div>
              <SimplifyExportToolbar
                outputVisible={outputVisible}
                simplifiedResult={simplifiedResult}
                warnings={warnings}
                syncing={isSimplifying}
              />
            </div>

            {/* Quick Snapshot chips */}
            <QuickSnapshotBar result={simplifiedResult} profileKey={activeProfile} />

            {/* Profile-specific layout */}
            <ActiveProfile activeKey={activeProfile} result={simplifiedResult} />

            {/* Flip cards: raw quick-view of basic info, responsibilities, skills */}
            <FlipCardRow result={simplifiedResult} />

            <div className="simplify-next-step">
              <div className="simplify-jobscore-feature" aria-labelledby="simplify-jobscore-teaser-heading">
                <div className="simplify-jobscore-feature__inner">
                  <div className="simplify-jobscore-mosaic">
                    <div className="simplify-jobscore-visual">
                      <img
                        src={jobMatchConversationUrl}
                        alt=""
                        className="simplify-jobscore-illus"
                        width={220}
                        height={176}
                        decoding="async"
                      />
                    </div>
                    <div className="simplify-jobscore-copy">
                      <p className="simplify-jobscore-eyebrow">
                        Check your Personalized job match Score !
                      </p>
                      <p id="simplify-jobscore-teaser-heading" className="simplify-jobscore-lede">
                        Your profile already holds how you work best and what you bring. One tap lines that up
                        with this posting - clear fit, skills, and angles to lean on, then you can drag skills and
                        watch the readout update with you.
                      </p>
                    </div>
                  </div>
                  <div className="simplify-jobscore-cta-blob">
                    <div className="simplify-jobscore-cta-blob__wash" aria-hidden="true" />
                    <div className="simplify-jobscore-cta-blob__bg" aria-hidden="true" />
                    <button
                      type="button"
                      className="simplify-next-step-btn simplify-jobscore-cta-btn"
                      disabled={jobScoreBusy}
                      onClick={async () => {
                        const profile = readCareerProfileForJobScore();
                        if (!profile?.answers) {
                          setJobScoreError("Complete your profile first so we can calculate your match score.");
                          return;
                        }
                        await runJobScoreForSkills({ appendHistory: true });
                      }}
                    >
                      {jobScoreBusy ? "Calculating…" : "See My Match Score"}
                    </button>
                  </div>
                </div>
                {jobScoreError ? (
                  <p className="simplify-next-step-prompt simplify-jobscore-error" role="alert">
                    {jobScoreError}
                  </p>
                ) : null}
              </div>

              {jobScoreResult || jobScoreBusy ? (
                <JobScoreCard
                  result={jobScoreResult}
                  occupationName={jobScoreOccupationName}
                  onOpenHistory={() => setHistoryDrawerOpen(true)}
                  onSkillProfileChange={handleSkillProfileChange}
                  jobScoreBusy={jobScoreBusy}
                  jobFitFeatures={simplifiedResult?.job_fit_features ?? null}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {isSimplifying ? "Simplifying job description" : ""}
      </div>

      {historyDrawerOpen ? (
        <>
          <button
            type="button"
            className="jsc-history-overlay"
            aria-label="Close comparison drawer"
            onClick={() => setHistoryDrawerOpen(false)}
          />
          <aside className="jsc-history-drawer" role="dialog" aria-label="Past job match comparisons">
            <div className="jsc-history-head">
              <h3 className="jsc-history-title">Compare with Previous Simplified JDs</h3>
              <button type="button" className="jsc-history-close" onClick={() => setHistoryDrawerOpen(false)}>
                Close
              </button>
            </div>
            <div className="jsc-history-list">
              {(() => {
                const currentKey = normalizeJobTitleKey(simplifiedResult?.job_title || "");
                const currentStamp = simplifiedResult?._ng_simp_ver ?? null;
                const prev3 = jobScoreHistory
                  .filter((item) => !(item.jobTitleNorm === currentKey && item.simplifiedVerStamp === currentStamp))
                  .slice(0, 3);
                if (prev3.length === 0) {
                  return <p className="jsc-history-empty">No previous JD scores yet.</p>;
                }
                return prev3.map((item, idx) => {
                  const score = Number(item?.result?.score || 0);
                  const scoreLabel = Number.isFinite(score) ? score.toFixed(1) : "0.0";
                  const toneClass = score >= 75 ? "good" : score >= 55 ? "warn" : "risk";
                  const when = item?.createdAt ? new Date(item.createdAt).toLocaleString() : "";
                  return (
                    <article key={`${item.jobTitleNorm}-${item.simplifiedVerStamp ?? "none"}-${idx}`} className="jsc-history-card">
                      <div className="jsc-history-card-top">
                        <p className="jsc-history-role">{item.occupationName || item.jobTitleNorm || "Role"}</p>
                        <span className={`jsc-history-score jsc-history-score--${toneClass}`}>{scoreLabel}/100</span>
                      </div>
                      <p className="jsc-history-line">{shortText(item?.result?.recommendation || "", 96)}</p>
                      {when ? <p className="jsc-history-time">{when}</p> : null}
                    </article>
                  );
                });
              })()}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

/**
 * Client-side rules for pasted or extracted job description text and uploads.
 *
 * Used before calling the simplify API: trims and normalizes text, enforces word
 * limits, minimum content, and allowed file types for attachments.
 *
 * @file
 */

/** Upper bound on pasted/extracted text length (word count). */
const MAX_WORDS = 5000;
/** Minimum words required so the posting is substantial enough to simplify. */
const MIN_WORDS = 25;
/** Minimum characters (guards very short pasted snippets that split oddly). */
const MIN_CHARS = 120;

/**
 * Prepares text for word counting: normalizes line breaks and trims edges.
 * @param {string} text - Raw user or extracted text.
 * @returns {string}
 */
export function normalizeForCount(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Counts words using the same normalization as validation (line breaks + trim).
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  const t = normalizeForCount(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * Validates job description text for the simplify flow.
 * @param {string} text
 * @returns {{ ok: true, code: null, message: null } | { ok: false, code: string, message: string }}
 */
export function validateJobDescription(text) {
  const normalized = normalizeForCount(text);
  if (!normalized) {
    return {
      ok: false,
      code: "EMPTY_INPUT",
      message: "Add a job description by pasting text or uploading a supported file.",
    };
  }

  const words = countWords(normalized);
  if (words > MAX_WORDS) {
    return {
      ok: false,
      code: "WORD_LIMIT",
      message: `Job descriptions must be ${MAX_WORDS.toLocaleString()} words or fewer (about ${words.toLocaleString()} now).`,
    };
  }

  if (words < MIN_WORDS || normalized.length < MIN_CHARS) {
    return {
      ok: false,
      code: "INSUFFICIENT_CONTENT",
      message:
        "There is not enough detail here yet. ",
    };
  }

  return { ok: true, code: null, message: null };
}

const ALLOWED = new Set(["pdf", "doc", "docx", "txt"]);

/**
 * Ensures the chosen file extension is one we try to extract text from.
 * @param {File} file - Browser File from an `<input type="file">`.
 * @returns {{ ok: true, message: null } | { ok: false, message: string }}
 */
export function assertAllowedFile(file) {
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!ALLOWED.has(ext)) {
    return {
      ok: false,
      message: "Unsupported file type. Supported formats: .pdf, .doc, .docx, .txt.",
    };
  }
  return { ok: true, message: null };
}

/** Maximum upload size in bytes (5 MB) for job file attachments. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/**
 * Client-side validation mirrors backend rules for fast feedback (AC7, AC8, AC12).
 * Server remains authoritative.
 */

const MAX_WORDS = 5000;
const MIN_WORDS = 25;
const MIN_CHARS = 120;

export function normalizeForCount(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function countWords(text) {
  const t = normalizeForCount(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

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
        "There is not enough detail here yet. Try adding responsibilities, requirements, or what the role offers.",
    };
  }

  return { ok: true, code: null, message: null };
}

const ALLOWED = new Set(["pdf", "doc", "docx", "txt"]);

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

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

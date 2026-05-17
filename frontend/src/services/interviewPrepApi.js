import { getApiBase } from "../utils/apiBase.js";

const API_BASE = getApiBase();

export const liveSimplifyEnabled = import.meta.env.VITE_SIMPLIFY_API !== "0";

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function detailToMessage(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return String(item);
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof detail === "object" && "message" in detail) return String(detail.message);
  return "";
}

function apiFailureMessage(res, err) {
  const fromDetail = detailToMessage(err?.detail);
  if (fromDetail) return fromDetail;
  return `Request failed (${res.status}).`;
}

/**
 * @param {string} question
 * @param {{ id: string, text: string }[]} cards
 */
/**
 * @param {string} question
 * @param {string} text
 * @returns {Promise<string[]>}
 */
export async function splitBrainDumpText(question, text) {
  const res = await fetch(`${API_BASE}/interview-prep/split-brain-dump`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: question || "", text }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Split failed (${res.status}).`);
  }
  const data = await readJsonOrText(res);
  const points = Array.isArray(data?.points) ? data.points.map((p) => String(p).trim()).filter(Boolean) : [];
  return points.length ? points : [String(text).trim()];
}

export async function starSortInterview(question, cards) {
  const res = await fetch(`${API_BASE}/interview-prep/star-sort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, cards }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `STAR sort failed (${res.status}).`);
  }
  return readJsonOrText(res);
}

/**
 * @param {string} question
 * @param {string} spokenTranscript
 * @param {string} [writtenAnswer]
 */
export async function coachSpeechAnswer(question, spokenTranscript, writtenAnswer = "") {
  const res = await fetch(`${API_BASE}/interview-prep/speech-coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      spoken_transcript: spokenTranscript,
      written_answer: writtenAnswer,
    }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Speech coach failed (${res.status}).`);
  }
  return readJsonOrText(res);
}

/**
 * @param {string} answer
 * @param {string} instruction
 */
export async function reshapeInterviewAnswer(answer, instruction) {
  const res = await fetch(`${API_BASE}/interview-prep/reshape-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, instruction }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Reshape failed (${res.status}).`);
  }
  return readJsonOrText(res);
}

/**
 * @param {string} question
 * @param {{ situation: string[], task: string[], action: string[], result: string[] }} starTexts
 */
export async function formulateInterviewSpeech(question, starTexts) {
  const res = await fetch(`${API_BASE}/interview-prep/formulate-speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      situation: starTexts.situation || [],
      task: starTexts.task || [],
      action: starTexts.action || [],
      result: starTexts.result || [],
    }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Formulate speech failed (${res.status}).`);
  }
  return readJsonOrText(res);
}

import { getApiBase } from "../utils/apiBase.js";
import { cleanSpeechDraft } from "../utils/interviewPrepHelpers.js";

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

const SPEECH_FORMULATE_INSTRUCTION =
  "Rewrite as one conversational spoken answer (60–90 seconds read aloud), like talking to an interviewer. " +
  "Use connected sentences with natural transitions (so, then, because, after that) — not a bullet list or fact stack. " +
  "Merge related notes into the same sentence. First person, warm plain English. " +
  "Do NOT use bullets, dashes, numbered lists, line breaks between facts, STAR headings, or repeat the question. " +
  "No filler openers. Start directly in the story. Preserve every fact; do not invent details.";

/** @param {{ situation: string[], task: string[], action: string[], result: string[] }} starTexts */
export function starTextsToFormulateInput(question, starTexts) {
  const sections = [
    ["Situation", starTexts.situation || []],
    ["Task", starTexts.task || []],
    ["Action", starTexts.action || []],
    ["Result", starTexts.result || []],
  ];
  const body = sections
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `${label}: ${items.map((t) => String(t).trim()).join(" ")}`)
    .join("\n");
  return (
    `Interview question (context only — do not repeat in your answer): ${question}\n\n` +
    `Rough notes to turn into flowing speech (not a script to copy verbatim):\n${body}`
  );
}

function speechResponse(text, question) {
  const cleaned = cleanSpeechDraft(String(text || "").trim(), question);
  return { text: cleaned };
}

/** Gemini via reshape-answer (works when formulate-speech route is not deployed yet). */
export async function reshapeSpeechFromStarNotes(question, starTexts) {
  const input = starTextsToFormulateInput(question, starTexts).trim();
  if (input.length < 12) {
    throw new Error("Not enough STAR content to formulate an answer.");
  }
  const data = await reshapeInterviewAnswer(input, SPEECH_FORMULATE_INSTRUCTION);
  return speechResponse(data?.text, question);
}

/**
 * @param {string} question
 * @param {{ situation: string[], task: string[], action: string[], result: string[] }} starTexts
 */
export async function formulateInterviewSpeech(question, starTexts) {
  const payload = {
    question,
    situation: starTexts.situation || [],
    task: starTexts.task || [],
    action: starTexts.action || [],
    result: starTexts.result || [],
  };

  const res = await fetch(`${API_BASE}/interview-prep/formulate-speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const data = await readJsonOrText(res);
    return speechResponse(data?.text, question);
  }

  try {
    return await reshapeSpeechFromStarNotes(question, starTexts);
  } catch (reshapeErr) {
    const err = await readJsonOrText(res);
    const primary = apiFailureMessage(res, err) || `Formulate speech failed (${res.status}).`;
    throw new Error(reshapeErr?.message ? `${primary} ${reshapeErr.message}` : primary);
  }
}

/**
 * Generate 4 AI skill-based interview questions.
 * @param {{ knownSkills: string[], missingSkills: string[], role: string }} params
 * @returns {Promise<string[]>}
 */
export async function generateInterviewQuestions({
  knownSkills = [],
  missingSkills = [],
  role = "",
  company = "",
  summary = "",
  responsibilities = "",
}) {
  const res = await fetch(`${API_BASE}/interview-prep/generate-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      known_skills: knownSkills.slice(0, 10),
      missing_skills: missingSkills.slice(0, 10),
      role,
      company,
      summary,
      responsibilities,
    }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `generate-questions failed (${res.status}).`);
  }
  const data = await res.json();
  return Array.isArray(data.questions) ? data.questions : [];
}

import { getApiBase } from "../utils/apiBase.js";
import { buildSessionAuthHeaders } from "./sessionApi.js";

const API_BASE = getApiBase();

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * @param {object} credentials
 * @param {string} jobFingerprint
 * @returns {Promise<object | null>} row or null if 404
 */
export async function fetchInterviewPrepProgress(credentials, jobFingerprint) {
  const enc = encodeURIComponent(jobFingerprint);
  const res = await fetch(`${API_BASE}/pg/interview-prep/progress?job_fingerprint=${enc}`, {
    method: "GET",
    headers: buildSessionAuthHeaders(credentials),
  });
  if (res.status === 404) return null;
  const body = await readJsonOrText(res);
  if (!res.ok) {
    const msg = body?.detail ? String(body.detail) : `Interview prep fetch failed (${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

/**
 * @param {object} credentials
 * @returns {Promise<{ sessions: Array<{ id: string, job_fingerprint: string, simplified_job: object | null, updated_at: string }> }>}
 */
export async function fetchInterviewPrepSessions(credentials) {
  const res = await fetch(`${API_BASE}/pg/interview-prep/sessions`, {
    method: "GET",
    headers: buildSessionAuthHeaders(credentials),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) {
    const msg = body?.detail ? String(body.detail) : `Interview prep list failed (${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

/**
 * @param {object} credentials
 * @param {{
 *   job_fingerprint: string,
 *   simplified_job?: object | null,
 *   interview_questions: string[],
 *   progress: object,
 * }} payload
 */
export async function putInterviewPrepProgress(credentials, payload) {
  const res = await fetch(`${API_BASE}/pg/interview-prep/progress`, {
    method: "PUT",
    headers: buildSessionAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) {
    const msg = body?.detail ? String(body.detail) : `Interview prep save failed (${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

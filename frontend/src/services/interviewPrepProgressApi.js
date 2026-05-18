import { getApiBase } from "../utils/apiBase.js";
import { buildSessionAuthHeaders } from "./sessionApi.js";

const API_BASE = getApiBase();

function wrapProgressFetchError(err, action) {
  if (err instanceof TypeError || /failed to fetch/i.test(String(err?.message || ""))) {
    return new Error(
      `${action} could not reach the API (network or CORS). On localhost: clear VITE_API_BASE_URL in frontend/.env ` +
        "so requests use the Vite proxy, set VITE_DEV_API_PROXY to your API host, and restart npm run dev. " +
        "On Lambda, add your origin to CORS_ORIGINS (e.g. http://localhost:5174).",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

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
  let res;
  try {
    res = await fetch(`${API_BASE}/pg/interview-prep/progress?job_fingerprint=${enc}`, {
      method: "GET",
      headers: buildSessionAuthHeaders(credentials),
    });
  } catch (err) {
    throw wrapProgressFetchError(err, "Load interview prep");
  }
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
  let res;
  try {
    res = await fetch(`${API_BASE}/pg/interview-prep/sessions`, {
      method: "GET",
      headers: buildSessionAuthHeaders(credentials),
    });
  } catch (err) {
    throw wrapProgressFetchError(err, "List interview prep sessions");
  }
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
  let res;
  try {
    res = await fetch(`${API_BASE}/pg/interview-prep/progress`, {
      method: "PUT",
      headers: buildSessionAuthHeaders(credentials),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw wrapProgressFetchError(err, "Save interview prep");
  }
  const body = await readJsonOrText(res);
  if (!res.ok) {
    const msg = body?.detail ? String(body.detail) : `Interview prep save failed (${res.status}).`;
    throw new Error(msg);
  }
  return body;
}

/**
 * @param {object} credentials
 * @param {string} jobFingerprint
 */
export async function deleteInterviewPrepProgress(credentials, jobFingerprint) {
  const enc = encodeURIComponent(jobFingerprint);
  let res;
  try {
    res = await fetch(`${API_BASE}/pg/interview-prep/progress?job_fingerprint=${enc}`, {
      method: "DELETE",
      headers: buildSessionAuthHeaders(credentials),
    });
  } catch (err) {
    throw wrapProgressFetchError(err, "Delete interview prep");
  }
  if (res.status === 204) return;
  const body = await readJsonOrText(res);
  if (!res.ok) {
    const msg = body?.detail ? String(body.detail) : `Interview prep delete failed (${res.status}).`;
    throw new Error(msg);
  }
}

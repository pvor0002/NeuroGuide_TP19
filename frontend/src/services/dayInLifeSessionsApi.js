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

function detailToMessage(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((i) => i?.msg ?? String(i)).filter(Boolean).join(" ");
  if (typeof detail === "object" && "message" in detail) return String(detail.message);
  return "";
}

/**
 * @param {object} credentials
 * @returns {Promise<{ sessions: Array<{ id: string, job_title: string, adhd_type: string, timeline: unknown[], updated_at: string }> }>}
 */
export async function fetchDayInLifeSessions(credentials) {
  const res = await fetch(`${API_BASE}/pg/day-in-life/sessions`, {
    method: "GET",
    headers: buildSessionAuthHeaders(credentials),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) {
    throw new Error(detailToMessage(body?.detail) || `Day in life list failed (${res.status}).`);
  }
  return body;
}

/**
 * @param {object} credentials
 * @param {{ job_title: string, adhd_type: string, timeline: unknown[] }} payload
 */
export async function putDayInLifeSession(credentials, payload) {
  const res = await fetch(`${API_BASE}/pg/day-in-life/sessions`, {
    method: "PUT",
    headers: buildSessionAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) {
    throw new Error(detailToMessage(body?.detail) || `Save day in life failed (${res.status}).`);
  }
  return body;
}

/**
 * @param {object} credentials
 * @param {string} sessionId
 */
export async function deleteDayInLifeSession(credentials, sessionId) {
  const id = encodeURIComponent(String(sessionId || "").trim());
  const res = await fetch(`${API_BASE}/pg/day-in-life/sessions/${id}`, {
    method: "DELETE",
    headers: buildSessionAuthHeaders(credentials),
  });
  if (res.status === 204) return;
  const body = await readJsonOrText(res);
  if (!res.ok) {
    throw new Error(detailToMessage(body?.detail) || `Delete day in life failed (${res.status}).`);
  }
}

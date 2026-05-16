/**
 * Authenticated session API (RDS) — pass key + user id headers.
 */

import { getApiBase } from "../utils/apiBase.js";

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
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof detail === "object" && "message" in detail) return String(detail.message);
  return "";
}

function isLikelyNetworkOrCorsError(err) {
  const m = String(err?.message ?? "").toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror when attempting to fetch")
  );
}

function failMessage(res, body) {
  const d = detailToMessage(body?.detail);
  if (res.status === 404) {
    return (
      "Could not reach the session API (404). Use a full base URL ending in /api/v1, " +
      "redeploy the frontend after changing .env, and deploy the backend that includes /pg/session/*. " +
      'You can still use "Continue without cloud backup" below. ' +
      (d ? `(${d})` : "")
    ).trim();
  }
  if (d) return d;
  return `Request failed (${res.status})`;
}

/** @param {Response} res */
function throwHttpError(res, body) {
  const msg = failMessage(res, body);
  const err = new Error(msg);
  err.status = res.status;
  throw err;
}

function authHeaders(credentials) {
  if (!credentials?.userId || !credentials?.passKey) {
    throw new Error("Missing user id or pass key for cloud sync.");
  }
  return {
    "Content-Type": "application/json",
    "X-NG-User-Id": String(credentials.userId),
    "X-NG-Pass-Key": String(credentials.passKey),
  };
}

/** Same headers as ``fullSyncSession`` — reuse for other authenticated /pg routes. */
export function buildSessionAuthHeaders(credentials) {
  return authHeaders(credentials);
}

export function isCloudSessionApiAvailable() {
  if (import.meta.env.VITE_DISABLE_CLOUD_SESSION === "1") return false;
  /* Session API base comes from getApiBase() (Render fallback in prod, /api/v1 in dev). */
  return true;
}

/**
 * @param {object} body
 * @param {string} body.user_id
 * @param {string} body.pass_key
 * @param {object} body.consent
 * @param {object | null} [body.career_wizard]
 * @param {object | null} [body.job_workbench]
 */
export async function registerSession(body) {
  const res = await fetch(`${API_BASE}/pg/session/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: body.user_id,
      pass_key: body.pass_key,
      consent: body.consent,
      career_wizard: body.career_wizard ?? null,
      job_workbench: body.job_workbench ?? null,
    }),
  });
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
  return out;
}

export async function loginWithPassKey(passKey) {
  let res;
  try {
    res = await fetch(`${API_BASE}/pg/session/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass_key: passKey }),
    });
  } catch (err) {
    if (isLikelyNetworkOrCorsError(err)) {
      throw new Error(
        "Could not reach the cloud login service from this browser. " +
          "If you use a bookmark or an old link, try https://www.neuroguide.dev instead, " +
          "or ask your team to add this site URL to API CORS settings."
      );
    }
    throw err;
  }
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
  return out;
}

export async function fullSyncSession(credentials, payload) {
  const res = await fetch(`${API_BASE}/pg/session/sync`, {
    method: "PUT",
    headers: authHeaders(credentials),
    body: JSON.stringify({
      consent: payload.consent ?? null,
      career_wizard: payload.career_wizard ?? null,
      job_workbench: payload.job_workbench ?? null,
    }),
  });
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
  return out;
}

export async function patchConsentSession(credentials, { consent_granted, consent }) {
  const res = await fetch(`${API_BASE}/pg/session/consent`, {
    method: "PATCH",
    headers: authHeaders(credentials),
    body: JSON.stringify({ consent_granted, consent }),
  });
  if (res.status === 204) return;
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
}

export async function deleteCloudProfileOnly(credentials) {
  const res = await fetch(`${API_BASE}/pg/session/data/profile`, {
    method: "DELETE",
    headers: authHeaders(credentials),
  });
  if (res.status === 204) return;
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
}

export async function deleteCloudAllUserData(credentials) {
  const res = await fetch(`${API_BASE}/pg/session/data/all`, {
    method: "DELETE",
    headers: authHeaders(credentials),
  });
  if (res.status === 204) return;
  const out = await readJsonOrText(res);
  if (!res.ok) throwHttpError(res, out);
}

/**
 * Thin client for the anonymous Career Profile endpoints.
 *
 * The backend issues a short server-generated code (e.g. `K7X2-M4QR`) on
 * create; we use it to read or update the same profile from any browser.
 * No personal info is sent or stored — only the wizard's JSON payload.
 */

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");

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

function failureMessage(res, body) {
  const detail = detailToMessage(body?.detail);
  if (detail) return detail;
  if (res.status === 404) return "No profile with that ID was found.";
  if (res.status === 413) return "This profile is too large to sync. Remove some answers and try again.";
  return `Request failed (${res.status}). Is the backend reachable at ${API_BASE}?`;
}

/** Strip spaces / dashes / lowercase so the user can paste it however they like. */
export function normalizeProfileId(raw) {
  return String(raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Turn the 8-char raw id into the display form XXXX-XXXX. */
export function formatProfileIdForDisplay(raw) {
  const norm = normalizeProfileId(raw);
  if (norm.length !== 8) return norm;
  return `${norm.slice(0, 4)}-${norm.slice(4)}`;
}

export async function createProfile(profile) {
  const res = await fetch(`${API_BASE}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) throw new Error(failureMessage(res, body));
  return body;
}

export async function fetchProfile(profileId) {
  const normalized = normalizeProfileId(profileId);
  if (normalized.length !== 8) {
    throw new Error("Profile IDs are 8 characters (letters + numbers). Check for typos.");
  }
  const res = await fetch(`${API_BASE}/profiles/${encodeURIComponent(normalized)}`);
  const body = await readJsonOrText(res);
  if (!res.ok) throw new Error(failureMessage(res, body));
  return body;
}

export async function updateProfile(profileId, profile) {
  const normalized = normalizeProfileId(profileId);
  if (normalized.length !== 8) {
    throw new Error("Profile IDs are 8 characters (letters + numbers). Check for typos.");
  }
  const res = await fetch(`${API_BASE}/profiles/${encodeURIComponent(normalized)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) throw new Error(failureMessage(res, body));
  return body;
}

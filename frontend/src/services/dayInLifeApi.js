import { getApiBase } from "../utils/apiBase.js";

const API_BASE = getApiBase();

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { detail: text }; }
}

function detailToMessage(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((i) => i?.msg ?? String(i)).filter(Boolean).join(" ");
  if (typeof detail === "object" && "message" in detail) return String(detail.message);
  return "";
}

export async function fetchDayInLife(job_title, adhd_type) {
  const res = await fetch(`${API_BASE}/day-in-life`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_title, adhd_type }),
  });
  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(detailToMessage(err?.detail) || `Request failed (${res.status}).`);
  }
  return readJsonOrText(res);
}
const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");

/**
 * Set VITE_SIMPLIFY_API=0 to hide simplify actions when no backend is available.
 */
export const liveSimplifyEnabled = import.meta.env.VITE_SIMPLIFY_API !== "0";

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/** FastAPI often returns `detail` as a string, or a list of validation errors. */
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
  if (err?.message && typeof err.message === "string") return err.message;
  return `Request failed (${res.status}). Is the backend running on ${API_BASE} ?`;
}

export async function extractUploadedJobDescription(file) {
  const name = (file.name || "").toLowerCase();
  const isTxt = name.endsWith(".txt") || file.type === "text/plain";
  if (isTxt) {
    const extracted_text = await file.text();
    return { extracted_text, warnings: [] };
  }

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}/job-description/extract`, {
    method: "POST",
    body: fd
  });

  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Extract failed (${res.status}).`);
  }

  return readJsonOrText(res);
}

export async function simplifyJobDescription(text) {
  const res = await fetch(`${API_BASE}/job-description/simplify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!res.ok) {
    const err = await readJsonOrText(res);
    throw new Error(apiFailureMessage(res, err) || `Simplify failed (${res.status}).`);
  }

  return readJsonOrText(res);
}

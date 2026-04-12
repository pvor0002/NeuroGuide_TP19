const API_BASE = "/api";

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
    const msg =
      typeof err?.detail === "string"
        ? err.detail
        : err?.message || `Extract failed (${res.status}). Paste text or start the API server.`;
    throw new Error(msg);
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
    const msg =
      typeof err?.detail === "string"
        ? err.detail
        : err?.message || `Simplify failed (${res.status}). Is the API server running?`;
    throw new Error(msg);
  }

  return readJsonOrText(res);
}

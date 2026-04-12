/**
 * Job-description API client.
 *
 * Mock mode by default (no FastAPI). Set `VITE_USE_LIVE_JOB_API=true` in `frontend/.env` for real endpoints.
 */

const useLiveJobApi = import.meta.env.VITE_USE_LIVE_JOB_API === "true";

async function readError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // ignore
  }
  const detail = payload?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return { code: detail.code ?? "ERROR", message: detail.message ?? "Request failed." };
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    return { code: "VALIDATION_ERROR", message: first?.msg ?? "Request failed." };
  }
  return { code: "ERROR", message: typeof detail === "string" ? detail : "Request failed." };
}

function countWords(s) {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

async function mockExtractUploadedJobDescription(file) {
  await new Promise((r) => setTimeout(r, 200));
  const fname = file.name || "upload";
  const ext = fname.includes(".") ? fname.split(".").pop().toLowerCase() : "";

  if (ext === "txt" || file.type === "text/plain") {
    const extracted_text = await file.text();
    return {
      extracted_text,
      word_count: countWords(extracted_text),
      warnings: [],
    };
  }

  return {
    extracted_text: "",
    word_count: 0,
    warnings: [],
  };
}

async function mockSimplifyJobDescription(text) {
  await new Promise((r) => setTimeout(r, 350));
  const t = text.trim();
  const head = t.slice(0, 320);
  const mid = t.slice(320, 900) || "(empty)";
  return {
    quick_snapshot: head + (t.length > 320 ? "..." : ""),
    what_youll_do: mid + (t.length > 900 ? "..." : ""),
    skills_you_need: "Mock mode: connect the backend for real skill detection.",
    nice_to_haves: "Mock mode.",
    what_the_role_offers: "Mock mode.",
  };
}

export async function extractUploadedJobDescription(file) {
  if (!useLiveJobApi) {
    return mockExtractUploadedJobDescription(file);
  }

  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/job-descriptions/extract-upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const { code, message } = await readError(res);
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function simplifyJobDescription(text) {
  if (!useLiveJobApi) {
    return mockSimplifyJobDescription(text);
  }

  const res = await fetch("/api/job-descriptions/simplify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const { code, message } = await readError(res);
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

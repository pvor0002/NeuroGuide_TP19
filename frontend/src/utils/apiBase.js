/**
 * Single place to resolve the FastAPI prefix (`/api/v1`) for production builds.
 *
 * Many hosts are configured as ``https://service.onrender.com`` without the path.
 * If we concatenate ``/pg/session/...`` onto that, the server returns 404 ``Not Found``.
 *
 * **Vercel:** If ``VITE_API_BASE_URL`` is missing from the project env, production builds
 * used to fall back to ``127.0.0.1:8000`` — the browser then called *your laptop*, not Render,
 * which produced confusing 404s. We now default production to the deployed Render API unless
 * overridden. Local ``npm run dev`` uses ``/api/v1`` + Vite proxy (see ``vite.config.js``).
 */

/** Production API — override with ``VITE_API_BASE_URL`` in Vercel / ``frontend/.env``. */
const PRODUCTION_API_FALLBACK = "https://neuroguide-tp19.onrender.com/api/v1";

/**
 * @returns {string} Base URL ending with ``/api/v1`` (no trailing slash), or ``/api/v1`` in dev.
 */
export function getApiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    if (import.meta.env.DEV) return "/api/v1";
    return PRODUCTION_API_FALLBACK;
  }
  if (/\/api\/v1$/i.test(trimmed)) return trimmed;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

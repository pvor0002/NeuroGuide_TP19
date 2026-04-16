import { useCallback, useEffect, useId, useState } from "react";
import "./SitePasswordGate.css";

const STORAGE_KEY = "ng_site_unlock_v1";

function readRequiredPassword() {
  const raw = import.meta.env.VITE_SITE_PASSWORD;
  if (raw == null || typeof raw !== "string") return "";
  return raw.trim();
}

export default function SitePasswordGate({ children }) {
  const required = readRequiredPassword();

  useEffect(() => {
    if (!import.meta.env.DEV || required) return;
    console.info(
      "[NeuroGuide] Site password gate is off: set VITE_SITE_PASSWORD in frontend/.env or the repo root .env, then restart the dev server."
    );
  }, [required]);

  const [unlocked, setUnlocked] = useState(() => {
    if (!required) return true;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const onUnlock = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode / blocked storage */
    }
    setUnlocked(true);
  }, []);

  if (!required || unlocked) {
    return children;
  }

  return <SitePasswordForm requiredPassword={required} onSuccess={onUnlock} />;
}

function SitePasswordForm({ requiredPassword, onSuccess }) {
  const formId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (value === requiredPassword) {
      setError("");
      onSuccess();
      return;
    }
    setError("That password does not match. Try again.");
  };

  return (
    <div className="site-gate">
      <div className="site-gate__panel">
        <div className="site-gate__inner">
          <h1 className="site-gate__title">NeuroGuide</h1>
          <hr className="site-gate__divider" aria-hidden="true" />
          <p className="site-gate__hint">Enter the access password to open this preview.</p>
          <form onSubmit={submit} noValidate>
            <label className="site-gate__label" htmlFor={formId}>
              Password
            </label>
            <input
              id={formId}
              className="site-gate__input"
              type={showPassword ? "text" : "password"}
              name="site-password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? `${formId}-err` : undefined}
            />
            <label className="site-gate__show">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              Show password
            </label>
            {error ? (
              <p id={`${formId}-err`} className="site-gate__error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="site-gate__submit">
              Enter NeuroGuide
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

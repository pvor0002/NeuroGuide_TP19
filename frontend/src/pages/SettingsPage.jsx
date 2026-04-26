import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const CONSENT_STORAGE_KEY = "ng_data_consent_v1";
const USER_CREDENTIALS_STORAGE_KEY = "ng_local_user_credentials_v1";
const PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";
const LOGIN_GATE_SESSION_KEY = "neuroguide.careerProfile.loginGateDismissed";
const SITE_UNLOCK_KEY = "ng_site_unlock_v1";

const STORAGE_ITEMS = [
  {
    key: PROFILE_STORAGE_KEY,
    title: "Career profile answers",
    purpose:
      "Your focus profile, work preferences, supports, roles, and skills from the Career Profile wizard. Used to pre-fill the wizard and score job fit.",
    where: "Browser local storage",
  },
  {
    key: USER_CREDENTIALS_STORAGE_KEY,
    title: "Local User ID & pass key",
    purpose:
      "A random User ID and memorable pass key so you can reopen your saved profile on this device. No name, email, or phone is stored.",
    where: "Browser local storage",
  },
  {
    key: CONSENT_STORAGE_KEY,
    title: "Consent record",
    purpose:
      "Tracks whether you accepted or declined the data-usage notice, and when.",
    where: "Browser local storage",
  },
  {
    key: LOGIN_GATE_SESSION_KEY,
    title: "Session flags",
    purpose:
      "Short-lived flags like 'login gate dismissed', cleared when you close the tab.",
    where: "Browser session storage",
  },
];

const SECTION_DEFS = [
  {
    id: "privacy",
    title: "Privacy & data",
    summary: "Plain-English summary of how NeuroGuide handles your information.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l8 3v6c0 4.5-3.3 8.3-8 9-4.7-.7-8-4.5-8-9V6l8-3z" />
      </svg>
    ),
  },
  {
    id: "storage",
    title: "What we store on this device",
    summary: "Every storage key, its purpose, and where it lives.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="4" rx="1.5" />
        <rect x="3" y="10" width="18" height="4" rx="1.5" />
        <rect x="3" y="16" width="18" height="4" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "consent",
    title: "Consent",
    summary: "Accept or withdraw your data-usage consent at any time.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l4 4L19 6" />
      </svg>
    ),
  },
  {
    id: "credentials",
    title: "User ID & pass key",
    summary: "View, reveal, and copy your recovery details.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="9" r="3.5" />
        <path d="M14 13l6 6" />
        <path d="M17 16l2-2" />
      </svg>
    ),
  },
  {
    id: "danger",
    title: "Clear your data",
    summary: "Delete profile answers or wipe everything on this device.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" />
        <path d="M9 7V4h6v3" />
      </svg>
    ),
    danger: true,
  },
];

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") return null;
    const h = window.location.hash.replace(/^#/, "");
    return SECTION_DEFS.some((s) => s.id === h) ? h : null;
  });

  const [consent, setConsent] = useState(() => readJSON(CONSENT_STORAGE_KEY));
  const [credentials, setCredentials] = useState(() => readJSON(USER_CREDENTIALS_STORAGE_KEY));
  const [hasProfile, setHasProfile] = useState(false);
  const [revealPassKey, setRevealPassKey] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const refreshState = useCallback(() => {
    setConsent(readJSON(CONSENT_STORAGE_KEY));
    setCredentials(readJSON(USER_CREDENTIALS_STORAGE_KEY));
    try {
      setHasProfile(Boolean(window.localStorage.getItem(PROFILE_STORAGE_KEY)));
    } catch {
      setHasProfile(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshState();
  }, [refreshState]);

  // Keep URL hash in sync so refresh + share-links land on the same sub-page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextHash = activeSection ? `#${activeSection}` : "";
    if (window.location.hash !== nextHash) {
      const url = window.location.pathname + window.location.search + nextHash;
      window.history.replaceState(null, "", url);
    }
  }, [activeSection]);

  // Respond to browser back/forward so each sub-page is a history entry.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, "");
      setActiveSection(SECTION_DEFS.some((s) => s.id === h) ? h : null);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const consentStatus = consent?.status || "not-set";
  const consentDate = consent?.acknowledgedAt ? formatDate(consent.acknowledgedAt) : "";

  const consentBadge = useMemo(() => {
    if (consentStatus === "accepted") return { label: "Accepted", tone: "ok" };
    if (consentStatus === "declined") return { label: "Declined", tone: "warn" };
    return { label: "Not set yet", tone: "muted" };
  }, [consentStatus]);

  const revokeConsent = () => {
    try { window.localStorage.removeItem(CONSENT_STORAGE_KEY); } catch { /* noop */ }
    setActionMessage("Consent withdrawn. You'll be asked again next time you open a tool.");
    refreshState();
  };

  const acceptConsent = () => {
    try {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ status: "accepted", acknowledgedAt: new Date().toISOString() })
      );
    } catch { /* noop */ }
    setActionMessage("Consent recorded as accepted.");
    refreshState();
  };

  const copyPassKey = async () => {
    if (!credentials?.passKey) return;
    try {
      await navigator.clipboard.writeText(credentials.passKey);
      setCopyStatus("Copied");
      setTimeout(() => setCopyStatus(""), 1600);
    } catch {
      setCopyStatus("Copy failed");
      setTimeout(() => setCopyStatus(""), 1600);
    }
  };

  const clearProfileOnly = () => {
    const ok = window.confirm(
      "Clear your saved Career Profile answers on this device? Your User ID and pass key will be kept."
    );
    if (!ok) return;
    try { window.localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { /* noop */ }
    setActionMessage("Career Profile answers cleared.");
    refreshState();
  };

  const clearEverything = () => {
    const ok = window.confirm(
      "This deletes ALL NeuroGuide data in this browser: profile answers, User ID, pass key, consent, and session flags. Continue?"
    );
    if (!ok) return;
    try {
      [
        PROFILE_STORAGE_KEY,
        USER_CREDENTIALS_STORAGE_KEY,
        CONSENT_STORAGE_KEY,
        SITE_UNLOCK_KEY,
      ].forEach((k) => window.localStorage.removeItem(k));
      window.sessionStorage.removeItem(LOGIN_GATE_SESSION_KEY);
    } catch { /* noop */ }
    setActionMessage("All NeuroGuide data in this browser has been cleared.");
    refreshState();
  };

  const goBack = () => setActiveSection(null);
  const openSection = (id) => {
    setActionMessage("");
    setActiveSection(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentDef = SECTION_DEFS.find((s) => s.id === activeSection);

  return (
    <div className="settings-page settings-page--menu">
      {!activeSection ? (
        <>
          <section className="settings-hero" aria-labelledby="settings-title">
            <p className="settings-eyebrow">Settings</p>
            <h1 id="settings-title" className="settings-title">
              Your privacy &amp; your data
            </h1>
            <p className="settings-lead">
              Pick a section to view or change. Everything stays on this device.
            </p>
          </section>

          <nav className="settings-menu" aria-label="Settings sections">
            <ul className="settings-menu-list" role="list">
              {SECTION_DEFS.map((s) => (
                <li key={s.id} className="settings-menu-item">
                  <button
                    type="button"
                    className={`settings-menu-row ${s.danger ? "is-danger" : ""}`}
                    onClick={() => openSection(s.id)}
                  >
                    <span className={`settings-menu-icon ${s.danger ? "is-danger" : ""}`} aria-hidden="true">
                      {s.icon}
                    </span>
                    <span className="settings-menu-text">
                      <span className="settings-menu-title">{s.title}</span>
                      <span className="settings-menu-sub">{s.summary}</span>
                    </span>
                    <span className="settings-menu-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : (
        <>
          <header className="settings-subhead">
            <button type="button" className="settings-back" onClick={goBack} aria-label="Back to settings">
              <span aria-hidden="true">‹</span>
              <span>Settings</span>
            </button>
            <h1 className="settings-subhead-title">{currentDef?.title}</h1>
            <p className="settings-subhead-sub">{currentDef?.summary}</p>
          </header>

          {actionMessage ? (
            <div className="settings-toast" role="status">{actionMessage}</div>
          ) : null}

          {activeSection === "privacy" ? (
            <section className="settings-card" aria-label="Privacy policy">
              <ul className="settings-list">
                <li>
                  <strong>No account, no server profile.</strong> We don&apos;t ask for your
                  name, email, or phone.
                </li>
                <li>
                  <strong>Your data stays in your browser.</strong> Career Profile answers
                  and simplified job history are saved to this device&apos;s local storage.
                </li>
                <li>
                  <strong>Job descriptions you paste</strong> are sent to our simplifier
                  service only for processing and are not linked to any personal profile.
                </li>
                <li>
                  <strong>Anonymous sync (optional).</strong> If you accept, we generate a
                  random User ID and pass key so you can reopen your profile on another
                  browser. The ID is random and not linked to anything real about you.
                </li>
                <li>
                  <strong>You&apos;re in control.</strong> You can revoke consent or wipe all
                  data from this page at any time.
                </li>
              </ul>
            </section>
          ) : null}

          {activeSection === "storage" ? (
            <section className="settings-card" aria-label="What we store on this device">
              <p className="settings-card-sub">Each item below is stored in your browser only.</p>
              <ul className="settings-table" role="list">
                {STORAGE_ITEMS.map((item) => (
                  <li key={item.key} className="settings-row">
                    <div className="settings-row-head">
                      <span className="settings-row-title">{item.title}</span>
                      <code className="settings-row-key">{item.key}</code>
                    </div>
                    <p className="settings-row-purpose">{item.purpose}</p>
                    <p className="settings-row-where">Stored in: {item.where}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activeSection === "consent" ? (
            <section className="settings-card" aria-label="Consent">
              <div className="settings-consent-row">
                <div>
                  <p className="settings-consent-status">
                    Current status:{" "}
                    <span className={`settings-badge settings-badge--${consentBadge.tone}`}>
                      {consentBadge.label}
                    </span>
                  </p>
                  {consentDate ? (
                    <p className="settings-consent-meta">Recorded on {consentDate}</p>
                  ) : null}
                </div>
                <div className="settings-actions-row">
                  {consentStatus !== "accepted" ? (
                    <button type="button" className="settings-btn settings-btn--primary" onClick={acceptConsent}>
                      Record acceptance
                    </button>
                  ) : null}
                  {consentStatus !== "not-set" ? (
                    <button type="button" className="settings-btn settings-btn--ghost" onClick={revokeConsent}>
                      Withdraw consent
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "credentials" ? (
            <section className="settings-card" aria-label="User ID and pass key">
              <p className="settings-card-sub">
                Used to recover your profile on another browser. Keep them safe - we can&apos;t
                reset what we never knew.
              </p>

              {credentials?.userId ? (
                <div className="settings-id-grid">
                  <div className="settings-id-field">
                    <span className="settings-id-label">User ID</span>
                    <code className="settings-id-value">{credentials.userId}</code>
                  </div>
                  <div className="settings-id-field">
                    <span className="settings-id-label">Pass key</span>
                    <code className="settings-id-value">
                      {revealPassKey ? credentials.passKey : "••••••••"}
                    </code>
                    <div className="settings-actions-row">
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        onClick={() => setRevealPassKey((v) => !v)}
                      >
                        {revealPassKey ? "Hide" : "Reveal"}
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        onClick={copyPassKey}
                      >
                        {copyStatus || "Copy pass key"}
                      </button>
                    </div>
                  </div>
                  {credentials.createdAt ? (
                    <p className="settings-id-meta">Created {formatDate(credentials.createdAt)}</p>
                  ) : null}
                </div>
              ) : (
                <p className="settings-empty">
                  No User ID yet. When you accept the consent notice in the{" "}
                  <Link to="/profile">Career Profile</Link> or{" "}
                  <Link to="/simplify-job-description">Simplify Job Description</Link> tool,
                  we&apos;ll generate one for you.
                </p>
              )}
            </section>
          ) : null}

          {activeSection === "danger" ? (
            <section className="settings-card settings-card--danger" aria-label="Clear your data">
              <p className="settings-card-sub">These actions can&apos;t be undone.</p>
              <div className="settings-danger-grid">
                <div className="settings-danger-item">
                  <h3 className="settings-danger-title">Clear profile answers only</h3>
                  <p className="settings-danger-desc">
                    Wipes your Career Profile wizard answers. Keeps your User ID, pass key,
                    and consent record.
                  </p>
                  <button
                    type="button"
                    className="settings-btn settings-btn--warn"
                    onClick={clearProfileOnly}
                    disabled={!hasProfile}
                  >
                    {hasProfile ? "Clear profile answers" : "Nothing to clear"}
                  </button>
                </div>
                <div className="settings-danger-item">
                  <h3 className="settings-danger-title">Delete everything on this device</h3>
                  <p className="settings-danger-desc">
                    Removes profile answers, User ID, pass key, consent, and session flags
                    from this browser.
                  </p>
                  <button
                    type="button"
                    className="settings-btn settings-btn--danger"
                    onClick={clearEverything}
                  >
                    Delete all my data
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

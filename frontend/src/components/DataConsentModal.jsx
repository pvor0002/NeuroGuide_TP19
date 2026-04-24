import { useState } from "react";

const CONSENT_STORAGE_KEY = "ng_data_consent_v1";
const USER_CREDENTIALS_STORAGE_KEY = "ng_local_user_credentials_v1";

function generateUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const alphabet = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function generatePassKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function hasExistingConsent() {
  try {
    return Boolean(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export default function DataConsentModal() {
  const [show, setShow] = useState(() => !hasExistingConsent());
  const [understood, setUnderstood] = useState(false);
  const [warning, setWarning] = useState("");
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!show) return null;

  const saveConsent = (status) => {
    const payload = { status, acknowledgedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* localStorage unavailable */
    }
  };

  const decline = () => {
    saveConsent("declined");
    setShow(false);
  };

  const accept = () => {
    if (!understood) {
      setWarning("Please tick the checkbox to confirm you understand before continuing.");
      return;
    }
    const createdAt = new Date().toISOString();
    const userId = generateUserId();
    const passKey = generatePassKey();
    const credentialPayload = {
      userId,
      passKey,
      createdAt,
    };
    try {
      window.localStorage.setItem(USER_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentialPayload));
    } catch {
      /* localStorage unavailable */
    }
    saveConsent("accepted");
    setGenerated(credentialPayload);
    setWarning("");
  };

  const copyPassKey = async () => {
    if (!generated?.passKey || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(generated.passKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="ng-consent-overlay" role="dialog" aria-modal="true" aria-labelledby="ng-consent-title">
      <div className="ng-consent-modal">
        {!generated ? (
          <>
            <h2 id="ng-consent-title" className="ng-consent-title">
              Before you continue
            </h2>
            <p className="ng-consent-text">
              NeuroGuide stores your <strong>profile answers</strong> and <strong>simplified job history</strong> in this browser so your progress is saved.
            </p>
            <p className="ng-consent-text">
              We do <strong>not</strong> store personal contact details (<strong>email</strong> or <strong>phone</strong>), and we do
              <strong> not</strong> use your data for anything else.
            </p>
            <div className="ng-consent-check-wrap">
              <label className="ng-consent-check">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                <span>
                  I <strong>understand</strong> this data usage and <strong>consent</strong> to continue.
                </span>
              </label>
            </div>
            {warning ? (
              <p className="ng-consent-warning" role="alert">
                {warning}
              </p>
            ) : null}
            <div className="ng-consent-actions">
              <button type="button" className="ng-consent-btn ng-consent-btn--ghost" onClick={decline}>
                Decline
              </button>
              <button type="button" className="ng-consent-btn ng-consent-btn--primary" onClick={accept}>
                Accept and continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="ng-consent-title">Save these recovery details</h2>
            <p className="ng-consent-text">
              Your <strong>pass key</strong> is ready. Keep it safe. You will need this key to access your saved data later.
            </p>
            <div className="ng-consent-passkey-box" aria-label="Generated pass key">
              {generated.passKey}
            </div>
            <div className="ng-consent-actions ng-consent-actions--passkey">
              <button type="button" className="ng-consent-btn ng-consent-btn--ghost" onClick={copyPassKey}>
                {copied ? "Copied" : "Copy pass key"}
              </button>
            </div>
            <p className="ng-consent-warning">
              <strong>Write this pass key down</strong> or memorize it before you continue.
            </p>
            <div className="ng-consent-actions">
              <button type="button" className="ng-consent-btn ng-consent-btn--primary" onClick={() => setShow(false)}>
                I saved it, continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

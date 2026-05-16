import UserIdEntryBox from "./UserIdEntryBox.jsx";

/**
 * Returning-user pass key screen (Career Profile wizard + Simplify).
 * Shared layout and copy rhythm; page-specific labels via props.
 */
export default function LoginGateScreen({
  titleId,
  mainClassName = "",
  onPassKeySubmit,
  secondaryLabel,
  onSecondaryClick,
  footnote,
}) {
  return (
    <main
      className={["login-gate", mainClassName].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <section className="login-gate-card" role="region">
        <header className="login-gate-header">
          <p className="login-gate-eyebrow">Welcome back</p>
          <h1 id={titleId} className="login-gate-title">
            Sign in with your pass key
          </h1>
          <p className="login-gate-sub">
            Enter the 8-character code we gave you. We&apos;ll restore your saved work in this
            browser.
          </p>
        </header>

        <UserIdEntryBox
          variant="login-gate"
          onSubmit={onPassKeySubmit}
          defaultOpen
          showToggle={false}
          submitLabel="Load profile"
        />

        <div className="login-gate-divider" role="separator" aria-label="or">
          <span>or</span>
        </div>

        <button type="button" className="login-gate-secondary" onClick={onSecondaryClick}>
          {secondaryLabel}
        </button>

        {footnote ? <p className="login-gate-foot">{footnote}</p> : null}
      </section>
    </main>
  );
}

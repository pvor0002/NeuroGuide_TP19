export default function ReadinessBar({ value, labelText }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0));

  return (
    <div className="ip-readiness">
      <div className="ip-readiness__top">
        <span id="ip-readiness-label">Answer readiness</span>
        <span className="ip-readiness__badge" aria-live="polite">
          {labelText}
        </span>
      </div>
      <div
        className="ip-readiness__track"
        role="progressbar"
        aria-labelledby="ip-readiness-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
      >
        <div className="ip-readiness__fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/**
 * Experience vs posting requirement — supportive copy only (no scoring internals).
 */

export function ExperienceMatchPanel({ experienceFit }) {
  const status = experienceFit?.status ?? "good";
  const headline = experienceFit?.label ?? "Good match";
  const message = experienceFit?.message ?? "";
  const req = experienceFit?.required_years;
  const userY = experienceFit?.user_years;

  const detailParts = [];
  if (typeof userY === "number") {
    detailParts.push(`About ${userY} years in your profile band`);
  }
  if (typeof req === "number") {
    detailParts.push(`Posting asks roughly ${req}+ years`);
  }
  const detail = detailParts.length ? detailParts.join(" · ") : null;

  let bodyCopy = message;
  if (!bodyCopy) {
    if (typeof req !== "number") {
      bodyCopy =
        status === "good"
          ? "This posting didn’t spell out a fixed years-of-experience bar. We still weigh skills and fit."
          : "";
    } else if (status === "good") {
      bodyCopy = "Your experience band looks workable for what this posting asks.";
    }
  }

  return (
    <div className={`jsc-exp-fit jsc-exp-fit--${status}`} role="region" aria-label="Experience match">
      <div className="jsc-exp-fit-head">
        <div className="jsc-exp-fit-titles">
          <span className="jsc-exp-fit-headline">{headline}</span>
          {detail ? <span className="jsc-exp-fit-detail">{detail}</span> : null}
        </div>
      </div>
      <p className="jsc-exp-fit-copy">{bodyCopy}</p>
    </div>
  );
}

export default ExperienceMatchPanel;

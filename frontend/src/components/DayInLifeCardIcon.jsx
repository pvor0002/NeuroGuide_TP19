/**
 * Decorative circular icons for Day in the Life timeline cards
 * (teal / blue / purple ring + soft inner disc, simple line art).
 */

const VARIANTS = [
  {
    key: "rocket",
    ring: "#14b8a6",
    inner: "#ccfbf1",
    label: "Kickoff or momentum",
  },
  {
    key: "camera",
    ring: "#2563eb",
    inner: "#dbeafe",
    label: "Creative or visual work",
  },
  {
    key: "notebook",
    ring: "#9333ea",
    inner: "#ede9fe",
    label: "Planning or notes",
  },
  {
    key: "monitor",
    ring: "#0d9488",
    inner: "#ccfbf1",
    label: "Screen or deep work",
  },
  {
    key: "phone",
    ring: "#1d4ed8",
    inner: "#bfdbfe",
    label: "Calls or messages",
  },
  {
    key: "paper-plane",
    ring: "#7c3aed",
    inner: "#ede9fe",
    label: "Wrap-up or outreach",
  },
];

const INK = "#1a1714";

function IconArt({ variant }) {
  switch (variant) {
    case 0:
      return (
        <g stroke={INK} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 31l8-16 2 8 8 3-18 5z" fill={INK} fillOpacity="0.08" />
          <path d="M18 31l8-16 2 8 8 3-18 5z" fill="none" />
          <path d="M22 27l2-5" opacity="0.55" />
        </g>
      );
    case 1:
      return (
        <g fill="none" stroke={INK} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <rect x="14" y="16" width="20" height="14" rx="2" />
          <circle cx="24" cy="23" r="4.5" />
          <path d="M18 16v-2a2 2 0 012-2h8a2 2 0 012 2v2" />
        </g>
      );
    case 2:
      return (
        <g fill="none" stroke={INK} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <rect x="15" y="13" width="11" height="22" rx="1" />
          <path d="M17.5 17h6M17.5 20h6M17.5 23h5" />
          <path d="M29 14v20" strokeWidth="1.6" />
          <path d="M30.5 14l-3 1.5v17l3 1.5" />
        </g>
      );
    case 3:
      return (
        <g fill="none" stroke={INK} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <rect x="11" y="15" width="26" height="16" rx="2" />
          <path d="M24 31v3M19 34h10" />
          <rect x="25" y="21" width="9" height="7" rx="1" />
        </g>
      );
    case 4:
      return (
        <g fill="none" stroke={INK} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <rect x="17" y="16" width="14" height="18" rx="3" />
          <path d="M21 19h6" opacity="0.5" />
          <circle cx="24" cy="26" r="1.8" fill={INK} />
        </g>
      );
    default:
      return (
        <g fill="none" stroke={INK} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 30l10-18 4 8 8 3-18 7z" fill={INK} fillOpacity="0.08" />
          <path d="M14 30l10-18 4 8 8 3-18 7z" />
          <path d="M24 20l2 4" />
        </g>
      );
  }
}

export function DayInLifeCardIcon({ variant = 0, className = "" }) {
  const v = VARIANTS[variant % VARIANTS.length] ?? VARIANTS[0];
  return (
    <span className={`dil-card-icon ${className}`.trim()} title={v.label} aria-hidden="true">
      <svg
        className="dil-card-icon__svg"
        viewBox="0 0 48 48"
        width="48"
        height="48"
        focusable="false"
      >
        <circle cx="24" cy="24" r="21" fill="none" stroke={v.ring} strokeWidth="4" opacity="0.95" />
        <circle cx="24" cy="24" r="15.5" fill={v.inner} stroke={INK} strokeWidth="0.85" opacity="0.98" />
        <IconArt variant={variant % VARIANTS.length} />
      </svg>
    </span>
  );
}

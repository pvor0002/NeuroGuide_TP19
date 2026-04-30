/** Stroke icons — use `currentColor` for career-wizard-aligned palette inside parent. */

const sw = 1.75;

function svgAttrs(className = "", passthrough = {}) {
  const { className: c2, "aria-hidden": ariaHidden = true, ...rest } = passthrough;
  return {
    ...rest,
    className: ["simplify-line-icon", className, c2].filter(Boolean).join(" ").trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": ariaHidden,
  };
}

export function SimplifyLineIcon({ name, className = "", ...rest }) {
  const base = svgAttrs(className, rest);

  switch (name) {
    case "bolt":
      return (
        <svg {...base}>
          <path
            d="M13 2L5 13.25h5.25L10 21l9-13.25h-5.2L16 2H13z"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "mapPin":
      return (
        <svg {...base}>
          <path
            d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.25" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...base}>
          <path
            d="M9 9V8a2 2 0 012-2h2a2 2 0 012 2v1"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <rect x="3" y="9" width="18" height="11" rx="2" stroke="currentColor" strokeWidth={sw} />
          <path d="M12 13v4" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "tools":
      return (
        <svg {...base}>
          <path
            d="M14.62 14.61a4.06 4.06 0 01-6.73-5.71L16.6 7.94l1.94 1.95-9.93 9.93a3.94 3.94 0 01-6.71-5.71c.34-.53.73-1 1.2-1.46l9.93-10"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...base}>
          <rect x="7" y="5" width="10" height="16" rx="2" stroke="currentColor" strokeWidth={sw} />
          <path d="M9 5V4a2 2 0 012-2h2a2 2 0 012 2v1" stroke="currentColor" strokeWidth={sw} />
          <path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "alert":
      return (
        <svg {...base}>
          <path
            d="M12 9v4"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r=".9" fill="currentColor" />
          <path
            d="M11.53 4.72L4.54 17.92A1.73 1.73 0 006.06 21h11.88a1.73 1.73 0 001.53-3.08L12.47 4.72a1.73 1.73 0 00-3.06 0z"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bookOpen":
      return (
        <svg {...base}>
          <path
            d="M4 19V6a3 3 0 013-3h12v17h-12a4 4 0 01-4-4zm0 0v-10a4 4 0 014-4h12"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "listOrdered":
      return (
        <svg {...base}>
          <path d="M10 7h11M10 12h11M10 17h11" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <path
            d="M4 6.5v-1m0 5.55h.008M4 12h.013M4 16.54V18"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <circle cx="4" cy="16.54" r="1.85" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...base}>
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3M5 5l2.2 2.2M16.8 16.8L19 19M19 5l-2.2 2.2M5 19l2.2-2.2"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "milestones":
      return (
        <svg {...base}>
          <circle cx="5" cy="7" r="2.25" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 7h13" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <circle cx="12" cy="17" r="2.25" stroke="currentColor" strokeWidth={sw} />
          <path d="M5 9v6h7" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...base}>
          <path d="M6 4h12v17l-6-4-6 4V4z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
  }
}

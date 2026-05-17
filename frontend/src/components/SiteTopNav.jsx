import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NeuroBrandFlower } from "./NeuroBrandFlower.jsx";

const SETTINGS_ICON_SRC = new URL("../../setting.png", import.meta.url).href;

function SettingsCogIcon() {
  return <img src={SETTINGS_ICON_SRC} alt="" aria-hidden="true" />;
}

function SavedInsightsDropdown({ navId, closeMobileMenu }) {
  const location = useLocation();
  const [savedMenuOpen, setSavedMenuOpen] = useState(false);
  const savedDropdownRef = useRef(null);
  const savedMenuHtmlId = `${navId}-saved-menu`;
  const savedInsightsActive =
    location.pathname.startsWith("/saved-insights") || location.pathname.startsWith("/saved-results");

  useEffect(() => {
    if (!savedMenuOpen) return;
    const onDoc = (e) => {
      if (savedDropdownRef.current && !savedDropdownRef.current.contains(e.target)) {
        setSavedMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setSavedMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [savedMenuOpen]);

  const closeSavedMenu = () => setSavedMenuOpen(false);

  return (
    <div
      ref={savedDropdownRef}
      className={`site-nav-dropdown ${savedMenuOpen ? "is-open" : ""}`}
    >
      <button
        type="button"
        className={`site-nav-dropdown-trigger ${savedInsightsActive ? "site-nav-dropdown-trigger--current" : ""}`}
        aria-expanded={savedMenuOpen}
        aria-haspopup="true"
        aria-controls={savedMenuHtmlId}
        onClick={() => setSavedMenuOpen((v) => !v)}
      >
        Saved Insights
        <span className="site-nav-dropdown-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div
        id={savedMenuHtmlId}
        className="site-nav-dropdown-panel"
        role="menu"
        aria-hidden={!savedMenuOpen}
      >
        <Link
          to="/saved-insights/scores"
          role="menuitem"
          className="site-nav-dropdown-item"
          aria-current={location.pathname === "/saved-insights/scores" ? "page" : undefined}
          onClick={() => {
            closeSavedMenu();
            closeMobileMenu();
          }}
        >
          My saved scores
        </Link>
        <Link
          to="/saved-insights/day-in-life"
          role="menuitem"
          className="site-nav-dropdown-item"
          aria-current={location.pathname === "/saved-insights/day-in-life" ? "page" : undefined}
          onClick={() => {
            closeSavedMenu();
            closeMobileMenu();
          }}
        >
          Saved day in the life
        </Link>
        <Link
          to="/saved-insights/interview"
          role="menuitem"
          className="site-nav-dropdown-item"
          aria-current={location.pathname === "/saved-insights/interview" ? "page" : undefined}
          onClick={() => {
            closeSavedMenu();
            closeMobileMenu();
          }}
        >
          Saved interview Q/A
        </Link>
      </div>
    </div>
  );
}

const HOME_NAV_COMPACT_SCROLL_PX = 56;

export default function SiteTopNav() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [homeBrandCompact, setHomeBrandCompact] = useState(() =>
    typeof window !== "undefined" && location.pathname === "/" ? window.scrollY < HOME_NAV_COMPACT_SCROLL_PX : false,
  );
  const navId = useId();

  useEffect(() => {
    let innerId;
    const outerId = requestAnimationFrame(() => {
      setBrandFlowerActive(false);
      innerId = requestAnimationFrame(() => setBrandFlowerActive(true));
    });
    return () => {
      cancelAnimationFrame(outerId);
      if (innerId !== undefined) cancelAnimationFrame(innerId);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!isHome) return undefined;
    const sync = () => {
      setHomeBrandCompact(window.scrollY < HOME_NAV_COMPACT_SCROLL_PX);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, [isHome]);

  const closeMobileMenu = () => setMobileNavOpen(false);

  const headerClass = [
    "site-nav-header",
    isHome && homeBrandCompact ? "site-nav-header--home-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={headerClass}>
      <div className="site-nav-inner">
        <Link to="/" className="site-nav-brand-link" aria-label="NeuroGuide home" onClick={closeMobileMenu}>
          <div className="home-sticky-bar-brand">
            <NeuroBrandFlower svgClassName="home-sticky-bar-mark site-nav-mark" animationActive={brandFlowerActive} />
            <div className="home-sticky-bar-copy">
              <span className="home-sticky-bar-kicker">NeuroGuide</span>
              <span className="home-sticky-bar-extra" aria-hidden={isHome && homeBrandCompact ? true : undefined}>
                <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
                <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
              </span>
            </div>
          </div>
        </Link>

        <button
          type="button"
          className="site-nav-toggle"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileNavOpen}
          aria-controls={navId}
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id={navId} className={`site-nav-links ${mobileNavOpen ? "is-open" : ""}`} aria-label="Main">
          <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined} onClick={closeMobileMenu}>
            Home
          </Link>
          <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined} onClick={closeMobileMenu}>
            Career Profile
          </Link>
          <Link to="/simplify-job-description" aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined} onClick={closeMobileMenu}>
            Simplify Job Description
          </Link>
          <Link to="/day-in-life" aria-current={location.pathname === "/day-in-life" ? "page" : undefined} onClick={closeMobileMenu}>
            Day in the Life
          </Link>
          <Link
            to="/interview-prep"
            aria-current={location.pathname.startsWith("/interview-prep") ? "page" : undefined}
            onClick={closeMobileMenu}
          >
            Interview Prep
          </Link>
          <SavedInsightsDropdown key={location.pathname} navId={navId} closeMobileMenu={closeMobileMenu} />
          <Link to="/settings" aria-current={location.pathname === "/settings" ? "page" : undefined} className="site-nav-settings-link" aria-label="Settings" onClick={closeMobileMenu}>
            <span className="site-nav-settings-text">Settings</span>
            <span className="site-nav-settings-icon" aria-hidden="true">
              <SettingsCogIcon />
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

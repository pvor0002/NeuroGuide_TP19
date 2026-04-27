import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NeuroBrandFlower } from "./NeuroBrandFlower.jsx";

const SETTINGS_ICON_SRC = new URL("../../setting.png", import.meta.url).href;

function SettingsCogIcon() {
  return <img src={SETTINGS_ICON_SRC} alt="" aria-hidden="true" />;
}

export default function SiteTopNav() {
  const location = useLocation();
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <header className="site-nav-header">
      <div className="site-nav-inner">
        <Link to="/" className="site-nav-brand-link" aria-label="NeuroGuide home">
          <div className="home-sticky-bar-brand">
            <NeuroBrandFlower svgClassName="home-sticky-bar-mark site-nav-mark" animationActive={brandFlowerActive} />
            <div className="home-sticky-bar-copy">
              <span className="home-sticky-bar-kicker">NeuroGuide</span>
              <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
              <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
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
          <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>
            Home
          </Link>
          <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined}>
            Career Profile
          </Link>
          <Link to="/simplify-job-description" aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined}>
            Simplify Job Description
          </Link>
          <Link to="/interview-prep" aria-current={location.pathname === "/interview-prep" ? "page" : undefined}>
            Interview Prep
          </Link>
          <Link to="/settings" aria-current={location.pathname === "/settings" ? "page" : undefined} className="site-nav-settings-link" aria-label="Settings">
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

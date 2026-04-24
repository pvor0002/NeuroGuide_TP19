import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NeuroBrandFlower } from "./NeuroBrandFlower.jsx";

/**
 * Shared top bar for app-style pages (Career Profile, Simplify Job Description, etc.):
 * brand + the same site nav as the marketing header, with profile visual tokens.
 */
export default function SiteAppHeader() {
  const location = useLocation();
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);

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

  return (
    <header className="topbar">
      <div className="brand-wrap">
        <Link to="/" className="profile-header-brand-link" aria-label="NeuroGuide home">
          <div className="home-sticky-bar-brand">
            <NeuroBrandFlower svgClassName="home-sticky-bar-mark" animationActive={brandFlowerActive} />
            <div className="home-sticky-bar-copy">
              <span className="home-sticky-bar-kicker">NeuroGuide</span>
              <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
              <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
            </div>
          </div>
        </Link>
        <nav className="profile-top-nav" aria-label="Site">
          <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>
            Home
          </Link>
          <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined}>
            Career Profile
          </Link>
          <Link
            to="/simplify-job-description"
            aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined}
          >
            Simplify Job Description
          </Link>
          <Link
            to="/interview-prep"
            aria-current={location.pathname === "/interview-prep" ? "page" : undefined}
          >
            Interview Prep
          </Link>
          <Link
            to="/settings"
            aria-current={location.pathname === "/settings" ? "page" : undefined}
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}

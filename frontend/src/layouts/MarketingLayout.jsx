import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";

function AppHeader() {
  const location = useLocation();
  const [brandFlowerActive, setBrandFlowerActive] = useState(false);

  useEffect(() => {
    setBrandFlowerActive(false);
    const id = requestAnimationFrame(() => setBrandFlowerActive(true));
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/" className="marketing-header-brand-link" aria-label="NeuroGuide home">
          <div className="home-sticky-bar-brand">
            <NeuroBrandFlower svgClassName="home-sticky-bar-mark" animationActive={brandFlowerActive} />
            <div className="home-sticky-bar-copy">
              <span className="home-sticky-bar-kicker">NeuroGuide</span>
              <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
              <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
            </div>
          </div>
        </Link>
        <nav className="primary-nav" aria-label="Main">
          <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>
            Home
          </Link>
          <Link to="/profile" aria-current={location.pathname === "/profile" ? "page" : undefined}>
            Profile builder
          </Link>
          <Link
            to="/simplify-job-description"
            aria-current={location.pathname === "/simplify-job-description" ? "page" : undefined}
          >
            Simplify Job Description
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-tagline">Where clarity meets opportunity</p>
        <p className="site-footer-note">
          NeuroGuide: employment support with job descriptions that are easier to read and act on.
        </p>
      </div>
    </footer>
  );
}

export default function MarketingLayout() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isSimplify = location.pathname === "/simplify-job-description";

  const mainClass = [isHome && "main--bleed", isSimplify && "main--simplify"].filter(Boolean).join(" ") || undefined;

  return (
    <div className="marketing-app layout">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {!isHome ? <AppHeader /> : null}
      <main id="main-content" className={mainClass}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

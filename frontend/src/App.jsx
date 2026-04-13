/**
 * Root layout and route table for NeuroGuide.
 *
 * This file controls your app’s layout and navigation 
 * it decides which page to show based on the URL and adds a header and footer around it.
 *
 * @file
 */

import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import SimplifyJobDescriptionPage from "./pages/SimplifyJobDescriptionPage.jsx";

/** Top bar with brand and main nav; highlights the active route for accessibility. */
function AppHeader() {
  const location = useLocation();
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          NeuroGuide
        </Link>
        <nav className="primary-nav" aria-label="Main">
          <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined}>
            Home
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

/** Footer shown on every page with a short product note. */
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-tagline">Where clarity meets opportunity</p>
        <p className="site-footer-note">
          NeuroGuide: Understand jobs. Move forward with confidence.
        </p>
      </div>
    </footer>
  );
}

/** Wires routes, optional header, main landmark, and footer into one layout shell. */
export default function App() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isSimplify = location.pathname === "/simplify-job-description";

  const mainClass = [isHome && "main--bleed", isSimplify && "main--simplify"].filter(Boolean).join(" ") || undefined;

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {!isHome ? <AppHeader /> : null}
      <main id="main-content" className={mainClass}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/simplify-job-description" element={<SimplifyJobDescriptionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

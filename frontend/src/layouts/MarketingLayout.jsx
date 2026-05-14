/**
 *
 * Shared page shell for all routes nested under "/" in App.jsx.
 *
 * Responsibilities:
 *  - Renders SiteTopNav at the top of every page (Home, Simplify, Interview Prep, etc.)
 *  - Renders SiteFooter at the bottom of every page
 *    renders between the nav and footer
 *
 * Pages that do NOT use this layout (e.g. ProfileWizardPage at /profile) are
 * registered as standalone routes in App.jsx and render without nav or footer.
 */

import { Outlet, useLocation } from "react-router-dom";
import SiteTopNav from "../components/SiteTopNav.jsx";

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-tagline">Where clarity meets opportunity</p>
        <p className="site-footer-note">
          NeuroGuide supports job search and interviews with clearer postings, a guided profile, and plain step-by-step flows.
        </p>
      </div>
    </footer>
  );
}

export default function MarketingLayout() {
  const location = useLocation();

  // Flags used to pick the right CSS class for <main> based on the current route
  const isHome = location.pathname === "/";
  const isSimplify = location.pathname === "/simplify-job-description";
  const isDayInLife = location.pathname === "/day-in-life";
  const isInterviewPrep = location.pathname === "/interview-prep";
  const isSavedInsights =
    location.pathname.startsWith("/saved-insights") || location.pathname.startsWith("/saved-results");

  // Build the className string for <main>:
  // main--bleed    → removes horizontal padding so the page content spans full width
  // main--simplify → custom constrained width for the job description simplifier
  // undefined      → falls back to the default centred layout in shared.css
  const mainClass = [
    isHome && "main--bleed",
    isSimplify && "main--simplify",
    (isDayInLife || isInterviewPrep || isSavedInsights) && "main--bleed",
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div className="marketing-app layout">
      {/* Accessibility: lets keyboard/screen-reader users skip straight to page content */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteTopNav />
      {/* <Outlet /> is where React Router renders the matched child page component */}
      <main id="main-content" className={mainClass}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

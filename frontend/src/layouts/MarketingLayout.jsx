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
  const isHome = location.pathname === "/";
  const isSimplify = location.pathname === "/simplify-job-description";
  const isDayInLife = location.pathname === "/day-in-life";
  const isInterviewPrep = location.pathname === "/interview-prep";
  const isSavedInsights =
    location.pathname.startsWith("/saved-insights") || location.pathname.startsWith("/saved-results");

  const mainClass = [
    isHome && "main--bleed",
    isSimplify && "main--simplify",
    (isDayInLife || isInterviewPrep || isSavedInsights) && "main--bleed",
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div className="marketing-app layout">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteTopNav />
      <main id="main-content" className={mainClass}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

import { Link } from "react-router-dom";

function ChipIcon({ children }) {
  return (
    <span className="home-hero-redesign__chip-icon" aria-hidden="true">
      {children}
    </span>
  );
}

/**
 * Home landing hero (below SiteTopNav) — matches landing_redesign mockup.
 */
export default function HomeHeroRedesign() {
  return (
    <section className="home-hero-redesign" aria-labelledby="home-hero-redesign-title">
      <div className="home-hero-redesign__accent" aria-hidden="true" />
      <div className="home-hero-redesign__bg" aria-hidden="true" />
      <div className="home-hero-redesign__grain" aria-hidden="true" />

      <div className="home-hero-redesign__grid">
        <div className="home-hero-redesign__left">
          <p className="home-hero-redesign__pill">Built for ADHD minds in IT careers</p>

          <h1 id="home-hero-redesign-title" className="home-hero-redesign__headline">
            Ever read a job
            <br />
            description and felt
            <br />
            <em>completely lost?</em>
          </h1>

          <p className="home-hero-redesign__sub">
            NeuroGuide turns dense postings into plain language, a personal fit score, and guided interview prep, one calm step at a time.
          </p>

          <ul className="home-hero-redesign__chips" aria-label="What NeuroGuide offers">
            <li>
              <span className="home-hero-redesign__chip">
                <ChipIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </ChipIcon>
                Simplified job descriptions
              </span>
            </li>
            <li>
              <span className="home-hero-redesign__chip">
                <ChipIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </ChipIcon>
                Personal fit score
              </span>
            </li>
            <li>
              <span className="home-hero-redesign__chip">
                <ChipIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </ChipIcon>
                Interview prep coaching
              </span>
            </li>
            <li>
              <span className="home-hero-redesign__chip">
                <ChipIcon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </ChipIcon>
                Job Work Style - Day in the Life
              </span>
            </li>
          </ul>
        </div>

        <div className="home-hero-redesign__right">
          <div className="home-hero-redesign__right-main">
            <div className="home-hero-redesign__right-stack">
              <div className="home-hero-redesign__brand">
                <p className="home-hero-redesign__brand-name">NEUROGUIDE</p>
                <p className="home-hero-redesign__brand-headline">Where clarity meets opportunity</p>
                <p className="home-hero-redesign__brand-desc">
                  Simplifying jobs and interviews for the way your mind works
                </p>
              </div>

              <div className="home-hero-redesign__cta-card">
                <div className="home-hero-redesign__cta-text">
                  <p className="home-hero-redesign__cta-eyebrow">Start here</p>
                  <p className="home-hero-redesign__cta-title">
                    Paste a job post,
                    <br />
                    get instant clarity
                  </p>
                </div>
                <Link to="/simplify-job-description" className="home-hero-redesign__cta-btn">
                  Try it now →
                </Link>
              </div>
            </div>
          </div>

          <a href="#home-main-start" className="home-hero-redesign__scroll">
            <span>See how it works</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v13M12 17l-5-5M12 17l5-5" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

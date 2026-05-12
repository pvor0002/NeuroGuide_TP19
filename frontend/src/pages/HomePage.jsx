import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const HERO_WORDMARK_PETALS = [0, 45, 90, 135];

function HeroWordmarkIcon({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      {HERO_WORDMARK_PETALS.map((deg) => (
        <ellipse
          key={deg}
          cx="20"
          cy="8"
          rx="2.2"
          ry="6"
          fill="currentColor"
          transform={`rotate(${deg} 20 20)`}
        />
      ))}
    </svg>
  );
}

//These constants store image paths used throughout the homepage.
const heroBg = "/images/hero-background.png";
const sectionImage =
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=80";
const FOCUS_VISUALS = [
  {
    src: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=960&q=75",
    alt: "Professional reviewing structured notes on a laptop in a bright office",
    title: "Scan",
    caption:
      "What you’ll do, skills you need, nice-to-haves, and what the role offers each in its own short section.",
  },
  {
    src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=960&q=75",
    alt: "Organized desk with laptop, notebook, and coffee for comparing role details",
    title: "Compare",
    caption: "Role, tasks, and skills in one view.",
  },
  {
    src: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=960&q=75",
    alt: "Two professionals shaking hands across a desk after reviewing a fit",
    title: "Decide",
    caption: "Know if it fits you, then invest your time.",
  },
];

// Four-step "How NeuroGuide works" flow shown on the home page.
// Each step renders an inline SVG icon (Feather-style, stroke-based) so
// we don't pull in a dependency or extra image requests.
const HOW_IT_WORKS = [
  {
    id: "profile",
    label: "Set up",
    title: "Build your Career Profile",
    description:
      "Tell us how your brain works best - focus profile, support preferences, and the skills you bring. No resume needed.",
    to: "/profile",
    linkLabel: "Start your profile",
    // Person + subtle flower petals around the head - stylised "you"
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="24" cy="18" r="6" />
        <path d="M10 40c2-7 8-11 14-11s12 4 14 11" />
        <circle cx="24" cy="18" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "paste",
    label: "Paste",
    title: "Drop in any job post",
    description:
      "Paste a dense job ad or upload a file. Long paragraphs, jargon, and buzzwords welcome - we take it as-is.",
    to: "/simplify-job-description",
    linkLabel: "Open simplifier",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 8h14l8 8v24a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
        <path d="M28 8v8h8" />
        <path d="M18 24h12M18 30h12M18 36h8" />
      </svg>
    ),
  },
  {
    id: "simplify",
    label: "Simplify",
    title: "Read a calmer version",
    description:
      "Get the posting split into short, scannable sections - what you'll do, what you need, and what's on offer.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 28h20M14 22h20M14 16h14" />
        <path d="M36 8l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
        <path d="M10 38l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    ),
  },
  {
    id: "score",
    label: "Compare",
    title: "See your fit score",
    description:
      "We match the role against your profile, score the fit, and line it up next to your last two postings so you can compare.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 38V22" />
        <path d="M22 38V14" />
        <path d="M34 38V26" />
        <path d="M6 42h38" />
        <circle cx="22" cy="10" r="3" />
      </svg>
    ),
  },
];

const DATA_SOURCES = [
  {
    iconSrc: "/images/datasets/au-jobs-skills-taxonomy.png",
    name: "Australian Jobs & Skills Taxonomy",
    href: "https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles",
    note: "Official occupation and industry profiles",
  },
  {
    iconSrc: "/images/datasets/adhd-task-productivity.png",
    name: "ADHD Task Productivity Dataset",
    href: "https://www.kaggle.com/datasets/nisaaas/adhd-task-productivity-csv",
    note: "Kaggle open dataset (CSV)",
  },
  {
    iconSrc: "/images/datasets/adhd-4-class.png",
    name: "ADHD 4-Class Dataset",
    href: "https://www.kaggle.com/datasets/a7md19/adhd-dataset-4-classes-u2",
    note: "Kaggle open dataset (4-class labels)",
  },
];

export default function HomePage() {
  const howStepsRef = useRef(null);
  const [howRevealed, setHowRevealed] = useState(false);

  useEffect(() => {
    const target = howStepsRef.current;
    if (!target || howRevealed) return undefined;

    // Fallback for browsers without IntersectionObserver - reveal immediately.
    if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHowRevealed(true);
      return undefined;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHowRevealed(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [howRevealed]);

  return (
    <div className="home">
      <section className="home-hero home-hero--split" aria-labelledby="home-hero-title">
        <img
          src={heroBg}
          alt=""
          className="home-hero-bg-img"
          width={1920}
          height={1080}
          decoding="async"
          fetchPriority="high"
        />
        <div className="home-hero-copy">
            <div className="home-hero-copy-card">
              <p className="home-hero-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Built for ADHD minds in IT careers
              </p>
              <h1 id="home-hero-title" className="home-hero-title--split">
                Ever read a job
                <br />
                description and felt
                <br />
                <em>completely lost?</em>
              </h1>
              <p className="home-hero-lead--split">
                NeuroGuide simplifies the jargon, shows how well you fit, and guides your interview prep, one clear step at a time.
              </p>
              <ul className="home-hero-chips" aria-label="What NeuroGuide offers">
                <li>
                  <span className="home-hero-chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Simplified Job Descriptions
                  </span>
                </li>
                <li>
                  <span className="home-hero-chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    Personal Fit Score
                  </span>
                </li>
                <li className="home-hero-chips-row-break">
                  <span className="home-hero-chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    Interview Confidence Coaching
                  </span>
                </li>
              </ul>
              <a href="#home-main-start" className="home-hero-how-link">
                See how it works
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        <div className="home-hero-visual">
            <div className="home-hero-brand-stack" aria-hidden="true">
              <HeroWordmarkIcon className="home-hero-brand-stack-icon" />
              <span className="home-hero-brand-stack-kicker">NEUROGUIDE</span>
              <p className="home-hero-brand-stack-headline">Where clarity meets opportunity</p>
              <p className="home-hero-brand-stack-tagline">
                Simplifying jobs and interviews for the way your mind works
              </p>
            </div>
          </div>
      </section>

      <section className="home-band home-band--how" id="home-main-start" aria-labelledby="home-how-title">
        <div className="home-band-inner home-band-inner--wide home-how-inner">
          <header className="home-how-head">
            <p className="home-how-eyebrow">How NeuroGuide works</p>
            <h2 id="home-how-title" className="home-section-title home-how-title">
              From dense job post to a fit score - in four calm steps.
            </h2>
            <p className="home-how-lead">
              Built for ADHD brains. Every step is short, scannable, and you
              can pause or come back anytime.
            </p>
          </header>

          <ol
            ref={howStepsRef}
            className={`home-how-steps ${howRevealed ? "is-revealed" : ""}`}
            role="list"
          >
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.id} className="home-how-step">
                <div className="home-how-card">
                  <div className="home-how-number-row">
                    <span className="home-how-number" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="home-how-label">{step.label}</span>
                  </div>
                  <div className="home-how-icon" aria-hidden="true">
                    {step.icon}
                  </div>
                  <h3 className="home-how-step-title">{step.title}</h3>
                  <p className="home-how-step-desc">{step.description}</p>
                  {step.to ? (
                    <Link to={step.to} className="home-how-step-link">
                      {step.linkLabel}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </div>
                {i < HOW_IT_WORKS.length - 1 ? (
                  <span className="home-how-arrow" aria-hidden="true">→</span>
                ) : null}
              </li>
            ))}
          </ol>

          <p className="home-how-note">
            Your answers stay on your device. No account, no resume upload, no personal info leaves the browser.
          </p>
        </div>
      </section>

      <section className="home-band home-band--white home-band--next-split" aria-labelledby="home-next-title">
        <div className="home-band-inner home-band-inner--wide home-next-split-inner">
          <figure className="home-next-figure">
            <img
              src={sectionImage}
              alt="Hands writing notes in a planner on a light wood desk"
              className="home-next-img"
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div className="home-next-copy">
            <h2 id="home-next-title" className="home-section-title home-next-title">
              Looking for what’s next?
            </h2>
            <p className="home-section-lead home-next-lead">
              Start with a posting broken into short, scannable sections. When you are ready, capture how you fit in the guided profile builder.
            </p>
            <div className="home-next-cta home-cta-wrap">
              <Link to="/profile" className="home-btn-peach home-next-cta-equal">
                Build your profile
              </Link>
              <Link to="/simplify-job-description" className="home-btn-peach home-next-cta-equal">
                Simplify job description
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-band home-band--focus" aria-labelledby="home-focus-title">
        <div className="home-band-inner home-band-inner--wide home-focus-inner">
          <header className="home-focus-head">
            <p className="home-focus-eyebrow">ADHD-friendly workflow</p>
            <h2 id="home-focus-title" className="home-section-title home-focus-title">
              Job posts, distilled
            </h2>
          </header>

          <ul className="home-focus-grid">
            {FOCUS_VISUALS.map((item, index) => (
              <li key={item.title} className="home-focus-tile">
                <article className="home-focus-card">
                  <figure className="home-focus-figure">
                    <img
                      src={item.src}
                      alt={item.alt}
                      className="home-focus-img"
                      width={960}
                      height={540}
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption className="home-focus-cap">
                      <span className="home-focus-index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="home-focus-card-title">{item.title}</h3>
                      <p className="home-focus-card-caption">{item.caption}</p>
                    </figcaption>
                  </figure>
                </article>
              </li>
            ))}
          </ul>

          <p className="home-focus-note">Reading tool only-not medical or career advice.</p>
        </div>
      </section>

      <section className="home-band home-band--white home-data" aria-labelledby="home-data-title">
        <div className="home-band-inner home-band-inner--wide">
          <h2 id="home-data-title" className="home-section-title">
            Data sources
          </h2>
          <p className="home-section-lead">
            NeuroGuide uses open datasets to support role and skill suggestions. Links below reference the original sources.
          </p>
          <ul className="home-data-grid" aria-label="Open datasets used">
            {DATA_SOURCES.map((source) => (
              <li key={source.href} className="home-data-item">
                <a
                  className="home-data-card"
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className="home-data-icon"
                    src={source.iconSrc}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    width={64}
                    height={64}
                  />
                  <span className="home-data-copy">
                    <span className="home-data-title">{source.name}</span>
                    <span className="home-data-note">{source.note}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="home-data-footnote">
            Sources are provided for transparency. Dataset licensing and terms remain with the original publishers.
          </p>
        </div>
      </section>

      <section className="home-contact-mini" aria-labelledby="home-contact-mini-title">
        <div className="home-contact-mini-inner">
          <h2 id="home-contact-mini-title" className="home-contact-mini-title">
            Let&apos;s talk talent
          </h2>
          <div className="home-contact-mini-links">
            <a href="#" className="home-contact-mini-link">
              Contact us
            </a>
            <a href="mailto:hello@neuroguide.app" className="home-contact-mini-link">
              Email us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

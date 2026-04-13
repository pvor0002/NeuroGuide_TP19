/**
 * Homepage: hero, CTA, feature photo, visual focus strip, and FAQ.
 *
 * @file
 */

import { Link } from "react-router-dom";

/** Small inline SVG logo used in the hero */
function BrandMark({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      {[0, 45, 90, 135].map((deg) => (
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

/** Local hero background (served from `public/images`). */
const heroBg = "/images/hero-background.png";
/** Feature section photo. */
const sectionImage =
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=80";

/** Visual pillars: one image + a few words each (Unsplash). */
const FOCUS_VISUALS = [
  {
    src: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=960&q=75",
    alt: "Professional reviewing work on a laptop in a bright office",
    title: "Scan",
    caption: "Sections instead of walls of text.",
  },
  {
    src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=960&q=75",
    alt: "Organized desk with laptop, notebook, and coffee",
    title: "Compare",
    caption: "Role, tasks, and skills in one view.",
  },
  {
    src: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=960&q=75",
    alt: "Two professionals shaking hands across a desk",
    title: "Decide",
    caption: "Know if it fits—then invest your time.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is NeuroGuide?",
    a: "NeuroGuide is a small web app focused on employment support. It helps you turn long, dense job postings into shorter, clearer language so you can decide if a role fits before you invest time applying.",
  },
  {
    q: "What does “Simplify Job Description” do?",
    a: "You paste text or upload a supported file. The app returns a structured summary: snapshot of the role, main tasks, skills, nice-to-haves, and what the employer offers. You can edit the pasted text anytime before simplifying again.",
  },
  {
    q: "Is NeuroGuide the same as official career advice or a diagnosis?",
    a: "No. It is a reading and organization tool for job ads. It does not replace recruiters, coaches, or health professionals, and it does not make hiring decisions for you.",
  },
  {
    q: "Where do I start?",
    a: "Use the link in the hero or the button in the section above to open the simplifier, then paste or attach a real posting and run simplify once your text passes the on-page checks.",
  },
];

/** Renders the full landing page layout and internal sections. */
export default function HomePage() {
  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <img src={heroBg} alt="" className="home-hero-img" width={1920} height={1080} decoding="async" fetchPriority="high" />
        <nav className="home-hero-nav" aria-label="Quick links">
          <Link to="/simplify-job-description">Simplify Job Description</Link>
        </nav>
        <div className="home-hero-inner">
          <div className="home-hero-brand">
            <BrandMark className="home-hero-mark" />
            <p className="home-hero-kicker">NeuroGuide</p>
          </div>
          <h1 id="home-hero-title" className="home-hero-title">
            Where clarity meets opportunity
          </h1>
          <p className="home-hero-tagline" role="doc-subtitle">
            Simplifying jobs and interviews for the way your mind works
          </p>
        </div>
      </section>

      <section className="home-band home-band--white" aria-labelledby="home-next-title">
        <div className="home-band-inner">
          <h2 id="home-next-title" className="home-section-title">
            Looking for what’s next?
          </h2>
          <p className="home-section-lead">
            Clear structure. Less scrolling. Decide faster.
          </p>
          <div className="home-cta-wrap">
            <Link to="/simplify-job-description" className="home-btn-peach">
              Simplify Job Description
            </Link>
          </div>
          <figure className="home-feature-figure">
            <img
              src={sectionImage}
              alt="Hands writing notes in a planner on a light wood desk"
              className="home-feature-img"
              width={1600}
              height={900}
              loading="lazy"
            />
          </figure>
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
                      height={720}
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

          <p className="home-focus-note">Reading tool only—not medical or career advice.</p>

          <div className="home-cta-wrap home-focus-cta">
            <Link to="/simplify-job-description" className="home-btn-peach">
              Simplify a posting
            </Link>
          </div>
        </div>
      </section>

      <section className="home-band home-band--cream" aria-labelledby="home-faq-title">
        <div className="home-band-inner home-faq-band-inner">
          <h2 id="home-faq-title" className="home-section-title">
            FAQ
          </h2>
          <p className="home-section-lead home-faq-lead">
            Common questions about how NeuroGuide works and what to expect from the app.
          </p>
          <div className="home-faq-list">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="home-faq-item">
                <summary className="home-faq-q">{item.q}</summary>
                <p className="home-faq-a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

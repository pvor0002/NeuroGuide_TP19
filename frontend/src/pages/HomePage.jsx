import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NeuroBrandFlower } from "../components/NeuroBrandFlower.jsx";

const HERO_PETAL_ANGLES = [0, 45, 90, 135];

function BrandMark({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      {HERO_PETAL_ANGLES.map((deg) => (
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
const cardImgPhone =
  "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=800&q=80";
const cardImgLaptop =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80";
const cardImgPeople =
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80";

const FAQ_ITEMS = [
  {
    id: "faq-what",
    question: "What is NeuroGuide for?",
    answer:
      "NeuroGuide helps you understand job postings and prepare for interviews with shorter prompts, clearer structure, and tools that respect how you focus and process information.",
  },
  {
    id: "faq-profile-storage",
    question: "Where does my profile information go?",
    answer:
      "The guided profile builder saves your answers in this browser so you can pause and come back later. It is not sent to our servers unless you choose to share or export it elsewhere yourself.",
  },
  {
    id: "faq-simplify",
    question: "How does “Simplify Job Description” work?",
    answer:
      "You paste or upload a posting; NeuroGuide asks a backend service to rewrite it into plain sections such as what you will do, skills you need, and what the role offers. You need the API running locally (or deployed) for live simplification.",
  },
  {
    id: "faq-account",
    question: "Do I need an account?",
    answer:
      "No account is required for this prototype. You can explore the home page, try the profile builder, and use Simplify when your environment is connected to the API.",
  },
  {
    id: "faq-accuracy",
    question: "Should I rely on the simplified text alone?",
    answer:
      "Treat simplified output as a reading aid, not legal advice or a substitute for the employer’s official posting. Always confirm details like pay, hours, and requirements with the source listing or the employer.",
  },
];

export default function HomePage() {
  const [stickyVisible, setStickyVisible] = useState(false);

  useEffect(() => {
    const threshold = 64;
    const onScroll = () => {
      setStickyVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="home">
      <header
        className={`home-sticky-bar ${stickyVisible ? "is-visible" : ""}`}
        role="banner"
        aria-hidden={!stickyVisible}
      >
        <div className="home-sticky-bar-inner">
          <div className="home-sticky-bar-brand">
            <NeuroBrandFlower
              svgClassName="home-sticky-bar-mark"
              animationActive={stickyVisible}
            />
            <div className="home-sticky-bar-copy">
              <span className="home-sticky-bar-kicker">NeuroGuide</span>
              <span className="home-sticky-bar-title">Where clarity meets opportunity</span>
              <span className="home-sticky-bar-tagline">Simplifying jobs and interviews for the way your mind works</span>
            </div>
          </div>
          <nav className="home-sticky-bar-nav" aria-label="Quick links">
            <Link to="/profile">Profile builder</Link>
            <Link to="/simplify-job-description">Simplify Job Description</Link>
          </nav>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <img src={heroBg} alt="" className="home-hero-img" width={1920} height={1080} decoding="async" fetchPriority="high" />
        <nav className="home-hero-nav" aria-label="Quick links">
          <Link to="/profile">Profile builder</Link>
          <Link to="/simplify-job-description">Simplify Job Description</Link>
        </nav>
        <div className={`home-hero-inner ${stickyVisible ? "home-hero-inner--dimmed" : ""}`}>
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
            Find your next role and take the leap: start with a posting you can actually read, then explore what fits.
          </p>
          <div className="home-cta-wrap">
            <Link to="/profile" className="home-btn-peach home-btn-peach--secondary">
              Build your profile
            </Link>
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

      <section className="home-band home-band--cream" aria-labelledby="home-contact-title">
        <div className="home-band-inner home-band-inner--wide">
          <h2 id="home-contact-title" className="home-section-title">
            Let’s talk talent
          </h2>
          <div className="home-card-grid">
            <article className="home-card">
              <img src={cardImgPhone} alt="" className="home-card-img" width={800} height={520} loading="lazy" />
              <div className="home-card-body">
                <h3 className="home-card-title">Contact Us</h3>
                
              </div>
            </article>
            <article className="home-card">
              <img src={cardImgLaptop} alt="" className="home-card-img" width={800} height={520} loading="lazy" />
              <div className="home-card-body">
                <h3 className="home-card-title">Email Us</h3>
                
              </div>
            </article>
            <article className="home-card">
              <img src={cardImgPeople} alt="" className="home-card-img" width={800} height={520} loading="lazy" />
              <div className="home-card-body">
                <h3 className="home-card-title">
                  <span className="home-pin" aria-hidden="true">
                    📍
                  </span>{" "}
                  Visit Us
                </h3>
               
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="home-band home-band--white home-faq" aria-labelledby="home-faq-title">
        <div className="home-band-inner home-band-inner--wide">
          <h2 id="home-faq-title" className="home-section-title">
            Frequently asked questions
          </h2>
          <p className="home-section-lead">
            Quick answers about how this prototype works and how your information is handled.
          </p>
          <div className="home-faq-list">
            {FAQ_ITEMS.map(({ id, question, answer }) => (
              <details key={id} className="home-faq-item" name="home-faq">
                <summary className="home-faq-summary">{question}</summary>
                <p className="home-faq-answer">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

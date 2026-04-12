import { Link } from "react-router-dom";

//This is a small reusable component that renders the application’s brand icon/logo using SVG.  
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

  //This is the main exported component for the homepage.
//It returns the JSX for the homepage.
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
            Find your next role and take the leap: start with a posting you can actually read, then explore what fits.
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
    </div>
  );
}

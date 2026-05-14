/**
 * Decorative blob cluster (mint / peach / tan) — shared by Job Simplifier and Career Profile heroes.
 */
export default function WarmHeroPaperShapes() {
  return (
    <div className="simplify-hero-shapes" aria-hidden="true">
      <svg className="simplify-shape-svg" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
        <path
          fill="#c4e0c8"
          opacity="0.95"
          d="M40 120c20-50 80-90 140-70s80 70 50 120-90 50-140 20-70-60-50-70z"
        />
        <path
          fill="#e8b4a0"
          opacity="0.88"
          d="M120 40c45 8 85 50 75 100s-55 70-100 55-65-45-55-90 25-70 80-65z"
        />
        <circle cx="175" cy="55" r="18" fill="#d4a574" opacity="0.75" />
      </svg>
    </div>
  );
}

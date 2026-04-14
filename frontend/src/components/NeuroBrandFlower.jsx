const FULL_FLOWER_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Eight-petal flower with staggered “completion” animation when `animationActive` is true.
 * Used on the home sticky bar and the profile builder top bar.
 */
export function NeuroBrandFlower({ className = "", svgClassName = "", animationActive = false }) {
  return (
    <div
      className={`neuro-brand-flower-root ${animationActive ? "neuro-brand-flower-root--active" : ""} ${className}`.trim()}
    >
      <svg
        className={svgClassName}
        width="40"
        height="40"
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="20" cy="20" r="3" fill="currentColor" className="neuro-brand-flower-center" />
        {FULL_FLOWER_ANGLES.map((deg, i) => (
          <g key={deg} transform={`rotate(${deg} 20 20)`} className="neuro-brand-flower-petal" data-petal-index={i}>
            <ellipse cx="20" cy="8" rx="2.2" ry="6" fill="currentColor" />
          </g>
        ))}
      </svg>
    </div>
  );
}

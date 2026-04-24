/**
 * Illustration panel shown beside each quiz question.
 *
 * The underlying PNGs are already animated/visually active, so this
 * component just presents the image cleanly - no floating shapes, no
 * decorative dots, no float/scale animation applied by CSS.
 *
 * A different image is shown per quiz step (falling back to one per
 * block) so the feel of each question varies.
 */

const BASE = "/images/quiz";
/** Served from repo `data/images/ADHD Type/` (Vite publicDir). */
const ADHD_TYPE_IMAGES = `/images/${encodeURIComponent("ADHD Type")}`;

// Per-step kind illustrations. Falls back to block-level if missing.
const SCENE_BY_STEP_KIND = {
  "adhd-awareness":   { src: `${BASE}/g1.png`, alt: "Character with a checklist - a calm starting point" },
  "adhd-type-known":  { src: `${BASE}/g3.png`, alt: "Friendly character waving at their laptop" },
  "adhd-quiz":        { src: `${BASE}/h3.png`, alt: "Two characters exploring a dashboard together" },
  "adhd-quiz-result": {
    src: `${ADHD_TYPE_IMAGES}/Q10.png`,
    alt: "Illustration for your type classification result",
  },
  "work-style":       { src: `${BASE}/h1.png`, alt: "Character tapping options on a large phone screen" },
  "support-needs":    { src: `${BASE}/kj.png`, alt: "Character exploring supportive tools on a phone" },
  "energy":           { src: `${BASE}/g2.png`, alt: "Character lying down, working from a laptop at their own pace" },
  "roles-pick":       { src: `${BASE}/h5.png`, alt: "Team reviewing a dashboard of jobs and charts" },
  "role-duration":    { src: `${BASE}/h2.png`, alt: "Team chatting with speech bubbles about their experience" },
  "skills":           { src: `${BASE}/h5.png`, alt: "Team pointing at charts and skills on a big dashboard" },
};

const SCENE_BY_BLOCK = {
  type:    { src: `${BASE}/g1.png`, alt: "Character with a checklist for the Type Classification section" },
  work:    { src: `${BASE}/h1.png`, alt: "Character picking work preferences on a phone" },
  support: { src: `${BASE}/kj.png`, alt: "Character exploring supports on a phone" },
  jobs:    { src: `${BASE}/h5.png`, alt: "Team reviewing jobs and skills at a dashboard" },
  profile: { src: `${BASE}/h2.png`, alt: "Team celebrating a completed profile" },
};

/**
 * One PNG per quiz item (Q1.png … Q8.png) in `data/images/ADHD Type/`, keyed by
 * step id `adhd-quiz-q1` … `adhd-quiz-q8`. "Your result" uses Q10.png (see
 * `adhd-quiz-result` in SCENE_BY_STEP_KIND).
 */
function sceneForTypeClassificationQuizStep(stepId) {
  if (!stepId || typeof stepId !== "string") return null;
  const m = stepId.match(/^adhd-quiz-(q(\d+))$/i);
  if (!m) return null;
  const n = m[2];
  return {
    src: `${ADHD_TYPE_IMAGES}/Q${n}.png`,
    alt: `Illustration for type question ${n} of 8`,
  };
}

export default function QuizScene({ blockId, stepKind, stepId }) {
  const quizAdhd = stepKind === "adhd-quiz" ? sceneForTypeClassificationQuizStep(stepId) : null;
  const scene =
    quizAdhd ||
    (stepKind && SCENE_BY_STEP_KIND[stepKind]) ||
    SCENE_BY_BLOCK[blockId] ||
    SCENE_BY_BLOCK.type;

  const cacheKey = stepId || stepKind || blockId || "default";

  return (
    <aside className={`q-scene q-scene--${blockId || "type"}`} aria-hidden="true">
      <div className="q-scene-frame">
        <img
          key={cacheKey}
          className="q-scene-art"
          src={scene.src}
          alt={scene.alt}
          loading="lazy"
          decoding="async"
        />
      </div>
    </aside>
  );
}

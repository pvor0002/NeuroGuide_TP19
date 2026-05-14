const CAREER_PROFILE_STORAGE_KEY = "neuroguide.careerProfile.react.v2";

/** Default ADHD lens slug for Day in the Life URL/API (matches existing score-card behaviour). */
export function getDefaultAdhdSlugForDayInLife() {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CAREER_PROFILE_STORAGE_KEY) : null;
    if (!raw) return "inattentive";
    const parsed = JSON.parse(raw);
    const type = parsed?.answers?.adhdProfileType || parsed?.answers?.quizInferredType || "";
    if (type === "hyperactive-impulsive") return "hyperactive";
    if (type === "inattentive") return "inattentive";
    if (type === "combined") return "combined";
    return "inattentive";
  } catch {
    return "inattentive";
  }
}

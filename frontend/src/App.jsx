import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import MarketingLayout from "./layouts/MarketingLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProfileWizardPage from "./pages/ProfileWizardPage.jsx";
import SimplifyJobDescriptionPage from "./pages/SimplifyJobDescriptionPage.jsx";
import InterviewPrepRouter from "./pages/InterviewPrepRouter.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import MySavedScoresPage from "./pages/MySavedScoresPage.jsx";
import SavedResultsPage from "./pages/SavedResultsPage.jsx";
import DayInLifePage from "./pages/DayInLifePage.jsx";

const VALID_SAVED_INSIGHT_TABS = new Set(["scores", "day-in-life", "interview"]);

function LegacySavedResultsRedirect() {
  const { tab } = useParams();
  const t = VALID_SAVED_INSIGHT_TABS.has(tab) ? tab : "scores";
  return <Navigate to={`/saved-insights/${t}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* path="/" layout so nested routes resolve (RR v7); index = home */}
        <Route path="/" element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="simplify-job-description" element={<SimplifyJobDescriptionPage />} />
          <Route path="day-in-life" element={<DayInLifePage />} />
          <Route path="saved-insights/:tab" element={<SavedResultsPage />} />
          <Route path="saved-insights" element={<Navigate to="/saved-insights/scores" replace />} />
          <Route path="saved-results/:tab" element={<LegacySavedResultsRedirect />} />
          <Route path="saved-results" element={<Navigate to="/saved-insights/scores" replace />} />
          <Route path="my-saved-scores" element={<MySavedScoresPage />} />
          <Route path="interview-prep/*" element={<InterviewPrepRouter />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/profile" element={<ProfileWizardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

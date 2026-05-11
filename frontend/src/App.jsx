import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MarketingLayout from "./layouts/MarketingLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProfileWizardPage from "./pages/ProfileWizardPage.jsx";
import SimplifyJobDescriptionPage from "./pages/SimplifyJobDescriptionPage.jsx";
import InterviewPrepPage from "./pages/InterviewPrepPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import MySavedScoresPage from "./pages/MySavedScoresPage.jsx";
import DayInLifePage from "./pages/DayInLifePage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* path="/" layout so nested routes resolve (RR v7); index = home */}
        <Route path="/" element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="simplify-job-description" element={<SimplifyJobDescriptionPage />} />
          <Route path="day-in-life" element={<DayInLifePage />} />
          <Route path="my-saved-scores" element={<MySavedScoresPage />} />
          <Route path="interview-prep" element={<InterviewPrepPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/profile" element={<ProfileWizardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

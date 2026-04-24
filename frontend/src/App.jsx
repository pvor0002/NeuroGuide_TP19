import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MarketingLayout from "./layouts/MarketingLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProfileWizardPage from "./pages/ProfileWizardPage.jsx";
import SimplifyJobDescriptionPage from "./pages/SimplifyJobDescriptionPage.jsx";
import InterviewPrepPage from "./pages/InterviewPrepPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/simplify-job-description" element={<SimplifyJobDescriptionPage />} />
          <Route path="/interview-prep" element={<InterviewPrepPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/profile" element={<ProfileWizardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

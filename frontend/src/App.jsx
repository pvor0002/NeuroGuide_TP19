import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MarketingLayout from "./layouts/MarketingLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProfileWizardPage from "./pages/ProfileWizardPage.jsx";
import SimplifyJobDescriptionPage from "./pages/SimplifyJobDescriptionPage.jsx";

/** Matches Vite `base` (import.meta.env.BASE_URL, trailing slash). */
function routerBasename() {
  const b = import.meta.env.BASE_URL ?? "/";
  if (b === "/" || b === "") return undefined;
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/simplify-job-description" element={<SimplifyJobDescriptionPage />} />
        </Route>
        <Route path="/profile" element={<ProfileWizardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

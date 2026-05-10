import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SitePasswordGate from "./components/SitePasswordGate.jsx";
import "./shared.css";
import "./interview-prep-builder.css";
import "./profile-app.css";
import "./jobinput.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SitePasswordGate>
      <App />
    </SitePasswordGate>
  </React.StrictMode>
);

/**
 * Application entry (Vite + React).
 *
 * This file starts the React app by loading the main App component into the HTML #root element,
 *  while enabling routing and development checks.
 *
 * @file
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

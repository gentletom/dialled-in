import React from "react";
import { createRoot } from "react-dom/client";
import "./storage.js"; // installs window.storage (IndexedDB) before App reads it
import App, { ErrorBoundary } from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

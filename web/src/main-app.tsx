import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts";
import "./styles.css";
import { Dashboard } from "./pages/dashboard";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts";
import "./styles.css";
import { Landing } from "./pages/landing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);

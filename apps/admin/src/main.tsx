import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HealthPage } from "./health-page";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <HealthPage />
  </StrictMode>,
);

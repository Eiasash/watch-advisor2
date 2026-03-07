import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";

createRoot(document.getElementById("root")).render(
  createElement(StrictMode, null, createElement(App))
);

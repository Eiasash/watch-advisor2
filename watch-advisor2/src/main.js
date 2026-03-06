import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/AppShell.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(App))
);

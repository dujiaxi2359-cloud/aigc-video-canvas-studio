import React from "react";
import ReactDOM from "react-dom/client";
import "reactflow/dist/style.css";
import "./styles/globals.css";
import App from "./App";

globalThis.console.info("Moon build commit:", __MOON_BUILD_COMMIT__);
globalThis.console.info("Moon build branch:", __MOON_BUILD_BRANCH__);
globalThis.console.info("Moon build time:", __MOON_BUILD_TIME__);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

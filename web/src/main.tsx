import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/app/App";
import { AppProviders } from "@/app/providers/AppProviders";
import "@/styles/tokens.css";
import "@/styles/base.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);

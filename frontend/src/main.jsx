import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "./index.css";
import "./pwa.js";

import {
  VaccineProvider,
} from "./context/VaccineContext";

ReactDOM.createRoot(
  document.getElementById("root")
).render(

  <React.StrictMode>

    <VaccineProvider>

      <App />

    </VaccineProvider>

  </React.StrictMode>

);

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { LayoutProvider } from "./contexts/LayoutContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LayoutProvider>
        <App />
      </LayoutProvider>
    </BrowserRouter>
  </React.StrictMode>
);

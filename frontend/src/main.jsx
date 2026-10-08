import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { LayoutProvider } from "./contexts/LayoutContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import "./index.css";
import "./compact.css";
import "./styles/control-room.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LayoutProvider>
          <App />
        </LayoutProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

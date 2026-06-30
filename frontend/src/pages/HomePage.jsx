import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLayout } from "../contexts/LayoutContext";
import "./HomePage.css";

export default function HomePage() {
  const location = useLocation();
  const { setToolbar, setSidebar, toggleSidebar, sidebarVisible } = useLayout();
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [deniedPage, setDeniedPage] = useState("");

  // Hide toolbar and sidebar for home page.
  useEffect(() => {
    setToolbar(null);
    setSidebar(null, null);
    if (sidebarVisible) {
      toggleSidebar();
    }
  }, [setToolbar, setSidebar, toggleSidebar, sidebarVisible]);

  useEffect(() => {
    if (location.state?.accessDenied) {
      setShowAccessDenied(true);
      setDeniedPage(location.state.deniedPage || "the requested page");
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  return (
    <div className="home-page page-transition">
      {showAccessDenied && (
        <div className="access-denied-alert">
          <div className="access-denied-alert-content">
            <h3>Access Denied</h3>
            <p>You don't have permission to access {deniedPage}.</p>
            <p>Please contact your administrator to request access.</p>
            <button
              className="access-denied-alert-close"
              onClick={() => setShowAccessDenied(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="home-brand-stage" aria-label="Utility Optimo dashboard">
        <h1 className="home-brand-title">UTILITY OPTIMO</h1>
      </main>
    </div>
  );
}

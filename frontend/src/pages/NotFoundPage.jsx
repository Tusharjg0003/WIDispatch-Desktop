import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, Search } from "lucide-react";

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <main className="not-found-page">
      <div className="not-found-page__code">404</div>
      <p className="not-found-page__eyebrow">Route not available</p>
      <h1>This workspace does not exist</h1>
      <p><code>{location.pathname}</code> is not a registered WIDispatch route. Use Operations or global search to continue.</p>
      <div className="not-found-page__actions">
        <button type="button" className="primary" onClick={() => navigate("/")}><Home size={15} /> Operations</button>
        <button type="button" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Go back</button>
        <span><Search size={14} /> Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to search</span>
      </div>
    </main>
  );
}

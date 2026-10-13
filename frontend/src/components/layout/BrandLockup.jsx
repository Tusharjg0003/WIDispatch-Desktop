import React from "react";
import { useTheme } from "../../contexts/ThemeContext";
import "./BrandLockup.css";

// Port of WIDispatch-Production components/layout/brand-lockup.tsx (header
// variant): SWIIMS·WIDispatch mark | divider | company identity (Utility
// Optimo — white lettering on dark backgrounds, navy on light). Narrow
// headers, and the compact variant, keep just the company's mark.
export default function BrandLockup({ compact = false }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`brand-lockup ${compact ? "brand-lockup--compact" : ""}`} data-brand-lockup="header">
      <img
        className="brand-lockup__swiims"
        src={isDark ? "/swiims-widispatch-logo.svg" : "/swiims-widispatch-logo-color.svg"}
        alt="SWIIMS WIDispatch"
      />
      <span className="brand-lockup__divider" aria-hidden="true" />
      <div className="brand-lockup__company">
        {!compact && (
          <img
            className="brand-lockup__company-logo"
            src={isDark ? "/utility-optimo-logo-dark-bg.png" : "/utility-optimo-logo-light-bg.png"}
            alt="Utility Optimo"
          />
        )}
        <img
          className={`brand-lockup__company-mark${compact ? "" : " brand-lockup__company-mark--narrow"}`}
          src="/utility-optimo-mark.png"
          alt={compact ? "Utility Optimo" : ""}
          aria-hidden={compact ? undefined : true}
        />
      </div>
    </div>
  );
}

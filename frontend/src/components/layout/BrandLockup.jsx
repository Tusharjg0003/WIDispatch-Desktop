import React from "react";
import { useTheme } from "../../contexts/ThemeContext";
import "./BrandLockup.css";

// Port of WIDispatch-Production components/layout/brand-lockup.tsx (header
// variant): SWIIMS·WIDispatch mark | divider | WTCO logo + bilingual name.
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
      <div className="brand-lockup__wtco">
        <img className="brand-lockup__wtco-logo" src="/wtco-logo.png" alt="Water Transmission Company" />
        {!compact && (
          <span className="brand-lockup__name">
            <span className="brand-lockup__name-en">Water Transmission Co.</span>
            <span className="brand-lockup__name-ar" dir="rtl">شركة نقل المياه</span>
          </span>
        )}
      </div>
    </div>
  );
}

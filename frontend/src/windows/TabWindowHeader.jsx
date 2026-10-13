import React, { useEffect } from "react";
import { AppWindow, Moon, PanelTopClose, Sun } from "lucide-react";
import BrandLockup from "../components/layout/BrandLockup";
import { useTheme } from "../contexts/ThemeContext";
import { returnToMainWindow, thisTabWindow } from "./tabWindows";
import "./TabWindowHeader.css";

const SUB_LABELS = { configuration: "Configuration", results: "Results", decisions: "Decisions", canvas: "Canvas" };

// Header of a taken-out tab window, in place of the top navigation: what this
// window holds, and the way back into the main window.
export default function TabWindowHeader() {
  const { theme, toggleTheme } = useTheme();
  const info = thisTabWindow;
  const sub = info?.sub ? SUB_LABELS[info.sub] || info.sub : null;
  const title = info ? `${info.title}${sub ? ` · ${sub}` : ""}` : "";

  useEffect(() => {
    if (title) document.title = `${title} — WIDispatch`;
  }, [title]);

  if (!info) return null;
  return (
    <header className="tab-window-header">
      <BrandLockup compact />
      <span className="tab-window-header__divider" aria-hidden="true" />
      <AppWindow size={15} className="tab-window-header__icon" aria-hidden="true" />
      <strong className="tab-window-header__title" title={title}>{title}</strong>
      <span className="tab-window-header__spacer" />
      <button type="button" className="tab-window-header__icon-btn" onClick={toggleTheme} title="Toggle light / dark" aria-label="Toggle light / dark">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <button type="button" className="tab-window-header__return" onClick={returnToMainWindow} title="Put this tab back in the main window and close this one">
        <PanelTopClose size={14} aria-hidden="true" /> Return to main window
      </button>
    </header>
  );
}

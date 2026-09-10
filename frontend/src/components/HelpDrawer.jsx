import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { CircleHelp, Command, ExternalLink, Keyboard, X } from "lucide-react";

const helpByRoute = [
  { match: /^\/$/, title: "Operations command center", copy: "Review the latest operating position, exceptions, pending decisions, and recent dispatch runs. Open any card to continue in its source workspace." },
  { match: /^\/production/, title: "Production", copy: "Search and filter plants, then open a plant to review capacity, production, quality, maintenance, and outages." },
  { match: /^\/demand/, title: "Demand", copy: "Review required volumes by city gate and complete desktop decisions for website-approved records." },
  { match: /^\/transmission/, title: "Transmission", copy: "Inspect pump stations and transmission systems, including asset availability and network constraints." },
  { match: /^\/economics/, title: "Economics", copy: "Check financial-data readiness and compare Variable O&M inputs used by dispatch merit order." },
  { match: /^\/network-builder/, title: "Network Builder", copy: "Build network topology, validate connectivity and capacity, trace paths, and save configurations for simulation." },
  { match: /^\/simulation-config/, title: "Simulation Config", copy: "Choose a saved configuration, validate inputs, run dispatch, review results and decisions, then publish when complete." },
  { match: /^\/asset-registry/, title: "Asset Registry", copy: "Browse all supported assets in map or list form and maintain registry records." },
];

export default function HelpDrawer({ open, onClose }) {
  const location = useLocation();
  const section = helpByRoute.find((item) => item.match.test(location.pathname)) || {
    title: "WIDispatch help",
    copy: "Use the main navigation or global search to move between operational workspaces.",
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="help-drawer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="help-drawer__panel" role="dialog" aria-modal="true" aria-label={`${section.title} help`}>
        <header>
          <div><CircleHelp size={18} /><span>Workspace guide</span></div>
          <button type="button" onClick={onClose} aria-label="Close help"><X size={17} /></button>
        </header>
        <div className="help-drawer__content">
          <p className="help-drawer__eyebrow">Current workspace</p>
          <h2>{section.title}</h2>
          <p>{section.copy}</p>

          <section>
            <h3><Keyboard size={15} /> Keyboard shortcuts</h3>
            <dl>
              <div><dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Open global search</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>Close menus and dialogs</dd></div>
              <div><dt><kbd>Tab</kbd></dt><dd>Move through controls</dd></div>
            </dl>
          </section>

          <section>
            <h3><Command size={15} /> Operating conventions</h3>
            <ul>
              <li>Green indicates healthy or approved information.</li>
              <li>Amber indicates pending, stale, or constrained information.</li>
              <li>Red identifies blocking exceptions or shortages.</li>
              <li>Values with a source badge show where dispatch obtained the input.</li>
            </ul>
          </section>
        </div>
        <footer>
          <span>WIDispatch operator workspace</span>
          <a href="mailto:support@example.com">Contact support <ExternalLink size={12} /></a>
        </footer>
      </aside>
    </div>
  );
}

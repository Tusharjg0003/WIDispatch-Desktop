import { useLocation } from "react-router-dom";

// Bottom status strip, mirroring WIDispatch-Production's Control Room shell.
// Kept lightweight (no data wiring): a workspace label on the left, a couple of
// status indicators on the right.
const SECTION_LABELS = {
  "/": "Operations",
  "/production": "Production",
  "/demand": "Demand",
  "/transmission": "Transmission",
  "/economics": "Economics",
  "/network-builder": "Network Builder",
  "/simulation-config": "Simulation Config",
  "/asset-registry": "Asset Registry",
};

function sectionFor(pathname) {
  if (pathname === "/") return SECTION_LABELS["/"];
  const match = Object.keys(SECTION_LABELS)
    .filter((path) => path !== "/" && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SECTION_LABELS[match] : "Workspace";
}

export default function StatusBar() {
  const { pathname } = useLocation();
  return (
    <footer className="app-status-bar" role="contentinfo">
      <div className="app-status-bar__left">
        <span className="app-status-bar__brand">WIDispatch</span>
        <span className="app-status-bar__sep">·</span>
        <span>Operator Workspace</span>
        <span className="app-status-bar__sep">·</span>
        <span className="app-status-bar__section">{sectionFor(pathname)}</span>
      </div>
      <div className="app-status-bar__right">
        <span className="app-status-bar__status">
          <span className="app-status-bar__dot" aria-hidden="true" />
          Local workspace
        </span>
      </div>
    </footer>
  );
}

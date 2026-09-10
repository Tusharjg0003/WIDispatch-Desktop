import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Boxes, Building2, ChevronDown, CircleHelp, Command, Factory,
  Home, Menu, Network, Search, SlidersHorizontal, UserRound, Waves, X,
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import HelpDrawer from "./HelpDrawer";
import "./TopNavigationBar.css";

const NAV_ITEMS = [
  { id: "production", label: "Production", path: "/production", icon: Factory },
  { id: "demand", label: "Demand", path: "/demand", icon: Waves },
  { id: "transmission", label: "Transmission", path: "/transmission", icon: Network },
  { id: "economics", label: "Economics", path: "/economics", icon: BarChart3 },
  { id: "network-builder", label: "Network Builder", path: "/network-builder", icon: Boxes, secondary: true },
  { id: "simulation-config", label: "Simulation Config", path: "/simulation-config", icon: SlidersHorizontal, secondary: true },
  { id: "asset-registry", label: "Asset Registry", path: "/asset-registry", icon: Building2, secondary: true },
];

export default function TopNavigationBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const isActive = (path) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  useEffect(() => {
    setModulesOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setModulesOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const closeOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setModulesOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const go = (path) => navigate(path);

  return (
    <>
      <nav className="top-navigation-bar" aria-label="Primary navigation">
        <div className="top-navigation-bar__container" ref={menuRef}>
          <button type="button" className="top-navigation-bar__logo" onClick={() => go("/")} aria-label="WIDispatch Operations">
            <img src="/SVG(No background)_Horizontal_Outlined for Dark BG_WIDISPATCH.svg" alt="WIDispatch" />
          </button>

          <div className="top-navigation-bar__items">
            {NAV_ITEMS.map(({ id, label, path, icon: Icon, secondary }) => (
              <button
                type="button"
                key={id}
                title={label}
                className={`top-navigation-bar__item ${secondary ? "top-navigation-bar__item--secondary" : ""} ${isActive(path) ? "active" : ""}`}
                onClick={() => go(path)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="top-navigation-bar__module-menu">
            <button
              type="button"
              className={`top-navigation-bar__module-trigger ${modulesOpen ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={modulesOpen}
              onClick={() => { setModulesOpen((value) => !value); setUserOpen(false); }}
            >
              {modulesOpen ? <X size={16} /> : <Menu size={16} />}
              <span>Modules</span>
              <ChevronDown className="top-navigation-bar__module-chevron" size={13} />
            </button>
            {modulesOpen && (
              <div className="top-navigation-bar__modules" role="menu">
                <p>Operational workspaces</p>
                {NAV_ITEMS.map(({ id, label, path, icon: Icon }) => (
                  <button type="button" role="menuitem" key={id} className={isActive(path) ? "active" : ""} onClick={() => go(path)}>
                    <span><Icon size={16} /></span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="top-navigation-bar__utilities">
            <button type="button" className="top-navigation-bar__search" onClick={() => setSearchOpen(true)} aria-label="Search WIDispatch">
              <Search size={15} /><span>Search</span><kbd>Ctrl K</kbd>
            </button>
            <button type="button" className={`top-navigation-bar__icon-btn ${isActive("/") ? "active" : ""}`} onClick={() => go("/")} title="Operations" aria-label="Operations"><Home size={16} /></button>
            <button type="button" className="top-navigation-bar__icon-btn" onClick={() => setHelpOpen(true)} title="Help" aria-label="Help"><CircleHelp size={16} /></button>
            <div className="top-navigation-bar__divider" />
            <div className="top-navigation-bar__user-menu">
              <button type="button" className="top-navigation-bar__user-btn" onClick={() => { setUserOpen((value) => !value); setModulesOpen(false); }} aria-haspopup="menu" aria-expanded={userOpen}>
                <span className="top-navigation-bar__user-avatar">U</span>
                <span className="top-navigation-bar__user-copy"><strong>User</strong><small>Operator</small></span>
                <ChevronDown size={12} />
              </button>
              {userOpen && (
                <div className="top-navigation-bar__user-card" role="menu">
                  <span className="top-navigation-bar__user-card-avatar"><UserRound size={18} /></span>
                  <div><strong>User</strong><small>Operations administrator</small><em>Local workspace</em></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

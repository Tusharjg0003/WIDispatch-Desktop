import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Boxes, Building2, ChevronDown, CircleHelp, Factory,
  Home, Menu, Moon, Network, Search, SlidersHorizontal, Sun, UserRound, Waves, X,
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import HelpDrawer from "./HelpDrawer";
import BrandLockup from "./layout/BrandLockup";
import { useTheme } from "../contexts/ThemeContext";
import "./TopNavigationBar.css";

// Header clock, as in WIDispatch-Production header.tsx ("04 Oct · 14:05").
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const day = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

const NAV_ITEMS = [
  { id: "production", label: "Production", path: "/production", icon: Factory },
  { id: "demand", label: "Demand", path: "/demand", icon: Waves },
  {
    id: "transmission",
    label: "Transmission",
    path: "/transmission",
    icon: Network,
    children: [
      { id: "transmission-pump-stations", label: "Pump Stations", path: "/transmission/pump-stations" },
      { id: "transmission-systems", label: "Transmission Systems", path: "/transmission/systems" },
    ],
  },
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
  const [openNavGroup, setOpenNavGroup] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const clock = useClock();

  const isActive = (path) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
  const itemIsActive = (item) => isActive(item.path) || item.children?.some((child) => isActive(child.path));

  useEffect(() => {
    setModulesOpen(false);
    setUserOpen(false);
    // The submenu is a dropdown under its pill now, so close it on navigation.
    setOpenNavGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setModulesOpen(false);
        setOpenNavGroup(null);
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
        setOpenNavGroup(null);
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
            <BrandLockup />
          </button>

          <span className="top-navigation-bar__portal-chip cr-hide-sm" title="Desktop Workspace">Desktop Workspace</span>
          <span className="top-navigation-bar__rule" aria-hidden="true" />

          <div className="top-navigation-bar__items">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = itemIsActive(item);
              const groupOpen = openNavGroup === item.id;

              return (
                <div key={item.id} className="top-navigation-bar__nav-group">
                  <button
                    type="button"
                    title={item.label}
                    className={`top-navigation-bar__item ${item.secondary ? "top-navigation-bar__item--secondary" : ""} ${active ? "active" : ""}`}
                    aria-haspopup={item.children ? "menu" : undefined}
                    aria-expanded={item.children ? groupOpen : undefined}
                    onClick={() => {
                      if (item.children) {
                        setOpenNavGroup((value) => value === item.id ? null : item.id);
                        return;
                      }
                      go(item.path);
                    }}
                  >
                    <Icon size={14} className="top-navigation-bar__item-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.children && <ChevronDown className="top-navigation-bar__item-chevron" size={12} />}
                  </button>

                  {item.children && groupOpen && (
                    <div className="top-navigation-bar__submenu" role="menu" aria-label={`${item.label} submenu`}>
                      {item.children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          role="menuitem"
                          className={`top-navigation-bar__submenu-item ${isActive(child.path) ? "active" : ""}`}
                          onClick={() => {
                            setOpenNavGroup(null);
                            go(child.path);
                          }}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="top-navigation-bar__module-menu">
            <button
              type="button"
              className={`top-navigation-bar__module-trigger ${modulesOpen ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={modulesOpen}
              onClick={() => { setModulesOpen((value) => !value); setUserOpen(false); setOpenNavGroup(null); }}
            >
              {modulesOpen ? <X size={15} /> : <Menu size={15} />}
              <span>Modules</span>
              <ChevronDown className="top-navigation-bar__module-chevron" size={13} />
            </button>
            {modulesOpen && (
              <div className="top-navigation-bar__modules" role="menu">
                <p>Operational workspaces</p>
                {NAV_ITEMS.map(({ id, label, path, icon: Icon, children }) => (
                  <React.Fragment key={id}>
                    <button type="button" role="menuitem" className={isActive(path) ? "active" : ""} onClick={() => go(path)}>
                      <span><Icon size={16} /></span>
                      <strong>{label}</strong>
                    </button>
                    {children?.map((child) => (
                      <button type="button" role="menuitem" key={child.id} className={`top-navigation-bar__modules-child ${isActive(child.path) ? "active" : ""}`} onClick={() => go(child.path)}>
                        <span><Icon size={16} /></span>
                        <strong>{child.label}</strong>
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="top-navigation-bar__utilities">
            <button type="button" className="top-navigation-bar__search cr-hide-sm" onClick={() => setSearchOpen(true)} aria-label="Search WIDispatch" title="Search (Ctrl K)">
              <Search size={13} aria-hidden="true" /><span>Search…</span><kbd>Ctrl K</kbd>
            </button>
            <span className="top-navigation-bar__clock">{clock}</span>
            <button type="button" className={`top-navigation-bar__icon-btn ${isActive("/") ? "active" : ""}`} onClick={() => go("/")} title="Operations" aria-label="Operations"><Home size={15} /></button>
            <button type="button" className="top-navigation-bar__icon-btn" onClick={() => setHelpOpen(true)} title="Help" aria-label="Help"><CircleHelp size={15} /></button>
            <button type="button" className="top-navigation-bar__icon-btn" onClick={toggleTheme} title="Toggle light / dark" aria-label="Toggle light / dark">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <div className="top-navigation-bar__user-menu">
              <button type="button" className="top-navigation-bar__user-btn" onClick={() => { setUserOpen((value) => !value); setModulesOpen(false); setOpenNavGroup(null); }} aria-haspopup="menu" aria-expanded={userOpen}>
                <span className="top-navigation-bar__user-avatar">U</span>
                <span className="top-navigation-bar__user-copy"><strong>User</strong><small>Operator</small></span>
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

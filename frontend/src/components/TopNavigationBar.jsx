import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import "./TopNavigationBar.css";

const iconPath = (path) => encodeURI(`/All Icons Zipped/${path}`);

// Pages are wired into routes later; for now each item just navigates to its path.
const NAV_ITEMS = [
  {
    id: "production",
    label: "Production",
    path: "/production",
    icon: iconPath("02 Asset & Infrastructure Icons/Desalination Plant/SVG/Desalination Plant_20px.svg"),
  },
  {
    id: "demand",
    label: "Demand",
    path: "/demand",
    icon: iconPath("05 Data, Analytics & Reporting/Line Chart/SVG/Line Chart_20px.svg"),
  },
  {
    id: "transmission",
    label: "Transmission",
    path: "/transmission",
    icon: iconPath("02 Asset & Infrastructure Icons/Pipeline Network/SVG/Pipeline Network_20px.svg"),
  },
  {
    id: "economics",
    label: "Economics",
    path: "/economics",
    icon: iconPath("05 Data, Analytics & Reporting/Bar Chart/SVG/Bar Chart_20px.svg"),
  },
  {
    id: "network-builder",
    label: "Network Builder",
    path: "/network-builder",
    icon: iconPath("02 Asset & Infrastructure Icons/Distribution Network/SVG/Distribution Network_20px.svg"),
  },
  {
    id: "simulation-config",
    label: "Simulation Config",
    path: "/simulation-config",
    icon: iconPath("07 Operations & Control/Control Panel/SVG/Control Panel_20px.svg"),
  },
  {
    id: "asset-registry",
    label: "Asset Registry",
    path: "/asset-registry",
    icon: iconPath("11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg"),
  },
];

const TopNavigationBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const userMenuRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  const isActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = (path) => {
    navigate(path);
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  // Toggle the collapsible search; focus the input when it expands
  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      return next;
    });
  };

  // Collapse the search on outside click or Escape
  useEffect(() => {
    if (!searchOpen) return undefined;

    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [searchOpen]);

  return (
    <nav className="top-navigation-bar">
      <div className="top-navigation-bar__container">
        <div className="top-navigation-bar__logo" aria-label="WIDispatch">
          <img
            className="top-navigation-bar__logo-mark"
            src="/SVG(No background)_Horizontal_Outlined for Dark BG_WIDISPATCH.svg"
            alt="WIDispatch"
          />
        </div>

        <div className="top-navigation-bar__items">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                className={`top-navigation-bar__item ${active ? "active" : ""}`}
                onClick={() => handleNavClick(item.path)}
              >
                <img
                  className="top-navigation-bar__item-icon"
                  src={item.icon}
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className={`top-navigation-bar__global-search ${searchOpen ? "is-open" : ""}`}
          ref={searchRef}
        >
          <button
            type="button"
            className="top-navigation-bar__icon-btn top-navigation-bar__global-search-toggle"
            title="Search"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={toggleSearch}
          >
            <span aria-hidden="true">⌕</span>
          </button>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search..."
            aria-label="Search"
            tabIndex={searchOpen ? 0 : -1}
          />
        </div>

        <button
          type="button"
          className={`top-navigation-bar__icon-btn ${isActive("/") ? "active" : ""}`}
          title="Home"
          aria-label="Home"
          onClick={() => handleNavClick("/")}
        >
          <Home size={13} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <button className="top-navigation-bar__icon-btn" title="Help" aria-label="Help">
          <span aria-hidden="true">?</span>
        </button>

        <div className="top-navigation-bar__divider" />

        {/* User Menu */}
        <div className="top-navigation-bar__user-menu" ref={userMenuRef}>
          <button
            className="top-navigation-bar__user-btn"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div className="top-navigation-bar__user-avatar">U</div>
            <span className="top-navigation-bar__user-name">User</span>
            <span className="top-navigation-bar__chevron" aria-hidden="true">
              &#9660;
            </span>
          </button>

          {userMenuOpen && (
            <div className="top-navigation-bar__user-dropdown">
              <div className="top-navigation-bar__user-dropdown-header">
                <div className="top-navigation-bar__user-dropdown-avatar">U</div>
                <div>
                  <div className="top-navigation-bar__user-dropdown-name">User</div>
                  <div className="top-navigation-bar__user-dropdown-role">Administrator</div>
                </div>
              </div>
              <div className="top-navigation-bar__user-dropdown-actions">
                <button
                  className="top-navigation-bar__user-dropdown-item"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/modules");
                  }}
                >
                  Change Modules
                </button>
                <button
                  className="top-navigation-bar__user-dropdown-item"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/login");
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopNavigationBar;

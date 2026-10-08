import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const LayoutContext = createContext(null);

/**
 * Provides the shared layout slots (toolbar + sidebar) and visibility state
 * that pages mutate via useLayout(). Pages register their chrome on mount and
 * clear it on unmount so each route controls its own toolbar/sidebar.
 */
export function LayoutProvider({ children }) {
  const [toolbar, setToolbar] = useState(null);
  const [sidebar, setSidebarState] = useState({ content: null, title: null });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // Status-bar metrics published by the active page (Production StatusBar
  // style): { left: [{ label, value, tone }], right: [{ label, value }] }.
  const [statusItems, setStatusItems] = useState(null);

  // Mirrors the reference API: setSidebar(content, title).
  const setSidebar = useCallback((content, title = null) => {
    setSidebarState({ content, title });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((visible) => !visible);
  }, []);

  const value = useMemo(
    () => ({
      toolbar,
      setToolbar,
      sidebar,
      setSidebar,
      sidebarVisible,
      toggleSidebar,
      statusItems,
      setStatusItems,
    }),
    [toolbar, sidebar, setSidebar, sidebarVisible, toggleSidebar, statusItems]
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}

export default LayoutContext;

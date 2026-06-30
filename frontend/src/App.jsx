import React from "react";
import { Routes, Route } from "react-router-dom";
import { useLayout } from "./contexts/LayoutContext";
import TopNavigationBar from "./components/TopNavigationBar";
import HomePage from "./pages/HomePage";
import ProductionPage from "./pages/ProductionPage";
import DemandPage from "./pages/DemandPage";
import TransmissionPage from "./pages/TransmissionPage";
import EconomicsPage from "./pages/EconomicsPage";
import AssetRegistryPage from "./pages/AssetRegistryPage";
import "./App.css";

export default function App() {
  const { toolbar, sidebar, sidebarVisible } = useLayout();

  return (
    <div className="app-shell">
      <TopNavigationBar />

      {toolbar && <header className="app-toolbar">{toolbar}</header>}

      <div className="app-body">
        {sidebar.content && sidebarVisible && (
          <aside className="app-sidebar">
            {sidebar.title && <h2 className="app-sidebar-title">{sidebar.title}</h2>}
            {sidebar.content}
          </aside>
        )}

        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/demand" element={<DemandPage />} />
            <Route path="/transmission" element={<TransmissionPage />} />
            <Route path="/economics" element={<EconomicsPage />} />
            <Route path="/asset-registry" element={<AssetRegistryPage />} />
            <Route path="/asset-registry/:tab" element={<AssetRegistryPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

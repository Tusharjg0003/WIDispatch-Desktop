import React from "react";
import { Routes, Route } from "react-router-dom";
import { useLayout } from "./contexts/LayoutContext";
import TopNavigationBar from "./components/TopNavigationBar";
import OutageNotificationToast from "./components/production/OutageNotificationToast";
import HomePage from "./pages/HomePage";
import ProductionPage from "./pages/ProductionPage";
import ProductionPlantDetail from "./pages/ProductionPlantDetail";
import DemandPage from "./pages/DemandPage";
import TransmissionPage from "./pages/TransmissionPage";
import EconomicsPage from "./pages/EconomicsPage";
import AssetRegistryPage from "./pages/AssetRegistryPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import NetworkBuilderPage from "./pages/NetworkBuilderPage";
import "./App.css";

export default function App() {
  const { toolbar, sidebar, sidebarVisible } = useLayout();

  return (
    <div className="app-shell">
      <TopNavigationBar />
      <OutageNotificationToast />

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
            <Route path="/production/:plantId" element={<ProductionPlantDetail />} />
            <Route path="/demand" element={<DemandPage />} />
            <Route path="/transmission" element={<TransmissionPage />} />
            <Route path="/economics" element={<EconomicsPage />} />
            <Route path="/network-builder" element={<NetworkBuilderPage />} />
            <Route path="/network-builder/:id" element={<NetworkBuilderPage />} />
            <Route path="/asset-registry" element={<AssetRegistryPage mode="list" />} />
            <Route path="/asset-registry/create" element={<AssetRegistryPage mode="create" />} />
            <Route path="/asset-registry/edit/:id" element={<AssetRegistryPage mode="edit" />} />
            <Route path="/asset-registry/view/:id" element={<AssetDetailPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

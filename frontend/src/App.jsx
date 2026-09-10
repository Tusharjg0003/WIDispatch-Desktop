import React, { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { useLayout } from "./contexts/LayoutContext";
import TopNavigationBar from "./components/TopNavigationBar";
import OutageNotificationToast from "./components/production/OutageNotificationToast";
import ErrorBoundary from "./components/ErrorBoundary";
import RouteLoading from "./components/RouteLoading";
import "./App.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const DemandPage = lazy(() => import("./pages/DemandPage"));
const TransmissionPage = lazy(() => import("./pages/TransmissionPage"));
const EconomicsPage = lazy(() => import("./pages/EconomicsPage"));
const AssetRegistryPage = lazy(() => import("./pages/AssetRegistryPage"));
const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage"));
const NetworkBuilderPage = lazy(() => import("./pages/NetworkBuilderPage"));
const SimulationConfigPage = lazy(() => import("./pages/SimulationConfigPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  const { toolbar, sidebar, sidebarVisible } = useLayout();

  return (
    <ErrorBoundary>
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
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/production/:plantId" element={<ProductionPage />} />
                <Route path="/demand" element={<DemandPage />} />
                <Route path="/demand/:cityGateId" element={<DemandPage />} />
                <Route path="/transmission" element={<TransmissionPage />} />
                <Route path="/transmission/pump-stations" element={<TransmissionPage />} />
                <Route path="/transmission/pump-stations/:pumpStationId" element={<TransmissionPage />} />
                <Route path="/transmission/systems" element={<TransmissionPage mode="systems" />} />
                <Route path="/economics" element={<EconomicsPage />} />
                <Route path="/economics/:plantId" element={<EconomicsPage />} />
                <Route path="/network-builder" element={<NetworkBuilderPage />} />
                <Route path="/network-builder/:id" element={<NetworkBuilderPage />} />
                <Route path="/simulation-config" element={<SimulationConfigPage />} />
                <Route path="/simulation-config/:id" element={<SimulationConfigPage />} />
                <Route path="/asset-registry" element={<AssetRegistryPage mode="list" />} />
                <Route path="/asset-registry/create" element={<AssetRegistryPage mode="create" />} />
                <Route path="/asset-registry/edit/:id" element={<AssetRegistryPage mode="edit" />} />
                <Route path="/asset-registry/view/:id" element={<AssetDetailPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

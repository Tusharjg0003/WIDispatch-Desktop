import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive, ArrowLeft, Edit2, Trash2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { deleteAsset, fetchAsset } from "../api/metrics";
import AssetDetailFields from "../components/AssetDetailFields";
import WorkspaceHeader, { WorkspaceHeaderButton } from "../components/WorkspaceHeader";
import "./AssetDetailPage.css";

const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };
const STATUS_TONE = {
  operational: "green",
  maintenance: "amber",
  under_construction: "blue",
  planned: "blue",
  decommissioned: "red",
};
const statusLabel = (s) => s?.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const isProductionAsset = (asset) => {
  if (!asset || asset.category !== "plant") return false;
  const spec = asset.specifications || {};
  const plantCategory = String(spec.plant_category || "").toLowerCase();
  const plantType = String(spec.plant_type || "").toLowerCase();
  const assetType = String(asset.asset_type || "").toLowerCase();
  if (plantCategory === "treatment" || assetType.includes("treatment")) return false;
  if (plantCategory) return true;
  return /desalination|purification|production/.test(`${plantType} ${assetType}`);
};

function ProductionPlaceholder({ bars }) {
  return (
    <div className="production-chart-placeholder">
      <div className="production-chart-placeholder__skeleton" aria-hidden="true">
        {bars.map((height, index) => (
          <span key={index} style={{ "--bar-height": `${height}%` }} />
        ))}
      </div>
      <div className="production-chart-placeholder__content">
        <p className="production-chart-placeholder__title">No production history</p>
        <p className="production-chart-placeholder__hint">Historical output will appear here when records are available.</p>
      </div>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const productionBars = useMemo(() => {
    const cap = Number(asset?.specifications?.design_capacity) || Number(asset?.specifications?.maximum_capacity) || 100;
    return Array.from({ length: 12 }, (_, index) => {
      const wave = 52 + Math.sin((index + 1) * 0.72) * 19;
      const scale = Math.min(1.16, Math.max(0.84, cap / Math.max(cap, 100)));
      return Math.max(18, Math.min(88, Math.round(wave * scale)));
    });
  }, [asset?.specifications?.design_capacity, asset?.specifications?.maximum_capacity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAsset(id)
      .then((d) => !cancelled && setAsset(d))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load asset"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="asset-detail-page">
        <div className="metric__notice">Loading asset…</div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="asset-detail-page">
        <div className="metric__notice metric__notice--error">{error || "Asset not found"}</div>
      </div>
    );
  }

  const backTo = "/asset-registry";
  const latitude = Number(asset.latitude);
  const longitude = Number(asset.longitude);
  const hasLocation = validCoord(latitude, longitude);
  const categoryLabel = CATEGORY_LABEL[asset.category] || asset.category;
  const showProduction = isProductionAsset(asset);
  const showTopRow = showProduction || hasLocation;
  const editTo = `/asset-registry/edit/${encodeURIComponent(asset.id)}`;

  const handleDelete = async () => {
    if (deleting) return;
    const label = asset.name || asset.id;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteAsset(asset.id);
      navigate(backTo);
    } catch (e) {
      setActionError(e.message || "Couldn't delete asset");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="asset-detail-page">
      <WorkspaceHeader
        title={asset.name || asset.id}
        subtitle={`Asset Registry / ${categoryLabel}`}
        icon={Archive}
        status={statusLabel(asset.status)}
        statusTone={STATUS_TONE[asset.status] || "default"}
        actions={(
          <>
            <WorkspaceHeaderButton icon={ArrowLeft} onClick={() => navigate(backTo)} title="Back to list">
              Back
            </WorkspaceHeaderButton>
            <WorkspaceHeaderButton icon={Edit2} onClick={() => navigate(editTo)} title="Edit asset">
              Edit
            </WorkspaceHeaderButton>
            <WorkspaceHeaderButton icon={Trash2} tone="danger" onClick={handleDelete} disabled={deleting} title="Delete asset">
              {deleting ? "Deleting..." : "Delete"}
            </WorkspaceHeaderButton>
          </>
        )}
      />

      <div className="form-container">
        {actionError && <div className="metric__notice metric__notice--error">{actionError}</div>}

        {showTopRow && (
          <div className={`view-asset-top-row${showProduction && hasLocation ? "" : " view-asset-top-row--single"}`}>
            {showProduction && (
              <div className="form-section view-asset-top-row__chart">
                <h3>Historical Production</h3>
                <div className="view-asset-top-row__visual">
                  <ProductionPlaceholder bars={productionBars} />
                </div>
              </div>
            )}

            {hasLocation && (
              <aside className="form-section view-asset-top-row__map">
                <h3>Geographic Location</h3>
                <div className="map-section">
                  <MapContainer
                    center={[latitude, longitude]}
                    zoom={10}
                    className="view-asset-top-row__map-canvas"
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={18}
                    />
                    <Marker position={[latitude, longitude]}>
                      <Popup>Asset Location<br />{latitude.toFixed(6)}, {longitude.toFixed(6)}</Popup>
                    </Marker>
                  </MapContainer>
                </div>
              </aside>
            )}
          </div>
        )}

        <div className="view-asset-split">
          <div className="view-asset-split__main">
            <AssetDetailFields asset={asset} />
          </div>
        </div>
      </div>
    </div>
  );
}

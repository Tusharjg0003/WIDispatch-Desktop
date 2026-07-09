import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchAsset } from "../api/metrics";
import AssetDetailFields from "../components/AssetDetailFields";
import "./AssetDetailPage.css";

const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations" };

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const backTo = `/asset-registry/${asset.category}`;
  const hasLocation = validCoord(asset.latitude, asset.longitude);

  return (
    <div className="asset-detail-page">
      <div className="view-header">
        <div className="breadcrumb">
          <span onClick={() => navigate("/asset-registry")}>Asset Registry</span>
          <span>/</span>
          <span onClick={() => navigate(backTo)}>{CATEGORY_LABEL[asset.category] || asset.category}</span>
          <span>/</span>
          <span>{asset.name || asset.id}</span>
        </div>
        <div className="view-actions">
          <button onClick={() => navigate(backTo)} title="Back to list">
            <ArrowLeft />
          </button>
        </div>
      </div>

      <div className="form-container">
        <div className="view-asset-meta">
          <h3>System Information</h3>
          <div className="view-asset-meta__row">
            <div className="view-asset-meta__field">
              <label>Generated ID</label>
              <code className="generated-id-code">{asset.id}</code>
            </div>
            <div className="view-asset-meta__field">
              <label>Created</label>
              <div className="form-display">{asset.created_at ? new Date(asset.created_at).toLocaleString() : "N/A"}</div>
            </div>
            <div className="view-asset-meta__field">
              <label>Last Updated</label>
              <div className="form-display">{asset.updated_at ? new Date(asset.updated_at).toLocaleString() : "N/A"}</div>
            </div>
          </div>
        </div>

        {hasLocation && (
          <div className="view-asset-top-row">
            <div className="form-section">
              <h3>Geographic Location</h3>
              <div className="map-section">
                <MapContainer
                  center={[asset.latitude, asset.longitude]}
                  zoom={10}
                  className="view-asset-top-row__map-canvas"
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={18}
                  />
                  <Marker position={[asset.latitude, asset.longitude]}>
                    <Popup>Asset Location<br />{asset.latitude.toFixed(6)}, {asset.longitude.toFixed(6)}</Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>
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

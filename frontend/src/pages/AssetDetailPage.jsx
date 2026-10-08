import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive, ArrowLeft, CircleDot, Cylinder, Droplets, Edit2, Factory, MapPinned, Trash2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { deleteAsset, fetchAsset } from "../api/metrics";
import AssetDetailFields, { DetailCard, formatDate } from "../components/AssetDetailFields";
import WorkspaceHeader, { WorkspaceHeaderButton } from "../components/WorkspaceHeader";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import { assetMarkerIcon } from "../lib/assetMarker";
import "../components/AssetMapView.css";
import "./AssetDetailPage.css";

// Same icon per category as the registry, the canvas and the legend.
const CATEGORY_ICONS = { plant: Factory, pump: Droplets, tank: Cylinder, handover_point: MapPinned };
const CATEGORY_NAME = { plant: "Plant", pump: "Pump station", tank: "Tank", handover_point: "City gate" };
const STATUS_PILL = { operational: "ok", maintenance: "warn", under_construction: "acc", planned: "acc", decommissioned: "err" };
const headlineCapacity = (asset) => {
  const spec = asset.specifications || {};
  if (asset.category === "tank") {
    const v = Number(spec.total_capacity_m3);
    return Number.isFinite(v) && v > 0 ? `${v.toLocaleString()} m³` : null;
  }
  const v = Number(spec.design_capacity ?? spec.contracted_capacity ?? spec.maximum_capacity);
  return Number.isFinite(v) && v > 0 ? `${v.toLocaleString()} m³/day` : null;
};
// Leaflet only re-measures on window resizes; the map's box also changes when
// the layout switches between one and two columns, so follow the box itself.
function FitToContainer() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const formatDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

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
  const SummaryIcon = CATEGORY_ICONS[asset.category] || CircleDot;
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
    <div className="asset-detail-page ad-page">
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

      {actionError && <div className="metric__notice metric__notice--error">{actionError}</div>}

      {/* Summary: who / what / state at a glance. */}
      <section className="ad-summary" style={{ "--ad-colour": ENTITY_TYPE_COLORS[asset.category] || "var(--acc)" }}>
        <span className="ad-summary__icon" aria-hidden="true"><SummaryIcon size={22} /></span>
        <div className="ad-summary__titles">
          <span className="ad-summary__eyebrow">
            {CATEGORY_NAME[asset.category] || categoryLabel}
            {asset.asset_type ? ` · ${asset.asset_type}` : ""}
          </span>
          <h2 className="ad-summary__name">{asset.name || asset.id}</h2>
          <div className="ad-summary__meta">
            <span className={`ad-pill ad-pill--${STATUS_PILL[asset.status] || "off"}`}>{statusLabel(asset.status) || "No status"}</span>
            <span className="ad-mono ad-summary__id">{asset.generated_id || asset.id}</span>
          </div>
        </div>
        <dl className="ad-facts">
          {[
            ["Capacity", headlineCapacity(asset)],
            ["Region", asset.region],
            ["Commissioned", formatDate(asset.commissioning_date)],
          ].map(([label, value]) => (
            <div key={label} className="ad-fact">
              <dt>{label}</dt>
              <dd>{value || <span className="ad-empty">—</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="ad-layout">
        <div className="ad-main">
          <AssetDetailFields asset={asset} />
        </div>

        <aside className="ad-side">
          <DetailCard title="Location">
            {hasLocation ? (
              <>
                <div className="ad-map">
                  <MapContainer center={[latitude, longitude]} zoom={10} className="ad-map__canvas">
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={18}
                    />
                    <FitToContainer />
                    <Marker position={[latitude, longitude]} icon={assetMarkerIcon(asset.category, asset.status, 34)}>
                      <Popup>{asset.name || asset.id}<br />{latitude.toFixed(6)}, {longitude.toFixed(6)}</Popup>
                    </Marker>
                  </MapContainer>
                </div>
                <dl className="ad-grid ad-grid--two">
                  <div className="ad-field"><dt>Latitude (Y)</dt><dd className="ad-mono">{latitude.toFixed(6)}</dd></div>
                  <div className="ad-field"><dt>Longitude (X)</dt><dd className="ad-mono">{longitude.toFixed(6)}</dd></div>
                </dl>
              </>
            ) : (
              <p className="ad-note">No coordinates recorded for this asset.</p>
            )}
          </DetailCard>

          {showProduction && (
            <DetailCard title="Production history">
              <ProductionPlaceholder bars={productionBars} />
            </DetailCard>
          )}

          <DetailCard
            title="Record"
            rows={[
              ["Generated ID", asset.generated_id || asset.id, { mono: true, full: true }],
              ["External ID", asset.external_id, { mono: true, full: true }],
              ["Created", formatDateTime(asset.created_at)],
              ["Last updated", formatDateTime(asset.updated_at)],
            ]}
          />
        </aside>
      </div>
    </div>
  );
}

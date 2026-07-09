import React, { useState } from "react";
import { createAsset, updateAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import MapLocationPicker from "./MapLocationPicker";
import PlantFields from "./PlantFields";
import PumpStationFields from "./PumpStationFields";
import HandoverPointFields from "./HandoverPointFields";
import { allowedAssetTypesForCategory, canonicalizeAssetType } from "../lib/assetTypes";
import "./AssetForm.css";

const CATEGORIES = [
  { value: "plant", label: "Plant" },
  { value: "pump", label: "Pump Station" },
  { value: "handover_point", label: "Handover Point" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const HANDOVER_STATUSES = ["planned", "under_construction", "operational", "decommissioned", "inactive"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const DEFAULT_ACTIVITY_BY_CATEGORY = {
  plant: "Water production",
  pump: "Water transmission",
  handover_point: "Water distribution",
};

const ACTIVITY_ASSET_TYPES = {
  "Water production": ["Seawater desalination", "Water purification"],
  "Water transmission": ["Pumping station"],
  "Water distribution": ["Handover point/city gate"],
};

const REGIONS = [
  "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Qassim",
  "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jouf",
];

const EMPTY_FORM = {
  category: "plant", name: "", external_id: "", asset_name_ar: "",
  entity: "", entity_type: "", activity: "", asset_type: "", region: "",
  cluster: "", governorate: "", city: "", latitude: "", longitude: "",
  end_latitude: "", end_longitude: "",
  status: "planned", commissioning_date: "", decommissioning_date: "", active: true,
};

function defaultsForCategory(category) {
  const activity = DEFAULT_ACTIVITY_BY_CATEGORY[category] || "";
  return {
    category,
    activity,
    asset_type: "",
    region: "",
    status: category === "pump" ? "inactive" : "planned",
  };
}

const isLinearAssetType = (assetType) =>
  /pipeline|network|collection|distribution|transmission/i.test(assetType || "");

// Map a fetched asset document back into the flat form shape.
function formFromAsset(asset) {
  return {
    category: asset.category || "plant",
    name: asset.name || "",
    external_id: asset.external_id || "",
    asset_name_ar: asset.asset_name_ar || "",
    entity: asset.entity || "",
    entity_type: asset.entity_type || "",
    activity: asset.activity || DEFAULT_ACTIVITY_BY_CATEGORY[asset.category] || "",
    asset_type: canonicalizeAssetType(asset.asset_type) || asset.asset_type || "",
    region: asset.region || "",
    cluster: asset.cluster || "",
    governorate: asset.governorate && asset.governorate !== "NULL" ? asset.governorate : "",
    city: asset.city || "",
    latitude: asset.latitude ?? "",
    longitude: asset.longitude ?? "",
    end_latitude: asset.end_latitude ?? "",
    end_longitude: asset.end_longitude ?? "",
    status: asset.status || "planned",
    commissioning_date: asset.commissioning_date || "",
    decommissioning_date: asset.decommissioning_date || "",
    active: asset.active ?? true,
  };
}

export default function AssetForm({ mode = "create", defaultCategory = "plant", initialAsset = null, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(
    isEdit && initialAsset ? formFromAsset(initialAsset) : { ...EMPTY_FORM, ...defaultsForCategory(defaultCategory) }
  );
  const [spec, setSpec] = useState(
    isEdit && initialAsset && initialAsset.category !== "pump" ? { ...(initialAsset.specifications || {}) } : {}
  );
  const [pumps, setPumps] = useState(
    isEdit && initialAsset && initialAsset.category === "pump"
      // Normalize null capacities to "" so the controlled number input in
      // PumpStationFields stays controlled when seeding a saved pump.
      ? (initialAsset.specifications?.pumps || []).map((p) => ({ ...p, capacity_m3_day: p.capacity_m3_day ?? "" }))
      : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));

  const changeCategory = (e) => {
    const category = e.target.value;
    setForm((f) => ({
      ...f,
      ...defaultsForCategory(category),
    }));
    setSpec({});
    setPumps([]);
  };

  const changeActivity = (e) => {
    const activity = e.target.value;
    setForm((f) => ({
      ...f,
      activity,
      asset_type: "",
    }));
  };

  const setCoords = (lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { category, latitude, longitude, end_latitude, end_longitude, ...top } = form;
    const specifications = category === "pump"
      ? { pumps: pumps.map((p) => ({ ...p, capacity_m3_day: p.capacity_m3_day === "" ? null : Number(p.capacity_m3_day) })) }
      : category === "handover_point"
      ? {
          ...spec,
          capacity_limitation_value:
            spec.capacity_limitation_value === "" || spec.capacity_limitation_value == null
              ? null
              : Number(spec.capacity_limitation_value),
        }
      : spec;
    const payload = { category, ...top, latitude, longitude, end_latitude, end_longitude, specifications };
    try {
      if (isEdit) {
        const updated = await updateAsset(initialAsset.id, payload);
        setSuccess(`Updated “${updated.name}” (${updated.id}).`);
        onSaved?.(updated);
      } else {
        const created = await createAsset(payload);
        setSuccess(`Created “${created.name}” (${created.id}).`);
        setForm({
          ...EMPTY_FORM,
          ...defaultsForCategory(category),
        });
        setSpec({});
        setPumps([]);
        onSaved?.(created);
      }
    } catch (err) {
      setError(err.message || (isEdit ? "Failed to update asset" : "Failed to create asset"));
    } finally {
      setSaving(false);
    }
  };

  const isPump = form.category === "pump";
  const isHandover = form.category === "handover_point";
  const activityOptions = Object.entries(ACTIVITY_ASSET_TYPES)
    .filter(([, types]) => types.some((type) => allowedAssetTypesForCategory(form.category).includes(type)))
    .map(([activity]) => activity);
  const assetTypeOptions = allowedAssetTypesForCategory(form.category).filter((type) =>
    (ACTIVITY_ASSET_TYPES[form.activity] || []).includes(type)
  );
  const generatedAssetId = isEdit
    ? initialAsset?.generated_id || initialAsset?.id
    : form.external_id || null;
  const hasSelectedAssetType = Boolean(form.asset_type);
  const isLinearAsset = isLinearAssetType(form.asset_type);

  return (
    <form className="create-asset-page create-asset-form af__body af__body--page asset-form-roomy" onSubmit={submit}>
      <div className="form-container">
        <div className="generated-id-section view-asset-meta">
          <div className="generated-id-header">
            <h3>Generated Asset ID</h3>
          </div>
          <div className="generated-id-display view-asset-meta__row view-asset-meta__row--single">
            <div className="view-asset-meta__field">
              {generatedAssetId ? (
                <code className="generated-id-code">{generatedAssetId}</code>
              ) : (
                <div className="form-display">Fill in Region, Activity and Asset Type to generate</div>
              )}
            </div>
          </div>
          <p className="view-asset-meta__caption">
            The Generated ID follows the SWA tagging structure and is automatically assigned when the required fields are filled in.
          </p>
        </div>

        <div className="view-asset-top-row view-asset-top-row--single">
          <aside className="form-section view-asset-top-row__map">
            <h2>Geographic Location</h2>
            <div className="form-grid af__grid">
              {isLinearAsset ? (
                <>
                  <Field label="Start X-Coordinate">
                    <input type="number" step="any" value={form.longitude} onChange={set("longitude")} />
                  </Field>
                  <Field label="Start Y-Coordinate">
                    <input type="number" step="any" value={form.latitude} onChange={set("latitude")} />
                  </Field>
                  <Field label="End X-Coordinate">
                    <input type="number" step="any" value={form.end_longitude} onChange={set("end_longitude")} />
                  </Field>
                  <Field label="End Y-Coordinate">
                    <input type="number" step="any" value={form.end_latitude} onChange={set("end_latitude")} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="X-Coordinate">
                    <input type="number" step="any" value={form.longitude} onChange={set("longitude")} />
                  </Field>
                  <Field label="Y-Coordinate">
                    <input type="number" step="any" value={form.latitude} onChange={set("latitude")} />
                  </Field>
                </>
              )}
            </div>
            <MapLocationPicker
              latitude={form.latitude}
              longitude={form.longitude}
              onChange={setCoords}
              className="map-section"
              canvasClassName="map-container view-asset-top-row__map-canvas"
              showInstructionHeader
            />
          </aside>
        </div>

        <div className="view-asset-split">
          <div className="view-asset-split__main">
            <div className="form-content">
              <h3>General Information</h3>
              <div className="form-grid af__grid">
                <Field label="Category *">
                  {isEdit ? (
                    <input value={CATEGORY_LABEL[form.category] || form.category} readOnly disabled />
                  ) : (
                    <select value={form.category} onChange={changeCategory} required>
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="External ID"><input value={form.external_id} onChange={set("external_id")} /></Field>
                <Field label="Asset Name (EN) *"><input value={form.name} onChange={set("name")} required placeholder="Asset name" /></Field>
                <Field label="Asset Name (AR)"><input value={form.asset_name_ar} onChange={set("asset_name_ar")} dir="rtl" /></Field>
                <Field label="Region *">
                  {isHandover ? (
                    <select value={form.region} onChange={set("region")} required>
                      <option value="" disabled>Select region</option>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <input value={form.region} onChange={set("region")} required />
                  )}
                </Field>
                <Field label="Cluster"><input value={form.cluster} onChange={set("cluster")} /></Field>
                <Field label="Governorate"><input value={form.governorate} onChange={set("governorate")} /></Field>
                <Field label="City"><input value={form.city} onChange={set("city")} /></Field>
                {isPump ? (
                  <Toggle
                    label="Active"
                    checked={form.status === "operational"}
                    onChange={(v) => setForm((f) => ({ ...f, status: v ? "operational" : "inactive" }))}
                  />
                ) : (
                  <Field label="Operational Status">
                    <select value={form.status} onChange={set("status")}>
                      {(isHandover ? HANDOVER_STATUSES : STATUSES).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Entity"><input value={form.entity} onChange={set("entity")} /></Field>
                <Field label="Entity Type"><input value={form.entity_type} onChange={set("entity_type")} placeholder="e.g. Private" /></Field>
                <Field label="Activity *">
                  <select value={form.activity} onChange={changeActivity} required>
                    <option value="" disabled>Select activity</option>
                    {activityOptions.map((activity) => (
                      <option key={activity} value={activity}>{activity}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Asset Type *">
                  <select value={form.asset_type} onChange={set("asset_type")} required disabled={!form.activity}>
                    <option value="" disabled>{form.activity ? "Select asset type" : "Select activity first"}</option>
                    {assetTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </Field>
                {isHandover && (
                  <Toggle
                    label="Active"
                    checked={form.active}
                    onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  />
                )}
                <Field label="Commissioning Date"><input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} /></Field>
                <Field label="Decommissioning Date"><input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} /></Field>
              </div>
            </div>

            {hasSelectedAssetType && form.category === "plant" && (
              <PlantFields
                spec={spec}
                set={setSpecField}
                commissioningDate={form.commissioning_date}
                decommissioningDate={form.decommissioning_date}
              />
            )}
            {hasSelectedAssetType && isPump && <PumpStationFields pumps={pumps} setPumps={setPumps} />}
            {hasSelectedAssetType && isHandover && <HandoverPointFields spec={spec} set={setSpecField} />}
          </div>
        </div>

        <div className="swa-info-section">
          <h3>Saudi Water Authority Tagging System</h3>
          <div className="info-grid">
            <div className="info-card">
              <h4>Region Code</h4>
              <p>Geographical location within Saudi Arabia (2 letters)</p>
            </div>
            <div className="info-card">
              <h4>Activity Code</h4>
              <p>Primary function of the infrastructure (2 letters)</p>
            </div>
            <div className="info-card">
              <h4>Asset Code</h4>
              <p>Specific type of infrastructure (2 letters)</p>
            </div>
            <div className="info-card">
              <h4>Sequence Number</h4>
              <p>Unique sequential identifier (7 digits)</p>
            </div>
          </div>
        </div>

        {error && <div className="af__error">{error}</div>}
        {success && <div className="af__success">{success}</div>}

        <footer className="af__footer">
          <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create asset"}
          </button>
        </footer>
      </div>
    </form>
  );
}

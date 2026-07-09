import React, { useState } from "react";
import { createAsset, updateAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import MapLocationPicker from "./MapLocationPicker";
import PlantFields from "./PlantFields";
import PumpStationFields from "./PumpStationFields";
import HandoverPointFields from "./HandoverPointFields";

const CATEGORIES = [
  { value: "plant", label: "Plant" },
  { value: "pump", label: "Pump Station" },
  { value: "handover_point", label: "Handover Point" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const HANDOVER_STATUSES = ["planned", "under_construction", "operational", "decommissioned", "inactive"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const ACTIVITY_ASSET_TYPES = {
  "Water distribution": ["Handover point / city gate", "Distribution network", "Filling station"],
  "Wastewater collection": ["Collection network"],
  "TSE reuse": ["Filling station"],
};
const DEFAULT_ACTIVITY = "Water distribution";

const REGIONS = [
  "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Qassim",
  "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jouf",
];

const EMPTY_FORM = {
  category: "plant", name: "", external_id: "", asset_name_ar: "",
  entity: "", entity_type: "", activity: "", asset_type: "", region: "",
  cluster: "", governorate: "", city: "", latitude: "", longitude: "",
  status: "planned", commissioning_date: "", decommissioning_date: "", active: true,
};

// Map a fetched asset document back into the flat form shape.
function formFromAsset(asset) {
  return {
    category: asset.category || "plant",
    name: asset.name || "",
    external_id: asset.external_id || "",
    asset_name_ar: asset.asset_name_ar || "",
    entity: asset.entity || "",
    entity_type: asset.entity_type || "",
    activity: asset.activity || "",
    asset_type: asset.asset_type || "",
    region: asset.region || "",
    cluster: asset.cluster || "",
    governorate: asset.governorate && asset.governorate !== "NULL" ? asset.governorate : "",
    city: asset.city || "",
    latitude: asset.latitude ?? "",
    longitude: asset.longitude ?? "",
    status: asset.status || "planned",
    commissioning_date: asset.commissioning_date || "",
    decommissioning_date: asset.decommissioning_date || "",
    active: asset.active ?? true,
  };
}

export default function AssetForm({ mode = "create", defaultCategory = "plant", initialAsset = null, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(
    isEdit && initialAsset ? formFromAsset(initialAsset) : { ...EMPTY_FORM, category: defaultCategory }
  );
  const [spec, setSpec] = useState(
    isEdit && initialAsset && initialAsset.category !== "pump" ? { ...(initialAsset.specifications || {}) } : {}
  );
  const [pumps, setPumps] = useState(
    isEdit && initialAsset && initialAsset.category === "pump" ? [...(initialAsset.specifications?.pumps || [])] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));

  const changeCategory = (e) => {
    const category = e.target.value;
    const wasHandover = form.category === "handover_point";
    const isHandover = category === "handover_point";
    setForm((f) => ({
      ...f,
      category,
      status: category === "pump" ? "inactive" : "planned",
      ...(isHandover && {
        activity: DEFAULT_ACTIVITY,
        asset_type: ACTIVITY_ASSET_TYPES[DEFAULT_ACTIVITY][0],
        region: "",
      }),
      ...(wasHandover && !isHandover && { activity: "", asset_type: "", region: "" }),
    }));
    setSpec({});
    setPumps([]);
  };

  const changeActivity = (e) => {
    const activity = e.target.value;
    const types = ACTIVITY_ASSET_TYPES[activity] || [];
    setForm((f) => ({ ...f, activity, asset_type: types[0] || "" }));
  };

  const setCoords = (lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { category, latitude, longitude, ...top } = form;
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
    const payload = { category, ...top, latitude, longitude, specifications };
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
          category,
          ...(category === "handover_point" && {
            activity: DEFAULT_ACTIVITY,
            asset_type: ACTIVITY_ASSET_TYPES[DEFAULT_ACTIVITY][0],
          }),
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

  return (
    <form className="af__body af__body--page" onSubmit={submit}>
      <div className="af__section">Classification</div>
      <div className="af__grid">
        <Field label="Category *">
          {isEdit ? (
            <input value={CATEGORY_LABEL[form.category] || form.category} readOnly disabled />
          ) : (
            <select value={form.category} onChange={changeCategory} required>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
        </Field>
        {isHandover ? (
          <>
            <Field label="Activity *">
              <select value={form.activity} onChange={changeActivity} required>
                {Object.keys(ACTIVITY_ASSET_TYPES).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Asset Type *">
              <select value={form.asset_type} onChange={set("asset_type")} required>
                {(ACTIVITY_ASSET_TYPES[form.activity] || []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Asset Type *">
              <input value={form.asset_type} onChange={set("asset_type")} required placeholder="e.g. Seawater desalination" />
            </Field>
            <Field label="Activity *">
              <input value={form.activity} onChange={set("activity")} required placeholder="e.g. Water production" />
            </Field>
          </>
        )}
      </div>

      <div className="af__section">Identity</div>
      <div className="af__grid">
        <Field label="External ID"><input value={form.external_id} onChange={set("external_id")} /></Field>
        <Field label="Asset Name (EN) *"><input value={form.name} onChange={set("name")} required placeholder="Asset name" /></Field>
        <Field label="Asset Name (AR)"><input value={form.asset_name_ar} onChange={set("asset_name_ar")} dir="rtl" /></Field>
        <Field label="Entity"><input value={form.entity} onChange={set("entity")} /></Field>
        <Field label="Entity Type"><input value={form.entity_type} onChange={set("entity_type")} placeholder="e.g. Private" /></Field>
      </div>

      <div className="af__section">Location</div>
      <div className="af__grid">
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
        <Field label="X-Coordinate (Longitude)"><input type="number" step="any" value={form.longitude} onChange={set("longitude")} /></Field>
        <Field label="Y-Coordinate (Latitude)"><input type="number" step="any" value={form.latitude} onChange={set("latitude")} /></Field>
      </div>
      <MapLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={setCoords} />

      <div className="af__section">Lifecycle</div>
      <div className="af__grid">
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

      {form.category === "plant" && (
        <PlantFields
          spec={spec}
          set={setSpecField}
          commissioningDate={form.commissioning_date}
          decommissioningDate={form.decommissioning_date}
        />
      )}
      {isPump && <PumpStationFields pumps={pumps} setPumps={setPumps} />}
      {isHandover && <HandoverPointFields spec={spec} set={setSpecField} />}

      {error && <div className="af__error">{error}</div>}
      {success && <div className="af__success">{success}</div>}

      <footer className="af__footer">
        <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create asset"}
        </button>
      </footer>
    </form>
  );
}

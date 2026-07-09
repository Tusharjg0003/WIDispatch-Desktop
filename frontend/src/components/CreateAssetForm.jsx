import React, { useState } from "react";
import { createAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import MapLocationPicker from "./MapLocationPicker";
import PlantFields from "./PlantFields";
import PumpStationFields from "./PumpStationFields";

const CATEGORIES = [
  { value: "plant", label: "Plant" },
  { value: "pump", label: "Pump Station" },
];

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const EMPTY_FORM = {
  category: "plant", name: "", external_id: "", asset_name_ar: "",
  entity: "", entity_type: "", activity: "", asset_type: "", region: "",
  cluster: "", governorate: "", city: "", latitude: "", longitude: "",
  status: "planned", commissioning_date: "", decommissioning_date: "",
};

export default function CreateAssetForm({ defaultCategory = "plant", onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, category: defaultCategory });
  const [spec, setSpec] = useState({});
  const [pumps, setPumps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));

  const changeCategory = (e) => {
    const category = e.target.value;
    setForm((f) => ({ ...f, category, status: category === "pump" ? "inactive" : "planned" }));
    setSpec({});
    setPumps([]);
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
      : spec;
    const payload = { category, ...top, latitude, longitude, specifications };
    try {
      const created = await createAsset(payload);
      setSuccess(`Created “${created.name}” (${created.id}).`);
      setForm({ ...EMPTY_FORM, category });
      setSpec({});
      setPumps([]);
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  const isPump = form.category === "pump";

  return (
    <form className="af__body af__body--page" onSubmit={submit}>
      <div className="af__section">Classification</div>
      <div className="af__grid">
        <Field label="Category *">
          <select value={form.category} onChange={changeCategory} required>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Asset Type *">
          <input value={form.asset_type} onChange={set("asset_type")} required placeholder="e.g. Seawater desalination" />
        </Field>
        <Field label="Activity *">
          <input value={form.activity} onChange={set("activity")} required placeholder="e.g. Water production" />
        </Field>
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
        <Field label="Region *"><input value={form.region} onChange={set("region")} required /></Field>
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
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </Field>
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

      {error && <div className="af__error">{error}</div>}
      {success && <div className="af__success">{success}</div>}

      <footer className="af__footer">
        <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Create asset"}
        </button>
      </footer>
    </form>
  );
}

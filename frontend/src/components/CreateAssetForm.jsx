import React, { useState } from "react";
import { createAsset } from "../api/metrics";

const CATEGORIES = [
  { value: "plant", label: "Plant" },
  { value: "pump", label: "Pump" },
  { value: "valve", label: "Valve" },
  { value: "pipeline", label: "Pipeline" },
];

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const EMPTY_FORM = {
  category: "plant", name: "", id: "", external_id: "", asset_name_ar: "",
  entity: "", entity_type: "", activity: "", asset_type: "", region: "",
  cluster: "", governorate: "", city: "", latitude: "", longitude: "",
  status: "planned", commissioning_date: "", decommissioning_date: "",
  technology: "", water_source: "", design_capacity: "", contracted_capacity: "",
};

function Field({ label, children }) {
  return (
    <label className="af__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function CreateAssetForm({ defaultCategory = "plant", onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, category: defaultCategory });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { category, latitude, longitude, technology, water_source,
      design_capacity, contracted_capacity, ...top } = form;
    const payload = {
      category, ...top, latitude, longitude,
      specifications: { technology, water_source, design_capacity, contracted_capacity },
    };
    try {
      const created = await createAsset(payload);
      setSuccess(`Created “${created.name}” (${created.id}).`);
      setForm({ ...EMPTY_FORM, category });
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="af__body af__body--page" onSubmit={submit}>
      <div className="af__section">Classification</div>
      <div className="af__grid">
        <Field label="Category *">
          <select value={form.category} onChange={set("category")} required>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Asset type">
          <input value={form.asset_type} onChange={set("asset_type")} placeholder="e.g. Seawater desalination" />
        </Field>
        <Field label="Activity">
          <input value={form.activity} onChange={set("activity")} placeholder="e.g. Water production" />
        </Field>
      </div>

      <div className="af__section">Identity</div>
      <div className="af__grid">
        <Field label="Name *"><input value={form.name} onChange={set("name")} required placeholder="Asset name" /></Field>
        <Field label="Name (Arabic)"><input value={form.asset_name_ar} onChange={set("asset_name_ar")} dir="rtl" /></Field>
        <Field label="ID"><input value={form.id} onChange={set("id")} placeholder="Auto-generated if blank" /></Field>
        <Field label="External ID"><input value={form.external_id} onChange={set("external_id")} /></Field>
        <Field label="Entity"><input value={form.entity} onChange={set("entity")} /></Field>
        <Field label="Entity type"><input value={form.entity_type} onChange={set("entity_type")} placeholder="e.g. Private" /></Field>
      </div>

      <div className="af__section">Location</div>
      <div className="af__grid">
        <Field label="Region"><input value={form.region} onChange={set("region")} /></Field>
        <Field label="Cluster"><input value={form.cluster} onChange={set("cluster")} /></Field>
        <Field label="Governorate"><input value={form.governorate} onChange={set("governorate")} /></Field>
        <Field label="City"><input value={form.city} onChange={set("city")} /></Field>
        <Field label="Latitude"><input type="number" step="any" value={form.latitude} onChange={set("latitude")} /></Field>
        <Field label="Longitude"><input type="number" step="any" value={form.longitude} onChange={set("longitude")} /></Field>
      </div>

      <div className="af__section">Lifecycle</div>
      <div className="af__grid">
        <Field label="Commissioning date"><input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} /></Field>
        <Field label="Decommissioning date"><input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} /></Field>
      </div>

      <div className="af__section">Specifications</div>
      <div className="af__grid">
        <Field label="Technology"><input value={form.technology} onChange={set("technology")} placeholder="e.g. RO" /></Field>
        <Field label="Water source"><input value={form.water_source} onChange={set("water_source")} placeholder="e.g. Seawater" /></Field>
        <Field label="Design capacity (m³/day)"><input type="number" step="any" value={form.design_capacity} onChange={set("design_capacity")} /></Field>
        <Field label="Contracted capacity (m³/day)"><input type="number" step="any" value={form.contracted_capacity} onChange={set("contracted_capacity")} /></Field>
      </div>

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

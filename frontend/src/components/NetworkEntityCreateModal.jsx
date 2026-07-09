import React, { useState } from "react";
import { createAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import PlantQuickFields from "./PlantQuickFields";
import PumpStationFields from "./PumpStationFields";
import HandoverPointFields from "./HandoverPointFields";
import { allowedAssetTypesForCategory } from "../lib/assetTypes";

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const HANDOVER_STATUSES = ["planned", "under_construction", "operational", "decommissioned", "inactive"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const TITLES = { plant: "Add Plant", pump: "Add Pump Station", handover_point: "Add Handover Point" };
const DEFAULT_ACTIVITY_BY_CATEGORY = {
  plant: "Water production",
  pump: "Water transmission",
  handover_point: "Water distribution",
};

const EMPTY_FORM = {
  name: "", status: "planned", commissioning_date: "", decommissioning_date: "", active: true,
  activity: "", asset_type: "", region: "", entity_category: "",
  design_capacity: "", capacity_limit_mode: "none", capacity_limit_percentage: "", capacity_limit_absolute: "",
};

function defaultsForType(type) {
  const assetTypes = allowedAssetTypesForCategory(type);
  return {
    activity: DEFAULT_ACTIVITY_BY_CATEGORY[type] || "",
    asset_type: assetTypes.length === 1 ? assetTypes[0] : "",
  };
}

// Quick-add modal for the Network Builder's "Plant"/"Pump" insert-toolbar
// flow. Unlike CreateAssetForm (the Asset Registry page's full form), this
// asks a deliberately short field set. Always creates a real Asset
// Registry record via the same createAsset API the registry form uses;
// `onCreated` hands the created asset back to the caller, which is
// responsible for placing a canvas node for it.
export default function NetworkEntityCreateModal({ type, initialForm = null, onCancel, onCreated }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...defaultsForType(type), ...(initialForm || {}) }));
  const [spec, setSpec] = useState({});
  const [pumps, setPumps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));
  const isPlant = type === "plant";
  const isPump = type === "pump";
  const isHandover = type === "handover_point";
  const assetTypeOptions = allowedAssetTypesForCategory(type);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const specifications = isPlant
      ? {
          ...spec,
          design_capacity: form.design_capacity,
          capacity_limit_mode: form.capacity_limit_mode,
          ...(form.capacity_limit_mode === "percentage"
            ? { capacity_limit_percentage: form.capacity_limit_percentage }
            : {}),
          ...(form.capacity_limit_mode === "absolute"
            ? { capacity_limit_absolute: form.capacity_limit_absolute }
            : {}),
        }
      : isHandover
      ? {
          ...spec,
          capacity_limitation_value:
            spec.capacity_limitation_value === "" || spec.capacity_limitation_value == null
              ? null
              : Number(spec.capacity_limitation_value),
        }
      : {
          pumps: pumps.map((p) => ({
            ...p,
            capacity_m3_day: p.capacity_m3_day === "" ? null : Number(p.capacity_m3_day),
          })),
        };

    const payload = {
      category: type,
      name: form.name,
      status: form.status,
      commissioning_date: form.commissioning_date,
      decommissioning_date: form.decommissioning_date,
      active: form.active,
      activity: form.activity,
      asset_type: form.asset_type,
      ...(isPlant || isHandover
        ? { region: form.region, entity_category: form.entity_category }
        : {}),
      specifications,
    };

    try {
      const created = await createAsset(payload);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="af__overlay" onMouseDown={onCancel}>
      <div className="af__modal nb-entity-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="af__head">
          <h2 className="af__title">{TITLES[type] || "Add asset"}</h2>
          <button className="af__close" onClick={onCancel} aria-label="Close">×</button>
        </header>
        <form className="af__body" onSubmit={submit}>
          <div className="af__grid">
            <Field label="Name *">
              <input type="text" value={form.name} onChange={set("name")} required autoFocus />
            </Field>
            <Field label="Asset Type *">
              <select value={form.asset_type} onChange={set("asset_type")} required>
                <option value="" disabled>Select asset type</option>
                {assetTypeOptions.map((assetType) => (
                  <option key={assetType} value={assetType}>{assetType}</option>
                ))}
              </select>
            </Field>
            {isPlant && (
              <>
                <Field label="Activity"><input value={form.activity} onChange={set("activity")} /></Field>
              </>
            )}
            {isHandover && (
              <Field label="Region">
                <input value={form.region} onChange={set("region")} />
              </Field>
            )}
            <Field label="Status">
              <select value={form.status} onChange={set("status")}>
                {(isHandover ? HANDOVER_STATUSES : STATUSES).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </Field>
            {isPlant && (
              <>
                <Field label="Capacity (m³/day)">
                  <input type="number" step="any" value={form.design_capacity} onChange={set("design_capacity")} />
                </Field>
                <Field label="Capacity Limitation">
                  <select value={form.capacity_limit_mode} onChange={set("capacity_limit_mode")}>
                    <option value="none">None</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="absolute">Absolute (m³/day)</option>
                  </select>
                </Field>
                {form.capacity_limit_mode === "percentage" && (
                  <Field label="Percentage (%)">
                    <input type="number" step="any" min="0" max="100" value={form.capacity_limit_percentage} onChange={set("capacity_limit_percentage")} />
                  </Field>
                )}
                {form.capacity_limit_mode === "absolute" && (
                  <Field label="Absolute (m³/day)">
                    <input type="number" step="any" value={form.capacity_limit_absolute} onChange={set("capacity_limit_absolute")} />
                  </Field>
                )}
                <Field label="Region"><input value={form.region} onChange={set("region")} /></Field>
                <Field label="Entity Category">
                  <select value={form.entity_category} onChange={set("entity_category")}>
                    <option value="">—</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Commissioning Date">
              <input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} />
            </Field>
            <Field label="Decommissioning Date">
              <input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} />
            </Field>
            <Toggle
              label="Active"
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>

          {isPlant && <PlantQuickFields spec={spec} set={setSpecField} />}
          {isPump && <PumpStationFields pumps={pumps} setPumps={setPumps} />}
          {isHandover && <HandoverPointFields spec={spec} set={setSpecField} />}

          {error && <div className="af__error">{error}</div>}

          <div className="af__footer">
            <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
              {saving ? "Saving…" : `Add ${isPlant ? "plant" : isHandover ? "handover point" : "pump station"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

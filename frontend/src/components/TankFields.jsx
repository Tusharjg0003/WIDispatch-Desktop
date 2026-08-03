import React, { useEffect, useMemo, useState } from "react";
import { fetchTransmissionSystems } from "../api/metrics";
import { Field } from "./AssetFormControls";

const MATERIALS = ["Concrete", "Steel", "Fiberglass", "Ductile iron", "Other"];

export default function TankFields({ spec, set, setSpec }) {
  const [systems, setSystems] = useState([]);
  const [systemsError, setSystemsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransmissionSystems()
      .then((data) => {
        if (!cancelled) setSystems(data.systems || []);
      })
      .catch((err) => {
        if (!cancelled) setSystemsError(err.message || "Couldn't load transmission systems");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assignedSystemId = spec.transmission_system_id || "";
  const assignedSystemName = spec.transmission_system_name || "";
  const selectedSystem = useMemo(
    () => systems.find((system) => system.id === assignedSystemId),
    [systems, assignedSystemId]
  );

  const setTransmissionSystem = (event) => {
    const id = event.target.value;
    const system = systems.find((candidate) => candidate.id === id);
    setSpec((current) => {
      const next = { ...current };
      if (!system) {
        delete next.transmission_system_id;
        delete next.transmission_system_name;
      } else {
        next.transmission_system_id = system.id;
        next.transmission_system_name = system.name || "";
      }
      return next;
    });
  };

  return (
    <div className="form-section">
      <h3>Tank Specifications</h3>
      <div className="form-grid af__grid">
        <Field label="Total Capacity (m³)">
          <input type="number" step="any" value={spec.total_capacity_m3 || ""} onChange={set("total_capacity_m3")} />
        </Field>
        <Field label="Number of Tanks">
          <input type="number" step="1" min="0" value={spec.number_tanks || ""} onChange={set("number_tanks")} />
        </Field>
        <Field label="Storage Material">
          <select value={spec.storage_material || ""} onChange={set("storage_material")}>
            <option value="">—</option>
            {MATERIALS.map((material) => (
              <option key={material} value={material}>{material}</option>
            ))}
          </select>
        </Field>
        <Field label="Transmission System">
          <select value={assignedSystemId} onChange={setTransmissionSystem} disabled={!setSpec}>
            <option value="">Unassigned</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>{system.name || system.id}</option>
            ))}
          </select>
          {systemsError && <div className="form-display">{systemsError}</div>}
        </Field>
        <Field label="Assigned System ID">
          <input value={selectedSystem?.id || assignedSystemId} readOnly />
        </Field>
        <Field label="Assigned System Name">
          <input value={selectedSystem?.name || assignedSystemName} readOnly />
        </Field>
        <Field label="Source">
          <input value={spec.source || ""} onChange={set("source")} />
        </Field>
      </div>
    </div>
  );
}

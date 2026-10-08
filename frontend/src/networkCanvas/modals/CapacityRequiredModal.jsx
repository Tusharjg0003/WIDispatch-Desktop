import React, { useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";

// SWIIMS ensureAssetsHaveCapacity: assets dropped from the library without a
// capacity are listed here so one can be entered before they're used. Values
// are canvas working values for this network (the registry record is
// untouched). "Skip" keeps them without capacity (validation will flag them).
//
// items: [{ id, name, type }]
export default function CapacityRequiredModal({ items, onSubmit, onSkip }) {
  const [values, setValues] = useState(() => Object.fromEntries(items.map((i) => [i.id, ""])));
  const valid = Object.values(values).some((v) => v !== "" && Number(v) >= 0);
  return (
    <FloatingPanel
      title="Capacity required"
      onClose={onSkip}
      storageKey="canvas-form"
      className="nb-pipe-modal"
    >
      <form
        className="af__body"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])));
        }}
      >
        <p className="cr-subtitle" style={{ marginBottom: 8 }}>
          {items.length === 1 ? "This asset has" : `${items.length} assets have`} no capacity in the registry. Enter a capacity for this network, or skip.
        </p>
        <table className="cr-table">
          <thead>
            <tr><th>Asset</th><th>Type</th><th className="num">Capacity (m³/day)</th></tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="cr-td--strong">{item.name}</td>
                <td className="cr-td--muted">{item.type}</td>
                <td className="num">
                  <input
                    className="cr-input"
                    type="number"
                    min="0"
                    step="any"
                    autoFocus={index === 0}
                    value={values[item.id]}
                    onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                    aria-label={`${item.name} capacity`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="af__footer">
          <button type="button" className="af__btn af__btn--ghost" onClick={onSkip}>Skip</button>
          <button type="submit" className="af__btn af__btn--primary" disabled={!valid}>Apply capacities</button>
        </div>
      </form>
    </FloatingPanel>
  );
}

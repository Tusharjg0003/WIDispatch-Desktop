import React from "react";

const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "—");

export default function AssetListView({ assets, onSelect }) {
  return (
    <div className="sheet__table-wrap">
      <table className="ledger ledger--clickable">
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>Type</th><th>Region</th>
            <th>Governorate</th><th>Status</th><th>Commissioned</th>
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 ? (
            <tr><td colSpan={7} className="ledger__empty">No assets match these filters.</td></tr>
          ) : (
            assets.map((a) => (
              <tr key={`${a.category}-${a.id}`} onClick={() => onSelect(a)} tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" ? onSelect(a) : null)}>
                <td className="mono">{a.id}</td>
                <td>{a.name || "—"}</td>
                <td>{a.asset_type || "—"}</td>
                <td>{a.region || "—"}</td>
                <td>{a.governorate && a.governorate !== "NULL" ? a.governorate : "—"}</td>
                <td><span className={`st st--${a.status || "unknown"}`}>{statusLabel(a.status)}</span></td>
                <td className="mono">{fmtDate(a.commissioning_date)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

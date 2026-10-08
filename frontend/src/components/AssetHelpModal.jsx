import React from "react";
import FloatingPanel from "./FloatingPanel";
import "./AssetHelpModal.css";

// Asset Registry → Help: the SWA tagging code reference, in the app's
// floating window (draggable, remembers its spot, can pop out) so it can sit
// beside the create / edit form while filling it in.

const REGION_CODES = {
  "Al Baha": "BA", "Eastern Province": "EP", "Madinah": "MD", "Northern Borders": "NB",
  "Tabuk": "TA", "Al Jawf": "JW", "Hail": "HA", "Makkah": "MK", "Qassim": "QS",
  "Asir": "AS", "Jizan": "JZ", "Najran": "NJ", "Riyadh": "RI",
};
const ACTIVITY_CODES = {
  "Water resources": "WR", "Water production": "WP", "Water transmission": "WT",
  "Strategic storage": "SS", "Water distribution": "WD", "Wastewater collection": "SC",
  "Wastewater treatment": "ST", "TSE reuse": "TR",
};
const ASSET_TYPE_CODES = {
  "Seawater desalination": "DS",
  "Pumping station": "PS",
  "Handover point/city gate": "HP",
  "Water purification": "PR",
};

// The ID's four parts, each with its own tone, reused in the example.
const ID_PARTS = [
  { key: "region", code: "RI", label: "Region", meaning: "Riyadh" },
  { key: "activity", code: "WP", label: "Activity", meaning: "Water production" },
  { key: "type", code: "DS", label: "Asset type", meaning: "Seawater desalination" },
  { key: "seq", code: "0000001", label: "Sequence", meaning: "Asset #1" },
];

function CodeSection({ title, part, codes }) {
  const entries = Object.entries(codes).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="swa-help__section">
      <div className="swa-help__section-head">
        <h4 className="swa-help__section-title">
          <span className={`swa-help__swatch swa-help--${part}`} aria-hidden="true" />
          {title}
        </h4>
        <span className="swa-help__count">{entries.length}</span>
      </div>
      <ul className="swa-help__list">
        {entries.map(([label, code]) => (
          <li key={label} className="swa-help__item">
            <code className={`swa-help__code swa-help--${part}`}>{code}</code>
            <span className="swa-help__label">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AssetHelpModal({ onClose }) {
  return (
    <FloatingPanel title="SWA tagging codes" onClose={onClose} storageKey="swa-help" width={460}>
      <div className="swa-help">
        <section className="swa-help__format" aria-label="Asset ID format">
          <span className="swa-help__eyebrow">Asset ID format</span>
          <div className="swa-help__id" aria-label="Example ID RI-WP-DS-0000001">
            {ID_PARTS.map((p, i) => (
              <React.Fragment key={p.key}>
                {i > 0 && <span className="swa-help__dash" aria-hidden="true">-</span>}
                <span className={`swa-help__part swa-help--${p.key}`}>
                  <code>{p.code}</code>
                  <small>{p.label}</small>
                </span>
              </React.Fragment>
            ))}
          </div>
          <p className="swa-help__note">
            Example: {ID_PARTS.map((p) => p.meaning).join(" · ")}. The ID is generated automatically
            from the Region, Activity and Asset type you pick; the sequence is assigned on save.
          </p>
        </section>

        <CodeSection title="Region codes" part="region" codes={REGION_CODES} />
        <CodeSection title="Activity codes" part="activity" codes={ACTIVITY_CODES} />
        <CodeSection title="Asset type codes" part="type" codes={ASSET_TYPE_CODES} />
      </div>
    </FloatingPanel>
  );
}

import React from "react";
import { X } from "lucide-react";

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

function CodeSection({ title, codes }) {
  return (
    <div className="help-section">
      <h4>{title}</h4>
      <div className="help-codes-grid">
        {Object.entries(codes).map(([label, code]) => (
          <div key={label} className="help-code-item">
            <span className="help-code">{code}</span>
            <span className="help-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssetHelpModal({ onClose }) {
  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h3>SWA Tagging Codes Reference</h3>
          <button className="help-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="help-modal-content">
          <CodeSection title="Region Codes" codes={REGION_CODES} />
          <CodeSection title="Activity Codes" codes={ACTIVITY_CODES} />
          <CodeSection title="Asset Type Codes" codes={ASSET_TYPE_CODES} />
          <div className="help-section">
            <h4>Asset ID Format</h4>
            <div className="help-format">
              <code>REGION - ACTIVITY - ASSET_TYPE - SEQUENCE</code>
              <p>Example: <strong>RI - WP - DS - 0000001</strong></p>
              <p>This represents: Riyadh - Water Production - Seawater Desalination - Asset #0000001</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

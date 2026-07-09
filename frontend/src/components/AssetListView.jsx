import React from "react";
import { ArrowUpRight, Edit3 } from "lucide-react";

const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const gov = (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "N/A");

export default function AssetListView({ assets, onView, onEdit }) {
  return (
    <div className="list-wrapper asset-list-surface">
      <div className="list-content">
        {assets.length === 0 ? (
          <div className="no-data"><p>No entities found for the selected filters.</p></div>
        ) : (
          <div className="professional-table">
            <div className="table-header">
              <div className="table-cell header">Generated ID</div>
              <div className="table-cell header">Asset Name</div>
              <div className="table-cell header">Activity</div>
              <div className="table-cell header">Asset Type</div>
              <div className="table-cell header">Region</div>
              <div className="table-cell header">Governorate</div>
              <div className="table-cell header">Status</div>
              <div className="table-cell header">Actions</div>
            </div>
            <div className="table-body">
              {assets.map((item) => {
                const status = item.status || "unknown";
                return (
                  <div key={`${item.category}-${item.id}`} className="table-row">
                    <div className="table-cell"><span className="generated-id">{item.id || "N/A"}</span></div>
                    <div className="table-cell"><span className="asset-name">{item.name || item.asset_name_ar || "Unnamed Asset"}</span></div>
                    <div className="table-cell">{item.activity || "N/A"}</div>
                    <div className="table-cell">{item.asset_type || "N/A"}</div>
                    <div className="table-cell">{item.region || "N/A"}</div>
                    <div className="table-cell">{gov(item)}</div>
                    <div className="table-cell"><span className={`status-badge ${status}`}>{statusLabel(status)}</span></div>
                    <div className="table-cell">
                      <div className="action-buttons">
                        <button
                          className="asset-table-action-btn asset-table-action-btn--view"
                          onClick={() => onView(item)}
                          title="View Details"
                        >
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className="asset-table-action-btn asset-table-action-btn--edit"
                          onClick={() => onEdit(item)}
                          title="Edit"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

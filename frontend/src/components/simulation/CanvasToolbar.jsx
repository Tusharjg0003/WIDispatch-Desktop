import React from "react";

// A read-only counterpart to the Network Builder's toolbar: view and analysis
// only, no save, undo, draw or placement. Groups are supplied by the caller so
// the bar stays a pure renderer.
export default function CanvasToolbar({ groups }) {
  return (
    <div className="simtoolbar">
      {groups.map((group) => (
        <div key={group.key} className="simtoolbar__group">
          {group.items.map(({ key, label, icon: Icon, title, onClick, active, disabled }) => (
            <button
              key={key}
              type="button"
              className={`simtoolbar__btn${active ? " simtoolbar__btn--active" : ""}`}
              title={title}
              disabled={disabled}
              onClick={onClick}
            >
              {Icon && <Icon size={13} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

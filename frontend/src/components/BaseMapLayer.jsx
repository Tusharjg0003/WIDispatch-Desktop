import React, { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { Pane, TileLayer, useMap } from "react-leaflet";
import { Map as MapIcon, Satellite } from "lucide-react";
import "./BaseMapLayer.css";

// The base map under every Leaflet map in the app, with a Map / Satellite
// switch in the map's corner. Each kind of map (`storageKey`) remembers its
// own choice on this device; maps of the same kind open on screen together
// switch together.
//
// Satellite is Esri World Imagery with Esri's place names and boundaries on
// top, so towns and borders stay readable over the imagery.

const STREETS = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
};
const IMAGERY = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
};
const LABELS = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  maxZoom: 19,
};

export const BASEMAPS = ["streets", "satellite"];
const storageKeyFor = (key) => `widispatch.basemap.${key}`;
const CHANGE_EVENT = "widispatch:basemap";

const read = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(storageKeyFor(key));
    return BASEMAPS.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const memory = new Map(); // key → mode, when storage is unavailable

/** The base map chosen for maps of this kind, and a setter shared by all of them. */
export function useBaseMap(key, fallback = "streets") {
  const mode = useSyncExternalStore(
    (notify) => {
      const onChange = (e) => { if (!e.detail || e.detail === key) notify(); };
      const onStorage = (e) => { if (e.key === storageKeyFor(key)) notify(); };
      window.addEventListener(CHANGE_EVENT, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => memory.get(key) ?? read(key, fallback)
  );
  const setMode = (next) => {
    if (!BASEMAPS.includes(next)) return;
    memory.set(key, next);
    try {
      window.localStorage.setItem(storageKeyFor(key), next);
    } catch {
      // Storage unavailable: the choice lasts for this session.
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
  };
  return [mode, setMode];
}

/**
 * Drop-in for the map's <TileLayer>. `defaultMode` is what this kind of map
 * shows until the user picks; `position` is the switch's corner.
 */
export default function BaseMapLayer({ storageKey, defaultMode = "streets", position = "topright" }) {
  const map = useMap();
  const [mode, setMode] = useBaseMap(storageKey, defaultMode);
  const [box, setBox] = useState(null);

  // The switch lives in a Leaflet control so it sits with the zoom buttons
  // and the map doesn't pan or zoom when it is clicked.
  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const el = L.DomUtil.create("div", "basemap-switch");
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
        return el;
      },
    });
    const control = new Control({ position });
    control.addTo(map);
    setBox(control.getContainer());
    return () => {
      control.remove();
      setBox(null);
    };
  }, [map, position]);

  const option = (value, label, Icon) => (
    <button
      type="button"
      className={mode === value ? "is-active" : ""}
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      title={`${label} view`}
    >
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {mode === "satellite" ? (
        <>
          <TileLayer key="imagery" {...IMAGERY} />
          {/* Above the imagery, below the map's own lines and markers, and
              never in the way of a click. */}
          <Pane name="basemap-labels" style={{ zIndex: 350, pointerEvents: "none" }}>
            <TileLayer key="labels" {...LABELS} />
          </Pane>
        </>
      ) : (
        <TileLayer key="streets" {...STREETS} />
      )}
      {box && createPortal(
        <div className="basemap-switch__group" role="group" aria-label="Base map">
          {option("streets", "Map", MapIcon)}
          {option("satellite", "Satellite", Satellite)}
        </div>,
        box
      )}
    </>
  );
}

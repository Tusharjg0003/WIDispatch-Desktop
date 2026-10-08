import L from "leaflet";
import { makeEntitySymbol, statusBorderColor } from "../cytoscape/entitySymbol";

// Leaflet marker for an asset: the same symbol the network canvas draws for
// its type (type icon + colour in a tinted disc, from entitySymbol.js), ringed
// in its lifecycle colour — so an asset looks identical on every map, the
// canvas, the library and the legend. Styled by components/AssetMapView.css.
// Cached per type × status × size.
const cache = new Map();

export function assetMarkerIcon(category, status, size = 30) {
  const key = `${category}|${status || ""}|${size}`;
  if (!cache.has(key)) {
    const symbol = makeEntitySymbol({ type: category, symbolShape: "circle" });
    cache.set(
      key,
      L.divIcon({
        className: "asset-map-marker",
        html: `<span class="asset-map-marker__ring" style="--ring:${statusBorderColor(status)}"><img src="${symbol}" alt="" draggable="false" /></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        tooltipAnchor: [0, -size / 2],
        popupAnchor: [0, -size / 2],
      })
    );
  }
  return cache.get(key);
}

import JSZip from "jszip";

// KMZ/KML import & export for the Network Builder. Ported from the reference
// SWIIMS networkKmz.js; the only change is the ExtendedData namespace
// (widispatch* rather than swiims*). A round-tripped file re-imports its own
// asset types exactly; a generic Google Earth / QGIS export is classified by
// kmzEntityClassifier.js.

const xml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const safeName = (value) => String(value || "network").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "network";

const extendedData = (data) => `<ExtendedData>${Object.entries(data)
  .filter(([, value]) => value !== undefined && value !== null && value !== "")
  .map(([key, value]) => `<Data name="${xml(key)}"><value>${xml(value)}</value></Data>`)
  .join("")}</ExtendedData>`;

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function exportNetworkToKmz({ nodes = [], edges = [], name = "network" }) {
  const pointPlacemarks = nodes.map((node) => `
    <Placemark>
      <name>${xml(node.name || node.id)}</name>
      ${extendedData({ widispatchKind: "asset", widispatchId: node.id, assetId: node.assetId, assetType: node.type, geoAnchor: node.isAnchor })}
      <Point><coordinates>${Number(node.lng).toFixed(8)},${Number(node.lat).toFixed(8)},0</coordinates></Point>
    </Placemark>`).join("");
  const linePlacemarks = edges.map((edge) => `
    <Placemark>
      <name>${xml(edge.name || edge.id)}</name>
      ${extendedData({ widispatchKind: "pipe", widispatchId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId })}
      <LineString><tessellate>1</tessellate><coordinates>${edge.positions
        .map(([lat, lng]) => `${Number(lng).toFixed(8)},${Number(lat).toFixed(8)},0`).join(" ")}</coordinates></LineString>
    </Placemark>`).join("");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${xml(name)}</name>
  <Style id="asset"><IconStyle><scale>0.8</scale></IconStyle></Style>
  <Style id="pipe"><LineStyle><color>ffff7a25</color><width>4</width></LineStyle></Style>
  <Folder><name>Assets</name>${pointPlacemarks}</Folder>
  <Folder><name>Pipelines</name>${linePlacemarks}</Folder>
</Document></kml>`;
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  downloadBlob(blob, `${safeName(name)}.kmz`);
}

const descendants = (root, localName) => Array.from(root.getElementsByTagNameNS("*", localName));
const firstText = (root, localName) => descendants(root, localName)[0]?.textContent?.trim() || "";
const coordinateList = (text) => String(text || "").trim().split(/\s+/).map((token) => {
  const [lng, lat, altitude = 0] = token.split(",").map(Number);
  return { lat, lng, altitude };
}).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

// Nearest ancestor <Folder>'s <name>, walking up the DOM. KML groups features in
// folders (e.g. "Plants", "Tanks") — a strong type signal for generic KMZ files.
const nearestFolderName = (node) => {
  let current = node?.parentNode;
  while (current && current.nodeType === 1) {
    if (String(current.localName || "").toLowerCase() === "folder") {
      const nameEl = Array.from(current.childNodes).find(
        (child) => child.nodeType === 1 && String(child.localName || "").toLowerCase() === "name",
      );
      const label = nameEl?.textContent?.trim();
      if (label) return label;
    }
    current = current.parentNode;
  }
  return "";
};

// Build a { styleId -> iconHref } lookup from <Style> and <StyleMap> definitions
// so a placemark's <styleUrl> can be resolved to the icon it renders with.
const buildStyleIconMap = (doc) => {
  const map = {};
  descendants(doc, "Style").forEach((style) => {
    const id = style.getAttribute("id");
    if (!id) return;
    const href = firstText(style, "href");
    if (href) map[id] = href;
  });
  descendants(doc, "StyleMap").forEach((styleMap) => {
    const id = styleMap.getAttribute("id");
    if (!id) return;
    const pairs = descendants(styleMap, "Pair");
    const normal = pairs.find((pair) => firstText(pair, "key").toLowerCase() === "normal") || pairs[0];
    const ref = firstText(normal || styleMap, "styleUrl").replace(/^#/, "");
    if (ref && map[ref]) map[id] = map[ref];
  });
  return map;
};

export async function parseNetworkGeoFile(file) {
  const isKmz = /\.kmz$/i.test(file?.name || "");
  let kmlText;
  if (isKmz) {
    const zip = await JSZip.loadAsync(file);
    const entry = Object.values(zip.files).find((item) => !item.dir && /\.kml$/i.test(item.name));
    if (!entry) throw new Error("The KMZ does not contain a KML document.");
    kmlText = await entry.async("string");
  } else {
    kmlText = await file.text();
  }
  const doc = new DOMParser().parseFromString(kmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The KML document is not valid XML.");
  const styleIcons = buildStyleIconMap(doc);
  const points = [];
  const lines = [];
  descendants(doc, "Placemark").forEach((placemark, index) => {
    const data = {};
    descendants(placemark, "Data").forEach((item) => {
      data[item.getAttribute("name")] = firstText(item, "value");
    });
    const name = firstText(placemark, "name") || `Imported ${index + 1}`;
    const folder = nearestFolderName(placemark);
    const styleUrl = firstText(placemark, "styleUrl");
    const iconHref = styleIcons[styleUrl.replace(/^#/, "")] || firstText(placemark, "href") || "";
    const pointNode = descendants(placemark, "Point")[0];
    const lineNode = descendants(placemark, "LineString")[0];
    if (pointNode) {
      const coordinate = coordinateList(firstText(pointNode, "coordinates"))[0];
      if (coordinate) points.push({ name, folder, styleUrl, iconHref, ...data, ...coordinate });
    } else if (lineNode) {
      const coordinates = coordinateList(firstText(lineNode, "coordinates"));
      if (coordinates.length >= 2) lines.push({ name, folder, ...data, coordinates });
    }
  });
  return { points, lines, name: firstText(doc, "name") || file.name.replace(/\.(kmz|kml)$/i, "") };
}

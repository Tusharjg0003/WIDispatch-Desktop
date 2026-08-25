# Network Canvas Implementation Guide

This guide explains how to replicate the Network Simulation 2 canvas features in
another repo, even if the route names, page names, and surrounding app structure
are different.

The original implementation lives mainly in:

- `frontend/src/pages/NetworkSimulation2Page.js`
- `frontend/src/pages/NetworkSimulation2Page.css`
- `frontend/src/utils/canvasGeometry.js`

Think of the canvas as a reusable graph editor component with three layers:

1. Cytoscape renders nodes, pipes, labels, pan, zoom, selection, and graph data.
2. CSS on a parent wrapper renders the grid behind Cytoscape.
3. `cytoscape-edge-editing` plus a small SVG overlay handles bend-point UX.

## 1. Packages

Install the canvas packages:

```bash
npm install cytoscape cytoscape-context-menus cytoscape-edge-editing konva
```

The original app uses these versions:

```json
{
  "cytoscape": "^3.33.1",
  "cytoscape-context-menus": "^4.2.1",
  "cytoscape-edge-editing": "^5.0.0",
  "konva": "^9.3.16"
}
```

If your target repo already has React, no extra React canvas package is needed.

## 2. Suggested File Structure

Use names that fit your repo. For example:

```text
src/components/network-canvas/
  NetworkCanvas.jsx
  NetworkCanvas.css
  canvasGeometry.js
  entitySymbols.js
```

Where:

- `NetworkCanvas.jsx` owns Cytoscape setup, events, and overlays.
- `NetworkCanvas.css` owns grid and overlay styling.
- `canvasGeometry.js` owns grid, snap, and bend math.
- `entitySymbols.js` owns entity colors, SVG paths, and node icon generation.

## 3. Cytoscape Initialization

Register extensions once at module scope:

```js
import cytoscape from 'cytoscape';
import Konva from 'konva';
import contextMenus from 'cytoscape-context-menus';
import edgeEditing from 'cytoscape-edge-editing';
import 'cytoscape-context-menus/cytoscape-context-menus.css';

const EXTENSIONS_KEY = '__networkCanvasCyExtensionsRegistered__';

if (!window[EXTENSIONS_KEY]) {
  cytoscape.use(contextMenus);
  edgeEditing(cytoscape, Konva);
  window[EXTENSIONS_KEY] = true;
}
```

Create the Cytoscape instance inside your component:

```js
const cy = cytoscape({
  container: containerRef.current,
  style: buildCyStyle(),
  wheelSensitivity: 0.2,
  minZoom: 0.05,
  maxZoom: 5,
  layout: { name: 'preset' },
});
```

Use `layout: { name: 'preset' }` because this canvas stores explicit positions
on each node. It is a drawing/editor canvas, not an automatic graph layout.

Before creating a new Cytoscape instance, remove stale edge-editing overlays:

```js
containerRef.current
  ?.querySelectorAll('[id^="cy-node-edge-editing-stage"]')
  .forEach((el) => el.remove());
```

This matters during hot reloads and remounts because the edge-editing plugin
creates a Konva overlay that Cytoscape does not always clean up.

## 4. Component Markup

Use a wrapper for the grid and an inner div for Cytoscape:

```jsx
<div
  ref={gridWrapRef}
  className={`network-canvas-wrap${showGrid ? ' network-canvas-wrap--grid' : ''}`}
>
  <div ref={containerRef} className="network-canvas" />

  {edgeOverlay.handles.length > 0 && (
    <svg className="network-edge-overlay" aria-hidden="true">
      {edgeOverlay.handles.map((handle) => (
        <g
          key={handle.key}
          className="network-edge-ghost-handle"
          transform={`translate(${handle.x} ${handle.y})`}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addBendAtModelPoint(handle.model);
          }}
        >
          <circle r="9" fill="transparent" />
          <circle className="network-edge-ghost-handle-dot" r="4" />
        </g>
      ))}
    </svg>
  )}
</div>
```

The SVG overlay is separate from the Cytoscape/Konva plugin overlay. It is only
used for friendly affordances, such as midpoint handles for adding new bends.
Real bend dragging is still handled by `cytoscape-edge-editing`.

## 5. Grid Style

The grid is a CSS background on the wrapper. It is not a Cytoscape layer.

```css
.network-canvas-wrap {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: clamp(420px, 58vh, 900px);
  background: #f8fafc;
  overflow: hidden;
  --grid-size: 40px;
  --grid-major-size: 200px;
  --grid-minor-alpha: 1;
  --grid-offset-x: 0px;
  --grid-offset-y: 0px;
  --grid-major-offset-x: 0px;
  --grid-major-offset-y: 0px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.55),
    0 8px 20px rgba(15, 23, 42, 0.04);
}

.network-canvas-wrap--grid {
  background-image:
    linear-gradient(to right, rgba(99, 130, 191, calc(0.16 * var(--grid-minor-alpha))) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(99, 130, 191, calc(0.16 * var(--grid-minor-alpha))) 1px, transparent 1px),
    linear-gradient(to right, rgba(71, 105, 170, 0.3) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(71, 105, 170, 0.3) 1px, transparent 1px);
  background-size:
    var(--grid-size) var(--grid-size),
    var(--grid-size) var(--grid-size),
    var(--grid-major-size) var(--grid-major-size),
    var(--grid-major-size) var(--grid-major-size);
  background-position:
    var(--grid-offset-x) var(--grid-offset-y),
    var(--grid-offset-x) var(--grid-offset-y),
    var(--grid-major-offset-x) var(--grid-major-offset-y),
    var(--grid-major-offset-x) var(--grid-major-offset-y);
}

.network-canvas {
  position: absolute;
  inset: 0;
}
```

The first two gradients are the minor grid. The last two are the major grid.
Major grid size should be `minor * 5`.

## 6. Grid Math

Put this in a dependency-free geometry file:

```js
export const CANVAS_GRID_PITCH = 40;

const GRID_SCREEN_MIN = 24;
const GRID_SCREEN_MAX = 96;
const GRID_FADE_FROM = 34;

export const computeGridPitch = (zoom, basePitch = CANVAS_GRID_PITCH) => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  let minor = basePitch;

  let guard = 0;
  while (minor * z < GRID_SCREEN_MIN && guard < 64) {
    minor *= 2;
    guard += 1;
  }
  while (minor * z > GRID_SCREEN_MAX && minor > 1e-6 && guard < 64) {
    minor /= 2;
    guard += 1;
  }

  const screenMinor = minor * z;
  const fadeSpan = GRID_FADE_FROM - GRID_SCREEN_MIN;
  const minorAlpha = fadeSpan > 0
    ? Math.max(0, Math.min(1, (screenMinor - GRID_SCREEN_MIN) / fadeSpan))
    : 1;

  return { minor, major: minor * 5, screenMinor, minorAlpha };
};

export const wrapOffset = (value, size) => {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return ((value % size) + size) % size;
};

export const snapValue = (value, pitch = CANVAS_GRID_PITCH) => {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(pitch) || pitch <= 0) return value;
  return Math.round(value / pitch) * pitch;
};

export const snapPosition = (pos, pitch = CANVAS_GRID_PITCH) => {
  if (!pos) return pos;
  return { x: snapValue(pos.x, pitch), y: snapValue(pos.y, pitch) };
};
```

Update grid CSS variables on pan and zoom:

```js
const updateGrid = () => {
  const el = gridWrapRef.current;
  if (!el || !cyRef.current) return;

  const cy = cyRef.current;
  const pan = cy.pan();
  const zoom = cy.zoom();
  const { minor, major, minorAlpha } = computeGridPitch(zoom, CANVAS_GRID_PITCH);

  const minorPx = minor * zoom;
  const majorPx = major * zoom;

  el.style.setProperty('--grid-size', `${minorPx}px`);
  el.style.setProperty('--grid-major-size', `${majorPx}px`);
  el.style.setProperty('--grid-minor-alpha', String(minorAlpha));
  el.style.setProperty('--grid-offset-x', `${wrapOffset(pan.x, minorPx)}px`);
  el.style.setProperty('--grid-offset-y', `${wrapOffset(pan.y, minorPx)}px`);
  el.style.setProperty('--grid-major-offset-x', `${wrapOffset(pan.x, majorPx)}px`);
  el.style.setProperty('--grid-major-offset-y', `${wrapOffset(pan.y, majorPx)}px`);
};

cy.on('pan zoom', () => requestAnimationFrame(updateGrid));
updateGrid();
```

## 7. Snap To Grid

Snap nodes during drag and on release:

```js
cy.on('drag', 'node', (event) => {
  if (!snapToGridRef.current) return;
  if (event.originalEvent?.altKey) return;

  const node = event.target;
  const raw = node.position();
  const snapped = snapPosition(raw, CANVAS_GRID_PITCH);

  if (raw.x !== snapped.x || raw.y !== snapped.y) {
    node.position(snapped);
  }
});

cy.on('free', 'node', (event) => {
  if (!snapToGridRef.current) return;
  event.target.position(snapPosition(event.target.position(), CANVAS_GRID_PITCH));
});
```

The original app also preserves rigid multi-selection movement by snapping the
grabbed node and translating the rest of the selected nodes by the same delta.
Add that if your repo supports multi-select movement.

## 8. Entity Types, Colors, And Icons

Use one source of truth for entity colors and SVG assets:

```js
export const ENTITY_TYPE_COLORS = {
  plant: '#3b82f6',
  tank: '#10b981',
  point: '#f59e0b',
  pump: '#ec4899',
  node: '#6b7280',
  stp: '#a855f7',
  'filling-station': '#f97316',
};

export const ENTITY_TYPE_ABBREVIATIONS = {
  plant: 'PL',
  tank: 'TK',
  point: 'HP',
  pump: 'PU',
  node: 'ND',
  stp: 'ST',
  'filling-station': 'FS',
};

export const ENTITY_ICON_PATHS = {
  plant: '/All Icons Zipped/02 Asset & Infrastructure Icons/Desalination Plant/SVG/Desalination Plant_20px.svg',
  tank: '/All Icons Zipped/02 Asset & Infrastructure Icons/Storage Tank/SVG/Storage Tank_20px.svg',
  point: '/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg',
  pump: '/All Icons Zipped/02 Asset & Infrastructure Icons/Pump/SVG/Pump_20px.svg',
  stp: '/All Icons Zipped/02 Asset & Infrastructure Icons/Treatment Plant/SVG/Treatment Plant_20px.svg',
  'filling-station': '/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg',
};
```

If the other repo does not have the same public icon folder, either copy those
SVG assets or replace the paths with that repo's icon system.

## 9. Node Symbol Generation

Cytoscape nodes use `background-image: data(cardIcon)`. The `cardIcon` value is
a generated SVG data URI.

Core idea:

- Symbol size is `44`.
- The node shape is either Cytoscape `ellipse` or `round-rectangle`.
- The SVG contains a tinted disc or rounded square.
- The entity glyph is embedded inside the SVG.
- A small amber dot marks capacity-limited assets.
- The node border color is separate and represents lifecycle/status.

Minimal implementation:

```js
const SYMBOL_SIZE = 44;
const SYMBOL_SHAPES = { circle: 'ellipse', box: 'round-rectangle' };

const escapeSvgText = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const svgDataUri = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

const FALLBACK_MARKUP = {
  plant: '<path d="M16 42V31l8 5v-11l9 5v12h11v5H14v-5h2zM18 22h5v7h-5zm9-4h5v10h-5zm9 6h5v8h-5z"/>',
  tank: '<path d="M20 17h20v30H20z"/><ellipse cx="30" cy="17" rx="10" ry="4"/><path d="M20 32h20"/>',
  point: '<path d="M30 14c-7 0-12 5-12 12 0 9 12 22 12 22s12-13 12-22c0-7-5-12-12-12zm0 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>',
  pump: '<path d="M18 23h19v22H18z"/><circle cx="27.5" cy="34" r="5"/><path d="M37 28h6v13h-6M22 19h10v4M42 41v5H18"/>',
  node: '<circle cx="30" cy="32" r="7"/><path d="M16 32h7m14 0h7M30 18v7m0 14v7"/>',
  stp: '<path d="M17 23h26v23H17zM21 19h18v4M22 29h16m-16 7h16"/><circle cx="25" cy="34" r="2"/><circle cx="35" cy="34" r="2"/>',
  'filling-station': '<path d="M19 17h17v30H19zM23 21h9v9h-9zM36 24h4l4 5v14c0 3-2 4-4 4s-4-1-4-4v-9"/><path d="M23 39h9"/>',
};

export const makeEntityIconSvg = ({
  type,
  typeColor,
  hasCapacityLimit,
  symbolShape = 'circle',
}) => {
  const c = SYMBOL_SIZE / 2;
  const fallback = FALLBACK_MARKUP[type] || FALLBACK_MARKUP.node;
  const tint = symbolShape === 'box'
    ? `<rect x="2" y="2" width="${SYMBOL_SIZE - 4}" height="${SYMBOL_SIZE - 4}" rx="10" ry="10" fill="${escapeSvgText(typeColor)}" opacity="0.18"/>`
    : `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${escapeSvgText(typeColor)}" opacity="0.18"/>`;
  const glyph = `<g transform="translate(${c} ${c}) scale(0.72) translate(-30 -31)" fill="none" stroke="${escapeSvgText(typeColor)}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${fallback}</g>`;
  const limitDot = hasCapacityLimit
    ? `<circle cx="${SYMBOL_SIZE - 8}" cy="8" r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>`
    : '';

  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${SYMBOL_SIZE}" height="${SYMBOL_SIZE}" viewBox="0 0 ${SYMBOL_SIZE} ${SYMBOL_SIZE}">
      ${tint}
      ${glyph}
      ${limitDot}
    </svg>
  `);
};
```

The original app also asynchronously fetches the real toolbar SVGs, converts
them to base64, and embeds them as `<image href="data:image/svg+xml;base64,...">`
inside the generated symbol. That produces closer parity with the toolbar icons.
The fallback markup above is enough to get the same node style without copying
the whole async icon cache.

## 10. Required Node Data Fields

When adding a node, include both persisted fields and runtime style fields.

Example:

```js
const addAssetNode = ({ id, type, name, position }) => {
  const typeColor = ENTITY_TYPE_COLORS[type] || '#6b7280';

  cy.add({
    group: 'nodes',
    data: {
      id,
      type,
      name,
      cardTitle: name,
      cardLabel: name,
      cardIcon: makeEntityIconSvg({
        type,
        typeColor,
        hasCapacityLimit: false,
        symbolShape: 'circle',
      }),
      cardStatusColor: '#10b981',
      hasCapacityLimit: 'false',
    },
    position,
  });
};
```

In a production app, recompute these runtime fields from persisted asset data on
load rather than saving `cardIcon` to the database. `cardIcon` is a data URI and
can become stale if your icon style changes later.

## 11. Cytoscape Node And Edge Styles

Use this as the core style. Add your own selection, tracing, or status styles as
needed.

```js
const buildCyStyle = () => [
  {
    selector: 'node',
    style: {
      shape: 'ellipse',
      width: 44,
      height: 44,
      'background-color': '#ffffff',
      'background-opacity': 1,
      'background-image': 'data(cardIcon)',
      'background-fit': 'none',
      'background-width': 44,
      'background-height': 44,
      'background-position-x': '0px',
      'background-position-y': '0px',
      'background-clip': 'node',
      'border-width': 3,
      'border-color': 'data(cardStatusColor)',
      'border-style': 'solid',
      label: 'data(cardLabel)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 5,
      color: '#111827',
      'font-size': 9.5,
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'font-weight': '700',
      'line-height': 1.22,
      'text-wrap': 'wrap',
      'text-max-width': 120,
      'text-overflow-wrap': 'anywhere',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.78,
      'text-background-padding': 2,
      'text-background-shape': 'roundrectangle',
      'shadow-blur': 6,
      'shadow-color': '#0f172a',
      'shadow-opacity': 0.14,
      'shadow-offset-x': 0,
      'shadow-offset-y': 1,
    },
  },
  {
    selector: 'node[type="node"]',
    style: {
      shape: 'ellipse',
      width: 18,
      height: 18,
      'background-color': '#ffffff',
      'background-image': 'none',
      label: '',
      'border-width': 2,
      'border-color': '#6b7280',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#0969da',
      'border-width': 4,
      'overlay-color': '#0969da',
      'overlay-padding': 5,
      'overlay-opacity': 0.15,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 2.5,
      'line-color': '#6e96d0',
      'target-arrow-color': '#6e96d0',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: '',
      'font-size': 9,
      color: '#57606a',
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'text-rotation': 'autorotate',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': 2,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#0969da',
      'target-arrow-color': '#0969da',
      'overlay-color': '#0969da',
      'overlay-padding': 4,
      'overlay-opacity': 0.14,
    },
  },
  {
    selector: 'edge.edgebendediting-hasbendpoints',
    style: {
      'curve-style': 'segments',
      'segment-weights': 'data(cyedgebendeditingWeights)',
      'segment-distances': 'data(cyedgebendeditingDistances)',
    },
  },
  {
    selector: 'edge[hasCapacityLimit="true"]',
    style: {
      'line-color': '#bf8700',
      'target-arrow-color': '#bf8700',
    },
  },
  {
    selector: 'edge[bidirectional="true"]',
    style: {
      'source-arrow-shape': 'triangle',
      'source-arrow-color': '#6e96d0',
    },
  },
];
```

## 12. Bend Geometry Helpers

`cytoscape-edge-editing` stores bends as parallel arrays:

- `cyedgebendeditingWeights`
- `cyedgebendeditingDistances`

Use these helpers to convert between absolute points and plugin data:

```js
export const bendPairsToPoints = (srcPos, tgtPos, weights = [], distances = []) => {
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const len = Math.hypot(dx, dy);
  if (!len) return [];

  const ux = dx / len;
  const uy = dy / len;
  const count = Math.min(weights.length, distances.length);
  const points = [];

  for (let i = 0; i < count; i += 1) {
    const w = weights[i];
    const d = distances[i];
    points.push({
      x: srcPos.x + w * dx - d * uy,
      y: srcPos.y + w * dy + d * ux,
    });
  }

  return points;
};

export const pointToBendPair = (srcPos, tgtPos, point) => {
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return null;

  const len = Math.sqrt(len2);
  const ux = dx / len;
  const uy = dy / len;
  const weight = ((point.x - srcPos.x) * dx + (point.y - srcPos.y) * dy) / len2;
  const footX = srcPos.x + weight * dx;
  const footY = srcPos.y + weight * dy;
  const distance = -(point.x - footX) * uy + (point.y - footY) * ux;

  return { weight, distance };
};
```

## 13. Edge Editing Plugin Config

Configure the plugin for bend points only:

```js
const BEND_ANCHOR_SIZE_FACTOR = 8;

cy.edgeEditing({
  undoable: false,

  // Use weights/distances as the single source of truth.
  bendPositionsFunction: () => null,
  bendPointPositionsSetterFunction: () => {},

  // Disable plugin menu items. Add your own context-menu actions instead.
  addBendMenuItemTitle: false,
  removeBendMenuItemTitle: false,
  removeAllBendMenuItemTitle: false,

  // Disable Bezier control points. This canvas uses segmented bend points.
  addControlMenuItemTitle: false,
  removeControlMenuItemTitle: false,
  removeAllControlMenuItemTitle: false,

  // Reconnect endpoints separately if you need it.
  handleReconnectEdge: false,

  anchorShapeSizeFactor: BEND_ANCHOR_SIZE_FACTOR,
  enableFixedAnchorSize: true,
  zIndex: 999,
  bendRemovalSensitivity: 8,
  anchorColor: '#6366f1',
  endPointColor: '#6366f1',
  enableCreateAnchorOnDrag: false,
});
```

Important: keep `cyedgebendeditingWeights` and
`cyedgebendeditingDistances` as the canonical bend data. Avoid writing
`bendPointPositions` unless you fully take over the plugin behavior.

## 14. Add And Remove Bend Points

Add a bend by computing a weight/distance pair and splicing it into the edge
data. Keep bends sorted by weight so the polyline runs source to target.

```js
const updateBendClasses = (edge, bendCount) => {
  edge.removeData('bendPointPositions');

  if (bendCount <= 0) {
    edge.removeClass('edgebendediting-hasbendpoints edgebendediting-hasmultiplebendpoints');
    edge.data({ cyedgebendeditingWeights: [], cyedgebendeditingDistances: [] });
  } else if (bendCount === 1) {
    edge.addClass('edgebendediting-hasbendpoints');
    edge.removeClass('edgebendediting-hasmultiplebendpoints');
  } else {
    edge.addClass('edgebendediting-hasbendpoints edgebendediting-hasmultiplebendpoints');
  }
};

const addBendPoint = (edge, modelPoint, { minOffset = 0 } = {}) => {
  const src = edge.source().position();
  const tgt = edge.target().position();
  if (src.x === tgt.x && src.y === tgt.y) return;

  const pair = pointToBendPair(src, tgt, modelPoint);
  if (!pair) return;

  const weight = Math.min(0.95, Math.max(0.05, pair.weight));
  let distance = pair.distance;

  if (minOffset > 0 && Math.abs(distance) < minOffset) {
    distance = (distance < 0 ? -1 : 1) * minOffset;
  }

  const weights = [...(edge.data('cyedgebendeditingWeights') || [])];
  const distances = [...(edge.data('cyedgebendeditingDistances') || [])];

  let insertIndex = weights.length;
  for (let i = 0; i < weights.length; i += 1) {
    if (weight < weights[i]) {
      insertIndex = i;
      break;
    }
  }

  weights.splice(insertIndex, 0, weight);
  distances.splice(insertIndex, 0, distance);

  edge.select();
  edge.data({
    cyedgebendeditingWeights: weights,
    cyedgebendeditingDistances: distances,
  });
  updateBendClasses(edge, Math.min(weights.length, distances.length));
};
```

Remove the nearest bend:

```js
const removeNearestBendPoint = (edge, clickPos) => {
  const points = bendPairsToPoints(
    edge.source().position(),
    edge.target().position(),
    edge.data('cyedgebendeditingWeights') || [],
    edge.data('cyedgebendeditingDistances') || [],
  );

  if (!points.length) return;

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  points.forEach((point, index) => {
    const d = Math.hypot(point.x - clickPos.x, point.y - clickPos.y);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = index;
    }
  });

  const weights = [...(edge.data('cyedgebendeditingWeights') || [])];
  const distances = [...(edge.data('cyedgebendeditingDistances') || [])];

  weights.splice(nearestIndex, 1);
  distances.splice(nearestIndex, 1);

  edge.data({
    cyedgebendeditingWeights: weights,
    cyedgebendeditingDistances: distances,
  });
  updateBendClasses(edge, Math.min(weights.length, distances.length));
};
```

## 15. Context Menu Bend Actions

```js
cy.contextMenus({
  evtType: 'cxttap',
  menuItems: [
    {
      id: 'add-bend-point',
      content: 'Add Bend Point',
      selector: 'edge',
      onClickFunction: (event) => {
        const edge = event.target || event.cyTarget;
        const pos = event.position || event.cyPosition;
        if (edge && pos) addBendPoint(edge, pos, { minOffset: 40 });
      },
    },
    {
      id: 'remove-nearest-bend-point',
      content: 'Remove Nearest Bend Point',
      selector: 'edge.edgebendediting-hasbendpoints',
      onClickFunction: (event) => {
        const edge = event.target || event.cyTarget;
        const pos = event.position || event.cyPosition;
        if (edge && pos) removeNearestBendPoint(edge, pos);
      },
    },
    {
      id: 'remove-all-bend-points',
      content: 'Remove All Bend Points',
      selector: 'edge.edgebendediting-hasbendpoints',
      onClickFunction: (event) => {
        const edge = event.target || event.cyTarget;
        if (edge) updateBendClasses(edge, 0);
      },
    },
  ],
});
```

The context-menu add action uses `minOffset: 40` because right-clicking usually
lands exactly on the pipe. Without a small perpendicular offset, the new bend is
stored but visually invisible.

## 16. Double Click Bend UX

```js
cy.on('dblclick', 'edge', (event) => {
  const edge = event.target;
  const clickPos = event.position || event.cyPosition;
  if (!clickPos) return;

  const grabRadius = 14 / (cy.zoom() || 1);
  const existing = bendPairsToPoints(
    edge.source().position(),
    edge.target().position(),
    edge.data('cyedgebendeditingWeights') || [],
    edge.data('cyedgebendeditingDistances') || [],
  );

  const onExistingBend = existing.some(
    (point) => Math.hypot(point.x - clickPos.x, point.y - clickPos.y) <= grabRadius,
  );

  if (onExistingBend) {
    removeNearestBendPoint(edge, clickPos);
  } else {
    addBendPoint(edge, clickPos, { minOffset: 0 });
  }
});
```

This makes bends discoverable without forcing users into the context menu.

## 17. Ghost Bend Handles

The ghost handles are SVG dots at the midpoint of each current pipe segment.
Clicking one creates a real bend at that model point.

```js
const syncEdgeOverlay = () => {
  const cy = cyRef.current;
  const edgeId = hoveredEdgeRef.current;
  if (!cy || !edgeId) return;

  const edge = cy.getElementById(edgeId);
  if (!edge || !edge.length) return;

  const pan = cy.pan();
  const zoom = cy.zoom();
  const toRendered = (p) => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y });

  const src = edge.source().position();
  const tgt = edge.target().position();
  const polyline = [
    src,
    ...bendPairsToPoints(
      src,
      tgt,
      edge.data('cyedgebendeditingWeights') || [],
      edge.data('cyedgebendeditingDistances') || [],
    ),
    tgt,
  ];

  const handles = polyline.slice(0, -1).map((point, index) => {
    const next = polyline[index + 1];
    const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    const rendered = toRendered(mid);
    return { key: index, x: rendered.x, y: rendered.y, model: mid };
  });

  setEdgeOverlay({ edgeId, handles });
};

cy.on('mouseover', 'edge', (event) => {
  hoveredEdgeRef.current = event.target.id();
  syncEdgeOverlay();
});

cy.on('mouseout', 'edge', () => {
  hoveredEdgeRef.current = null;
  setEdgeOverlay({ edgeId: null, handles: [] });
});

cy.on('pan zoom', syncEdgeOverlay);
cy.on('drag position', 'node', () => setEdgeOverlay({ edgeId: null, handles: [] }));
```

Overlay CSS:

```css
.network-edge-overlay {
  position: absolute;
  inset: 0;
  z-index: 11;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.network-edge-ghost-handle {
  pointer-events: auto;
  cursor: crosshair;
}

.network-edge-ghost-handle-dot {
  fill: #ffffff;
  stroke: #2563eb;
  stroke-width: 1.5;
  opacity: 0.75;
  transition: opacity 0.12s ease, r 0.12s ease;
}

.network-edge-ghost-handle:hover .network-edge-ghost-handle-dot {
  opacity: 1;
  fill: #2563eb;
  stroke: #ffffff;
}
```

## 18. Syncing The Bend Editing Overlay

After changing bend data, selecting edges, moving nodes, or resizing the canvas,
ask the plugin to redraw anchor handles.

```js
const syncBendEditingOverlay = () => {
  const cy = cyRef.current;
  const container = containerRef.current;
  if (!cy || !container) return;

  const selectedBendEdges = cy.edges(':selected.edgebendediting-hasbendpoints');

  container
    .querySelectorAll('[id^="cy-node-edge-editing-stage"]')
    .forEach((overlay) => {
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = `${container.clientWidth}px`;
      overlay.style.height = `${container.clientHeight}px`;
      overlay.style.zIndex = '999';
      overlay.style.display = selectedBendEdges.length ? 'block' : 'none';
    });

  const api = typeof cy.edgeEditing === 'function' ? cy.edgeEditing('get') : null;
  api?.initAnchorPoints?.(selectedBendEdges);
};

cy.on('select unselect remove', 'edge', syncBendEditingOverlay);
cy.on('dragfree', 'node', syncBendEditingOverlay);
cy.on('cyedgeediting.changeAnchorPoints', syncBendEditingOverlay);
cy.on('bendPointMovement', syncBendEditingOverlay);
```

In a larger app, throttle this with `requestAnimationFrame` or `setTimeout`.

## 19. Level Of Detail Labels

The original canvas reduces label detail as the user zooms out:

```js
const applyZoomLod = () => {
  const z = cy.zoom();
  const band = z < 0.35 ? 'far' : z < 0.7 ? 'mid' : 'near';

  cy.batch(() => {
    cy.nodes().removeClass('lod-far lod-mid lod-near').addClass(`lod-${band}`);
  });
};

cy.on('zoom', applyZoomLod);
```

Add styles:

```js
{
  selector: 'node.lod-mid[cardTitle]',
  style: { label: 'data(cardTitle)' },
},
{
  selector: 'node.lod-far',
  style: {
    label: '',
    width: 30,
    height: 30,
    'background-width': 30,
    'background-height': 30,
    'border-width': 2,
  },
}
```

## 20. Minimal Porting Checklist

1. Install `cytoscape`, `cytoscape-context-menus`, `cytoscape-edge-editing`,
   and `konva`.
2. Create a reusable canvas component with a grid wrapper and Cytoscape div.
3. Copy the grid CSS and the grid update math.
4. Add Cytoscape initialization with `layout: { name: 'preset' }`.
5. Add entity colors, abbreviations, and SVG paths.
6. Generate `cardIcon` SVG data URIs for nodes.
7. Add the Cytoscape node and edge style array.
8. Store bends using `cyedgebendeditingWeights` and
   `cyedgebendeditingDistances`.
9. Add the `edge.edgebendediting-hasbendpoints` style that uses
   `curve-style: segments`.
10. Configure `cy.edgeEditing()` for bend-only editing.
11. Add context-menu bend actions.
12. Add double-click add/remove bend behavior.
13. Add ghost midpoint handles if you want the same discoverability.
14. Recompute runtime node card fields on load instead of persisting data URI
   icons.

## 21. Common Pitfalls

- If bends are stored but pipes still look straight, make sure bent edges have
  class `edgebendediting-hasbendpoints` and the style uses
  `curve-style: segments`.
- If bends reappear after deletion, remove `bendPointPositions` and keep
  weights/distances as the single source of truth.
- If the grid drifts during pan, update CSS `background-position` from
  Cytoscape `pan()`.
- If the grid is too dense or too sparse at zoom extremes, use
  `computeGridPitch()` instead of a fixed CSS pixel size.
- If Cytoscape wheel zoom feels jumpy, lower `wheelSensitivity` to around `0.2`.
- If edge-editing handles are hard to grab, use `anchorShapeSizeFactor: 8` and
  `enableFixedAnchorSize: true`.
- If labels overlap when zoomed out, add the LOD classes and hide labels in the
  far zoom band.

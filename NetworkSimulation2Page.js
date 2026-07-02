import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import cytoscape from 'cytoscape';
import Konva from 'konva';
import contextMenus from 'cytoscape-context-menus';
import edgeEditing from 'cytoscape-edge-editing';
import 'cytoscape-context-menus/cytoscape-context-menus.css';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart,
  CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Brush, Cell,
} from 'recharts';
import apiClient from '../services/apiClient';
import { useLayout } from '../contexts/LayoutContext';
import WorkspaceHeader, { WorkspaceHeaderButton, WorkspaceHeaderChip } from '../components/WorkspaceHeader';
import './NetworkSimulation2Page.css';

const ns2IconSrc = (path) => encodeURI(`${process.env.PUBLIC_URL}${path}`);

// The canvas cards and the Insert toolbar intentionally use the same source
// SVGs. Keeping this map here avoids a second, drifting visual vocabulary for
// saved, imported, pasted, and previewed assets.
const ENTITY_TOOLBAR_ICON_PATHS = {
  plant: '/All Icons Zipped/02 Asset & Infrastructure Icons/Desalination Plant/SVG/Desalination Plant_20px.svg',
  tank: '/All Icons Zipped/02 Asset & Infrastructure Icons/Storage Tank/SVG/Storage Tank_20px.svg',
  point: '/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg',
  pump: '/All Icons Zipped/02 Asset & Infrastructure Icons/Pump/SVG/Pump_20px.svg',
  stp: '/All Icons Zipped/02 Asset & Infrastructure Icons/Treatment Plant/SVG/Treatment Plant_20px.svg',
  'filling-station': '/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg',
};

const makeAssetIcon = (path, alt = '') => {
  const src = ns2IconSrc(path);
  return function Ns2AssetIcon({ size = 16, className = '', style = {} }) {
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        className={className}
        width={size}
        height={size}
        draggable="false"
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          objectFit: 'contain',
          verticalAlign: '-0.125em',
          flexShrink: 0,
          ...style,
        }}
      />
    );
  };
};

const EmptyIcon = () => null;

const IconActivity = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Real-Time Data/SVG/Real-Time Data_20px.svg');
const IconPlant = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS.plant);
const IconLayers = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS.tank);
const IconTarget = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS.point);
const IconCircle = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Online/SVG/Online_20px.svg');
const IconDroplet = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS.pump);
const IconPackage = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS.stp);
const IconBriefcase = makeAssetIcon(ENTITY_TOOLBAR_ICON_PATHS['filling-station']);
const IconDatabase = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Historical Data/SVG/Historical Data_20px.svg');
const IconPlusCircle = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Add/SVG/Add_20px.svg');
const IconMaximize2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
const IconTag = EmptyIcon;
const IconTrash2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Delete-Trash/SVG/Delete-Trash_20px.svg');
const IconEdit2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Edit/SVG/Edit_20px.svg');
const IconX = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Error/SVG/Error_20px.svg');
const IconSave = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Save/SVG/Save_20px.svg');
const IconCopy = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Copy/SVG/Copy_20px.svg');
const IconClipboard = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Document/SVG/Document_20px.svg');
const IconFolder = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Folder/SVG/Folder_20px.svg');
const IconPipe = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pipe/SVG/Pipe_20px.svg');
const IconSelect = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Select/SVG/Select_20px.svg');
const IconActive = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Active/SVG/Active_20px.svg');
const IconChevronRight = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
const IconChevronLeft = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Back/SVG/Back_20px.svg');
const IconDownload = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Download Document/SVG/Download Document_20px.svg');
const IconUpload = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Upload Document/SVG/Upload Document_20px.svg');
const IconCalendar = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Schedule/SVG/Schedule_20px.svg');
const IconMap = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Map/SVG/Map_20px.svg');
const IconStop = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Stop/SVG/Stop_20px.svg');
const IconSearch = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Search/SVG/Search_20px.svg');
const IconAlertTriangle = makeAssetIcon('/All Icons Zipped/06 Alarms, Events & Status/Warning/SVG/Warning_20px.svg');
const IconEyeOff = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Inactive/SVG/Inactive_20px.svg');
const IconAlignLeft = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Left/SVG/Horizontal Align Left_20px.svg');
const IconAlignCenter = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Center/SVG/Horizontal Align Center_20px.svg');
const IconAlignRight = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Right/SVG/Horizontal Align Right_20px.svg');
const IconAlignJustify = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Distribute Horizontally/SVG/Distribute Horizontally_20px.svg');
const IconArrowUp = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Vertical Align Top/SVG/Vertical Align Top_20px.svg');
const IconArrowDown = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Vertical Align Bottom/SVG/Vertical Align Bottom_20px.svg');
const IconMinus = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Vertical Align Middle/SVG/Vertical Align Middle_20px.svg');
const IconCheckSquare = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Success/SVG/Success_20px.svg');
const IconCrosshair = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg');
const IconMaximize = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
const IconGitBranch = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pipeline Network/SVG/Pipeline Network_20px.svg');
const IconDistributionNetwork = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Distribution Network/SVG/Distribution Network_20px.svg');
const IconGrid = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Dashboard/SVG/Dashboard_20px.svg');
const IconFileText = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Document/SVG/Document_20px.svg');
const IconSquare = EmptyIcon;
const IconPlay = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Start/SVG/Start_20px.svg');
const IconBarChart2 = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Bar Chart/SVG/Bar Chart_20px.svg');
const IconTrendingUp = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Trends/SVG/Trends_20px.svg');
const IconSettings = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Settings/SVG/Settings_20px.svg');
const IconRotateCcw = EmptyIcon;
const IconRotateCw = EmptyIcon;
const IconRefresh = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
const IconBold = EmptyIcon;
const IconItalic = EmptyIcon;
const IconUnderline = EmptyIcon;

// ─── Register Cytoscape extensions (once at module level) ─────────────────────
// Fast Refresh re-evaluates this module while Cytoscape retains its global
// core prototype. Register each extension once to avoid duplicate warnings.
const NS2_CYTO_EXTENSIONS_KEY = '__swiimsNs2CytoExtensionsRegistered__';
if (!window[NS2_CYTO_EXTENSIONS_KEY]) {
  cytoscape.use(contextMenus);
  edgeEditing(cytoscape, Konva);
  window[NS2_CYTO_EXTENSIONS_KEY] = true;
}

let ns2NetworkClipboard = null;
const NS2_NETWORK_CLIPBOARD_EVENT = 'swiims:ns2-network-clipboard';

// ─── Entity constants ──────────────────────────────────────────────────────────
const ENTITY_TYPE_COLORS = {
  plant: '#3b82f6',
  tank: '#10b981',
  point: '#f59e0b',        // Handover Point / City Gate
  pump: '#ec4899',         // Pump Station
  node: '#6b7280',
  stp: '#a855f7',
  'filling-station': '#f97316',
};

const ENTITY_TYPE_ABBREVIATIONS = {
  plant: 'PL',
  tank: 'TK',
  point: 'HP',             // Handover Point / City Gate
  pump: 'PU',              // Pump Station
  node: 'ND',
  stp: 'ST',
  'filling-station': 'FS',
};

const STATUS_BORDER_COLORS = {
  planned: '#3b82f6',
  'Under Construction': '#f59e0b',
  under_construction: '#f59e0b',
  'under-construction': '#f59e0b',
  operational: '#10b981',
  'In Operation': '#10b981',
  'in-operation': '#10b981',
  decommission: '#ef4444',
  Decommissioned: '#ef4444',
  decommissioned: '#ef4444',
  inactive: '#d1d5db',
};

const ENTITY_TYPES_LIST = [
  { key: 'plant', label: 'Plant', abbr: 'PL', icon: IconPlant },
  { key: 'tank', label: 'Tank', abbr: 'TK', icon: IconLayers },
  { key: 'point', label: 'Handover Point / City Gate', abbr: 'HP', icon: IconTarget },
  { key: 'node', label: 'Node', abbr: 'ND', icon: EmptyIcon },
  { key: 'pump', label: 'Pump Station', abbr: 'PU', icon: IconDroplet },
  { key: 'stp', label: 'STP', abbr: 'ST', icon: IconPackage },
  { key: 'filling-station', label: 'Filling Station', abbr: 'FS', icon: IconBriefcase },
];

// Map legacy entity type keys to the current key set. Run any time we ingest
// entity data from a saved sim or pasted snapshot so older data displays under
// the merged taxonomy (distribution-point absorbed into Handover Point).
const LEGACY_ENTITY_TYPE_MAP = {
  'distribution-point': 'point',
  'pump-station': 'pump',
  pump_station: 'pump',
};
const normalizeEntityType = (type) => LEGACY_ENTITY_TYPE_MAP[type] || type;

const ENTITY_TYPE_LABELS = ENTITY_TYPES_LIST.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

// NoteEditor — owns its own contenteditable DOM via a ref so the React
// parent's re-renders never clobber the user's in-progress typing or active
// selection. The previous approach used `dangerouslySetInnerHTML` on the
// rendered div, which forced React to reset the editor's innerHTML on every
// commit (even one triggered by an unrelated state change), eating any text
// the user had just typed — including spaces — and collapsing the live
// selection that B/I/U/font/size commands need to operate on.
//
// The component sets innerHTML once on mount and again only when the
// `html` prop changes EXTERNALLY (e.g. another component updates the
// note's HTML) AND that external value differs from what the user has
// in the DOM. The user's own typing never triggers an innerHTML reset.
const NoteEditor = React.memo(function NoteEditor({
  noteId,
  html,
  className,
  style,
  onMouseDown,
  onFocus,
  onKeyUp,
  onMouseUp,
  onInput,
  onBlur,
}) {
  const ref = useRef(null);
  const lastAppliedHtmlRef = useRef(undefined);

  // Apply HTML imperatively. Only writes to the DOM when the incoming
  // `html` prop differs from what we last applied AND from what's
  // currently in the editor (so the user's typed text isn't overwritten
  // by a stale React state push).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html === lastAppliedHtmlRef.current) return;
    // Don't overwrite if the live DOM already matches (user just typed it).
    if (el.innerHTML === html) {
      lastAppliedHtmlRef.current = html;
      return;
    }
    el.innerHTML = html ?? '';
    lastAppliedHtmlRef.current = html;
  }, [html]);

  return (
    <div
      ref={ref}
      data-note-editor-id={noteId}
      className={className}
      contentEditable
      suppressContentEditableWarning
      style={style}
      onMouseDown={onMouseDown}
      onFocus={onFocus}
      onKeyUp={onKeyUp}
      onMouseUp={onMouseUp}
      onInput={onInput}
      onBlur={onBlur}
      // Stop keydown from bubbling out of the editor. Cytoscape, document
      // shortcut listeners and other window-level handlers should never
      // see characters the user is typing here. The native default
      // (insert the character) is unaffected by stopPropagation.
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
});

const escapeSvgText = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const svgDataUri = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

// Two-section card icon, modeled on the legacy Konva entity card. The left
// section contains the exact same asset SVG used by the Insert toolbar and a
// lifecycle-status band. Rendered as one SVG data URI per type so Cytoscape
// does not pay a per-node rendering cost.
const ICON_SECTION_W = 60;
const NODE_H = 64;
const ENTITY_CARD_ICON_MARKUP = {
  plant: '<path d="M16 42V31l8 5v-11l9 5v12h11v5H14v-5h2zM18 22h5v7h-5zm9-4h5v10h-5zm9 6h5v8h-5z"/>',
  tank: '<path d="M20 17h20v30H20z"/><ellipse cx="30" cy="17" rx="10" ry="4"/><path d="M20 32h20"/>',
  point: '<path d="M30 14c-7 0-12 5-12 12 0 9 12 22 12 22s12-13 12-22c0-7-5-12-12-12zm0 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>',
  pump: '<path d="M18 23h19v22H18z"/><circle cx="27.5" cy="34" r="5"/><path d="M37 28h6v13h-6M22 19h10v4M42 41v5H18"/>',
  node: '<circle cx="30" cy="32" r="7"/><path d="M16 32h7m14 0h7M30 18v7m0 14v7"/>',
  stp: '<path d="M17 23h26v23H17zM21 19h18v4M22 29h16m-16 7h16"/><circle cx="25" cy="34" r="2"/><circle cx="35" cy="34" r="2"/>',
  'filling-station': '<path d="M19 17h17v30H19zM23 21h9v9h-9zM36 24h4l4 5v14c0 3-2 4-4 4s-4-1-4-4v-9"/><path d="M23 39h9"/>',
};

// Cache of toolbar-icon SVGs encoded as base64 data URIs. Populated
// asynchronously at module load (see fetch loop below). Base64 inline
// images embedded inside a parent data:URI SVG ARE permitted by browsers
// — what's blocked is external <image href> references. So once the cache
// is warm, makeEntityIconSvg can stamp the real toolbar icon inside the
// band as part of the same data-URI it returns.
const ENTITY_TOOLBAR_ICON_BASE64 = {};

const makeEntityIconSvg = (type, color) => {
  const base64 = ENTITY_TOOLBAR_ICON_BASE64[type] || '';
  const fallback = ENTITY_CARD_ICON_MARKUP[type] || ENTITY_CARD_ICON_MARKUP.node;
  const iconBlock = base64
    ? `<image href="${base64}" x="15" y="18" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>`
    : `<g fill="none" stroke="${escapeSvgText(ENTITY_TYPE_COLORS[type] || color)}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${fallback}</g>`;
  return svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SECTION_W}" height="${NODE_H}" viewBox="0 0 ${ICON_SECTION_W} ${NODE_H}">
    <rect x="0" y="0" width="${ICON_SECTION_W - 4}" height="${NODE_H}" fill="${escapeSvgText(color)}" opacity="0.22"/>
    <rect x="0" y="0" width="3" height="${NODE_H}" fill="${escapeSvgText(color)}"/>
    <rect x="${ICON_SECTION_W - 4}" y="6" width="1" height="${NODE_H - 12}" fill="${escapeSvgText(color)}" opacity="0.45"/>
    ${iconBlock}
  </svg>
`);
};

// Pre-generate every (status, type) icon pair at module load. With 5 statuses
// and ~8 types that's 40 SVG data URIs — cheap, and avoids any per-node SVG
// work at runtime. The icon section + chip both pick up the status color;
// the type is identified solely by the bold abbreviation in the chip.
const STATUS_KEYS_FOR_ICONS = ['planned', 'under-construction', 'operational', 'decommissioned', 'inactive'];

let ENTITY_CARD_ICONS = {};
const rebuildEntityCardIcons = () => {
  ENTITY_CARD_ICONS = STATUS_KEYS_FOR_ICONS.reduce((statusAcc, status) => {
    const color = STATUS_BORDER_COLORS[status] || '#94a3b8';
    statusAcc[status] = ENTITY_TYPES_LIST.reduce((typeAcc, item) => {
      typeAcc[item.key] = makeEntityIconSvg(item.key, color);
      return typeAcc;
    }, {});
    return statusAcc;
  }, {});
};
rebuildEntityCardIcons();

const pickEntityCardIcon = (status, type) => {
  const normalized = normalizeAssetStatus(status);
  const bucket = ENTITY_CARD_ICONS[normalized] || ENTITY_CARD_ICONS.planned;
  return bucket?.[type] || bucket?.node;
};

// Async-fetch every toolbar SVG, convert each to a base64 data URI, and
// rebuild the card-icon cache + dispatch a global event so any mounted
// cytoscape instance can refresh node card data. Browsers DO allow inline
// (base64 or utf-8) data-URI <image> references inside a parent data-URI
// SVG — they only block external HTTP references.
const NS2_TOOLBAR_ICONS_READY_EVENT = 'ns2:toolbar-icons-ready';
const toBase64 = (str) => {
  // btoa requires latin-1; SVGs are UTF-8 (some Adobe exports contain non-
  // ASCII like en-dashes). Round-trip through encodeURIComponent so any
  // multi-byte sequence is preserved.
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
};
(function preloadToolbarIcons() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const targets = Object.entries(ENTITY_TOOLBAR_ICON_PATHS);
  if (!targets.length) return;
  let pending = targets.length;
  targets.forEach(([type, path]) => {
    fetch(ns2IconSrc(path))
      .then(r => (r.ok ? r.text() : ''))
      .then(text => {
        if (text) ENTITY_TOOLBAR_ICON_BASE64[type] = `data:image/svg+xml;base64,${toBase64(text)}`;
      })
      .catch(() => {})
      .finally(() => {
        pending -= 1;
        if (pending === 0) {
          rebuildEntityCardIcons();
          try { window.dispatchEvent(new Event(NS2_TOOLBAR_ICONS_READY_EVENT)); } catch {}
        }
      });
  });
})();

const ENTITY_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'under-construction', label: 'Under Construction' },
  { value: 'operational', label: 'Operational' },
  { value: 'in-operation', label: 'In Operation' },
  { value: 'decommissioned', label: 'Decommissioned' },
  { value: 'inactive', label: 'Inactive' },
];

const NOTE_FONTS = ['sans', 'serif', 'mono'];
const NOTE_FONT_LABELS = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
};
const NOTE_FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];

const escapeNoteHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/\n/g, '<br>');

const normalizeAssetStatus = (status) => {
  const raw = String(status || '').trim();
  if (!raw) return 'planned';

  const key = raw.toLowerCase().replace(/[_\s]+/g, '-');
  if (key === 'under-construction') return 'under-construction';
  if (key === 'in-operation') return 'in-operation';
  if (key === 'decommission' || key === 'decommissioned') return 'decommissioned';
  if (key === 'inactive' || key === 'maintenance') return 'inactive';
  if (key === 'active') return 'operational';
  if (key === 'operational' || key === 'planned') return key;
  return key;
};

const getStatusLabel = (status) => {
  const normalized = normalizeAssetStatus(status);
  return ENTITY_STATUSES.find(s => s.value === normalized)?.label || status || 'Unknown';
};

const getStatusColor = (status) => STATUS_BORDER_COLORS[normalizeAssetStatus(status)] || '#94a3b8';

const compactCardText = (value, max = 34) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const buildCyNodeCardData = ({
  type,
  name,
  activity,
  assetType,
  status,
  // Unified line-style capacity-limit pair (matches the edge form). Either may
  // be omitted; the legacy callsite that still passes `capacityUsageLimit`
  // continues to work as percentage shorthand for back-compat.
  capacityLimitationType,
  capacityLimitationValue,
  capacityUsageLimit,
}) => {
  type = normalizeEntityType(type);
  if (type === 'note' || type === 'group-box') return {};
  const abbr = ENTITY_TYPE_ABBREVIATIONS[type] || '';
  const typeLabel = ENTITY_TYPE_LABELS[type] || type || '';
  const meta = assetType || activity || typeLabel;
  const title = compactCardText(name || typeLabel || abbr || 'Asset', 32);
  const detail = compactCardText(meta, 38);
  // hasCapacityLimit is the union signal — line-style (percentage/absolute
  // with a non-zero value) OR the legacy `capacityUsageLimit` field.
  const legacyNumeric = Number(capacityUsageLimit);
  const legacyHasLimit =
    capacityUsageLimit !== undefined && capacityUsageLimit !== null &&
    capacityUsageLimit !== '' && Number.isFinite(legacyNumeric) && legacyNumeric > 0;
  const newNumeric = Number(capacityLimitationValue);
  const newHasLimit =
    !!capacityLimitationType && capacityLimitationType !== 'none' &&
    capacityLimitationValue !== undefined && capacityLimitationValue !== null &&
    capacityLimitationValue !== '' && Number.isFinite(newNumeric) && newNumeric > 0;
  const nodeHasCapacityLimit = newHasLimit || legacyHasLimit;
  return {
    abbr,
    cardLabel: detail ? `${title}\n${detail}` : title,
    // The toolbar asset SVG sits in a lifecycle-coloured section. Rebuilt
    // whenever status changes so saved/reloaded cards retain that band.
    // The icon inside the band is the same SVG the Insert toolbar uses,
    // inlined as base64 — see makeEntityIconSvg + preloadToolbarIcons.
    cardIcon: pickEntityCardIcon(status, type),
    cardColor: ENTITY_TYPE_COLORS[type] || '#6b7280',
    // String boolean so cytoscape's `node[hasCapacityLimit="true"]` selector
    // picks it up; matches the convention already used for edges.
    hasCapacityLimit: nodeHasCapacityLimit ? 'true' : 'false',
  };
};

const stripCyRuntimeCardData = (data = {}) => {
  const clean = { ...data };
  delete clean.cardLabel;
  delete clean.cardIcon;
  delete clean.cardColor;
  return clean;
};

const hydrateCyNodeCards = (cy) => {
  if (!cy) return;
  cy.nodes().forEach(node => {
    node.data(buildCyNodeCardData({
      type: node.data('type'),
      name: node.data('name'),
      activity: node.data('activity'),
      assetType: node.data('assetType'),
      status: node.data('status'),
      capacityLimitationType: node.data('capacityLimitationType'),
      capacityLimitationValue: node.data('capacityLimitationValue'),
      capacityUsageLimit: node.data('capacityUsageLimit'),
    }));
  });
};

const buildLeanCyJson = (cy) => {
  const json = cy.json();
  const nodes = json?.elements?.nodes;
  if (Array.isArray(nodes)) {
    json.elements.nodes = nodes.map(node => ({
      ...node,
      data: stripCyRuntimeCardData(node.data),
    }));
  }
  return json;
};

const HISTORY_LIMIT = 80;
const HISTORY_TRANSIENT_CLASSES = new Set([
  'draw-source',
  'insert-target',
  'reconnect-target',
  'trace-root',
  'trace-up',
  'trace-down',
  'trace-up-edge',
  'trace-down-edge',
  'trace-dim',
  'bn-line',
  'bn-plant',
  'bn-point',
  'demand-flagged',
  'isolate-dim',
  'hide-labels',
]);

const clonePlain = (value) => JSON.parse(JSON.stringify(value ?? null));

const serializeCyClasses = (el) =>
  el.classes().filter(cls => !HISTORY_TRANSIENT_CLASSES.has(cls)).join(' ');

const serializeCyNodeForClipboard = (node) => {
  const json = node.json();
  const data = stripCyRuntimeCardData({ ...json.data });
  if (data.status) data.status = normalizeAssetStatus(data.status);
  const entry = {
    group: 'nodes',
    data,
    position: { ...node.position() },
    classes: serializeCyClasses(node),
  };
  if (data.type === 'group-box' && json.style) {
    entry.style = clonePlain(json.style);
  }
  return entry;
};

const serializeCyEdgeForClipboard = (edge) => {
  const json = edge.json();
  return {
    group: 'edges',
    data: { ...json.data },
    classes: serializeCyClasses(edge),
  };
};

const serializeCanvasHistorySnapshot = (cy) => {
  if (!cy) return null;

  return {
    zoom: cy.zoom(),
    pan: { ...cy.pan() },
    elements: [
      ...cy.nodes().jsons().map((_, index) => serializeCyNodeForClipboard(cy.nodes()[index])),
      ...cy.edges().jsons().map((_, index) => serializeCyEdgeForClipboard(cy.edges()[index])),
    ],
  };
};

const getCanvasHistorySignature = (snapshot) => JSON.stringify(snapshot?.elements || []);

const REGIONS = [
  'Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir',
  'Tabuk', 'Qassim', 'Hail', 'Northern Borders', 'Jazan',
  'Najran', 'Al Bahah', 'Al Jouf',
];

const PIPELINE_MATERIALS = ['Steel', 'Ductile Iron', 'HDPE', 'Concrete', 'PVC'];

const ACTIVITY_ASSET_MAPPING = {
  'Water resources': ['Groundwater wells', 'Surface water dams'],
  'Water production': ['Seawater desalination', 'Operational storage', 'Water Purification'],
  'Water transmission': ['Transmission pipeline', 'Operational storage'],
  'Strategic storage': ['Strategic storage'],
  'Water distribution': ['Handover point / city gate', 'Distribution network', 'Operational storage', 'Filling station'],
  'Wastewater collection': ['Collection network'],
  'Wastewater treatment': ['Treatment plant'],
  'TSE reuse': ['Transmission pipeline', 'Operational storage', 'Filling station'],
};

const RELEVANT_ASSET_TYPES = {
  plant: ['Seawater desalination', 'Water Purification', 'Groundwater wells', 'Surface water dams', 'Treatment plant'],
  tank: ['Operational storage', 'Strategic storage'],
  point: ['Handover point / city gate', 'Distribution network', 'Filling station', 'Collection network'],
  stp: ['Treatment plant'],
  'filling-station': ['Filling station'],
  'distribution-point': ['Handover point / city gate'],
  node: [],
  pump: [],
};

// ─── Asset categorization (mirrors SimulationPage logic) ──────────────────────
function categorizeAsset(asset) {
  const activity = asset.activity;
  const assetType = asset.asset_type;
  if (activity === 'Wastewater treatment' && assetType === 'Treatment plant') return 'stp';
  if (assetType === 'Filling station') return 'filling-station';
  if (activity === 'Water distribution' && assetType === 'Handover point / city gate') return 'point';
  const plantActivities = ['Water production', 'Water resources'];
  const plantAssetTypes = ['Seawater desalination', 'Water Purification', 'Groundwater wells', 'Surface water dams'];
  const tankActivities = ['Water production', 'Water transmission', 'Strategic storage', 'Water distribution', 'TSE reuse'];
  const tankAssetTypes = ['Operational storage', 'Strategic storage'];
  const pointActivities = ['Water distribution', 'TSE reuse', 'Wastewater collection'];
  const pointAssetTypes = ['Handover point / city gate', 'Distribution network', 'Collection network'];
  if (plantActivities.includes(activity) && plantAssetTypes.includes(assetType)) return 'plant';
  if (tankActivities.includes(activity) && tankAssetTypes.includes(assetType)) return 'tank';
  if (pointActivities.includes(activity) && pointAssetTypes.includes(assetType)) return 'point';
  return null;
}

function getRelevantActivities(entityType) {
  const assetTypesForEntity = RELEVANT_ASSET_TYPES[entityType] || [];
  return Object.entries(ACTIVITY_ASSET_MAPPING)
    .filter(([, types]) => types.some(t => assetTypesForEntity.includes(t)))
    .map(([act]) => act);
}

function getAssetTypesForEntityAndActivity(entityType, activity) {
  const forEntity = RELEVANT_ASSET_TYPES[entityType] || [];
  const forActivity = ACTIVITY_ASSET_MAPPING[activity] || [];
  return forActivity.filter(t => forEntity.includes(t));
}

// ─── Cytoscape style ──────────────────────────────────────────────────────────
const buildCyStyle = () => {
  const styles = [
    // Default node
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'width': 200,
        'height': 64,
        'background-color': '#ffffff',
        'background-opacity': 1,
        // Single background image: a data-URI SVG that draws the lifecycle
        // band + the toolbar asset icon. The toolbar icon's SVG content is
        // inlined into the data-URI as a base64 <image> so it doesn't need
        // an external fetch (browsers block external resources inside
        // data-URI SVGs). The base64 cache is populated asynchronously at
        // module load; until it's ready the band still renders correctly.
        'background-image': 'data(cardIcon)',
        'background-fit': 'none',
        'background-width': 60,
        'background-height': 64,
        'background-position-x': '0px',
        'background-position-y': '0px',
        'background-clip': 'node',
        'border-width': 2,
        // Black by default. Status is conveyed by the icon section tint,
        // so the border carries other signals only — capacity limit (yellow)
        // and the highlight classes (selection, trace, bottleneck, etc.).
        'border-color': '#0f172a',
        'border-style': 'solid',
        'label': '',
        'text-valign': 'center',
        'text-halign': 'center',
        'color': '#111827',
        'font-size': 9.5,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'font-weight': '700',
        'line-height': 1.22,
        'text-wrap': 'wrap',
        // Right section is (200 - 60) = 140px wide; leave a bit of inner
        // padding so wrapped labels don't kiss the border.
        'text-max-width': 124,
        'text-overflow-wrap': 'anywhere',
        // Shift the label horizontally so it centers in the RIGHT section
        // (centered at x = 60 + 140/2 = 130, which is +30 from node center).
        'text-margin-x': 30,
        'text-margin-y': 0,
        'shadow-blur': 8,
        'shadow-color': '#0f172a',
        'shadow-opacity': 0.12,
        'shadow-offset-x': 0,
        'shadow-offset-y': 2,
      },
    },
    {
      selector: 'node[displayLabel]',
      style: {
        'label': 'data(displayLabel)',
      },
    },
    {
      selector: 'node[cardLabel]',
      style: {
        'label': 'data(cardLabel)',
      },
    },
    // Per-type background tweaks — cards stay white; identity comes from the
    // shared toolbar SVG in the left section.
    ...Object.entries(ENTITY_TYPE_COLORS).map(([type]) => ({
      selector: `node[type="${type}"]`,
      style: {
        'background-color': '#ffffff',
        'color': '#111827',
      },
    })),
    // Capacity-limited assets: yellow border (highest non-highlight signal).
    {
      selector: 'node[hasCapacityLimit="true"]',
      style: {
        'border-color': '#f59e0b',
        'border-width': 3,
      },
    },
    // Inactive assets — dashed border so they read as "not in service" at a
    // glance. The border colour is whatever the capacity-limit / highlight
    // rules picked; only the dash pattern changes. `[!active]` matches when
    // the data attribute is falsy — covers boolean false and the defensive
    // string "false" without a data-shape change.
    {
      selector: 'node[!active]',
      style: {
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node[status="inactive"]',
      style: {
        'border-style': 'dashed',
      },
    },
    // Junction node (small dot)
    {
      selector: 'node[type="node"]',
      style: {
        'shape': 'ellipse',
        'width': 16,
        'height': 16,
        'background-color': '#ffffff',
        'background-image': 'none',
        'color': '#4b5563',
        'label': '',
        'border-width': 2,
        'shadow-blur': 3,
        'shadow-opacity': 0.16,
      },
    },
    // Pumps inherit the standard card. Hiding labels leaves the SVG visible
    // rather than replacing it with a text abbreviation.
    {
      selector: 'node.hide-labels[abbr]',
      style: {
        'label': '',
      },
    },
    {
      selector: 'node.hide-labels[type="node"]',
      style: { 'label': '' },
    },
    // Selection highlight
    {
      selector: 'node:selected',
      style: {
        'border-color': '#0969da',
        'border-width': 4,
        'border-style': 'solid',
        'overlay-color': '#0969da',
        'overlay-padding': 5,
        'overlay-opacity': 0.15,
      },
    },
    // Draw source highlight
    {
      selector: 'node.draw-source',
      style: {
        'border-color': '#0969da',
        'border-width': 5,
        'overlay-color': '#0969da',
        'overlay-opacity': 0.18,
      },
    },
    // Delivery point with no demand assigned by the selected scenario
    {
      selector: 'node.demand-flagged',
      style: {
        'border-color': '#d97706',
        'border-width': 4,
        'border-style': 'dashed',
        'overlay-color': '#d97706',
        'overlay-padding': 4,
        'overlay-opacity': 0.12,
      },
    },
    // ── Flow tracing ──────────────────────────────────────────────────
    { selector: 'node.trace-root', style: { 'border-color': '#0969da', 'border-width': 6, 'overlay-color': '#0969da', 'overlay-padding': 6, 'overlay-opacity': 0.2, 'z-index': 1000 } },
    { selector: 'node.trace-up',   style: { 'border-color': '#2563eb', 'border-width': 4, 'z-index': 900 } },   // upstream = where it comes from
    { selector: 'node.trace-down', style: { 'border-color': '#16a34a', 'border-width': 4, 'z-index': 900 } },   // downstream = where it goes
    { selector: 'edge.trace-up-edge',   style: { 'line-color': '#2563eb', 'target-arrow-color': '#2563eb', 'source-arrow-color': '#2563eb', 'width': 5, 'opacity': 1, 'z-index': 900 } },
    { selector: 'edge.trace-down-edge', style: { 'line-color': '#16a34a', 'target-arrow-color': '#16a34a', 'source-arrow-color': '#16a34a', 'width': 5, 'opacity': 1, 'z-index': 900 } },
    { selector: '.trace-dim', style: { 'opacity': 0.1 } },
    { selector: '.isolate-dim', style: { 'opacity': 0.08 } },
    // ── Bottleneck highlighting ───────────────────────────────────────
    { selector: 'edge.bn-line',  style: { 'line-color': '#dc2626', 'target-arrow-color': '#dc2626', 'source-arrow-color': '#dc2626', 'width': 6, 'opacity': 1, 'z-index': 950 } },           // line/pipe bottleneck
    { selector: 'node.bn-plant', style: { 'border-color': '#dc2626', 'border-width': 6, 'border-style': 'double', 'overlay-color': '#dc2626', 'overlay-padding': 6, 'overlay-opacity': 0.18, 'z-index': 950 } },         // plant bottleneck
    { selector: 'node.bn-point', style: { 'border-color': '#b45309', 'border-width': 6, 'border-style': 'double', 'overlay-color': '#f59e0b', 'overlay-padding': 6, 'overlay-opacity': 0.18, 'z-index': 950 } },         // delivery-point bottleneck
    // Default edge (pipe)
    {
      selector: 'edge',
      style: {
        'width': 2.5,
        'line-color': '#6e96d0',
        'target-arrow-color': '#6e96d0',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': '',
        'font-size': 9,
        'color': '#57606a',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'text-rotation': 'autorotate',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.85,
        'text-background-padding': 2,
      },
    },
    {
      selector: 'edge[displayLabel]',
      style: {
        'label': 'data(displayLabel)',
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
    // Edges with bend points: switch the curve to segments so cytoscape
    // actually renders the kink at each (weight, distance) pair the
    // cytoscape-edge-editing plugin stores in edge data. Without this the
    // plugin writes the bend to data but the line stays a straight bezier
    // and the bend appears invisible.
    {
      selector: 'edge.edgebendediting-hasbendpoints',
      style: {
        'curve-style': 'segments',
        'segment-weights': 'data(cyedgebendeditingWeights)',
        'segment-distances': 'data(cyedgebendeditingDistances)',
      },
    },
    // Capacity limitation → amber edge
    {
      selector: 'edge[hasCapacityLimit="true"]',
      style: {
        'line-color': '#bf8700',
        'target-arrow-color': '#bf8700',
      },
    },
    // Bidirectional edge
    {
      selector: 'edge[bidirectional="true"]',
      style: {
        'source-arrow-shape': 'triangle',
        'source-arrow-color': '#6e96d0',
      },
    },
    // Insert target highlight
    {
      selector: 'edge.insert-target',
      style: {
        'line-color': '#bf8700',
        'target-arrow-color': '#bf8700',
        'width': 4,
        'overlay-color': '#e6a000',
        'overlay-opacity': 0.25,
      },
    },
    // Edge being reconnected (source/destination change in progress)
    {
      selector: 'edge.reconnect-target',
      style: {
        'line-color': '#6366f1',
        'target-arrow-color': '#6366f1',
        'line-style': 'dashed',
        'width': 4,
        'overlay-color': '#6366f1',
        'overlay-opacity': 0.2,
      },
    },
    // Edge hide-labels
    {
      selector: 'edge.hide-labels',
      style: { 'label': '' },
    },
    // Annotation note node
    {
      selector: 'node[type="note"]',
      style: {
        'shape': 'round-rectangle',
        'width': 220,
        'height': 100,
        'background-color': '#fef9c3',
        'background-opacity': 0,
        'border-width': 2,
        'border-style': 'dashed',
        'border-color': '#d97706',
        'border-opacity': 0,
        'label': '',
        'text-valign': 'top',
        'text-halign': 'center',
        'color': '#713f12',
        'font-size': 11,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'font-weight': '500',
        'line-height': 1.25,
        'text-wrap': 'wrap',
        'text-max-width': 196,
        'text-margin-y': 12,
        'z-index': 10,
      },
    },
    {
      selector: 'node[type="note"][boxWidth]',
      style: { 'width': 'data(boxWidth)' },
    },
    {
      selector: 'node[type="note"][boxHeight]',
      style: { 'height': 'data(boxHeight)' },
    },
    {
      selector: 'node[type="note"][noteTextMaxWidth]',
      style: { 'text-max-width': 'data(noteTextMaxWidth)' },
    },
    {
      selector: 'node[type="note"][displayLabel]',
      style: {
        'label': '',
      },
    },
    {
      selector: 'node[type="note"][noteFont="serif"]',
      style: {
        'font-family': 'Georgia, "Times New Roman", serif',
      },
    },
    {
      selector: 'node[type="note"][noteFont="mono"]',
      style: {
        'font-family': '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      },
    },
    {
      selector: 'node[type="note"][noteFontSize="small"]',
      style: { 'font-size': 10 },
    },
    {
      selector: 'node[type="note"][noteFontSize="large"]',
      style: { 'font-size': 13 },
    },
    {
      selector: 'node[type="note"][noteFontSize="xlarge"]',
      style: { 'font-size': 15 },
    },
    {
      selector: 'node[type="note"][noteBold="true"]',
      style: { 'font-weight': '700' },
    },
    {
      selector: 'node[type="note"][noteItalic="true"]',
      style: { 'font-style': 'italic' },
    },
    {
      selector: 'node[type="note"][noteUnderline="true"]',
      style: { 'text-decoration-line': 'underline' },
    },
    // Group box node (visual-only backdrop)
    {
      selector: 'node[type="group-box"]',
      style: {
        'shape': 'round-rectangle',
        'width': 240,
        'height': 160,
        'background-color': '#3b82f6',
        'background-opacity': 0.05,
        'border-width': 2,
        'border-style': 'dashed',
        'border-color': '#3b82f6',
        'border-opacity': 0.5,
        'label': '',
        'text-valign': 'top',
        'text-halign': 'center',
        'color': '#3b82f6',
        'font-size': 11,
        'z-index': 0,
      },
    },
    {
      selector: 'node[type="group-box"][boxWidth]',
      style: { 'width': 'data(boxWidth)' },
    },
    {
      selector: 'node[type="group-box"][boxHeight]',
      style: { 'height': 'data(boxHeight)' },
    },
    {
      selector: 'node[type="group-box"][displayLabel]',
      style: {
        'label': 'data(displayLabel)',
      },
    },
  ];
  return styles;
};

// ─── Empty form factories ──────────────────────────────────────────────────────
const emptyEntityForm = (type = 'plant') => ({
  name: '',
  type,
  status: 'planned',
  capacity: '',
  // Line-style capacity limitation pair (matches edge form).
  capacityLimitationType: 'none',
  capacityLimitationValue: '',
  // Kept (empty) for back-compat with any legacy spread that still reads it.
  capacityUsageLimit: '',
  commissioningDate: '',
  decommissioningDate: '',
  active: true,
  activity: type === 'point' ? 'Water distribution' : '',
  assetType: type === 'point' ? 'Handover point / city gate' : '',
  region: '',
  entityTypeCategory: '',
  plantType: '',
  technology: '',
  waterSource: '',
  variableOM: '',
  // Pump-station composition: each entry is one pump with its own role,
  // capacity, and on/off state. Created/edited from the entity modal when
  // type === 'pump'; consumed by SimulationConfigPage to render the pump
  // strip and compute station-level functional capacity.
  pumps: type === 'pump' ? [{ id: 'pump-1', name: 'Pump 1', role: 'functional', capacity: '', isActive: true }] : [],
});

// Coerce the pump-station form's pump list into the shape used on the node:
// numeric capacity, a stable id, a role in {functional, backup}, and an
// explicit isActive boolean. Always returns at least one pump so a saved
// pump station never reports "no pumps configured".
const normalizePumpList = (raw) => {
  const list = Array.isArray(raw) && raw.length ? raw : [{}];
  return list.map((pump, idx) => {
    const role = pump?.role === 'backup' ? 'backup' : 'functional';
    const capacityNum = Number(pump?.capacity);
    return {
      id: pump?.id || `pump-${idx + 1}`,
      name: (pump?.name || '').trim() || `Pump ${idx + 1}`,
      role,
      capacity: Number.isFinite(capacityNum) ? capacityNum : 0,
      isActive: pump?.isActive ?? true,
    };
  });
};

// Specifications can arrive as an object or as a JSON string (depending on the
// repository) — normalise to a plain object either way.
const parseSpecifications = (specs) => {
  if (!specs) return {};
  if (typeof specs === 'string') {
    try { return JSON.parse(specs); } catch { return {}; }
  }
  return typeof specs === 'object' ? specs : {};
};

// Build a COMPLETE entity form from a full asset record fetched from the
// database, so every detail (top-level fields + dynamic specifications) is
// carried onto the placed node — not just the handful of fields mapped before.
const buildAssetEntityForm = (asset, entityType) => {
  const specs = parseSpecifications(asset.specifications);
  const pick = (...vals) =>
    vals.find(v => v !== undefined && v !== null && v !== '') ?? '';
  return {
    name: asset.name || asset._name || asset.assetNameAr || '',
    type: entityType || asset._entityType || 'plant',
    status: normalizeAssetStatus(asset.status),
    capacity: pick(asset.capacity, specs.design_capacity, specs.maximum_capacity, specs.total_capacity, specs.handover_capacity, specs.strategic_capacity),
    // Both the legacy single-percentage field (kept for any external readers)
    // and the line-style pair (used by the new entity form UI).
    capacityUsageLimit: pick(specs.capacity_usage_limit, specs.capacityUsageLimit),
    capacityLimitationType:
      pick(specs.capacity_usage_limit, specs.capacityUsageLimit) ? 'percentage' : 'none',
    capacityLimitationValue: pick(specs.capacity_usage_limit, specs.capacityUsageLimit),
    commissioningDate: asset.commissioning_date || '',
    decommissioningDate: asset.decommissioning_date || '',
    active: asset.status ? normalizeAssetStatus(asset.status) !== 'inactive' : true,
    activity: asset.activity || '',
    assetType: asset.asset_type || '',
    region: asset.region || '',
    entityTypeCategory: asset.entity_type || asset.entityType || '',
    plantType: pick(specs.plant_type, specs.plantType),
    technology: pick(specs.technology),
    waterSource: pick(specs.water_source, specs.waterSource),
    variableOM: pick(specs.variable_om_sar_m3, specs.variableOM),
    governorate: asset.governorate || '',
    city: asset.city || '',
    assetId: asset.id,
    // Carry the full DB record + parsed specs so nothing is lost downstream.
    originalAsset: asset,
    specifications: specs,
  };
};

const parseCapacityInput = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const ensureAssetCapacityForPlacement = (asset, entityType) => {
  if (!asset) return null;
  const form = buildAssetEntityForm(asset, entityType || asset._entityType);
  if (parseCapacityInput(form.capacity) !== null) return asset;

  const assetName = asset._name || asset.name || asset.assetNameAr || 'this asset';
  let entered = window.prompt(
    `"${assetName}" does not have a capacity value. Enter capacity in m3/day before placing it on the canvas:`,
    ''
  );

  while (entered !== null && parseCapacityInput(entered) === null) {
    window.alert('Capacity must be a positive number.');
    entered = window.prompt(
      `"${assetName}" does not have a capacity value. Enter capacity in m3/day before placing it on the canvas:`,
      entered || ''
    );
  }

  const capacity = parseCapacityInput(entered);
  if (capacity === null) return null;
  return { ...asset, capacity };
};

const emptyPipeForm = () => ({
  name: '',
  capacity: '',
  commissioningDate: '',
  decommissioningDate: '',
  active: true,
  pipelineLength: '',
  pipelineDiameter: '',
  pipelineMaterial: '',
  designCapacity: '',
  maximumCapacity: '',
  infraSource: '',
  bidirectional: false,
  capacityLimitationType: 'none',
  capacityLimitationValue: '',
  transmissionSystemId: '',
  newTransmissionSystemName: '',
  lineGroupId: '',
  newLineName: '',
  isBranch: false,
  parentLineId: '',
  branchName: '',
});

// ─── Analytics Modal ─────────────────────────────────────────────────────────
function AKpiCard({ label, value, sub, color }) {
  return (
    <div className="ns2-analytics-kpi-card">
      <div className="ns2-analytics-kpi-value" style={{ color: color || '#24292f' }}>{value}</div>
      <div className="ns2-analytics-kpi-label">{label}</div>
      {sub && <div className="ns2-analytics-kpi-sub">{sub}</div>}
    </div>
  );
}

function AProgressBar({ label, value, max, color, rawValue }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tooltip = rawValue != null
    ? `${label}: ${fmtCubic(rawValue)} (${pct.toFixed(1)}%)`
    : `${label}: ${pct.toFixed(1)}%`;
  return (
    <div className="ns2-apb-row">
      <div className="ns2-apb-header">
        <span className="ns2-apb-label" title={label}>{label}</span>
        <span className="ns2-apb-val">{pct.toFixed(1)}%</span>
      </div>
      <div className="ns2-apb-track ns2-has-tooltip" data-tooltip={tooltip}>
        <div className="ns2-apb-fill" style={{ width: `${pct}%`, background: color || '#3b82f6' }} />
      </div>
    </div>
  );
}

function fmtCubic(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)} M m³`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)} k m³`;
  return `${Number(v).toFixed(1)} m³`;
}

const NS2_ANALYTICS_MAX_POINTS = 180;
const NS2_ANALYTICS_MAX_SERIES = 8;
const NS2_ANALYTICS_MAX_CARDS = 40;

function ns2SampleSeries(rows, maxPoints = NS2_ANALYTICS_MAX_POINTS) {
  if (!Array.isArray(rows) || rows.length <= maxPoints) return rows || [];
  const step = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_, index) => index % step === 0);
  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function ns2SampleIndexes(length, maxPoints = NS2_ANALYTICS_MAX_POINTS) {
  if (!length || length <= maxPoints) return Array.from({ length }, (_, index) => index);
  const step = Math.ceil(length / maxPoints);
  const indexes = [];
  for (let index = 0; index < length; index += step) indexes.push(index);
  if (indexes[indexes.length - 1] !== length - 1) indexes.push(length - 1);
  return indexes;
}

export function SimulationAnalyticsPanel({
  simResults,
  simMeta = {},
  nodeNameMap = {},
  canvasEntities = [],
  simChartData = [],
  simRegionalData = {},
  simScenario = null,
  simRunConfig = null,
  onBack,
  onClear,
  onViewBottlenecks,
}) {
  const getName = (id) => nodeNameMap[id] || id;

  // ── Analytics loading overlay ────────────────────────────────────────────
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadFadeOut, setLoadFadeOut] = useState(false);
  const [loadStatus, setLoadStatus] = useState('Processing simulation data…');

  // ── Legend filter states for analytics charts ────────────────────────────
  const [sectorFilter, setSectorFilter] = useState('all');
  const [sectorLegendsExpanded, setSectorLegendsExpanded] = useState(false);
  const [regionFilter2, setRegionFilter2] = useState('all');
  const [regionLegendsExpanded2, setRegionLegendsExpanded2] = useState(false);
  const [supplyDemandFilter, setSupplyDemandFilter] = useState('all');
  const [sdSeriesFilter, setSdSeriesFilter] = useState('all');
  const [plantFilter, setPlantFilter] = useState('all');
  const [plantLegendsExpanded, setPlantLegendsExpanded] = useState(false);
  const [tankFilter, setTankFilter] = useState('all');
  const [tankLegendsExpanded, setTankLegendsExpanded] = useState(false);
  const [shortageFilter, setShortageFilter] = useState('all');
  const [shortageLegendsExpanded, setShortageLegendsExpanded] = useState(false);

  useEffect(() => {
    setAnalyticsReady(false);
    setLoadProgress(0);
    setLoadFadeOut(false);
    setLoadStatus('Processing simulation data…');
    const timers = [
      setTimeout(() => { setLoadProgress(18); }, 80),
      setTimeout(() => { setLoadProgress(38); setLoadStatus('Building charts…'); }, 300),
      setTimeout(() => { setLoadProgress(58); }, 650),
      setTimeout(() => { setLoadProgress(76); setLoadStatus('Rendering analytics…'); }, 1050),
      setTimeout(() => { setLoadProgress(92); }, 1450),
      setTimeout(() => { setLoadProgress(100); setLoadStatus('Ready'); setLoadFadeOut(true); }, 1800),
      setTimeout(() => { setAnalyticsReady(true); }, 2150),
    ];
    return () => timers.forEach(clearTimeout);
  }, [simResults]); // re-run if results change (new simulation run)

  const r = simResults?.results || {};
  const s = simResults?.summary || {};
  const charts = simResults?.charts || {};

  if (!analyticsReady) {
    return (
      <div className="ns2-analytics-panel">
        <div className="ns2-analytics-panel-header">
          <button className="ns2-btn" onClick={onBack} title="Back to canvas">
            <IconChevronLeft size={12} /> Back to Canvas
          </button>
          <div className="ns2-analytics-panel-title">
            <IconActivity size={14} /> Simulation Analytics
            {s.dateRange && (
              <span className="ns2-analytics-panel-subtitle">
                &nbsp;·&nbsp;{s.dateRange.start}–{s.dateRange.end}
                {s.plantsCount ? `  ·  ${s.plantsCount} plant${s.plantsCount !== 1 ? 's' : ''}` : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="ns2-btn" disabled title="Analytics exports are available when rendering is ready">
              <IconDownload size={12} /> Excel
            </button>
            <button className="ns2-btn" disabled title="Analytics exports are available when rendering is ready">
              <IconDownload size={12} /> PDF
            </button>
            <button
              className="ns2-btn"
              style={{ background: '#6e7781', color: '#fff', borderColor: '#6e7781' }}
              onClick={onClear}
            >
              <IconX size={12} /> Clear Results
            </button>
          </div>
        </div>
        <div className={`ns2-analytics-loading-overlay${loadFadeOut ? ' ns2-analytics-loading-overlay--out' : ''}`}>
          <div className="ns2-analytics-loading-bar-track">
            <div className="ns2-analytics-loading-bar-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <div className="ns2-analytics-loading-body">
            <div className="ns2-analytics-loading-status">
              <span className="ns2-analytics-loading-dot" />
              {loadStatus}
            </div>
            <div className="ns2-analytics-kpi-grid" style={{ marginBottom: 16 }}>
              {[0,1,2,3].map(i => (
                <div key={i} className="ns2-analytics-kpi-card-lg">
                  <div className="ns2-skeleton ns2-skeleton--kpi-val" />
                  <div className="ns2-skeleton ns2-skeleton--kpi-lbl" style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
            <div className="ns2-skeleton ns2-skeleton--banner" />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 10, width: '80%' }} />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 8, width: '65%' }} />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 8, width: '72%' }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Detect year-range vs single-date result shape ────────────────────────
  // Year-range results have r.year_range_analysis === true
  const isYearRange = !!r.year_range_analysis;

  // Daily trend entries live inside enhanced_network_insights for year-range runs
  const dailyTrends = r.enhanced_network_insights?.year_range_analysis?.daily_trends || [];
  const perfMetrics = r.enhanced_network_insights?.year_range_analysis?.performance_metrics || {};

  // ── KPI: demand satisfaction ─────────────────────────────────────────────
  // single-date → r.summary.demand_satisfaction
  // year-range  → r.summary.average_demand_satisfaction
  // Formula: (water actually delivered to demand points / total demand) × 100
  const satisfaction =
    r.summary?.demand_satisfaction ??
    r.summary?.average_demand_satisfaction ??
    null;

  const overallStatus =
    r.summary?.overall_status ||
    (satisfaction != null
      ? satisfaction >= 80 ? 'healthy' : satisfaction >= 50 ? 'warning' : 'critical'
      : 'warning');

  // ── Totals: single-date has them in r.summary; year-range: sum from trends ─
  // `s.totalSupply` is installed capacity, not water delivered to demand
  // points. Prefer the per-point flow series shared with detailed analysis.
  const flowSeries = r.daily_series || {};
  const sumSeries = (seriesMap) => Object.values(seriesMap || {}).reduce(
    (total, values) => total + (Array.isArray(values)
      ? values.reduce((sum, value) => sum + Number(value || 0), 0)
      : Number(values || 0)),
    0
  );
  const seriesDelivered = sumSeries(flowSeries.delivered);
  const seriesShortage = sumSeries(flowSeries.shortages);
  const hasFlowSeries = Array.isArray(flowSeries.dates) && flowSeries.dates.length > 0
    && (Object.keys(flowSeries.delivered || {}).length > 0 || Object.keys(flowSeries.shortages || {}).length > 0);

  const totalDelivered = hasFlowSeries
    ? seriesDelivered
    : (r.summary?.total_delivered ?? (dailyTrends.length
      ? dailyTrends.reduce((total, trend) => total + Number(trend.total_delivered || 0), 0)
      : 0));
  const totalShortage = hasFlowSeries
    ? seriesShortage
    : (r.summary?.total_shortage ?? (dailyTrends.length
      ? dailyTrends.reduce((total, trend) => total + Number(trend.total_shortage || 0), 0)
      : 0));
  const totalDemand = hasFlowSeries
    ? seriesDelivered + seriesShortage
    : (r.summary?.total_demand ?? totalDelivered + totalShortage);

  // ── Plant / tank analysis ─────────────────────────────────────────────────
  // single-date: r.plant_analysis and r.tank_analysis exist at top level
  // year-range:  only available per-date inside daily_results; use avg from perfMetrics
  const plantAnalysis = r.plant_analysis || {};
  const avgPlantUtil = perfMetrics.plant_utilization_trend?.length
    ? perfMetrics.plant_utilization_trend.reduce((a, b) => a + b, 0) / perfMetrics.plant_utilization_trend.length
    : null;
  const plantUtil = plantAnalysis.utilization ?? avgPlantUtil;

  const tankAnalysis = r.tank_analysis || {};
  const avgTankUtil = perfMetrics.tank_utilization_trend?.length
    ? perfMetrics.tank_utilization_trend.reduce((a, b) => a + b, 0) / perfMetrics.tank_utilization_trend.length
    : null;
  const tankUtil = tankAnalysis.utilization ?? avgTankUtil;

  // ── Mass balance ──────────────────────────────────────────────────────────
  // single-date: r.mass_balance.is_balanced
  // year-range:  r.summary.mass_balance_maintained_percentage (% of dates balanced)
  const massBalance = r.mass_balance || {};
  const massBalancePct = r.summary?.mass_balance_maintained_percentage ?? null;
  const massBalanceIsBalanced =
    massBalance.is_balanced ??
    (massBalancePct != null ? massBalancePct >= 95 : null);

  // ── Shortages ─────────────────────────────────────────────────────────────
  // single-date: r.shortages_simple = {pointId: amount(number)}
  // year-range:  r.shortages = {pointId: {date: amount}}  — needs flattening
  const shortages = (() => {
    if (r.shortages_simple && Object.keys(r.shortages_simple).length > 0) return r.shortages_simple;
    const flat = {};
    Object.entries(r.shortages || {}).forEach(([id, val]) => {
      if (typeof val === 'number') { flat[id] = val; }
      else if (val && typeof val === 'object') {
        const sum = Object.values(val).reduce((a, b) => (typeof b === 'number' ? a + b : a), 0);
        if (sum > 0) flat[id] = sum;
      }
    });
    return flat;
  })();

  // ── Bottlenecks, outputs, storage ────────────────────────────────────────
  const bottlenecks = r.bottlenecks || {};
  const plantOutputs = r.plant_outputs || {};
  const tankStorage = r.tank_storage || {};
  const tankNames = r.tank_names || {};

  // ── Counts / colours ──────────────────────────────────────────────────────
  const bottleneckCount = Object.keys(bottlenecks).length;
  const shortageCount = Object.keys(shortages).length;

  const satisfactionColor = satisfaction != null
    ? (satisfaction >= 80 ? '#1a7f37' : satisfaction >= 50 ? '#9a6700' : '#a40e26')
    : '#6e7781';
  const plantUtilColor = plantUtil >= 90 ? '#a40e26' : plantUtil >= 70 ? '#9a6700' : '#1a7f37';
  const tankUtilColor = tankUtil != null
    ? (tankUtil < 20 ? '#a40e26' : tankUtil < 50 ? '#9a6700' : '#10b981')
    : '#6e7781';
  const bottleneckColor = bottleneckCount > 5 ? '#a40e26' : bottleneckCount > 0 ? '#9a6700' : '#1a7f37';

  const bannerVariant = overallStatus === 'healthy' ? 'healthy' : overallStatus === 'warning' ? 'warning' : 'critical';
  const BannerIcon = bannerVariant === 'healthy' ? IconCheckSquare : bannerVariant === 'warning' ? IconAlertTriangle : IconX;
  const bannerText = bannerVariant === 'healthy'
    ? 'Network is healthy — all demand targets met within tolerance'
    : bannerVariant === 'warning'
    ? 'Warning — some demand points experiencing supply shortfall'
    : 'Critical — significant supply shortages detected';

  // ── Year-over-year chart data ─────────────────────────────────────────────
  // Prefer actual per-year trend data (real delivered + shortage values) over
  // the flat static chart that repeats the same total capacity value every year.
  // The year-over-year supply-vs-demand visual is intentionally omitted from
  // the results experience. Keep the shared analytics view focused on its
  // operational cards and detailed analysis.
  const hasYoyChart = false;
  const yoyLabels = [];
  const yoySupply = [];
  const yoyDemand = [];
  const maxChartVal = 1;

  const sortedBottlenecks = Object.entries(bottlenecks).sort((a, b) => (b[1]?.utilization || 0) - (a[1]?.utilization || 0));
  const sortedShortages = Object.entries(shortages).sort((a, b) => (b[1] || 0) - (a[1] || 0));

  const EDGE_COLOUR_ROWS = [
    { color: '#dc2626', label: 'Bottleneck pipe (causing shortage)' },
    { color: '#7c3aed', label: 'Critical (≥90% capacity)' },
    { color: '#f59e0b', label: 'High flow (70–90% capacity)' },
    { color: '#22c55e', label: 'Active flow (<70% capacity)' },
    { color: '#6b7280', label: 'No flow / inactive' },
  ];

  return (
    <div className="ns2-analytics-panel">

      {/* ── Loading overlay ─────────────────────────────────────────────── */}
      {!analyticsReady && (
        <div
          className={`ns2-analytics-loading-overlay${loadFadeOut ? ' ns2-analytics-loading-overlay--out' : ''}`}
          onTransitionEnd={() => { if (loadFadeOut) setAnalyticsReady(true); }}
        >
          <div className="ns2-analytics-loading-bar-track">
            <div className="ns2-analytics-loading-bar-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <div className="ns2-analytics-loading-body">
            <div className="ns2-analytics-loading-status">
              <span className="ns2-analytics-loading-dot" />
              {loadStatus}
            </div>
            <div className="ns2-analytics-kpi-grid" style={{ marginBottom: 16 }}>
              {[0,1,2,3].map(i => (
                <div key={i} className="ns2-analytics-kpi-card-lg">
                  <div className="ns2-skeleton ns2-skeleton--kpi-val" />
                  <div className="ns2-skeleton ns2-skeleton--kpi-lbl" style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
            <div className="ns2-skeleton ns2-skeleton--banner" />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 10, width: '80%' }} />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 8, width: '65%' }} />
            <div className="ns2-skeleton ns2-skeleton--stat" style={{ marginTop: 8, width: '72%' }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ns2-analytics-panel-header">
        <button className="ns2-btn" onClick={onBack} title="Back to canvas">
          <IconChevronLeft size={12} /> Back to Canvas
        </button>
        <div className="ns2-analytics-panel-title">
          <IconActivity size={14} /> Simulation Analytics
          {s.dateRange && (
            <span className="ns2-analytics-panel-subtitle">
              &nbsp;·&nbsp;{s.dateRange.start}–{s.dateRange.end}
              {s.plantsCount ? `  ·  ${s.plantsCount} plant${s.plantsCount !== 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="ns2-btn"
            onClick={async () => {
              try {
                const { exportSimulationToExcel } = await import('../utils/simulationExport');
                exportSimulationToExcel(simResults, simMeta, simRunConfig);
              } catch (err) {
                alert(`Excel export failed: ${err.message}`);
              }
            }}
            title="Export all results to Excel"
          >
            <IconDownload size={12} /> Excel
          </button>
          <button
            className="ns2-btn"
            onClick={async () => {
              try {
                const { exportSimulationToPDF } = await import('../utils/simulationExport');
                await exportSimulationToPDF(simResults, simMeta);
              } catch (err) {
                alert(err.message);
              }
            }}
            title="Export all charts to PDF (requires jspdf + html2canvas)"
          >
            <IconDownload size={12} /> PDF
          </button>
          <button
            className="ns2-btn"
            style={{ background: '#6e7781', color: '#fff', borderColor: '#6e7781' }}
            onClick={onClear}
          >
            <IconX size={12} /> Clear Results
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="ns2-analytics-panel-body">

          {/* ═══ SECTION 0 — Simulation Configuration Overview ══════════════════════ */}
          {(() => {
            const cfg = simRunConfig;
            if (!cfg) return null;

            const PRIORITY_LABELS = {
              weighted:      'Weighted Priority',
              equal:         'Equal Distribution',
              critical:      'Critical-First',
              proportional:  'Proportional',
            };
            const priorityLabel = PRIORITY_LABELS[cfg.priorityMode] || cfg.priorityMode || 'Weighted';
            const dr = cfg.dateRange || {};
            const periodText = dr.start === dr.end ? `${dr.start}` : `${dr.start} – ${dr.end}`;
            const modeLabel = cfg.demandInputMode === 'manual' ? 'Manual Entry' : 'Scenario-Based';

            const runParams = [
              { label: 'Simulation Period', value: periodText, icon: IconCalendar },
              { label: 'Purification Rate', value: `${cfg.purificationPct ?? 30}%`, icon: IconDroplet },
              { label: 'Priority Mode', value: priorityLabel, icon: IconSettings },
              { label: 'Storage Reserve', value: `${cfg.strategicStorageMinPct ?? 70}%`, icon: IconLayers },
              { label: 'Demand Mode', value: modeLabel, icon: IconClipboard },
            ];

            const regions = simScenario?.regions || [];
            const description = simScenario?.data?.description || simScenario?.description;

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconSettings size={16} /> Simulation Configuration
                  {simScenario && (
                    <span className="ns2-analytics-scenario-badge">{simScenario.name}</span>
                  )}
                </div>

                {/* Run parameters */}
                <div className="ns2-analytics-config-grid">
                  {runParams.map(p => {
                    const ConfigIcon = p.icon;
                    return (
                      <div key={p.label} className="ns2-analytics-config-item">
                        <div className="ns2-analytics-config-item-icon"><ConfigIcon size={18} /></div>
                        <div className="ns2-analytics-config-item-body">
                          <div className="ns2-analytics-config-item-val">{p.value}</div>
                          <div className="ns2-analytics-config-item-label">{p.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Demand scenario details */}
                {simScenario && (
                  <>
                    <div className="ns2-analytics-subsection-title">Demand Scenario</div>
                    <div className="ns2-analytics-scenario-detail-card">
                      <div className="ns2-analytics-scenario-detail-name">{simScenario.name}</div>
                      {description && (
                        <div className="ns2-analytics-scenario-detail-desc">{description}</div>
                      )}
                      {regions.length > 0 && (
                        <div className="ns2-analytics-scenario-detail-regions">
                          <span className="ns2-analytics-scenario-detail-regions-label">Regions covered:</span>
                          <div className="ns2-analytics-legend-chips" style={{ marginTop: 6, marginBottom: 0 }}>
                            {regions.map((rn, i) => (
                              <span key={rn} className="ns2-analytics-chip" style={{ '--chip-color': ['#2563eb','#16a34a','#9333ea','#ea580c','#0891b2','#db2777'][i % 6] }}>
                                <span className="ns2-analytics-chip-dot" />{rn}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Network composition from summary */}
                {(s.plantsCount || s.tanksCount || s.pointsCount) ? (
                  <>
                    <div className="ns2-analytics-subsection-title">Network Composition</div>
                    <div className="ns2-analytics-config-grid">
                      {s.plantsCount ? (
                        <div className="ns2-analytics-config-item">
                          <div className="ns2-analytics-config-item-icon"><IconPlant size={18} /></div>
                          <div className="ns2-analytics-config-item-body">
                            <div className="ns2-analytics-config-item-val">{s.plantsCount}</div>
                            <div className="ns2-analytics-config-item-label">Treatment Plants</div>
                          </div>
                        </div>
                      ) : null}
                      {s.tanksCount ? (
                        <div className="ns2-analytics-config-item">
                          <div className="ns2-analytics-config-item-icon"><IconLayers size={18} /></div>
                          <div className="ns2-analytics-config-item-body">
                            <div className="ns2-analytics-config-item-val">{s.tanksCount}</div>
                            <div className="ns2-analytics-config-item-label">Storage Tanks</div>
                          </div>
                        </div>
                      ) : null}
                      {s.pointsCount ? (
                        <div className="ns2-analytics-config-item">
                          <div className="ns2-analytics-config-item-icon"><IconTarget size={18} /></div>
                          <div className="ns2-analytics-config-item-body">
                            <div className="ns2-analytics-config-item-val">{s.pointsCount}</div>
                            <div className="ns2-analytics-config-item-label">Delivery Points</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })()}

          {/* ═══ SECTION A — Demand Forecast Analysis ═══════════════════════════════ */}
          {(() => {
            const scenData = simScenario?.data?.forecast_data;
            if (!scenData) return null;

            // Support three scenario formats (mirrors SimulationPage logic):
            // 1. daily_by_target  — target-mode scenarios  { targetName: [{date,forecast,...}] }
            // 2. daily_by_region  — region-mode scenarios  { regionName: [{date,forecast,...}] }
            // 3. daily_forecasts  — legacy aggregated       [{date,forecast,...}]
            const perRegionSource = scenData.daily_by_target || scenData.daily_by_region || null;
            const isTargetMode    = !!scenData.daily_by_target;

            // Build flat dailyForecasts by aggregating across all regions/targets when needed
            let dailyForecasts = scenData?.daily_forecasts || scenData?.data || [];
            if (dailyForecasts.length === 0 && perRegionSource) {
              // Aggregate: collect all dates then sum forecast across every region/target
              const allDates = new Set();
              Object.values(perRegionSource).forEach(arr => {
                if (Array.isArray(arr)) arr.forEach(d => { if (d.date) allDates.add(d.date); });
              });
              dailyForecasts = Array.from(allDates).sort().map(date => {
                let total = 0;
                const point = { date };
                Object.values(perRegionSource).forEach(arr => {
                  if (!Array.isArray(arr)) return;
                  const d = arr.find(x => x.date === date);
                  if (!d) return;
                  total += (d.forecast || 0);
                  // Copy sectoral fields from first region that has them
                  if (!point.mega_daily) {
                    point.mega_daily       = d.mega_daily || 0;
                    point.industries_daily = d.industries_daily || 0;
                    point.tourism_daily    = d.tourism_daily || 0;
                    point.hajj_daily       = d.hajj_daily || 0;
                    point.nrw_loss         = d.nrw_loss || 0;
                  }
                });
                point.forecast = total;
                return point;
              });
            }

            if (dailyForecasts.length === 0) return null;

            const SECTOR_KEYS = [
              { key: 'residential_daily', label: 'Residential', color: '#14b8a6' },
              { key: 'mega_daily',         label: 'Mega Projects', color: '#3b82f6' },
              { key: 'industries_daily',   label: 'Industries',   color: '#f59e0b' },
              { key: 'tourism_daily',      label: 'Tourism',      color: '#8b5cf6' },
              { key: 'hajj_daily',         label: 'Hajj & Umrah', color: '#06b6d4' },
              { key: 'nrw_loss',           label: 'NRW Loss',     color: '#ef4444' },
            ];

            // Downsample if large dataset
            const maxPts = 120;
            const step = dailyForecasts.length > maxPts ? Math.ceil(dailyForecasts.length / maxPts) : 1;
            const sampled = dailyForecasts.filter((_, i) => i % step === 0);

            const sectoralData = sampled.map(d => {
              const row = { date: (d.date || '').substring(0, 10) };
              let assigned = 0;
              SECTOR_KEYS.forEach(s => {
                const v = Number(d[s.key] || 0);
                row[s.key] = v;
                assigned += v;
              });
              // Residential fallback: remainder of forecast
              if (!d.residential_daily) {
                const total = Number(d.forecast || 0);
                row.residential_daily = Math.max(0, total - assigned + (row.residential_daily || 0));
              }
              return row;
            });

            const forecasts = dailyForecasts.map(d => Number(d.forecast || 0)).filter(v => v > 0);
            const minF = forecasts.length ? Math.min(...forecasts) : 0;
            const maxF = forecasts.length ? Math.max(...forecasts) : 0;
            const avgF = forecasts.length ? forecasts.reduce((a, b) => a + b, 0) / forecasts.length : 0;

            const fmtM = v => (v / 1e6).toFixed(3) + ' M m³/d';

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconTrendingUp size={16} /> Demand Forecast Analysis
                  <span className="ns2-analytics-scenario-badge">{simScenario?.name || 'Scenario'}</span>
                </div>

                {/* KPI cards */}
                <div className="ns2-analytics-kpi-grid">
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#2563eb' }}>{fmtM(minF)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Min Daily Demand</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{fmtM(maxF)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Peak Daily Demand</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{fmtM(avgF)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Demand</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{dailyForecasts.length.toLocaleString()} days</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Forecast Horizon</div>
                  </div>
                </div>

                {/* Sectoral breakdown */}
                <div className="ns2-analytics-subsection-title">Sectoral Water Demand Breakdown</div>
                <div className="ns2-analytics-legend-chips">
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${sectorFilter === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={sectorFilter === 'all'} onChange={() => setSectorFilter('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {(sectorLegendsExpanded ? SECTOR_KEYS : SECTOR_KEYS.slice(0, 4)).map(sk => {
                    const selected = sectorFilter === 'all' || (Array.isArray(sectorFilter) ? sectorFilter.includes(sk.key) : sectorFilter === sk.key);
                    return (
                      <label key={sk.key} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': sk.color }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (sectorFilter === 'all') { setSectorFilter([sk.key]); }
                          else if (Array.isArray(sectorFilter)) {
                            const updated = sectorFilter.includes(sk.key) ? sectorFilter.filter(k => k !== sk.key) : [...sectorFilter, sk.key];
                            setSectorFilter(updated.length > 0 ? updated : 'all');
                          } else { setSectorFilter([sk.key]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{sk.label}
                      </label>
                    );
                  })}
                  {SECTOR_KEYS.length > 4 && (
                    <button type="button" className="ns2-analytics-chip-toggle-btn" onClick={() => setSectorLegendsExpanded(!sectorLegendsExpanded)}>
                      {sectorLegendsExpanded ? 'Show less' : `Show ${SECTOR_KEYS.length - 4} more`}
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={sectoralData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <defs>
                      {SECTOR_KEYS.map(s => (
                        <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false}
                      tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip
                      formatter={(val, name) => {
                        const s = SECTOR_KEYS.find(x => x.key === name);
                        return [(val/1e6).toFixed(4) + ' M m³', s?.label || name];
                      }}
                      labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                    />
                    {(sectorLegendsExpanded ? SECTOR_KEYS : SECTOR_KEYS.slice(0, 4)).map(sk => {
                      const shouldShow = sectorFilter === 'all' || (Array.isArray(sectorFilter) ? sectorFilter.includes(sk.key) : sectorFilter === sk.key);
                      return shouldShow && (
                        <Area key={sk.key} type="monotone" dataKey={sk.key}
                          stackId="sectors"
                          stroke={sk.color} strokeWidth={1.5}
                          fill={`url(#grad-${sk.key})`}
                          dot={false} activeDot={{ r: 3 }} />
                      );
                    })}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </AreaChart>
                </ResponsiveContainer>

              </div>
            );
          })()}

          {/* ═══ SECTION A2 — Regional Water Demand Comparison ══════════════════════ */}
          {(() => {
            const scenData = simScenario?.data?.forecast_data;
            if (!scenData) return null;
            const perRegionSource2 = scenData.daily_by_target || scenData.daily_by_region || null;
            const isTargetMode2    = !!scenData.daily_by_target;
            const scenRegionNames2 = perRegionSource2 ? Object.keys(perRegionSource2) : [];

            const REG_COLORS2 = ['#2563eb','#16a34a','#9333ea','#ea580c','#0891b2','#db2777','#65a30d','#b45309'];
            let regionChartData2 = [];
            let regionNames2 = [];

            if (scenRegionNames2.length > 0) {
              regionNames2 = scenRegionNames2;
              const allDates2 = Array.from(
                new Set(scenRegionNames2.flatMap(rn => (perRegionSource2[rn] || []).map(d => d.date?.substring(0, 10)).filter(Boolean)))
              ).sort();
              const maxPts2 = 120;
              const step2 = allDates2.length > maxPts2 ? Math.ceil(allDates2.length / maxPts2) : 1;
              const lookup2 = {};
              scenRegionNames2.forEach(rn => {
                lookup2[rn] = {};
                (perRegionSource2[rn] || []).forEach(d => { lookup2[rn][d.date?.substring(0,10)] = d.forecast || d.total || 0; });
              });
              regionChartData2 = allDates2.filter((_, i) => i % step2 === 0).map(date => {
                const row = { date };
                regionNames2.forEach(rn => { row[rn] = Number(lookup2[rn][date] || 0); });
                return row;
              });
            } else {
              const simReg = Object.keys(simRegionalData);
              if (simReg.length > 0) {
                regionNames2 = simReg;
                const firstRd = simRegionalData[regionNames2[0]];
                const maxPts2 = 120;
                const step2 = firstRd.dates.length > maxPts2 ? Math.ceil(firstRd.dates.length / maxPts2) : 1;
                regionChartData2 = firstRd.dates.filter((_, i) => i % step2 === 0).map((date, si) => {
                  const row = { date };
                  regionNames2.forEach(rn => { row[rn] = simRegionalData[rn]?.demand[si * step2] ?? 0; });
                  return row;
                });
              }
            }

            if (regionChartData2.length === 0) return null;

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconBarChart2 size={16} />
                  {isTargetMode2 ? 'Demand by Target / Delivery Point' : 'Regional Water Demand Comparison'}
                  {scenRegionNames2.length === 0 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6e7781', marginLeft: 6 }}>
                      (from simulation results)
                    </span>
                  )}
                </div>
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 10 }}>
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${regionFilter2 === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={regionFilter2 === 'all'} onChange={() => setRegionFilter2('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {(regionLegendsExpanded2 ? regionNames2 : regionNames2.slice(0, 4)).map((rn, i) => {
                    const selected = regionFilter2 === 'all' || (Array.isArray(regionFilter2) ? regionFilter2.includes(rn) : regionFilter2 === rn);
                    return (
                      <label key={rn} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': REG_COLORS2[i % REG_COLORS2.length] }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (regionFilter2 === 'all') { setRegionFilter2([rn]); }
                          else if (Array.isArray(regionFilter2)) {
                            const updated = regionFilter2.includes(rn) ? regionFilter2.filter(t => t !== rn) : [...regionFilter2, rn];
                            setRegionFilter2(updated.length > 0 ? updated : 'all');
                          } else { setRegionFilter2([rn]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{rn}
                      </label>
                    );
                  })}
                  {regionNames2.length > 4 && (
                    <button type="button" className="ns2-analytics-chip-toggle-btn" onClick={() => setRegionLegendsExpanded2(!regionLegendsExpanded2)}>
                      {regionLegendsExpanded2 ? 'Show less' : `Show ${regionNames2.length - 4} more`}
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={regionChartData2} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false}
                      tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={(val, name) => [(val/1e6).toFixed(4) + ' M m³/d', name]} />
                    {(regionLegendsExpanded2 ? regionNames2 : regionNames2.slice(0, 4)).map((rn, i) => {
                      const shouldShow = regionFilter2 === 'all' || (Array.isArray(regionFilter2) ? regionFilter2.includes(rn) : regionFilter2 === rn);
                      return shouldShow && (
                        <Line key={rn} type="monotone" dataKey={rn}
                          stroke={REG_COLORS2[i % REG_COLORS2.length]}
                          strokeWidth={2} dot={false} />
                      );
                    })}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* ═══ SECTION B — Regional Supply & Demand Analysis ══════════════════════ */}
          {(() => {
            const regions = Object.keys(simRegionalData);
            if (regions.length === 0) return null;

            const REG_COLORS_B = ['#2563eb','#16a34a','#9333ea','#ea580c','#0891b2','#db2777'];

            const SUPPLY_DEMAND_KEYS = [
              { key: 'demand',    label: 'Demand',     color: '#dc2626' },
              { key: 'delivered', label: 'Supply',     color: '#2563eb' },
              { key: 'coverage',  label: 'Coverage %', color: '#ca8a04' },
            ];

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconBarChart2 size={16} /> Regional Supply &amp; Demand Analysis
                </div>

                {/* Shared series filter chips */}
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 14 }}>
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${supplyDemandFilter === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={supplyDemandFilter === 'all'} onChange={() => setSupplyDemandFilter('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {SUPPLY_DEMAND_KEYS.map(sk => {
                    const selected = supplyDemandFilter === 'all' || (Array.isArray(supplyDemandFilter) ? supplyDemandFilter.includes(sk.key) : supplyDemandFilter === sk.key);
                    return (
                      <label key={sk.key} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': sk.color }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (supplyDemandFilter === 'all') { setSupplyDemandFilter([sk.key]); }
                          else if (Array.isArray(supplyDemandFilter)) {
                            const updated = supplyDemandFilter.includes(sk.key) ? supplyDemandFilter.filter(k => k !== sk.key) : [...supplyDemandFilter, sk.key];
                            setSupplyDemandFilter(updated.length > 0 ? updated : 'all');
                          } else { setSupplyDemandFilter([sk.key]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{sk.label}
                      </label>
                    );
                  })}
                </div>

                {regions.map((region, ri) => {
                  const rd = simRegionalData[region];
                  const color = REG_COLORS_B[ri % REG_COLORS_B.length];
                  const n = rd.dates.length;

                  const avgDemand    = n ? rd.demand.reduce((a,b) => a+b,0) / n : 0;
                  const avgDelivered = n ? rd.delivered.reduce((a,b) => a+b,0) / n : 0;
                  const totalShort   = rd.shortage.reduce((a,b) => a+b,0);
                  const avgCoverage  = n ? rd.satisfaction.reduce((a,b) => a+b,0) / n : 0;
                  const maxDemand    = n ? Math.max(...rd.demand) : 0;
                  const minDemand    = n ? Math.min(...rd.demand) : 0;

                  const chartData = rd.dates.map((date, i) => ({
                    date,
                    demand:    rd.demand[i],
                    delivered: rd.delivered[i],
                    shortage:  rd.shortage[i],
                    coverage:  rd.satisfaction[i],
                  }));

                  const fmtD = v => Math.round(v).toLocaleString() + ' m³/d';

                  return (
                    <div key={region} className={ri > 0 ? 'ns2-analytics-region-block' : ''}>
                      <div className="ns2-analytics-region-label" style={{ borderLeftColor: color }}>
                        {region}
                      </div>

                      <div className="ns2-analytics-kpi-grid" style={{ marginBottom: 12 }}>
                        <div className="ns2-analytics-kpi-card-lg">
                          <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{fmtD(avgDemand)}</div>
                          <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Demand</div>
                        </div>
                        <div className="ns2-analytics-kpi-card-lg">
                          <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#2563eb' }}>{fmtD(avgDelivered)}</div>
                          <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Supply</div>
                        </div>
                        <div className="ns2-analytics-kpi-card-lg">
                          <div className="ns2-analytics-kpi-card-lg-val" style={{ color: totalShort > 0 ? '#dc2626' : '#16a34a' }}>
                            {totalShort > 0 ? fmtD(totalShort / n) : 'None'}
                          </div>
                          <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Shortage</div>
                        </div>
                        <div className="ns2-analytics-kpi-card-lg">
                          <div className="ns2-analytics-kpi-card-lg-val"
                            style={{ color: avgCoverage >= 80 ? '#16a34a' : avgCoverage >= 50 ? '#ca8a04' : '#dc2626' }}>
                            {avgCoverage.toFixed(1)}%
                          </div>
                          <div className="ns2-analytics-kpi-card-lg-label">Avg Coverage Rate</div>
                        </div>
                      </div>

                      {/* Demand Range / Avg Gap / Total Period */}
                      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 12, fontSize: 11, color: '#6b7280' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Demand Range</div>
                          <div>{Math.round(minDemand).toLocaleString()} – {Math.round(maxDemand).toLocaleString()} m³/d</div>
                        </div>
                        <div style={{ width: 1, background: '#d1d5db' }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Avg Gap</div>
                          <div>{Math.round(avgDemand - avgDelivered).toLocaleString()} m³/d</div>
                        </div>
                        <div style={{ width: 1, background: '#d1d5db' }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Total Period</div>
                          <div>{n} days</div>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={chartData} margin={{ top: 5, right: 45, bottom: 5, left: 0 }}>
                          <defs>
                            <linearGradient id={`grad-demand-${ri}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.03} />
                            </linearGradient>
                            <linearGradient id={`grad-supply-${ri}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                          <YAxis yAxisId="vol" tick={{ fontSize: 10 }} tickLine={false}
                            tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                          <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} tickLine={false} />
                          <Tooltip
                            formatter={(val, name) => {
                              if (name === 'coverage') return [val.toFixed(1) + '%', 'Coverage'];
                              return [(val/1e6).toFixed(4) + ' M m³', name === 'demand' ? 'Demand' : 'Supply'];
                            }}
                          />
                          <ReferenceLine yAxisId="vol" y={avgDemand} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Avg Demand', fontSize: 10, fill: '#dc2626' }} />
                          <ReferenceLine yAxisId="vol" y={avgDelivered} stroke="#2563eb" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Avg Supply', fontSize: 10, fill: '#2563eb' }} />
                          {(supplyDemandFilter === 'all' || (Array.isArray(supplyDemandFilter) ? supplyDemandFilter.includes('demand') : supplyDemandFilter === 'demand')) && (
                            <Area yAxisId="vol" type="monotone" dataKey="demand" stroke="#dc2626" strokeWidth={2} fill={`url(#grad-demand-${ri})`} dot={false} />
                          )}
                          {(supplyDemandFilter === 'all' || (Array.isArray(supplyDemandFilter) ? supplyDemandFilter.includes('delivered') : supplyDemandFilter === 'delivered')) && (
                            <Area yAxisId="vol" type="monotone" dataKey="delivered" stroke="#2563eb" strokeWidth={2} fill={`url(#grad-supply-${ri})`} dot={false} />
                          )}
                          {(supplyDemandFilter === 'all' || (Array.isArray(supplyDemandFilter) ? supplyDemandFilter.includes('coverage') : supplyDemandFilter === 'coverage')) && (
                            <Line yAxisId="pct" type="monotone" dataKey="coverage" stroke="#ca8a04" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                          )}
                          <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Status banner */}
          <div className={`ns2-analytics-banner ns2-analytics-banner--${bannerVariant}`}>
            <BannerIcon size={16} />
            <span className="ns2-analytics-banner-msg">{bannerText}</span>
          </div>

          {/* KPI row */}
          <div className="ns2-analytics-kpi-row">
            <AKpiCard
              label="Demand Met"
              value={satisfaction !== null ? `${satisfaction.toFixed(1)}%` : '—'}
              sub={
                satisfaction !== null
                  ? (isYearRange
                      ? `Avg over ${dailyTrends.length || 1} year${dailyTrends.length !== 1 ? 's' : ''} · delivered ÷ demand`
                      : (totalShortage > 0 ? `Shortage: ${fmtCubic(totalShortage)}` : 'All demand supplied'))
                  : 'delivered ÷ demand × 100'
              }
              color={satisfactionColor}
            />
            <AKpiCard
              label="Plant Utilisation"
              value={plantUtil !== null ? `${Number(plantUtil).toFixed(1)}%` : '—'}
              sub={plantUtil !== null
                ? (plantAnalysis.total_plants != null
                    ? `${plantAnalysis.total_plants} active plant${plantAnalysis.total_plants !== 1 ? 's' : ''}`
                    : (isYearRange ? `Avg across ${dailyTrends.length || 1} yr${dailyTrends.length !== 1 ? 's' : ''}` : undefined))
                : (isYearRange ? 'No trend data available' : undefined)}
              color={plantUtil !== null ? plantUtilColor : '#24292f'}
            />
            <AKpiCard
              label="Bottleneck Pipes"
              value={String(bottleneckCount)}
              sub={bottleneckCount === 0 ? 'No bottlenecks found' : `Pipe${bottleneckCount !== 1 ? 's' : ''} at capacity`}
              color={bottleneckColor}
            />
            <AKpiCard
              label="Tank Storage"
              value={tankUtil !== null ? `${Number(tankUtil).toFixed(1)}%` : '—'}
              sub={tankUtil !== null
                ? (tankAnalysis.total_tanks != null
                    ? `${tankAnalysis.total_tanks} tank${tankAnalysis.total_tanks !== 1 ? 's' : ''}`
                    : (isYearRange ? `Avg fill across ${dailyTrends.length || 1} yr${dailyTrends.length !== 1 ? 's' : ''}` : undefined))
                : (isYearRange ? 'No trend data available' : undefined)}
              color={tankUtil !== null ? tankUtilColor : '#6e7781'}
            />
          </div>

          {/* Supply vs Demand card */}
          <div className="ns2-analytics-card ns2-analytics-card--full">
            <div className="ns2-analytics-card-title">Supply vs Demand</div>
            <div className="ns2-analytics-card-body">
              <AProgressBar
                label={`Delivered  (${fmtCubic(totalDelivered)} / ${fmtCubic(totalDemand)})`}
                value={totalDelivered}
                max={totalDemand || 1}
                color={satisfactionColor}
              />
              {plantAnalysis.total_capacity > 0 && plantAnalysis.total_output != null && (
                <AProgressBar
                  label={`Plant capacity used  (${fmtCubic(plantAnalysis.total_output)} / ${fmtCubic(plantAnalysis.total_capacity)})`}
                  value={plantAnalysis.total_output || 0}
                  max={plantAnalysis.total_capacity}
                  color={plantUtilColor}
                />
              )}
              {totalShortage > 0 && (
                <div className="ns2-analytics-shortage-note">
                  <IconAlertTriangle size={13} /> {fmtCubic(totalShortage)} of demand unmet ({((totalShortage / (totalDemand || 1)) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          {/* Year-over-year chart */}
          {hasYoyChart && (
            <div className="ns2-analytics-card ns2-analytics-card--full">
              <div className="ns2-analytics-card-title">
                Year-over-Year Supply vs Demand
                {isYearRange && <span style={{ fontWeight: 400, color: '#6e7781', marginLeft: 8, fontSize: '0.6875rem' }}>actual delivered per year</span>}
              </div>
              <div className="ns2-analytics-card-body">
                <div className="ns2-analytics-year-chart">
                  {yoyLabels.map((yr, i) => (
                    <div
                      key={`${yr}-${i}`}
                      className="ns2-analytics-year-row ns2-has-tooltip"
                      data-tooltip={`${yr}  ·  Delivered: ${fmtCubic(yoySupply[i])}  ·  Demand: ${fmtCubic(yoyDemand[i])}`}
                    >
                      <div className="ns2-analytics-year-lbl">{yr}</div>
                      <div className="ns2-analytics-year-bars">
                        <div className="ns2-analytics-year-bar ns2-analytics-year-bar--supply"
                          style={{ width: `${((yoySupply[i] || 0) / maxChartVal) * 100}%` }} />
                        <div className="ns2-analytics-year-bar ns2-analytics-year-bar--demand"
                          style={{ width: `${((yoyDemand[i] || 0) / maxChartVal) * 100}%` }} />
                      </div>
                      <div className="ns2-analytics-year-vals">
                        <span style={{ color: '#3b82f6' }}>{fmtCubic(yoySupply[i])}</span>
                        <span style={{ color: '#f59e0b' }}>{fmtCubic(yoyDemand[i])}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ns2-analytics-chart-legend">
                  <div className="ns2-analytics-chart-legend-item">
                    <div className="ns2-analytics-chart-legend-dot" style={{ background: '#3b82f6' }} /> {isYearRange ? 'Delivered' : 'Supply'}
                  </div>
                  <div className="ns2-analytics-chart-legend-item">
                    <div className="ns2-analytics-chart-legend-dot" style={{ background: '#f59e0b' }} /> Demand
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mass balance + Plant outputs */}
          <div className="ns2-analytics-grid">
            <div className="ns2-analytics-card">
              <div className="ns2-analytics-card-title">Mass Balance</div>
              <div className="ns2-analytics-card-body">
                <div className="ns2-analytics-stat">
                  <span className="ns2-analytics-stat-label">Status</span>
                  {massBalanceIsBalanced !== null ? (
                    <span className={`ns2-analytics-stat-val ${massBalanceIsBalanced ? 'ns2-analytics-stat-val--green' : 'ns2-analytics-stat-val--red'}`}>
                      {massBalanceIsBalanced
                        ? (massBalancePct != null ? `Balanced (${massBalancePct.toFixed(0)}% of dates)` : 'Balanced')
                        : (massBalancePct != null ? `Imbalanced (${massBalancePct.toFixed(0)}% balanced)` : 'Imbalanced')}
                    </span>
                  ) : (
                    <span className="ns2-analytics-stat-val" style={{ color: '#6e7781' }}>—</span>
                  )}
                </div>
                {massBalance.total_input != null && (
                  <div className="ns2-analytics-stat">
                    <span className="ns2-analytics-stat-label">Total input</span>
                    <span className="ns2-analytics-stat-val">{fmtCubic(massBalance.total_input)}</span>
                  </div>
                )}
                <div className="ns2-analytics-stat">
                  <span className="ns2-analytics-stat-label">Total delivered</span>
                  <span className="ns2-analytics-stat-val">{fmtCubic(totalDelivered)}</span>
                </div>
                {massBalance.storage_change != null && (
                  <div className="ns2-analytics-stat">
                    <span className="ns2-analytics-stat-label">Tank delta</span>
                    <span className={`ns2-analytics-stat-val ${massBalance.storage_change >= 0 ? 'ns2-analytics-stat-val--green' : 'ns2-analytics-stat-val--amber'}`}>
                      {massBalance.storage_change >= 0 ? '+' : ''}{fmtCubic(massBalance.storage_change)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="ns2-analytics-card">
              <div className="ns2-analytics-card-title">Plant Outputs</div>
              <div className="ns2-analytics-card-body">
                {Object.keys(plantOutputs).length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#6e7781' }}>No plant data available</div>
                ) : (
                  Object.entries(plantOutputs).map(([id, val]) => (
                    <div key={id} className="ns2-analytics-stat ns2-has-tooltip" data-tooltip={`ID: ${id}  ·  Output: ${fmtCubic(val)}`}>
                      <span className="ns2-analytics-stat-label">{getName(id)}</span>
                      <span className="ns2-analytics-stat-val">{fmtCubic(val)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Tank storage + Bottlenecks or Edge key */}
          <div className="ns2-analytics-grid">
            <div className="ns2-analytics-card">
              <div className="ns2-analytics-card-title">Tank Storage</div>
              <div className="ns2-analytics-card-body">
                {Object.keys(tankStorage).length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#6e7781' }}>No tank data available</div>
                ) : (
                  Object.entries(tankStorage).map(([id, pct]) => (
                    <AProgressBar
                      key={id}
                      label={getName(id) !== id ? getName(id) : (tankNames[id] || id)}
                      value={pct || 0}
                      max={100}
                      color={(pct || 0) < 20 ? '#a40e26' : (pct || 0) < 50 ? '#9a6700' : '#10b981'}
                    />
                  ))
                )}
              </div>
            </div>
            <div className="ns2-analytics-card">
              {bottleneckCount > 0 ? (
                <>
                  <div className="ns2-analytics-card-title">Bottleneck Pipes</div>
                  <div className="ns2-analytics-card-body">
                    {sortedBottlenecks.map(([id, b]) => {
                      const util = b?.utilization ?? 0;
                      const pctColor = util >= 90 ? '#a40e26' : util >= 70 ? '#9a6700' : '#57606a';
                      const bgColor  = util >= 90 ? '#ffebe9' : util >= 70 ? '#fff8c5' : '#f6f8fa';
                      return (
                        <div key={id} className="ns2-analytics-btl-row">
                          <span className="ns2-analytics-btl-name" title={b?.name || id}>{b?.name || id}</span>
                          <span className="ns2-analytics-btl-pct" style={{ color: pctColor, background: bgColor }}>
                            {util.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="ns2-analytics-card-title">Edge Colour Key</div>
                  <div className="ns2-analytics-card-body">
                    {EDGE_COLOUR_ROWS.map(({ color, label }) => (
                      <div key={label} className="ns2-analytics-edge-row">
                        <div className="ns2-analytics-edge-dot" style={{ background: color }} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Shortage Points */}
          {shortageCount > 0 && (
            <div className="ns2-analytics-card ns2-analytics-card--full">
              <div className="ns2-analytics-card-title">Shortage Points ({shortageCount})</div>
              <div className="ns2-analytics-card-body">
                {sortedShortages.map(([id, amt]) => (
                  <div key={id} className="ns2-analytics-stat ns2-has-tooltip" data-tooltip={`ID: ${id}  ·  Shortage: ${fmtCubic(amt)}`}>
                    <span className="ns2-analytics-stat-label">{getName(id)}</span>
                    <span className="ns2-analytics-stat-val ns2-analytics-stat-val--red">{fmtCubic(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edge colour key shown inline when bottlenecks occupied the right col */}
          {bottleneckCount > 0 && (
            <div className="ns2-analytics-card ns2-analytics-card--full">
              <div className="ns2-analytics-card-title">Edge Colour Key</div>
              <div className="ns2-analytics-card-body" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '14px 24px' }}>
                {EDGE_COLOUR_ROWS.map(({ color, label }) => (
                  <div key={label} className="ns2-analytics-edge-row">
                    <div className="ns2-analytics-edge-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ SECTION 1 — Supply vs Demand Time Series ══════════════════ */}
          {(() => {
            // Prefer simChartData (uses scenario demand when available), fall back to inline derivation
            const sdDataRaw = simChartData.length >= 2
              ? simChartData
              : (() => {
                  const ds = r.daily_series || {};
                  const dates = ds.dates || [];
                  if (dates.length < 2) return [];
                  return dates.map((date, i) => {
                    const supply = Object.values(ds.delivered || {}).reduce((a, vals) => a + (vals[i] || 0), 0);
                    const shortage = Object.values(ds.shortages || {}).reduce((a, vals) => a + (vals[i] || 0), 0);
                    return { date: date.substring(0, 10), supply, demand: supply + shortage, shortage };
                  });
                })();

            if (sdDataRaw.length < 2) return null;

            const sdData = ns2SampleSeries(sdDataRaw);

            const totalSup = sdDataRaw.reduce((a, d) => a + (d.supply || d.delivered || 0), 0);
            const totalDem = sdDataRaw.reduce((a, d) => a + d.demand, 0);
            const coverage = totalDem > 0 ? ((totalSup / totalDem) * 100).toFixed(1) : '—';
            const peakDemand = Math.max(...sdDataRaw.map(d => d.demand));
            const avgSupply = totalSup / sdDataRaw.length;
            const avgDemand = totalDem / sdDataRaw.length;
            const minDemand1 = Math.min(...sdDataRaw.map(d => d.demand));
            const maxDemand1 = Math.max(...sdDataRaw.map(d => d.demand));
            // Normalise key name: simChartData uses 'supply', old derivation used 'delivered'
            const supplyKey = sdData[0]?.supply !== undefined ? 'supply' : 'delivered';
            const fmtD1 = v => Math.round(v).toLocaleString() + ' m³/d';

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconTrendingUp size={16} /> Supply vs Demand Analysis
                </div>
                <div className="ns2-analytics-kpi-grid">
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#2563eb' }}>{fmtD1(avgSupply)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Supply</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{fmtD1(avgDemand)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Demand</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val"
                      style={{ color: Number(coverage) >= 80 ? '#16a34a' : Number(coverage) >= 50 ? '#ca8a04' : '#dc2626' }}>
                      {coverage}%
                    </div>
                    <div className="ns2-analytics-kpi-card-lg-label">Coverage Rate</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{fmtD1(peakDemand)}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Peak Daily Demand</div>
                  </div>
                </div>
                {/* Demand Range / Avg Gap / Total Period */}
                <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 12, fontSize: 11, color: '#6b7280' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Demand Range</div>
                    <div>{Math.round(minDemand1).toLocaleString()} – {Math.round(maxDemand1).toLocaleString()} m³/d</div>
                  </div>
                  <div style={{ width: 1, background: '#d1d5db' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Avg Gap</div>
                    <div>{Math.round(avgDemand - avgSupply).toLocaleString()} m³/d</div>
                  </div>
                  <div style={{ width: 1, background: '#d1d5db' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>Total Period</div>
                    <div>{sdData.length} days analyzed</div>
                  </div>
                </div>
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 10 }}>
                  {[{ key: 'demand', label: 'Demand', color: '#dc2626' }, { key: supplyKey, label: 'Supply', color: '#2563eb' }].map(sk => {
                    const selected = sdSeriesFilter === 'all' || (Array.isArray(sdSeriesFilter) ? sdSeriesFilter.includes(sk.key) : sdSeriesFilter === sk.key);
                    return (
                      <label key={sk.key} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': sk.color }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (sdSeriesFilter === 'all') { setSdSeriesFilter([sk.key]); }
                          else if (Array.isArray(sdSeriesFilter)) {
                            const updated = sdSeriesFilter.includes(sk.key) ? sdSeriesFilter.filter(k => k !== sk.key) : [...sdSeriesFilter, sk.key];
                            setSdSeriesFilter(updated.length > 0 ? updated : 'all');
                          } else { setSdSeriesFilter([sk.key]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{sk.label}
                      </label>
                    );
                  })}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={sdData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <defs>
                      <linearGradient id="grad-sd-demand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="grad-sd-supply" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false}
                      tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip
                      formatter={(val, name) => {
                        const label = name === supplyKey ? 'Supply' : name === 'demand' ? 'Demand' : name;
                        return [(val / 1e6).toFixed(4) + ' M m³', label];
                      }}
                      labelStyle={{ fontWeight: 600 }} />
                    <ReferenceLine y={avgDemand} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.5}
                      label={{ value: 'Avg Demand', fontSize: 10, fill: '#dc2626' }} />
                    <ReferenceLine y={avgSupply} stroke="#2563eb" strokeDasharray="4 4" strokeOpacity={0.5}
                      label={{ value: 'Avg Supply', fontSize: 10, fill: '#2563eb' }} />
                    {(sdSeriesFilter === 'all' || (Array.isArray(sdSeriesFilter) ? sdSeriesFilter.includes('demand') : sdSeriesFilter === 'demand')) && (
                      <Area type="monotone" dataKey="demand" stroke="#dc2626" strokeWidth={2}
                        fill="url(#grad-sd-demand)" dot={false} />
                    )}
                    {(sdSeriesFilter === 'all' || (Array.isArray(sdSeriesFilter) ? sdSeriesFilter.includes(supplyKey) : sdSeriesFilter === supplyKey)) && (
                      <Area type="monotone" dataKey={supplyKey} stroke="#2563eb" strokeWidth={2}
                        fill="url(#grad-sd-supply)" dot={false} />
                    )}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* ═══ SECTION 2 — Plant Supply Analysis ════════════════════════ */}
          {(() => {
            const ds = r.daily_series || {};
            const dates = ds.dates || [];
            const plants = canvasEntities.filter(e => e.type === 'plant');
            if (plants.length === 0 || dates.length < 2) return null;

            const PLANT_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#b45309'];

            const plantOutputsSeries = ds.plant_outputs || {};
            const plantChartData = dates.map((date, i) => {
              const row = { date: date.substring(0, 10) };
              plants.forEach(p => { row[p.id] = plantOutputsSeries[p.id]?.[i] ?? 0; });
              return row;
            });

            const totalCap = plants.reduce((a, p) => a + (Number(p.capacity) || 0), 0);
            const plantAvgOutputs = plants.map(p => {
              const series = plantOutputsSeries[p.id] || [];
              return {
                ...p,
                avgOutput: series.length ? series.reduce((a, v) => a + v, 0) / series.length : 0,
              };
            });
            const totalAvgOutput = plantAvgOutputs.reduce((a, p) => a + p.avgOutput, 0);
            const avgUtil = totalCap > 0 ? (totalAvgOutput / totalCap * 100).toFixed(1) : '—';

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconActivity size={16} /> Plant Supply Analysis
                </div>
                <div className="ns2-analytics-kpi-grid">
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{(totalCap / 1000).toFixed(1)} k m³/d</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Total Capacity</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{(totalAvgOutput / 1000).toFixed(1)} k m³/d</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg Daily Output</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: Number(avgUtil) >= 90 ? '#dc2626' : Number(avgUtil) >= 70 ? '#ca8a04' : '#16a34a' }}>{avgUtil}%</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg Utilization</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{plants.length}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Active Plants</div>
                  </div>
                </div>
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 10 }}>
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${plantFilter === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={plantFilter === 'all'} onChange={() => setPlantFilter('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {(plantLegendsExpanded ? plants : plants.slice(0, 4)).map((p, i) => {
                    const selected = plantFilter === 'all' || (Array.isArray(plantFilter) ? plantFilter.includes(p.id) : plantFilter === p.id);
                    return (
                      <label key={p.id} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': PLANT_COLORS[i % PLANT_COLORS.length] }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (plantFilter === 'all') { setPlantFilter([p.id]); }
                          else if (Array.isArray(plantFilter)) {
                            const updated = plantFilter.includes(p.id) ? plantFilter.filter(k => k !== p.id) : [...plantFilter, p.id];
                            setPlantFilter(updated.length > 0 ? updated : 'all');
                          } else { setPlantFilter([p.id]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{getName(p.id)}
                      </label>
                    );
                  })}
                  {plants.length > 4 && (
                    <button type="button" className="ns2-analytics-chip-toggle-btn" onClick={() => setPlantLegendsExpanded(!plantLegendsExpanded)}>
                      {plantLegendsExpanded ? 'Show less' : `Show ${plants.length - 4} more`}
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={plantChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={(val, name) => [(val / 1000).toFixed(2) + ' k m³', getName(name)]} />
                    {(plantLegendsExpanded ? plants : plants.slice(0, 4)).map((p, i) => {
                      const shouldShow = plantFilter === 'all' || (Array.isArray(plantFilter) ? plantFilter.includes(p.id) : plantFilter === p.id);
                      return shouldShow && (
                        <Line key={p.id} type="monotone" dataKey={p.id} stroke={PLANT_COLORS[i % PLANT_COLORS.length]} strokeWidth={2} dot={false} />
                      );
                    })}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="ns2-analytics-stat-cards">
                  {plantAvgOutputs.map((p, i) => {
                    const util = p.capacity > 0 ? (p.avgOutput / p.capacity * 100).toFixed(1) : '—';
                    const utilNum = Number(util);
                    return (
                      <div key={p.id} className="ns2-analytics-stat-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: PLANT_COLORS[i % PLANT_COLORS.length], flexShrink: 0 }} />
                          <strong style={{ fontSize: '0.875rem' }}>{getName(p.id)}</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.8125rem', color: '#57606a' }}>
                          <span>Capacity</span><span style={{ color: '#24292f', fontWeight: 600 }}>{(p.capacity / 1000).toFixed(1)} k m³/d</span>
                          <span>Avg Output</span><span style={{ color: '#24292f', fontWeight: 600 }}>{(p.avgOutput / 1000).toFixed(2)} k m³/d</span>
                          <span>Utilization</span>
                          <span style={{ color: utilNum >= 90 ? '#dc2626' : utilNum >= 70 ? '#ca8a04' : '#16a34a', fontWeight: 600 }}>{util}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ═══ SECTION 3 — Tank Storage Analysis ════════════════════════ */}
          {(() => {
            const ds = r.daily_series || {};
            const dates = ds.dates || [];
            const tanks = canvasEntities.filter(e => e.type === 'tank');
            if (tanks.length === 0 || dates.length < 2) return null;

            const TANK_COLORS = ['#0891b2', '#9333ea', '#16a34a', '#ea580c', '#2563eb', '#db2777', '#65a30d', '#b45309'];

            const tankStorageSeries = ds.tank_storage || {};
            const tankChartData = dates.map((date, i) => {
              const row = { date: date.substring(0, 10) };
              tanks.forEach(t => {
                const raw = tankStorageSeries[t.id]?.[i] ?? 0;
                const cap = Number(t.capacity) || 1;
                row[t.id] = raw > 1 ? Math.min(raw / cap * 100, 100) : raw * 100;
              });
              return row;
            });

            const totalTankCap = tanks.reduce((a, t) => a + (Number(t.capacity) || 0), 0);
            const tankAvgPct = tanks.map(t => {
              const series = tankStorageSeries[t.id] || [];
              const cap = Number(t.capacity) || 1;
              const avg = series.length
                ? series.reduce((a, raw) => a + (raw > 1 ? Math.min(raw / cap * 100, 100) : raw * 100), 0) / series.length
                : 0;
              return { ...t, avgPct: avg };
            });
            const sysAvg = tankAvgPct.length ? tankAvgPct.reduce((a, t) => a + t.avgPct, 0) / tankAvgPct.length : 0;

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title">
                  <IconDatabase size={16} /> Tank Storage Analysis
                </div>
                <div className="ns2-analytics-kpi-grid">
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{(totalTankCap / 1000).toFixed(1)} k m³</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Total Capacity</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{sysAvg.toFixed(1)}%</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Avg System Storage</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: sysAvg < 20 ? '#dc2626' : sysAvg < 50 ? '#ca8a04' : '#16a34a' }}>
                      {sysAvg < 20 ? 'Low' : sysAvg < 50 ? 'Moderate' : 'Good'}
                    </div>
                    <div className="ns2-analytics-kpi-card-lg-label">Storage Level</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{tanks.length}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Active Tanks</div>
                  </div>
                </div>
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 10 }}>
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${tankFilter === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={tankFilter === 'all'} onChange={() => setTankFilter('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {(tankLegendsExpanded ? tanks : tanks.slice(0, 4)).map((t, i) => {
                    const selected = tankFilter === 'all' || (Array.isArray(tankFilter) ? tankFilter.includes(t.id) : tankFilter === t.id);
                    return (
                      <label key={t.id} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': TANK_COLORS[i % TANK_COLORS.length] }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (tankFilter === 'all') { setTankFilter([t.id]); }
                          else if (Array.isArray(tankFilter)) {
                            const updated = tankFilter.includes(t.id) ? tankFilter.filter(k => k !== t.id) : [...tankFilter, t.id];
                            setTankFilter(updated.length > 0 ? updated : 'all');
                          } else { setTankFilter([t.id]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{getName(t.id)}
                      </label>
                    );
                  })}
                  {tanks.length > 4 && (
                    <button type="button" className="ns2-analytics-chip-toggle-btn" onClick={() => setTankLegendsExpanded(!tankLegendsExpanded)}>
                      {tankLegendsExpanded ? 'Show less' : `Show ${tanks.length - 4} more`}
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={tankChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(val, name) => [val.toFixed(1) + '%', getName(name)]} />
                    {(tankLegendsExpanded ? tanks : tanks.slice(0, 4)).map((t, i) => {
                      const shouldShow = tankFilter === 'all' || (Array.isArray(tankFilter) ? tankFilter.includes(t.id) : tankFilter === t.id);
                      return shouldShow && (
                        <Line key={t.id} type="monotone" dataKey={t.id} stroke={TANK_COLORS[i % TANK_COLORS.length]} strokeWidth={2} dot={false} />
                      );
                    })}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="ns2-analytics-stat-cards">
                  {tankAvgPct.map((t, i) => (
                    <div key={t.id} className="ns2-analytics-stat-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: TANK_COLORS[i % TANK_COLORS.length], flexShrink: 0 }} />
                        <strong style={{ fontSize: '0.875rem' }}>{getName(t.id)}</strong>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.8125rem', color: '#57606a' }}>
                        <span>Capacity</span><span style={{ color: '#24292f', fontWeight: 600 }}>{(t.capacity / 1000).toFixed(1)} k m³</span>
                        <span>Avg Storage</span>
                        <span style={{ color: t.avgPct < 20 ? '#dc2626' : t.avgPct < 50 ? '#ca8a04' : '#16a34a', fontWeight: 600 }}>{t.avgPct.toFixed(1)}%</span>
                      </div>
                      <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(t.avgPct, 100)}%`, background: t.avgPct < 20 ? '#dc2626' : t.avgPct < 50 ? '#ca8a04' : '#16a34a', borderRadius: 3, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ═══ SECTION 3.5 — Delivery Point Shortages & Reasons ═════════ */}
          {(() => {
            const reasons = r.shortage_reasons || {};
            const zeroDemand = r.zero_demand_points || [];
            const zeroMissing = r.zero_demand_missing || [];
            const zeroAssigned = r.zero_demand_assigned || [];
            const ds = r.daily_series || {};
            const dsDates = ds.dates || [];
            const isSeries = dsDates.length > 0;

            const rows = [];
            if (isSeries) {
              const delS = ds.delivered || {};
              const shS = ds.shortages || {};
              const pids = new Set([...Object.keys(delS), ...Object.keys(shS)]);
              const N = dsDates.length;
              pids.forEach(pid => {
                const dv = delS[pid] || [];
                const sv = shS[pid] || [];
                const n = Math.max(dv.length, sv.length, 1);
                const totDel = dv.reduce((a, b) => a + (b || 0), 0);
                const totSh = sv.reduce((a, b) => a + (b || 0), 0);
                if (totSh <= 0.001) return;
                const demand = totDel + totSh;
                // WHEN does the shortage happen?
                let daysShort = 0, peakIdx = -1, peakVal = 0, firstIdx = -1, lastIdx = -1;
                const yearAgg = {};
                for (let i = 0; i < N; i++) {
                  const s = sv[i] || 0, d = dv[i] || 0;
                  const y = (dsDates[i] || '').substring(0, 4);
                  if (!yearAgg[y]) yearAgg[y] = { del: 0, dem: 0 };
                  yearAgg[y].del += d; yearAgg[y].dem += d + s;
                  if (s > 0.001) { daysShort++; if (firstIdx < 0) firstIdx = i; lastIdx = i; if (s > peakVal) { peakVal = s; peakIdx = i; } }
                }
                const perYear = Object.entries(yearAgg)
                  .map(([y, a]) => ({ y, cov: a.dem > 0 ? (a.del / a.dem) * 100 : 100 }))
                  .sort((a, b) => a.y.localeCompare(b.y));
                rows.push({
                  pid, name: getName(pid), demand: demand / n, delivered: totDel / n, shortage: totSh / n,
                  coverage: demand > 0 ? (totDel / demand) * 100 : 100, reason: reasons[pid],
                  daysShort, totalDays: N, pctDays: N > 0 ? (daysShort / N) * 100 : 0,
                  peakVal, peakDate: peakIdx >= 0 ? (dsDates[peakIdx] || '').substring(0, 10) : null,
                  firstDate: firstIdx >= 0 ? (dsDates[firstIdx] || '').substring(0, 10) : null,
                  lastDate: lastIdx >= 0 ? (dsDates[lastIdx] || '').substring(0, 10) : null,
                  perYear,
                });
              });
            } else {
              Object.entries(r.shortages || {}).forEach(([pid, info]) => {
                const sh = typeof info === 'object' ? (info.shortage_amount || 0) : (info || 0);
                if (sh <= 0.001) return;
                const demand = typeof info === 'object' ? (info.demand || 0) : 0;
                const del = typeof info === 'object' ? (info.delivered || 0) : 0;
                rows.push({ pid, name: getName(pid), demand, delivered: del, shortage: sh, coverage: demand > 0 ? (del / demand) * 100 : 100, reason: reasons[pid] });
              });
            }
            rows.sort((a, b) => b.shortage - a.shortage);
            if (rows.length === 0 && zeroDemand.length === 0) return null;

            const REASON_META = {
              isolated: { label: 'No supply path', color: '#6b7280', bg: '#f3f4f6', icon: IconAlertTriangle },
              insufficient_capacity: { label: 'Insufficient supply capacity', color: '#dc2626', bg: '#fef2f2', icon: IconPlant },
              transmission_bottleneck: { label: 'Transmission constrained', color: '#7c3aed', bg: '#f5f3ff', icon: IconGitBranch },
            };
            const counts = rows.reduce((acc, r2) => { const k = r2.reason?.reason || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
            const fmtK = v => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString());

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title" style={{ color: '#dc2626' }}>
                  <IconActivity size={16} /> Delivery Point Shortages &amp; Reasons
                </div>

                {/* reason summary chips */}
                {rows.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {Object.entries(counts).map(([k, n]) => {
                      const m = REASON_META[k] || { label: k, color: '#6b7280', bg: '#f3f4f6', icon: IconCircle };
                      const ReasonIcon = m.icon;
                      return (
                        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: m.color, background: m.bg, border: `1px solid ${m.color}33`, borderRadius: 16, padding: '3px 10px' }}>
                          <ReasonIcon size={12} /> {n} {m.label}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* shortage table */}
                {rows.length > 0 && (
                  <div style={{ overflowX: 'auto', marginBottom: 18 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '6px 8px' }}>Delivery Point</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Demand</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Delivered</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Shortage</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Coverage</th>
                          <th style={{ padding: '6px 8px' }}>When</th>
                          <th style={{ padding: '6px 8px' }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => {
                          const m = REASON_META[row.reason?.reason] || { label: row.reason?.label || 'Shortage', color: '#6b7280', bg: '#f3f4f6', icon: IconCircle };
                          const ReasonIcon = m.icon;
                          const cov = row.coverage;
                          const covColor = cov >= 80 ? '#16a34a' : cov >= 50 ? '#d97706' : '#dc2626';
                          let detail = '';
                          if (row.reason?.reason === 'transmission_bottleneck') {
                            detail = `${fmtK(row.reason.reachable_spare)} m³/d of supply stranded` + (row.reason.limiting_line ? ` · pipe at capacity: ${row.reason.limiting_line}` : '');
                          } else if (row.reason?.reason === 'insufficient_capacity') {
                            detail = 'All reachable plants are at full capacity';
                          } else if (row.reason?.reason === 'isolated') {
                            detail = 'No active plant can reach this point';
                          }
                          const whenText = row.daysShort != null
                            ? `${row.daysShort.toLocaleString()} / ${row.totalDays.toLocaleString()} days`
                            : '—';
                          return (
                            <React.Fragment key={row.pid}>
                            <tr style={{ borderBottom: row.perYear && row.perYear.length > 1 ? 'none' : '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#111827' }}>{row.name}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtK(row.demand)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#16a34a' }}>{fmtK(row.delivered)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmtK(row.shortage)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: covColor }}>{cov.toFixed(0)}%</td>
                              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 600, color: '#374151' }}>{whenText}</div>
                                {row.daysShort != null && row.totalDays > 0 && (
                                  <div style={{ fontSize: 10, color: '#6b7280' }}>
                                    {row.pctDays.toFixed(0)}% of period{row.peakDate ? ` · peak ${fmtK(row.peakVal)} on ${row.peakDate}` : ''}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}33`, borderRadius: 12, padding: '2px 8px', whiteSpace: 'nowrap' }}><ReasonIcon size={11} /> {m.label}</span>
                                {detail && <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 3 }}>{detail}</div>}
                              </td>
                            </tr>
                            {row.perYear && row.perYear.length > 1 && (
                              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td colSpan={7} style={{ padding: '0 8px 8px' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, color: '#9ca3af' }}>By year:</span>
                                    {row.perYear.map(py => {
                                      const c = py.cov >= 80 ? '#16a34a' : py.cov >= 50 ? '#d97706' : '#dc2626';
                                      const bg = py.cov >= 80 ? '#f0fdf4' : py.cov >= 50 ? '#fffbeb' : '#fef2f2';
                                      return (
                                        <span key={py.y} style={{ fontSize: 10, fontWeight: 600, color: c, background: bg, border: `1px solid ${c}33`, borderRadius: 10, padding: '1px 7px' }}>
                                          {py.y}: {py.cov.toFixed(0)}%
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 6 }}>
                      Demand / Delivered / Shortage are average m³/day over the analysed period. "When" shows how many days each point was short and its worst day; the by-year chips show coverage % each year (red &lt;50, amber &lt;80, green ≥80).
                    </div>
                  </div>
                )}

                {/* zero-demand points — split into "missing from scenario" vs "assigned 0" */}
                {(zeroMissing.length > 0 || zeroAssigned.length > 0 || zeroDemand.length > 0) && (() => {
                  // Fallback for older results that only have the combined list.
                  const missing = zeroMissing.length || zeroAssigned.length ? zeroMissing : zeroDemand;
                  const assigned = zeroAssigned;
                  const chip = (z, color, bg) => (
                    <span key={z.id} style={{ fontSize: 11, color, background: bg, borderRadius: 12, padding: '2px 9px' }}>{z.name}</span>
                  );
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {missing.length > 0 && (
                        <div style={{ padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', marginBottom: 4 }}>
                            <IconAlertTriangle size={13} /> {missing.length} delivery point{missing.length > 1 ? 's' : ''} missing from the demand scenario
                          </div>
                          <div style={{ fontSize: 11.5, color: '#9a3412', marginBottom: 8 }}>
                            These points are not in the scenario at all (no matching demand target), so they got 0 m³/day. Add them to the scenario if they should be served.
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {missing.map(z => chip(z, '#7c2d12', '#ffedd5'))}
                          </div>
                        </div>
                      )}
                      {assigned.length > 0 && (
                        <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                            ℹ️ {assigned.length} delivery point{assigned.length > 1 ? 's' : ''} in the scenario but assigned 0 demand
                          </div>
                          <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 8 }}>
                            These points are matched to a demand target, but its forecast value is 0 (e.g. relay/storage nodes or zero-forecast gates) — so this is expected unless you intended them to have demand.
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {assigned.map(z => chip(z, '#334155', '#e2e8f0'))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ═══ SECTION 4 — Infrastructure at Capacity (pipes & plants) ═══ */}
          {(() => {
            const bnEntries = Object.entries(r.bottlenecks || {});
            if (bnEntries.length === 0) return null;

            // Multi-strategy name resolver for bottleneck IDs.
            // Backend may return plant_<uuid>, <uuid>, or line IDs that need
            // to be resolved to human-readable names.
            const getBnName = (id, info) => {
              // 1. Backend may supply name directly in the info object
              if (typeof info === 'object' && info?.name) return info.name;
              // 2. Direct nodeNameMap lookup
              if (nodeNameMap[id] && nodeNameMap[id] !== id) return nodeNameMap[id];
              // 3. Strip common prefixes (plant_, line_, node_)
              const stripped = id.replace(/^(plant_|line_|node_|pipe_)/, '');
              if (nodeNameMap[stripped] && nodeNameMap[stripped] !== stripped) return nodeNameMap[stripped];
              // 4. Search canvasEntities by id (handles plant_ prefix mismatch)
              const entity = canvasEntities.find(e =>
                e.id === id || e.id === stripped ||
                id.startsWith(e.id) || e.id.startsWith(stripped.substring(0, 8))
              );
              if (entity) {
                return entity.name || entity.PlantDescriptionEN || entity.TankName || entity.label || null;
              }
              // 5. Partial nodeNameMap scan (id contains key or key contains id)
              const partial = Object.entries(nodeNameMap).find(([k, v]) =>
                k !== v && (k.includes(stripped.substring(0, 12)) || stripped.includes(k.substring(0, 12)))
              );
              if (partial) return partial[1];
              // 6. Truncated id fallback
              return id.length > 16 ? id.substring(0, 14) + '…' : id;
            };

            // Build enriched list with entity info
            const aggregated = {};
            bnEntries.forEach(([id, info]) => {
              const utilization = Number(typeof info === 'object' ? (info.utilization || info.util_pct || 0) : info);
              const shortage   = Number(typeof info === 'object' ? (info.shortage || 0) : 0);
              const name       = getBnName(id, info);
              const key        = name;
              if (!aggregated[key]) {
                aggregated[key] = { id, info, name, utilization, shortage, allIds: [id] };
              } else {
                if (utilization > aggregated[key].utilization) {
                  aggregated[key].utilization = utilization;
                  aggregated[key].id = id;
                  aggregated[key].info = info;
                }
                aggregated[key].shortage += shortage;
                aggregated[key].allIds.push(id);
              }
            });

            const list = Object.values(aggregated).sort((a, b) => b.utilization - a.utilization);
            const criticalCount = list.filter(b => b.utilization >= 95).length;
            const highCount     = list.filter(b => b.utilization >= 85 && b.utilization < 95).length;
            const avgUtil       = list.length ? list.reduce((a, b) => a + b.utilization, 0) / list.length : 0;

            // Chart data for horizontal bars
            const bnChartData = list.map(b => ({ name: b.name, utilization: b.utilization }));
            const plantBn = list.filter(b => (typeof b.info === 'object' && b.info?.type === 'plant')).length;
            const pointBn = list.filter(b => (typeof b.info === 'object' && b.info?.type === 'delivery_point')).length;
            const lineBn = list.length - plantBn - pointBn;

            return (
              <div className="ns2-analytics-chart-section">
                <div className="ns2-analytics-chart-section-title" style={{ color: '#991b1b' }}>
                  <IconBarChart2 size={16} /> Bottlenecks (pipes &amp; plants)
                </div>

                {/* Explanation + view-on-canvas */}
                <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', borderRadius: 10, marginBottom: 16, border: '2px solid #fecaca' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>What these are</div>
                  <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.6 }}>
                    <IconGitBranch size={12} /> <b>Line bottleneck ({lineBn})</b> — a pipe running at capacity that is limiting how much water can reach the points downstream of it.<br />
                    <IconPlant size={12} /> <b>Plant bottleneck ({plantBn})</b> — a plant that cannot meet the total demand in the area it serves (more demand connects to it than it can produce).
                    {pointBn > 0 && <><br /><IconTarget size={12} /> <b>Delivery-point bottleneck ({pointBn})</b> — a delivery point whose total reachable supply is below its demand.</>}
                  </div>
                  {onViewBottlenecks && (
                    <button
                      onClick={onViewBottlenecks}
                      style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <IconMap size={12} /> Show these on the network
                    </button>
                  )}
                </div>

                {/* Summary stats — at top so they're visible immediately */}
                <div style={{ marginBottom: 16, padding: 16, background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Total Bottlenecks</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{list.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Critical (≥95%)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{criticalCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>High (≥85%)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#f97316' }}>{highCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Avg Utilization</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#374151' }}>{avgUtil.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Bottleneck cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginBottom: 20 }}>
                  {list.map(({ id, name, utilization, shortage, allIds, info }) => {
                    const severity = utilization >= 95 ? 'critical' : utilization >= 85 ? 'high' : utilization >= 75 ? 'medium' : 'low';
                    const sc = {
                      critical: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b', badge: '#dc2626' },
                      high:     { bg: '#fff7ed', border: '#f97316', text: '#9a3412', badge: '#f97316' },
                      medium:   { bg: '#fefce8', border: '#eab308', text: '#854d0e', badge: '#eab308' },
                      low:      { bg: '#f0fdf4', border: '#22c55e', text: '#166534', badge: '#22c55e' },
                    }[severity];
                    const isPlant = typeof info === 'object' && info?.type === 'plant';
                    const SeverityIcon = severity === 'critical' ? IconX : severity === 'low' ? IconCheckSquare : IconAlertTriangle;
                    const EntityIcon = isPlant ? IconPlant : IconGitBranch;
                    return (
                      <div key={id} style={{ padding: 14, background: sc.bg, borderRadius: 10, border: `2px solid ${sc.border}` }}>
                        {/* Badge */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: sc.badge, color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                          <SeverityIcon size={11} /> {severity}
                        </div>
                        {/* Name */}
                        <div style={{ fontSize: 14, fontWeight: 700, color: sc.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <EntityIcon size={14} />
                          <span>{name}</span>
                          {allIds.length > 1 && <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 10 }}>{allIds.length} instances</span>}
                        </div>
                        {/* Utilization bar */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: sc.text, marginBottom: 4 }}>
                            <span>Utilization</span><span>{utilization.toFixed(1)}%</span>
                          </div>
                          <div style={{ width: '100%', height: 10, background: 'rgba(0,0,0,0.1)', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(utilization, 100)}%`, height: '100%', background: `linear-gradient(90deg, ${sc.badge}, ${sc.border})`, borderRadius: 5 }} />
                          </div>
                          {shortage > 0 && (
                            <div style={{ fontSize: 10, color: '#dc2626', marginTop: 4, fontWeight: 500 }}>
                              <IconAlertTriangle size={11} /> Shortage: {Math.round(shortage / 1000).toLocaleString()}K m³/d
                            </div>
                          )}
                        </div>
                        {/* Status row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, paddingTop: 10, borderTop: `1px solid ${sc.border}40` }}>
                          <div>
                            <div style={{ color: '#9ca3af', marginBottom: 2 }}>Capacity</div>
                            <div style={{ fontWeight: 600, color: sc.text }}>
                              {typeof info === 'object' && info?.capacity
                                ? `${Math.round(info.capacity / 1000).toLocaleString()}K m³/d`
                                : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#9ca3af', marginBottom: 2 }}>Status</div>
                            <div style={{ fontWeight: 600, color: sc.text }}>
                              {severity === 'critical' ? 'At Capacity' : severity === 'high' ? 'Near Limit' : severity === 'medium' ? 'Moderate' : 'Normal'}
                            </div>
                          </div>
                        </div>
                        {/* Critical recommendation */}
                        {severity === 'critical' && (
                          <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(220,38,38,0.08)', borderRadius: 7, fontSize: 11, color: '#991b1b' }}>
                            💡 <strong>Recommendation:</strong> {isPlant ? 'Consider increasing plant capacity or adding backup facilities.' : 'Consider increasing pipeline capacity or adding alternative routes.'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Horizontal utilization chart */}
                <div className="ns2-analytics-subsection-title" style={{ marginBottom: 10 }}>Utilization Overview</div>
                <ResponsiveContainer width="100%" height={Math.max(200, list.length * 36 + 60)}>
                  <BarChart data={bnChartData} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} width={140} />
                    <Tooltip formatter={v => [v.toFixed(1) + '%', 'Utilization']} />
                    <Bar dataKey="utilization" radius={[0, 4, 4, 0]}
                      background={{ fill: '#f3f4f6', radius: [0, 4, 4, 0] }}
                      label={{ position: 'right', fontSize: 11, formatter: v => v.toFixed(1) + '%' }}>
                      {bnChartData.map((entry, i) => {
                        const fill = entry.utilization >= 95 ? '#dc2626' : entry.utilization >= 85 ? '#f97316' : entry.utilization >= 75 ? '#eab308' : '#22c55e';
                        return <Cell key={i} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* ═══ SECTION 5 — Shortage Analysis ════════════════════════════ */}
          {(() => {
            const ds = r.daily_series || {};
            const dates = ds.dates || [];
            if (dates.length < 2) return null;
            // ↓ inline margin override — sits directly after bottleneck stats so no extra gap needed
            const sectionStyle = { marginTop: 8 };

            // Collect per-point shortages from column-oriented series
            const shortagesSeries = ds.shortages || {};
            const affectedPoints = Object.keys(shortagesSeries).filter(pid =>
              shortagesSeries[pid].some(v => v > 0)
            );
            if (affectedPoints.length === 0) return null;

            const affectedDays = dates.filter((_, i) =>
              affectedPoints.some(pid => (shortagesSeries[pid]?.[i] || 0) > 0)
            ).length;

            const totalShortageAmt = affectedPoints.reduce((a, pid) =>
              a + shortagesSeries[pid].reduce((x, v) => x + v, 0), 0);

            const SHORTAGE_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#9333ea', '#db2777', '#b45309'];

            const shortageChartData = dates.map((date, i) => {
              const row = { date: date.substring(0, 10) };
              affectedPoints.forEach(pid => { row[pid] = shortagesSeries[pid]?.[i] || 0; });
              return row;
            });

            return (
              <div className="ns2-analytics-chart-section" style={sectionStyle}>
                <div className="ns2-analytics-chart-section-title" style={{ color: '#dc2626' }}>
                  <IconActivity size={16} /> Shortage Analysis
                </div>
                <div className="ns2-analytics-kpi-grid">
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{(totalShortageAmt / 1e6).toFixed(3)} M m³</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Total Shortage</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{affectedDays}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Affected Days</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val" style={{ color: '#dc2626' }}>{affectedPoints.length}</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Affected Points</div>
                  </div>
                  <div className="ns2-analytics-kpi-card-lg">
                    <div className="ns2-analytics-kpi-card-lg-val">{dates.length > 0 ? ((affectedDays / dates.length) * 100).toFixed(1) : '—'}%</div>
                    <div className="ns2-analytics-kpi-card-lg-label">Days with Shortage</div>
                  </div>
                </div>
                <div className="ns2-analytics-subsection-title" style={{ marginBottom: 10 }}>📊 Daily Shortage by Delivery Point</div>
                <div className="ns2-analytics-legend-chips" style={{ marginBottom: 10 }}>
                  <label className={`ns2-analytics-chip ns2-analytics-chip--interactive${shortageFilter === 'all' ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': '#475569' }}>
                    <input type="checkbox" checked={shortageFilter === 'all'} onChange={() => setShortageFilter('all')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    <span className="ns2-analytics-chip-dot" />Select All
                  </label>
                  {(shortageLegendsExpanded ? affectedPoints : affectedPoints.slice(0, 4)).map((pid, i) => {
                    const selected = shortageFilter === 'all' || (Array.isArray(shortageFilter) ? shortageFilter.includes(pid) : shortageFilter === pid);
                    return (
                      <label key={pid} className={`ns2-analytics-chip ns2-analytics-chip--interactive${selected ? ' ns2-analytics-chip--selected' : ''}`} style={{ '--chip-color': SHORTAGE_COLORS[i % SHORTAGE_COLORS.length] }}>
                        <input type="checkbox" checked={selected} onChange={() => {
                          if (shortageFilter === 'all') { setShortageFilter([pid]); }
                          else if (Array.isArray(shortageFilter)) {
                            const updated = shortageFilter.includes(pid) ? shortageFilter.filter(k => k !== pid) : [...shortageFilter, pid];
                            setShortageFilter(updated.length > 0 ? updated : 'all');
                          } else { setShortageFilter([pid]); }
                        }} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                        <span className="ns2-analytics-chip-dot" />{getName(pid)}
                      </label>
                    );
                  })}
                  {affectedPoints.length > 4 && (
                    <button type="button" className="ns2-analytics-chip-toggle-btn" onClick={() => setShortageLegendsExpanded(!shortageLegendsExpanded)}>
                      {shortageLegendsExpanded ? 'Show less' : `Show ${affectedPoints.length - 4} more`}
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={shortageChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={(val, name) => [(val / 1000).toFixed(2) + ' k m³', getName(name)]} />
                    {(shortageLegendsExpanded ? affectedPoints : affectedPoints.slice(0, 4)).map((pid, i) => {
                      const shouldShow = shortageFilter === 'all' || (Array.isArray(shortageFilter) ? shortageFilter.includes(pid) : shortageFilter === pid);
                      return shouldShow && (
                        <Bar key={pid} dataKey={pid} stackId="a" fill={SHORTAGE_COLORS[i % SHORTAGE_COLORS.length]} />
                      );
                    })}
                    <Brush dataKey="date" height={18} stroke="#d1d5db" travellerWidth={6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

        </div>

    </div>
  );
}
// ─── Demand-coverage helpers ──────────────────────────────────────────────────
// Mirror the backend matching in flow.py (_clean_target_name / _names_match /
// _normalize_region_name / _regions_match) so the pre-run flag matches what the
// engine will actually do when assigning scenario demand to delivery points.
const NS2_DELIVERY_TYPES = ['point', 'filling-station', 'distribution-point'];
const NS2_NAME_SUFFIXES = ['handover point', 'city gate', 'hp', 'cg', 'gate', 'point'];

// Compact m³/day formatter for the flow-trace panel.
function ns2FmtFlow(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}

function ns2CleanName(name) {
  let s = String(name || '').toLowerCase().trim();
  for (const suf of NS2_NAME_SUFFIXES) s = s.split(suf).join(' ').trim();
  return s.replace(/\s+/g, ' ').trim();
}
function ns2NamesMatch(a, b) {
  if (!a || !b) return false;
  let n1 = String(a).toLowerCase().trim();
  let n2 = String(b).toLowerCase().trim();
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  for (const suf of NS2_NAME_SUFFIXES) { n1 = n1.split(suf).join(' ').trim(); n2 = n2.split(suf).join(' ').trim(); }
  n1 = n1.replace(/\s+/g, ' ').trim(); n2 = n2.replace(/\s+/g, ' ').trim();
  if (n1 && n2 && (n1 === n2 || n1.includes(n2) || n2.includes(n1))) return true;
  return false;
}
function ns2NormRegion(r) {
  if (!r) return '';
  let s = String(r).toLowerCase().replace(/[ \-_]/g, '');
  if (s.endsWith('h') && s.length > 1) {
    const w = s.slice(0, -1);
    if (!w.endsWith('yadh') && !w.endsWith('dh')) s = w;
  }
  return s;
}
function ns2RegionsMatch(a, b) {
  if (!a || !b) return false;
  if (String(a).toLowerCase() === String(b).toLowerCase()) return true;
  return ns2NormRegion(a) === ns2NormRegion(b);
}

// Returns { mode, unmatched: [{id,name,region}] } for the given scenario data
// (the scenario's raw object) and the list of delivery nodes on the canvas.
function ns2ComputeDemandCoverage(scenarioData, deliveryNodes) {
  if (!scenarioData) return { mode: 'none', unmatched: [] };
  const inputs = scenarioData.inputs || {};
  const fd = scenarioData.forecast_data || {};

  let mode = 'unknown';
  let targetNames = [];
  const targetRegions = new Set();

  // A target only "provides demand" if it has at least one non-zero forecast
  // value — targets that exist but forecast 0 (e.g. relay tanks) leave their
  // point with no demand, same as the engine.
  const hasDemand = arr => Array.isArray(arr) && arr.some(x => (x.forecast || 0) > 0);

  if (inputs.use_target_mode && Array.isArray(inputs.targets) && inputs.targets.length > 0) {
    mode = inputs.targets[0].target_type || 'city_gate';
    const dbt = fd.daily_by_target || fd.daily_by_region || {};
    targetNames = Object.keys(dbt).filter(k => hasDemand(dbt[k]));
    Object.entries(dbt).forEach(([k, arr]) => {
      if (hasDemand(arr) && arr[0] && arr[0].region) targetRegions.add(arr[0].region);
    });
  } else if (fd.daily_by_region || fd.daily_by_target) {
    mode = 'region';
    const src = fd.daily_by_target || fd.daily_by_region;
    Object.entries(src).forEach(([r, arr]) => { if (hasDemand(arr)) targetRegions.add(r); });
  } else if (fd.daily_forecasts) {
    mode = 'region';
    Object.keys(inputs.region_manual || {}).forEach(r => targetRegions.add(r));
  } else if (scenarioData.outputs && scenarioData.outputs.forecast) {
    mode = 'region';
    Object.keys(scenarioData.outputs.forecast).forEach(r => targetRegions.add(r));
  }

  const regionList = [...targetRegions];
  const unmatched = [];
  for (const nd of deliveryNodes) {
    let covered;
    if (mode === 'city_gate') {
      const pn = nd.matchName || nd.name || '';
      const pne = pn.toLowerCase().trim();
      const pnc = ns2CleanName(pn);
      covered = targetNames.some(t =>
        pne === String(t).toLowerCase().trim() || pnc === ns2CleanName(t) || ns2NamesMatch(pn, t));
    } else if (mode === 'governorate') {
      covered = !!nd.governorate && targetNames.some(t => ns2NamesMatch(nd.governorate, t));
    } else if (mode === 'region') {
      covered = !!nd.region && regionList.some(r => ns2RegionsMatch(nd.region, r));
    } else {
      covered = true; // unknown scenario shape — don't raise false alarms
    }
    if (!covered) unmatched.push({ id: nd.id, name: nd.name, region: nd.region });
  }
  return { mode, unmatched };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NetworkSimulation2Page({
  workspaceMode = 'legacy',
  embedded = false,
  controlledSnapshot = null,
  controlledName = '',
  controlledDescription = '',
  onControlledSave = null,
  onControlledDirtyChange = null,
}) {
  const params = useParams();
  const isNetworkCanvas = workspaceMode === 'network-canvas';
  const isConfigurationSnapshot = workspaceMode === 'simulation-config';
  const isControlledSnapshot = isConfigurationSnapshot && typeof onControlledSave === 'function';
  const isCanvasEditor = isNetworkCanvas || isConfigurationSnapshot;
  const workspacePageType = isNetworkCanvas ? 'network-canvas' : isConfigurationSnapshot ? 'simulation-config' : 'cyto-simulation';
  const workspaceBasePath = isNetworkCanvas ? '/network-canvas' : isConfigurationSnapshot ? '/simulation-config' : '/cyto-simulation';
  const workspaceApiBase = isNetworkCanvas ? '/api/network-canvases' : isConfigurationSnapshot ? '/api/simulation-configurations' : '/api/cyto-simulations';
  const configurationRecordRef = useRef(null);
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const idCounter = useRef(1);
  const nextId = () => `ns2-${Date.now()}-${idCounter.current++}`;
  const bendOverlaySyncTimersRef = useRef([]);
  const bendOverlayPointerLockedRef = useRef(false);
  const bendOverlayLastPointerRef = useRef(null);
  const bendOverlayLastSizeRef = useRef(null);
  const bendOverlayMoveRafRef = useRef(null);
  const bendOverlaySyncPendingRef = useRef(new Set());

  // Mode management (refs for Cytoscape event handlers, state for React rendering)
  const modeRef = useRef('default'); // 'default' | 'draw-pipe' | 'insert-on-edge' | 'place-entity' | 'place-asset'
  const lineSourceRef = useRef(null);  // node id of source while drawing pipe
  const pendingPlacementRef = useRef(null); // { entityType } or { assetData, entityType }
  const insertEdgeRef = useRef(null); // edge id being split
  const reconnectRef = useRef(null); // { edgeId, endpoint: 'source'|'target' } while picking a new node
  const pendingEdgeRef = useRef(null); // { source, target } while waiting for pipe modal
  const importInputRef = useRef(null);
  const placeAssetNodeRef = useRef(null); // latest placeAssetNode closure for the once-registered tap handler
  const placeAssetNodesBatchRef = useRef(null);
  const copySelectionRef = useRef(null);
  const pasteNetworkRef = useRef(null);
  const groupDragRef = useRef(null);
  const activeNoteEditorRef = useRef(null);
  const activeNoteSelectionRef = useRef(null);
  const pendingFocusNoteIdRef = useRef(null);
  const commitActiveNoteEditorRef = useRef(() => {});

  const {
    setToolbar,
    activePageInstance,
    pageInstances,
    openPageInstance,
    switchPageInstance,
    updatePageInstanceState,
    updatePageInstance,
  } = useLayout();

  const [mode, setMode] = useState('default');
  const [lineSource, setLineSource] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedEl, setSelectedEl] = useState(null);
  const [noteOverlays, setNoteOverlays] = useState([]);
  const [groupBoxOverlays, setGroupBoxOverlays] = useState([]);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [hasNetworkClipboard, setHasNetworkClipboard] = useState(Boolean(ns2NetworkClipboard?.elements?.length));

  const gridWrapRef = useRef(null);

  // Entity modal
  const [entityModal, setEntityModal] = useState({
    open: false, mode: 'new', form: emptyEntityForm(), editId: null,
  });

  // Pipe modal
  const [pipeModal, setPipeModal] = useState({
    open: false, mode: 'new', form: emptyPipeForm(), editId: null,
  });

  // Insert-on-edge modal (step 1: pick entity type or from library)
  const [insertModal, setInsertModal] = useState({ open: false });

  // Asset library
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryRegion, setLibraryRegion] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('');
  const [selectedLibraryAssetIds, setSelectedLibraryAssetIds] = useState([]);

  // Selection count (drives alignment button disabled state)
  const [selectedCount, setSelectedCount] = useState(0);

  // Bumped on every canvas node add/remove so derived sets (placed assets) stay live
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [cyMountVersion, setCyMountVersion] = useState(0);

  // Local Cytoscape canvas history
  const historyRef = useRef({ undo: [], redo: [], current: null, currentSignature: '' });
  const isHistoryRestoringRef = useRef(false);
  // Signature of the canvas as it was last persisted (saved to DB / loaded /
  // restored). The header "Unsaved" badge is driven by comparing this against
  // the live canvas signature, so it only lights up after a real edit and
  // clears again if the user undoes back to the saved state.
  const savedSignatureRef = useRef('');
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false, isDirty: false });

  // Area zoom rubber-band rect state {x, y, w, h} in px (null when not dragging)
  const [areaZoom, setAreaZoom] = useState(null);
  const areaZoomStartRef = useRef(null);

  // Right panel active tab
  const [rightPanelTab, setRightPanelTab] = useState('details');
  const [validationIssues, setValidationIssues] = useState([]);
  const [issuePanelMode, setIssuePanelMode] = useState('issues'); // 'issues' | 'find'
  const [advancedSearch, setAdvancedSearch] = useState('');
  const [isSelectionIsolated, setIsSelectionIsolated] = useState(false);
  // Saved network-only metadata. It groups pipe segments into named lines,
  // branches, and transmission systems without changing pipe records.
  const [lineGroups, setLineGroups] = useState([]);
  // Mirror of lineGroups read by cytoscape event handlers (set up once at
  // init, so closure capture would otherwise see a stale empty array).
  const lineGroupsRef = useRef([]);
  useEffect(() => { lineGroupsRef.current = lineGroups; }, [lineGroups]);
  const [lineGroupDraft, setLineGroupDraft] = useState({ name: '', type: 'line', parentId: '' });
  const [selectedLineGroupIds, setSelectedLineGroupIds] = useState(new Set());
  const [expandedLineGroupIds, setExpandedLineGroupIds] = useState(new Set());
  // Separate expansion state for showing the individual pipe segments of a
  // line or branch (clicking a segment row isolates that single pipe).
  const [expandedSegmentGroupIds, setExpandedSegmentGroupIds] = useState(new Set());

  // Simulation run state
  const [simConfig, setSimConfig] = useState({
    dateRange: { start: 2025, end: 2025 },
    purificationPct: 30,
    strategicStorageMinPct: 70,
    priorityMode: 'weighted',
  });
  const [simResults, setSimResults] = useState(null);
  const [simEntities, setSimEntities] = useState([]);
  const [simChartData, setSimChartData] = useState([]);      // [{date, supply, demand, shortage}]
  const [simRegionalData, setSimRegionalData] = useState({}); // {region: {dates[], demand[], delivered[], shortage[], satisfaction[]}}
  const [simScenario, setSimScenario] = useState(null);       // snapshot of selectedDemandScenario at run-time
  const [simRunConfig, setSimRunConfig] = useState(null);    // snapshot of simConfig + mode at run-time
  const [simRunning, setSimRunning] = useState(false);
  const [simElapsed, setSimElapsed] = useState(0); // seconds elapsed while running
  const simTimerRef = useRef(null);
  const [simError, setSimError] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false); // eslint-disable-line no-unused-vars
  const [viewMode, setViewMode] = useState('canvas'); // 'canvas' | 'analytics'
  const [nodeNameMap, setNodeNameMap] = useState({});
  const dashIntervalRef = useRef(null);

  // Demand scenarios
  const [demandScenarios, setDemandScenarios] = useState([]);
  const [selectedDemandScenario, setSelectedDemandScenario] = useState(null);
  const [demandInputMode, setDemandInputMode] = useState('scenario'); // 'scenario' | 'manual'
  const [manualDemands, setManualDemands] = useState({}); // { pointId: number }
  const [canvasPointNodes, setCanvasPointNodes] = useState([]); // delivery points on canvas
  const [demandCoverage, setDemandCoverage] = useState({ mode: null, unmatched: [] }); // delivery points with no demand
  const [traceInfo, setTraceInfo] = useState(null); // flow-trace summary for the clicked asset
  const [traceDisplayMode, setTraceDisplayMode] = useState('reachable'); // 'delivered' | 'reachable'
  const traceFlowRef = useRef(null); // latest traceFlow closure for the (once-registered) tap handler
  const [overlayDayIdx, setOverlayDayIdx] = useState(null); // which day's flow the canvas shows
  const [bottleneckSummary, setBottleneckSummary] = useState(null); // on-canvas bottleneck legend/list

  // Simulation save metadata
  const [simMeta, setSimMeta] = useState({ name: '', description: '' });
  const [simSaving, setSimSaving] = useState(false);
  const [simSavedId, setSimSavedId] = useState(null);
  const [simSaveStatus, setSimSaveStatus] = useState('idle'); // 'idle' | 'saved'
  // Save-As: triggered once the rename + null id have committed to state.
  const [pendingSaveAsName, setPendingSaveAsName] = useState(null);
  const controlledSaveAsRef = useRef(false);

  // Refs for reading latest state in the instance-switch effect (avoids stale closures)
  const simMetaRef = useRef({ name: '', description: '' });
  const simSavedIdRef = useRef(null);
  const simConfigRef = useRef(null);
  const simResultsRef = useRef(null);
  const simChartDataRef = useRef([]);
  const simRegionalDataRef = useRef({});
  const selectedDemandScenarioRef = useRef(null);
  const manualDemandsRef = useRef({});
  const demandInputModeRef = useRef('scenario');
  const prevInstanceIdRef = useRef(null);
  const activeInstanceId = activePageInstance?.[workspacePageType] || null;
  const activeInstanceIdRef = useRef(activeInstanceId);

  useEffect(() => {
    if (isControlledSnapshot) return;
    const instances = pageInstances[workspacePageType] || [];
    const activeInstanceExists = activeInstanceId && instances.some(instance => instance.id === activeInstanceId);
    if (params?.id || activeInstanceExists) return;

    const existingNew = instances.find(instance =>
      !instance.state?.simulationId && (instance.state?.path || workspaceBasePath) === workspaceBasePath
    );
    const instanceId = existingNew?.id || openPageInstance(workspacePageType, {
      title: isNetworkCanvas ? 'New Network Canvas' : 'New Network Simulation',
      state: { path: workspaceBasePath, simulationId: null },
    });

    switchPageInstance(workspacePageType, instanceId);
  }, [params?.id, activeInstanceId, pageInstances, openPageInstance, switchPageInstance, workspacePageType, workspaceBasePath, isNetworkCanvas, isControlledSnapshot]);

  const buildCanvasSnapshot = useCallback((overrides = {}) => {
    const cy = cyRef.current;
    if (!cy || (typeof cy.destroyed === 'function' && cy.destroyed())) return null;
    return {
      cyJson: buildLeanCyJson(cy),
      savedSignature: savedSignatureRef.current,
      simMeta: simMetaRef.current,
      simSavedId: simSavedIdRef.current,
      simConfig: simConfigRef.current,
      simResults: simResultsRef.current,
      simChartData: simChartDataRef.current,
      simRegionalData: simRegionalDataRef.current,
      selectedDemandScenario: selectedDemandScenarioRef.current,
      manualDemands: manualDemandsRef.current,
      demandInputMode: demandInputModeRef.current,
      ...overrides,
    };
  }, []);

  const saveCanvasSnapshotToInstance = useCallback((instanceId, overrides = {}) => {
    if (!instanceId) return;
    const snapshot = buildCanvasSnapshot(overrides);
    if (!snapshot) return;

    const savedId = snapshot.simSavedId && snapshot.simSavedId !== true ? snapshot.simSavedId : null;
    updatePageInstanceState(workspacePageType, instanceId, {
      canvasSnapshot: snapshot,
      ...(savedId ? { simulationId: savedId, path: `${workspaceBasePath}/${savedId}` } : {}),
    });
  }, [buildCanvasSnapshot, updatePageInstanceState, workspacePageType, workspaceBasePath]);

  const updateHistoryState = useCallback(() => {
    const history = historyRef.current;
    setHistoryState({
      canUndo: history.undo.length > 0,
      canRedo: history.redo.length > 0,
      isDirty: history.currentSignature !== savedSignatureRef.current,
    });
  }, []);

  // resetCanvasHistory clears undo/redo and establishes a new baseline. By
  // default the reset state is treated as "saved" (clean) — pass an explicit
  // savedSignatureOverride to preserve a different saved baseline, e.g. when
  // restoring a tab snapshot that still held unsaved edits.
  const resetCanvasHistory = useCallback((snapshotOverride = null, savedSignatureOverride = undefined) => {
    const snapshot = snapshotOverride || serializeCanvasHistorySnapshot(cyRef.current);
    const signature = getCanvasHistorySignature(snapshot);
    historyRef.current = {
      undo: [],
      redo: [],
      current: snapshot,
      currentSignature: signature,
    };
    savedSignatureRef.current = savedSignatureOverride !== undefined ? savedSignatureOverride : signature;
    updateHistoryState();
  }, [updateHistoryState]);

  useEffect(() => {
    if (!isControlledSnapshot) return;
    onControlledDirtyChange?.(historyState.isDirty);
  }, [isControlledSnapshot, onControlledDirtyChange, historyState.isDirty]);

  const recordCanvasHistory = useCallback(() => {
    if (isHistoryRestoringRef.current) return;
    const snapshot = serializeCanvasHistorySnapshot(cyRef.current);
    if (!snapshot) return;

    const signature = getCanvasHistorySignature(snapshot);
    const history = historyRef.current;
    if (signature === history.currentSignature) return;

    if (history.current) {
      history.undo.push(history.current);
      if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    }
    history.current = snapshot;
    history.currentSignature = signature;
    history.redo = [];
    updateHistoryState();
  }, [updateHistoryState]);

  const normalizeEdgeBendData = useCallback((edge) => {
    if (!edge || !edge.length || !edge.isEdge?.()) return 0;

    const toFiniteNumbers = (value) => (
      Array.isArray(value)
        ? value.map(Number).filter(Number.isFinite)
        : []
    );
    const weights = toFiniteNumbers(edge.data('cyedgebendeditingWeights'));
    const distances = toFiniteNumbers(edge.data('cyedgebendeditingDistances'));

    // Weights and distances get written in two steps — by our bend handlers and,
    // crucially, by the plugin's own initAnchorPoints() while a node is being
    // dragged. A transient length mismatch means we're between those two writes.
    // Bailing out here (instead of treating it as "no bends") avoids wiping the
    // arrays and stripping the bend class, which would otherwise leave the plugin
    // holding a type-'none' edge that crashes on the next interaction
    // (the syntax['none'].weight error) and blocks node dragging.
    if (weights.length !== distances.length) {
      return Math.min(weights.length, distances.length);
    }

    const bendCount = Math.min(weights.length, distances.length);
    const nextWeights = weights.slice(0, bendCount);
    const nextDistances = distances.slice(0, bendCount);
    const storedPositions = Array.isArray(edge.data('bendPointPositions')) ? edge.data('bendPointPositions') : [];
    const storedPositionCount = storedPositions.filter(point =>
      point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    ).length;

    if (bendCount <= 0) {
      if (storedPositionCount > 0) {
        edge.addClass('edgebendediting-hasbendpoints');
        if (storedPositionCount > 1) edge.addClass('edgebendediting-hasmultiplebendpoints');
        else edge.removeClass('edgebendediting-hasmultiplebendpoints');
        return storedPositionCount;
      }
      if (edge.hasClass('edgebendediting-hasbendpoints') || edge.hasClass('edgebendediting-hasmultiplebendpoints')) {
        edge.removeClass('edgebendediting-hasbendpoints edgebendediting-hasmultiplebendpoints');
      }
      if ((edge.data('cyedgebendeditingWeights') || []).length) edge.data('cyedgebendeditingWeights', []);
      if ((edge.data('cyedgebendeditingDistances') || []).length) edge.data('cyedgebendeditingDistances', []);
      return 0;
    }

    const currentWeights = edge.data('cyedgebendeditingWeights') || [];
    const currentDistances = edge.data('cyedgebendeditingDistances') || [];
    if (
      currentWeights.length !== nextWeights.length ||
      currentDistances.length !== nextDistances.length ||
      currentWeights.some((value, index) => Number(value) !== nextWeights[index]) ||
      currentDistances.some((value, index) => Number(value) !== nextDistances[index])
    ) {
      edge.data('cyedgebendeditingWeights', nextWeights);
      edge.data('cyedgebendeditingDistances', nextDistances);
    }

    edge.addClass('edgebendediting-hasbendpoints');
    if (bendCount > 1) edge.addClass('edgebendediting-hasmultiplebendpoints');
    else edge.removeClass('edgebendediting-hasmultiplebendpoints');
    return bendCount;
  }, []);

  const setBendOverlayPointerEvents = useCallback((active) => {
    const container = containerRef.current;
    if (!container) return;
    const value = active ? 'auto' : 'none';
    container.querySelectorAll('[id^="cy-node-edge-editing-stage"]').forEach((overlay) => {
      overlay.style.pointerEvents = value;
      overlay.querySelectorAll('canvas').forEach((canvas) => {
        canvas.style.pointerEvents = value;
      });
    });
  }, []);

  const getSelectedBendHandleHit = useCallback((clientX, clientY) => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container || clientX == null || clientY == null) return false;

    const rect = container.getBoundingClientRect();
    const renderedX = clientX - rect.left;
    const renderedY = clientY - rect.top;
    if (renderedX < 0 || renderedY < 0 || renderedX > rect.width || renderedY > rect.height) return false;

    const edgeEditingApi = typeof cy.edgeEditing === 'function' ? cy.edgeEditing('get') : null;
    if (!edgeEditingApi?.getAnchorsAsArray) return false;

    const selected = cy.edges(':selected.edgebendediting-hasbendpoints');
    if (selected.length === 0) return false;

    const pan = cy.pan();
    const zoom = cy.zoom();
    return selected.some((edge) => {
      // Cheap, side-effect-free check — this runs on the mouse-move hot path, so
      // we read the existing anchors instead of calling normalizeEdgeBendData
      // (which mutates classes/data and is far heavier).
      const anchors = edgeEditingApi.getAnchorsAsArray(edge) || [];
      const edgeWidth = Number.parseFloat(edge.css('width')) || 2.5;
      const hitRadius = Math.max(12, edgeWidth * 2.5 * zoom + 8);
      for (let i = 0; i < anchors.length; i += 2) {
        const anchorX = anchors[i] * zoom + pan.x;
        const anchorY = anchors[i + 1] * zoom + pan.y;
        if (Math.abs(renderedX - anchorX) <= hitRadius && Math.abs(renderedY - anchorY) <= hitRadius) {
          return true;
        }
      }
      return false;
    });
  }, []);

  const updateBendOverlayPointerInteractivity = useCallback((clientX, clientY) => {
    if (clientX != null && clientY != null) {
      bendOverlayLastPointerRef.current = { clientX, clientY };
    }
    const pointer = bendOverlayLastPointerRef.current;
    const shouldEnable = bendOverlayPointerLockedRef.current ||
      (pointer && getSelectedBendHandleHit(pointer.clientX, pointer.clientY));
    setBendOverlayPointerEvents(Boolean(shouldEnable));
  }, [getSelectedBendHandleHit, setBendOverlayPointerEvents]);

  const syncBendEditingOverlay = useCallback((delay = 0) => {
    // Coalesce: many events fire syncBendEditingOverlay(0) back-to-back, and each
    // run does a full initAnchorPoints + Konva redraw. Skip scheduling another
    // sync for a delay that's already pending — the pending one reads fresh state
    // when it runs anyway.
    if (bendOverlaySyncPendingRef.current.has(delay)) return;
    bendOverlaySyncPendingRef.current.add(delay);
    const timer = window.setTimeout(() => {
      bendOverlaySyncPendingRef.current.delete(delay);
      window.requestAnimationFrame(() => {
        const cy = cyRef.current;
        const container = containerRef.current;
        if (!cy || !container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        // cy.resize() forces a full renderer recompute + redraw; only pay for it
        // when the container actually changed size (it's a no-op for the common
        // case where this sync was triggered by a selection/data change).
        const lastSize = bendOverlayLastSizeRef.current;
        if (!lastSize || lastSize.width !== width || lastSize.height !== height) {
          cy.resize();
          bendOverlayLastSizeRef.current = { width, height };
        }
        const selectedEdges = cy.edges(':selected');
        const selectedBendEdges = selectedEdges.filter(edge => normalizeEdgeBendData(edge) > 0);
        const hasSelectedBendEdge = selectedBendEdges.length > 0;
        container.querySelectorAll('[id^="cy-node-edge-editing-stage"]').forEach((overlay) => {
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = `${width}px`;
          overlay.style.height = `${height}px`;
          overlay.style.zIndex = '999';
          overlay.style.display = hasSelectedBendEdge ? 'block' : 'none';
        });

        Konva.stages.forEach((stage) => {
          const stageContainer = typeof stage.container === 'function' ? stage.container() : null;
          if (!stageContainer || !container.contains(stageContainer)) return;
          stage.width(width);
          stage.height(height);
          if (!hasSelectedBendEdge) {
            stage.getLayers().forEach((layer) => layer.destroyChildren());
          }
          stage.draw();
        });

        setBendOverlayPointerEvents(false);
        if (!hasSelectedBendEdge) return;

        const edgeEditingApi = typeof cy.edgeEditing === 'function' ? cy.edgeEditing('get') : null;
        edgeEditingApi?.initAnchorPoints?.(selectedBendEdges);
        updateBendOverlayPointerInteractivity();
      });
    }, delay);

    bendOverlaySyncTimersRef.current.push(timer);
  }, [normalizeEdgeBendData, setBendOverlayPointerEvents, updateBendOverlayPointerInteractivity]);

  const applyCanvasHistorySnapshot = useCallback((snapshot) => {
    const cy = cyRef.current;
    if (!cy || !snapshot) return;
    const viewport = {
      zoom: cy.zoom(),
      pan: { ...cy.pan() },
    };

    isHistoryRestoringRef.current = true;
    try {
      cy.elements().remove();
      cy.batch(() => {
        const nodes = (snapshot.elements || []).filter(el => el.group === 'nodes');
        const edges = (snapshot.elements || []).filter(el => el.group === 'edges');
        nodes.forEach(node => {
          if (!node.data?.id) return;
          const effectiveType = normalizeEntityType(node.data?.type);
          const data = {
            ...node.data,
            type: effectiveType,
            ...buildCyNodeCardData({
              type: effectiveType,
              name: node.data?.name,
              activity: node.data?.activity,
              assetType: node.data?.assetType,
              status: node.data?.status,
              capacityLimitationType:
                node.data?.capacityLimitationType
                  ?? (node.data?.capacityUsageLimit ? 'percentage' : 'none'),
              capacityLimitationValue:
                node.data?.capacityLimitationValue ?? node.data?.capacityUsageLimit ?? '',
            }),
          };
          try { cy.add({ ...node, data }); } catch (_) {}
        });
        edges.forEach(edge => {
          if (!edge.data?.id || !edge.data?.source || !edge.data?.target) return;
          try { cy.add(edge); } catch (_) {}
        });
      });
      cy.zoom(viewport.zoom);
      cy.pan(viewport.pan);
      if (!showLabels) {
        cy.nodes().addClass('hide-labels');
        cy.edges().addClass('hide-labels');
      }
      cy.$(':selected').unselect();
      setSelectedEl(null);
      setSelectedCount(0);
      setCanvasVersion(v => v + 1);
      requestAnimationFrame(() => cy.resize());
    } finally {
      isHistoryRestoringRef.current = false;
    }
  }, [showLabels]);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    if (history.undo.length === 0) return;

    const current = history.current || serializeCanvasHistorySnapshot(cyRef.current);
    const previous = history.undo.pop();
    if (current) history.redo.push(current);
    history.current = previous;
    history.currentSignature = getCanvasHistorySignature(previous);
    applyCanvasHistorySnapshot(previous);
    updateHistoryState();
  }, [applyCanvasHistorySnapshot, updateHistoryState]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    if (history.redo.length === 0) return;

    const current = history.current || serializeCanvasHistorySnapshot(cyRef.current);
    const next = history.redo.pop();
    if (current) history.undo.push(current);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    history.current = next;
    history.currentSignature = getCanvasHistorySignature(next);
    applyCanvasHistorySnapshot(next);
    updateHistoryState();
  }, [applyCanvasHistorySnapshot, updateHistoryState]);

  // ── Mode helpers ─────────────────────────────────────────────────────────────
  const changeMode = useCallback((newMode) => {
    modeRef.current = newMode;
    setMode(newMode);
    // Clean up visual state
    if (newMode !== 'draw-pipe') {
      lineSourceRef.current = null;
      setLineSource(null);
      cyRef.current?.nodes().removeClass('draw-source');
    }
    if (newMode !== 'insert-on-edge') {
      cyRef.current?.edges().removeClass('insert-target');
    }
    if (newMode !== 'reconnect-endpoint') {
      cyRef.current?.edges().removeClass('reconnect-target');
      reconnectRef.current = null;
    }
    // Area zoom disables Cytoscape's own panning while rubber-band is active
    if (newMode === 'area-zoom') {
      cyRef.current?.panningEnabled(false);
      setAreaZoom(null);
    } else {
      cyRef.current?.panningEnabled(true);
      areaZoomStartRef.current = null;
      setAreaZoom(null);
    }
    if (!['place-entity', 'place-asset'].includes(newMode)) {
      pendingPlacementRef.current = null;
    }
    // Leaving trace mode clears the flow-trace highlight
    if (newMode !== 'trace') {
      cyRef.current?.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim');
      setTraceInfo(null);
    }
    // Leaving bottleneck mode clears the bottleneck highlight
    if (newMode !== 'bottlenecks') {
      cyRef.current?.elements().removeClass('bn-line bn-plant bn-point trace-dim');
      setBottleneckSummary(null);
    }
  }, []);

  const exitMode = useCallback(() => changeMode('default'), [changeMode]);
  const handleRightPanelInteraction = useCallback(() => {
    if (modeRef.current !== 'default') {
      changeMode('default');
    }
    insertEdgeRef.current = null;
  }, [changeMode]);
  const handleRightPanelTabChange = useCallback((tab) => {
    handleRightPanelInteraction();
    setRightPanelTab(tab);
  }, [handleRightPanelInteraction]);

  // ── Flow tracing ───────────────────────────────────────────────────────────────
  // Click an asset to see where its water comes FROM (upstream, blue) and where
  // it GOES (downstream, green). Edges are followed in flow direction (source→
  // target); bidirectional pipes are traversed both ways. Flow volumes (when a
  // simulation has been run) come from results.flowByLine.
  const traceFlow = useCallback((rootNode, requestedMode = traceDisplayMode) => {
    const cy = cyRef.current;
    if (!cy || !rootNode) return;
    const rootId = rootNode.id();
    const _res = simResults?.results;
    const _dsr = _res?.daily_series;
    let flowByLine;
    if (_dsr && Array.isArray(_dsr.dates) && overlayDayIdx != null && _dsr.flowByLine) {
      flowByLine = {};
      Object.entries(_dsr.flowByLine).forEach(([k, arr]) => { flowByLine[k] = (arr[overlayDayIdx] || 0); });
    } else {
      flowByLine = _res?.flowByLine || {};
    }
    const isBi = e => e.data('bidirectional') === true || e.data('bidirectional') === 'true';
    const flowAmount = edge => {
      const raw = flowByLine[edge.id()];
      return Number(raw?.total_flow ?? raw?.flow ?? raw ?? 0);
    };
    const hasFlowResult = Object.keys(flowByLine).length > 0;
    const deliveredMode = requestedMode === 'delivered' && hasFlowResult;
    const canTraceEdge = edge => !deliveredMode || flowAmount(edge) > 0.00001;

    cy.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim');

    const downNodes = new Set(), upNodes = new Set();
    const downEdges = new Set(), upEdges = new Set();

    // Downstream: follow edges away from each node in flow direction.
    const dq = [rootId]; const dseen = new Set([rootId]);
    while (dq.length) {
      const cur = dq.shift();
      cy.getElementById(cur).connectedEdges().forEach(e => {
        if (!canTraceEdge(e)) return;
        let nxt = null;
        if (e.source().id() === cur) nxt = e.target().id();
        else if (isBi(e) && e.target().id() === cur) nxt = e.source().id();
        if (nxt) {
          downEdges.add(e.id());
          if (!dseen.has(nxt)) { dseen.add(nxt); downNodes.add(nxt); dq.push(nxt); }
        }
      });
    }
    // Upstream: follow edges that feed into each node.
    const uq = [rootId]; const useen = new Set([rootId]);
    while (uq.length) {
      const cur = uq.shift();
      cy.getElementById(cur).connectedEdges().forEach(e => {
        if (!canTraceEdge(e)) return;
        let prev = null;
        if (e.target().id() === cur) prev = e.source().id();
        else if (isBi(e) && e.source().id() === cur) prev = e.target().id();
        if (prev) {
          upEdges.add(e.id());
          if (!useen.has(prev)) { useen.add(prev); upNodes.add(prev); uq.push(prev); }
        }
      });
    }

    cy.nodes().forEach(n => {
      const id = n.id();
      if (id === rootId) n.addClass('trace-root');
      else if (downNodes.has(id)) n.addClass('trace-down');
      else if (upNodes.has(id)) n.addClass('trace-up');
      else n.addClass('trace-dim');
    });
    cy.edges().forEach(e => {
      const id = e.id();
      if (downEdges.has(id)) e.addClass('trace-down-edge');
      else if (upEdges.has(id)) e.addClass('trace-up-edge');
      else e.addClass('trace-dim');
    });

    // Immediate neighbours for the summary panel (with flow volumes).
    const nameOf = id => { const n = cy.getElementById(id); return (n && n.length) ? (n.data('name') || id) : id; };
    const sources = [], dests = [];
    cy.getElementById(rootId).connectedEdges().forEach(e => {
      if (!canTraceEdge(e)) return;
      const flow = flowAmount(e);
      const s = e.source().id(), t = e.target().id();
      if (t === rootId) sources.push({ id: s, name: nameOf(s), flow });
      if (s === rootId) dests.push({ id: t, name: nameOf(t), flow });
      if (isBi(e) && s === rootId) sources.push({ id: t, name: nameOf(t), flow });
      if (isBi(e) && t === rootId) dests.push({ id: s, name: nameOf(s), flow });
    });

    setTraceInfo({
      rootId,
      rootName: rootNode.data('name') || rootId,
      rootType: rootNode.data('type'),
      upCount: upNodes.size,
      downCount: downNodes.size,
      sources: sources.sort((a, b) => b.flow - a.flow),
      dests: dests.sort((a, b) => b.flow - a.flow),
      hasFlow: hasFlowResult,
      mode: deliveredMode ? 'delivered' : 'reachable',
      ultimateSources: [...upNodes]
        .map(id => cy.getElementById(id))
        .filter(node => node?.length && ['plant', 'stp'].includes(node.data('type')))
        .map(node => ({ id: node.id(), name: node.data('name') || node.id() })),
    });
  }, [simResults, overlayDayIdx, traceDisplayMode]);
  traceFlowRef.current = traceFlow;

  // ── Bottleneck highlighting ──────────────────────────────────────────────────
  // Paint the actual bottleneck pipes (red) and plant/point bottleneck nodes in
  // place on the network, dimming everything else, so they're understandable on a
  // large graph instead of a long list of boxes.
  const showBottlenecks = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const bn = simResults?.results?.bottlenecks || {};
    cy.elements().removeClass('bn-line bn-plant bn-point trace-dim');

    const highlighted = new Set();
    const items = [];
    let lineCount = 0, plantCount = 0, pointCount = 0;

    Object.entries(bn).forEach(([key, info]) => {
      if (!info || info.is_bottleneck === false) return;
      const type = info.type || (key.startsWith('plant_') ? 'plant' : key.startsWith('point_') ? 'delivery_point' : 'line');
      const util = Number(info.utilization || 0);
      if (type === 'plant') {
        const id = key.replace(/^plant_/, '');
        const el = cy.getElementById(id);
        if (el && el.length && el.isNode()) { el.addClass('bn-plant'); highlighted.add(id); }
        plantCount++;
        items.push({ id, kind: 'plant', name: (el && el.length ? (el.data('name') || id) : id), util, detail: info.shortage ? `${ns2FmtFlow(info.shortage)} m³/d short in its service area` : '' });
      } else if (type === 'delivery_point') {
        const id = key.replace(/^point_/, '');
        const el = cy.getElementById(id);
        if (el && el.length && el.isNode()) { el.addClass('bn-point'); highlighted.add(id); }
        pointCount++;
        items.push({ id, kind: 'point', name: (el && el.length ? (el.data('name') || id) : id), util, detail: info.shortage ? `${ns2FmtFlow(info.shortage)} m³/d short` : '' });
      } else {
        const el = cy.getElementById(key);
        if (el && el.length && el.isEdge()) { el.addClass('bn-line'); highlighted.add(key); }
        lineCount++;
        items.push({ id: key, kind: 'line', name: (el && el.length ? (el.data('name') || key) : key), util, detail: info.constraining_delivery ? 'constraining delivery downstream' : '' });
      }
    });

    cy.nodes().forEach(n => { if (!highlighted.has(n.id())) n.addClass('trace-dim'); });
    cy.edges().forEach(e => { if (!highlighted.has(e.id())) e.addClass('trace-dim'); });

    items.sort((a, b) => b.util - a.util);
    setBottleneckSummary({ lineCount, plantCount, pointCount, items });
  }, [simResults]);

  // Enter/refresh bottleneck view when the mode is active.
  useEffect(() => {
    if (mode === 'bottlenecks') showBottlenecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, simResults]);

  // ── Canvas helpers ────────────────────────────────────────────────────────────
  const buildDisplayLabel = useCallback((type, name, showFull = true) => {
    if (type === 'note' || type === 'group-box') return name || '';
    const abbr = ENTITY_TYPE_ABBREVIATIONS[type] || '';
    if (!showFull) return abbr;
    return name ? `${abbr}\n${name}` : abbr;
  }, []);

  const addEntityNode = useCallback((formData, position) => {
    const cy = cyRef.current;
    if (!cy) return null;
    const id = nextId();
    const abbr = ENTITY_TYPE_ABBREVIATIONS[formData.type] || '';
    cy.add({
      group: 'nodes',
      data: {
        id,
        type: formData.type,
        name: formData.name,
        abbr,
        displayLabel: buildDisplayLabel(formData.type, formData.name, showLabels),
        ...buildCyNodeCardData(formData),
        status: normalizeAssetStatus(formData.status),
        capacity: formData.capacity,
        // New unified pair (mirrors edge form).
        capacityLimitationType: formData.capacityLimitationType || 'none',
        capacityLimitationValue: formData.capacityLimitationValue || '',
        // Junction nodes never carry commissioning dates.
        commissioningDate: formData.type === 'node' ? '' : (formData.commissioningDate || ''),
        decommissioningDate: formData.type === 'node' ? '' : (formData.decommissioningDate || ''),
        active: formData.active,
        activity: formData.activity,
        assetType: formData.assetType,
        region: formData.region,
        entityTypeCategory: formData.entityTypeCategory,
        plantType: formData.plantType,
        technology: formData.technology,
        waterSource: formData.waterSource,
        variableOM: formData.variableOM,
        governorate: formData.governorate,
        city: formData.city,
        assetId: formData.assetId || null,
        // Full DB record + parsed specifications carried along (asset placements)
        originalAsset: formData.originalAsset || null,
        specifications: formData.specifications || null,
        pumps: formData.type === 'pump' ? normalizePumpList(formData.pumps) : [],
      },
      position: position || {
        x: 200 + Math.random() * 400,
        y: 200 + Math.random() * 300,
      },
    });
    return id;
  }, [buildDisplayLabel, showLabels]);

  // Find a node already on the canvas that represents this asset — matched by
  // asset ID (the strong key) OR by name (case-insensitive). Reads the live
  // graph so it never goes stale. Returns the node or null.
  const findExistingAssetNode = useCallback((asset) => {
    const cy = cyRef.current;
    if (!cy || !asset) return null;
    const aid = asset.id != null ? String(asset.id) : null;
    const aname = String(asset.name || asset._name || '').trim().toLowerCase();
    let hit = null;
    cy.nodes().forEach((n) => {
      if (hit) return;
      const nid = n.data('assetId');
      if (aid && nid != null && String(nid) === aid) { hit = n; return; }
      if (aname && String(n.data('name') || '').trim().toLowerCase() === aname) { hit = n; }
    });
    return hit;
  }, []);

  // Place an asset directly on the canvas with ALL its DB details — no modal.
  // Refuses duplicates (by ID or name); instead it selects/centres the existing
  // node so the user can see what's already there. Returns the new node id or null.
  const placeAssetNode = useCallback((asset, entityType, position) => {
    const cy = cyRef.current;
    if (!cy || !asset) return null;
    const existing = findExistingAssetNode(asset);
    if (existing) {
      cy.$(':selected').unselect();
      existing.select();
      cy.animate({ center: { eles: existing }, duration: 250 });
      setSelectedEl({ ...existing.data(), _group: 'node' });
      alert(`"${asset.name || asset._name || 'This asset'}" is already on the canvas — duplicates aren't allowed.`);
      return null;
    }
    const assetWithCapacity = ensureAssetCapacityForPlacement(asset, entityType);
    if (!assetWithCapacity) return null;
    const id = addEntityNode(buildAssetEntityForm(assetWithCapacity, entityType), position);
    if (id) {
      cy.$(':selected').unselect();
      const node = cy.getElementById(id);
      node.select();
      setSelectedEl({ ...node.data(), _group: 'node' });
    }
    return id;
  }, [findExistingAssetNode, addEntityNode]);
  placeAssetNodeRef.current = placeAssetNode;

  const getBatchAssetPosition = useCallback((basePosition, index, total) => {
    if (total <= 1) return basePosition;
    const columns = Math.min(4, Math.ceil(Math.sqrt(total)));
    const row = Math.floor(index / columns);
    const col = index % columns;
    const visibleColumns = Math.min(columns, total);
    const horizontalGap = 180;
    const verticalGap = 120;
    const originX = basePosition.x - ((visibleColumns - 1) * horizontalGap) / 2;
    return {
      x: originX + col * horizontalGap,
      y: basePosition.y + row * verticalGap,
    };
  }, []);

  const placeAssetNodesBatch = useCallback((assets, position) => {
    const cy = cyRef.current;
    const batch = Array.isArray(assets) ? assets.filter(Boolean) : [];
    if (!cy || batch.length === 0) return [];

    const placedIds = [];
    const duplicateNames = [];
    batch.forEach((asset, index) => {
      const existing = findExistingAssetNode(asset);
      if (existing) {
        duplicateNames.push(asset._name || asset.name || 'Asset');
        return;
      }
      const placedId = placeAssetNode(
        asset,
        asset._entityType,
        getBatchAssetPosition(position, placedIds.length, batch.length)
      );
      if (placedId) placedIds.push(placedId);
    });

    if (placedIds.length > 0) {
      cy.$(':selected').unselect();
      const placedNodes = cy.collection(placedIds.map(id => cy.getElementById(id)));
      placedNodes.select();
      cy.animate({ fit: { eles: placedNodes, padding: 80 }, duration: 250 });
      const lastNode = cy.getElementById(placedIds[placedIds.length - 1]);
      setSelectedEl({ ...lastNode.data(), _group: 'node' });
    }

    if (duplicateNames.length > 0) {
      alert(`${duplicateNames.length} selected asset${duplicateNames.length === 1 ? ' is' : 's are'} already on the canvas and ${duplicateNames.length === 1 ? 'was' : 'were'} skipped.`);
    }

    return placedIds;
  }, [findExistingAssetNode, getBatchAssetPosition, placeAssetNode]);
  placeAssetNodesBatchRef.current = placeAssetNodesBatch;

  const addPipeEdge = useCallback((source, target, formData) => {
    const cy = cyRef.current;
    if (!cy) return null;
    const id = nextId();
    cy.add({
      group: 'edges',
      data: {
        id,
        source,
        target,
        name: formData.name,
        displayLabel: formData.name || '',
        capacity: formData.capacity,
        commissioningDate: formData.commissioningDate,
        decommissioningDate: formData.decommissioningDate,
        active: formData.active,
        pipelineLength: formData.pipelineLength,
        pipelineDiameter: formData.pipelineDiameter,
        pipelineMaterial: formData.pipelineMaterial,
        designCapacity: formData.designCapacity,
        maximumCapacity: formData.maximumCapacity,
        infraSource: formData.infraSource,
        bidirectional: formData.bidirectional ? 'true' : 'false',
        hasCapacityLimit: (formData.capacityLimitationType && formData.capacityLimitationType !== 'none') ? 'true' : 'false',
        capacityLimitationType: formData.capacityLimitationType,
        capacityLimitationValue: formData.capacityLimitationValue,
        transmissionSystemId: formData.transmissionSystemId || '',
        lineGroupId: formData.lineGroupId || '',
        parentLineId: formData.parentLineId || '',
        branchName: formData.branchName || '',
        isBranch: Boolean(formData.isBranch),
      },
    });
    return id;
  }, []);

  // Insert an entity onto a pipe: drop it at the edge midpoint and split the
  // original pipe into two segments that inherit its specs. Shared by the
  // insert modal and the direct "insert from library" path. Returns new node id.
  const insertEntityOnEdge = useCallback((form, edgeId) => {
    const cy = cyRef.current;
    if (!cy || !edgeId) return null;
    const edge = cy.getElementById(edgeId);
    if (!edge || !edge.length) return null;

    const edgeData = { ...edge.data() };
    const srcNodeId = edge.source().id();
    const tgtNodeId = edge.target().id();
    const srcPos = edge.source().position();
    const tgtPos = edge.target().position();
    const midPos = { x: (srcPos.x + tgtPos.x) / 2, y: (srcPos.y + tgtPos.y) / 2 };

    // Place entity at midpoint
    const newNodeId = addEntityNode(form, midPos);

    // Remove original edge
    edge.remove();

    // Two split edges inheriting the original pipe specs (length halved)
    const halfLen = edgeData.pipelineLength ? String(parseFloat(edgeData.pipelineLength) / 2) : '';
    const splitSpecs = (label) => ({
      name: `${edgeData.name || 'Pipe'} (${label})`,
      capacity: edgeData.capacity,
      commissioningDate: edgeData.commissioningDate,
      decommissioningDate: edgeData.decommissioningDate,
      active: edgeData.active,
      pipelineLength: halfLen,
      pipelineDiameter: edgeData.pipelineDiameter,
      pipelineMaterial: edgeData.pipelineMaterial,
      designCapacity: edgeData.designCapacity,
      maximumCapacity: edgeData.maximumCapacity,
      infraSource: edgeData.infraSource,
      bidirectional: edgeData.bidirectional === 'true',
      capacityLimitationType: edgeData.capacityLimitationType,
      capacityLimitationValue: edgeData.capacityLimitationValue,
    });
    addPipeEdge(srcNodeId, newNodeId, splitSpecs('1'));
    addPipeEdge(newNodeId, tgtNodeId, splitSpecs('2'));

    cy.edges().removeClass('insert-target');
    insertEdgeRef.current = null;
    return newNodeId;
  }, [addEntityNode, addPipeEdge]);

  const updateSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(':selected');
    setSelectedCount(sel.length);
    if (sel.length === 1) {
      const el = sel[0];
      setSelectedEl({ ...el.data(), _group: el.isNode() ? 'node' : 'edge' });
    } else {
      setSelectedEl(null);
    }
  }, []);

  const buildNetworkClipboardPayload = useCallback((scope = 'selection') => {
    commitActiveNoteEditorRef.current?.();
    const cy = cyRef.current;
    if (!cy) return null;

    const selected = scope === 'all' ? cy.elements() : cy.$(':selected');
    const selectedNodes = selected.nodes();
    if (selectedNodes.length === 0) return null;

    const nodeIds = new Set(selectedNodes.map(node => node.id()));
    const internalEdges = cy.edges().filter(edge =>
      nodeIds.has(edge.source().id()) && nodeIds.has(edge.target().id())
    );

    const nodes = selectedNodes.map(node => serializeCyNodeForClipboard(node));
    const edges = internalEdges.map(edge => serializeCyEdgeForClipboard(edge));
    const minX = Math.min(...nodes.map(node => node.position?.x ?? 0));
    const maxX = Math.max(...nodes.map(node => node.position?.x ?? 0));
    const minY = Math.min(...nodes.map(node => node.position?.y ?? 0));
    const maxY = Math.max(...nodes.map(node => node.position?.y ?? 0));

    return {
      version: 1,
      copiedAt: new Date().toISOString(),
      sourceSimulationId: simSavedIdRef.current || null,
      elements: [...nodes, ...edges],
      bounds: {
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
      },
    };
  }, []);

  const handleCopyNetwork = useCallback((scope = 'selection') => {
    const payload = buildNetworkClipboardPayload(scope);
    if (!payload) {
      alert(scope === 'all'
        ? 'There is no network on the canvas to copy.'
        : 'Select at least one node or asset to copy. Pipes are copied only when both endpoints are included.');
      return;
    }
    ns2NetworkClipboard = payload;
    setHasNetworkClipboard(true);
    window.dispatchEvent(new CustomEvent(NS2_NETWORK_CLIPBOARD_EVENT));
  }, [buildNetworkClipboardPayload]);

  const handlePasteNetwork = useCallback(() => {
    const cy = cyRef.current;
    const payload = ns2NetworkClipboard;
    if (!cy || !payload?.elements?.length) return;

    const copiedNodes = payload.elements.filter(el => el.group === 'nodes' && el.data?.id);
    const copiedEdges = payload.elements.filter(el => el.group === 'edges' && el.data?.id);
    if (copiedNodes.length === 0) return;

    const idMap = new Map();
    copiedNodes.forEach(node => idMap.set(String(node.data.id), nextId()));
    copiedEdges.forEach(edge => idMap.set(String(edge.data.id), nextId()));

    const pan = cy.pan();
    const zoom_ = cy.zoom();
    const targetCenter = {
      x: (cy.width() / 2 - pan.x) / zoom_,
      y: (cy.height() / 2 - pan.y) / zoom_,
    };
    const sourceCenter = payload.bounds || { cx: 0, cy: 0 };
    const offset = {
      x: targetCenter.x - (sourceCenter.cx || 0),
      y: targetCenter.y - (sourceCenter.cy || 0),
    };

    const addedIds = [];
    cy.batch(() => {
      copiedNodes.forEach(node => {
        const oldId = String(node.data.id);
        const newId = idMap.get(oldId);
        const effectiveType = normalizeEntityType(node.data?.type);
        const data = {
          ...clonePlain(node.data),
          id: newId,
          type: effectiveType,
          ...buildCyNodeCardData({
            type: effectiveType,
            name: node.data?.name,
            activity: node.data?.activity,
            assetType: node.data?.assetType,
            status: node.data?.status,
            capacityLimitationType:
              node.data?.capacityLimitationType
                ?? (node.data?.capacityUsageLimit ? 'percentage' : 'none'),
            capacityLimitationValue:
              node.data?.capacityLimitationValue ?? node.data?.capacityUsageLimit ?? '',
          }),
        };
        const entry = {
          group: 'nodes',
          data,
          position: {
            x: (node.position?.x || 0) + offset.x,
            y: (node.position?.y || 0) + offset.y,
          },
          classes: node.classes || '',
        };
        if (node.style) entry.style = clonePlain(node.style);
        try {
          cy.add(entry);
          addedIds.push(newId);
        } catch (_) {}
      });

      copiedEdges.forEach(edge => {
        const source = idMap.get(String(edge.data.source));
        const target = idMap.get(String(edge.data.target));
        if (!source || !target) return;
        const newId = idMap.get(String(edge.data.id));
        const data = {
          ...clonePlain(edge.data),
          id: newId,
          source,
          target,
        };
        try {
          cy.add({
            group: 'edges',
            data,
            classes: edge.classes || '',
          });
          addedIds.push(newId);
        } catch (_) {}
      });
    });

    cy.$(':selected').unselect();
    const added = cy.collection(addedIds.map(id => cy.getElementById(id)));
    added.select();
    if (added.length > 0) {
      cy.animate({ fit: { eles: added, padding: 90 }, duration: 250 });
    }
    updateSelection();
    setCanvasVersion(v => v + 1);
    recordCanvasHistory();
    syncBendEditingOverlay(0);
    syncBendEditingOverlay(80);
  }, [recordCanvasHistory, syncBendEditingOverlay, updateSelection]);

  copySelectionRef.current = () => handleCopyNetwork('selection');
  pasteNetworkRef.current = handlePasteNetwork;

  useEffect(() => {
    const handleClipboardShortcut = (event) => {
      const isShortcut = event.ctrlKey || event.metaKey;
      if (!isShortcut || event.altKey) return;

      const target = event.target;
      const isEditable = target?.closest?.('input, textarea, select, [contenteditable="true"], .ns2-modal, .ns2-modal-overlay');
      if (isEditable) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        handleCopyNetwork('selection');
      } else if (key === 'v') {
        event.preventDefault();
        handlePasteNetwork();
      }
    };

    window.addEventListener('keydown', handleClipboardShortcut);
    return () => window.removeEventListener('keydown', handleClipboardShortcut);
  }, [handleCopyNetwork, handlePasteNetwork]);

  useEffect(() => {
    const handleClipboardChange = () => {
      setHasNetworkClipboard(Boolean(ns2NetworkClipboard?.elements?.length));
    };
    window.addEventListener(NS2_NETWORK_CLIPBOARD_EVENT, handleClipboardChange);
    return () => window.removeEventListener(NS2_NETWORK_CLIPBOARD_EVENT, handleClipboardChange);
  }, []);

  // ── Cytoscape initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    // cytoscape-edge-editing appends a Konva overlay <div id="cy-node-edge-editing-stage…">
    // to the container and is NOT removed by cy.destroy(). On remount / HMR these
    // leak, stacking dead anchor overlays (with live mousedown listeners) on top —
    // clicking a stale anchor then crashes the plugin (syntax['none'].weight).
    // Clear any leftovers before creating a fresh instance.
    containerRef.current.querySelectorAll('[id^="cy-node-edge-editing-stage"]').forEach((el) => el.remove());
    const cy = cytoscape({
      container: containerRef.current,
      style: buildCyStyle(),
      // Default wheel sensitivity (1) for natural zoom with Windows desktop mice
      minZoom: 0.05,
      maxZoom: 5,
      layout: { name: 'preset' },
    });
    cyRef.current = cy;
    setCyMountVersion(v => v + 1);

    // Re-hydrate card icons once the toolbar SVGs finish loading (they're
    // fetched once at module load). Until then nodes show the inline
    // fallback markup; after the event fires they show the real toolbar
    // asset icon embedded as a base64 <image> inside the band SVG.
    const onToolbarIconsReady = () => {
      const liveCy = cyRef.current;
      if (liveCy && !liveCy.destroyed?.()) hydrateCyNodeCards(liveCy);
    };
    window.addEventListener(NS2_TOOLBAR_ICONS_READY_EVENT, onToolbarIconsReady);
    // If icons were already cached before this cy instance mounted (e.g.
    // user opened a second canvas tab), rehydrate now too.
    if (Object.keys(ENTITY_TOOLBAR_ICON_BASE64).length > 0) onToolbarIconsReady();

    const applyBendDataChange = (edge, updateFn) => {
      if (!edge || !edge.length) return;
      isHistoryRestoringRef.current = true;
      try {
        cy.batch(() => updateFn(edge));
      } finally {
        isHistoryRestoringRef.current = false;
      }
      recordCanvasHistory();
      edge.trigger('data');
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    };

    const updateBendClasses = (edge, bendCount) => {
      // Drop any stale absolute bend positions. The plugin's initAnchorPoints()
      // (run by the overlay sync) prefers bendPointPositions over weights/distances,
      // so a leftover array — the empty [] from a delete, or an out-of-date one from
      // an earlier node drag — would clobber the weights/distances we just set
      // (re-adding a deleted bend, or erasing a freshly added one and crashing the
      // plugin). Removing it makes weights/distances the single source of truth; the
      // plugin re-derives bendPointPositions on the next node drag.
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

    const removeNearestBendPoint = (event) => {
      const edge = event?.target || event?.cyTarget;
      if (!edge || !edge.isEdge?.()) return;
      const edgeEditingApi = typeof cy.edgeEditing === 'function' ? cy.edgeEditing('get') : null;
      const anchors = edgeEditingApi?.getAnchorsAsArray?.(edge) || [];
      const weights = [...(edge.data('cyedgebendeditingWeights') || [])];
      const distances = [...(edge.data('cyedgebendeditingDistances') || [])];
      if (anchors.length < 2 || weights.length === 0 || distances.length === 0) return;

      const clickPos = event.position || event.cyPosition || { x: anchors[0], y: anchors[1] };
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      for (let i = 0; i < anchors.length; i += 2) {
        const dx = anchors[i] - clickPos.x;
        const dy = anchors[i + 1] - clickPos.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i / 2;
        }
      }

      applyBendDataChange(edge, (line) => {
        const nextWeights = [...weights];
        const nextDistances = [...distances];
        nextWeights.splice(nearestIndex, 1);
        nextDistances.splice(nearestIndex, 1);
        line.data('cyedgebendeditingWeights', nextWeights);
        line.data('cyedgebendeditingDistances', nextDistances);
        updateBendClasses(line, Math.min(nextWeights.length, nextDistances.length));
      });
    };

    const removeAllBendPoints = (event) => {
      const edge = event?.target || event?.cyTarget;
      if (!edge || !edge.isEdge?.()) return;
      applyBendDataChange(edge, (line) => updateBendClasses(line, 0));
    };

    // Add a bend point on a pipe at the right-click position. This is the exact
    // mirror of removeNearestBendPoint: we splice a (weight, distance) pair
    // straight into the cytoscape-edge-editing weight/distance arrays via the
    // proven applyBendDataChange + updateBendClasses path. We deliberately do NOT
    // touch bendPointPositions or call the plugin's initAnchorPoints(), as driving
    // the plugin that way corrupts its internal anchor state and crashes later
    // node drags / canvas taps with syntax['none'].weight.
    //
    // The (weight, distance) pair is derived to match the plugin's own
    // getAnchorsAsArray() convention exactly: for unit vector u along source→target,
    // an anchor sits at midpt(weight) + distance * (-u.y, u.x). Inverting that gives
    // weight = projection fraction of the click along the line, and distance = the
    // signed perpendicular offset (so the sign matches the plugin with no guessing).
    const addBendPoint = (event) => {
      const edge = event?.target || event?.cyTarget;
      if (!edge || !edge.isEdge?.()) return;
      const clickPos = event.position || event.cyPosition;
      if (!clickPos) return;

      const src = edge.source().position();
      const tgt = edge.target().position();
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return; // zero-length edge — nothing to bend
      const len = Math.sqrt(len2);
      const ux = dx / len;
      const uy = dy / len;

      // weight = how far along the pipe (clamped just inside the endpoints).
      let weight = ((clickPos.x - src.x) * dx + (clickPos.y - src.y) * dy) / len2;
      weight = Math.min(0.95, Math.max(0.05, weight));
      const midX = src.x + weight * dx;
      const midY = src.y + weight * dy;
      let distance = -(clickPos.x - midX) * uy + (clickPos.y - midY) * ux;

      // Right-clicking lands the cursor essentially on the pipe, so the raw
      // perpendicular offset is ~0 and the kink would be invisible. Pop the new
      // bend out a clearly visible, grabbable amount (keeping the side the user
      // clicked toward) so it renders immediately and can then be dragged.
      const MIN_BEND_OFFSET = 40;
      if (Math.abs(distance) < MIN_BEND_OFFSET) {
        distance = (distance < 0 ? -1 : 1) * MIN_BEND_OFFSET;
      }

      const weights = [...(edge.data('cyedgebendeditingWeights') || [])];
      const distances = [...(edge.data('cyedgebendeditingDistances') || [])];

      // Insert so the polyline stays ordered source → … → target (by weight).
      let insertIndex = weights.length;
      for (let i = 0; i < weights.length; i += 1) {
        if (weight < weights[i]) { insertIndex = i; break; }
      }
      weights.splice(insertIndex, 0, weight);
      distances.splice(insertIndex, 0, distance);

      // Select the pipe first so applyBendDataChange's overlay sync draws the
      // draggable bend handle right away (it only renders for selected edges).
      cy.edges().not(edge).unselect();
      edge.select();

      // Set both arrays in ONE data() call. Writing them separately fires a
      // 'data' event after the first write while the lengths are mismatched
      // (weights has 1, distances still 0), which makes normalizeEdgeBendData
      // compute bendCount 0 and wipe both arrays. The object form sets both keys
      // before emitting a single event, so the count is always consistent.
      applyBendDataChange(edge, (line) => {
        line.data({
          cyedgebendeditingWeights: weights,
          cyedgebendeditingDistances: distances,
        });
        updateBendClasses(line, Math.min(weights.length, distances.length));
      });
    };

    // Begin reconnecting a pipe endpoint: remember which edge/end, then enter a
    // mode where the next node click becomes the new source/target.
    const beginReconnect = (endpoint) => (event) => {
      const edge = event?.target || event?.cyTarget;
      if (!edge || !edge.isEdge?.()) return;
      cy.edges().removeClass('reconnect-target');
      edge.addClass('reconnect-target');
      reconnectRef.current = { edgeId: edge.id(), endpoint };
      modeRef.current = 'reconnect-endpoint';
      setMode('reconnect-endpoint');
    };

    // ── Edge bend-point editing (cytoscape-edge-editing + context menus) ────
    cy.contextMenus({
      evtType: 'cxttap',
      menuItems: [
        {
          id: 'ns2-reconnect-source',
          content: 'Change Source',
          selector: 'edge',
          onClickFunction: beginReconnect('source'),
        },
        {
          id: 'ns2-reconnect-target',
          content: 'Change Destination',
          selector: 'edge',
          onClickFunction: beginReconnect('target'),
        },
        {
          id: 'ns2-copy-selection',
          content: 'Copy Selection',
          selector: 'node, edge',
          onClickFunction: () => copySelectionRef.current?.(),
        },
        {
          id: 'ns2-paste-network',
          content: 'Paste Network',
          selector: 'node, edge',
          onClickFunction: () => pasteNetworkRef.current?.(),
        },
        {
          id: 'ns2-add-bend-point',
          content: 'Add Bend Point',
          selector: 'edge',
          onClickFunction: addBendPoint,
        },
        {
          id: 'ns2-remove-nearest-bend-point',
          content: 'Remove Nearest Bend Point',
          selector: 'edge.edgebendediting-hasbendpoints',
          onClickFunction: removeNearestBendPoint,
        },
        {
          id: 'ns2-remove-all-bend-points',
          content: 'Remove All Bend Points',
          selector: 'edge.edgebendediting-hasbendpoints',
          onClickFunction: removeAllBendPoints,
        },
      ],
      menuItemClasses: [],
      contextMenuClasses: [],
    });
    cy.edgeEditing({
      undoable: false,
      // Make the cyedgebendediting weight/distance arrays the SINGLE source of
      // truth for bends. By default the plugin also keeps absolute
      // bendPointPositions and PREFERS them inside initAnchorPoints() — which it
      // runs on every overlay sync and node drag. In this app that second source
      // drifts out of sync with our weight/distance edits, which re-adds deleted
      // bends, erases freshly added ones, and ultimately leaves the plugin with a
      // type-'none' edge that crashes on the next interaction (syntax['none'].weight).
      // Returning null forces initAnchorPoints to always rebuild from the live
      // weights/distances; the no-op setter stops the plugin repopulating the array.
      bendPositionsFunction: () => null,
      bendPointPositionsSetterFunction: () => {},
      // Adding bends is handled by our own "Add Bend Point" context-menu item
      // (addBendPoint), which splices weight/distance pairs directly instead of
      // driving the plugin's initAnchorPoints() — the latter corrupts internal
      // anchor state. Disable the plugin's own add-bend menu item.
      addBendMenuItemTitle: false,
      removeBendMenuItemTitle: false,
      removeAllBendMenuItemTitle: false,
      // Disable control-point menu items (bezier handles) — bend only
      addControlMenuItemTitle: false,
      removeControlMenuItemTitle: false,
      removeAllControlMenuItemTitle: false,
      // Endpoint drag-reconnection is unreliable in this app's overlay setup;
      // source/target editing is done via the right-click context menu instead
      // (see "Change Source"/"Change Destination" items above).
      handleReconnectEdge: false,
      anchorShapeSizeFactor: 3,
      zIndex: 999,
      bendRemovalSensitivity: 8,
      anchorColor: '#6366f1',
      endPointColor: '#6366f1',
      enableCreateAnchorOnDrag: false,
    });

    const handleBendOverlayMouseMove = (event) => {
      // Throttle to one hit-test per animation frame. Raw mousemove fires far more
      // often than the screen refreshes, and each test walks the selected edges'
      // anchors — running it per frame keeps pointer tracking smooth without lag.
      bendOverlayLastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (bendOverlayMoveRafRef.current != null) return;
      bendOverlayMoveRafRef.current = window.requestAnimationFrame(() => {
        bendOverlayMoveRafRef.current = null;
        const pointer = bendOverlayLastPointerRef.current;
        if (pointer) updateBendOverlayPointerInteractivity(pointer.clientX, pointer.clientY);
      });
    };
    const handleBendOverlayMouseLeave = () => {
      if (!bendOverlayPointerLockedRef.current) {
        bendOverlayLastPointerRef.current = null;
        setBendOverlayPointerEvents(false);
      }
    };
    const handleBendOverlayMouseDown = (event) => {
      if (getSelectedBendHandleHit(event.clientX, event.clientY)) {
        bendOverlayPointerLockedRef.current = true;
        setBendOverlayPointerEvents(true);
      }
    };
    const handleBendOverlayMouseUp = (event) => {
      bendOverlayPointerLockedRef.current = false;
      // Force the edge-editing plugin's own mouse-up to run. The plugin sets
      // anchorTouched=true and cy.autoungrabify(true) the moment a bend handle is
      // pressed — including a *right click* on/near one — and only clears them in
      // its Konva-stage 'contentMouseup'. This app's overlay pointer-events toggling
      // can swallow that native event, leaving anchorTouched stuck true: the next
      // node drag then runs the plugin's moveAnchorOnDrag() on a now-bend-less
      // ('none'-type) edge and crashes with syntax['none'].weight, and nodes stay
      // ungrabbable. Re-firing contentMouseup invokes eMouseUp, which only does
      // anything while an anchor is actually held (the handler is bound on mouse-down
      // and unbound on mouse-up), so it's safe to fire on every release.
      const container = containerRef.current;
      if (container) {
        Konva.stages.forEach((stage) => {
          const stageContainer = typeof stage.container === 'function' ? stage.container() : null;
          if (stageContainer && container.contains(stageContainer)) {
            stage.fire('contentMouseup');
          }
        });
      }
      cyRef.current?.autoungrabify?.(false);
      updateBendOverlayPointerInteractivity(event.clientX, event.clientY);
    };

    containerRef.current.addEventListener('mousemove', handleBendOverlayMouseMove);
    containerRef.current.addEventListener('mouseleave', handleBendOverlayMouseLeave);
    window.addEventListener('mousedown', handleBendOverlayMouseDown, true);
    window.addEventListener('mouseup', handleBendOverlayMouseUp, true);

    // ── Canvas tap (background) ─────────────────────────────────────
    cy.on('tap', (evt) => {
      if (evt.target !== cy) return;
      const currentMode = modeRef.current;

      if (currentMode === 'trace') {
        cy.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim');
        setTraceInfo(null);
        return;
      }

      if (currentMode === 'place-note') {
        const cy_ = cyRef.current;
        if (cy_) {
          const noteId = nextId();
          const note = cy_.add({
            group: 'nodes',
            data: {
              id: noteId,
              type: 'note',
              displayLabel: '',
              name: '',
              noteHtml: '',
              abbr: '',
              noteFont: 'sans',
              noteFontSize: 'normal',
              noteBold: 'false',
              noteItalic: 'false',
              noteUnderline: 'false',
              boxWidth: 220,
              boxHeight: 100,
              noteTextMaxWidth: 196,
            },
            position: evt.position,
          });
          cy_.$(':selected').unselect();
          note.select();
          setSelectedEl({ ...note.data(), _group: 'node' });
          setSelectedCount(1);
          pendingFocusNoteIdRef.current = noteId;
          syncNoteOverlays();
        }
        modeRef.current = 'default';
        setMode('default');
        return;
      }

      if (currentMode === 'place-entity' || currentMode === 'place-asset') {
        const pos = evt.position;
        const pending = pendingPlacementRef.current;
        if (pending) {
          if (currentMode === 'place-asset' && (pending.assetData || pending.assets)) {
            if (Array.isArray(pending.assets) && pending.assets.length > 0) {
              placeAssetNodesBatchRef.current?.(pending.assets, pos);
            } else {
              // Place directly with all DB details — no modal. Duplicates (by id
              // or name) are refused inside placeAssetNode.
              placeAssetNodeRef.current?.(pending.assetData, pending.entityType, pos);
            }
          } else {
            setEntityModal({
              open: true, mode: 'new',
              form: { ...emptyEntityForm(pending.entityType || 'plant'), _position: pos },
              editId: null,
            });
          }
          pendingPlacementRef.current = null;
          setSelectedLibraryAssetIds([]);
          modeRef.current = 'default';
          setMode('default');
        }
        return;
      }

      // Click background while drawing → cancel
      if (currentMode === 'draw-pipe') {
        lineSourceRef.current = null;
        setLineSource(null);
        cy.nodes().removeClass('draw-source');
      }

      // Click background while picking a new endpoint → cancel
      if (currentMode === 'reconnect-endpoint') {
        cy.edges().removeClass('reconnect-target');
        reconnectRef.current = null;
        modeRef.current = 'default';
        setMode('default');
      }
    });

    // ── Node tap ────────────────────────────────────────────────────
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const currentMode = modeRef.current;

      if (currentMode === 'trace') {
        if (NS2_DELIVERY_TYPES.includes(node.data('type'))) {
          const preferredMode = simResults?.results ? 'delivered' : 'reachable';
          setTraceDisplayMode(preferredMode);
          traceFlowRef.current?.(node, preferredMode);
        } else {
          setTraceInfo({
            rootName: 'Select a handover point',
            rootType: 'delivery trace',
            upCount: 0,
            downCount: 0,
            sources: [],
            dests: [],
            ultimateSources: [],
            hasFlow: Boolean(simResults?.results),
            mode: simResults?.results ? 'delivered' : 'reachable',
            message: 'Trace Delivery is active. Click a handover point or city gate to see its upstream supply path.',
          });
        }
        return;
      }

      if (currentMode === 'reconnect-endpoint') {
        const pending = reconnectRef.current;
        const reset = () => {
          cy.edges().removeClass('reconnect-target');
          reconnectRef.current = null;
          modeRef.current = 'default';
          setMode('default');
        };
        if (!pending) { reset(); return; }
        const edge = cy.getElementById(pending.edgeId);
        if (!edge || !edge.length) { reset(); return; }
        const newId = node.id();
        // Validate: no self-loops, no annotation (note) targets.
        const otherEnd = pending.endpoint === 'source' ? edge.target().id() : edge.source().id();
        if (newId === otherEnd || node.data('type') === 'note') { reset(); return; }
        // No-op if dropping back on the same node.
        const currentEnd = pending.endpoint === 'source' ? edge.source().id() : edge.target().id();
        if (newId === currentEnd) { reset(); return; }
        // Rebuild the pipe as a fresh edge with the new endpoint, rather than
        // using edge.move(). edge.move() leaves the edge-editing plugin holding
        // stale anchor state that crashes on later bend edits/redraws. A clean
        // remove + re-add is exactly what insertEntityOnEdge / draw-pipe do, and
        // those edges support bend editing without issues. Bend geometry is
        // dropped so the rerouted pipe starts as a straight line.
        const newData = { ...edge.data() };
        newData[pending.endpoint] = newId;
        delete newData.cyedgebendeditingWeights;
        delete newData.cyedgebendeditingDistances;
        delete newData.bendPointPositions;
        const keepClasses = edge.classes().filter(c =>
          !c.startsWith('edgebendediting') && !c.startsWith('edgecontrolediting') && c !== 'reconnect-target');
        cy.$(':selected').unselect();
        edge.remove();
        const newEdge = cy.add({ group: 'edges', data: newData, classes: keepClasses });
        newEdge.select();
        updateSelection();
        reset();
        return;
      }

      if (currentMode === 'draw-pipe') {
        if (!lineSourceRef.current) {
          // First click: set source
          lineSourceRef.current = node.id();
          setLineSource(node.id());
          node.addClass('draw-source');
        } else {
          // Second click: complete edge
          const sourceId = lineSourceRef.current;
          if (sourceId !== node.id()) {
            const targetId = node.id();
            pendingEdgeRef.current = { source: sourceId, target: targetId };
            // Inherit line/branch memberships from pipes attached to the
            // SOURCE asset only — drawing *from* an asset extends whatever
            // line(s) that asset already participates in. Walking the target
            // node too would pull in unrelated branches that happen to share
            // a downstream tank (e.g., two separate branches both ending at
            // the same strategic storage). The user can still tick more
            // lines in the modal's checkbox list.
            const inheritedLineIds = (() => {
              const sourceNode = cy.getElementById(sourceId);
              if (!sourceNode?.length) return [];
              const incidentEdgeIds = new Set(sourceNode.connectedEdges().map(e => e.id()));
              if (!incidentEdgeIds.size) return [];
              return lineGroupsRef.current
                .filter(g => (g.type === 'line' || g.type === 'branch')
                  && (g.pipeIds || []).some(pid => incidentEdgeIds.has(pid)))
                .map(g => g.id);
            })();
            setPipeModal({
              open: true, mode: 'new',
              form: { ...emptyPipeForm(), lineGroupIds: inheritedLineIds },
              editId: null,
            });
          }
          lineSourceRef.current = null;
          setLineSource(null);
          cy.nodes().removeClass('draw-source');
          modeRef.current = 'default';
          setMode('default');
        }
        return;
      }

      updateSelection();
    });

    // ── Edge tap ────────────────────────────────────────────────────
    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const currentMode = modeRef.current;

      if (currentMode === 'insert-on-edge') {
        // Highlight and record the edge to split
        cy.edges().removeClass('insert-target');
        edge.addClass('insert-target');
        insertEdgeRef.current = edge.id();
        setInsertModal({ open: true });
        modeRef.current = 'default';
        setMode('default');
        return;
      }

      updateSelection();
    });

    cy.on('select unselect', updateSelection);
    cy.on('zoom', () => setZoom(+(cy.zoom().toFixed(2))));
    cy.on('pan zoom resize', syncNoteOverlays);
    cy.on('add remove data position select unselect', 'node', syncNoteOverlays);
    cy.on('drag', 'node', syncNoteOverlays);

    cy.on('grab', 'node[type="group-box"]', (evt) => {
      const group = evt.target;
      const bounds = group.boundingBox({ includeLabels: false, includeOverlays: false });
      const groupStart = group.position();
      const members = cy.nodes()
        .filter(node => {
          if (node.id() === group.id()) return false;
          if (['note', 'group-box'].includes(node.data('type'))) return false;
          const pos = node.position();
          return pos.x >= bounds.x1 && pos.x <= bounds.x2 && pos.y >= bounds.y1 && pos.y <= bounds.y2;
        })
        .map(node => ({
          id: node.id(),
          x: node.position('x'),
          y: node.position('y'),
        }));
      groupDragRef.current = {
        groupId: group.id(),
        startX: groupStart.x,
        startY: groupStart.y,
        members,
      };
    });

    cy.on('drag', 'node[type="group-box"]', (evt) => {
      const drag = groupDragRef.current;
      const group = evt.target;
      if (!drag || drag.groupId !== group.id()) return;
      const pos = group.position();
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      drag.members.forEach(member => {
        const node = cy.getElementById(member.id);
        if (node?.length) node.position({ x: member.x + dx, y: member.y + dy });
      });
    });

    cy.on('free', 'node[type="group-box"]', () => {
      groupDragRef.current = null;
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });

    // Keep canvasPointNodes in sync when nodes are added/removed
    const syncPointNodes = () => {
      const pts = cy.nodes().filter(n => n.data('type') === 'point').map(n => ({
        id: n.id(),
        name: n.data('name') || n.id(),
        region: n.data('region') || '',
      }));
      setCanvasPointNodes(pts);
    };
    cy.on('add remove', 'node', syncPointNodes);
    // Keep derived placed-asset sets live as nodes come and go
    cy.on('add remove', 'node', () => setCanvasVersion(v => v + 1));
    cy.on('add remove data', 'node, edge', recordCanvasHistory);
    // When an edge or node is removed (delete, undo, drag-redraw, etc.),
    // also purge it from every lineGroup so the isolation tab stays in
    // sync. We compare the previous and next id sets so we only update
    // state when a group actually changed. Skip during history restore so
    // re-applying a saved state doesn't trigger spurious updates.
    cy.on('remove', 'edge', (evt) => {
      if (isHistoryRestoringRef.current) return;
      const removedId = evt.target.id();
      if (!removedId) return;
      setLineGroups(previous => {
        let changed = false;
        const next = previous.map(group => {
          if (!Array.isArray(group.pipeIds) || !group.pipeIds.includes(removedId)) return group;
          changed = true;
          return { ...group, pipeIds: group.pipeIds.filter(id => id !== removedId) };
        });
        return changed ? next : previous;
      });
    });
    cy.on('dragfree', 'node', recordCanvasHistory);
    cy.on('cyedgeediting.changeAnchorPoints', () => {
      recordCanvasHistory();
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });
    cy.on('data', 'edge', (evt) => {
      const edge = evt.target;
      if (!edge?.isEdge?.()) return;
      normalizeEdgeBendData(edge);
      syncBendEditingOverlay(0);
    });
    cy.on('bendPointMovement', () => {
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });
    cy.on('select', 'edge', () => {
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });
    cy.on('unselect remove', 'edge', () => {
      syncBendEditingOverlay(0);
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) syncBendEditingOverlay(0);
    });
    cy.on('dragfree', 'node', () => {
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });

    // ── Grid: update CSS vars on pan / zoom ─────────────────────────────
    const updateGrid = () => {
      const el = gridWrapRef.current;
      if (!el) return;
      const p = cy.pan();
      const z = cy.zoom();
      el.style.setProperty('--grid-size', `${40 * z}px`);
      el.style.setProperty('--grid-offset-x', `${p.x % (40 * z)}px`);
      el.style.setProperty('--grid-offset-y', `${p.y % (40 * z)}px`);
    };
    cy.on('pan zoom', updateGrid);
    updateGrid();
    syncNoteOverlays();
    resetCanvasHistory(serializeCanvasHistorySnapshot(cy));

    return () => {
      window.removeEventListener(NS2_TOOLBAR_ICONS_READY_EVENT, onToolbarIconsReady);
      saveCanvasSnapshotToInstance(activeInstanceIdRef.current);
      containerRef.current?.removeEventListener('mousemove', handleBendOverlayMouseMove);
      containerRef.current?.removeEventListener('mouseleave', handleBendOverlayMouseLeave);
      window.removeEventListener('mousedown', handleBendOverlayMouseDown, true);
      window.removeEventListener('mouseup', handleBendOverlayMouseUp, true);
      const container = cy.container();
      cy.destroy();
      // Remove the edge-editing Konva overlay cy.destroy() leaves behind, so it
      // can't linger as a dead anchor layer after unmount / HMR.
      container?.querySelectorAll('[id^="cy-node-edge-editing-stage"]').forEach((el) => el.remove());
      cyRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    saveCanvasSnapshotToInstance,
    recordCanvasHistory,
    resetCanvasHistory,
    syncBendEditingOverlay,
    normalizeEdgeBendData,
    updateBendOverlayPointerInteractivity,
    getSelectedBendHandleHit,
    setBendOverlayPointerEvents,
  ]);

  // ── Label toggle effect ──────────────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!showLabels) {
      cy.nodes().addClass('hide-labels');
      cy.edges().addClass('hide-labels');
    } else {
      cy.nodes().removeClass('hide-labels');
      cy.edges().removeClass('hide-labels');
    }
  }, [showLabels]);

  // ── Resize Cytoscape when side panels open/close ─────────────────────────────
  // useLayoutEffect fires synchronously after DOM mutation and before the browser
  // paints — so cy.resize() re-measures the container with the correct dimensions
  // before Cytoscape can ever render the ":( " null-renderer placeholder.
  useLayoutEffect(() => {
    syncBendEditingOverlay(0);
    syncBendEditingOverlay(80);
    syncBendEditingOverlay(260);
  }, [showLibrary, showRightPanel, syncBendEditingOverlay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      syncBendEditingOverlay(0);
      syncBendEditingOverlay(80);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncBendEditingOverlay]);

  // Clean up animation interval on unmount
  useEffect(() => {
    return () => {
      if (dashIntervalRef.current) clearInterval(dashIntervalRef.current);
      bendOverlaySyncTimersRef.current.forEach(timer => window.clearTimeout(timer));
      bendOverlaySyncTimersRef.current = [];
      bendOverlaySyncPendingRef.current.clear();
      if (bendOverlayMoveRafRef.current != null) {
        window.cancelAnimationFrame(bendOverlayMoveRafRef.current);
        bendOverlayMoveRafRef.current = null;
      }
    };
  }, []);

  // Load demand scenarios on mount
  useEffect(() => {
    apiClient.get('/api/simulations/demand-scenarios/')
      .then(r => setDemandScenarios(r.data || []))
      .catch(() => setDemandScenarios([]));
  }, []);

  // Sync canvas delivery points when config tab opens or mode changes to manual
  const syncCanvasPointNodes = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const pts = cy.nodes().filter(n => n.data('type') === 'point').map(n => ({
      id: n.id(),
      name: n.data('name') || n.id(),
      region: n.data('region') || '',
    }));
    setCanvasPointNodes(pts);
  }, []);

  useEffect(() => {
    if (rightPanelTab === 'config') syncCanvasPointNodes();
  }, [rightPanelTab, syncCanvasPointNodes]);

  // ── Demand-coverage flagging ─────────────────────────────────────────────────
  // Recompute whenever the scenario, demand mode, manual demands, or the set of
  // delivery points changes. Flags any delivery point that the selected scenario
  // (or manual entry) leaves with zero demand, and highlights it on the canvas.
  const recomputeDemandCoverage = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) { setDemandCoverage({ mode: null, unmatched: [] }); return; }
    const dnodes = cy.nodes()
      .filter(n => NS2_DELIVERY_TYPES.includes(n.data('type')))
      .map(n => ({
        id: n.id(),
        name: n.data('name') || n.id(),
        matchName: n.data('displayLabel') || n.data('name') || n.id(),
        region: n.data('region') || '',
        governorate: n.data('governorate') || '',
      }));

    let result;
    if (demandInputMode === 'manual') {
      const un = dnodes.filter(nd => {
        const v = manualDemands[nd.id];
        return v === undefined || v === '' || !(Number(v) > 0);
      }).map(nd => ({ id: nd.id, name: nd.name, region: nd.region }));
      result = { mode: 'manual', unmatched: un };
    } else if (selectedDemandScenario?.data) {
      result = ns2ComputeDemandCoverage(selectedDemandScenario.data, dnodes);
    } else {
      // No scenario selected → node capacities are used, every point gets demand.
      result = { mode: 'none', unmatched: [] };
    }
    setDemandCoverage(result);

    // Canvas highlight.
    const flagged = new Set(result.unmatched.map(u => u.id));
    cy.nodes().removeClass('demand-flagged');
    flagged.forEach(id => { const el = cy.getElementById(id); if (el && el.length) el.addClass('demand-flagged'); });
  }, [selectedDemandScenario, demandInputMode, manualDemands]);

  useEffect(() => {
    recomputeDemandCoverage();
  }, [recomputeDemandCoverage, canvasPointNodes]);

  // ── Asset library loading ────────────────────────────────────────────────────
  const loadLibraryAssets = useCallback(async () => {
    if (libraryAssets.length > 0) return; // already loaded
    setLibraryLoading(true);
    try {
      const resp = await apiClient.get('/api/assets');
      const raw = resp.data || [];
      const categorized = raw
        .map(asset => {
          const entityType = categorizeAsset(asset);
          if (!entityType) return null;
          return {
            ...asset,
            status: normalizeAssetStatus(asset.status),
            _entityType: entityType,
            _name: asset.name || asset.asset_name_ar || `Asset ${asset.id}`,
          };
        })
        .filter(Boolean);
      setLibraryAssets(categorized);
    } catch (e) {
      console.error('Failed to load assets', e);
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryAssets.length]);

  useEffect(() => {
    if (showLibrary && libraryAssets.length === 0) {
      loadLibraryAssets();
    }
  }, [showLibrary, libraryAssets.length, loadLibraryAssets]);

  // ── Canvas actions ───────────────────────────────────────────────────────────
  const handleFitToScreen = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.invalidateDimensions();
    requestAnimationFrame(() => cy.fit(undefined, 50));
  }, []);

  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 0.83, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  // Bridge with the global StatusBar zoom controls (bottom bar).
  // - Listens for `canvasZoom` events the bar dispatches on in/out/reset.
  // - Broadcasts the current zoom % via `canvasZoomLevel` so the bar's
  //   percentage display stays in sync with the cy canvas.
  useEffect(() => {
    const onCanvasZoom = (event) => {
      const action = event?.detail?.action;
      if (action === 'in') handleZoomIn();
      else if (action === 'out') handleZoomOut();
      else if (action === 'reset') handleFitToScreen();
    };
    window.addEventListener('canvasZoom', onCanvasZoom);
    return () => window.removeEventListener('canvasZoom', onCanvasZoom);
  }, [handleZoomIn, handleZoomOut, handleFitToScreen]);

  // Push the current zoom percentage out to the StatusBar whenever it changes.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('canvasZoomLevel', {
      detail: { percent: zoom * 100 },
    }));
  }, [zoom]);

  const handleDeleteSelected = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(':selected').remove();
    setSelectedEl(null);
  }, []);

  const handleStartPlaceEntity = useCallback((entityType) => {
    pendingPlacementRef.current = { entityType };
    changeMode('place-entity');
  }, [changeMode]);

  // ── Export canvas ─────────────────────────────────────────────────────────────
  const handleExport = useCallback((format = 'json') => {
    commitActiveNoteEditorRef.current?.();
    const cy = cyRef.current;
    if (!cy || (cy.nodes().length === 0 && cy.edges().length === 0)) {
      alert('There is nothing on the canvas to export yet.');
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        zoom: cy.zoom(),
        pan: cy.pan(),
        nodes: cy.nodes().jsons().map(n => ({
          data: {
            ...stripCyRuntimeCardData(n.data),
            status: normalizeAssetStatus(n.data?.status),
          },
          position: n.position,
        })),
        edges: cy.edges().jsons().map(e => ({ data: e.data })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `network_simulation_${dateStr}.json`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    } else if (format === 'csv') {
      let csv = 'id,type,name,status,capacity,region,activity,assetType,commissioningDate\n';
      cy.nodes().forEach(n => {
        const d = n.data();
        csv += `${d.id},${d.type || ''},"${(d.name || '').replace(/"/g, '""')}",${d.status || ''},${d.capacity || ''},${d.region || ''},${d.activity || ''},${d.assetType || ''},${d.commissioningDate || ''}\n`;
      });
      csv += '\nid,source,target,name,capacity,pipelineLength,pipelineDiameter,pipelineMaterial\n';
      cy.edges().forEach(e => {
        const d = e.data();
        csv += `${d.id},${d.source || ''},${d.target || ''},"${(d.name || '').replace(/"/g, '""')}",${d.capacity || ''},${d.pipelineLength || ''},${d.pipelineDiameter || ''},${d.pipelineMaterial || ''}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `network_simulation_${dateStr}.csv`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    }
  }, []);

  // ── Import canvas ─────────────────────────────────────────────────────────────
  const handleImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        let nodes, edges, zoom, pan;

        if (Array.isArray(data.entities) && Array.isArray(data.lines)) {
          // ── Convert old SimulationPage format → Sim 2 Cytoscape format ──────
          nodes = data.entities.map(entity => {
            const type = normalizeEntityType(entity.type || 'plant');
            const abbr = ENTITY_TYPE_ABBREVIATIONS[type] || '';
            const name = entity.name || '';
            const rawStatus =
              entity.operationalStatus ||
              entity.originalAsset?.status ||
              (entity.isActive !== false ? 'operational' : 'inactive');
            const legacyPct = entity.capacityLimitPercentage;
            return {
              data: {
                id: entity.id,
                type,
                name,
                abbr,
                displayLabel: type === 'node' ? '' : (name ? `${abbr}\n${name}` : abbr),
                ...buildCyNodeCardData({
                  type,
                  name,
                  activity: entity.activity || '',
                  assetType: entity.assetType || '',
                  status: rawStatus,
                  capacityLimitationType: legacyPct ? 'percentage' : 'none',
                  capacityLimitationValue: legacyPct ?? '',
                }),
                capacityLimitationType: legacyPct ? 'percentage' : 'none',
                capacityLimitationValue: legacyPct ?? '',
                status: normalizeAssetStatus(rawStatus),
                capacity: entity.capacity ?? '',
                capacityUsageLimit: entity.capacityLimitPercentage ?? '',
                commissioningDate: entity.commissioningDate || '',
                decommissioningDate: entity.decommissioningDate || '',
                active: entity.isActive !== false,
                activity: entity.activity || '',
                assetType: entity.assetType || '',
                region: entity.region || '',
                entityTypeCategory: entity.entityType || entity.entity_type || '',
                plantType: entity.plantType || '',
                technology: entity.technology || '',
                waterSource: entity.waterSource || '',
                variableOM: entity.variable_om_sar_m3 ?? '',
                assetId: entity.originalAsset?.id || null,
                // Pump-station composition: array of { id, name, role,
                // capacity, isActive } persisted with the network snapshot.
                pumps: Array.isArray(entity.pumps) ? entity.pumps : [],
              },
              position: {
                x: entity.canvasX ?? 0,
                y: entity.canvasY ?? 0,
              },
            };
          });
          edges = data.lines.map(line => ({
            data: {
              id: line.id,
              source: line.fromEntityId,
              target: line.toEntityId,
              name: line.name || '',
              displayLabel: line.name || '',
              capacity: line.capacity ?? '',
              commissioningDate: line.commissioningDate || '',
              decommissioningDate: line.decommissioningDate || '',
              active: line.isActive !== false,
              pipelineLength: line.pipelineLength ?? '',
              pipelineDiameter: line.pipelineDiameter ?? '',
              pipelineMaterial: line.pipelineMaterial || '',
              designCapacity: line.designCapacity ?? '',
              maximumCapacity: line.maximumCapacity ?? '',
              infraSource: line.source || '',
              bidirectional: line.bidirectional ? 'true' : 'false',
              hasCapacityLimit: 'false',
              capacityLimitationType: 'none',
              capacityLimitationValue: '',
            },
          }));
          zoom = data.meta?.zoom ?? 1;
          pan = data.meta?.pan ?? { x: 0, y: 0 };
        } else if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          // ── Native Sim 2 format ───────────────────────────────────────────────
          nodes = data.nodes.map(node => {
            const effectiveType = normalizeEntityType(node.data?.type);
            return {
              ...node,
              data: {
                ...node.data,
                type: effectiveType,
                status: normalizeAssetStatus(node.data?.status),
                ...buildCyNodeCardData({
                  type: effectiveType,
                  name: node.data?.name,
                  activity: node.data?.activity,
                  assetType: node.data?.assetType,
                  status: node.data?.status,
                  capacityLimitationType:
                    node.data?.capacityLimitationType
                      ?? (node.data?.capacityUsageLimit ? 'percentage' : 'none'),
                  capacityLimitationValue:
                    node.data?.capacityLimitationValue ?? node.data?.capacityUsageLimit ?? '',
                }),
              },
            };
          });
          edges = data.edges;
          zoom = data.zoom;
          pan = data.pan;
        } else {
          throw new Error('File must contain "nodes" and "edges" arrays, or "entities" and "lines" arrays.');
        }

        const cy = cyRef.current;
        if (!cy) return;
        cy.elements().remove();
        cy.batch(() => {
          nodes.forEach(n => {
            if (n.data?.id) cy.add({ group: 'nodes', data: n.data, position: n.position || { x: 100, y: 100 } });
          });
          edges.forEach(eg => {
            if (eg.data?.id && eg.data?.source && eg.data?.target) {
              try { cy.add({ group: 'edges', data: eg.data }); } catch (_) {}
            }
          });
        });
        if (zoom) cy.zoom(zoom);
        if (pan) cy.pan(pan);
        requestAnimationFrame(() => cy.fit(undefined, 50));
        setSelectedEl(null);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  // ── Entity modal submit ──────────────────────────────────────────────────────
  const handleEntitySubmit = useCallback(() => {
    const { mode: mMode, form, editId } = entityModal;
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }

    if (mMode === 'edit' && editId) {
      // Update existing node
      const cy = cyRef.current;
      const node = cy?.getElementById(editId);
      if (node) {
        if (form.type === 'note' || form.type === 'group-box') {
          const boxWidth = Number(form.boxWidth || node.data('boxWidth') || (form.type === 'note' ? 220 : 240));
          const boxHeight = Number(form.boxHeight || node.data('boxHeight') || (form.type === 'note' ? 100 : 160));
          node.data({
            name: form.name,
            displayLabel: form.name,
            boxWidth,
            boxHeight,
            ...(form.type === 'note' ? { noteTextMaxWidth: Math.max(80, boxWidth - 24) } : {}),
            noteFont: form.noteFont || node.data('noteFont') || 'sans',
            noteFontSize: form.noteFontSize || node.data('noteFontSize') || 'normal',
            noteBold: form.noteBold ?? node.data('noteBold') ?? 'false',
            noteItalic: form.noteItalic ?? node.data('noteItalic') ?? 'false',
            noteUnderline: form.noteUnderline ?? node.data('noteUnderline') ?? 'false',
          });
        } else {
          node.data({
            name: form.name,
            abbr: ENTITY_TYPE_ABBREVIATIONS[form.type] || '',
            displayLabel: buildDisplayLabel(form.type, form.name, showLabels),
            ...buildCyNodeCardData(form),
            status: normalizeAssetStatus(form.status),
            capacity: form.capacity,
            capacityLimitationType: form.capacityLimitationType || 'none',
            capacityLimitationValue: form.capacityLimitationValue || '',
            // Junctions don't keep dates even if stale form state lingers.
            commissioningDate: form.type === 'node' ? '' : (form.commissioningDate || ''),
            decommissioningDate: form.type === 'node' ? '' : (form.decommissioningDate || ''),
            active: form.active,
            activity: form.activity,
            assetType: form.assetType,
            region: form.region,
            entityTypeCategory: form.entityTypeCategory,
            plantType: form.plantType,
            technology: form.technology,
            waterSource: form.waterSource,
            variableOM: form.variableOM,
            pumps: form.type === 'pump' ? normalizePumpList(form.pumps) : [],
          });
        }
        setSelectedEl({ ...node.data(), _group: 'node' });
      }
    } else if (mMode === 'insert-on-edge' && insertEdgeRef.current) {
      // Insert entity by splitting the edge (shared logic)
      insertEntityOnEdge(form, insertEdgeRef.current);
    } else {
      // New entity
      const pos = form._position || null;
      addEntityNode(form, pos);
    }

    setEntityModal(prev => ({ ...prev, open: false }));
  }, [entityModal, addEntityNode, insertEntityOnEdge, buildDisplayLabel, showLabels]);

  // ── Pipe modal submit ────────────────────────────────────────────────────────
  const applyPipeHierarchy = useCallback((pipeId, form) => {
    if (!pipeId) return {};
    const generatedId = (kind) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let transmissionSystemId = form.transmissionSystemId || '';
    let parentLineId = form.parentLineId || '';
    const isBranch = Boolean(form.isBranch);
    const branchName = isBranch ? (form.branchName?.trim() || 'Unnamed Branch') : '';
    const newSystemName = form.newTransmissionSystemName?.trim();
    const newLineName = form.newLineName?.trim();
    if (newSystemName) transmissionSystemId = generatedId('transmission-system');

    // The form now exposes a checkbox list of line memberships; legacy
    // single-line forms (and the new-from-asset / draw-pipe flows) still set
    // `lineGroupId`, so accept either shape.
    const selectedLineIds = Array.isArray(form.lineGroupIds)
      ? [...form.lineGroupIds]
      : (form.lineGroupId ? [form.lineGroupId] : []);

    // A branch creates its own dedicated group (the branchName/parentLine
    // pair); push that as a new id so it joins the membership set.
    let newBranchId = '';
    if (isBranch) {
      newBranchId = generatedId('line-branch');
      parentLineId = parentLineId || selectedLineIds[0] || '';
      selectedLineIds.push(newBranchId);
    }
    // "New Transmission Line" name → also creates a new line and adds the
    // pipe to it. This is independent of the multi-select checkboxes so the
    // user can add a brand-new line on the same save.
    let newLineId = '';
    if (newLineName && !isBranch) {
      newLineId = generatedId('line');
      selectedLineIds.push(newLineId);
    }
    const desiredLineIds = new Set(selectedLineIds);

    setLineGroups(previous => {
      const next = previous.map(group => ({ ...group, pipeIds: [...(group.pipeIds || [])], memberGroupIds: [...(group.memberGroupIds || [])] }));
      let system = next.find(group => group.id === transmissionSystemId);
      if (transmissionSystemId && !system) {
        system = { id: transmissionSystemId, name: newSystemName || 'Transmission System', type: 'transmission-system', pipeIds: [], memberGroupIds: [] };
        next.push(system);
      }
      // Create any brand-new line/branch group requested by this submission.
      if (newBranchId) {
        next.push({ id: newBranchId, name: branchName, type: 'branch', parentId: parentLineId || null, pipeIds: [], memberGroupIds: [] });
      }
      if (newLineId) {
        next.push({ id: newLineId, name: newLineName, type: 'line', parentId: null, pipeIds: [], memberGroupIds: [] });
      }
      // Sync this pipe's membership: add to every line in desiredLineIds,
      // remove from every line not in it (only for line/branch groups —
      // leave non-line groups untouched).
      next.forEach(group => {
        if (group.type !== 'line' && group.type !== 'branch') return;
        const isMember = group.pipeIds.includes(pipeId);
        const shouldBe = desiredLineIds.has(group.id);
        if (shouldBe && !isMember) group.pipeIds.push(pipeId);
        else if (!shouldBe && isMember) group.pipeIds = group.pipeIds.filter(id => id !== pipeId);
      });
      // Make sure the chosen transmission system contains every selected line.
      if (system) {
        desiredLineIds.forEach(lineId => {
          const grp = next.find(g => g.id === lineId);
          if (grp?.type === 'line' && !system.memberGroupIds.includes(lineId)) system.memberGroupIds.push(lineId);
        });
        if (isBranch && parentLineId && !system.memberGroupIds.includes(parentLineId)) system.memberGroupIds.push(parentLineId);
      }
      return next;
    });
    return {
      transmissionSystemId,
      // Back-compat: also stamp `lineGroupId` with the first selected id so
      // any legacy reader that still expects a single value keeps working.
      lineGroupId: [...desiredLineIds][0] || '',
      lineGroupIds: [...desiredLineIds],
      parentLineId,
      branchName,
    };
  }, []);

  const handlePipeSubmit = useCallback(() => {
    const { mode: mMode, form, editId } = pipeModal;
    if (!form.name.trim()) {
      alert('Pipe name is required');
      return;
    }
    if (form.isBranch && !form.parentLineId) {
      alert('Select the parent line for this branch.');
      return;
    }

    if (mMode === 'edit' && editId) {
      const cy = cyRef.current;
      const edge = cy?.getElementById(editId);
      if (edge) {
        const hierarchy = applyPipeHierarchy(editId, { ...form, _isEdit: true });
        edge.data({
          name: form.name,
          displayLabel: form.name,
          capacity: form.capacity,
          commissioningDate: form.commissioningDate,
          decommissioningDate: form.decommissioningDate,
          active: form.active,
          pipelineLength: form.pipelineLength,
          pipelineDiameter: form.pipelineDiameter,
          pipelineMaterial: form.pipelineMaterial,
          designCapacity: form.designCapacity,
          maximumCapacity: form.maximumCapacity,
          infraSource: form.infraSource,
          bidirectional: form.bidirectional ? 'true' : 'false',
          hasCapacityLimit: (form.capacityLimitationType && form.capacityLimitationType !== 'none') ? 'true' : 'false',
          capacityLimitationType: form.capacityLimitationType,
          capacityLimitationValue: form.capacityLimitationValue,
          ...hierarchy,
          isBranch: Boolean(form.isBranch),
        });
        setSelectedEl({ ...edge.data(), _group: 'edge' });
      }
    } else {
      const pending = pendingEdgeRef.current;
      if (pending) {
        const pipeId = addPipeEdge(pending.source, pending.target, form);
        const hierarchy = applyPipeHierarchy(pipeId, form);
        cyRef.current?.getElementById(pipeId)?.data(hierarchy);
        pendingEdgeRef.current = null;
      }
    }

    setPipeModal(prev => ({ ...prev, open: false }));
  }, [pipeModal, addPipeEdge, applyPipeHierarchy]);

  // ── Library asset placement ──────────────────────────────────────────────────
  const getLibraryAssetSelection = useCallback((anchorAsset = null) => {
    const selected = libraryAssets.filter(item => selectedLibraryAssetIds.includes(String(item.id)));
    if (!anchorAsset) return selected;
    if (selected.some(item => String(item.id) === String(anchorAsset.id))) return selected;
    return [anchorAsset];
  }, [libraryAssets, selectedLibraryAssetIds]);

  const handleToggleLibraryAssetSelection = useCallback((asset) => {
    if (!asset) return;
    const id = String(asset.id);
    setSelectedLibraryAssetIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  }, []);

  const handleLibraryAssetClick = useCallback((asset) => {
    const wasInsertMode = pendingPlacementRef.current?._insertMode === true;
    const selectedAssets = wasInsertMode ? [asset] : getLibraryAssetSelection(asset);

    // Refuse duplicates (by id or name) up front, regardless of placement mode.
    const duplicateAsset = selectedAssets.find(item => findExistingAssetNode(item));
    const existing = duplicateAsset && selectedAssets.length === 1 ? findExistingAssetNode(duplicateAsset) : null;
    if (existing) {
      const cy = cyRef.current;
      cy?.$(':selected').unselect();
      existing.select();
      cy?.animate({ center: { eles: existing }, duration: 250 });
      setSelectedEl({ ...existing.data(), _group: 'node' });
      setShowLibrary(false);
      changeMode('default');
      alert(`"${asset._name || asset.name || 'This asset'}" is already on the canvas — duplicates aren't allowed.`);
      return;
    }

    if (wasInsertMode) {
      // Coming from "Insert on pipe → Select from Library": split the pipe at
      // its midpoint and drop the asset there DIRECTLY — fully populated from
      // the DB record (specifications included), no confirmation form.
      const edgeId = insertEdgeRef.current;
      const assetWithCapacity = ensureAssetCapacityForPlacement(asset, asset._entityType);
      if (!assetWithCapacity) {
        setShowLibrary(false);
        changeMode('default');
        return;
      }
      setShowLibrary(false);
      changeMode('default');
      const newId = insertEntityOnEdge(buildAssetEntityForm(assetWithCapacity, asset._entityType), edgeId);
      if (newId) {
        const cy = cyRef.current;
        cy.$(':selected').unselect();
        const node = cy.getElementById(newId);
        node.select();
        setSelectedEl({ ...node.data(), _group: 'node' });
      }
    } else {
      pendingPlacementRef.current = selectedAssets.length > 1
        ? { assets: selectedAssets }
        : { assetData: asset, entityType: asset._entityType };
      changeMode('place-asset');
      setShowLibrary(false);
    }
  }, [changeMode, findExistingAssetNode, getLibraryAssetSelection, insertEntityOnEdge]);

  const handleLibraryDragStart = useCallback((e, asset) => {
    e.dataTransfer.effectAllowed = 'copy';
    const selectedAssets = getLibraryAssetSelection(asset);
    e.dataTransfer.setData('text/plain', selectedAssets.map(item => item.id).join(','));
    pendingPlacementRef.current = selectedAssets.length > 1
      ? { assets: selectedAssets }
      : { assetData: asset, entityType: asset._entityType };
  }, [getLibraryAssetSelection]);

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    const pending = pendingPlacementRef.current;
    if (!pending || (!pending.assetData && !pending.assets)) return;
    const cy = cyRef.current;
    if (!cy) return;
    const rect = containerRef.current.getBoundingClientRect();
    const renderedX = e.clientX - rect.left;
    const renderedY = e.clientY - rect.top;
    const pan = cy.pan();
    const zoom_ = cy.zoom();
    const modelX = (renderedX - pan.x) / zoom_;
    const modelY = (renderedY - pan.y) / zoom_;

    // Place directly with all DB details at the drop point — no modal.
    // Duplicates (by id or name) are refused inside placeAssetNode.
    if (Array.isArray(pending.assets) && pending.assets.length > 0) {
      placeAssetNodesBatch(pending.assets, { x: modelX, y: modelY });
    } else {
      placeAssetNode(pending.assetData, pending.entityType, { x: modelX, y: modelY });
    }
    pendingPlacementRef.current = null;
    setSelectedLibraryAssetIds([]);
    changeMode('default');
  }, [placeAssetNode, placeAssetNodesBatch, changeMode]);

  // ── Alignment & Distribution ──────────────────────────────────────────────────
  const handleAlignLeft = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const leftEdge = Math.min(...nodes.map(n => n.position('x') - n.outerWidth() / 2));
    nodes.forEach(n => n.position('x', leftEdge + n.outerWidth() / 2));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleAlignCenterH = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const mean = nodes.map(n => n.position('x')).reduce((a, b) => a + b, 0) / nodes.length;
    nodes.forEach(n => n.position('x', mean));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleAlignRight = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const rightEdge = Math.max(...nodes.map(n => n.position('x') + n.outerWidth() / 2));
    nodes.forEach(n => n.position('x', rightEdge - n.outerWidth() / 2));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleAlignTop = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const topEdge = Math.min(...nodes.map(n => n.position('y') - n.outerHeight() / 2));
    nodes.forEach(n => n.position('y', topEdge + n.outerHeight() / 2));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleAlignMiddleV = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const mean = nodes.map(n => n.position('y')).reduce((a, b) => a + b, 0) / nodes.length;
    nodes.forEach(n => n.position('y', mean));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleAlignBottom = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]');
    if (nodes.length < 2) return;
    const bottomEdge = Math.max(...nodes.map(n => n.position('y') + n.outerHeight() / 2));
    nodes.forEach(n => n.position('y', bottomEdge - n.outerHeight() / 2));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleDistributeH = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]').toArray();
    if (nodes.length < 3) return;
    nodes.sort((a, b) => a.position('x') - b.position('x'));
    const minX = nodes[0].position('x');
    const maxX = nodes[nodes.length - 1].position('x');
    const step = (maxX - minX) / (nodes.length - 1);
    nodes.forEach((n, i) => n.position('x', minX + step * i));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  const handleDistributeV = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]').toArray();
    if (nodes.length < 3) return;
    nodes.sort((a, b) => a.position('y') - b.position('y'));
    const minY = nodes[0].position('y');
    const maxY = nodes[nodes.length - 1].position('y');
    const step = (maxY - minY) / (nodes.length - 1);
    nodes.forEach((n, i) => n.position('y', minY + step * i));
    recordCanvasHistory();
  }, [recordCanvasHistory]);

  // ── Selection helpers ──────────────────────────────────────────────────────────
  const handleSelectAll = useCallback(() => {
    cyRef.current?.elements().select();
  }, []);

  const handleZoomToSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(':selected');
    cy.fit(sel.length > 0 ? sel : undefined, 60);
  }, []);

  const focusCanvasElement = useCallback((id, options = {}) => {
    const cy = cyRef.current;
    if (!cy || !id) return false;
    const el = cy.getElementById(id);
    if (!el || !el.length) return false;
    if (options.select !== false) {
      cy.$(':selected').unselect();
      el.select();
      updateSelection();
    }
    cy.animate({ center: { eles: el }, zoom: options.zoom || 1.15 }, { duration: 260 });
    return true;
  }, [updateSelection]);

  const validateCurrentNetwork = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return [];

    const issues = [];
    const addIssue = (severity, type, title, detail, elementId = null, group = null) => {
      issues.push({ id: `${type}-${elementId || issues.length}-${issues.length}`, severity, type, title, detail, elementId, group });
    };

    const infrastructureNodes = cy.nodes().filter(n => !['note', 'group-box'].includes(n.data('type'))).toArray();
    const pipes = cy.edges().toArray();

    if (infrastructureNodes.length === 0 && pipes.length === 0) {
      addIssue('info', 'empty-canvas', 'Canvas is empty', 'Add assets or place assets from the library before validating.');
    }

    const capacityNodeTypes = new Set(['plant', 'tank', 'point', 'stp', 'filling-station', 'distribution-point']);
    infrastructureNodes.forEach(node => {
      const d = node.data();
      const type = d.type;
      const name = String(d.name || '').trim();
      const label = name || d.id;

      if (!name) addIssue('warning', 'missing-name', 'Asset is missing a name', `Unnamed ${ENTITY_TYPE_LABELS[type] || type || 'asset'} should be named for traceability.`, d.id, 'node');
      if (node.connectedEdges().length === 0 && type !== 'node') addIssue('warning', 'disconnected-node', 'Asset is disconnected', `${label} is not connected to any pipe.`, d.id, 'node');
      if (capacityNodeTypes.has(type) && Number(d.capacity || 0) <= 0) addIssue('warning', 'missing-capacity', 'Asset capacity is missing', `${label} has no positive capacity.`, d.id, 'node');
      if ((d.active === false || d.active === 'false' || normalizeAssetStatus(d.status) === 'inactive') && node.connectedEdges().length > 0) {
        addIssue('warning', 'inactive-connected', 'Inactive asset is connected', `${label} is inactive but still connected to the network.`, d.id, 'node');
      }
    });

    pipes.forEach(edge => {
      const d = edge.data();
      const source = edge.source();
      const target = edge.target();
      const edgeName = d.name || d.id;

      if (!source?.length || !target?.length || !d.source || !d.target) addIssue('error', 'invalid-pipe', 'Pipe has invalid endpoints', `${edgeName} is missing a valid source or target.`, d.id, 'edge');
      if (d.source && d.target && d.source === d.target) addIssue('error', 'self-loop-pipe', 'Pipe connects to itself', `${edgeName} has the same source and target.`, d.id, 'edge');
      if (!String(d.name || '').trim()) addIssue('warning', 'missing-pipe-name', 'Pipe is missing a name', 'Unnamed pipes are harder to review in analytics and exports.', d.id, 'edge');
      if (Number(d.capacity || 0) <= 0) addIssue('warning', 'missing-pipe-capacity', 'Pipe capacity is missing', `${edgeName} has no positive capacity.`, d.id, 'edge');
    });

    const supplyTypes = new Set(['plant', 'stp']);
    const isBidirectional = edge => edge.data('bidirectional') === true || edge.data('bidirectional') === 'true';
    infrastructureNodes.filter(node => NS2_DELIVERY_TYPES.includes(node.data('type'))).forEach(point => {
      const pointName = point.data('name') || point.id();
      if (point.connectedEdges().length === 0) return;

      let hasIncomingPipe = false;
      point.connectedEdges().forEach(edge => {
        if (edge.target().id() === point.id() || isBidirectional(edge)) hasIncomingPipe = true;
      });
      if (!hasIncomingPipe) addIssue('warning', 'delivery-no-incoming', 'Delivery point has no incoming pipe', `${pointName} is connected, but no pipe direction feeds into it.`, point.id(), 'node');

      const queue = [point.id()];
      const seen = new Set(queue);
      let reachesSupply = false;
      while (queue.length && !reachesSupply) {
        const currentId = queue.shift();
        const current = cy.getElementById(currentId);
        current.connectedEdges().forEach(edge => {
          let upstream = null;
          if (edge.target().id() === currentId) upstream = edge.source().id();
          else if (isBidirectional(edge) && edge.source().id() === currentId) upstream = edge.target().id();
          if (!upstream || seen.has(upstream)) return;
          seen.add(upstream);
          const upstreamNode = cy.getElementById(upstream);
          if (supplyTypes.has(upstreamNode.data('type'))) reachesSupply = true;
          queue.push(upstream);
        });
      }
      if (!reachesSupply) addIssue('warning', 'delivery-no-supply-path', 'Delivery point has no upstream supply path', `${pointName} cannot trace upstream to a plant or STP with current pipe directions.`, point.id(), 'node');
    });

    if (issues.length === 0) addIssue('success', 'valid-network', 'No advisory issues found', 'The current canvas passed the front-end network checks.');
    return issues;
  }, []);

  const handleValidateNetwork = useCallback(() => {
    const issues = validateCurrentNetwork();
    setValidationIssues(issues);
    setIssuePanelMode('issues');
    setShowRightPanel(true);
    setRightPanelTab('issues');
  }, [validateCurrentNetwork]);

  const handleShowIssues = useCallback(() => {
    setValidationIssues(prev => prev.length ? prev : validateCurrentNetwork());
    setIssuePanelMode('issues');
    setShowRightPanel(true);
    setRightPanelTab('issues');
  }, [validateCurrentNetwork]);

  const handleFindAsset = useCallback(() => {
    setIssuePanelMode('find');
    setShowRightPanel(true);
    setRightPanelTab('issues');
  }, []);

  const clearIsolation = useCallback(() => {
    cyRef.current?.elements().removeClass('isolate-dim');
    setIsSelectionIsolated(false);
  }, []);

  const handleIsolateSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (isSelectionIsolated) {
      clearIsolation();
      return;
    }
    const selectedNodes = cy.nodes(':selected').not('[type="group-box"]').not('[type="note"]');
    const selectedEdges = cy.edges(':selected');
    const visibleIds = new Set();
    selectedNodes.forEach(node => visibleIds.add(node.id()));
    selectedEdges.forEach(edge => {
      visibleIds.add(edge.id());
      visibleIds.add(edge.source().id());
      visibleIds.add(edge.target().id());
    });
    selectedNodes.connectedEdges().forEach(edge => {
      if (visibleIds.has(edge.source().id()) && visibleIds.has(edge.target().id())) visibleIds.add(edge.id());
    });
    if (visibleIds.size === 0) return;
    cy.elements().removeClass('isolate-dim');
    cy.elements().forEach(el => {
      if (!visibleIds.has(el.id())) el.addClass('isolate-dim');
    });
    setIsSelectionIsolated(true);
  }, [clearIsolation, isSelectionIsolated]);

  const handleCreateLineGroup = useCallback(() => {
    setLineGroupDraft({ name: '', type: 'line', parentId: '' });
    setShowRightPanel(true);
    setRightPanelTab('isolation');
  }, []);

  const createLineGroupFromDraft = useCallback(() => {
    const selectedEdges = cyRef.current?.edges(':selected') || [];
    const name = lineGroupDraft.name?.trim();
    if (!name) {
      window.alert('Enter a group name.');
      return;
    }
    const kind = lineGroupDraft.type || 'line';
    if (kind !== 'transmission-system' && !selectedEdges.length) {
      window.alert('Select one or more pipeline segments first.');
      return;
    }
    if (kind === 'transmission-system' && selectedLineGroupIds.size === 0) {
      window.alert('Select one or more line or branch groups to include in the transmission system.');
      return;
    }
    setLineGroups(previous => [...previous, {
      id: `line-group-${Date.now()}`,
      name,
      type: ['line', 'branch', 'transmission-system'].includes(kind) ? kind : 'line',
      parentId: kind === 'branch' ? (lineGroupDraft.parentId || null) : null,
      pipeIds: selectedEdges.map(edge => edge.id()),
      memberGroupIds: kind === 'transmission-system' ? [...selectedLineGroupIds] : [],
    }]);
    setLineGroupDraft({ name: '', type: 'line', parentId: '' });
    setSelectedLineGroupIds(new Set());
  }, [lineGroupDraft, selectedLineGroupIds]);

  const getLineGroupPipeIds = useCallback((group, visited = new Set()) => {
    if (!group || visited.has(group.id)) return [];
    visited.add(group.id);
    const childIds = [...(group.memberGroupIds || []), ...lineGroups.filter(candidate => candidate.parentId === group.id).map(candidate => candidate.id)];
    const children = childIds.flatMap(id =>
      getLineGroupPipeIds(lineGroups.find(candidate => candidate.id === id), visited));
    return [...new Set([...(group.pipeIds || []), ...children])];
  }, [lineGroups]);

  const isolateLineGroup = useCallback((group) => {
    const cy = cyRef.current;
    if (!cy || !group) return;
    cy.$(':selected').unselect();
    const edges = cy.collection(getLineGroupPipeIds(group).map(id => cy.getElementById(id)).filter(edge => edge?.length));
    edges.select();
    setSelectedCount(edges.length);
    setSelectedEl(null);
    clearIsolation();
    window.requestAnimationFrame(handleIsolateSelection);
  }, [clearIsolation, getLineGroupPipeIds, handleIsolateSelection]);

  const assignSelectedLinesToSystem = useCallback((systemId) => {
    if (!selectedLineGroupIds.size) {
      window.alert('Select one or more lines before assigning them to this transmission system.');
      return;
    }
    setLineGroups(previous => previous.map(group => {
      if (group.id !== systemId) return group;
      return { ...group, memberGroupIds: [...new Set([...(group.memberGroupIds || []), ...selectedLineGroupIds])] };
    }));
    setSelectedLineGroupIds(new Set());
  }, [selectedLineGroupIds]);

  const prepareBranchForLine = useCallback((line) => {
    setLineGroupDraft({ name: '', type: 'branch', parentId: line.id });
    setShowRightPanel(true);
    setRightPanelTab('isolation');
  }, []);

  const handleResetAdvancedView = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    exitMode();
    cy.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim bn-line bn-plant bn-point isolate-dim demand-flagged');
    cy.$(':selected').unselect();
    setTraceInfo(null);
    setBottleneckSummary(null);
    setIsSelectionIsolated(false);
    setSelectedEl(null);
    setSelectedCount(0);
    cy.fit(undefined, 60);
  }, [exitMode]);

  const focusFirstValidationIssue = useCallback(() => {
    const issues = validateCurrentNetwork();
    setValidationIssues(issues);
    setIssuePanelMode('issues');
    setShowRightPanel(true);
    setRightPanelTab('issues');
    const actionable = issues.find(issue => issue.elementId && issue.severity !== 'success');
    if (actionable) focusCanvasElement(actionable.elementId);
  }, [focusCanvasElement, validateCurrentNetwork]);

  const selectCanvasElements = useCallback((elements) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(':selected').unselect();
    const collection = cy.collection((elements || []).filter(Boolean));
    collection.select();
    setSelectedCount(collection.length);
    if (collection.length === 1) {
      const el = collection[0];
      setSelectedEl({ ...el.data(), _group: el.isNode() ? 'node' : 'edge' });
      cy.animate({ center: { eles: el }, zoom: 1.12 }, { duration: 260 });
    } else if (collection.length > 1) {
      setSelectedEl(null);
      cy.animate({ fit: { eles: collection, padding: 70 }, duration: 260 });
    } else {
      setSelectedEl(null);
    }
  }, []);

  const syncNoteOverlays = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) {
      setNoteOverlays([]);
      setGroupBoxOverlays([]);
      return;
    }
    const overlays = cy.nodes('[type="note"]').map(node => {
      const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      const width = Math.max(80, bb.w || (Number(node.data('boxWidth') || 220) * cy.zoom()));
      const height = Math.max(50, bb.h || (Number(node.data('boxHeight') || 100) * cy.zoom()));
      const activeEditor = activeNoteEditorRef.current === node.id()
        ? document.querySelector(`[data-note-editor-id="${node.id()}"]`)
        : null;
      return {
        id: node.id(),
        html: activeEditor?.innerHTML ?? node.data('noteHtml') ?? escapeNoteHtml(node.data('name') || node.data('displayLabel') || ''),
        selected: node.selected(),
        font: node.data('noteFont') || 'sans',
        fontSize: node.data('noteFontSize') || 'normal',
        bold: node.data('noteBold') === 'true' || node.data('noteBold') === true,
        italic: node.data('noteItalic') === 'true' || node.data('noteItalic') === true,
        underline: node.data('noteUnderline') === 'true' || node.data('noteUnderline') === true,
        left: bb.x1,
        top: bb.y1,
        width,
        height,
      };
    });
    setNoteOverlays(overlays);
    setGroupBoxOverlays(cy.nodes('[type="group-box"]').map(node => {
      const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      return {
        id: node.id(),
        selected: node.selected(),
        left: bb.x1,
        top: bb.y1,
        width: Math.max(120, bb.w || (Number(node.data('boxWidth') || 240) * cy.zoom())),
        height: Math.max(80, bb.h || (Number(node.data('boxHeight') || 160) * cy.zoom())),
      };
    }));
  }, []);

  // commitNoteEditor persists the editor's current HTML/text into cytoscape
  // node data and (by default) auto-grows the box to fit the rendered DOM.
  //
  // Options:
  //   resize        — when false, skips boxWidth/boxHeight/noteTextMaxWidth.
  //                   Used by format toggles so applying Bold/Italic/Underline
  //                   doesn't snowball the box's size from the inserted
  //                   <b>/<i>/<u> wrappers expanding the DOM measurement.
  //   skipRerender  — when true, skips setCanvasVersion. Used by format
  //                   toggles so React doesn't re-apply
  //                   `dangerouslySetInnerHTML` from state and destroy the
  //                   user's active text selection. The DOM is already
  //                   correct via execCommand; the node data is also
  //                   updated; the React state will sync naturally on the
  //                   next unrelated render.
  const commitNoteEditor = useCallback((noteId, editorEl, options = {}) => {
    const { resize = true, skipRerender = false } = options;
    const cy = cyRef.current;
    if (!cy || !noteId || !editorEl) return;
    const node = cy.getElementById(noteId);
    if (!node?.length) return;
    const html = editorEl.innerHTML;
    const text = editorEl.innerText || editorEl.textContent || '';
    const patch = {
      noteHtml: html,
      name: text.trim() || 'Note',
      displayLabel: '',
    };
    if (resize) {
      const zoom = cy.zoom() || 1;
      const boxWidth = Math.max(120, Math.round((editorEl.offsetWidth || 220) / zoom));
      const boxHeight = Math.max(70, Math.round((editorEl.offsetHeight || 100) / zoom));
      patch.boxWidth = boxWidth;
      patch.boxHeight = boxHeight;
      patch.noteTextMaxWidth = Math.max(80, boxWidth - 24);
    }
    node.data(patch);
    if (!skipRerender) setCanvasVersion(v => v + 1);
  }, []);

  const resizeGroupBoxFromHandle = useCallback((groupId, event) => {
    const cy = cyRef.current;
    const node = cy?.getElementById(groupId);
    if (!cy || !node?.length) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = Number(node.data('boxWidth') || node.outerWidth() || 240);
    const startHeight = Number(node.data('boxHeight') || node.outerHeight() || 160);
    const zoom = cy.zoom() || 1;

    const onMove = (moveEvent) => {
      const boxWidth = Math.max(160, Math.round(startWidth + ((moveEvent.clientX - startX) / zoom)));
      const boxHeight = Math.max(100, Math.round(startHeight + ((moveEvent.clientY - startY) / zoom)));
      node.data({ boxWidth, boxHeight });
      syncNoteOverlays();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      recordCanvasHistory();
      setCanvasVersion(v => v + 1);
      syncNoteOverlays();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [recordCanvasHistory, syncNoteOverlays]);

  const saveActiveNoteSelection = useCallback(() => {
    const noteId = activeNoteEditorRef.current;
    const selection = window.getSelection?.();
    if (!noteId || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const editor = document.querySelector(`[data-note-editor-id="${noteId}"]`);
    if (editor && editor.contains(range.commonAncestorContainer)) {
      activeNoteSelectionRef.current = range.cloneRange();
    }
  }, []);

  const restoreActiveNoteSelection = useCallback(() => {
    const noteId = activeNoteEditorRef.current;
    const editor = noteId ? document.querySelector(`[data-note-editor-id="${noteId}"]`) : null;
    if (!editor) return null;
    editor.focus();
    const selection = window.getSelection?.();
    if (selection && activeNoteSelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(activeNoteSelectionRef.current);
    }
    return editor;
  }, []);

  const runActiveNoteCommand = useCallback((command, value = null) => {
    const noteId = activeNoteEditorRef.current;
    const editor = restoreActiveNoteSelection();
    if (!noteId || !editor) return false;
    document.execCommand(command, false, value);
    saveActiveNoteSelection();
    // Format-only commit: persist the new HTML without growing the box and
    // without forcing a React re-render that would wipe the live selection.
    commitNoteEditor(noteId, editor, { resize: false, skipRerender: true });
    return true;
  }, [commitNoteEditor, restoreActiveNoteSelection, saveActiveNoteSelection]);

  const commitActiveNoteEditorNow = useCallback(() => {
    const noteId = activeNoteEditorRef.current;
    const editor = noteId ? document.querySelector(`[data-note-editor-id="${noteId}"]`) : null;
    if (noteId && editor) commitNoteEditor(noteId, editor);
  }, [commitNoteEditor]);

  commitActiveNoteEditorRef.current = commitActiveNoteEditorNow;

  useEffect(() => {
    const noteId = pendingFocusNoteIdRef.current;
    if (!noteId) return;
    const editor = document.querySelector(`[data-note-editor-id="${noteId}"]`);
    if (!editor) return;
    pendingFocusNoteIdRef.current = null;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection?.();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      activeNoteSelectionRef.current = range.cloneRange();
    }
    activeNoteEditorRef.current = noteId;
  }, [noteOverlays]);

  const selectedNoteState = useMemo(() => {
    const cy = cyRef.current;
    if (!cy) return { count: 0, allBold: false, allItalic: false, allUnderline: false, font: 'sans', fontSize: 'normal' };
    const notes = cy.nodes(':selected').filter(node => node.data('type') === 'note').toArray();
    if (notes.length === 0) return { count: 0, allBold: false, allItalic: false, allUnderline: false, font: 'sans', fontSize: 'normal' };
    const first = notes[0];
    return {
      count: notes.length,
      allBold: notes.every(node => node.data('noteBold') === 'true' || node.data('noteBold') === true),
      allItalic: notes.every(node => node.data('noteItalic') === 'true' || node.data('noteItalic') === true),
      allUnderline: notes.every(node => node.data('noteUnderline') === 'true' || node.data('noteUnderline') === true),
      font: first.data('noteFont') || 'sans',
      fontSize: first.data('noteFontSize') || 'normal',
    };
  }, [selectedCount, canvasVersion]);

  const selectedNetworkElementCount = useMemo(() => {
    const cy = cyRef.current;
    if (!cy) return 0;
    return cy.$(':selected')
      .filter(el => !(el.isNode && el.isNode() && ['note', 'group-box'].includes(el.data('type'))))
      .length;
  }, [selectedCount, canvasVersion]);

  const handleSetSelectedActive = useCallback((active) => {
    const cy = cyRef.current;
    if (!cy) return;
    const selected = cy.$(':selected')
      .filter(el => !(el.isNode && el.isNode() && ['note', 'group-box'].includes(el.data('type'))));
    if (selected.length === 0) return;

    cy.batch(() => {
      selected.forEach(el => {
        if (el.isNode && el.isNode()) {
          const currentStatus = normalizeAssetStatus(el.data('status'));
          const nextStatus = active
            ? (currentStatus === 'inactive' ? 'operational' : currentStatus)
            : 'inactive';
          el.data({
            active,
            status: nextStatus,
            ...buildCyNodeCardData({
              type: el.data('type'),
              name: el.data('name'),
              activity: el.data('activity'),
              assetType: el.data('assetType'),
              status: nextStatus,
              capacityLimitationType: el.data('capacityLimitationType'),
              capacityLimitationValue: el.data('capacityLimitationValue'),
              capacityUsageLimit: el.data('capacityUsageLimit'),
            }),
          });
        } else if (el.isEdge && el.isEdge()) {
          el.data('active', active);
        }
      });
    });
    updateSelection();
    setCanvasVersion(v => v + 1);
  }, [updateSelection]);

  const handleSelectByActiveState = useCallback((active) => {
    const cy = cyRef.current;
    if (!cy) return;
    const matches = cy.elements()
      .filter(el => {
        if (el.isNode && el.isNode() && ['note', 'group-box'].includes(el.data('type'))) return false;
        const isInactive = el.data('active') === false || el.data('active') === 'false' || normalizeAssetStatus(el.data('status')) === 'inactive';
        return active ? !isInactive : isInactive;
      })
      .toArray();
    selectCanvasElements(matches);
  }, [selectCanvasElements]);

  const updateSelectedNotes = useCallback((patch) => {
    if (patch.noteBold !== undefined && runActiveNoteCommand('bold')) return;
    if (patch.noteItalic !== undefined && runActiveNoteCommand('italic')) return;
    if (patch.noteUnderline !== undefined && runActiveNoteCommand('underline')) return;
    const cy = cyRef.current;
    if (!cy) return;
    const notes = cy.nodes(':selected').filter(node => node.data('type') === 'note');
    if (notes.length === 0) return;
    cy.batch(() => {
      notes.forEach(node => node.data(patch));
    });
    updateSelection();
    setCanvasVersion(v => v + 1);
  }, [runActiveNoteCommand, updateSelection]);

  const handleCycleSelectedNoteFont = useCallback(() => {
    const currentIndex = NOTE_FONTS.indexOf(selectedNoteState.font);
    const nextFont = NOTE_FONTS[(currentIndex + 1) % NOTE_FONTS.length] || 'sans';
    if (runActiveNoteCommand('fontName', nextFont === 'serif' ? 'Georgia' : nextFont === 'mono' ? 'Consolas' : 'Arial')) return;
    updateSelectedNotes({ noteFont: nextFont });
  }, [runActiveNoteCommand, selectedNoteState.font, updateSelectedNotes]);

  const handleStepSelectedNoteSize = useCallback((direction) => {
    if (runActiveNoteCommand('fontSize', direction > 0 ? '4' : '2')) return;
    const currentIndex = NOTE_FONT_SIZES.indexOf(selectedNoteState.fontSize);
    const safeIndex = currentIndex >= 0 ? currentIndex : 1;
    const nextIndex = Math.max(0, Math.min(NOTE_FONT_SIZES.length - 1, safeIndex + direction));
    updateSelectedNotes({ noteFontSize: NOTE_FONT_SIZES[nextIndex] });
  }, [runActiveNoteCommand, selectedNoteState.fontSize, updateSelectedNotes]);

  const handleSelectDisconnected = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.nodes()
      .filter(node => !['note', 'group-box', 'node'].includes(node.data('type')) && node.connectedEdges().length === 0)
      .toArray();
    selectCanvasElements(nodes);
  }, [selectCanvasElements]);

  const handleSelectMissingCapacity = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const capacityNodeTypes = new Set(['plant', 'tank', 'point', 'stp', 'filling-station', 'distribution-point']);
    const nodes = cy.nodes()
      .filter(node => capacityNodeTypes.has(node.data('type')) && Number(node.data('capacity') || 0) <= 0)
      .toArray();
    const edges = cy.edges()
      .filter(edge => Number(edge.data('capacity') || 0) <= 0)
      .toArray();
    selectCanvasElements([...nodes, ...edges]);
  }, [selectCanvasElements]);

  const handleSelectInactiveConnected = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.nodes()
      .filter(node => {
        const d = node.data();
        return !['note', 'group-box'].includes(d.type) &&
          node.connectedEdges().length > 0 &&
          (d.active === false || d.active === 'false' || normalizeAssetStatus(d.status) === 'inactive');
      })
      .toArray();
    selectCanvasElements(nodes);
  }, [selectCanvasElements]);

  const handleClearHighlights = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim bn-line bn-plant bn-point isolate-dim demand-flagged');
    cy.$(':selected').unselect();
    setTraceInfo(null);
    setBottleneckSummary(null);
    setIsSelectionIsolated(false);
    setSelectedEl(null);
    setSelectedCount(0);
  }, []);

  const findAssetResults = useMemo(() => {
    const cy = cyRef.current;
    const term = advancedSearch.trim().toLowerCase();
    if (!cy || !term) return [];
    return cy.nodes()
      .filter(n => !['note', 'group-box'].includes(n.data('type')))
      .toArray()
      .map(node => {
        const d = node.data();
        const haystack = [
          d.name, d.displayLabel, d.generated_id, d.assetId, d.id, d.type, d.assetType,
          d.activity, d.region, d.governorate, d.originalAsset?.generated_id, d.originalAsset?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(term) ? node : null;
      })
      .filter(Boolean)
      .slice(0, 30)
      .map(node => ({
        id: node.id(),
        name: node.data('name') || node.id(),
        type: ENTITY_TYPE_LABELS[node.data('type')] || node.data('type') || 'Asset',
        meta: node.data('generated_id') || node.data('originalAsset')?.generated_id || node.data('assetId') || node.data('region') || '',
      }));
  }, [advancedSearch, canvasVersion, selectedCount]);

  // ── Auto layout ────────────────────────────────────────────────────────────────
  const handleAutoLayout = useCallback((name) => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.nodes().not('[type="group-box"]');
    const layoutOptions = {
      grid: { name: 'grid', animate: true, animationDuration: 400, padding: 40 },
      circle: { name: 'circle', animate: true, animationDuration: 400, padding: 40 },
      breadthfirst: { name: 'breadthfirst', animate: true, animationDuration: 400, padding: 40, directed: true },
      cose: { name: 'cose', animate: true, animationDuration: 600, padding: 40, nodeRepulsion: 8000, idealEdgeLength: 120, gravity: 0.2 },
    };
    const opts = layoutOptions[name];
    if (!opts) return;
    nodes.layout({ ...opts, stop: recordCanvasHistory }).run();
  }, [recordCanvasHistory]);

  // ── Annotation ─────────────────────────────────────────────────────────────────
  const handleAddNote = useCallback(() => {
    if (modeRef.current === 'place-note') {
      exitMode();
    } else {
      changeMode('place-note');
    }
  }, [changeMode, exitMode]);

  const handleCreateGroupBox = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$('node:selected').not('[type="group-box"]').not('[type="note"]');
    if (nodes.length === 0) return;
    const bb = nodes.boundingBox();
    const padding = 50;
    const w = (bb.w + padding * 2);
    const h = (bb.h + padding * 2);
    cy.add({
      group: 'nodes',
      data: {
        id: nextId(),
        type: 'group-box',
        name: 'Group',
        displayLabel: 'Group',
        abbr: 'GB',
        boxWidth: w,
        boxHeight: h,
      },
      position: { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 },
    });
  }, []);

  // ── Area zoom ──────────────────────────────────────────────────────────────────
  const handleAreaZoomStart = useCallback((e) => {
    if (modeRef.current !== 'area-zoom') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    areaZoomStartRef.current = { x, y, rect };
    setAreaZoom({ x, y, w: 0, h: 0 });
  }, []);

  const handleAreaZoomMove = useCallback((e) => {
    if (!areaZoomStartRef.current) return;
    const { x: startX, y: startY } = areaZoomStartRef.current;
    const rect = areaZoomStartRef.current.rect;
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    setAreaZoom({
      x: Math.min(startX, curX),
      y: Math.min(startY, curY),
      w: Math.abs(curX - startX),
      h: Math.abs(curY - startY),
    });
  }, []);

  const handleAreaZoomEnd = useCallback((e) => {
    if (!areaZoomStartRef.current) return;
    const startRef = areaZoomStartRef.current;
    areaZoomStartRef.current = null;
    setAreaZoom(null);

    const { x: startX, y: startY, rect } = startRef;
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    const pxX = Math.min(startX, curX);
    const pxY = Math.min(startY, curY);
    const pxW = Math.abs(curX - startX);
    const pxH = Math.abs(curY - startY);

    // Need at least a 10px drag to zoom
    if (pxW < 10 || pxH < 10) { exitMode(); return; }

    const cy = cyRef.current;
    if (!cy) { exitMode(); return; }

    const containerW = cy.width();
    const containerH = cy.height();
    const currentPan = cy.pan();
    const currentZoom = cy.zoom();

    // Convert rendered px → model coordinates
    const modelX1 = (pxX - currentPan.x) / currentZoom;
    const modelY1 = (pxY - currentPan.y) / currentZoom;
    const modelW = pxW / currentZoom;
    const modelH = pxH / currentZoom;

    const newZoom = Math.min(containerW / modelW, containerH / modelH, cy.maxZoom());
    const newPan = {
      x: containerW / 2 - newZoom * (modelX1 + modelW / 2),
      y: containerH / 2 - newZoom * (modelY1 + modelH / 2),
    };

    cy.animate({ zoom: newZoom, pan: newPan }, { duration: 300, easing: 'ease-in-out-quad' });
    exitMode();
  }, [exitMode]);

  // ── Simulation overlay ────────────────────────────────────────────────────────
  const applySimulationOverlay = useCallback((results, dayIdx = null) => {
    const cy = cyRef.current;
    if (!cy || !results) return;

    // Stop any previous animation
    if (dashIntervalRef.current) {
      clearInterval(dashIntervalRef.current);
      dashIntervalRef.current = null;
    }

    // Date-aware: when a multi-day series is present and a day is selected, show
    // THAT day's flows/storage. Otherwise fall back to the aggregate (single-day
    // runs, or the whole-range totals).
    const ds = results.daily_series;
    const hasSeries = ds && Array.isArray(ds.dates) && ds.dates.length > 0;
    const useIdx = (hasSeries && dayIdx != null && dayIdx >= 0 && dayIdx < ds.dates.length) ? dayIdx : null;
    const atDay = (obj) => { const o = {}; if (obj) Object.entries(obj).forEach(([k, arr]) => { o[k] = Array.isArray(arr) ? (arr[useIdx] || 0) : 0; }); return o; };

    let flowByLine, delivered, plantOutputs, tankStorage, shortagesSimple, tankIsRaw;
    if (useIdx != null) {
      flowByLine = atDay(ds.flowByLine);
      delivered = atDay(ds.delivered);
      plantOutputs = atDay(ds.plant_outputs);
      tankStorage = atDay(ds.tank_storage);   // raw m³ per day → convert with node capacity
      shortagesSimple = atDay(ds.shortages);
      tankIsRaw = true;
    } else {
      flowByLine = results.flowByLine || {};
      delivered = results.delivered || {};
      plantOutputs = results.plant_outputs || {};
      tankStorage = results.tank_storage || {};   // already fill-% on the aggregate path
      shortagesSimple = results.shortages_simple || {};
      tankIsRaw = false;
    }
    const bottlenecks = results.bottlenecks || {};
    const getEffectiveEdgeCapacity = (edge) => {
      const rawCap = Number(edge.data('capacity') || 0);
      const limitType = edge.data('capacityLimitationType');
      const limitValue = Number(edge.data('capacityLimitationValue') || 0);
      if (!rawCap || !limitType || limitType === 'none' || !limitValue) return rawCap || 1;
      if (limitType === 'percentage') return Math.max(1, rawCap * Math.min(limitValue, 100) / 100);
      if (limitType === 'absolute') return Math.max(1, Math.min(rawCap, limitValue));
      return rawCap || 1;
    };

    // Style edges by simulation state. Bottleneck status is a stricter signal
    // than utilization, so it takes visual precedence.
    cy.edges().forEach(edge => {
      const flow = flowByLine[edge.id()] || 0;
      const cap = getEffectiveEdgeCapacity(edge);
      const util = flow / (cap || 1);
      const bottleneck = bottlenecks[edge.id()];
      const isLineBottleneck = bottleneck && (!bottleneck.type || bottleneck.type === 'line');
      // A bottleneck pipe only shows red on days it actually carries water.
      const showBottleneck = isLineBottleneck && flow > 0;
      let color;
      if (showBottleneck) {
        color = '#dc2626';        // bottleneck pipe → red (most severe)
      } else if (flow === 0) {
        color = '#6b7280';        // no flow / inactive → darker grey (was barely visible)
      } else if (util >= 0.9) {
        color = '#7c3aed';        // critical (≥90% capacity) → purple
      } else if (util >= 0.7) {
        color = '#f59e0b';        // high flow (70–90%) → amber
      } else {
        color = '#22c55e';        // active flow (<70%) → green
      }
      edge.style({
        'line-color': color,
        'target-arrow-color': color,
        'source-arrow-color': color,
        'width': showBottleneck ? 7 : flow > 0 ? Math.max(2, Math.min(6, 2 + util * 4)) : 2,
        'line-style': flow > 0 ? 'dashed' : 'solid',
        'line-dash-pattern': showBottleneck ? [3, 3] : [10, 6],
        'line-dash-offset': 0,
        'opacity': showBottleneck || flow > 0 ? 1 : 0.75,
        'z-index': showBottleneck ? 999 : 1,
      });
    });

    // Style nodes by type
    cy.nodes().forEach(node => {
      const id = node.id();
      const type = node.data('type');
      if (type === 'plant') {
        const active = (plantOutputs[id] || 0) > 0;
        node.style({ 'border-color': active ? '#22c55e' : '#ef4444', 'border-width': 4 });
      } else if (type === 'tank') {
        let pct;
        if (tankIsRaw) {
          const capN = Number(node.data('capacity') || 0);
          pct = capN > 0 ? ((tankStorage[id] || 0) / capN) * 100 : 0;
        } else {
          const t = tankStorage[id];
          pct = typeof t === 'number'
            ? t
            : t && typeof t === 'object'
              ? Number(t.storage_percent || t.fill_percent || t.percent || 0)
              : 0;
        }
        const borderColor = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
        node.style({ 'border-color': borderColor, 'border-width': 4 });
      } else if (['point', 'filling-station', 'distribution-point', 'stp'].includes(type)) {
        const del = delivered[id] || 0;
        const sht = shortagesSimple[id] || 0;
        const total = del + sht;
        const coverage = total > 0 ? (del / total) * 100 : 100;
        const borderColor = coverage >= 80 ? '#22c55e' : coverage >= 50 ? '#f59e0b' : '#ef4444';
        node.style({ 'border-color': borderColor, 'border-width': 4 });
      }
    });

    // Animate flow on active edges
    let offset = 0;
    dashIntervalRef.current = setInterval(() => {
      offset -= 2;
      cy.edges().forEach(edge => {
        if ((flowByLine[edge.id()] || 0) > 0) {
          edge.style('line-dash-offset', offset);
        }
      });
    }, 60);
  }, []);

  const clearSimulationOverlay = useCallback(() => {
    if (dashIntervalRef.current) {
      clearInterval(dashIntervalRef.current);
      dashIntervalRef.current = null;
    }
    const cy = cyRef.current;
    if (cy) {
      cy.edges().removeStyle();
      cy.nodes().removeStyle();
    }
    setSimResults(null);
    setSimError(null);
    setOverlayDayIdx(null);
  }, []);

  // Re-draw the canvas overlay for the selected day when the date slider moves.
  useEffect(() => {
    if (overlayDayIdx == null) return;
    const res = simResults?.results;
    if (res && viewMode !== 'analytics') applySimulationOverlay(res, overlayDayIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayDayIdx]);

  // ─── Load simulation from URL param ──────────────────────────────────────────
  const loadCytoSimulationById = useCallback(async (simId) => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const resp = await apiClient.get(`${workspaceApiBase}/${simId}`);
      const record = resp.data;
      const sim = isConfigurationSnapshot
        ? {
            ...(record.canvasSnapshot || {}),
            name: record.name,
            description: record.description,
            configuration: record.configuration || {},
            id: record.id,
          }
        : record;
      if (isConfigurationSnapshot) configurationRecordRef.current = record;
      isHistoryRestoringRef.current = true;

      // Legacy-saved-network status enrichment.
      // Older saves persisted entities without a `status` field, which made
      // every node render as "planned" (the fallback when status is empty).
      // Look up the real status by name from the assets registry and feed it
      // into the per-entity loop below as a fallback before defaulting to
      // 'planned'. Non-destructive: the saved blob is untouched.
      const entitiesForLoad = sim.entities || [];
      const namesNeedingStatus = [...new Set(
        entitiesForLoad
          .filter(e => e && !e.status && e.name)
          .map(e => e.name)
      )];
      let nameToStatus = {};
      if (namesNeedingStatus.length > 0) {
        try {
          const lookup = await apiClient.post('/api/assets/lookup-status', { names: namesNeedingStatus });
          nameToStatus = lookup?.data || {};
        } catch (lookupErr) {
          console.warn('[NS2] Asset status lookup failed; legacy entities will default to planned', lookupErr);
        }
      }

      try {
        cy.elements().remove();
        cy.batch(() => {
          (sim.entities || []).forEach(ent => {
            try {
              // Coerce legacy types (distribution-point → point) BEFORE feeding
              // anything downstream so the loaded entity looks like a current
              // Handover Point from card to legend.
              const effectiveType = normalizeEntityType(ent.type);
              // Legacy capacity field migration: pre-line-pattern sims only had
              // capacityUsageLimit (percentage). Lift it into the new pair so
              // the unified UI shows it correctly on first open.
              const legacyPct = ent.capacityUsageLimit ?? ent.capacityLimitPercentage;
              const hasNewCapShape =
                ent.capacityLimitationType !== undefined &&
                ent.capacityLimitationType !== null;
              const capacityLimitationType = hasNewCapShape
                ? ent.capacityLimitationType
                : (legacyPct ? 'percentage' : 'none');
              const capacityLimitationValue = hasNewCapShape
                ? (ent.capacityLimitationValue ?? '')
                : (legacyPct || '');
              const isJunction = effectiveType === 'node';
              // Prefer the entity's own stored status; then fall back to the
              // assets-registry lookup (so legacy saves render with their
              // real underlying status); then to inactive vs planned.
              const enrichedStatus = ent.status || nameToStatus[ent.name];
              const visualStatus = normalizeAssetStatus(
                enrichedStatus || (ent.isActive === false ? 'inactive' : 'planned')
              );
              const cardData = buildCyNodeCardData({
                type: effectiveType,
                name: ent.name || ent.id,
                activity: ent.activity || '',
                assetType: ent.assetType || '',
                status: visualStatus,
                capacityLimitationType,
                capacityLimitationValue,
              });
              cy.add({
                group: 'nodes',
                data: {
                  id: ent.id,
                  type: effectiveType,
                  name: ent.name || ent.id,
                  displayLabel: buildDisplayLabel(effectiveType, ent.name || ent.id, showLabels),
                  abbr: ENTITY_TYPE_ABBREVIATIONS[effectiveType] || '',
                  ...cardData,
                  status: visualStatus,
                  capacity: ent.capacity || 0,
                  capacityLimitationType,
                  capacityLimitationValue,
                  region: ent.region || '',
                  governorate: ent.governorate || '',
                  activity: ent.activity || '',
                  assetType: ent.assetType || '',
                  plantType: ent.plantType || '',
                  active: ent.isActive !== false,
                  // Junctions don't carry commissioning dates.
                  commissioningDate: isJunction ? '' : (ent.commissioningDate || ''),
                  decommissioningDate: isJunction ? '' : (ent.decommissioningDate || ''),
                  // Pump-station composition — restored so the entity modal's
                  // Pump Configuration section shows what the user saved.
                  pumps: effectiveType === 'pump' && Array.isArray(ent.pumps) ? ent.pumps : [],
                },
                position: { x: ent.canvasX || 100, y: ent.canvasY || 100 },
              });
            } catch (_) {}
          });
          (sim.boxes || []).forEach(box => {
            try {
              const type = box.type === 'note' ? 'note' : 'group-box';
              const isNote = type === 'note';
              const boxWidth = Number(box.boxWidth || (isNote ? 220 : 240));
              const boxHeight = Number(box.boxHeight || (isNote ? 100 : 160));
              cy.add({
                group: 'nodes',
                data: {
                  id: box.id || nextId(),
                  type,
                  name: box.name || (isNote ? 'Note' : 'Group'),
                  displayLabel: box.displayLabel || box.name || (isNote ? 'Note' : 'Group'),
                  abbr: isNote ? '' : 'GB',
                  boxWidth,
                  boxHeight,
                  ...(isNote ? {
                    noteHtml: box.noteHtml || escapeNoteHtml(box.name || box.displayLabel || ''),
                    noteTextMaxWidth: Number(box.noteTextMaxWidth || Math.max(80, boxWidth - 24)),
                    noteFont: box.noteFont || 'sans',
                    noteFontSize: box.noteFontSize || 'normal',
                    noteBold: box.noteBold ?? 'false',
                    noteItalic: box.noteItalic ?? 'false',
                    noteUnderline: box.noteUnderline ?? 'false',
                  } : {}),
                },
                position: { x: box.canvasX || 100, y: box.canvasY || 100 },
              });
            } catch (_) {}
          });
          (sim.lines || []).forEach(line => {
            try {
              // Restore persisted bend points (see handleSaveSimulation). Only
              // apply when the parallel weight/distance arrays are consistent.
              const bendWeights = Array.isArray(line.bendWeights)
                ? line.bendWeights.map(Number).filter(Number.isFinite)
                : [];
              const bendDistances = Array.isArray(line.bendDistances)
                ? line.bendDistances.map(Number).filter(Number.isFinite)
                : [];
              const hasBends = bendWeights.length > 0 && bendWeights.length === bendDistances.length;
              const added = cy.add({
                group: 'edges',
                data: {
                  id: line.id,
                  source: line.fromEntityId,
                  target: line.toEntityId,
                  name: line.name || 'Pipe',
                  capacity: line.capacity || 0,
                  active: line.isActive !== false,
                  transmissionSystemId: line.transmissionSystemId || '',
                  lineGroupId: line.lineGroupId || '',
                  parentLineId: line.parentLineId || '',
                  branchName: line.branchName || '',
                  ...(hasBends ? {
                    cyedgebendeditingWeights: bendWeights,
                    cyedgebendeditingDistances: bendDistances,
                  } : {}),
                },
              });
              // cy.add() with initial data doesn't fire the 'data' handler that
              // normally applies the bend class, so add it explicitly here. The
              // class flips the edge to a 'segments' curve that renders the kinks.
              if (hasBends) normalizeEdgeBendData(added);
            } catch (_) {}
          });
        });
      } finally {
        isHistoryRestoringRef.current = false;
      }
      requestAnimationFrame(() => cy.fit(undefined, 50));
      resetCanvasHistory(serializeCanvasHistorySnapshot(cy));
      setSimMeta({ name: sim.name || '', description: sim.description || '' });
      if (isConfigurationSnapshot && record.latestResult) {
        const loadedResult = record.latestResult;
        const dates = loadedResult.results?.daily_series?.dates || [];
        const latestDayIndex = dates.length ? dates.length - 1 : null;
        setSimResults(loadedResult);
        simResultsRef.current = loadedResult;
        setOverlayDayIdx(latestDayIndex);
        requestAnimationFrame(() => applySimulationOverlay(loadedResult.results, latestDayIndex));
      }
      // Repair early hierarchy records where a pipe was flagged as a branch
      // but was still stored inside its parent line group. This keeps legacy
      // and in-progress canvases visible in the nested Isolation tree.
      const repairedLineGroups = (sim.lines || []).reduce((groups, line) => {
        if (!line.isBranch || !line.branchName || !line.parentLineId) return groups;
        const current = groups.find(group => group.id === line.lineGroupId);
        if (current?.type === 'branch' && current.parentId === line.parentLineId) {
          if (!current.pipeIds.includes(line.id)) current.pipeIds.push(line.id);
          return groups;
        }
        const existingBranch = groups.find(group => group.type === 'branch' && group.parentId === line.parentLineId && group.name === line.branchName);
        if (existingBranch) {
          if (!existingBranch.pipeIds.includes(line.id)) existingBranch.pipeIds.push(line.id);
          return groups;
        }
        groups.push({
          id: `branch-${line.id}`,
          name: line.branchName,
          type: 'branch',
          parentId: line.parentLineId,
          pipeIds: [line.id],
          memberGroupIds: [],
        });
        return groups;
      }, (sim.lineGroups || []).map(group => ({ ...group, pipeIds: [...(group.pipeIds || [])], memberGroupIds: [...(group.memberGroupIds || [])] })));
      setLineGroups(repairedLineGroups);
      setSimSavedId(sim.id);
      if (activeInstanceIdRef.current) {
        updatePageInstance(workspacePageType, activeInstanceIdRef.current, {
          title: sim.name || 'Network Simulation',
          isFallbackTitle: false,
          state: {
            path: isConfigurationSnapshot ? `${workspaceBasePath}/${sim.id}/canvas` : `${workspaceBasePath}/${sim.id}`,
            ...(isNetworkCanvas ? { canvasId: sim.id } : isConfigurationSnapshot ? { simulationConfigId: sim.id } : { simulationId: sim.id }),
          },
        });
      }

      const cfg = sim.configuration || {};

      // Restore simulation config (dateRange, percentages, priorityMode)
      if (cfg.dateRange || cfg.flowPercentages || cfg.priorityMode || cfg.strategicStorageMinPct !== undefined) {
        setSimConfig(prev => ({
          ...prev,
          ...(cfg.dateRange ? { dateRange: cfg.dateRange } : {}),
          ...(cfg.flowPercentages?.purification !== undefined
            ? { purificationPct: cfg.flowPercentages.purification }
            : {}),
          ...(cfg.strategicStorageMinPct !== undefined
            ? { strategicStorageMinPct: cfg.strategicStorageMinPct }
            : {}),
          ...(cfg.priorityMode ? { priorityMode: cfg.priorityMode } : {}),
        }));
      }

      // Restore demand input mode and manual demands
      if (cfg.demandInputMode) setDemandInputMode(cfg.demandInputMode);
      if (cfg.manualDemands) setManualDemands(cfg.manualDemands);

      // Restore selected demand scenario: match by id against loaded list
      if (cfg.scenario?.id) {
        setDemandScenarios(prev => {
          const match = prev.find(s => String(s.id) === String(cfg.scenario.id));
          if (match) {
            setSelectedDemandScenario(match);
          } else if (cfg.scenario) {
            // Scenario not in list yet (e.g. still loading) — reconstruct a minimal object
            setSelectedDemandScenario({
              id: cfg.scenario.id,
              name: cfg.scenario.inputs?.scenario_name || sim.name || `Scenario ${cfg.scenario.id}`,
              data: cfg.scenario,
              regions: cfg.scenario.inputs?.regions || [],
            });
          }
          return prev; // don't mutate the list itself
        });
      }
    } catch (err) {
      console.error('[NS2] Failed to load cyto simulation:', err);
    }
  }, [buildDisplayLabel, showLabels, resetCanvasHistory, updatePageInstance, normalizeEdgeBendData]);

  useEffect(() => {
    if (!isControlledSnapshot || !controlledSnapshot) return;
    const cy = cyRef.current;
    if (!cy) return;
    const source = controlledSnapshot.canvasSnapshot || controlledSnapshot || {};
    const entities = Array.isArray(source.entities) ? source.entities : [];
    const boxes = Array.isArray(source.boxes) ? source.boxes : [];
    const lines = Array.isArray(source.lines) ? source.lines : [];

    isHistoryRestoringRef.current = true;
    try {
      cy.elements().remove();
      cy.batch(() => {
        entities.forEach(ent => {
          try {
            const effectiveType = normalizeEntityType(ent.type || ent.entityType);
            const legacyPct = ent.capacityUsageLimit ?? ent.capacityLimitPercentage;
            const hasNewCapShape = ent.capacityLimitationType !== undefined && ent.capacityLimitationType !== null;
            const capacityLimitationType = hasNewCapShape ? ent.capacityLimitationType : (legacyPct ? 'percentage' : 'none');
            const capacityLimitationValue = hasNewCapShape ? (ent.capacityLimitationValue ?? '') : (legacyPct || '');
            const visualStatus = normalizeAssetStatus(ent.status || (ent.isActive === false ? 'inactive' : 'planned'));
            const cardData = buildCyNodeCardData({
              type: effectiveType,
              name: ent.name || ent.id,
              activity: ent.activity || '',
              assetType: ent.assetType || '',
              status: visualStatus,
              capacityLimitationType,
              capacityLimitationValue,
            });
            cy.add({
              group: 'nodes',
              data: {
                id: ent.id,
                type: effectiveType,
                name: ent.name || ent.id,
                displayLabel: buildDisplayLabel(effectiveType, ent.name || ent.id, true),
                abbr: ENTITY_TYPE_ABBREVIATIONS[effectiveType] || '',
                ...cardData,
                status: visualStatus,
                capacity: ent.capacity || 0,
                capacityLimitationType,
                capacityLimitationValue,
                region: ent.region || '',
                governorate: ent.governorate || '',
                activity: ent.activity || '',
                assetType: ent.assetType || '',
                plantType: ent.plantType || '',
                active: ent.isActive !== false,
                commissioningDate: effectiveType === 'node' ? '' : (ent.commissioningDate || ''),
                decommissioningDate: effectiveType === 'node' ? '' : (ent.decommissioningDate || ''),
                pumps: effectiveType === 'pump' && Array.isArray(ent.pumps) ? ent.pumps : [],
              },
              position: { x: Number(ent.canvasX ?? ent.x ?? 100), y: Number(ent.canvasY ?? ent.y ?? 100) },
            });
          } catch (_) {}
        });
        boxes.forEach(box => {
          try {
            const type = box.type === 'note' ? 'note' : 'group-box';
            const isNote = type === 'note';
            const boxWidth = Number(box.boxWidth || (isNote ? 220 : 240));
            const boxHeight = Number(box.boxHeight || (isNote ? 100 : 160));
            cy.add({
              group: 'nodes',
              data: {
                id: box.id || nextId(),
                type,
                name: box.name || (isNote ? 'Note' : 'Group'),
                displayLabel: box.displayLabel || box.name || (isNote ? 'Note' : 'Group'),
                abbr: isNote ? '' : 'GB',
                boxWidth,
                boxHeight,
                ...(isNote ? {
                  noteHtml: box.noteHtml || escapeNoteHtml(box.name || box.displayLabel || ''),
                  noteTextMaxWidth: Number(box.noteTextMaxWidth || Math.max(80, boxWidth - 24)),
                  noteFont: box.noteFont || 'sans',
                  noteFontSize: box.noteFontSize || 'normal',
                  noteBold: box.noteBold ?? 'false',
                  noteItalic: box.noteItalic ?? 'false',
                  noteUnderline: box.noteUnderline ?? 'false',
                } : {}),
              },
              position: { x: Number(box.canvasX ?? box.x ?? 100), y: Number(box.canvasY ?? box.y ?? 100) },
            });
          } catch (_) {}
        });
        lines.forEach(line => {
          try {
            const bendWeights = Array.isArray(line.bendWeights) ? line.bendWeights.map(Number).filter(Number.isFinite) : [];
            const bendDistances = Array.isArray(line.bendDistances) ? line.bendDistances.map(Number).filter(Number.isFinite) : [];
            const hasBends = bendWeights.length > 0 && bendWeights.length === bendDistances.length;
            const added = cy.add({
              group: 'edges',
              data: {
                id: line.id,
                source: line.fromEntityId || line.source,
                target: line.toEntityId || line.target,
                name: line.name || 'Pipe',
                capacity: line.capacity || 0,
                active: line.isActive !== false,
                bidirectional: line.bidirectional === true || line.bidirectional === 'true',
                capacityLimitationType: line.capacityLimitationType || 'none',
                capacityLimitationValue: line.capacityLimitationValue ?? '',
                transmissionSystemId: line.transmissionSystemId || '',
                lineGroupId: line.lineGroupId || '',
                parentLineId: line.parentLineId || '',
                branchName: line.branchName || '',
                isBranch: line.isBranch === true || line.isBranch === 'true',
                ...(hasBends ? { cyedgebendeditingWeights: bendWeights, cyedgebendeditingDistances: bendDistances } : {}),
              },
            });
            if (hasBends) normalizeEdgeBendData(added);
          } catch (_) {}
        });
      });
    } finally {
      isHistoryRestoringRef.current = false;
    }
    setLineGroups(Array.isArray(source.lineGroups) ? source.lineGroups : []);
    setSimSavedId(null);
    setSimResults(null);
    setSimError(null);
    setViewMode('canvas');
    requestAnimationFrame(() => cy.fit(undefined, 50));
    resetCanvasHistory(serializeCanvasHistorySnapshot(cy));
  }, [isControlledSnapshot, controlledSnapshot, cyMountVersion, buildDisplayLabel, normalizeEdgeBendData, resetCanvasHistory]);

  useEffect(() => {
    if (!isControlledSnapshot) return;
    setSimMeta({ name: controlledName || '', description: controlledDescription || '' });
  }, [isControlledSnapshot, controlledName, controlledDescription]);

  // Helper: wipe canvas + all transient state for a blank new simulation
  const clearForNewSimulation = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      isHistoryRestoringRef.current = true;
      try {
        cy.elements().remove();
      } finally {
        isHistoryRestoringRef.current = false;
      }
      resetCanvasHistory(serializeCanvasHistorySnapshot(cy));
    }
    setSimMeta({ name: '', description: '' });
    setSimSavedId(null);
    setSimSaveStatus('idle');
    setSimResults(null);
    setSimError(null);
    setViewMode('canvas');
    setNodeNameMap({});
    setManualDemands({});
    setDemandInputMode('scenario');
    setLineGroups([]);
    setSelectedLineGroupIds(new Set());
    setLineGroupDraft({ name: '', type: 'line', parentId: '' });
  }, [resetCanvasHistory]);

  // Keep refs in sync with latest state on every render (direct assignment is safe for refs)
  simMetaRef.current = simMeta;
  simSavedIdRef.current = simSavedId;
  simConfigRef.current = simConfig;
  simResultsRef.current = simResults;
  simChartDataRef.current = simChartData;
  simRegionalDataRef.current = simRegionalData;
  selectedDemandScenarioRef.current = selectedDemandScenario;
  manualDemandsRef.current = manualDemands;
  demandInputModeRef.current = demandInputMode;
  activeInstanceIdRef.current = activeInstanceId;

  // ─── Tab instance switching: save/restore per-tab canvas state ────────────────
  // Snapshot every outgoing Cyto tab. Saved tabs only reload from the DB when
  // there is no in-memory canvas snapshot for that tab.
  useEffect(() => {
    if (isControlledSnapshot) return;
    const newInstanceId = activeInstanceId;
    const prevInstanceId = prevInstanceIdRef.current;
    if (newInstanceId === prevInstanceId) return;

    if (prevInstanceId) {
      saveCanvasSnapshotToInstance(prevInstanceId);
    }

    prevInstanceIdRef.current = newInstanceId;
    if (!newInstanceId) return;

    const newInst = (pageInstances[workspacePageType] || []).find(i => i.id === newInstanceId);
    if (!newInst) return;

    if (newInst.state?.canvasSnapshot) {
      // Restore previously saved blank-tab state
      const snap = newInst.state.canvasSnapshot;
      const cy = cyRef.current;
      if (cy) {
        isHistoryRestoringRef.current = true;
        try {
          cy.elements().remove();
          cy.json(snap.cyJson);
          hydrateCyNodeCards(cy);
        } finally {
          isHistoryRestoringRef.current = false;
        }
        // Preserve the tab's saved baseline so a tab with unsaved edits still
        // reads as "Unsaved" after switching back. Older snapshots predate the
        // field — fall back to treating the restored state as clean.
        resetCanvasHistory(
          serializeCanvasHistorySnapshot(cy),
          snap.savedSignature !== undefined ? snap.savedSignature : undefined,
        );
        requestAnimationFrame(() => cy.fit(undefined, 50));
      }
      setSimMeta(snap.simMeta || { name: '', description: '' });
      setSimSavedId(snap.simSavedId || null);
      setSimConfig(snap.simConfig || {
        dateRange: { start: 2025, end: 2025 },
        purificationPct: 30,
        strategicStorageMinPct: 70,
        priorityMode: 'weighted',
      });
      setSimResults(snap.simResults || null);
      setSimChartData(snap.simChartData || []);
      setSimRegionalData(snap.simRegionalData || {});
      setSelectedDemandScenario(snap.selectedDemandScenario || null);
      setManualDemands(snap.manualDemands || {});
      setDemandInputMode(snap.demandInputMode || 'scenario');
      setSimError(null);
      setViewMode('canvas');
      setNodeNameMap({});
    } else if (newInst.state?.simulationId || newInst.state?.canvasId || newInst.state?.simulationConfigId) {
      // Saved simulation with no snapshot: the URL param effect loads from DB.
      return;
    } else {
      // New blank instance with no snapshot — start clean
      clearForNewSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInstanceId, clearForNewSimulation, pageInstances, resetCanvasHistory, saveCanvasSnapshotToInstance, isControlledSnapshot]);

  // Fire when URL param changes: load a saved simulation by ID
  useEffect(() => {
    if (isControlledSnapshot) return;
    const simId = params?.id;
    if (!simId) return; // Blank URL: instance-switch effect manages state; initial render is blank

    const activeInst = (pageInstances[workspacePageType] || []).find(i => i.id === activeInstanceIdRef.current);
    if (activeInst?.state?.canvasSnapshot) return;

    // Poll until cyRef is ready (Cytoscape mounts asynchronously), then load.
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // up to ~4s in total (40 × 100ms)
    const poll = () => {
      if (cyRef.current) {
        loadCytoSimulationById(simId);
      } else if (attempts < MAX_ATTEMPTS) {
        attempts++;
        setTimeout(poll, 100);
      } else {
        console.warn('[NS2] Cytoscape not ready after timeout — giving up load for', simId);
      }
    };
    const timer = setTimeout(poll, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, isControlledSnapshot]);

  const handleRunSimulation = useCallback(async () => {
    const cy = cyRef.current;
    if (!cy) return;

    const VALID_SIM_TYPES = ['plant','tank','point','node','pump','stp','filling-station','distribution-point'];
    const DELIVERY_SIM_TYPES = ['point','filling-station','distribution-point'];
    const entityNodes = cy.nodes().filter(n => VALID_SIM_TYPES.includes(n.data('type')));
    if (entityNodes.length === 0) {
      alert('Add at least one entity (plant, tank, point…) before running the simulation.');
      return;
    }

    const entities = entityNodes.map(n => {
      const d = n.data();
      const pos = n.position();
      const obj = {
        id: d.id,
        type: d.type,
        name: d.name || d.id,
        status: normalizeAssetStatus(d.status),
        capacity: Number(d.capacity || 0),
        canvasX: pos.x,
        canvasY: pos.y,
        isActive: d.active !== false && d.active !== 'false',
      };
      if (d.region) obj.region = d.region;
      // Persist the line-style pair AND a back-compat percentage value when
      // the limitation is in percent mode (legacy backend field).
      if (d.capacityLimitationType && d.capacityLimitationType !== 'none' && d.capacityLimitationValue !== '' && d.capacityLimitationValue !== undefined) {
        obj.capacityLimitationType = d.capacityLimitationType;
        obj.capacityLimitationValue = Number(d.capacityLimitationValue);
        if (d.capacityLimitationType === 'percentage') {
          obj.capacityLimitPercentage = Number(d.capacityLimitationValue);
        }
      } else if (d.capacityUsageLimit !== undefined && d.capacityUsageLimit !== '') {
        // Pure legacy path for any node data that hasn't been migrated yet.
        obj.capacityLimitPercentage = Number(d.capacityUsageLimit);
      }
      if (d.activity) obj.activity = d.activity;
      if (d.assetType) obj.assetType = d.assetType;
      if (d.plantType) obj.plantType = d.plantType;
      if (d.commissioningDate) obj.commissioningDate = d.commissioningDate;
      if (d.decommissioningDate) obj.decommissioningDate = d.decommissioningDate;
      if (d.type === 'pump' && Array.isArray(d.pumps) && d.pumps.length) obj.pumps = d.pumps;
      return obj;
    });

    const validNodeIds = new Set(entityNodes.map(n => n.id()));
    const lines = cy.edges()
      .filter(e => validNodeIds.has(e.source().id()) && validNodeIds.has(e.target().id()))
      .map(e => {
        const d = e.data();
        const srcPos = e.source().position();
        const tgtPos = e.target().position();
        const obj = {
          id: d.id,
          fromEntityId: d.source,
          toEntityId: d.target,
          fromEntityType: e.source().data('type'),
          toEntityType: e.target().data('type'),
          canvasStartX: srcPos.x,
          canvasStartY: srcPos.y,
          canvasEndX: tgtPos.x,
          canvasEndY: tgtPos.y,
          name: d.name || 'Pipe',
          capacity: Number(d.capacity || 0),
          isActive: d.active !== false && d.active !== 'false',
        };
        if (d.pipelineLength) obj.pipelineLength = Number(d.pipelineLength);
        if (d.pipelineDiameter) obj.pipelineDiameter = Number(d.pipelineDiameter);
        if (d.pipelineMaterial) obj.pipelineMaterial = d.pipelineMaterial;
        obj.bidirectional = d.bidirectional === true || d.bidirectional === 'true';
        if (d.capacityLimitationType && d.capacityLimitationType !== 'none' && d.capacityLimitationValue !== '') {
          obj.capacityLimitationType = d.capacityLimitationType;
          obj.capacityLimitationValue = Number(d.capacityLimitationValue || 0);
        }
        if (d.commissioningDate) obj.commissioningDate = d.commissioningDate;
        if (d.decommissioningDate) obj.decommissioningDate = d.decommissioningDate;
        if (d.transmissionSystemId) obj.transmissionSystemId = d.transmissionSystemId;
        if (d.lineGroupId) obj.lineGroupId = d.lineGroupId;
        if (d.parentLineId) obj.parentLineId = d.parentLineId;
        if (d.branchName) obj.branchName = d.branchName;
        if (d.isBranch === true || d.isBranch === 'true') obj.isBranch = true;
        return obj;
      });

    const regions = [...new Set(
      entityNodes.filter(n => n.data('region')).map(n => n.data('region'))
    )];
    if (regions.length === 0) regions.push('All');

    const purPct = Math.min(100, Math.max(0, simConfig.purificationPct));
    const desPct = 100 - purPct;

    // ── Build point_regions / point_governorates / point_names mappings ──────
    const point_regions = {};
    const point_governorates = {};
    const point_names = {};
    cy.nodes().filter(n => DELIVERY_SIM_TYPES.includes(n.data('type'))).forEach(n => {
      const d = n.data();
      if (d.region) point_regions[d.id] = d.region;
      if (d.governorate) point_governorates[d.id] = d.governorate;
      point_names[d.id] = d.displayLabel || d.name || d.id;
    });

    // ── Transform scenario → { region: { "YYYY-MM-DD": demand } } ───────────
    // (mirrors the full transformation done in SimulationPage.js)
    let scenarioForRun = null;
    let targetDemands = null;
    let targetType = null;
    let regionFilter = null;

    if (demandInputMode === 'manual') {
      // Manual mode: build daily dates covering the full range
      const { start, end } = simConfig.dateRange;
      const _mStart = new Date(start, 0, 1);
      const _mEnd   = new Date(end, 11, 31);
      const manualDates = [];
      for (let d = new Date(_mStart); d <= _mEnd; d.setDate(d.getDate() + 1)) {
        manualDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
      const scenarioData = {};
      cy.nodes().filter(n => DELIVERY_SIM_TYPES.includes(n.data('type'))).forEach(n => {
        const demand = manualDemands[n.id()];
        if (demand && demand > 0) {
          const region = n.data('region') || 'Manual_Input';
          if (!scenarioData[region]) scenarioData[region] = {};
          manualDates.forEach(date => {
            scenarioData[region][date] = (scenarioData[region][date] || 0) + demand;
          });
        }
      });
      scenarioForRun = Object.keys(scenarioData).length > 0 ? scenarioData : null;

    } else if (selectedDemandScenario?.data) {
      const scenarioObj = selectedDemandScenario.data;
      const inputs = scenarioObj.inputs || {};

      // ── Target-based scenario ───────────────────────────────────────────
      if (inputs.use_target_mode && inputs.targets?.length > 0) {
        targetType = inputs.targets[0].target_type;
        const dailyByTarget = scenarioObj.forecast_data?.daily_by_target
                           || scenarioObj.forecast_data?.daily_by_region
                           || {};
        targetDemands = {};
        Object.entries(dailyByTarget).forEach(([tName, dailyData]) => {
          if (!Array.isArray(dailyData) || dailyData.length === 0) return;
          const first = dailyData[0];
          targetDemands[tName] = {
            target_type: first.target_type || targetType,
            region: first.region || tName,
            demands: {},
          };
          dailyData.forEach(day => {
            targetDemands[tName].demands[day.date] = day.forecast || 0;
          });
        });
        scenarioForRun = {};  // leave empty – target_demands takes over
        regionFilter = null;

      // ── Region / target data in new format ──────────────────────────────
      } else if (scenarioObj.forecast_data?.daily_by_region || scenarioObj.forecast_data?.daily_by_target) {
        const dataSource = scenarioObj.forecast_data.daily_by_target || scenarioObj.forecast_data.daily_by_region;
        scenarioForRun = {};
        Object.entries(dataSource).forEach(([regionName, dailyArr]) => {
          scenarioForRun[regionName] = {};
          (dailyArr || []).forEach(day => {
            scenarioForRun[regionName][day.date] = day.forecast || 0;
          });
        });
        const regionKeys = Object.keys(scenarioForRun);
        regionFilter = regionKeys.length === 1 ? regionKeys[0] : null;

      // ── Legacy aggregated daily_forecasts ──────────────────────────────
      } else if (scenarioObj.forecast_data?.daily_forecasts) {
        const regionManual = inputs.region_manual || {};
        const rKeys = Object.keys(regionManual);
        if (rKeys.length > 0) {
          const totalWeight = rKeys.reduce((s, r) => s + (regionManual[r]?.lcd || 1.0), 0);
          scenarioForRun = {};
          rKeys.forEach(regionName => {
            const proportion = (regionManual[regionName]?.lcd || 1.0) / totalWeight;
            scenarioForRun[regionName] = {};
            scenarioObj.forecast_data.daily_forecasts.forEach(day => {
              scenarioForRun[regionName][day.date] = (day.forecast || 0) * proportion;
            });
          });
          regionFilter = rKeys.length === 1 ? rKeys[0] : null;
        }

      // ── Fallback: already in correct format ─────────────────────────────
      } else if (scenarioObj.outputs?.forecast) {
        scenarioForRun = scenarioObj.outputs.forecast;
      }

      // Determine regionFilter if not already set
      if (regionFilter === undefined) {
        if (!inputs.use_target_mode && inputs.region_manual) {
          const rk = Object.keys(inputs.region_manual);
          regionFilter = rk.length === 1 ? rk[0] : null;
        } else {
          regionFilter = null;
        }
      }
    }

    const payload = {
      entities,
      lines,
      regions,
      scenario: scenarioForRun,
      dateRange: simConfig.dateRange,
      deliveryPointOrder: [],
      flowPercentages: { desalination: desPct, purification: purPct },
      priorityMode: simConfig.priorityMode || 'weighted',
      strategicStorageMinPct: Math.min(100, Math.max(0, Number(simConfig.strategicStorageMinPct || 0))),
      point_regions: Object.keys(point_regions).length > 0 ? point_regions : null,
      point_governorates: Object.keys(point_governorates).length > 0 ? point_governorates : null,
      point_names: Object.keys(point_names).length > 0 ? point_names : null,
      target_demands: targetDemands,
      target_type: targetType,
      region_filter: regionFilter,
    };

    setSimRunning(true);
    setSimElapsed(0);
    setSimError(null);
    clearSimulationOverlay();
    simTimerRef.current = setInterval(() => setSimElapsed(s => s + 1), 1000);
    setRightPanelTab('results');
    setShowRightPanel(true);

    try {
      const resp = await apiClient.post('/api/cyto-simulations/run/', payload, { timeout: 3600000, noRetry: true }); // Legacy flow endpoint remains the shared engine facade.
      const data = resp.data;
      if (data.success) {
        const cy = cyRef.current;
        const nameMap = {};
        if (cy) {
          cy.nodes().forEach(n => {
            const d = n.data();
            nameMap[d.id] = d.displayLabel || d.name || d.id;
            // Also register with plant_ prefix so backend plant bottleneck IDs resolve
            if (d.entityType === 'plant' || d.type === 'plant') {
              nameMap[`plant_${d.id}`] = nameMap[d.id];
            }
          });
          cy.edges().forEach(e => {
            const d = e.data();
            // If the pipe has an explicit name use it; otherwise build "From → To"
            let edgeName = d.name && d.name !== d.id ? d.name : null;
            if (!edgeName) {
              const srcName = nameMap[d.source] || d.source;
              const tgtName = nameMap[d.target] || d.target;
              if (srcName !== d.source || tgtName !== d.target) {
                edgeName = `${srcName} → ${tgtName}`;
              }
            }
            nameMap[d.id] = edgeName || d.id;
          });
        }
        setNodeNameMap(nameMap);
        setSimResults(data);
        setSimEntities(entities);
        setSimScenario(selectedDemandScenario || null);
        setSimRunConfig({
          dateRange: simConfig.dateRange,
          purificationPct: simConfig.purificationPct,
          strategicStorageMinPct: simConfig.strategicStorageMinPct,
          priorityMode: simConfig.priorityMode || 'weighted',
          demandInputMode,
        });

        // ── Compute simChartData from daily_series (column-oriented) ─────
        const ds0 = data.results?.daily_series || {};
        const dsDates = ds0.dates || [];
        const scenForecast = selectedDemandScenario?.data?.forecast_data;
        const scenDailyMap = {};
        if (scenForecast?.daily_forecasts) {
          scenForecast.daily_forecasts.forEach(d => { scenDailyMap[d.date?.substring(0,10)] = d; });
        }
        const builtChartData = dsDates.map((date, i) => {
          const supply = Object.values(ds0.delivered || {}).reduce((a, vals) => a + (vals[i] || 0), 0);
          const shortage = Object.values(ds0.shortages || {}).reduce((a, vals) => a + (vals[i] || 0), 0);
          const scenDay = scenDailyMap[date.substring(0, 10)];
          const demand = scenDay ? Number(scenDay.forecast || 0) : supply + shortage;
          return { date: date.substring(0, 10), supply, demand, shortage };
        });
        setSimChartData(builtChartData);

        // ── Compute simRegionalData from daily_series.regional_analysis ──
        const regionalAcc = {};
        Object.entries(ds0.regional_analysis || {}).forEach(([region, arrays]) => {
          regionalAcc[region] = {
            dates: dsDates.map(d => d.substring(0, 10)),
            demand: arrays.demand,
            delivered: arrays.delivered,
            shortage: arrays.shortage,
            satisfaction: arrays.satisfaction,
          };
        });
        setSimRegionalData(regionalAcc);

        // Default the canvas to the LAST day of the run (latest state), then draw.
        const _nDays = (data.results?.daily_series?.dates || []).length;
        const _startIdx = _nDays > 0 ? _nDays - 1 : null;
        setOverlayDayIdx(_startIdx);
        applySimulationOverlay(data.results, _startIdx);
      } else {
        const joinedErrors = (data.errors || []).filter(Boolean).join('\n');
        const errMsg = joinedErrors
          || data.error || data.message || data.detail
          || 'Simulation returned success=false with no error details.';
        setSimError(errMsg);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const errData = err.response?.data;
      const fallback = err.message || 'Network error.';
      const msg = detail
        || (errData && typeof errData === 'string' ? errData : null)
        || (errData?.error || errData?.message)
        || fallback;
      setSimError(`${err.response ? `HTTP ${err.response.status}: ` : ''}${msg}`);
    } finally {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
      setSimRunning(false);
    }
  }, [simConfig, selectedDemandScenario, demandInputMode, manualDemands, applySimulationOverlay, clearSimulationOverlay]);

  const handleSaveSimulation = useCallback(async () => {
    commitActiveNoteEditorRef.current?.();
    const cy = cyRef.current;
    if (!cy || !simMeta.name.trim()) return;

    // 'distribution-point' kept here for back-compat — legacy nodes that
    // somehow didn't get re-coerced still serialise correctly.
    const VALID_SIM_TYPES = ['plant','tank','point','node','pump','stp','filling-station','distribution-point'];
    const entityNodes = cy.nodes().filter(n => VALID_SIM_TYPES.includes(n.data('type')));
    const entities = entityNodes.map(n => {
      const d = n.data();
      const pos = n.position();
      const obj = {
        id: d.id,
        type: d.type,
        name: d.name || d.id,
        status: normalizeAssetStatus(d.status),
        capacity: Number(d.capacity || 0),
        canvasX: pos.x,
        canvasY: pos.y,
        isActive: d.active !== false && d.active !== 'false',
      };
      if (d.region) obj.region = d.region;
      if (d.governorate) obj.governorate = d.governorate;
      // New line-style pair (preferred). Always serialise the type so 'none'
      // is explicit; only serialise the value when there's something to keep.
      if (d.capacityLimitationType) obj.capacityLimitationType = d.capacityLimitationType;
      if (d.capacityLimitationValue !== '' && d.capacityLimitationValue !== undefined && d.capacityLimitationValue !== null) {
        obj.capacityLimitationValue = d.capacityLimitationValue;
      }
      // Legacy field — keep writing it when the limit is a percentage so any
      // older reader still works.
      if (d.capacityLimitationType === 'percentage' && d.capacityLimitationValue) {
        obj.capacityUsageLimit = d.capacityLimitationValue;
      } else if (d.capacityUsageLimit) {
        obj.capacityUsageLimit = d.capacityUsageLimit;
      }
      if (d.activity) obj.activity = d.activity;
      if (d.assetType) obj.assetType = d.assetType;
      if (d.commissioningDate) obj.commissioningDate = d.commissioningDate;
      if (d.decommissioningDate) obj.decommissioningDate = d.decommissioningDate;
      if (d.type === 'pump' && Array.isArray(d.pumps) && d.pumps.length) obj.pumps = d.pumps;
      return obj;
    });

    const validNodeIds = new Set(entityNodes.map(n => n.id()));
    const lines = cy.edges()
      .filter(e => validNodeIds.has(e.source().id()) && validNodeIds.has(e.target().id()))
      .map(e => {
        const d = e.data();
        const srcPos = e.source().position();
        const tgtPos = e.target().position();
        const obj = {
          id: d.id,
          fromEntityId: d.source,
          toEntityId: d.target,
          fromEntityType: e.source().data('type'),
          toEntityType: e.target().data('type'),
          canvasStartX: srcPos.x,
          canvasStartY: srcPos.y,
          canvasEndX: tgtPos.x,
          canvasEndY: tgtPos.y,
          name: d.name || 'Pipe',
          capacity: Number(d.capacity || 0),
          isActive: d.active !== false && d.active !== 'false',
        };
      if (d.pipelineLength) obj.pipelineLength = Number(d.pipelineLength);
      if (d.pipelineDiameter) obj.pipelineDiameter = Number(d.pipelineDiameter);
      if (d.pipelineMaterial) obj.pipelineMaterial = d.pipelineMaterial;
      obj.bidirectional = d.bidirectional === true || d.bidirectional === 'true';
      if (d.capacityLimitationType && d.capacityLimitationType !== 'none' && d.capacityLimitationValue !== '') {
        obj.capacityLimitationType = d.capacityLimitationType;
        obj.capacityLimitationValue = Number(d.capacityLimitationValue || 0);
      }
      if (d.transmissionSystemId) obj.transmissionSystemId = d.transmissionSystemId;
      if (d.lineGroupId) obj.lineGroupId = d.lineGroupId;
      if (d.parentLineId) obj.parentLineId = d.parentLineId;
      if (d.branchName) obj.branchName = d.branchName;
      if (d.isBranch === true || d.isBranch === 'true') obj.isBranch = true;
      // Persist edge bend points so a saved canvas restores its kinked/segmented
      // pipes instead of snapping back to straight lines on reload. The
      // cytoscape-edge-editing plugin stores bends as parallel (weight, distance)
      // arrays that are relative to the edge endpoints, so they survive node moves.
      const bendWeights = Array.isArray(d.cyedgebendeditingWeights)
        ? d.cyedgebendeditingWeights.map(Number).filter(Number.isFinite)
        : [];
      const bendDistances = Array.isArray(d.cyedgebendeditingDistances)
        ? d.cyedgebendeditingDistances.map(Number).filter(Number.isFinite)
        : [];
      if (bendWeights.length && bendWeights.length === bendDistances.length) {
        obj.bendWeights = bendWeights;
        obj.bendDistances = bendDistances;
      }
      return obj;
    });

    const boxes = cy.nodes()
      .filter(n => ['note', 'group-box'].includes(n.data('type')))
      .map(n => {
        const d = n.data();
        const pos = n.position();
        const type = d.type === 'note' ? 'note' : 'group-box';
        const boxWidth = Number(d.boxWidth || (type === 'note' ? 220 : 240));
        const boxHeight = Number(d.boxHeight || (type === 'note' ? 100 : 160));
        const obj = {
          id: d.id,
          type,
          name: d.name || (type === 'note' ? 'Note' : 'Group'),
          displayLabel: d.displayLabel || d.name || (type === 'note' ? 'Note' : 'Group'),
          canvasX: pos.x,
          canvasY: pos.y,
          boxWidth,
          boxHeight,
        };
        if (type === 'note') {
          obj.noteHtml = d.noteHtml || escapeNoteHtml(d.name || d.displayLabel || '');
          obj.noteTextMaxWidth = Number(d.noteTextMaxWidth || Math.max(80, boxWidth - 24));
          obj.noteFont = d.noteFont || 'sans';
          obj.noteFontSize = d.noteFontSize || 'normal';
          obj.noteBold = d.noteBold ?? 'false';
          obj.noteItalic = d.noteItalic ?? 'false';
          obj.noteUnderline = d.noteUnderline ?? 'false';
        }
        return obj;
      });

    const regions = [...new Set(entityNodes.filter(n => n.data('region')).map(n => n.data('region')))];
    if (regions.length === 0) regions.push('All');

    const purPct = Math.min(100, Math.max(0, simConfig.purificationPct));
    const strategicStorageMinPct = Math.min(100, Math.max(0, Number(simConfig.strategicStorageMinPct || 0)));
    const savePayload = {
      name: simMeta.name.trim(),
      description: simMeta.description.trim() || null,
      entities,
      lines,
      boxes,
      configuration: {
        regions,
        scenario: selectedDemandScenario?.data || null,
        dateRange: simConfig.dateRange,
        deliveryPointOrder: [],
        flowPercentages: { desalination: 100 - purPct, purification: purPct },
        priorityMode: simConfig.priorityMode || 'weighted',
        strategicStorageMinPct,
        demandInputMode,
        manualDemands: demandInputMode === 'manual' ? manualDemands : {},
      },
    };

    setSimSaving(true);
    setSimSaveStatus('idle');
    try {
      if (isControlledSnapshot) {
        const force = controlledSaveAsRef.current;
        controlledSaveAsRef.current = false;
        if (!force && !historyState.isDirty) {
          setSimSaveStatus('saved');
          window.setTimeout(() => setSimSaveStatus('idle'), 1500);
          return;
        }
        const saved = await onControlledSave({
          ...savePayload,
          lineGroups,
          canvasSnapshot: { entities, lines, boxes, lineGroups },
          force,
        });
        if (saved?.name) setSimMeta(previous => ({ ...previous, name: saved.name }));
        if (saved?.id) setSimSavedId(saved.id);
        savedSignatureRef.current = historyRef.current.currentSignature;
        updateHistoryState();
        setSimSaveStatus('saved');
        window.setTimeout(() => setSimSaveStatus('idle'), 1500);
        window.dispatchEvent(new CustomEvent('swiims:network-canvas-saved'));
        return;
      }
      const isUpdate = Boolean(simSavedId);
      const workspaceSavePayload = isConfigurationSnapshot
        ? {
            name: savePayload.name,
            description: savePayload.description,
            networkCanvasId: configurationRecordRef.current?.networkCanvasId || null,
            demandScenarioId: configurationRecordRef.current?.demandScenarioId || null,
            horizonStart: configurationRecordRef.current?.horizonStart || simConfig.dateRange.start,
            horizonEnd: configurationRecordRef.current?.horizonEnd || simConfig.dateRange.end,
            canvasSnapshot: { entities, lines, boxes, lineGroups },
            configuration: configurationRecordRef.current?.configuration || {},
          }
        : isNetworkCanvas ? { ...savePayload, lineGroups } : savePayload;
      const resp = isUpdate
        ? await apiClient.put(`${workspaceApiBase}/${simSavedId}`, workspaceSavePayload)
        : await apiClient.post(workspaceApiBase, workspaceSavePayload);
      const savedId = resp.data?.id || resp.data?.simulation_id || simSavedId || true;
      setSimSavedId(savedId);
      setSimSaveStatus('saved');
      // The live canvas is now the persisted state — clear the dirty flag so the
      // header reads "Saved" until the next edit. Done before buildCanvasSnapshot
      // below so the per-tab snapshot records the new clean baseline.
      savedSignatureRef.current = historyRef.current.currentSignature;
      updateHistoryState();
      if (savedId && savedId !== true && activeInstanceIdRef.current) {
        updatePageInstance(workspacePageType, activeInstanceIdRef.current, {
          title: simMeta.name.trim() || (isNetworkCanvas ? 'Network Canvas' : 'Network Simulation'),
          state: {
            path: isConfigurationSnapshot ? `${workspaceBasePath}/${savedId}/canvas` : `${workspaceBasePath}/${savedId}`,
            ...(isNetworkCanvas ? { canvasId: savedId } : isConfigurationSnapshot ? { simulationConfigId: savedId } : { simulationId: savedId }),
            canvasSnapshot: buildCanvasSnapshot({ simSavedId: savedId }),
          },
        });
      }
      window.setTimeout(() => setSimSaveStatus('idle'), 1500);
      // Notify the cyto sidebar to refresh its list immediately
      window.dispatchEvent(new CustomEvent(isNetworkCanvas ? 'swiims:network-canvas-saved' : isConfigurationSnapshot ? 'swiims:simulation-config-saved' : 'swiims:cyto-simulation-saved'));
    } catch (err) {
      setSimError(err.response?.data?.detail || err.message || 'Save failed.');
    } finally {
      setSimSaving(false);
    }
  }, [simConfig, simMeta, selectedDemandScenario, demandInputMode, manualDemands, simSavedId, buildCanvasSnapshot, updatePageInstance, workspaceApiBase, workspacePageType, workspaceBasePath, isNetworkCanvas, isConfigurationSnapshot, isControlledSnapshot, onControlledSave, historyState.isDirty, lineGroups, updateHistoryState]);

  // Save-As trigger: fires handleSaveSimulation once the rename + null id
  // have actually committed. setTimeout would capture the stale closure.
  useEffect(() => {
    if (pendingSaveAsName && simMeta.name === pendingSaveAsName && simSavedId == null) {
      setPendingSaveAsName(null);
      handleSaveSimulation();
    }
  }, [pendingSaveAsName, simMeta.name, simSavedId, handleSaveSimulation]);

  // ── Edit selected element ────────────────────────────────────────────────────
  const handleEditSelected = useCallback(() => {
    if (!selectedEl) return;
    if (selectedEl._group === 'node') {
      const liveNode = cyRef.current?.getElementById(selectedEl.id);
      const isBoxLike = selectedEl.type === 'note' || selectedEl.type === 'group-box';
      const boxWidth = selectedEl.boxWidth || (isBoxLike && liveNode?.length ? Math.round(liveNode.outerWidth()) : undefined);
      const boxHeight = selectedEl.boxHeight || (isBoxLike && liveNode?.length ? Math.round(liveNode.outerHeight()) : undefined);
      setEntityModal({
        open: true, mode: 'edit',
        form: {
          ...selectedEl,
          type: selectedEl.type || 'plant',
          ...(boxWidth ? { boxWidth, noteTextMaxWidth: Math.max(80, Number(boxWidth) - 24) } : {}),
          ...(boxHeight ? { boxHeight } : {}),
        },
        editId: selectedEl.id,
      });
    } else {
      // Multi-line membership: derive the current set from lineGroups so the
      // checkbox list opens with every group this pipe is already part of
      // ticked. Falls back to the legacy single `lineGroupId` if the pipe
      // hasn't been migrated yet.
      const currentLineGroupIds = lineGroups
        .filter(g => (g.type === 'line' || g.type === 'branch') && (g.pipeIds || []).includes(selectedEl.id))
        .map(g => g.id);
      setPipeModal({
        open: true, mode: 'edit',
        form: {
          ...selectedEl,
          bidirectional: selectedEl.bidirectional === 'true',
          infraSource: selectedEl.infraSource || '',
          isBranch: Boolean(selectedEl.branchName || selectedEl.parentLineId),
          capacityLimitationType: selectedEl.capacityLimitationType || 'none',
          active: selectedEl.active !== false && selectedEl.active !== 'false',
          lineGroupIds: currentLineGroupIds.length ? currentLineGroupIds : (selectedEl.lineGroupId ? [selectedEl.lineGroupId] : []),
        },
        editId: selectedEl.id,
      });
    }
  }, [selectedEl, lineGroups]);

  // ── App-level contextual toolbar ──────────────────────────────────────────────
  useEffect(() => {
    const config = {
      // Keep this tool-heavy ribbon fully visible without horizontal scrolling.
      staticFit: true,
      // The right-side `xx%` and `N selected` indicators now live in the
      // bottom status bar / right-panel detail view. Don't surface them here.
      groups: [
        {
          name: 'File',
          buttons: [
            {
              id: 'file-save',
              label: 'Save',
              icon: IconSave,
              onClick: handleSaveSimulation,
              disabled: simSaving || !simMeta.name?.trim(),
              tooltip: !simMeta.name?.trim() ? 'Enter a network or simulation name first' : 'Save current canvas',
            },
            {
              id: 'file-save-as',
              label: 'Save As',
              icon: IconCopy,
              onClick: () => {
                const proposed = simMeta.name?.trim() ? `${simMeta.name.trim()} (copy)` : '';
                const newName = window.prompt('Save canvas as - enter a new name:', proposed);
                if (!newName?.trim()) return;
                const trimmed = newName.trim();
                controlledSaveAsRef.current = true;
                setSimSavedId(null);
                setSimMeta(previous => ({ ...previous, name: trimmed }));
                setPendingSaveAsName(trimmed);
              },
              disabled: simSaving,
              tooltip: 'Create a saved copy of this canvas',
            },
            {
              id: 'file-import',
              label: 'Import',
              icon: IconUpload,
              onClick: () => importInputRef.current?.click(),
              tooltip: 'Import canvas from JSON file',
            },
            {
              id: 'file-export-json',
              label: 'Export JSON',
              shortLabel: 'JSON',
              icon: IconDownload,
              onClick: () => handleExport('json'),
              tooltip: 'Export canvas as JSON',
            },
            {
              id: 'file-export-csv',
              label: 'Export CSV',
              shortLabel: 'CSV',
              icon: IconDownload,
              onClick: () => handleExport('csv'),
              tooltip: 'Export nodes & edges as CSV',
            },
          ],
        },
        {
          name: 'History',
          buttons: [
            {
              id: 'history-undo',
              label: 'Undo',
              icon: IconRotateCcw,
              onClick: handleUndo,
              disabled: !historyState.canUndo,
              tooltip: historyState.canUndo ? 'Undo last canvas change' : 'No changes to undo yet',
            },
            {
              id: 'history-redo',
              label: 'Redo',
              icon: IconRotateCw,
              onClick: handleRedo,
              disabled: !historyState.canRedo,
              tooltip: historyState.canRedo ? 'Redo last undone canvas change' : 'No changes to redo yet',
            },
          ],
        },
        {
          // Merged Create Assets + Connect — every way to introduce a new
          // element to the canvas lives here.
          name: 'Insert',
          buttons: [
            ...ENTITY_TYPES_LIST.map(et => ({
              id: `insert-${et.key}`,
              label: et.label,
              icon: et.icon,
              onClick: () => handleStartPlaceEntity(et.key),
              active: mode === 'place-entity' && pendingPlacementRef.current?.entityType === et.key,
              tooltip: `Insert ${et.label}`,
            })),
            {
              id: 'library-toggle',
              label: 'Asset Library',
              shortLabel: 'Library',
              icon: IconFolder,
              onClick: () => setShowLibrary(v => !v),
              active: showLibrary,
              tooltip: showLibrary ? 'Close Asset Library' : 'Open Asset Library',
            },
            {
              id: 'connect-pipe',
              label: 'Pipe',
              icon: IconPipe,
              onClick: () => mode === 'draw-pipe' ? exitMode() : changeMode('draw-pipe'),
              active: mode === 'draw-pipe',
              tooltip: mode === 'draw-pipe' ? 'Cancel Pipe Drawing' : 'Draw Pipe (click source then target)',
            },
            {
              id: 'connect-insert-on-pipe',
              label: 'Insert on Pipe',
              shortLabel: 'On Pipe',
              icon: IconPlusCircle,
              onClick: () => mode === 'insert-on-edge' ? exitMode() : changeMode('insert-on-edge'),
              active: mode === 'insert-on-edge',
              tooltip: mode === 'insert-on-edge' ? 'Cancel' : 'Insert entity on a pipe (splits it)',
            },
          ],
        },
        // Clipboard buttons now live in the Edit group below (single Edit
        // section combines copy/paste with edit/delete).
        {
          // Merged Select & Find + State — every way to select / find / filter
          // elements on the canvas lives here.
          name: 'Select',
          buttons: [
            {
              id: 'view-select-all',
              label: 'Select All',
              shortLabel: 'All',
              icon: IconSelect,
              onClick: handleSelectAll,
              tooltip: 'Select all elements',
            },
            {
              id: 'adv-find',
              label: 'Find Asset',
              shortLabel: 'Find',
              icon: IconSearch,
              onClick: handleFindAsset,
              active: rightPanelTab === 'issues' && issuePanelMode === 'find',
              tooltip: 'Search the current canvas by name, ID, type, region, or source asset',
            },
            {
              id: 'view-zoom-sel',
              label: 'Zoom to Sel',
              shortLabel: 'To Sel',
              icon: IconCrosshair,
              onClick: handleZoomToSelection,
              tooltip: selectedCount > 0 ? 'Zoom to selected elements' : 'Zoom to fit all',
            },
            {
              id: 'adv-isolate',
              label: isSelectionIsolated ? 'Clear Isolate' : 'Isolate Selection',
              shortLabel: isSelectionIsolated ? 'Unisolate' : 'Isolate',
              icon: EmptyIcon,
              onClick: handleIsolateSelection,
              active: isSelectionIsolated,
              disabled: selectedCount === 0 && !isSelectionIsolated,
              tooltip: selectedCount === 0 && !isSelectionIsolated ? 'Select nodes or pipes to isolate' : 'Dim everything outside the selected subnetwork',
            },
            {
              id: 'state-select-active',
              label: 'Select Active',
              shortLabel: 'Active',
              icon: IconActive,
              onClick: () => handleSelectByActiveState(true),
              tooltip: 'Select active assets and pipes',
            },
            {
              id: 'state-select-inactive',
              label: 'Select Inactive',
              shortLabel: 'Inactive',
              icon: IconEyeOff,
              onClick: () => handleSelectByActiveState(false),
              tooltip: 'Select inactive assets and pipes',
            },
            {
              id: 'state-activate',
              label: 'Make Active',
              shortLabel: 'Activate',
              icon: EmptyIcon,
              onClick: () => handleSetSelectedActive(true),
              disabled: selectedNetworkElementCount === 0,
              tooltip: selectedNetworkElementCount === 0 ? 'Select assets or pipes first' : 'Set selected assets and pipes active',
            },
            {
              id: 'state-deactivate',
              label: 'Make Inactive',
              shortLabel: 'Inactive',
              icon: IconStop,
              onClick: () => handleSetSelectedActive(false),
              disabled: selectedNetworkElementCount === 0,
              tooltip: selectedNetworkElementCount === 0 ? 'Select assets or pipes first' : 'Set selected assets and pipes inactive',
            },
          ],
        },
        {
          name: 'View',
          buttons: [
            {
              id: 'view-fit',
              label: 'Fit',
              icon: IconMaximize2,
              onClick: handleFitToScreen,
              tooltip: 'Fit to screen',
            },
            {
              id: 'view-area-zoom',
              label: 'Area Zoom',
              shortLabel: 'Area',
              icon: IconMaximize,
              onClick: () => mode === 'area-zoom' ? exitMode() : changeMode('area-zoom'),
              active: mode === 'area-zoom',
              tooltip: mode === 'area-zoom' ? 'Cancel area zoom' : 'Drag a rectangle to zoom into that region',
            },
            {
              id: 'view-labels',
              label: 'Labels',
              icon: IconTag,
              onClick: () => setShowLabels(v => !v),
              active: showLabels,
              tooltip: showLabels ? 'Hide labels' : 'Show labels',
            },
            {
              id: 'view-grid',
              label: 'Grid',
              icon: IconGrid,
              onClick: () => setShowGrid(v => !v),
              active: showGrid,
              tooltip: showGrid ? 'Hide grid' : 'Show grid',
            },
            {
              id: 'view-trace-delivery',
              label: 'Trace Delivery',
              shortLabel: 'Trace HP',
              icon: IconDistributionNetwork,
              onClick: () => mode === 'trace' ? exitMode() : changeMode('trace'),
              active: mode === 'trace',
              tooltip: mode === 'trace' ? 'Exit delivery trace mode' : 'Activate, then click a handover point or city gate to trace its upstream delivery path',
            },
            {
              id: 'adv-reset-view',
              label: 'Reset View',
              shortLabel: 'Reset',
              icon: IconRefresh,
              onClick: handleResetAdvancedView,
              tooltip: 'Clear temporary highlights, isolation, selection, and fit canvas',
            },
          ],
        },
        {
          name: 'Review',
          buttons: [
            ...(isCanvasEditor ? [{
              id: 'review-group-lines', label: 'Group Lines', shortLabel: 'Group Lines', icon: IconGitBranch,
              onClick: handleCreateLineGroup, disabled: selectedCount === 0,
              tooltip: 'Group selected pipeline segments as a line, branch, or transmission system',
            }] : []),
            {
              id: 'adv-validate',
              label: 'Validate Network',
              shortLabel: 'Validate',
              icon: IconCheckSquare,
              onClick: handleValidateNetwork,
              tooltip: 'Run advisory checks on the current canvas',
            },
            {
              id: 'adv-show-issues',
              label: 'Show Issues',
              shortLabel: 'Issues',
              icon: IconAlertTriangle,
              onClick: handleShowIssues,
              active: rightPanelTab === 'issues' && issuePanelMode === 'issues',
              tooltip: validationIssues.length ? `Show ${validationIssues.length} validation result${validationIssues.length === 1 ? '' : 's'}` : 'Show validation results',
            },
            {
              id: 'review-focus-issues',
              label: 'Focus Issues',
              shortLabel: 'Focus',
              icon: IconCrosshair,
              onClick: focusFirstValidationIssue,
              tooltip: 'Validate and focus the first actionable issue',
            },
            {
              id: 'review-select-disconnected',
              label: 'Select Disconnected',
              shortLabel: 'Disconnected',
              icon: IconAlertTriangle,
              onClick: handleSelectDisconnected,
              tooltip: 'Select disconnected assets on the canvas',
            },
            {
              id: 'review-select-missing-capacity',
              label: 'Select Missing Capacity',
              shortLabel: 'No Capacity',
              icon: EmptyIcon,
              onClick: handleSelectMissingCapacity,
              tooltip: 'Select assets and pipes with zero or missing capacity',
            },
            {
              id: 'review-select-inactive',
              label: 'Select Inactive',
              shortLabel: 'Inactive',
              icon: IconEyeOff,
              onClick: handleSelectInactiveConnected,
              tooltip: 'Select inactive assets that are still connected',
            },
            {
              id: 'review-clear-highlights',
              label: 'Clear Highlights',
              shortLabel: 'Clear Marks',
              icon: EmptyIcon,
              onClick: handleClearHighlights,
              tooltip: 'Clear temporary highlights, isolation, demand flags, and selection without changing data',
            },
          ],
        },
        {
          name: 'Arrange',
          buttons: [
            {
              id: 'arr-align-left',
              label: 'Align Left',
              shortLabel: 'Left',
              icon: IconAlignLeft,
              onClick: handleAlignLeft,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Align left edges',
            },
            {
              id: 'arr-align-center-h',
              label: 'Center H',
              shortLabel: 'Center H',
              icon: IconAlignCenter,
              onClick: handleAlignCenterH,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Center horizontally',
            },
            {
              id: 'arr-align-right',
              label: 'Align Right',
              shortLabel: 'Right',
              icon: IconAlignRight,
              onClick: handleAlignRight,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Align right edges',
            },
            {
              id: 'arr-align-top',
              label: 'Align Top',
              shortLabel: 'Top',
              icon: IconArrowUp,
              onClick: handleAlignTop,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Align top edges',
            },
            {
              id: 'arr-align-middle-v',
              label: 'Center V',
              shortLabel: 'Center V',
              icon: IconMinus,
              onClick: handleAlignMiddleV,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Center vertically',
            },
            {
              id: 'arr-align-bottom',
              label: 'Align Bottom',
              shortLabel: 'Bottom',
              icon: IconArrowDown,
              onClick: handleAlignBottom,
              disabled: selectedCount < 2,
              tooltip: selectedCount < 2 ? 'Select 2+ nodes' : 'Align bottom edges',
            },
            {
              id: 'arr-distribute-h',
              label: 'Distrib H',
              shortLabel: 'Dist H',
              icon: IconAlignJustify,
              onClick: handleDistributeH,
              disabled: selectedCount < 3,
              tooltip: selectedCount < 3 ? 'Select 3+ nodes' : 'Distribute horizontally',
            },
            {
              id: 'arr-distribute-v',
              label: 'Distrib V',
              shortLabel: 'Dist V',
              icon: IconGrid,
              onClick: handleDistributeV,
              disabled: selectedCount < 3,
              tooltip: selectedCount < 3 ? 'Select 3+ nodes' : 'Distribute vertically',
            },
          ],
        },
        {
          name: 'Layout',
          buttons: [
            {
              id: 'layout-grid',
              label: 'Grid',
              icon: EmptyIcon,
              onClick: () => handleAutoLayout('grid'),
              tooltip: 'Arrange all nodes in a grid',
            },
            {
              id: 'layout-circle',
              label: 'Circle',
              icon: EmptyIcon,
              onClick: () => handleAutoLayout('circle'),
              tooltip: 'Arrange all nodes in a circle',
            },
            {
              id: 'layout-tree',
              label: 'Tree',
              icon: EmptyIcon,
              onClick: () => handleAutoLayout('breadthfirst'),
              tooltip: 'Arrange nodes as a directed tree',
            },
            {
              id: 'layout-force',
              label: 'Force',
              icon: EmptyIcon,
              onClick: () => handleAutoLayout('cose'),
              tooltip: 'Force-directed layout (physics-based)',
            },
          ],
        },
        {
          name: 'Annotate',
          buttons: [
            {
              id: 'ann-note',
              label: 'Add Note',
              shortLabel: 'Note',
              icon: IconFileText,
              onClick: handleAddNote,
              active: mode === 'place-note',
              tooltip: mode === 'place-note' ? 'Cancel note placement' : 'Click on canvas to place a sticky note',
            },
            {
              id: 'ann-group-box',
              label: 'Group Box',
              shortLabel: 'Group',
              icon: IconSquare,
              onClick: handleCreateGroupBox,
              disabled: selectedCount === 0,
              tooltip: selectedCount === 0 ? 'Select nodes to group' : 'Create a visual group box around selected nodes',
            },
          ],
        },
        {
          name: 'Note Format',
          // Single-row layout: the font/size dropdowns + A↓/A↑ + B/I/U pills
          // don't read well in the default 3-row column grid.
          flow: 'row',
          buttons: [
            // Word-style font family dropdown. Falls back from execCommand
            // (inline-selection formatting) to whole-note data update.
            {
              id: 'note-font',
              variant: 'select',
              label: 'Font',
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Font family',
              value: selectedNoteState.font || 'sans',
              options: NOTE_FONTS.map(k => ({ value: k, label: NOTE_FONT_LABELS[k] || k })),
              onChange: (val) => {
                const fontName = val === 'serif' ? 'Georgia' : val === 'mono' ? 'Consolas' : 'Arial';
                if (runActiveNoteCommand('fontName', fontName)) return;
                updateSelectedNotes({ noteFont: val });
              },
              disabled: selectedNoteState.count === 0,
            },
            // Word-style size dropdown. Mirrors the size-step button mapping
            // for execCommand's 1-7 fontSize scale.
            {
              id: 'note-size',
              variant: 'select',
              label: 'Size',
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Text size',
              value: selectedNoteState.fontSize || 'normal',
              options: [
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
                { value: 'xlarge', label: 'Extra Large' },
              ],
              onChange: (val) => {
                const execSize = val === 'small' ? '2' : val === 'normal' ? '3' : val === 'large' ? '4' : '5';
                if (runActiveNoteCommand('fontSize', execSize)) return;
                updateSelectedNotes({ noteFontSize: val });
              },
              disabled: selectedNoteState.count === 0,
            },
            // Word-style A↓ / A↑ buttons — step text size one level smaller
            // or larger. Re-uses the existing handleStepSelectedNoteSize
            // logic. Variant 'icon-only' so they pick up the grouped-pill
            // CSS that groups them visually as a unit.
            {
              id: 'note-size-down',
              label: 'Decrease size',
              variant: 'icon-only',
              icon: () => <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, fontFamily: 'Georgia, serif' }}>A</span>,
              onClick: () => handleStepSelectedNoteSize(-1),
              disabled: selectedNoteState.count === 0 || selectedNoteState.fontSize === 'small',
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Decrease text size',
            },
            {
              id: 'note-size-up',
              label: 'Increase size',
              variant: 'icon-only',
              icon: () => <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, fontFamily: 'Georgia, serif' }}>A</span>,
              onClick: () => handleStepSelectedNoteSize(1),
              disabled: selectedNoteState.count === 0 || selectedNoteState.fontSize === 'xlarge',
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Increase text size',
            },
            // Word/Excel-style B/I/U pill: icon-only, no label, adjacent
            // buttons collapse into one grouped pill via the
            // `toolbar-button--icon-only` CSS rules.
            {
              id: 'note-bold',
              label: 'Bold',
              icon: IconBold,
              variant: 'icon-only',
              onClick: () => updateSelectedNotes({ noteBold: selectedNoteState.allBold ? 'false' : 'true' }),
              active: selectedNoteState.allBold,
              disabled: selectedNoteState.count === 0,
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Bold (Ctrl+B)',
            },
            {
              id: 'note-italic',
              label: 'Italic',
              icon: IconItalic,
              variant: 'icon-only',
              onClick: () => updateSelectedNotes({ noteItalic: selectedNoteState.allItalic ? 'false' : 'true' }),
              active: selectedNoteState.allItalic,
              disabled: selectedNoteState.count === 0,
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Italic (Ctrl+I)',
            },
            {
              id: 'note-underline',
              label: 'Underline',
              icon: IconUnderline,
              variant: 'icon-only',
              onClick: () => updateSelectedNotes({ noteUnderline: selectedNoteState.allUnderline ? 'false' : 'true' }),
              active: selectedNoteState.allUnderline,
              disabled: selectedNoteState.count === 0,
              tooltip: selectedNoteState.count === 0 ? 'Select one or more notes' : 'Underline (Ctrl+U)',
            },
          ],
        },
        {
          // Merged Edit + Clipboard — every operation on the current selection
          // (copy, paste, edit, delete) lives here.
          name: 'Edit',
          buttons: [
            {
              id: 'clip-copy-selection',
              label: 'Copy Selection',
              shortLabel: 'Copy Sel',
              icon: IconCopy,
              onClick: () => handleCopyNetwork('selection'),
              disabled: selectedCount === 0,
              tooltip: selectedCount === 0 ? 'Select nodes/assets to copy' : 'Copy selected network elements',
            },
            {
              id: 'clip-copy-all',
              label: 'Copy All',
              shortLabel: 'Copy All',
              icon: IconCopy,
              onClick: () => handleCopyNetwork('all'),
              tooltip: 'Copy the full current network canvas',
            },
            {
              id: 'clip-paste',
              label: 'Paste',
              icon: IconClipboard,
              onClick: handlePasteNetwork,
              disabled: !hasNetworkClipboard,
              tooltip: hasNetworkClipboard ? 'Paste copied network into this canvas' : 'Copy a network first',
            },
            {
              id: 'edit-edit',
              label: 'Edit',
              icon: IconEdit2,
              onClick: handleEditSelected,
              disabled: !selectedEl,
              tooltip: selectedEl ? 'Edit selected element' : 'Select an element first',
            },
            {
              id: 'edit-delete',
              label: 'Delete',
              icon: IconTrash2,
              onClick: handleDeleteSelected,
              disabled: !selectedEl,
              tooltip: selectedEl ? 'Delete selected element' : 'Select an element first',
            },
          ],
        },
        {
          name: 'Run',
          buttons: [
            {
              id: 'sim-run',
              label: simRunning ? 'Running…' : 'Run',
              icon: IconPlay,
              onClick: handleRunSimulation,
              disabled: simRunning,
              tooltip: 'Run water flow simulation on the current canvas',
            },
            {
              id: 'sim-clear',
              label: 'Clear',
              icon: EmptyIcon,
              onClick: clearSimulationOverlay,
              disabled: !simResults && !simError,
              tooltip: 'Clear simulation results overlay',
            },
          ],
        },
        {
          name: 'Panel',
          buttons: [
            {
              id: 'panel-details',
              label: 'Details',
              icon: showRightPanel ? IconChevronRight : IconChevronLeft,
              onClick: () => setShowRightPanel(v => !v),
              active: showRightPanel,
              tooltip: showRightPanel ? 'Hide details panel' : 'Show details panel',
            },
          ],
        },
      ],
    };
    // Network Canvas is an editor only. Running/configuring belongs to the
    // separate Simulation Config workspace and must not leak into this toolbar.
    if (isCanvasEditor) {
      config.groups = config.groups.filter(group => group.name !== 'Run');
    }
    setToolbar(config);
    return () => setToolbar(null);
  }, [mode, zoom, selectedEl, selectedCount, selectedNetworkElementCount, selectedNoteState.count,
      selectedNoteState.font, selectedNoteState.fontSize, selectedNoteState.allBold,
      selectedNoteState.allItalic, selectedNoteState.allUnderline,
      showLabels, showGrid, showLibrary, showRightPanel,
      hasNetworkClipboard,
      simRunning, simResults, simError, historyState, validationIssues.length, rightPanelTab, issuePanelMode, isSelectionIsolated,
      handleStartPlaceEntity, changeMode, exitMode, handleFitToScreen,
      handleZoomIn, handleZoomOut, handleEditSelected, handleDeleteSelected,
      handleUndo, handleRedo,
      handleExport, handleImport, handleCopyNetwork, handlePasteNetwork,
      handleSetSelectedActive, handleSelectByActiveState,
      handleAlignLeft, handleAlignCenterH, handleAlignRight,
      handleAlignTop, handleAlignMiddleV, handleAlignBottom,
      handleDistributeH, handleDistributeV,
      handleSelectAll, handleZoomToSelection,
      handleAutoLayout, handleAddNote, handleCreateGroupBox,
      handleCycleSelectedNoteFont, handleStepSelectedNoteSize, updateSelectedNotes,
      handleAreaZoomStart, handleAreaZoomMove, handleAreaZoomEnd,
      handleValidateNetwork, handleShowIssues, handleFindAsset, handleIsolateSelection, handleCreateLineGroup, handleResetAdvancedView,
      focusFirstValidationIssue, handleSelectDisconnected, handleSelectMissingCapacity, handleSelectInactiveConnected, handleClearHighlights,
      handleRunSimulation, clearSimulationOverlay, handleSaveSimulation, isCanvasEditor,
      setToolbar]);

  // ── Filtered library assets ──────────────────────────────────────────────────
  const filteredLibraryAssets = useMemo(() => {
    const search = librarySearch.toLowerCase();
    return libraryAssets.filter(asset => {
      if (search && !asset._name.toLowerCase().includes(search) &&
          !(asset.activity || '').toLowerCase().includes(search)) return false;
      if (libraryRegion && asset.region !== libraryRegion) return false;
      if (libraryCategory && asset._entityType !== libraryCategory) return false;
      return true;
    });
  }, [libraryAssets, librarySearch, libraryRegion, libraryCategory]);

  // ── Which library assets are already on canvas (by id AND by name) ──────────
  // Recomputed whenever the canvas structurally changes (canvasVersion), so the
  // library's "on canvas" state and duplicate blocking stay accurate.
  const { placedAssetIds, placedAssetNames } = useMemo(() => {
    const cy = cyRef.current;
    const ids = new Set();
    const names = new Set();
    if (cy) {
      cy.nodes().forEach(n => {
        const aid = n.data('assetId');
        if (aid != null && aid !== '') ids.add(String(aid));
        const nm = String(n.data('name') || '').trim().toLowerCase();
        if (nm) names.add(nm);
      });
    }
    return { placedAssetIds: ids, placedAssetNames: names };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasVersion]);

  const selectableFilteredLibraryAssets = useMemo(() => {
    return filteredLibraryAssets.filter(asset => {
      const alreadyPlaced = placedAssetIds.has(String(asset.id)) ||
        placedAssetNames.has(String(asset._name || asset.name || '').trim().toLowerCase());
      return !alreadyPlaced;
    });
  }, [filteredLibraryAssets, placedAssetIds, placedAssetNames]);

  const selectedLibraryAssets = useMemo(() => {
    const selectedIds = new Set(selectedLibraryAssetIds);
    return libraryAssets.filter(asset => selectedIds.has(String(asset.id)));
  }, [libraryAssets, selectedLibraryAssetIds]);

  const handleSelectVisibleLibraryAssets = useCallback(() => {
    setSelectedLibraryAssetIds(selectableFilteredLibraryAssets.map(asset => String(asset.id)));
  }, [selectableFilteredLibraryAssets]);

  const handleClearLibrarySelection = useCallback(() => {
    setSelectedLibraryAssetIds([]);
  }, []);

  const handlePlaceSelectedLibraryAssets = useCallback(() => {
    if (selectedLibraryAssets.length === 0) return;
    pendingPlacementRef.current = selectedLibraryAssets.length > 1
      ? { assets: selectedLibraryAssets }
      : { assetData: selectedLibraryAssets[0], entityType: selectedLibraryAssets[0]._entityType };
    changeMode('place-asset');
    setShowLibrary(false);
  }, [changeMode, selectedLibraryAssets]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Renders ──────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  const entityFormFields = (form, setForm) => {
    const type = form.type;
    const updateBoxSize = (patch) => {
      const next = { ...form, ...patch };
      if (type === 'note' && next.boxWidth) {
        next.noteTextMaxWidth = Math.max(80, Number(next.boxWidth || 220) - 24);
      }
      setForm(next);
    };

    // Notes and group boxes only need a label/description — skip all infrastructure fields
    if (type === 'note' || type === 'group-box') {
      return (
        <div className="ns2-form-grid">
          <div className="ns2-form-row ns2-form-row--full">
            <label className="ns2-label">{type === 'note' ? 'Note text' : 'Group name'}</label>
            <input
              className="ns2-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value, displayLabel: e.target.value })}
              placeholder={type === 'note' ? 'Enter note text…' : 'Enter group name…'}
              autoFocus
            />
          </div>
          <div className="ns2-form-row">
            <label className="ns2-label">Box Width</label>
            <input
              className="ns2-input"
              type="number"
              min={type === 'note' ? 120 : 160}
              max="1200"
              step="10"
              value={form.boxWidth || (type === 'note' ? 220 : 240)}
              onChange={e => updateBoxSize({ boxWidth: Number(e.target.value || 0) })}
            />
          </div>
          <div className="ns2-form-row">
            <label className="ns2-label">Box Height</label>
            <input
              className="ns2-input"
              type="number"
              min={type === 'note' ? 70 : 100}
              max="900"
              step="10"
              value={form.boxHeight || (type === 'note' ? 100 : 160)}
              onChange={e => updateBoxSize({ boxHeight: Number(e.target.value || 0) })}
            />
          </div>
          {type === 'note' && (
            <>
              <div className="ns2-form-row">
                <label className="ns2-label">Font</label>
                <select
                  className="ns2-input"
                  value={form.noteFont || 'sans'}
                  onChange={e => setForm({ ...form, noteFont: e.target.value })}
                >
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </div>
              <div className="ns2-form-row">
                <label className="ns2-label">Size</label>
                <select
                  className="ns2-input"
                  value={form.noteFontSize || 'normal'}
                  onChange={e => setForm({ ...form, noteFontSize: e.target.value })}
                >
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>
              {/* Word/Excel-style formatting button group: each button toggles
                  on/off, shows a pressed state when active, and groups together
                  with shared borders — same idiom as the Home ribbon's
                  B / I / U cluster. */}
              <div className="ns2-form-row ns2-form-row--full">
                <label className="ns2-label">Format</label>
                {(() => {
                  const isBold = form.noteBold === 'true' || form.noteBold === true;
                  const isItalic = form.noteItalic === 'true' || form.noteItalic === true;
                  const isUnderline = form.noteUnderline === 'true' || form.noteUnderline === true;
                  const baseBtn = {
                    width: 30,
                    height: 30,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    cursor: 'pointer',
                    color: '#24292f',
                    padding: 0,
                    boxSizing: 'border-box',
                  };
                  const activeStyle = {
                    background: '#dbeafe',
                    borderColor: '#3b82f6',
                    color: '#1d4ed8',
                  };
                  return (
                    <div
                      role="toolbar"
                      aria-label="Note formatting"
                      style={{
                        display: 'inline-flex',
                        borderRadius: 3,
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                      }}
                    >
                      <button
                        type="button"
                        aria-label="Bold"
                        aria-pressed={isBold}
                        title="Bold (Ctrl+B)"
                        onClick={() => setForm({ ...form, noteBold: isBold ? 'false' : 'true' })}
                        style={{
                          ...baseBtn,
                          ...(isBold ? activeStyle : {}),
                          borderRight: 'none',
                          borderTopLeftRadius: 3,
                          borderBottomLeftRadius: 3,
                          fontWeight: 700,
                        }}
                      >
                        <IconBold size={14} strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        aria-label="Italic"
                        aria-pressed={isItalic}
                        title="Italic (Ctrl+I)"
                        onClick={() => setForm({ ...form, noteItalic: isItalic ? 'false' : 'true' })}
                        style={{
                          ...baseBtn,
                          ...(isItalic ? activeStyle : {}),
                          borderRight: 'none',
                          fontStyle: 'italic',
                        }}
                      >
                        <IconItalic size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Underline"
                        aria-pressed={isUnderline}
                        title="Underline (Ctrl+U)"
                        onClick={() => setForm({ ...form, noteUnderline: isUnderline ? 'false' : 'true' })}
                        style={{
                          ...baseBtn,
                          ...(isUnderline ? activeStyle : {}),
                          borderTopRightRadius: 3,
                          borderBottomRightRadius: 3,
                          textDecoration: 'underline',
                        }}
                      >
                        <IconUnderline size={14} />
                      </button>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      );
    }

    if (type === 'node') {
      return (
        <div className="ns2-form-grid">
          <div className="ns2-form-row ns2-form-row--full">
            <label className="ns2-label">Name *</label>
            <input
              className="ns2-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Node name"
              autoFocus
            />
          </div>
        </div>
      );
    }

    const isCardEntity = !['node', 'pump'].includes(type);
    const activities = getRelevantActivities(type);
    const assetTypes = form.activity ? getAssetTypesForEntityAndActivity(type, form.activity) : [];

    return (
      <div className="ns2-form-grid">
        <div className="ns2-form-row ns2-form-row--full">
          <label className="ns2-label">Name *</label>
          <input className="ns2-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={`${ENTITY_TYPES_LIST.find(t => t.key === type)?.label || type} name`} />
        </div>

        {isCardEntity && (
          <>
            <div className="ns2-form-row">
              <label className="ns2-label">Activity</label>
              <select className="ns2-select" value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value, assetType: '' })}>
                <option value="">— Select activity —</option>
                {activities.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="ns2-form-row">
              <label className="ns2-label">Asset Type</label>
              <select className="ns2-select" value={form.assetType} onChange={e => setForm({ ...form, assetType: e.target.value })} disabled={!form.activity}>
                <option value="">— Select asset type —</option>
                {assetTypes.map(at => <option key={at} value={at}>{at}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="ns2-form-row">
          <label className="ns2-label">Status</label>
          <select className="ns2-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {ENTITY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {isCardEntity && (
          <>
            <div className="ns2-form-row">
              <label className="ns2-label">Capacity (m³/day)</label>
              <input className="ns2-input" type="number" min="0" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="e.g. 50000" />
            </div>
            {/* Capacity limitation — mirrors the transmission-line form so
                nodes and pipes share a consistent UX. */}
            <div className="ns2-form-row ns2-form-row--full">
              <label className="ns2-label">Capacity Limitation</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <input
                    type="radio"
                    name={`entity-cap-${form.type || 'x'}`}
                    checked={(form.capacityLimitationType || 'none') === 'none'}
                    onChange={() => setForm({ ...form, capacityLimitationType: 'none', capacityLimitationValue: '' })}
                  />
                  None
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <input
                    type="radio"
                    name={`entity-cap-${form.type || 'x'}`}
                    checked={form.capacityLimitationType === 'percentage'}
                    onChange={() => setForm({ ...form, capacityLimitationType: 'percentage' })}
                  />
                  Percentage (%)
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <input
                    type="radio"
                    name={`entity-cap-${form.type || 'x'}`}
                    checked={form.capacityLimitationType === 'absolute'}
                    onChange={() => setForm({ ...form, capacityLimitationType: 'absolute' })}
                  />
                  Absolute (m³/day)
                </label>
                {form.capacityLimitationType && form.capacityLimitationType !== 'none' && (
                  <input
                    className="ns2-input"
                    type="number"
                    min="0"
                    style={{ maxWidth: 160 }}
                    value={form.capacityLimitationValue}
                    onChange={e => setForm({ ...form, capacityLimitationValue: e.target.value })}
                    placeholder={form.capacityLimitationType === 'percentage' ? '0–100' : 'e.g. 5000'}
                  />
                )}
              </div>
            </div>
            <div className="ns2-form-row">
              <label className="ns2-label">Region</label>
              <select className="ns2-select" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>
                <option value="">— Select region —</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {type === 'plant' && (
              <div className="ns2-form-row">
                <label className="ns2-label">Entity Category</label>
                <select className="ns2-select" value={form.entityTypeCategory} onChange={e => setForm({ ...form, entityTypeCategory: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Private">Private</option>
                  <option value="Public">Public</option>
                </select>
              </div>
            )}
          </>
        )}

        {/* Junction nodes don't have a commissioning lifecycle — hide. */}
        {type !== 'node' && (
          <>
            <div className="ns2-form-row">
              <label className="ns2-label">Commissioning Date</label>
              <input className="ns2-input" type="date" value={form.commissioningDate} onChange={e => setForm({ ...form, commissioningDate: e.target.value })} />
            </div>
            <div className="ns2-form-row">
              <label className="ns2-label">Decommissioning Date</label>
              <input className="ns2-input" type="date" value={form.decommissioningDate} onChange={e => setForm({ ...form, decommissioningDate: e.target.value })} />
            </div>
          </>
        )}

        <div className="ns2-form-row ns2-form-row--checkbox">
          <label className="ns2-toggle">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
        </div>

        {type === 'pump' && (() => {
          const pumps = Array.isArray(form.pumps) && form.pumps.length
            ? form.pumps
            : [{ id: 'pump-1', name: 'Pump 1', role: 'functional', capacity: '', isActive: true }];
          const updatePumpAt = (idx, patch) => {
            const next = pumps.map((p, i) => i === idx ? { ...p, ...patch } : p);
            setForm({ ...form, pumps: next });
          };
          const addPump = (role) => {
            const n = pumps.length + 1;
            setForm({ ...form, pumps: [...pumps, { id: `pump-${Date.now()}-${n}`, name: `Pump ${n}`, role, capacity: '', isActive: true }] });
          };
          const removePumpAt = (idx) => {
            if (pumps.length <= 1) return;
            setForm({ ...form, pumps: pumps.filter((_, i) => i !== idx) });
          };
          const functionalCount = pumps.filter(p => (p.role || 'functional') === 'functional' && (p.isActive ?? true)).length;
          const backupCount = pumps.filter(p => p.role === 'backup').length;
          return (
            <div className="ns2-form-section ns2-form-row--full">
              <div className="ns2-form-section-title">
                Pump Configuration
                <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: '#57606a' }}>
                  {pumps.length} pump{pumps.length === 1 ? '' : 's'} · {functionalCount} active functional · {backupCount} backup
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pumps.map((pump, idx) => {
                  const role = pump.role || 'functional';
                  const isActive = pump.isActive ?? true;
                  return (
                    <div key={pump.id || idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto auto', gap: 6, alignItems: 'center', padding: 6, border: '1px solid #d0d7de', borderRadius: 4, background: isActive ? '#fff' : '#f6f8fa' }}>
                      <input
                        className="ns2-input"
                        value={pump.name || ''}
                        placeholder={`Pump ${idx + 1}`}
                        onChange={e => updatePumpAt(idx, { name: e.target.value })}
                      />
                      <input
                        className="ns2-input"
                        type="number"
                        min="0"
                        value={pump.capacity ?? ''}
                        placeholder="Capacity m³/day"
                        onChange={e => updatePumpAt(idx, { capacity: e.target.value })}
                      />
                      <select
                        className="ns2-select"
                        value={role}
                        onChange={e => updatePumpAt(idx, { role: e.target.value })}
                      >
                        <option value="functional">Functional</option>
                        <option value="backup">Backup</option>
                      </select>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={e => updatePumpAt(idx, { isActive: e.target.checked })}
                        />
                        {isActive ? 'On' : 'Off'}
                      </label>
                      <button
                        type="button"
                        className="ns2-btn ns2-btn--sm"
                        title={pumps.length <= 1 ? 'At least one pump is required' : 'Remove pump'}
                        disabled={pumps.length <= 1}
                        onClick={() => removePumpAt(idx)}
                      >×</button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button type="button" className="ns2-btn ns2-btn--sm" onClick={() => addPump('functional')}>+ Functional</button>
                  <button type="button" className="ns2-btn ns2-btn--sm" onClick={() => addPump('backup')}>+ Backup</button>
                </div>
                <p className="ns2-panel-hint" style={{ margin: '4px 0 0' }}>
                  Either role can be toggled on or off here — turning a functional pump off takes it out of the station's effective capacity; turning a backup pump on makes it count.
                </p>
              </div>
            </div>
          );
        })()}

        {type === 'plant' && (
          <div className="ns2-form-section ns2-form-row--full">
            <div className="ns2-form-section-title">Plant Details</div>
            <div className="ns2-form-grid">
              <div className="ns2-form-row">
                <label className="ns2-label">Plant Type</label>
                <select className="ns2-select" value={form.plantType} onChange={e => setForm({ ...form, plantType: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Desalination">Desalination</option>
                  <option value="Purification">Purification</option>
                  <option value="Treatment">Treatment</option>
                </select>
              </div>
              <div className="ns2-form-row">
                <label className="ns2-label">Technology</label>
                <input className="ns2-input" value={form.technology} onChange={e => setForm({ ...form, technology: e.target.value })} placeholder="e.g. RO, MSF" />
              </div>
              <div className="ns2-form-row">
                <label className="ns2-label">Water Source</label>
                <input className="ns2-input" value={form.waterSource} onChange={e => setForm({ ...form, waterSource: e.target.value })} placeholder="e.g. Seawater" />
              </div>
              <div className="ns2-form-row">
                <label className="ns2-label">Variable O&amp;M (SAR/m³)</label>
                <input className="ns2-input" type="number" step="0.01" min="0" value={form.variableOM} onChange={e => setForm({ ...form, variableOM: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pipeFormFields = (form, setForm) => (
    <div className="ns2-form-grid">
      <div className="ns2-form-row ns2-form-row--full">
        <label className="ns2-label">Pipe Name *</label>
        <input className="ns2-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Transmission Line" />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Capacity (m³/day)</label>
        <input className="ns2-input" type="number" min="0" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Length (km)</label>
        <input className="ns2-input" type="number" min="0" step="0.1" value={form.pipelineLength} onChange={e => setForm({ ...form, pipelineLength: e.target.value })} />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Diameter (mm)</label>
        <input className="ns2-input" type="number" min="0" value={form.pipelineDiameter} onChange={e => setForm({ ...form, pipelineDiameter: e.target.value })} placeholder="e.g. 1200" />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Material</label>
        <select className="ns2-select" value={form.pipelineMaterial} onChange={e => setForm({ ...form, pipelineMaterial: e.target.value })}>
          <option value="">— Select —</option>
          {PIPELINE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Design Capacity (m³/day)</label>
        <input className="ns2-input" type="number" min="0" value={form.designCapacity} onChange={e => setForm({ ...form, designCapacity: e.target.value })} />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Max Capacity (m³/day)</label>
        <input className="ns2-input" type="number" min="0" value={form.maximumCapacity} onChange={e => setForm({ ...form, maximumCapacity: e.target.value })} />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Source</label>
        <input className="ns2-input" value={form.infraSource} onChange={e => setForm({ ...form, infraSource: e.target.value })} placeholder="e.g. SWCC" />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Commissioning Date</label>
        <input className="ns2-input" type="date" value={form.commissioningDate} onChange={e => setForm({ ...form, commissioningDate: e.target.value })} />
      </div>
      <div className="ns2-form-row">
        <label className="ns2-label">Decommissioning Date</label>
        <input className="ns2-input" type="date" value={form.decommissioningDate} onChange={e => setForm({ ...form, decommissioningDate: e.target.value })} />
      </div>
      <div className="ns2-form-row ns2-form-row--full ns2-form-row--checkbox-group">
        <label className="ns2-toggle">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        <label className="ns2-toggle">
          <input type="checkbox" checked={form.bidirectional} onChange={e => setForm({ ...form, bidirectional: e.target.checked })} /> Bidirectional
        </label>
      </div>
      <div className="ns2-form-section ns2-form-row--full">
        <div className="ns2-form-section-title">Transmission Hierarchy</div>
        <div className="ns2-form-grid">
          <div className="ns2-form-row">
            <label className="ns2-label">Transmission System</label>
            <select className="ns2-select" value={form.transmissionSystemId || ''} onChange={e => setForm({ ...form, transmissionSystemId: e.target.value, newTransmissionSystemName: '' })}>
              <option value="">— Leave ungrouped —</option>
              {lineGroups.filter(group => group.type === 'transmission-system').map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
          <div className="ns2-form-row">
            <label className="ns2-label">…or create new system</label>
            <input className="ns2-input" value={form.newTransmissionSystemName || ''} disabled={Boolean(form.transmissionSystemId)} onChange={e => setForm({ ...form, newTransmissionSystemName: e.target.value })} placeholder="Type a name to create — e.g. Riyadh North System" />
          </div>
          <div className="ns2-form-row ns2-form-row--full">
            <label className="ns2-label">Transmission Lines <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 11 }}>(pipe can belong to multiple)</span></label>
            {(() => {
              const lines = lineGroups.filter(group => group.type === 'line' || group.type === 'branch');
              const selected = new Set(form.lineGroupIds || (form.lineGroupId ? [form.lineGroupId] : []));
              const toggle = (id) => {
                const next = new Set(selected);
                next.has(id) ? next.delete(id) : next.add(id);
                setForm({ ...form, lineGroupIds: [...next], lineGroupId: '' });
              };
              if (!lines.length) {
                return <div style={{ fontSize: 11, color: '#6b7280', padding: '6px 0' }}>No transmission lines yet — create one below.</div>;
              }
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto', padding: 6, border: '1px solid #d0d7de', borderRadius: 4, background: '#fff' }}>
                  {lines.map(group => {
                    const checked = selected.has(group.id);
                    return (
                      <label
                        key={group.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          fontSize: 11,
                          border: '1px solid',
                          borderColor: checked ? '#3b82f6' : '#d0d7de',
                          background: checked ? '#eff6ff' : '#fff',
                          borderRadius: 12,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggle(group.id)} />
                        <span>{group.name}{group.type === 'branch' ? ' (branch)' : ''}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div className="ns2-form-row ns2-form-row--full">
            <label className="ns2-label">New Transmission Line</label>
            <input className="ns2-input" value={form.newLineName || ''} onChange={e => setForm({ ...form, newLineName: e.target.value })} placeholder="e.g. Main Line A — creates a new line and adds this pipe to it" />
          </div>
          <div className="ns2-form-row ns2-form-row--full ns2-form-row--checkbox-group">
            <label className="ns2-toggle"><input type="checkbox" checked={Boolean(form.isBranch)} onChange={e => setForm({ ...form, isBranch: e.target.checked, parentLineId: e.target.checked ? form.parentLineId : '', branchName: e.target.checked ? form.branchName : '' })} /> This line is a branch</label>
          </div>
          {form.isBranch && <>
            <div className="ns2-form-row">
              <label className="ns2-label">Branch Of Line *</label>
              <select className="ns2-select" value={form.parentLineId || ''} onChange={e => setForm({ ...form, parentLineId: e.target.value })}>
                <option value="">Select parent line...</option>
                {lineGroups.filter(group => group.type === 'line').map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="ns2-form-row">
              <label className="ns2-label">Branch Name</label>
              <input className="ns2-input" value={form.branchName || ''} onChange={e => setForm({ ...form, branchName: e.target.value })} placeholder="e.g. Airport Branch" />
            </div>
          </>}
        </div>
      </div>
      <div className="ns2-form-row ns2-form-row--full">
        <label className="ns2-label">Capacity Limitation</label>
        <div className="ns2-radio-group">
          {[
            { value: 'none', label: 'None' },
            { value: 'percentage', label: 'Percentage (%)' },
            { value: 'absolute', label: 'Absolute (m³/day)' },
          ].map(opt => (
            <label key={opt.value} className="ns2-radio">
              <input type="radio" name="capLimitType" value={opt.value} checked={form.capacityLimitationType === opt.value} onChange={() => setForm({ ...form, capacityLimitationType: opt.value, capacityLimitationValue: '' })} />
              {opt.label}
            </label>
          ))}
        </div>
        {form.capacityLimitationType !== 'none' && (
          <input className="ns2-input ns2-input--sm" type="number" min="0" max={form.capacityLimitationType === 'percentage' ? 100 : undefined} value={form.capacityLimitationValue} onChange={e => setForm({ ...form, capacityLimitationValue: e.target.value })} placeholder={form.capacityLimitationType === 'percentage' ? '0–100' : 'm³/day'} />
        )}
      </div>
    </div>
  );

  // ─── Toolbar ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  const toolbar = (
    <div className="ns2-toolbar">
      {/* Insert group */}
      <div className="ns2-toolbar-group">
        <span className="ns2-toolbar-label">Insert</span>
        {ENTITY_TYPES_LIST.map(et => (
          <button
            key={et.key}
            className={`ns2-btn ns2-btn--entity ${mode === `place-entity` && pendingPlacementRef.current?.entityType === et.key ? 'ns2-btn--active' : ''}`}
            style={{ '--entity-color': ENTITY_TYPE_COLORS[et.key] }}
            title={`Insert ${et.label}`}
            onClick={() => handleStartPlaceEntity(et.key)}
          >
            <et.icon size={12} />
            <span>{et.abbr}</span>
          </button>
        ))}
      </div>
      <div className="ns2-toolbar-sep" />
      <div className="ns2-toolbar-group">
        <button
          className={`ns2-btn ${mode === 'draw-pipe' ? 'ns2-btn--active' : ''}`}
          title="Draw Pipe (click source then target)"
          onClick={() => mode === 'draw-pipe' ? exitMode() : changeMode('draw-pipe')}
        >
          <span className="ns2-btn-icon">━━</span> Pipe
        </button>
        <button
          className={`ns2-btn ${mode === 'insert-on-edge' ? 'ns2-btn--active' : ''}`}
          title="Insert entity on a pipe (click a pipe to split it)"
          onClick={() => mode === 'insert-on-edge' ? exitMode() : changeMode('insert-on-edge')}
        >
          <IconPlusCircle size={12} /> Insert on Pipe
        </button>
        <button
          className={`ns2-btn ${showLibrary ? 'ns2-btn--active' : ''}`}
          title="Toggle asset library"
          onClick={() => setShowLibrary(v => !v)}
        >
          <IconDatabase size={12} /> Library
        </button>
      </div>
      <div className="ns2-toolbar-sep" />
      {/* View group */}
      <div className="ns2-toolbar-group">
        <span className="ns2-toolbar-label">View</span>
        <button className="ns2-btn" title="Fit to screen" onClick={handleFitToScreen}><IconMaximize2 size={12} /></button>
        {/* Zoom in / out / percentage live in the bottom status bar now. */}
        <label className="ns2-toggle ns2-btn">
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
          <IconTag size={12} /> Labels
        </label>
        <label className="ns2-toggle ns2-btn">
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          <IconGrid size={12} /> Grid
        </label>
        <button
          className={`ns2-btn${mode === 'trace' ? ' ns2-btn--active' : ''}`}
          title="Trace Delivery: activate, then click a handover point or city gate to show its upstream supply path"
          onClick={() => (mode === 'trace' ? exitMode() : changeMode('trace'))}
        >
          <IconGitBranch size={12} /> Trace Delivery
        </button>
        <button
          className={`ns2-btn${mode === 'bottlenecks' ? ' ns2-btn--active' : ''}`}
          title="Highlight line & plant bottlenecks on the network"
          disabled={!simResults}
          onClick={() => (mode === 'bottlenecks' ? exitMode() : changeMode('bottlenecks'))}
        >
          <IconTarget size={12} /> Bottlenecks
        </button>
      </div>
      <div className="ns2-toolbar-sep" />
      {/* Edit group */}
      <div className="ns2-toolbar-group">
        <span className="ns2-toolbar-label">Edit</span>
        <button
          className="ns2-btn ns2-btn--danger"
          title="Delete selected"
          disabled={!selectedEl}
          onClick={handleDeleteSelected}
        >
          <IconTrash2 size={12} /> Delete
        </button>
      </div>
      {/* Right side: panel toggle */}
      <div className="ns2-toolbar-spacer" />
      {simResults && (
        <button
          className={`ns2-btn${viewMode === 'analytics' ? ' ns2-btn--active' : ' ns2-btn--primary'}`}
          onClick={() => setViewMode(v => v === 'analytics' ? 'canvas' : 'analytics')}
          title="Toggle analytics view"
        >
          <IconActivity size={12} /> Analytics
        </button>
      )}
      <button
        className={`ns2-btn ${showRightPanel ? 'ns2-btn--active' : ''}`}
        onClick={() => setShowRightPanel(v => !v)}
        title="Toggle details panel"
      >
        {showRightPanel ? <IconChevronRight size={12} /> : <IconChevronLeft size={12} />} Details
      </button>
    </div>
  );

  // ─── Mode banner ──────────────────────────────────────────────────────────────
  const modeBanner = mode !== 'default' && (
    <div className={`ns2-mode-banner ns2-mode-banner--${mode}`}>
      {mode === 'draw-pipe' && (
        lineSource
          ? `Source set: click the target node to connect`
          : `Draw Pipe mode — click the SOURCE node`
      )}
      {mode === 'insert-on-edge' && `Insert on Pipe mode — click a pipe to split it`}
      {mode === 'reconnect-endpoint' && `Change ${reconnectRef.current?.endpoint === 'target' ? 'destination' : 'source'} — click the new node for this pipe`}
      {(mode === 'place-entity' || mode === 'place-asset') && (
        pendingPlacementRef.current?.assets?.length > 1
          ? `Placing ${pendingPlacementRef.current.assets.length} selected assets — click on canvas to position`
          : pendingPlacementRef.current?.assetData
          ? `Placing asset "${pendingPlacementRef.current.assetData._name}" — click on canvas to position`
          : `Placing ${ENTITY_TYPE_ABBREVIATIONS[pendingPlacementRef.current?.entityType] || ''} entity — click on canvas`
      )}
      {mode === 'place-note' && `Annotation mode — click anywhere on the canvas to place a note`}
      {mode === 'area-zoom' && `Area Zoom — drag a rectangle to zoom into that region`}
      {mode === 'trace' && <><span>Trace Delivery active — click a handover point or city gate to trace its upstream supply path. (Delivered flow is shown when results are available)</span></>}
      {mode === 'bottlenecks' && <><span>Bottlenecks — </span><IconAlertTriangle size={12} /><span> pipes &amp; plants at capacity are highlighted in place; everything else is dimmed.</span></>}
      <button className="ns2-mode-cancel" onClick={exitMode}><span aria-hidden="true">×</span> Cancel</button>
    </div>
  );

  // ─── Library panel ────────────────────────────────────────────────────────────
  const libraryPanel = showLibrary && (
    <div className="ns2-library">
      <div className="ns2-library-header">
        <span className="ns2-library-title">Asset Library</span>
        <button className="ns2-icon-btn" onClick={() => setShowLibrary(false)}>×</button>
      </div>
      <div className="ns2-library-filters">
        <input
          className="ns2-input ns2-input--sm"
          placeholder="Search..."
          value={librarySearch}
          onChange={e => setLibrarySearch(e.target.value)}
        />
        <select className="ns2-select ns2-select--sm" value={libraryCategory} onChange={e => setLibraryCategory(e.target.value)}>
          <option value="">All types</option>
          {ENTITY_TYPES_LIST.filter(t => !['node', 'pump'].includes(t.key)).map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <select className="ns2-select ns2-select--sm" value={libraryRegion} onChange={e => setLibraryRegion(e.target.value)}>
          <option value="">All regions</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="ns2-library-selection">
        <span className="ns2-library-selection-count">
          {selectedLibraryAssetIds.length > 0 ? `${selectedLibraryAssetIds.length} selected` : 'Select assets to place together'}
        </span>
        <div className="ns2-library-selection-actions">
          <button
            className="ns2-btn ns2-btn--sm"
            onClick={handleSelectVisibleLibraryAssets}
            disabled={selectableFilteredLibraryAssets.length === 0}
            title="Select all visible assets that are not already on the canvas"
          >
            Select all
          </button>
          <button
            className="ns2-btn ns2-btn--sm"
            onClick={handleClearLibrarySelection}
            disabled={selectedLibraryAssetIds.length === 0}
          >
            Clear
          </button>
          <button
            className="ns2-btn ns2-btn--sm ns2-btn--primary"
            onClick={handlePlaceSelectedLibraryAssets}
            disabled={selectedLibraryAssetIds.length === 0}
            title="Click the canvas to place the selected assets as a group"
          >
            Place selected
          </button>
        </div>
      </div>
      <div className="ns2-library-body">
        {libraryLoading && <div className="ns2-library-empty">Loading assets...</div>}
        {!libraryLoading && filteredLibraryAssets.length === 0 && (
          <div className="ns2-library-empty">No assets found</div>
        )}
        {!libraryLoading && filteredLibraryAssets.map(asset => {
          const alreadyPlaced = placedAssetIds.has(String(asset.id)) ||
            placedAssetNames.has(String(asset._name || asset.name || '').trim().toLowerCase());
          return (
            <div
              key={asset.id}
              className={`ns2-library-item ${alreadyPlaced ? 'ns2-library-item--placed' : ''} ${selectedLibraryAssetIds.includes(String(asset.id)) ? 'ns2-library-item--selected' : ''}`}
              draggable={!alreadyPlaced}
              onDragStart={e => handleLibraryDragStart(e, asset)}
              onClick={() => !alreadyPlaced && handleLibraryAssetClick(asset)}
              title={alreadyPlaced ? 'Already on canvas' : 'Click or drag to place'}
            >
              <div className="ns2-library-item-header">
                {!alreadyPlaced && (
                  <input
                    type="checkbox"
                    className="ns2-library-item-checkbox"
                    checked={selectedLibraryAssetIds.includes(String(asset.id))}
                    onChange={e => {
                      e.stopPropagation();
                      handleToggleLibraryAssetSelection(asset);
                    }}
                    onClick={e => e.stopPropagation()}
                    title="Select for multi-place"
                  />
                )}
                <span
                  className="ns2-entity-badge"
                  style={{ background: ENTITY_TYPE_COLORS[asset._entityType] }}
                >
                  {ENTITY_TYPE_ABBREVIATIONS[asset._entityType]}
                </span>
                <span className="ns2-library-item-name">{asset._name}</span>
                {alreadyPlaced && <span className="ns2-placed-badge">on canvas</span>}
              </div>
              <div className="ns2-library-item-meta">
                {asset.region && <span className="ns2-meta-chip">{asset.region}</span>}
                {asset.activity && <span className="ns2-meta-chip ns2-meta-chip--activity">{asset.activity}</span>}
                {asset.status && (
                  <span className="ns2-meta-chip" style={{ background: getStatusColor(asset.status) + '22', color: getStatusColor(asset.status), border: `1px solid ${getStatusColor(asset.status)}40` }}>
                    {getStatusLabel(asset.status)}
                  </span>
                )}
              </div>
              {asset.capacity && (
                <div className="ns2-library-item-capacity">{Number(asset.capacity).toLocaleString()} m³/day</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Right panel ──────────────────────────────────────────────────────────────
  const issueCounts = validationIssues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});

  const issueBadgeText = validationIssues.length
    ? `${issueCounts.error || 0}/${issueCounts.warning || 0}`
    : '';

  const rightPanel = showRightPanel && (
    <div className="ns2-right-panel" onMouseDownCapture={handleRightPanelInteraction}>

      {/* Tab strip */}
      <div className="ns2-panel-tabs">
        <button
          className={`ns2-panel-tab${rightPanelTab === 'details' ? ' ns2-panel-tab--active' : ''}`}
          onClick={() => handleRightPanelTabChange('details')}
        >Details</button>
        {isCanvasEditor ? <>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'issues' && issuePanelMode === 'issues' ? ' ns2-panel-tab--active' : ''}${validationIssues.length ? ' ns2-panel-tab--has-data' : ''}`}
          onClick={() => { setIssuePanelMode('issues'); handleRightPanelTabChange('issues'); }}
          title={issueBadgeText ? `Errors / warnings: ${issueBadgeText}` : 'Advisory network validation'}
        >Validation</button>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'issues' && issuePanelMode === 'find' ? ' ns2-panel-tab--active' : ''}`}
          onClick={() => { setIssuePanelMode('find'); handleRightPanelTabChange('issues'); }}
        >Find</button>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'isolation' ? ' ns2-panel-tab--active' : ''}`}
          onClick={() => handleRightPanelTabChange('isolation')}
        >Isolation</button>
        </> : <>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'config' ? ' ns2-panel-tab--active' : ''}`}
          onClick={() => handleRightPanelTabChange('config')}
        >Config</button>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'results' ? ' ns2-panel-tab--active' : ''}${simResults ? ' ns2-panel-tab--has-data' : ''}`}
          onClick={() => handleRightPanelTabChange('results')}
        >Results</button>
        <button
          className={`ns2-panel-tab${rightPanelTab === 'issues' ? ' ns2-panel-tab--active' : ''}${validationIssues.length ? ' ns2-panel-tab--has-data' : ''}`}
          onClick={() => handleRightPanelTabChange('issues')}
          title={issueBadgeText ? `Errors / warnings: ${issueBadgeText}` : 'Validation and find tools'}
        >Issues</button>
        </>}
      </div>

      {/* ── DETAILS TAB ── */}
      {rightPanelTab === 'issues' && (
        <div className="ns2-panel-body ns2-panel-body--issues">
          <div className="ns2-adv-toggle">
            <button
              className={`ns2-adv-toggle-btn${issuePanelMode === 'issues' ? ' ns2-adv-toggle-btn--active' : ''}`}
              onClick={() => setIssuePanelMode('issues')}
            >
              <IconAlertTriangle size={12} /> Issues
            </button>
            <button
              className={`ns2-adv-toggle-btn${issuePanelMode === 'find' ? ' ns2-adv-toggle-btn--active' : ''}`}
              onClick={() => setIssuePanelMode('find')}
            >
              <IconSearch size={12} /> Find
            </button>
          </div>

          {issuePanelMode === 'issues' ? (
            <div className="ns2-issues-panel">
              <div className="ns2-issues-summary">
                <div>
                  <div className="ns2-issues-title">Network Validation</div>
                  <div className="ns2-issues-subtitle">
                    {validationIssues.length
                      ? `${issueCounts.error || 0} errors, ${issueCounts.warning || 0} warnings, ${issueCounts.info || 0} notes`
                      : 'Run validation to check the current canvas.'}
                  </div>
                </div>
                <button className="ns2-btn ns2-btn--sm" onClick={handleValidateNetwork}>
                  <IconCheckSquare size={12} /> Validate
                </button>
              </div>

              {validationIssues.length === 0 ? (
                <div className="ns2-panel-hint">No validation results yet.</div>
              ) : (
                <div className="ns2-issue-list">
                  {validationIssues.map(issue => {
                    const IssueIcon = issue.severity === 'error'
                      ? IconX
                      : issue.severity === 'success'
                        ? IconCheckSquare
                        : issue.severity === 'info'
                          ? IconFileText
                          : IconAlertTriangle;
                    return (
                      <button
                        key={issue.id}
                        type="button"
                        className={`ns2-issue-row ns2-issue-row--${issue.severity}`}
                        onClick={() => issue.elementId && focusCanvasElement(issue.elementId)}
                        disabled={!issue.elementId}
                        title={issue.elementId ? 'Focus on canvas' : undefined}
                      >
                        <span className="ns2-issue-icon"><IssueIcon size={14} /></span>
                        <span className="ns2-issue-copy">
                          <span className="ns2-issue-title">{issue.title}</span>
                          <span className="ns2-issue-detail">{issue.detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="ns2-find-panel">
              <label className="ns2-label">Find Asset</label>
              <input
                className="ns2-input"
                value={advancedSearch}
                onChange={e => setAdvancedSearch(e.target.value)}
                placeholder="Search name, ID, type, region..."
              />
              <div className="ns2-find-meta">
                {advancedSearch.trim()
                  ? `${findAssetResults.length} result${findAssetResults.length === 1 ? '' : 's'}`
                  : 'Search the current canvas.'}
              </div>
              <div className="ns2-find-results">
                {findAssetResults.map(result => (
                  <button
                    key={result.id}
                    type="button"
                    className="ns2-find-row"
                    onClick={() => focusCanvasElement(result.id)}
                  >
                    <span className="ns2-find-name">{result.name}</span>
                    <span className="ns2-find-detail">{result.type}{result.meta ? ` · ${result.meta}` : ''}</span>
                  </button>
                ))}
                {advancedSearch.trim() && findAssetResults.length === 0 && (
                  <div className="ns2-panel-hint">No matching canvas assets.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isCanvasEditor && rightPanelTab === 'isolation' && (
        <div className="ns2-panel-body ns2-panel-body--issues">
          <div className="ns2-issues-panel">
            {/* Create-bar so the panel always has an entry point, even on a
                fresh canvas with no groups yet. Both buttons prompt for a
                name and push a new lineGroup; the tree below picks it up
                immediately so the user can then assign pipes / branches. */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ns2-btn ns2-btn--sm ns2-btn--primary"
                onClick={() => {
                  const name = window.prompt('Name for the new transmission system:');
                  if (!name || !name.trim()) return;
                  setLineGroups(prev => [...prev, {
                    id: `transmission-system-${Date.now()}`,
                    name: name.trim(),
                    type: 'transmission-system',
                    pipeIds: [],
                    memberGroupIds: [],
                  }]);
                }}
              >+ New System</button>
              <button
                type="button"
                className="ns2-btn ns2-btn--sm"
                onClick={() => {
                  const name = window.prompt('Name for the new transmission line:');
                  if (!name || !name.trim()) return;
                  const selectedEdges = cyRef.current?.edges(':selected') || [];
                  setLineGroups(prev => [...prev, {
                    id: `line-${Date.now()}`,
                    name: name.trim(),
                    type: 'line',
                    parentId: null,
                    pipeIds: selectedEdges.map(e => e.id()),
                    memberGroupIds: [],
                  }]);
                }}
                title="Optionally select pipes on the canvas first — they'll be added to this line."
              >+ New Line</button>
              {selectedLineGroupIds.size > 0 && (
                <span style={{ fontSize: 11, color: '#475569', alignSelf: 'center', marginLeft: 4 }}>
                  {selectedLineGroupIds.size} line{selectedLineGroupIds.size === 1 ? '' : 's'} ticked — use a system row's “Add selected lines” to assign.
                </span>
              )}
            </div>
            {lineGroups.length === 0 && (
              <div className="ns2-panel-hint" style={{ marginBottom: 12 }}>
                No transmission systems or lines yet. Create one above, or edit any pipe and use its <b>Transmission Hierarchy</b> section.
              </div>
            )}
            {lineGroups.length > 0 && (() => {
              const systems = lineGroups.filter(group => group.type === 'transmission-system');
              const lineIdsInSystems = new Set(systems.flatMap(system => system.memberGroupIds || []));
              const rootLines = lineGroups.filter(group => group.type === 'line' && !group.parentId && !lineIdsInSystems.has(group.id));
              const looseBranches = lineGroups.filter(group => group.type === 'branch' && !lineGroups.some(line => line.id === group.parentId));
              const removeGroup = (groupId) => setLineGroups(previous => previous.filter(candidate => candidate.id !== groupId).map(candidate => ({ ...candidate, memberGroupIds: (candidate.memberGroupIds || []).filter(memberId => memberId !== groupId) })));
              // Recursive tree node — renders a line OR a branch. A branch
              // can itself have child branches (parentId === branch.id), so
              // expanding a branch walks into its sub-branches the same way
              // expanding a line walks into its branches. Pipes still live
              // on the group itself (pipeIds) and are summarised in the row.
              const isolateSinglePipe = (pipeId) => {
                const cy = cyRef.current;
                if (!cy) return;
                cy.$(':selected').unselect();
                const edge = cy.getElementById(pipeId);
                if (edge?.length) {
                  edge.select();
                  setSelectedCount(1);
                  setSelectedEl({ ...edge.data(), _group: 'edge' });
                  clearIsolation();
                  window.requestAnimationFrame(handleIsolateSelection);
                }
              };
              const renderGroup = (group, depth = 0) => {
                const isBranch = group.type === 'branch';
                const children = lineGroups.filter(g => g.type === 'branch' && g.parentId === group.id);
                const expanded = expandedLineGroupIds.has(group.id);
                const segmentsOpen = expandedSegmentGroupIds.has(group.id);
                const level = isBranch ? 'BRANCH' : 'LINE';
                const pipeIds = group.pipeIds || [];
                const segmentCount = pipeIds.length;
                return (
                  <div className={isBranch ? 'ns2-isolation-tree__branch' : 'ns2-isolation-tree__line'} key={group.id}>
                    <div className={`ns2-isolation-tree__row ns2-isolation-tree__row--${isBranch ? 'branch' : 'line'}`} style={depth ? { marginLeft: depth * 12 } : undefined}>
                      {isBranch && <span className="ns2-isolation-tree__branch-mark">└</span>}
                      {!isBranch && (
                        <input
                          type="checkbox"
                          checked={selectedLineGroupIds.has(group.id)}
                          onChange={() => setSelectedLineGroupIds(previous => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}
                          title="Select this line to assign it to a system"
                        />
                      )}
                      <button type="button" className="ns2-isolation-tree__focus" onClick={() => isolateLineGroup(group)}>
                        <span className="ns2-isolation-tree__level">{level}</span>
                        <strong>{group.name}</strong>
                        <small>{segmentCount} segment{segmentCount === 1 ? '' : 's'}{children.length ? ` · ${children.length} branch${children.length === 1 ? '' : 'es'}` : ''}</small>
                      </button>
                      {segmentCount > 0 && (
                        <button
                          className="ns2-isolation-tree__branches-toggle"
                          title="Show or hide this group's pipe segments"
                          onClick={() => setExpandedSegmentGroupIds(previous => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}
                        >
                          {segmentsOpen ? 'Hide segments' : `Segments (${segmentCount})`}
                        </button>
                      )}
                      {children.length > 0 && (
                        <button
                          className="ns2-isolation-tree__branches-toggle"
                          title={isBranch ? 'Show or hide this branch\'s sub-branches' : 'Show or hide this line\'s branches'}
                          onClick={() => setExpandedLineGroupIds(previous => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}
                        >
                          {expanded ? 'Hide' : `Branches (${children.length})`}
                        </button>
                      )}
                      <button
                        className="ns2-isolation-tree__assign"
                        title={isBranch ? 'Select pipe segments, then add a sub-branch under this branch' : 'Select pipe segments, then create a branch under this line'}
                        onClick={() => prepareBranchForLine(group)}
                      >Add branch</button>
                      <button className="ns2-isolation-tree__remove" title={`Delete ${isBranch ? 'branch' : 'line'}`} onClick={() => removeGroup(group.id)}>×</button>
                    </div>
                    {segmentsOpen && pipeIds.map(pipeId => {
                      const cy = cyRef.current;
                      const edge = cy?.getElementById(pipeId);
                      const data = edge?.length ? edge.data() : null;
                      const label = data?.name || data?.displayLabel || pipeId;
                      const missing = !edge?.length;
                      return (
                        <div
                          key={`${group.id}::${pipeId}`}
                          className="ns2-isolation-tree__row ns2-isolation-tree__row--segment"
                          style={{ marginLeft: (depth + 1) * 12 }}
                        >
                          <span className="ns2-isolation-tree__branch-mark">└</span>
                          <button
                            type="button"
                            className="ns2-isolation-tree__focus"
                            onClick={() => !missing && isolateSinglePipe(pipeId)}
                            disabled={missing}
                            title={missing ? 'This segment no longer exists on the canvas' : 'Isolate this pipe segment'}
                          >
                            <span className="ns2-isolation-tree__level">PIPE</span>
                            <strong>{label}</strong>
                            {missing && <small style={{ color: '#b91c1c' }}>missing on canvas</small>}
                          </button>
                        </div>
                      );
                    })}
                    {expanded && children.map(child => renderGroup(child, depth + 1))}
                  </div>
                );
              };
              const renderLine = (line) => renderGroup(line, 0);
              return <div className="ns2-isolation-tree">
                <div className="ns2-isolation-tree__title">Transmission Systems</div>
                {systems.map(system => <div className="ns2-isolation-tree__system" key={system.id}>
                  <div className="ns2-isolation-tree__row ns2-isolation-tree__row--system"><button type="button" className="ns2-isolation-tree__focus" onClick={() => isolateLineGroup(system)}><span className="ns2-isolation-tree__level">SYSTEM</span><strong>{system.name}</strong><small>{(system.memberGroupIds || []).map(id => lineGroups.find(group => group.id === id)).filter(group => group?.type === 'line').length} lines</small></button><button className="ns2-isolation-tree__assign" onClick={() => assignSelectedLinesToSystem(system.id)}>Add selected lines</button><button className="ns2-isolation-tree__remove" title="Delete system" onClick={() => removeGroup(system.id)}>×</button></div>
                  <div className="ns2-isolation-tree__children">{(system.memberGroupIds || []).map(id => lineGroups.find(group => group.id === id)).filter(group => group?.type === 'line').map(renderLine)}{!(system.memberGroupIds || []).length && <div className="ns2-isolation-tree__empty">No lines assigned. Select ungrouped lines below, then choose Add selected lines.</div>}</div>
                </div>)}
                {rootLines.length > 0 && <div className="ns2-isolation-tree__ungrouped"><div className="ns2-isolation-tree__title">Ungrouped Lines</div>{rootLines.map(renderLine)}</div>}
                {looseBranches.length > 0 && <div className="ns2-isolation-tree__ungrouped"><div className="ns2-isolation-tree__title">Unassigned Branches</div>{looseBranches.map(branch => renderGroup(branch, 0))}</div>}
              </div>;
            })()}
          </div>
        </div>
      )}

      {rightPanelTab === 'details' && (
        <div className="ns2-panel-body ns2-panel-body--details">
          {!selectedEl ? (
            <div className="ns2-panel-empty">
              <div className="ns2-panel-hint">Click a node or pipe to inspect</div>
              <div className="ns2-legend">
                <div className="ns2-legend-title">Canvas Legend</div>
                <div className="ns2-legend-group">
                  <div className="ns2-legend-subtitle">Lifecycle</div>
                  {[
                    ['Planned', STATUS_BORDER_COLORS.planned, 'solid'],
                    ['Operational', STATUS_BORDER_COLORS.operational, 'solid'],
                    ['Under construction', STATUS_BORDER_COLORS.under_construction, 'solid'],
                    ['Inactive', STATUS_BORDER_COLORS.inactive, 'dashed'],
                  ].map(([label, color, style]) => (
                    <div key={label} className="ns2-legend-row">
                      <span className="ns2-legend-dot" style={{ background: style === 'dashed' ? '#ffffff' : color, border: `2px ${style} ${color}`, borderRadius: 2 }} />
                      <span className="ns2-legend-label">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="ns2-legend-group">
                  <div className="ns2-legend-subtitle">Assets</div>
                  {[
                    ['Plant', IconPlant],
                    ['Tank', IconLayers],
                    ['Handover point', IconTarget],
                    ['Pump station', IconDroplet],
                    ['STP', IconPackage],
                    ['Filling station', IconBriefcase],
                    ['Junction', IconCircle],
                    ['Pipe', IconPipe],
                  ].map(([label, Icon]) => (
                    <div key={label} className="ns2-legend-row">
                      <span className="ns2-legend-icon"><Icon size={13} /></span>
                      <span className="ns2-legend-label">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="ns2-legend-group">
                  <div className="ns2-legend-subtitle">Run overlays</div>
                  {[
                    ['Capacity-limited', '#f59e0b', 'solid'],
                    ['High utilisation', '#7c3aed', 'solid'],
                    ['Bottleneck', '#dc2626', 'solid'],
                    ['Shortage point', '#dc2626', 'dashed'],
                  ].map(([label, color, style]) => (
                    <div key={label} className="ns2-legend-row">
                      <span className="ns2-legend-line" style={{ borderTop: `3px ${style} ${color}` }} />
                      <span className="ns2-legend-label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (() => {
            // Asset-tagging generated_id, falling back to "No ID" for entities
            // that were drawn directly on the canvas (no source asset).
            const generatedId =
              selectedEl.originalAsset?.generated_id ??
              selectedEl.generated_id ??
              null;
            const displayedGeneratedId = generatedId || 'No ID';
            // Badge background follows the card's icon-section status color
            // so the right panel visually matches the on-canvas card.
            const badgeColor = selectedEl._group === 'node'
              ? (STATUS_BORDER_COLORS[normalizeAssetStatus(selectedEl.status)] || '#57606a')
              : '#0969da';
            return (
            <div className="ns2-detail">
              <div className="ns2-detail-header">
                <span
                  className="ns2-entity-badge"
                  style={{ background: badgeColor }}
                >
                  {selectedEl._group === 'node'
                    ? (ENTITY_TYPE_ABBREVIATIONS[selectedEl.type] || selectedEl.type)
                    : 'PIPE'}
                </span>
                <span className="ns2-detail-heading">
                  <span className="ns2-detail-name">{selectedEl.name || selectedEl.id}</span>
                  <span className="ns2-detail-subtitle">{selectedEl._group === 'node' ? 'Selected node' : 'Selected pipe'} - Edit / Delete available</span>
                  {selectedEl._group === 'node' && (
                    <span className="ns2-detail-subtitle ns2-detail-generated-id">
                      ID: <strong>{displayedGeneratedId}</strong>
                    </span>
                  )}
                </span>
              </div>
              <table className="ns2-detail-table">
                <tbody>
                  {Object.entries(selectedEl)
                    .filter(([k]) =>
                      !k.startsWith('_') &&
                      ![
                        'id', 'abbr', 'displayLabel', 'hideLabel', 'hasCapacityLimit',
                        // Internal cyto rendering fields
                        'cardLabel', 'cardIcon', 'cardColor',
                        // Bulky source-of-truth blobs
                        'originalAsset', 'specifications',
                        // Raw DB row id — the human-readable generated_id is shown above
                        'assetId',
                      ].includes(k) &&
                      selectedEl[k] !== '' && selectedEl[k] != null
                    )
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td className="ns2-detail-key">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>
                        <td className="ns2-detail-val">{String(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="ns2-detail-actions">
                <button className="ns2-btn ns2-btn--primary" onClick={handleEditSelected}><IconEdit2 size={12} /> Edit</button>
                <button className="ns2-btn ns2-btn--danger" onClick={handleDeleteSelected}><IconTrash2 size={12} /> Delete</button>
              </div>
            </div>
            );
          })()}
        </div>
      )}

      {/* ── CONFIG TAB ── */}
      {!isCanvasEditor && rightPanelTab === 'config' && (
        <div className="ns2-panel-body ns2-panel-body--config">
          <div className="ns2-cfg">

            <div className="ns2-cfg-section">
              <div className="ns2-cfg-section-title">Simulation Name</div>
              <div className="ns2-cfg-row ns2-cfg-row--full">
                <input
                  type="text"
                  placeholder="e.g. Riyadh 2027 baseline"
                  maxLength={200}
                  value={simMeta.name}
                  onChange={e => { setSimMeta(m => ({ ...m, name: e.target.value })); setSimSavedId(null); }}
                />
              </div>
              <div className="ns2-cfg-row ns2-cfg-row--full">
                <textarea
                  className="ns2-cfg-textarea"
                  placeholder="Description (optional)"
                  maxLength={2000}
                  rows={2}
                  value={simMeta.description}
                  onChange={e => { setSimMeta(m => ({ ...m, description: e.target.value })); setSimSavedId(null); }}
                />
              </div>
            </div>

            <div className="ns2-cfg-section">
              <div className="ns2-cfg-section-title">Demand Input</div>
              {/* Mode toggle */}
              <div className="ns2-cfg-row ns2-cfg-row--full ns2-demand-mode-toggle" style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', flex: 1, fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="ns2-demand-mode"
                    value="scenario"
                    checked={demandInputMode === 'scenario'}
                    onChange={() => setDemandInputMode('scenario')}
                  />
                  Use Scenario
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', flex: 1, fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="ns2-demand-mode"
                    value="manual"
                    checked={demandInputMode === 'manual'}
                    onChange={() => { setDemandInputMode('manual'); syncCanvasPointNodes(); }}
                  />
                  Manual Input
                </label>
              </div>

              {/* Scenario dropdown */}
              {demandInputMode === 'scenario' && (
                <>
                  <div className="ns2-cfg-row ns2-cfg-row--full">
                    <select
                      value={selectedDemandScenario?.id || ''}
                      onChange={e => {
                        const sc = demandScenarios.find(s => String(s.id) === e.target.value) || null;
                        setSelectedDemandScenario(sc);
                      }}
                    >
                      <option value="">— None (use node capacities) —</option>
                      {demandScenarios.map(sc => (
                        <option key={sc.id} value={sc.id}>{sc.name}</option>
                      ))}
                    </select>
                  </div>
                  {selectedDemandScenario && (
                    <div className="ns2-cfg-hint">
                      {selectedDemandScenario.regions?.length > 0
                        ? `Regions: ${selectedDemandScenario.regions.join(', ')}`
                        : 'All regions'}
                    </div>
                  )}
                </>
              )}

              {/* Manual demand inputs per delivery point */}
              {demandInputMode === 'manual' && (
                canvasPointNodes.length === 0
                  ? <div className="ns2-cfg-hint" style={{ marginTop: '0.5rem' }}>Add delivery points to the canvas to enter demands.</div>
                  : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--swa-gray-300)', borderRadius: '6px', padding: '0.6rem', marginTop: '0.5rem' }}>
                      <div className="ns2-cfg-hint" style={{ marginBottom: '0.5rem' }}>Daily demand per point (m³/day)</div>
                      {canvasPointNodes.map(pt => (
                        <div key={pt.id} style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                            {pt.name}
                            {pt.region && <span style={{ color: 'var(--swa-gray-500)', fontWeight: 'normal', marginLeft: '0.4rem' }}>({pt.region})</span>}
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="m³/day"
                            value={manualDemands[pt.id] || ''}
                            onChange={e => {
                              const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                              setManualDemands(prev => ({ ...prev, [pt.id]: val }));
                            }}
                            style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid var(--swa-gray-300)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>
                      ))}
                    </div>
                  )
              )}

              {/* Demand-coverage warning: delivery points that will get 0 demand */}
              {demandCoverage.unmatched.length > 0 && (demandInputMode === 'manual' || selectedDemandScenario) && (
                <div
                  className="ns2-cfg-row ns2-cfg-row--full"
                  style={{
                    marginTop: '0.6rem', padding: '0.6rem 0.7rem',
                    background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9a3412' }}>
                    <IconAlertTriangle size={13} /> {demandCoverage.unmatched.length} delivery point{demandCoverage.unmatched.length > 1 ? 's have' : ' has'} no demand {demandInputMode === 'manual' ? 'entered' : 'in this scenario'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#9a3412', margin: '0.25rem 0 0.4rem' }}>
                    {demandInputMode === 'manual'
                      ? 'These points will receive 0 m³/day — enter a demand or any plants dedicated to them will sit idle.'
                      : `Matched by ${demandCoverage.mode === 'city_gate' ? 'city-gate name' : demandCoverage.mode === 'governorate' ? 'governorate' : 'region'}. These points will receive 0 m³/day and any plants dedicated to them will sit idle. Add them to the scenario or check their name/region.`}
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                    {demandCoverage.unmatched.map(u => (
                      <div key={u.id} style={{ fontSize: '0.78rem', color: '#7c2d12', padding: '0.1rem 0', cursor: 'pointer' }}
                        title="Click to focus on canvas"
                        onClick={() => { const cy = cyRef.current; const el = cy && cy.getElementById(u.id); if (el && el.length) { cy.animate({ center: { eles: el }, zoom: 1.2 }, { duration: 300 }); } }}
                      >
                        <IconTarget size={11} /> {u.name}{u.region ? <span style={{ color: '#b45309' }}> ({u.region})</span> : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ns2-cfg-section">
              <div className="ns2-cfg-section-title">Time Period</div>
              <div className="ns2-cfg-row">
                <label>Start Year</label>
                <input
                  type="number" min="2000" max="2100"
                  value={simConfig.dateRange.start}
                  onChange={e => setSimConfig(c => ({ ...c, dateRange: { ...c.dateRange, start: Number(e.target.value) } }))}
                />
              </div>
              <div className="ns2-cfg-row">
                <label>End Year</label>
                <input
                  type="number" min="2000" max="2100"
                  value={simConfig.dateRange.end}
                  onChange={e => setSimConfig(c => ({ ...c, dateRange: { ...c.dateRange, end: Number(e.target.value) } }))}
                />
              </div>
            </div>

            <div className="ns2-cfg-section">
              <div className="ns2-cfg-section-title">Flow &amp; Storage</div>
              <div className="ns2-cfg-row">
                <label>Purification limit (%)</label>
                <input
                  type="number" min="0" max="100"
                  value={simConfig.purificationPct}
                  onChange={e => setSimConfig(c => ({ ...c, purificationPct: Number(e.target.value) }))}
                />
              </div>
              <div className="ns2-cfg-row">
                <label>Strategic storage min (%)</label>
                <input
                  type="number" min="0" max="100"
                  value={simConfig.strategicStorageMinPct}
                  onChange={e => setSimConfig(c => ({ ...c, strategicStorageMinPct: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="ns2-cfg-section">
              <div className="ns2-cfg-section-title">Priority</div>
              <div className="ns2-cfg-row">
                <label>Delivery priority</label>
                <select
                  value={simConfig.priorityMode}
                  onChange={e => setSimConfig(c => ({ ...c, priorityMode: e.target.value }))}
                >
                  <option value="weighted">Weighted by demand</option>
                  <option value="lowest_first">Lowest demand first</option>
                  <option value="custom">Custom order</option>
                </select>
              </div>
            </div>

            <button
              className="ns2-run-btn"
              onClick={handleRunSimulation}
              disabled={simRunning}
            >
              <IconPlay size={12} />{simRunning ? 'Running…' : 'Run Simulation'}
            </button>

            <button
              className={`ns2-save-btn${simSavedId ? ' ns2-save-btn--saved' : ''}`}
              onClick={handleSaveSimulation}
              disabled={simSaving || !simMeta.name.trim()}
              title={!simMeta.name.trim() ? 'Enter a simulation name above to save' : ''}
            >
              {simSaving ? 'Saving...' : simSaveStatus === 'saved' ? 'Saved' : simSavedId ? 'Save Changes' : 'Save to Database'}
            </button>

          </div>
        </div>
      )}

      {/* ── RESULTS TAB ── */}
      {!isCanvasEditor && rightPanelTab === 'results' && (
        <div className="ns2-panel-body ns2-panel-body--results">
          {simRunning && (
            <div className="ns2-sim-loading">
              <svg className="ns2-results-spinner" viewBox="0 0 64 64" width="56" height="56">
                <circle className="ns2-results-spinner-track" cx="32" cy="32" r="26" fill="none" strokeWidth="4" />
                <circle className="ns2-results-spinner-arc"   cx="32" cy="32" r="26" fill="none" strokeWidth="4" />
              </svg>
              <div className="ns2-sim-loading-label">Running Simulation</div>
              <div className="ns2-sim-loading-elapsed">
                {`${Math.floor(simElapsed / 60).toString().padStart(2,'0')}:${(simElapsed % 60).toString().padStart(2,'0')}`}
              </div>
              <div className="ns2-sim-loading-hint">This may take up to 20 minutes for large networks</div>
            </div>
          )}
          {simError && !simRunning && (
            <div className="ns2-sim-error">
              <div className="ns2-sim-error-title">Simulation Failed</div>
              <pre className="ns2-sim-error-detail">{simError}</pre>
            </div>
          )}
          {simResults && !simRunning && (() => {
            const s = simResults.summary || {};
            const r = simResults.results || {};
            const satisfaction = r.summary?.demand_satisfaction ?? null;
            const bottleneckCount = Object.keys(r.bottlenecks || {}).length;
            const plantCount = Object.keys(r.plant_outputs || {}).length;
            return (
              <div className="ns2-cfg ns2-results-panel-content">
                <div className="ns2-cfg-section ns2-results-overview">
                  <div className="ns2-cfg-section-title">Overview</div>
                  {satisfaction !== null && (
                    <div className="ns2-sim-stat">
                      <span className="ns2-sim-stat-label">Demand satisfied</span>
                      <span className={`ns2-sim-stat-value ${
                        satisfaction >= 80 ? 'ns2-sim-stat-value--green'
                        : satisfaction >= 50 ? 'ns2-sim-stat-value--orange'
                        : 'ns2-sim-stat-value--red'
                      }`}>{satisfaction.toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="ns2-sim-stat">
                    <span className="ns2-sim-stat-label">Total supply</span>
                    <span className="ns2-sim-stat-value">{((s.totalSupply || 0) / 1000).toFixed(0)} k m³</span>
                  </div>
                  <div className="ns2-sim-stat">
                    <span className="ns2-sim-stat-label">Total demand</span>
                    <span className="ns2-sim-stat-value">{((s.totalDemand || 0) / 1000).toFixed(0)} k m³</span>
                  </div>
                  <div className="ns2-sim-stat">
                    <span className="ns2-sim-stat-label">Bottlenecks</span>
                    <span className={`ns2-sim-stat-value ${bottleneckCount > 0 ? 'ns2-sim-stat-value--orange' : 'ns2-sim-stat-value--green'}`}>
                      {bottleneckCount}
                    </span>
                  </div>
                  <div className="ns2-sim-stat">
                    <span className="ns2-sim-stat-label">Active plants</span>
                    <span className="ns2-sim-stat-value">{plantCount}</span>
                  </div>
                </div>
                <div className="ns2-cfg-section">
                  <div className="ns2-cfg-section-title">Edge Colour Key</div>
                  <div className="ns2-sim-edge-legend"><span className="ns2-sim-edge-dot" style={{ background: '#dc2626' }} />Bottleneck pipe (causing shortage)</div>
                  <div className="ns2-sim-edge-legend"><span className="ns2-sim-edge-dot" style={{ background: '#7c3aed' }} />Critical (≥90% capacity)</div>
                  <div className="ns2-sim-edge-legend"><span className="ns2-sim-edge-dot" style={{ background: '#f59e0b' }} />High flow (70–90% capacity)</div>
                  <div className="ns2-sim-edge-legend"><span className="ns2-sim-edge-dot" style={{ background: '#22c55e' }} />Active flow (&lt;70% capacity)</div>
                  <div className="ns2-sim-edge-legend"><span className="ns2-sim-edge-dot" style={{ background: '#6b7280' }} />No flow / inactive</div>
                </div>
                {bottleneckCount > 0 && (
                  <div className="ns2-cfg-section">
                    <div className="ns2-cfg-section-title">Bottleneck Pipes</div>
                    {Object.entries(r.bottlenecks).slice(0, 8).map(([id, b]) => (
                      <div key={id} className="ns2-sim-stat">
                        <span className="ns2-sim-stat-label" style={{ fontSize: '0.6875rem' }}>{b.name || id.slice(0, 10)}</span>
                        <span className="ns2-sim-stat-value ns2-sim-stat-value--red">{Number(b.utilization || 0).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="ns2-run-btn" style={{ background: '#6e7781' }} onClick={clearSimulationOverlay}>
                  <IconX size={12} /> Clear Results
                </button>
                <button className="ns2-run-btn ns2-run-btn--analytics" onClick={() => setViewMode('analytics')}>
                  <IconActivity size={12} /> View Analytics
                </button>
              </div>
            );
          })()}
          {!simResults && !simRunning && !simError && (
            <div className="ns2-panel-empty">
              <div className="ns2-panel-hint">Run a simulation to see results here</div>
            </div>
          )}
        </div>
      )}

    </div>
  );

  const belowCanvasResults = simResults && viewMode === 'analytics' && (
    <section className="ns2-below-results">
      <div className="ns2-below-results-header">
        <div>
          <h2>Simulation Analytics</h2>
          <p>Detailed analytics are shown below the canvas while the right Results tab keeps the summary.</p>
        </div>
        <div className="ns2-below-results-actions">
          <button className="ns2-btn ns2-btn--active" onClick={() => setViewMode('canvas')}>
            <IconChevronRight size={12} /> Hide Analytics
          </button>
        </div>
      </div>
      <SimulationAnalyticsPanel
        simResults={simResults}
        simMeta={simMeta}
        nodeNameMap={nodeNameMap}
        canvasEntities={simEntities}
        simChartData={simChartData}
        simRegionalData={simRegionalData}
        simScenario={simScenario}
        simRunConfig={simRunConfig}
        onBack={() => setViewMode('canvas')}
        onClear={() => { clearSimulationOverlay(); setViewMode('canvas'); }}
        onViewBottlenecks={() => { setViewMode('canvas'); changeMode('bottlenecks'); }}
      />
    </section>
  );

  // ─── Entity modal ─────────────────────────────────────────────────────────────
  const entityModalEl = entityModal.open && (
    <div className="ns2-modal-overlay" onClick={e => e.target === e.currentTarget && setEntityModal(prev => ({ ...prev, open: false }))}>
      <div className="ns2-modal">
        <div className="ns2-modal-header">
          <div className="ns2-modal-title">
            {entityModal.mode === 'edit' ? 'Edit Entity' : 'Insert Entity'}
            <span className="ns2-entity-badge" style={{ marginLeft: 8, background: ENTITY_TYPE_COLORS[entityModal.form.type] || '#57606a' }}>
              {ENTITY_TYPE_ABBREVIATIONS[entityModal.form.type]}
            </span>
          </div>
          {entityModal.mode !== 'edit' && (
            <div className="ns2-type-picker">
              {ENTITY_TYPES_LIST.map(et => (
                <button
                  key={et.key}
                  className={`ns2-type-btn ${entityModal.form.type === et.key ? 'ns2-type-btn--active' : ''}`}
                  style={{ '--entity-color': ENTITY_TYPE_COLORS[et.key] }}
                  onClick={() => setEntityModal(prev => ({ ...prev, form: { ...emptyEntityForm(et.key), _position: prev.form._position } }))}
                >
                  {et.abbr} {et.label}
                </button>
              ))}
            </div>
          )}
          {entityModal.mode === 'insert-on-edge' && (
            <div className="ns2-modal-banner ns2-modal-banner--info">
              Inserting on pipe — entity will be placed at the midpoint and the pipe will be split into two.
            </div>
          )}
          {entityModal.mode === 'new-from-asset' && (
            <div className="ns2-modal-banner ns2-modal-banner--success">
              Pre-filled from asset library. Review and confirm details.
            </div>
          )}
        </div>
        <div className="ns2-modal-body">
          {entityFormFields(entityModal.form, (newForm) => setEntityModal(prev => ({ ...prev, form: newForm })))}
        </div>
        <div className="ns2-modal-footer">
          <button className="ns2-btn" onClick={() => setEntityModal(prev => ({ ...prev, open: false }))}>Cancel</button>
          <button className="ns2-btn ns2-btn--primary" onClick={handleEntitySubmit}>
            <IconSave size={12} /> {entityModal.mode === 'edit' ? 'Save Changes' : 'Insert Entity'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Pipe modal ───────────────────────────────────────────────────────────────
  const pipeModalEl = pipeModal.open && (
    <div className="ns2-modal-overlay" onClick={e => e.target === e.currentTarget && setPipeModal(prev => ({ ...prev, open: false }))}>
      <div className="ns2-modal">
        <div className="ns2-modal-header">
          <div className="ns2-modal-title">
            {pipeModal.mode === 'edit' ? 'Edit Pipe' : 'New Transmission Pipe'}
          </div>
        </div>
        <div className="ns2-modal-body">
          {pipeFormFields(pipeModal.form, (newForm) => setPipeModal(prev => ({ ...prev, form: newForm })))}
        </div>
        <div className="ns2-modal-footer">
          <button className="ns2-btn" onClick={() => { setPipeModal(prev => ({ ...prev, open: false })); pendingEdgeRef.current = null; }}>Cancel</button>
          <button className="ns2-btn ns2-btn--primary" onClick={handlePipeSubmit}>
            <IconSave size={12} /> {pipeModal.mode === 'edit' ? 'Save Changes' : 'Create Pipe'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Insert-on-edge modal (pick entity type) ──────────────────────────────────
  const insertModalEl = insertModal.open && (
    <div className="ns2-modal-overlay" onClick={e => e.target === e.currentTarget && setInsertModal({ open: false })}>
      <div className="ns2-modal ns2-modal--sm">
        <div className="ns2-modal-header">
          <div className="ns2-modal-title">Insert Entity on Pipe</div>
          <div className="ns2-modal-subtitle">Choose entity type or select from library</div>
        </div>
        <div className="ns2-modal-body">
          <div className="ns2-insert-grid">
            {ENTITY_TYPES_LIST.map(et => (
              <button
                key={et.key}
                className="ns2-insert-card"
                style={{ '--entity-color': ENTITY_TYPE_COLORS[et.key] }}
                onClick={() => {
                  setInsertModal({ open: false });
                  setEntityModal({
                    open: true, mode: 'insert-on-edge',
                    form: emptyEntityForm(et.key),
                    editId: null,
                  });
                }}
              >
                <span className="ns2-entity-badge ns2-entity-badge--lg" style={{ background: ENTITY_TYPE_COLORS[et.key] }}>{et.abbr}</span>
                <span className="ns2-insert-card-label">{et.label}</span>
              </button>
            ))}
          </div>
          <div className="ns2-insert-divider"><span>or</span></div>
          <button
            className="ns2-btn ns2-btn--fullwidth"
            onClick={() => {
              setInsertModal({ open: false });
              setShowLibrary(true);
              // After user picks from library, when they click → handleLibraryAssetClick runs
              // We need to route that into insert mode. Use a special pending flag.
              pendingPlacementRef.current = { entityType: null, _insertMode: true };
              changeMode('place-asset');
            }}
          >
            <IconDatabase size={12} /> Select From Asset Library
          </button>
        </div>
        <div className="ns2-modal-footer">
          <button className="ns2-btn" onClick={() => {
            setInsertModal({ open: false });
            cyRef.current?.edges().removeClass('insert-target');
            insertEdgeRef.current = null;
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ─── Main render ───────────────────────────────────────────────────────────────

  const canvasCounts = (() => {
    const cy = cyRef.current;
    if (!cy) return { nodes: 0, pipes: 0, selected: selectedCount };
    return {
      nodes: cy.nodes().not('[type="group-box"]').length,
      pipes: cy.edges().length,
      selected: selectedCount,
    };
  })();

  return (
    <div className={`ns2-root${embedded ? ' ns2-root--embedded' : ''}`}>
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
      {!embedded && <WorkspaceHeader
        title={simMeta.name?.trim() || (isNetworkCanvas ? 'New Network Canvas' : isConfigurationSnapshot ? 'Simulation Snapshot Canvas' : 'New Network Simulation')}
        status={!simSavedId ? 'New' : historyState.isDirty ? 'Unsaved' : 'Saved'}
        statusTone={!simSavedId ? 'amber' : historyState.isDirty ? 'amber' : 'green'}
        subtitle={simSavedId
          ? `Editing ${isNetworkCanvas ? 'saved network canvas' : isConfigurationSnapshot ? 'simulation-owned canvas snapshot' : 'network simulation'} - ID #${simSavedId}`
          : isNetworkCanvas ? 'Designing a reusable network canvas' : isConfigurationSnapshot ? 'Editing the copied simulation canvas only' : 'Configuring a new network simulation'}
        actions={[
          <WorkspaceHeaderChip key="assets">{canvasCounts.nodes} assets</WorkspaceHeaderChip>,
          <WorkspaceHeaderChip key="pipes">{canvasCounts.pipes} pipes</WorkspaceHeaderChip>,
          canvasCounts.selected > 0 ? <WorkspaceHeaderChip key="selected" tone="blue">{canvasCounts.selected} selected</WorkspaceHeaderChip> : null,
          !isCanvasEditor && simResults ? <WorkspaceHeaderChip key="results" tone="green">Results loaded</WorkspaceHeaderChip> : null,
          <WorkspaceHeaderButton
            key="save"
            icon={IconSave}
            onClick={handleSaveSimulation}
            disabled={simSaving || !simMeta.name?.trim()}
          >
            {simSaving ? 'Saving…' : 'Save'}
          </WorkspaceHeaderButton>,
          <WorkspaceHeaderButton
            key="save-as"
            icon={IconSave}
            onClick={() => {
              const proposed = (simMeta.name?.trim() ? `${simMeta.name.trim()} (copy)` : '');
              const newName = window.prompt('Save simulation as — enter a new name:', proposed);
              if (!newName || !newName.trim()) return;
              const trimmed = newName.trim();
              setSimSavedId(null);
              setSimMeta(prev => ({ ...prev, name: trimmed }));
              setPendingSaveAsName(trimmed); // useEffect picks this up post-commit
            }}
            disabled={simSaving}
          >
            Save As
          </WorkspaceHeaderButton>,
        ].filter(Boolean)}
      />}
      {modeBanner}
      <div className={`ns2-body${showLibrary ? ' ns2-body--with-library' : ''}${showRightPanel ? ' ns2-body--with-panel' : ''}${viewMode === 'analytics' ? ' ns2-body--analytics' : ''}`}>
        {libraryPanel}
        <div className="ns2-canvas-column">
          <div
            ref={gridWrapRef}
            className={`ns2-canvas-wrap${showGrid ? ' ns2-canvas-wrap--grid' : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            <div ref={containerRef} className="ns2-canvas" />
            <div className="ns2-note-layer" aria-hidden={viewMode === 'analytics'}>
              {viewMode !== 'analytics' && noteOverlays.map(note => (
                <NoteEditor
                  key={note.id}
                  noteId={note.id}
                  html={note.html}
                  className={[
                    'ns2-note-editor',
                    note.selected ? 'ns2-note-editor--selected' : '',
                    note.font === 'serif' ? 'ns2-note-editor--serif' : '',
                    note.font === 'mono' ? 'ns2-note-editor--mono' : '',
                    note.fontSize ? `ns2-note-editor--${note.fontSize}` : '',
                    note.bold ? 'ns2-note-editor--bold' : '',
                    note.italic ? 'ns2-note-editor--italic' : '',
                    note.underline ? 'ns2-note-editor--underline' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: note.left,
                    top: note.top,
                    width: note.width,
                    height: note.height,
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    const cy = cyRef.current;
                    const node = cy?.getElementById(note.id);
                    if (node?.length) {
                      cy.$(':selected').unselect();
                      node.select();
                      updateSelection();
                    }
                  }}
                  onFocus={() => {
                    activeNoteEditorRef.current = note.id;
                    saveActiveNoteSelection();
                  }}
                  onKeyUp={saveActiveNoteSelection}
                  onMouseUp={saveActiveNoteSelection}
                  onInput={(event) => {
                    activeNoteEditorRef.current = note.id;
                    event.currentTarget.dataset.dirty = 'true';
                    saveActiveNoteSelection();
                  }}
                  onBlur={(event) => {
                    // Don't auto-grow the box and don't force a re-render
                    // that would clobber the editor's DOM. The cytoscape
                    // node data is still updated with the new HTML.
                    commitNoteEditor(note.id, event.currentTarget, {
                      resize: false,
                      skipRerender: true,
                    });
                    saveActiveNoteSelection();
                  }}
                />
              ))}
            </div>
            <div className="ns2-group-resize-layer" aria-hidden={viewMode === 'analytics'}>
              {viewMode !== 'analytics' && groupBoxOverlays.filter(group => group.selected).map(group => (
                <div
                  key={group.id}
                  className="ns2-group-resize-box"
                  style={{
                    left: group.left,
                    top: group.top,
                    width: group.width,
                    height: group.height,
                  }}
                >
                  <button
                    type="button"
                    className="ns2-box-resize-handle"
                    aria-label="Resize group box"
                    onMouseDown={(event) => resizeGroupBoxFromHandle(group.id, event)}
                  />
                </div>
              ))}
            </div>
            {viewMode !== 'analytics' && (
            <>
              {/* Date selector — which day's flow the canvas is showing */}
              {(() => {
                if (mode === 'trace' || mode === 'bottlenecks') return null; // these modes own the colouring
                const dates = simResults?.results?.daily_series?.dates;
                if (!dates || dates.length === 0 || overlayDayIdx == null) return null;
                const idx = Math.min(Math.max(0, overlayDayIdx), dates.length - 1);
                return (
                  <div
                    style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 80%)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '8px 14px', zIndex: 18 }}
                    onMouseDown={e => e.stopPropagation()}
                    onTouchStart={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onWheel={e => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}><IconDroplet size={11} /> Flow shown for</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{(dates[idx] || '').substring(0, 10)}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Day {idx + 1} / {dates.length}</span>
                    </div>
                    <input type="range" min={0} max={dates.length - 1} value={idx} onChange={e => setOverlayDayIdx(Number(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
                      <span>{(dates[0] || '').substring(0, 10)}</span>
                      <span>{(dates[dates.length - 1] || '').substring(0, 10)}</span>
                    </div>
                  </div>
                );
              })()}
              {mode === 'bottlenecks' && bottleneckSummary && (
                <div
                  style={{ position: 'absolute', top: 12, right: 12, width: 320, maxHeight: '80%', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '12px 14px', zIndex: 20, fontSize: 12 }}
                  onMouseDown={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                  onWheel={e => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 6 }}>Bottlenecks on the network</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #dc262633', borderRadius: 12, padding: '2px 8px' }}><IconGitBranch size={11} /> {bottleneckSummary.lineCount} pipes</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #dc262633', borderRadius: 12, padding: '2px 8px' }}><IconPlant size={11} /> {bottleneckSummary.plantCount} plants</span>
                    {bottleneckSummary.pointCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #b4530933', borderRadius: 12, padding: '2px 8px' }}><IconTarget size={11} /> {bottleneckSummary.pointCount} points</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 8, lineHeight: 1.5 }}>
                    <IconGitBranch size={11} /> <b>Pipe</b>: a line at capacity limiting delivery downstream.<br />
                    <IconPlant size={11} /> <b>Plant</b>: a plant that can't meet the demand in the area it serves.<br />
                    <IconTarget size={11} /> <b>Point</b>: a delivery point whose reachable supply is below its demand.
                  </div>
                  {bottleneckSummary.items.length === 0
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 12, fontWeight: 600 }}><IconCheckSquare size={12} /> No bottlenecks</div>
                    : bottleneckSummary.items.map(it => {
                      const ItemIcon = it.kind === 'plant' ? IconPlant : it.kind === 'point' ? IconTarget : IconGitBranch;
                      return (
                        <div key={it.kind + '_' + it.id}
                          onClick={() => { const cy = cyRef.current; const el = cy && cy.getElementById(it.id); if (el && el.length) cy.animate({ center: { eles: el }, zoom: 1.1 }, { duration: 300 }); }}
                          style={{ padding: '5px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><ItemIcon size={11} /> {it.name}</span>
                            <span style={{ color: '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}>{it.util.toFixed(0)}%</span>
                          </div>
                          {it.detail && <div style={{ fontSize: 10, color: '#9ca3af' }}>{it.detail}</div>}
                        </div>
                      );
                    })}
                </div>
              )}
              {traceInfo && (
                <div
                  style={{ position: 'absolute', top: 12, left: 12, width: 300, maxHeight: '72%', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '12px 14px', zIndex: 20, fontSize: 12 }}
                  onMouseDown={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                  onWheel={e => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>🔍 {traceInfo.rootName}</div>
                    <button onClick={() => { const cy = cyRef.current; if (cy) cy.elements().removeClass('trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim'); setTraceInfo(null); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 2 }}>×</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>{traceInfo.rootType} · {traceInfo.upCount} upstream · {traceInfo.downCount} downstream</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    <button onClick={() => { setTraceDisplayMode('delivered'); const root = cyRef.current?.getElementById(traceInfo.rootId); if (root?.length) traceFlow(root, 'delivered'); }} disabled={!traceInfo.hasFlow || !traceInfo.rootId} style={{ border: '1px solid #bfdbfe', background: traceInfo.mode === 'delivered' ? '#dbeafe' : '#fff', color: '#1d4ed8', padding: '3px 6px', fontSize: 10, cursor: traceInfo.hasFlow && traceInfo.rootId ? 'pointer' : 'not-allowed' }}>Delivered</button>
                    <button onClick={() => { setTraceDisplayMode('reachable'); const root = cyRef.current?.getElementById(traceInfo.rootId); if (root?.length) traceFlow(root, 'reachable'); }} disabled={!traceInfo.rootId} style={{ border: '1px solid #d0d7de', background: traceInfo.mode === 'reachable' ? '#e2e8f0' : '#fff', color: '#334155', padding: '3px 6px', fontSize: 10, cursor: traceInfo.rootId ? 'pointer' : 'not-allowed' }}>Reachable</button>
                  </div>
                  {traceInfo.message && <div style={{ fontSize: 11, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '5px 7px', marginBottom: 8 }}>{traceInfo.message}</div>}
                  {!traceInfo.hasFlow && <div style={{ fontSize: 11, color: '#9a3412', background: '#fff7ed', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>Run a simulation to see flow volumes.</div>}
                  {traceInfo.ultimateSources?.length > 0 && <div style={{ marginBottom: 9 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 3 }}>Supply sources ({traceInfo.ultimateSources.length})</div><div style={{ fontSize: 11, color: '#475569' }}>{traceInfo.ultimateSources.map(source => source.name).join(', ')}</div></div>}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 4 }}>⬅ Comes from ({traceInfo.sources.length})</div>
                    {traceInfo.sources.length === 0
                      ? <div style={{ fontSize: 11, color: '#9ca3af' }}>— no direct source —</div>
                      : traceInfo.sources.map((s, i) => (
                        <div key={s.id + '_s' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, padding: '2px 0' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          {traceInfo.hasFlow && <span style={{ color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>{ns2FmtFlow(s.flow)} m³/d</span>}
                        </div>
                      ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>➡ Goes to ({traceInfo.dests.length})</div>
                    {traceInfo.dests.length === 0
                      ? <div style={{ fontSize: 11, color: '#9ca3af' }}>— no direct destination —</div>
                      : traceInfo.dests.map((s, i) => (
                        <div key={s.id + '_d' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, padding: '2px 0' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          {traceInfo.hasFlow && <span style={{ color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>{ns2FmtFlow(s.flow)} m³/d</span>}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {(mode === 'place-entity' || mode === 'place-asset' || mode === 'place-note') && (
                <div className="ns2-canvas-cursor-hint">Click to place</div>
              )}
              {mode === 'area-zoom' && (
                <div
                  className="ns2-area-zoom-overlay"
                  onMouseDown={handleAreaZoomStart}
                  onMouseMove={handleAreaZoomMove}
                  onMouseUp={handleAreaZoomEnd}
                  onMouseLeave={handleAreaZoomEnd}
                >
                  {areaZoom && areaZoom.w > 4 && areaZoom.h > 4 && (
                    <div
                      className="ns2-area-zoom-rect"
                      style={{ left: areaZoom.x, top: areaZoom.y, width: areaZoom.w, height: areaZoom.h }}
                    />
                  )}
                </div>
              )}
            </>
            )}
          </div>
          {belowCanvasResults}
        </div>
        {rightPanel}
      </div>
      {entityModalEl}
      {pipeModalEl}
      {insertModalEl}
    </div>
  );
}

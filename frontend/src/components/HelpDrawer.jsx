import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppWindow, Archive, ArrowRight, BarChart3, BookOpen, ChevronRight, CircleHelp, Factory, Gauge, Keyboard, Lightbulb, Mail,
  MousePointerClick, Network, Palette, Search, SlidersHorizontal, Waves, Workflow, X,
} from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./HelpDrawer.css";

// Help panel (top navigation → ?): a guide to the workspace you're in, the
// keyboard shortcuts, what the status colours mean, and a way to every other
// workspace. In the app's card language: a header with a tinted icon tile,
// cards with an uppercase header row, rows with an icon tile and chevron.

const WORKSPACES = [
  {
    id: "home", path: "/", match: /^\/$/, title: "Operations", icon: Gauge, colour: "var(--acc)",
    summary: "The operating position for a chosen period and region: key figures, supply vs demand, what needs attention, the network map, performance and recent activity.",
    steps: [
      "Pick a period (7D / 30D / 90D / All / Custom) and a region in the filter bar.",
      "Click a day on the supply vs demand chart for its breakdown by plant and city gate.",
      "Open anything — a KPI, a table row, a map marker, an activity item — to go to it.",
      "Use Customise to hide or reorder sections.",
    ],
  },
  {
    id: "production", path: "/production", match: /^\/production/, title: "Production", icon: Factory, colour: ENTITY_TYPE_COLORS.plant,
    summary: "Every production plant: capacity, approved production, quality, maintenance and outages.",
    steps: [
      "Search and filter plants in the All Plants tab.",
      "Open a plant: it gets its own tab, with Overview, Production, Quality, Maintenance and Outages.",
      "Review maintenance and approve or reject it from the plant's records.",
    ],
  },
  {
    id: "demand", path: "/demand", match: /^\/demand/, title: "Demand", icon: Waves, colour: ENTITY_TYPE_COLORS.handover_point,
    summary: "Required volumes by city gate, and the desktop decisions on website-approved records.",
    steps: [
      "Open a city gate from the All City Gates tab.",
      "Check required volumes against capacity, then record your decision on each pending row.",
    ],
  },
  {
    id: "transmission", path: "/transmission/pump-stations", match: /^\/transmission/, title: "Transmission", icon: Network, colour: ENTITY_TYPE_COLORS.pump,
    summary: "Pump stations and transmission systems: availability, capacities, lines, segments and the assets on each system.",
    steps: [
      "Switch between Pump Stations and Systems in the Transmission menu.",
      "Open a system to see its drawing, lines, segments and connected plants, tanks and city gates.",
    ],
  },
  {
    id: "economics", path: "/economics", match: /^\/economics/, title: "Economics", icon: BarChart3, colour: "var(--chart-indigo)",
    summary: "Financial-data readiness and the variable O&M inputs dispatch uses for merit order.",
    steps: [
      "Compare plants' variable O&M in the overview.",
      "Open a plant for its financial records and the values dispatch will use.",
    ],
  },
  {
    id: "network-builder", path: "/network-builder", match: /^\/network-builder/, title: "Network Builder", icon: Workflow, colour: "#5b7ca3",
    summary: "Draw the network: place assets, connect pipes, check connectivity and capacity, trace supply, and save it for simulation.",
    steps: [
      "Drag assets from the Library onto the canvas; draw pipes between them from the ribbon.",
      "Set the drawing area (View → Drawing area) or drag its edges on the canvas.",
      "Validate (Tools) to find disconnected assets or missing capacities; Trace supply to follow water.",
      "Save — each open network is its own tab, with unsaved changes marked by a dot.",
    ],
    tip: "Press ? on the canvas for every canvas shortcut.",
  },
  {
    id: "simulation", path: "/simulation-config", match: /^\/simulation-config/, title: "Simulation Config", icon: SlidersHorizontal, colour: "var(--acc)",
    summary: "Set up a dispatch run, check the live tables, run it, review results and decisions, and publish.",
    steps: [
      "Pick a saved simulation in the rail, or start a new one with +.",
      "Choose a network and dates — the tables preview the dispatch as you edit.",
      "Run, then check Results, Decisions and the Canvas; publish when it's right.",
    ],
  },
  {
    id: "asset-registry", path: "/asset-registry", match: /^\/asset-registry/, title: "Asset Registry", icon: Archive, colour: ENTITY_TYPE_COLORS.tank,
    summary: "Every asset in map or list form: view, edit and create registry records.",
    steps: [
      "Browse by type in the rail, or switch the All Assets tab between map and list.",
      "Open an asset in its own tab; Edit switches that tab to the form.",
      "New asset opens a blank form in a new tab.",
    ],
  },
];

const GLOBAL_KEYS = [
  { keys: ["Ctrl", "K"], desc: "Search everything" },
  { keys: ["Esc"], desc: "Close menus, panels and dialogs" },
  { keys: ["Ctrl", "W"], desc: "Close the current tab" },
  { keys: ["Ctrl", "Shift", "T"], desc: "Reopen the last closed tab" },
  { keys: ["Ctrl", "Alt", "→"], desc: "Next tab" },
  { keys: ["Ctrl", "Alt", "←"], desc: "Previous tab" },
];

const CANVAS_KEYS = [
  { keys: ["Ctrl", "Z"], desc: "Undo" },
  { keys: ["Ctrl", "Shift", "Z"], desc: "Redo" },
  { keys: ["F"], desc: "Fit to screen" },
  { keys: ["Del"], desc: "Delete the selection" },
  { keys: ["?"], desc: "All canvas shortcuts" },
];

const COLOURS = [
  { tone: "ok", label: "Healthy", desc: "Approved, operational, within limits" },
  { tone: "warn", label: "Attention", desc: "Pending, stale or constrained" },
  { tone: "err", label: "Blocking", desc: "Exceptions, shortages, outages" },
  { tone: "acc", label: "Information", desc: "Selected, in progress, a link" },
];

const TIPS = [
  { icon: AppWindow, text: "Take any tab out into its own window: hover it and click ↗, right-click → Open in new window, or drag it off the strip." },
  { icon: MousePointerClick, text: "Right-click a tab to pin, duplicate or close several at once. Pinned tabs stay on the left." },
  { icon: Search, text: "Search (Ctrl + K) finds plants, city gates, assets, networks and simulations from anywhere." },
];

function Keys({ keys }) {
  return (
    <span className="help-keys">
      {keys.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="help-keys__plus">+</span>}
          <kbd>{key}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <section className="help-card">
      <header className="help-card__head">
        <Icon size={13} aria-hidden="true" />
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

export default function HelpDrawer({ open, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const current = WORKSPACES.find((w) => w.match.test(location.pathname)) || WORKSPACES[0];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="help" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={panelRef} tabIndex={-1} className="help__panel" role="dialog" aria-modal="true" aria-label={`${current.title} help`}>
        <header className="help__head" style={{ "--help-colour": current.colour }}>
          <span className="help__tile" aria-hidden="true"><Icon size={18} /></span>
          <div className="help__title">
            <span className="help__eyebrow"><CircleHelp size={11} aria-hidden="true" /> Help · current workspace</span>
            <h2>{current.title}</h2>
          </div>
          <button type="button" className="help__close" onClick={onClose} aria-label="Close help" title="Close (Esc)"><X size={16} /></button>
        </header>

        <div className="help__body">
          <Card icon={BookOpen} title="This workspace">
            <p className="help-card__lead">{current.summary}</p>
            <ol className="help-steps">
              {current.steps.map((step, i) => (
                <li key={i}><span className="help-steps__n" style={{ "--help-colour": current.colour }}>{i + 1}</span><span>{step}</span></li>
              ))}
            </ol>
            {current.tip && <p className="help-card__tip"><Lightbulb size={13} aria-hidden="true" /> {current.tip}</p>}
          </Card>

          <Card icon={Keyboard} title="Keyboard shortcuts">
            <dl className="help-keylist">
              {GLOBAL_KEYS.map((row) => (
                <div key={row.desc}><dt><Keys keys={row.keys} /></dt><dd>{row.desc}</dd></div>
              ))}
            </dl>
            {current.id === "network-builder" && (
              <>
                <h4 className="help-card__sub">On the canvas</h4>
                <dl className="help-keylist">
                  {CANVAS_KEYS.map((row) => (
                    <div key={row.desc}><dt><Keys keys={row.keys} /></dt><dd>{row.desc}</dd></div>
                  ))}
                </dl>
              </>
            )}
            <p className="help-card__note">On a Mac, use Cmd for Ctrl.</p>
          </Card>

          <Card icon={Palette} title="Status colours">
            <div className="help-colours">
              {COLOURS.map((c) => (
                <div key={c.tone} className={`help-colour help-colour--${c.tone}`}>
                  <span className="help-colour__dot" aria-hidden="true" />
                  <span className="help-colour__text"><strong>{c.label}</strong><small>{c.desc}</small></span>
                </div>
              ))}
            </div>
          </Card>

          <Card icon={Lightbulb} title="Good to know">
            <ul className="help-tips">
              {TIPS.map(({ icon: TipIcon, text }) => (
                <li key={text}><span className="help-tips__icon" aria-hidden="true"><TipIcon size={13} /></span><span>{text}</span></li>
              ))}
            </ul>
          </Card>

          <Card icon={ArrowRight} title="Workspaces">
            <div className="help-nav">
              {WORKSPACES.map((w) => {
                const WIcon = w.icon;
                const here = w.id === current.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`help-nav__item${here ? " is-here" : ""}`}
                    style={{ "--help-colour": w.colour }}
                    onClick={() => (here ? onClose() : go(w.path))}
                    aria-current={here ? "page" : undefined}
                  >
                    <span className="help-nav__icon" aria-hidden="true"><WIcon size={14} /></span>
                    <span className="help-nav__text"><strong>{w.title}</strong><small>{here ? "You are here" : w.summary}</small></span>
                    {!here && <ChevronRight size={14} className="help-nav__chev" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <footer className="help__foot">
          <span>WIDispatch · Operator workspace</span>
          <a href="mailto:support@example.com"><Mail size={12} aria-hidden="true" /> Contact support</a>
        </footer>
      </aside>
    </div>
  );
}

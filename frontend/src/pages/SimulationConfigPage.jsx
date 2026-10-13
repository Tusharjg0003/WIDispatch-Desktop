import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CircleCheck, CircleX, Coins, Gauge, LoaderCircle, PanelLeft, PanelLeftClose, PanelLeftOpen, Play, Plus, Save, SlidersHorizontal,
} from "lucide-react";
import WorkspaceHeader, { WorkspaceHeaderButton, WorkspaceHeaderChip } from "../components/WorkspaceHeader";
import SimulationConfigSidebar from "../components/SimulationConfigSidebar";
import RecordKpis from "../components/production/RecordKpis";
import SimulationTables from "../components/simulation/SimulationTables";
import ResultsPanel from "../components/simulation/ResultsPanel";
import DecisionsPanel from "../components/simulation/DecisionsPanel";
import NetworkCanvasWorkspace from "../networkCanvas/NetworkCanvasWorkspace";
import { useStatusItems } from "../components/StatusBar";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import SimulationTabs from "../simulationConfig/tabs/SimulationTabs";
import { simTabStore, useSimTabStore } from "../simulationConfig/tabs/simTabStore";
import { openNewSimTab, openSimulation, simTabController } from "../simulationConfig/tabs/simTabControllerInstance";
import { isNewSimKey } from "../simulationConfig/tabs/simTab.types";
import { countOverrides, validateConfig } from "../lib/simulationRows";
import {
  createSimulationConfig, deleteSimulationConfig, fetchDispatchPlan, fetchSimulationConfig,
  fetchSimulationConfigs, previewSimulation, publishDispatchPlan, runSimulation, updateDispatchDecisions,
  updateSimulationConfig,
} from "../api/simulation";
import { fetchNetwork, fetchNetworks, saveNetwork } from "../api/networks";
import "../components/MetricDashboard.css";
import "./SimulationConfigPage.css";

// Simulation Config: saved simulations in the left rail (Drafts / Published),
// the setup card, then the tables. Picking a network and dates fills the
// tables straight away with a preview dispatch (nothing stored); Run stores a
// draft plan, which Results / Decisions / Canvas show and Decisions publishes.

const TABS = [
  { key: "configuration", label: "Configuration", needsRun: false },
  { key: "results", label: "Results", needsRun: true },
  { key: "decisions", label: "Decisions", needsRun: true },
  { key: "canvas", label: "Canvas", needsRun: true },
];

const RAIL_KEY = "scp.rail";
const PREVIEW_DELAY_MS = 400;

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayCount = (from, to) => {
  if (!from || !to || from > to) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
};
const stamp = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const readRail = () => {
  try { return localStorage.getItem(RAIL_KEY) !== "closed"; } catch { return true; }
};

/**
 * Publishes the page's footer items. Mounted only while the Canvas tab is
 * closed: the embedded canvas publishes its own (zoom, selection, panels), and
 * mounting / unmounting this hands the footer cleanly between the two.
 */
function ScpStatusItems({ items }) {
  useStatusItems(items);
  return null;
}

/** The fields a save sends — the config minus server-owned bookkeeping. */
const configBody = (c) => ({
  name: c.name,
  description: c.description,
  networkId: c.networkId,
  from: c.from,
  to: c.to,
  overrides: c.overrides || {},
  strategicStorageMinPct: c.strategicStorageMinPct ?? 70,
});

export default function SimulationConfigPage() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── Tabs (Network Builder style): one tab per open simulation ─────────────
  const activeTabId = useSimTabStore((state) => state.activeTabId);
  const activeTab = useSimTabStore((state) => (state.activeTabId ? state.tabs[state.activeTabId] ?? null : null));
  const tabCount = useSimTabStore((state) => state.order.length);
  // A "New simulation" tab has no simulation behind it yet.
  const id = activeTab && !isNewSimKey(activeTab.key) ? activeTab.key : null;
  const tab = activeTab?.state.subTab || "configuration";
  const setTab = useCallback((next) => {
    if (activeTabId) simTabController.setSubTab(activeTabId, next);
  }, [activeTabId]);

  useEffect(() => {
    simTabController.registerNavigator({ replace: (path) => navigate(path, { replace: true }) });
    simTabController.syncUrl();
    // A tab with unsaved setup asks before it closes.
    simTabController.setBeforeClose((t) => !t.state.dirty || window.confirm(`Discard unsaved changes to "${t.title}"?`));
    return () => simTabController.detach();
  }, [navigate]);

  useEffect(() => {
    simTabController.restoreSessionOnce(routeId ?? null, searchParams.get("tab"));
    // Links into a specific simulation (e.g. Home → recent runs) open it even
    // when the session was already restored earlier in this visit.
    if (routeId && simTabController.getActiveTab()?.key !== routeId) openSimulation(routeId, routeId);
    // Deep-link intent, read once (as the other strips do).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(simTabController);

  // Like the Network Builder, the strip is never empty: with nothing open
  // there is a "New simulation" tab.
  useEffect(() => {
    // Read the live strip: on mount the session restore (an earlier effect)
    // has already filled it, after this render's `tabCount` was taken.
    if (!simTabStore.getState().order.length) openNewSimTab();
  }, [tabCount]);

  const [configs, setConfigs] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [config, setConfig] = useState(null);
  const [plan, setPlan] = useState(null); // last stored run
  const [preview, setPreview] = useState(null); // live, unsaved dispatch for the tables
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [railOpen, setRailOpen] = useState(readRail);

  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [published, setPublished] = useState(null);
  // The network document the Canvas tab edits (SWIIMS controlled snapshot).
  const [canvasDoc, setCanvasDoc] = useState(null);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const networkSelectRef = useRef(null);
  const focusNetworkFor = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, railOpen ? "open" : "closed"); } catch { /* storage unavailable */ }
  }, [railOpen]);

  // ── Load the rail lists once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSimulationConfigs(), fetchNetworks()])
      .then(([c, n]) => {
        if (cancelled) return;
        setConfigs(c.configs);
        setNetworks(n.networks);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setListLoading(false));
    return () => { cancelled = true; };
  }, []);

  const updateListRow = useCallback((configId, changes) => {
    setConfigs((list) => list.map((c) => (c.id === configId ? { ...c, ...changes } : c)));
  }, []);

  // ── Load the selected config, and its last stored run if it has one ───────
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    setPublished(null);
    setPublishError(null);
    if (!id) {
      setConfig(null);
      setPlan(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const draft = simTabController.getActiveTab()?.state.draft || null;

    fetchSimulationConfig(id)
      .then(async (c) => {
        if (cancelled) return;
        // A tab with unsaved setup picks up where it was left.
        setConfig(draft ? { ...c, ...draft, id: c.id } : c);
        setDirty(Boolean(draft));
        // A stored plan may have been deleted; a missing one is not an error.
        const last = c.latestPlanId ? await fetchDispatchPlan(c.latestPlanId).catch(() => null) : null;
        if (!cancelled) setPlan(last);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [id]);

  // Mirror unsaved setup into the tab (dot + survives switching and reloads),
  // and keep the tab title on the simulation's name.
  useEffect(() => {
    if (!activeTabId || !config || config.id !== id) return undefined;
    const timer = setTimeout(() => {
      const current = simTabController.getActiveTab();
      if (!current || current.id !== activeTabId) return;
      if (dirty) simTabController.setTabState(activeTabId, { draft: configBody(config), dirty: true });
      else if (current.state.dirty || current.state.draft) simTabController.setTabState(activeTabId, { draft: null, dirty: false });
      if (config.name) simTabController.adoptTitle(activeTabId, config.name);
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTabId, id, config, dirty]);

  // A just-created simulation asks for its network first.
  useEffect(() => {
    if (config && focusNetworkFor.current === config.id && networkSelectRef.current) {
      focusNetworkFor.current = null;
      networkSelectRef.current.focus();
    }
  }, [config]);

  // ── Live tables: re-dispatch (without storing) whenever the inputs change ─
  const previewKey = config && config.networkId && config.from && config.to && config.from <= config.to
    ? JSON.stringify([config.id, config.networkId, config.from, config.to, config.strategicStorageMinPct ?? 70, config.overrides || {}])
    : null;

  useEffect(() => {
    if (!previewKey) {
      setPreview(null);
      setPreviewing(false);
      setPreviewError(null);
      return undefined;
    }
    const [configId, networkId, from, to, strategicStorageMinPct, overrides] = JSON.parse(previewKey);
    const controller = new AbortController();
    setPreviewing(true);
    setPreviewError(null);
    const timer = setTimeout(() => {
      previewSimulation(configId, { networkId, from, to, strategicStorageMinPct, overrides }, { signal: controller.signal })
        .then((result) => setPreview(result))
        .catch((e) => { if (e.name !== "AbortError") setPreviewError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setPreviewing(false); });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [previewKey]);

  // Load the configuration's network for the embedded canvas.
  useEffect(() => {
    const networkId = config?.networkId;
    if (!networkId) {
      setCanvasDoc(null);
      return undefined;
    }
    let cancelled = false;
    fetchNetwork(networkId)
      .then((doc) => !cancelled && setCanvasDoc(doc))
      .catch(() => !cancelled && setCanvasDoc(null));
    return () => { cancelled = true; };
  }, [config?.networkId]);

  const overrides = config?.overrides || {};
  const overrideCount = useMemo(() => countOverrides(overrides), [overrides]);
  const tablesPlan = preview || plan;
  const validation = useMemo(() => validateConfig(config, { plan: tablesPlan }), [config, tablesPlan]);
  const status = config ? configs.find((c) => c.id === config.id)?.status || "draft" : null;
  const isPublished = Boolean(published) || plan?.status === "published";
  // Results / Decisions / Canvas show the stored run; say so when the setup has moved on since.
  const planIsStale = Boolean(
    plan && config && (dirty || plan.network?.id !== config.networkId || plan.from !== config.from || plan.to !== config.to),
  );

  const patch = useCallback((changes) => {
    setConfig((c) => ({ ...c, ...changes }));
    setDirty(true);
  }, []);

  /** Overrides are sparse: clearing the last key removes the element entirely. */
  const handleOverrideChange = useCallback((elementId, key, value) => {
    setConfig((c) => {
      const next = { ...(c.overrides || {}) };
      const entry = { ...(next[elementId] || {}) };
      if (value === undefined) delete entry[key];
      else entry[key] = value;

      if (Object.keys(entry).length === 0) delete next[elementId];
      else next[elementId] = entry;

      return { ...c, overrides: next };
    });
    setDirty(true);
  }, []);

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const from = todayIso();
      const created = await createSimulationConfig({
        name: `Dispatch run ${from}`,
        from,
        to: plusDays(from, 13),
      });
      setConfigs((list) => [{ ...created, status: "draft" }, ...list]);
      focusNetworkFor.current = created.id;
      openSimulation(created.id, created.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (tabId) => {
    const sourceTab = simTabStore.getState().tabs[tabId] || null;
    const key = sourceTab?.key;
    if (!key || isNewSimKey(key)) return;
    setError(null);
    try {
      const base = key === config?.id ? config : { ...(await fetchSimulationConfig(key)), ...(sourceTab.state.draft || {}) };
      const created = await createSimulationConfig({ ...configBody(base), name: `${base.name || "Simulation"} (copy)` });
      setConfigs((list) => [{ ...created, status: "draft" }, ...list]);
      simTabController.openRecord(created.id, created.name);
    } catch (e) {
      setError(e.message);
    }
  };

  /** Saves the form; returns the stored config (or null on failure). */
  const handleSave = async () => {
    if (!config) return null;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateSimulationConfig(config.id, configBody(config));
      setConfig(saved);
      updateListRow(saved.id, saved);
      setDirty(false);
      return saved;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    if (!window.confirm(`Delete "${config.name}"? Its runs stay in the dispatch history, but the configuration is removed.`)) return;
    setError(null);
    try {
      await deleteSimulationConfig(config.id);
      setConfigs((list) => list.filter((c) => c.id !== config.id));
      simTabController.closeByKey(config.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const runStored = async (cfg) => {
    const result = await runSimulation(cfg.id, {
      from: cfg.from,
      to: cfg.to,
      overrides: cfg.overrides || {},
      strategicStorageMinPct: cfg.strategicStorageMinPct ?? 70,
    });
    setPlan(result);
    setPublished(null);
    setPublishError(null);
    updateListRow(cfg.id, { status: "draft", publishedAt: null, latestPlanId: result.id, latestRunAt: result.runAt });
    return result;
  };

  const handleRun = async ({ stayOnTab = false } = {}) => {
    if (!config) return;
    setRunning(true);
    setError(null);
    try {
      // Save first so the run and the stored config cannot disagree.
      const cfg = dirty ? await handleSave() : config;
      if (!cfg) return;
      await runStored(cfg);
      if (!stayOnTab) setTab("results");
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handlePublish = async () => {
    if (!plan) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishDispatchPlan(plan.id);
      setPublished(result);
      setPlan((p) => ({ ...p, status: "published", publishedAt: result.publishedAt }));
      updateListRow(plan.configId || config?.id, { status: "published", publishedAt: result.publishedAt });
    } catch (e) {
      setPublishError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleDecisionSave = async (changes) => {
    if (!plan) return;
    const updated = await updateDispatchDecisions(plan.id, changes);
    setPlan(updated);
  };

  /**
   * Save from the embedded canvas (SWIIMS handleControlledCanvasSave): the
   * edited network is stored as a NEW network, "<config> - Edited Network",
   * the configuration is re-pointed at it and re-run — so the original
   * network other configurations use is never overwritten.
   */
  const handleControlledCanvasSave = useCallback(
    async (payload) => {
      if (!config) return;
      const base = (payload?.name || config.name || "Simulation Network").trim();
      const name = base.endsWith(" - Edited Network") ? base : `${base} - Edited Network`;
      const savedNetwork = await saveNetwork({
        name,
        description: payload?.description || config.description || "",
        nodes: payload?.nodes || [],
        edges: payload?.edges || [],
        canvas: payload?.canvas ?? null,
      });
      setNetworks((list) => [{ ...savedNetwork, nodeCount: (payload?.nodes || []).length, edgeCount: (payload?.edges || []).length }, ...list]);
      const saved = await updateSimulationConfig(config.id, { ...configBody(config), networkId: savedNetwork.id });
      setConfig(saved);
      updateListRow(saved.id, saved);
      setDirty(false);
      setCanvasDirty(false);
      setRunning(true);
      try {
        await runStored(saved);
      } finally {
        setRunning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config]
  );

  // ── Footer: draft / published counts and the rail toggle ──────────────────
  const draftCount = configs.filter((c) => c.status !== "published").length;
  const publishedCount = configs.length - draftCount;
  const statusItems = useMemo(() => ({
    left: [
      { label: "Simulations", value: configs.length, tone: "neutral" },
      // Amber, like the Draft tags in the list (the footer's "warn" tone is orange-red).
      { label: "Drafts", value: draftCount, tone: "#f59e0b" },
      { label: "Published", value: publishedCount, tone: "ok" },
    ],
    trailing: [{
      id: "scp-rail",
      label: "Simulations",
      title: railOpen ? "Hide the simulations list" : "Show the simulations list",
      icon: PanelLeft,
      pressed: railOpen,
      onClick: () => setRailOpen((v) => !v),
    }],
  }), [configs.length, draftCount, publishedCount, railOpen]);

  // ── Render ────────────────────────────────────────────────────────────────
  const headerStatus = !config ? undefined : dirty ? "Unsaved changes" : status === "published" ? "Published" : "Draft";
  const headerTone = !config ? "default" : dirty ? "amber" : status === "published" ? "green" : "amber";
  const days = config ? dayCount(config.from, config.to) : null;
  const selectedNetwork = networks.find((n) => n.id === config?.networkId);
  // The Canvas tab is a workspace: it fills the pane instead of scrolling with the setup card.
  const canvasView = Boolean(config && tab === "canvas" && plan);

  const header = (
    <WorkspaceHeader
      title={config ? config.name || "Untitled simulation" : "Simulation Config"}
      subtitle={config ? `Simulation config · ${selectedNetwork?.name || "No network"}` : "Dispatch · Network simulation"}
      icon={SlidersHorizontal}
      status={headerStatus}
      statusTone={headerTone}
      actions={[
        <WorkspaceHeaderButton key="rail" icon={railOpen ? PanelLeftClose : PanelLeftOpen} onClick={() => setRailOpen((v) => !v)}>
          {railOpen ? "Hide list" : "Show list"}
        </WorkspaceHeaderButton>,
        config && overrideCount > 0 && (
          <WorkspaceHeaderChip key="ovr" tone="amber">{overrideCount} override{overrideCount === 1 ? "" : "s"}</WorkspaceHeaderChip>
        ),
        config && (
          <WorkspaceHeaderButton key="save" icon={Save} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </WorkspaceHeaderButton>
        ),
        config && (
          <WorkspaceHeaderButton
            key="run"
            icon={running ? LoaderCircle : Play}
            tone="primary"
            onClick={() => handleRun()}
            disabled={running || !validation.canRun}
            title={validation.canRun ? "Run and store a draft plan" : validation.blockers[0]}
          >
            {running ? "Running…" : "Run simulation"}
          </WorkspaceHeaderButton>
        ),
      ].filter(Boolean)}
    />
  );

  const runNeeded = (
    <div className="scp-empty scp-empty--inline">
      <span className="scp-empty__icon" aria-hidden="true"><Play size={18} /></span>
      <strong>No run yet</strong>
      <p>Run the simulation to dispatch this setup and see its results and decisions.</p>
      <button type="button" className="scp-btn scp-btn--primary" onClick={() => handleRun({ stayOnTab: true })} disabled={running || !validation.canRun}>
        <Play size={14} aria-hidden="true" /> {running ? "Running…" : "Run simulation"}
      </button>
    </div>
  );

  const staleNotice = planIsStale && (
    <div className="scp-banner scp-banner--warn">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>
        Showing the run from {stamp(plan.runAt)} ({plan.network?.name} · {plan.from} → {plan.to}). The setup has changed since — run again to update.
      </span>
    </div>
  );

  return (
    <div className="scp-root">
    <TabStripBoundary>
      <SimulationTabs onCreate={openNewSimTab} onDuplicate={handleDuplicate} />
    </TabStripBoundary>
    <div className={`scp-shell${railOpen ? "" : " scp-shell--rail-collapsed"}`}>
      {!(config && tab === "canvas" && plan) && <ScpStatusItems items={statusItems} />}
      {railOpen && (
        <aside className="scp-rail" aria-label="Saved simulations">
          {listLoading ? (
            <div className="sl-panel"><div className="sl-empty">Loading simulations…</div></div>
          ) : (
            <SimulationConfigSidebar
              configs={configs}
              networks={networks}
              activeId={config?.id || id}
              onSelect={(configId) => openSimulation(configId, configs.find((c) => c.id === configId)?.name)}
              onNew={handleCreate}
              onDelete={handleDelete}
              creating={creating}
            />
          )}
        </aside>
      )}

      <div className={`metric scp page-transition${canvasView ? " scp--canvas" : ""}`}>
        {header}

        {error && (
          <div className="metric__notice metric__notice--error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {loading && <div className="scp-empty"><LoaderCircle size={18} className="scp-spin" aria-hidden="true" /> Loading simulation…</div>}

        {!loading && !config && (
          <div className="scp-empty">
            <span className="scp-empty__icon" aria-hidden="true"><SlidersHorizontal size={20} /></span>
            <strong>{configs.length ? "Select a simulation" : "No simulations yet"}</strong>
            <p>
              {configs.length
                ? "Pick a saved simulation from the list, or start a new one."
                : "Create a simulation, pick a network and a date range, and its assets load into the tables."}
            </p>
            <button type="button" className="scp-btn scp-btn--primary" onClick={handleCreate} disabled={creating}>
              <Plus size={14} aria-hidden="true" /> New simulation
            </button>
          </div>
        )}

        {!loading && config && (
          <>
            {!canvasView && <section className="scp-card" aria-label="Setup">
              <header className="scp-card__head">
                <h2>Setup</h2>
                {plan && (
                  <span className="scp-card__meta">
                    Last run {stamp(plan.runAt)}
                    {isPublished && <> · published {stamp(published?.publishedAt || plan.publishedAt)}</>}
                  </span>
                )}
              </header>
              <div className="scp-fields">
                <label className="scp-field">
                  <span>Name</span>
                  <input type="text" value={config.name || ""} onChange={(e) => patch({ name: e.target.value })} />
                </label>
                <label className="scp-field scp-field--wide">
                  <span>Description</span>
                  <input type="text" value={config.description || ""} placeholder="What this run is for"
                    onChange={(e) => patch({ description: e.target.value })} />
                </label>
                <label className="scp-field">
                  <span>Network</span>
                  <select ref={networkSelectRef} value={config.networkId || ""} onChange={(e) => patch({ networkId: e.target.value || null })}>
                    <option value="">Select a network…</option>
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name} · {n.nodeCount ?? 0} nodes</option>
                    ))}
                  </select>
                </label>
                <label className="scp-field">
                  <span>From</span>
                  <input type="date" value={config.from || ""} onChange={(e) => patch({ from: e.target.value })} />
                </label>
                <label className="scp-field">
                  <span>To {days ? <em className="scp-field__note">{days} day{days === 1 ? "" : "s"}</em> : null}</span>
                  <input type="date" value={config.to || ""} min={config.from || undefined} onChange={(e) => patch({ to: e.target.value })} />
                </label>
                <label className="scp-field">
                  <span>Strategic storage min. (%)</span>
                  <input type="number" min="0" max="100" value={config.strategicStorageMinPct ?? 70}
                    onChange={(e) => patch({ strategicStorageMinPct: Number(e.target.value) })} />
                </label>
              </div>

              {(validation.blockers.length > 0 || validation.warnings.length > 0) && (
                <ul className="scp-checks">
                  {validation.blockers.map((b) => (
                    <li key={b} className="scp-check scp-check--err"><CircleX size={14} aria-hidden="true" />{b}</li>
                  ))}
                  {validation.warnings.map((w) => (
                    <li key={w} className="scp-check scp-check--warn"><AlertTriangle size={14} aria-hidden="true" />{w}</li>
                  ))}
                </ul>
              )}
              {validation.canRun && validation.warnings.length === 0 && tablesPlan && (
                <ul className="scp-checks">
                  <li className="scp-check scp-check--ok"><CircleCheck size={14} aria-hidden="true" />Ready to run.</li>
                </ul>
              )}
            </section>}

            <nav className="scp-tabs" role="tablist" aria-label="Simulation views">
              {TABS.map((t) => {
                const disabled = t.needsRun && !plan;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={`scp-tab${tab === t.key ? " is-active" : ""}`}
                    onClick={() => setTab(t.key)}
                    title={disabled ? "Run the simulation first" : undefined}
                  >
                    {t.label}
                    {disabled && <span className="scp-tab__hint">run first</span>}
                  </button>
                );
              })}
              <span className="scp-tabs__meta">
                {tab === "configuration" && previewing && <><LoaderCircle size={12} className="scp-spin" aria-hidden="true" /> Updating tables…</>}
                {tab === "configuration" && !previewing && preview && <>Live preview · {preview.network?.name} · {preview.from} → {preview.to}</>}
                {tab !== "configuration" && plan && <>Run {stamp(plan.runAt)} · {plan.status === "published" || isPublished ? "Published" : "Draft"}</>}
              </span>
            </nav>

            {tab === "configuration" && (
              <>
                {previewError && (
                  <div className="scp-banner scp-banner--err">
                    <CircleX size={14} aria-hidden="true" /><span>Couldn&apos;t load the tables: {previewError}</span>
                  </div>
                )}
                {!config.networkId ? (
                  <div className="scp-empty scp-empty--inline">
                    <span className="scp-empty__icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
                    <strong>Pick a network</strong>
                    <p>Choose a saved network and a date range above; its plants, pump stations, tanks, city gates and pipelines load here.</p>
                  </div>
                ) : !tablesPlan ? (
                  <div className="scp-skeleton" aria-busy="true" aria-label="Loading tables">
                    {[0, 1, 2].map((i) => <div key={i} className="scp-skeleton__sheet"><span /><span /><span /><span /></div>)}
                  </div>
                ) : (
                  <div className={`scp-tables${previewing ? " is-updating" : ""}`}>
                    {tablesPlan.kpis && (
                      <div className="scp-outcome">
                        <h2 className="scp-outcome__title">
                          {preview ? "Live outcome" : "Outcome of the last run"}
                          <span>{preview ? "updates as you change the setup" : stamp(plan?.runAt)}</span>
                        </h2>
                        <RecordKpis
                          items={[
                            {
                              label: "Demand satisfaction",
                              value: tablesPlan.kpis.satisfactionPct == null ? "—" : `${Math.round(tablesPlan.kpis.satisfactionPct * 10) / 10}%`,
                              icon: CircleCheck,
                              tone: tablesPlan.kpis.satisfactionPct == null ? "neutral" : tablesPlan.kpis.satisfactionPct >= 95 ? "ok" : tablesPlan.kpis.satisfactionPct >= 80 ? "warn" : "err",
                              meter: tablesPlan.kpis.satisfactionPct ?? undefined,
                            },
                            {
                              label: "Shortfall",
                              value: Math.round(tablesPlan.kpis.totalShortageM3 || 0).toLocaleString(),
                              unit: "m³",
                              icon: AlertTriangle,
                              tone: tablesPlan.kpis.totalShortageM3 > 0 ? "err" : "ok",
                              sub: tablesPlan.kpis.gatesShort ? `${tablesPlan.kpis.gatesShort} gate${tablesPlan.kpis.gatesShort === 1 ? "" : "s"} short` : "All gates served",
                            },
                            {
                              label: "Plant utilisation",
                              value: tablesPlan.kpis.plantUtilisationPct == null ? "—" : `${Math.round(tablesPlan.kpis.plantUtilisationPct * 10) / 10}%`,
                              icon: Gauge,
                              tone: "acc",
                              meter: tablesPlan.kpis.plantUtilisationPct ?? undefined,
                            },
                            {
                              label: "Variable O&M cost",
                              value: Math.round(tablesPlan.kpis.totalVariableOmCost || 0).toLocaleString(),
                              unit: "SAR",
                              icon: Coins,
                              tone: "neutral",
                              sub: tablesPlan.kpis.avgCostPerM3 == null ? undefined : `${tablesPlan.kpis.avgCostPerM3.toFixed(2)} SAR/m³ delivered`,
                            },
                          ]}
                        />
                      </div>
                    )}
                    <SimulationTables plan={tablesPlan} overrides={overrides} onOverrideChange={handleOverrideChange} />
                  </div>
                )}
              </>
            )}

            {tab === "results" && (plan ? <>{staleNotice}<ResultsPanel plan={plan} /></> : runNeeded)}
            {tab === "decisions" && (plan ? (
              <>
                {staleNotice}
                <DecisionsPanel
                  plan={plan}
                  onPublish={handlePublish}
                  publishing={publishing}
                  publishError={publishError}
                  published={published}
                  onDecisionSave={handleDecisionSave}
                />
              </>
            ) : runNeeded)}
            {tab === "canvas" && (plan ? (
              <div className="scp__canvas-host">
                {canvasDirty && (
                  <div className="scp-banner scp-banner--warn">
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>Unsaved canvas edits. Save (Home → Save) stores them as a new &quot;{config.name} - Edited Network&quot; and re-runs against it.</span>
                  </div>
                )}
                <NetworkCanvasWorkspace
                  workspaceMode="simulation"
                  controlledDocument={canvasDoc}
                  controlledName={config.name}
                  controlledDescription={config.description}
                  plan={plan}
                  horizonStart={config.from}
                  horizonEnd={config.to}
                  readOnly={isPublished}
                  readOnlyNotice="This plan has been published, so its network is frozen here. Run again to edit the network for a new plan."
                  onControlledSave={handleControlledCanvasSave}
                  onDirtyChange={setCanvasDirty}
                  onRun={() => handleRun({ stayOnTab: true })}
                  running={running}
                />
              </div>
            ) : runNeeded)}
          </>
        )}
      </div>
    </div>
    </div>
  );
}

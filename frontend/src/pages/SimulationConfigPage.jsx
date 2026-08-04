import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import WorkspaceHeader, { WorkspaceHeaderButton, WorkspaceHeaderChip } from "../components/WorkspaceHeader";
import SimulationTables from "../components/simulation/SimulationTables";
import ResultsPanel from "../components/simulation/ResultsPanel";
import DecisionsPanel from "../components/simulation/DecisionsPanel";
import CanvasPanel from "../components/simulation/CanvasPanel";
import { countOverrides, validateConfig } from "../lib/simulationRows";
import {
  createSimulationConfig, deleteSimulationConfig, fetchDispatchPlan, fetchSimulationConfig,
  fetchSimulationConfigs, publishDispatchPlan, runSimulation, updateSimulationConfig,
} from "../api/simulation";
import { fetchNetworks } from "../api/networks";
import "../components/MetricDashboard.css";
import "./SimulationConfigPage.css";

const TABS = [
  { key: "configuration", label: "Configuration" },
  { key: "results", label: "Results" },
  { key: "decisions", label: "Decisions" },
  { key: "canvas", label: "Canvas" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function SimulationConfigPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [configs, setConfigs] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [config, setConfig] = useState(null);
  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState("configuration");

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [published, setPublished] = useState(null);

  // ── Load the picker lists once ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSimulationConfigs(), fetchNetworks()])
      .then(([c, n]) => {
        if (cancelled) return;
        setConfigs(c.configs);
        setNetworks(n.networks);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // ── Load the selected config, and its last plan if it has one ─────────────
  useEffect(() => {
    if (!id) {
      setConfig(null);
      setPlan(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPublished(null);

    fetchSimulationConfig(id)
      .then(async (c) => {
        if (cancelled) return;
        setConfig(c);
        setDirty(false);
        if (c.latestPlanId) {
          // A stored plan may have been deleted; a missing one is not an error.
          const last = await fetchDispatchPlan(c.latestPlanId).catch(() => null);
          if (!cancelled) setPlan(last);
        } else {
          setPlan(null);
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [id]);

  const overrides = config?.overrides || {};
  const overrideCount = useMemo(() => countOverrides(overrides), [overrides]);
  const validation = useMemo(() => validateConfig(config, { plan }), [config, plan]);

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
    try {
      const from = todayIso();
      const created = await createSimulationConfig({
        name: `Dispatch run ${from}`,
        networkId: networks[0]?.id ?? null,
        from,
        to: plusDays(from, 13),
      });
      setConfigs((list) => [{ ...created }, ...list]);
      navigate(`/simulation-config/${encodeURIComponent(created.id)}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateSimulationConfig(config.id, {
        name: config.name,
        description: config.description,
        networkId: config.networkId,
        from: config.from,
        to: config.to,
        overrides: config.overrides || {},
      });
      setConfig(saved);
      setConfigs((list) => list.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)));
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    setError(null);
    try {
      await deleteSimulationConfig(config.id);
      setConfigs((list) => list.filter((c) => c.id !== config.id));
      navigate("/simulation-config");
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRun = async () => {
    if (!config) return;
    setRunning(true);
    setError(null);
    setPublished(null);
    setPublishError(null);
    try {
      // Save first so the run and the stored config cannot disagree.
      if (dirty) await handleSave();
      const result = await runSimulation(config.id, {
        from: config.from,
        to: config.to,
        overrides: config.overrides || {},
      });
      setPlan(result);
      setTab("results");
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
      setPublished(await publishDispatchPlan(plan.id));
    } catch (e) {
      setPublishError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const header = (
    <WorkspaceHeader
      title="Simulation Config"
      subtitle="Dispatch · Network simulation"
      icon={SlidersHorizontal}
      status={dirty ? "Unsaved changes" : undefined}
      statusTone="amber"
      actions={[
        <select
          key="picker"
          className="scp__picker"
          value={config?.id || ""}
          onChange={(e) => navigate(e.target.value ? `/simulation-config/${encodeURIComponent(e.target.value)}` : "/simulation-config")}
        >
          <option value="">Select a configuration…</option>
          {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>,
        <WorkspaceHeaderButton key="new" icon={Plus} onClick={handleCreate}>New</WorkspaceHeaderButton>,
        config && <WorkspaceHeaderButton key="save" icon={Save} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </WorkspaceHeaderButton>,
        config && overrideCount > 0 && (
          <WorkspaceHeaderChip key="ovr" tone="amber">{overrideCount} override{overrideCount === 1 ? "" : "s"}</WorkspaceHeaderChip>
        ),
        config && (
          <WorkspaceHeaderButton key="run" icon={Play} tone="blue" onClick={handleRun} disabled={running || !validation.canRun}>
            {running ? "Running…" : "Run simulation"}
          </WorkspaceHeaderButton>
        ),
      ].filter(Boolean)}
    />
  );

  return (
    <div className="metric page-transition scp">
      {header}

      {error && (
        <div className="metric__notice metric__notice--error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {loading && <div className="metric__notice">Loading…</div>}

      {!loading && !config && (
        <div className="metric__notice">
          {configs.length
            ? "Select a configuration above, or create a new one."
            : "No simulation configurations yet. Create one to dispatch over a saved network."}
        </div>
      )}

      {!loading && config && (
        <>
          <section className="sheet scp__setup">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">Setup</h2>
              <button className="scp__delete" onClick={handleDelete}><Trash2 size={13} /> Delete</button>
            </header>
            <div className="scp__setup-grid">
              <label>
                <span>Name</span>
                <input type="text" value={config.name || ""} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="scp__wide">
                <span>Description</span>
                <input type="text" value={config.description || ""} placeholder="What this run is for"
                  onChange={(e) => patch({ description: e.target.value })} />
              </label>
              <label>
                <span>Network</span>
                <select value={config.networkId || ""} onChange={(e) => patch({ networkId: e.target.value || null })}>
                  <option value="">Select a network…</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>{n.name} ({n.nodeCount} nodes)</option>
                  ))}
                </select>
              </label>
              <label>
                <span>From</span>
                <input type="date" value={config.from || ""} onChange={(e) => patch({ from: e.target.value })} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={config.to || ""} onChange={(e) => patch({ to: e.target.value })} />
              </label>
            </div>

            {(validation.blockers.length > 0 || validation.warnings.length > 0) && (
              <div className="scp__checks">
                {validation.blockers.map((b) => <p key={b} className="scp__check scp__check--block">{b}</p>)}
                {validation.warnings.map((w) => <p key={w} className="scp__check scp__check--warn">{w}</p>)}
              </div>
            )}
          </section>

          {!plan && (
            <div className="metric__notice">
              Run the simulation to pull the portals' approved production, transmission, demand and
              Variable O&amp;M values for this range.
            </div>
          )}

          {plan && (
            <>
              <nav className="scp__tabs">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`scp__tab ${tab === t.key ? "scp__tab--active" : ""}`.trim()}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="scp__runmeta">
                  {plan.network?.name} · {plan.from} → {plan.to} · run {new Date(plan.runAt).toLocaleString()}
                </span>
              </nav>

              {tab === "configuration" && (
                <SimulationTables plan={plan} overrides={overrides} onOverrideChange={handleOverrideChange} />
              )}
              {tab === "results" && <ResultsPanel plan={plan} />}
              {tab === "decisions" && (
                <DecisionsPanel
                  plan={plan}
                  onPublish={handlePublish}
                  publishing={publishing}
                  publishError={publishError}
                  published={published}
                />
              )}
              {tab === "canvas" && <CanvasPanel plan={plan} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock3, Factory, Gauge,
  Network, RefreshCw, SlidersHorizontal, TriangleAlert, Waves,
} from "lucide-react";
import { fetchOperationsOverview } from "../api/operations";
import { useLayout } from "../contexts/LayoutContext";
import {
  EmptyState, Notice, PageHeader, SkeletonGrid, StatCard, StatusBadge,
} from "../components/ui/WorkspacePrimitives";
import "./HomePage.css";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmtM3 = (value) => compact.format(Number(value) || 0);
const fmtDateTime = (value) => value ? new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(value)) : "Not available";

const QUICK_ACTIONS = [
  { title: "Review production", detail: "Capacity, quality and outages", path: "/production", icon: Factory },
  { title: "Open demand", detail: "City-gate requirements and decisions", path: "/demand", icon: Waves },
  { title: "Build a network", detail: "Create or validate topology", path: "/network-builder", icon: Network },
  { title: "Configure simulation", detail: "Run and publish dispatch", path: "/simulation-config", icon: SlidersHorizontal },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { setToolbar, setSidebar } = useLayout();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setToolbar(null);
    setSidebar(null, null);
  }, [setToolbar, setSidebar]);

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchOperationsOverview({ signal: controller.signal })
      .then(setOverview)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message || "Could not load the operating position");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => load(), [load]);

  return (
    <main className="operations-page page-transition">
      <PageHeader
        eyebrow="WIDispatch · Operator workspace"
        title="Operations command center"
        description="Latest approved data, dispatch position, exceptions, and decisions requiring attention."
        icon={Gauge}
        meta={overview && <StatusBadge tone={overview.exceptions.length ? "warning" : "success"}>{overview.exceptions.length ? `${overview.exceptions.length} exceptions` : "System ready"}</StatusBadge>}
        actions={(
          <>
            <span className="operations-page__updated"><Clock3 size={13} /> Updated {fmtDateTime(overview?.generatedAt)}</span>
            <button type="button" className="operations-page__refresh" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
          </>
        )}
      />

      {error && <Notice tone="critical" title="Operating position unavailable" action={<button type="button" onClick={load}>Try again</button>}>{error}</Notice>}
      {overview?.warnings?.length > 0 && <Notice tone="warning" title="Some sources are delayed">The available sections are shown below. Refresh to retry delayed data.</Notice>}

      {loading && <SkeletonGrid cards={4} />}
      {!loading && overview && (
        <>
          <section className="operations-kpis" aria-label="Operating position">
            <StatCard label="Approved supply" value={fmtM3(overview.supply.actualM3)} unit="m³" detail={`Data ${overview.supply.dataDate || "unavailable"}`} icon={Factory} tone={overview.supply.isStale ? "warning" : "success"} />
            <StatCard label="Required demand" value={fmtM3(overview.demand.requiredM3)} unit="m³" detail={`Data ${overview.demand.dataDate || "unavailable"}`} icon={Waves} tone="info" />
            <StatCard label="Delivered" value={fmtM3(overview.demand.deliveredM3)} unit="m³" detail={overview.latestPlan ? overview.latestPlan.name : "Latest approved production"} icon={CheckCircle2} tone="success" />
            <StatCard label="Shortage" value={fmtM3(overview.demand.shortageM3)} unit="m³" detail={overview.demand.shortageM3 ? "Operator attention required" : "No unmet volume"} icon={TriangleAlert} tone={overview.demand.shortageM3 ? "critical" : "success"} />
          </section>

          <section className="operations-grid">
            <article className="operations-panel operations-panel--position">
              <header><div><p>System position</p><h2>Supply and network readiness</h2></div><StatusBadge tone={overview.demand.shortageM3 ? "critical" : "success"}>{overview.demand.shortageM3 ? "Constrained" : "Balanced"}</StatusBadge></header>
              <div className="operations-position__row">
                <span>Available production</span><strong>{number.format(overview.supply.availableM3)} m³</strong>
                <div><i style={{ width: "100%" }} /></div>
              </div>
              <div className="operations-position__row">
                <span>Delivered volume</span><strong>{number.format(overview.demand.deliveredM3)} m³</strong>
                <div><i style={{ width: `${Math.min(100, overview.supply.availableM3 ? (overview.demand.deliveredM3 / overview.supply.availableM3) * 100 : 0)}%` }} /></div>
              </div>
              <dl className="operations-position__facts">
                <div><dt>Production headroom</dt><dd>{number.format(overview.supply.headroomM3)} m³</dd></div>
                <div><dt>Assets operational</dt><dd>{overview.transmission.operationalAssets} / {overview.transmission.totalAssets}</dd></div>
                <div><dt>Maintenance impact</dt><dd>{number.format(overview.transmission.maintenanceImpactM3)} m³</dd></div>
                <div><dt>Outage loss</dt><dd>{number.format(overview.transmission.outageLossM3)} m³</dd></div>
              </dl>
            </article>

            <article className="operations-panel operations-panel--attention">
              <header><div><p>Attention queue</p><h2>Exceptions and data health</h2></div><span className="operations-panel__count">{overview.exceptions.length}</span></header>
              <div className="operations-exceptions">
                {overview.exceptions.slice(0, 5).map((item) => (
                  <button type="button" key={item.id} onClick={() => navigate(item.path)}>
                    <span className={`operations-exceptions__icon operations-exceptions__icon--${item.tone}`}><AlertTriangle size={15} /></span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ArrowRight size={14} />
                  </button>
                ))}
                {overview.exceptions.length === 0 && <div className="operations-exceptions__clear"><CheckCircle2 size={22} /><strong>No active exceptions</strong><span>Approved data and the latest dispatch are within normal operating limits.</span></div>}
              </div>
            </article>

            <article className="operations-panel operations-panel--pending">
              <header><div><p>Decision queue</p><h2>Pending operator work</h2></div><span className="operations-panel__count">{overview.pending.total}</span></header>
              <div className="operations-pending">
                <button type="button" onClick={() => navigate("/production")}><span>Maintenance reviews</span><strong>{overview.pending.maintenance}</strong></button>
                <button type="button" onClick={() => navigate("/demand")}><span>Demand decisions</span><strong>{overview.pending.demand}</strong></button>
                <button type="button" onClick={() => navigate("/simulation-config")}><span>Draft dispatch plans</span><strong>{overview.pending.draftPlans}</strong></button>
              </div>
            </article>

            <article className="operations-panel operations-panel--runs">
              <header><div><p>Dispatch activity</p><h2>Recent simulation runs</h2></div><button type="button" onClick={() => navigate("/simulation-config")}>Open simulations <ArrowRight size={13} /></button></header>
              {overview.recentRuns.length ? (
                <div className="operations-runs">
                  {overview.recentRuns.slice(0, 4).map((run) => (
                    <button type="button" key={run.id} onClick={() => navigate(run.configId ? `/simulation-config/${encodeURIComponent(run.configId)}` : "/simulation-config")}>
                      <span><strong>{run.name}</strong><small>{fmtDateTime(run.runAt)} · {run.from || "—"} to {run.to || "—"}</small></span>
                      <span className="operations-runs__metrics"><StatusBadge status={run.status} /><small>{compact.format(run.deliveredM3)} m³ delivered</small></span>
                    </button>
                  ))}
                </div>
              ) : <EmptyState title="No simulation runs yet" action={<button type="button" onClick={() => navigate("/simulation-config")}>Configure a simulation</button>}>Create a configuration to calculate and review the dispatch plan.</EmptyState>}
            </article>
          </section>

          <section className="operations-quick" aria-label="Quick actions">
            <div><p>Quick actions</p><h2>Continue operating</h2></div>
            {QUICK_ACTIONS.map(({ title, detail, path, icon: Icon }) => (
              <button type="button" key={path} onClick={() => navigate(path)}><span><Icon size={16} /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={14} /></button>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

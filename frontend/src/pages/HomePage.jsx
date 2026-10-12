import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Archive, CheckCircle2, ChevronRight, Clock3, Factory, FileClock, Gauge,
  LoaderCircle, Network, RefreshCw, SlidersHorizontal, TriangleAlert, Waves, Wrench,
} from "lucide-react";
import { fetchOperationsOverview } from "../api/operations";
import { useLayout } from "../contexts/LayoutContext";
import WorkspaceHeader, { WorkspaceHeaderButton } from "../components/WorkspaceHeader";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./HomePage.css";

// Operations home: the operating position at a glance, in the app's card
// language — header like every workspace, KPI cards with tinted icon tiles,
// cards with an uppercase header row, rows that open the page they describe.

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmtM3 = (value) => compact.format(Number(value) || 0);
const fmtDateTime = (value) => value ? new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(value)) : "—";
const pct = (part, whole) => (whole ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

const QUICK_ACTIONS = [
  { title: "Production", detail: "Capacity, quality and outages", path: "/production", icon: Factory, colour: ENTITY_TYPE_COLORS.plant },
  { title: "Demand", detail: "City-gate requirements and decisions", path: "/demand", icon: Waves, colour: ENTITY_TYPE_COLORS.handover_point },
  { title: "Network Builder", detail: "Create or validate topology", path: "/network-builder", icon: Network, colour: "#5b7ca3" },
  { title: "Simulation Config", detail: "Run and publish dispatch", path: "/simulation-config", icon: SlidersHorizontal, colour: "var(--acc)" },
  { title: "Asset Registry", detail: "Assets, tags and locations", path: "/asset-registry", icon: Archive, colour: ENTITY_TYPE_COLORS.tank },
];

function Kpi({ icon: Icon, tone = "acc", label, value, unit, sub, meter }) {
  return (
    <section className={`home-kpi home-tone--${tone}`} aria-label={label}>
      <header className="home-kpi__head">
        <span className="home-kpi__icon" aria-hidden="true"><Icon size={16} /></span>
        <span className="home-kpi__label">{label}</span>
      </header>
      <div className="home-kpi__value">{value}{unit && <small>{unit}</small>}</div>
      {meter != null && <div className="home-kpi__meter" aria-hidden="true"><span style={{ width: `${meter}%` }} /></div>}
      {sub && <span className="home-kpi__sub">{sub}</span>}
    </section>
  );
}

function Card({ title, count, countTone, aside, className = "", children }) {
  return (
    <section className={`home-card ${className}`.trim()} aria-label={title}>
      <header className="home-card__head">
        <h2>{title}</h2>
        {count != null && <span className={`home-pill${countTone ? ` home-pill--${countTone}` : ""}`}>{count}</span>}
        {aside && <span className="home-card__aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

function Banner({ tone, children, action }) {
  return (
    <div className={`home-banner home-banner--${tone}`} role={tone === "err" ? "alert" : "status"}>
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{children}</span>
      {action}
    </div>
  );
}

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

  const exceptions = overview?.exceptions || [];
  const shortage = overview?.demand.shortageM3 || 0;
  const status = !overview ? undefined : exceptions.length ? `${exceptions.length} exception${exceptions.length === 1 ? "" : "s"}` : "System ready";

  return (
    <main className="home page-transition">
      <WorkspaceHeader
        title="Operations"
        subtitle="Dispatch · Operating position"
        icon={Gauge}
        status={status}
        statusTone={exceptions.length ? "amber" : "green"}
        actions={[
          <span key="updated" className="home__updated"><Clock3 size={13} aria-hidden="true" /> Updated {fmtDateTime(overview?.generatedAt)}</span>,
          <WorkspaceHeaderButton key="refresh" icon={loading ? LoaderCircle : RefreshCw} onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </WorkspaceHeaderButton>,
        ]}
      />

      {error && (
        <Banner tone="err" action={<button type="button" className="home-btn" onClick={load}>Try again</button>}>
          Operating position unavailable: {error}
        </Banner>
      )}
      {overview?.warnings?.length > 0 && (
        <Banner tone="warn">Some sources are delayed. The available sections are shown; refresh to retry.</Banner>
      )}

      {loading && !overview && (
        <div className="home-skeleton" aria-busy="true" aria-label="Loading the operating position">
          {[0, 1, 2, 3].map((i) => <span key={i} />)}
        </div>
      )}

      {overview && (
        <div className={`home__body${loading ? " is-refreshing" : ""}`}>
          <div className="home-kpis">
            <Kpi
              icon={Factory}
              tone={overview.supply.isStale ? "warn" : "ok"}
              label="Approved supply"
              value={fmtM3(overview.supply.actualM3)}
              unit="m³"
              meter={pct(overview.supply.actualM3, overview.supply.availableM3)}
              sub={`${overview.supply.isStale ? "Stale · " : ""}data ${overview.supply.dataDate || "unavailable"}`}
            />
            <Kpi
              icon={Waves}
              tone={overview.demand.isStale ? "warn" : "acc"}
              label="Required demand"
              value={fmtM3(overview.demand.requiredM3)}
              unit="m³"
              sub={`${overview.demand.isStale ? "Stale · " : ""}data ${overview.demand.dataDate || "unavailable"}`}
            />
            <Kpi
              icon={CheckCircle2}
              tone="ok"
              label="Delivered"
              value={fmtM3(overview.demand.deliveredM3)}
              unit="m³"
              meter={pct(overview.demand.deliveredM3, overview.demand.requiredM3)}
              sub={overview.latestPlan ? `Latest run · ${overview.latestPlan.name}` : "Latest approved production"}
            />
            <Kpi
              icon={TriangleAlert}
              tone={shortage ? "err" : "ok"}
              label="Shortage"
              value={fmtM3(shortage)}
              unit="m³"
              sub={shortage ? "Operator attention required" : "No unmet volume"}
            />
          </div>

          <div className="home-grid">
            <Card
              title="Supply and network readiness"
              className="home-card--position"
              aside={<span className={`home-pill home-pill--${shortage ? "err" : "ok"}`}>{shortage ? "Constrained" : "Balanced"}</span>}
            >
              <div className="home-bars">
                <div className="home-bar">
                  <span>Available production</span>
                  <strong className="mono">{number.format(overview.supply.availableM3)} m³</strong>
                  <div className="home-bar__track"><i className="home-bar__fill home-bar__fill--avail" style={{ width: "100%" }} /></div>
                </div>
                <div className="home-bar">
                  <span>Delivered volume</span>
                  <strong className="mono">{number.format(overview.demand.deliveredM3)} m³</strong>
                  <div className="home-bar__track">
                    <i className="home-bar__fill" style={{ width: `${pct(overview.demand.deliveredM3, overview.supply.availableM3)}%` }} />
                  </div>
                </div>
                <div className="home-bar">
                  <span>Required demand</span>
                  <strong className="mono">{number.format(overview.demand.requiredM3)} m³</strong>
                  <div className="home-bar__track">
                    <i className={`home-bar__fill home-bar__fill--req${overview.demand.requiredM3 > overview.supply.availableM3 ? " is-over" : ""}`}
                      style={{ width: `${pct(overview.demand.requiredM3, overview.supply.availableM3)}%` }} />
                  </div>
                </div>
              </div>
              <dl className="home-facts">
                <div><dt>Production headroom</dt><dd className="mono">{number.format(overview.supply.headroomM3)} m³</dd></div>
                <div><dt>Assets operational</dt><dd className="mono">{overview.transmission.operationalAssets} / {overview.transmission.totalAssets}</dd></div>
                <div><dt>Maintenance impact</dt><dd className="mono">{number.format(overview.transmission.maintenanceImpactM3)} m³</dd></div>
                <div><dt>Outage loss</dt><dd className="mono home-facts__bad">{number.format(overview.transmission.outageLossM3)} m³</dd></div>
              </dl>
            </Card>

            <Card title="Exceptions and data health" count={exceptions.length} countTone={exceptions.length ? "warn" : "ok"} className="home-card--attention">
              <div className="home-rows">
                {exceptions.slice(0, 5).map((item) => (
                  <button type="button" key={item.id} className="home-row" onClick={() => navigate(item.path)}>
                    <span className={`home-row__icon home-tone--${item.tone === "critical" ? "err" : "warn"}`} aria-hidden="true">
                      <AlertTriangle size={14} />
                    </span>
                    <span className="home-row__text"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ChevronRight size={14} className="home-row__chev" aria-hidden="true" />
                  </button>
                ))}
                {exceptions.length > 5 && <span className="home-rows__more">+{exceptions.length - 5} more</span>}
                {exceptions.length === 0 && (
                  <div className="home-clear">
                    <span className="home-row__icon home-tone--ok" aria-hidden="true"><CheckCircle2 size={16} /></span>
                    <strong>No active exceptions</strong>
                    <span>Approved data and the latest dispatch are within normal operating limits.</span>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Pending operator work" count={overview.pending.total} countTone={overview.pending.total ? "warn" : "ok"} className="home-card--pending">
              <div className="home-pending">
                {[
                  { label: "Maintenance reviews", value: overview.pending.maintenance, path: "/production", icon: Wrench, tone: "warn" },
                  { label: "Demand decisions", value: overview.pending.demand, path: "/demand", icon: Waves, tone: "acc" },
                  { label: "Draft dispatch plans", value: overview.pending.draftPlans, path: "/simulation-config", icon: FileClock, tone: "acc" },
                ].map(({ label, value, path, icon: Icon, tone }) => (
                  <button type="button" key={label} className="home-pending__item" onClick={() => navigate(path)}>
                    <span className={`home-row__icon home-tone--${value ? tone : "ok"}`} aria-hidden="true"><Icon size={14} /></span>
                    <span className="home-pending__text">
                      <small>{label}</small>
                      <strong className="mono">{number.format(value)}</strong>
                    </span>
                    <ArrowRight size={13} className="home-row__chev" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </Card>

            <Card
              title="Recent simulation runs"
              className="home-card--runs"
              aside={<button type="button" className="home-link" onClick={() => navigate("/simulation-config")}>Open simulations <ArrowRight size={12} aria-hidden="true" /></button>}
            >
              {overview.recentRuns.length ? (
                <div className="home-rows">
                  {overview.recentRuns.slice(0, 4).map((run) => (
                    <button
                      type="button"
                      key={run.id}
                      className="home-row"
                      onClick={() => navigate(run.configId ? `/simulation-config/${encodeURIComponent(run.configId)}` : "/simulation-config")}
                    >
                      <span className={`home-row__icon home-tone--${run.hasShortage ? "warn" : "ok"}`} aria-hidden="true"><SlidersHorizontal size={14} /></span>
                      <span className="home-row__text">
                        <strong>{run.name}</strong>
                        <small>{fmtDateTime(run.runAt)} · {run.from || "—"} → {run.to || "—"}</small>
                      </span>
                      <span className="home-row__meta">
                        <span className={`home-pill home-pill--${run.status === "published" ? "ok" : "warn"}`}>
                          {run.status === "published" ? "Published" : "Draft"}
                        </span>
                        <small className="mono">{compact.format(run.deliveredM3)} m³ delivered</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home-clear">
                  <span className="home-row__icon home-tone--acc" aria-hidden="true"><SlidersHorizontal size={16} /></span>
                  <strong>No simulation runs yet</strong>
                  <span>Create a configuration to calculate and review the dispatch plan.</span>
                  <button type="button" className="home-btn" onClick={() => navigate("/simulation-config")}>Configure a simulation</button>
                </div>
              )}
            </Card>
          </div>

          <section className="home-quick" aria-label="Quick actions">
            <h2 className="home-quick__title">Go to</h2>
            <div className="home-quick__grid">
              {QUICK_ACTIONS.map(({ title, detail, path, icon: Icon, colour }) => (
                <button type="button" key={path} className="home-quick__item" style={{ "--home-colour": colour }} onClick={() => navigate(path)}>
                  <span className="home-quick__icon" aria-hidden="true"><Icon size={16} /></span>
                  <span className="home-row__text"><strong>{title}</strong><small>{detail}</small></span>
                  <ArrowRight size={14} className="home-row__chev" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

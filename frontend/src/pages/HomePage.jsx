import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, Archive, ArrowRight, ArrowDown, ArrowUp, CalendarRange, CheckCircle2, ChevronRight, Clock3, Eye, EyeOff,
  Factory, FileClock, Gauge, LayoutGrid, LoaderCircle, Map as MapIcon, Network, PieChart, RefreshCw, RotateCcw, SlidersHorizontal,
  Table2, TrendingUp, TriangleAlert, Waves, Wrench, X,
} from "lucide-react";
import { fetchOperationsOverview } from "../api/operations";
import { apiRequest } from "../api/client";
import { fetchAssets } from "../api/metrics";
import { fetchRecentOutages } from "../api/production";
import { useLayout } from "../contexts/LayoutContext";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import Sparkline from "../components/home/Sparkline";
import HomeTrendChart from "../components/home/HomeTrendChart";
import HomeNetworkMap, { assetPath } from "../components/home/HomeNetworkMap";
import HomeRegionChart from "../components/home/HomeRegionChart";
import HomePerformanceTable from "../components/home/HomePerformanceTable";
import HomeActivityFeed from "../components/home/HomeActivityFeed";
import {
  PERIOD_PRESETS, REGIONS, buildActivity, buildDailySeries, buildEntityTable, buildKpis, buildRegionBreakdown, byRegion,
  dataBounds, dayDetail, resolvePeriod,
} from "../lib/homeInsights";
import "./HomePage.css";
import DateInput from "../components/DateInput";

// Operations home, for operators and managers: the position for the chosen
// period and region (KPIs with trend and change), supply vs demand over time,
// what needs attention, the network on a map, regional balance, plant and
// city-gate performance, and recent activity. Every chart, row and marker
// opens what it shows. Sections can be hidden and reordered (Customise).

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmtM3 = (value) => compact.format(Number(value) || 0);
const fmtDateTime = (value) => value ? new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(value)) : "—";
const fmtDay = (iso) => iso ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "—";
const clampPct = (value) => (value == null ? null : Math.max(0, Math.min(100, value)));

const QUICK_ACTIONS = [
  { title: "Production", detail: "Capacity, quality and outages", path: "/production", icon: Factory, colour: ENTITY_TYPE_COLORS.plant },
  { title: "Demand", detail: "City-gate requirements and decisions", path: "/demand", icon: Waves, colour: ENTITY_TYPE_COLORS.handover_point },
  { title: "Network Builder", detail: "Create or validate topology", path: "/network-builder", icon: Network, colour: "#5b7ca3" },
  { title: "Simulation Config", detail: "Run and publish dispatch", path: "/simulation-config", icon: SlidersHorizontal, colour: "var(--acc)" },
  { title: "Asset Registry", detail: "Assets, tags and locations", path: "/asset-registry", icon: Archive, colour: ENTITY_TYPE_COLORS.tank },
];

// ── Layout (Customise) ───────────────────────────────────────────────────────
const SECTIONS = [
  { id: "kpis", title: "Key figures", icon: Gauge, span: "full" },
  { id: "trend", title: "Supply vs demand", icon: TrendingUp, span: "wide" },
  { id: "attention", title: "Needs attention", icon: AlertTriangle, span: "narrow" },
  { id: "map", title: "Network map", icon: MapIcon, span: "wide" },
  { id: "regions", title: "Regional balance", icon: PieChart, span: "narrow" },
  { id: "performance", title: "Performance", icon: Table2, span: "wide" },
  { id: "activity", title: "Activity", icon: Activity, span: "narrow" },
  { id: "quick", title: "Go to", icon: LayoutGrid, span: "full" },
];
const LAYOUT_KEY = "widispatch.home.layout";
const FILTER_KEY = "widispatch.home.filters";
const DEFAULT_LAYOUT = { order: SECTIONS.map((s) => s.id), hidden: [] };

const readJson = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the page still works, it just won't remember.
  }
};
const readLayout = () => {
  const saved = readJson(LAYOUT_KEY, DEFAULT_LAYOUT);
  const known = SECTIONS.map((s) => s.id);
  const order = [...(saved.order || []).filter((id) => known.includes(id)), ...known.filter((id) => !(saved.order || []).includes(id))];
  return { order, hidden: (saved.hidden || []).filter((id) => known.includes(id)) };
};

// ── Small pieces ─────────────────────────────────────────────────────────────
function Delta({ value, invert = false }) {
  if (value == null || !Number.isFinite(value)) return <span className="home-delta">no prior data</span>;
  const flat = Math.abs(value) < 0.5;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={`home-delta${flat ? "" : good ? " is-up" : " is-down"}`} title="Average per day, against the previous period of the same length">
      {flat ? "±0%" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(1)}%`} <span className="home-muted">vs prev.</span>
    </span>
  );
}

function Kpi({ icon: Icon, tone = "acc", label, value, unit, sub, meter, spark, sparkColor, delta, onClick, title }) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag type={onClick ? "button" : undefined} className={`home-kpi home-tone--${tone}${onClick ? " is-link" : ""}`} aria-label={label} onClick={onClick} title={title}>
      <header className="home-kpi__head">
        <span className="home-kpi__icon" aria-hidden="true"><Icon size={16} /></span>
        <span className="home-kpi__label">{label}</span>
      </header>
      <div className="home-kpi__main">
        <div className="home-kpi__value">{value}{unit && <small>{unit}</small>}</div>
        {spark && <Sparkline values={spark} color={sparkColor} width={92} height={30} />}
      </div>
      {meter != null && <div className="home-kpi__meter" aria-hidden="true"><span style={{ width: `${meter}%` }} /></div>}
      <div className="home-kpi__foot">
        {delta}
        {sub && <span className="home-kpi__sub">{sub}</span>}
      </div>
    </Tag>
  );
}

function Card({ id, title, icon: Icon, count, countTone, aside, className = "", children }) {
  return (
    <section className={`home-card ${className}`.trim()} aria-label={title} data-section={id}>
      <header className="home-card__head">
        {Icon && <Icon size={13} className="home-card__icon" aria-hidden="true" />}
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

// Show / hide / reorder sections.
function CustomisePanel({ layout, onChange, onReset, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.(".home-customise-toggle")) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const move = (id, by) => {
    const order = [...layout.order];
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    onChange({ ...layout, order });
  };
  const toggle = (id) =>
    onChange({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });

  return (
    <div ref={ref} className="home-customise" role="dialog" aria-label="Customise the home page">
      <header>
        <strong>Customise</strong>
        <span className="home-muted">Show, hide and reorder sections</span>
        <button type="button" className="home-icon-btn" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </header>
      <ul>
        {layout.order.map((id, index) => {
          const section = SECTIONS.find((s) => s.id === id);
          const off = layout.hidden.includes(id);
          const Icon = section.icon;
          return (
            <li key={id} className={off ? "is-off" : ""}>
              <Icon size={14} aria-hidden="true" />
              <span>{section.title}</span>
              <button type="button" className="home-icon-btn" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Move ${section.title} up`}><ArrowUp size={13} /></button>
              <button type="button" className="home-icon-btn" onClick={() => move(id, 1)} disabled={index === layout.order.length - 1} aria-label={`Move ${section.title} down`}><ArrowDown size={13} /></button>
              <button type="button" className="home-icon-btn" onClick={() => toggle(id)} aria-label={off ? `Show ${section.title}` : `Hide ${section.title}`} title={off ? "Show" : "Hide"}>
                {off ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </li>
          );
        })}
      </ul>
      <footer>
        <button type="button" className="home-btn" onClick={onReset}><RotateCcw size={13} /> Reset layout</button>
      </footer>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const { setToolbar, setSidebar } = useLayout();

  const [data, setData] = useState({ overview: null, production: [], demand: [], assets: [], outages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const [filters, setFilters] = useState(() => readJson(FILTER_KEY, { period: { key: "30d" }, region: "all" }));
  const [layout, setLayout] = useState(readLayout);
  const [customising, setCustomising] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => { writeJson(FILTER_KEY, filters); }, [filters]);
  useEffect(() => { writeJson(LAYOUT_KEY, layout); }, [layout]);

  useEffect(() => {
    setToolbar(null);
    setSidebar(null, null);
  }, [setToolbar, setSidebar]);

  // Everything at once; a source that fails leaves its sections empty and
  // says so, rather than blanking the page.
  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const sources = {
      overview: fetchOperationsOverview({ signal: controller.signal }),
      production: apiRequest("/api/production/records"),
      demand: apiRequest("/api/demand/records"),
      assets: fetchAssets({ limit: 2000 }).then((r) => r.assets || []),
      outages: fetchRecentOutages({ limit: 20 }),
    };
    const keys = Object.keys(sources);
    Promise.allSettled(Object.values(sources)).then((results) => {
      if (controller.signal.aborted) return;
      const next = {};
      const failed = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") next[keys[i]] = result.value;
        else failed.push(keys[i]);
      });
      setData((current) => ({ ...current, ...next }));
      setWarnings(failed);
      if (failed.length === keys.length) setError("Could not reach the server");
      setLoading(false);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => load(), [load]);

  const { overview } = data;
  const region = filters.region;

  // ── Derived ────────────────────────────────────────────────────────────────
  const bounds = useMemo(() => dataBounds(data.production, data.demand), [data.production, data.demand]);
  const period = useMemo(() => resolvePeriod(filters.period, bounds), [filters.period, bounds]);
  const production = useMemo(() => byRegion(data.production, region), [data.production, region]);
  const demand = useMemo(() => byRegion(data.demand, region), [data.demand, region]);
  const series = useMemo(() => (period ? buildDailySeries(production, demand, period.from, period.to) : []), [production, demand, period]);
  const kpis = useMemo(() => (period ? buildKpis(production, demand, period) : null), [production, demand, period]);
  const plantRows = useMemo(() => (period ? buildEntityTable(production, period) : []), [production, period]);
  const gateRows = useMemo(() => (period ? buildEntityTable(demand, period) : []), [demand, period]);
  const regionRows = useMemo(() => (period ? buildRegionBreakdown(data.production, data.demand, period) : []), [data.production, data.demand, period]);
  const activity = useMemo(
    () => buildActivity({ outages: data.outages, runs: overview?.recentRuns || [], production: data.production, demand: data.demand, limit: 14 }),
    [data.outages, overview, data.production, data.demand]
  );
  const day = useMemo(() => (selectedDate ? dayDetail(production, demand, selectedDate) : null), [selectedDate, production, demand]);

  useEffect(() => {
    if (selectedDate && period && (selectedDate < period.from || selectedDate > period.to)) setSelectedDate(null);
  }, [period, selectedDate]);

  const exceptions = overview?.exceptions || [];
  const status = !overview ? undefined : exceptions.length ? `${exceptions.length} exception${exceptions.length === 1 ? "" : "s"}` : "System ready";

  const setPeriod = (period) => setFilters((f) => ({ ...f, period }));
  const setRegion = (next) => setFilters((f) => ({ ...f, region: next }));

  // ── Sections ──────────────────────────────────────────────────────────────
  const latest = overview?.latestPlan;
  const shortage = overview?.demand?.shortageM3 || 0;
  const regionNote = region === "all" ? "All regions" : `${region} region`;

  const sections = {
    kpis: kpis && (
      <div className="home-kpis" data-section="kpis">
        <Kpi
          icon={Factory}
          tone="acc"
          label="Production"
          value={fmtM3(kpis.production.avg)}
          unit="m³/day"
          spark={kpis.sparks.production}
          sparkColor="var(--acc)"
          delta={<Delta value={kpis.production.change} />}
          sub={`${fmtM3(kpis.production.total)} m³ over ${kpis.production.days} days`}
        />
        <Kpi
          icon={Waves}
          tone="acc"
          label="Required demand"
          value={fmtM3(kpis.demand.avg)}
          unit="m³/day"
          spark={kpis.sparks.demand}
          sparkColor="var(--chart-purple)"
          delta={<Delta value={kpis.demand.change} invert />}
          sub={`${fmtM3(kpis.demand.total)} m³ over ${kpis.demand.days} days`}
        />
        <Kpi
          icon={CheckCircle2}
          tone={kpis.coverage.pct == null ? "acc" : kpis.coverage.pct >= 100 ? "ok" : kpis.coverage.pct >= 90 ? "warn" : "err"}
          label="Demand coverage"
          value={kpis.coverage.pct == null ? "—" : `${kpis.coverage.pct.toFixed(0)}%`}
          meter={clampPct(kpis.coverage.pct)}
          sub={kpis.coverage.days ? `${kpis.coverage.deficitDays} of ${kpis.coverage.days} days short` : "No days with both reported"}
          title="Production ÷ demand, over the days both were reported"
        />
        <Kpi
          icon={Gauge}
          tone={kpis.utilization.pct == null ? "acc" : kpis.utilization.pct >= 95 ? "err" : kpis.utilization.pct >= 80 ? "warn" : "ok"}
          label="Plant utilization"
          value={kpis.utilization.pct == null ? "—" : `${kpis.utilization.pct.toFixed(0)}%`}
          meter={clampPct(kpis.utilization.pct)}
          sub={`${kpis.utilization.plantsReporting} of ${kpis.utilization.plantsTotal} plants reporting`}
          title="Approved output against design capacity"
        />
        <Kpi
          icon={shortage ? TriangleAlert : SlidersHorizontal}
          tone={!latest ? "acc" : shortage ? "err" : "ok"}
          label="Latest dispatch"
          value={latest ? fmtM3(overview.demand.deliveredM3) : "—"}
          unit={latest ? "m³ delivered" : undefined}
          meter={latest && overview.demand.requiredM3 ? clampPct((overview.demand.deliveredM3 / overview.demand.requiredM3) * 100) : null}
          sub={latest ? (shortage ? `${fmtM3(shortage)} m³ short · ${latest.name}` : `Meets demand · ${latest.name}`) : "No dispatch run yet"}
          onClick={() => navigate(latest?.configId ? `/simulation-config/${encodeURIComponent(latest.configId)}` : "/simulation-config")}
          title="Open the simulation"
        />
      </div>
    ),

    trend: (
      <Card
        id="trend"
        title="Supply vs demand"
        icon={TrendingUp}
        className="home-card--trend"
        aside={<span className="home-muted">{period ? `${fmtDay(period.from)} – ${fmtDay(period.to)} · ${regionNote}` : ""}</span>}
      >
        {series.some((p) => p.production != null || p.demand != null) ? (
          <>
            <HomeTrendChart series={series} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            {day && (
              <div className="home-day">
                <header>
                  <CalendarRange size={13} aria-hidden="true" />
                  <strong>{fmtDay(day.date)}</strong>
                  <span className="home-muted">
                    {fmtM3(day.plants.reduce((a, p) => a + p.value, 0))} m³ produced · {fmtM3(day.gates.reduce((a, g) => a + g.value, 0))} m³ required
                  </span>
                  <button type="button" className="home-icon-btn" onClick={() => setSelectedDate(null)} aria-label="Close the day"><X size={13} /></button>
                </header>
                <div className="home-day__cols">
                  {[
                    { title: "Plants", items: day.plants, base: "/production", color: "var(--acc)" },
                    { title: "City gates", items: day.gates, base: "/demand", color: "var(--chart-purple)" },
                  ].map((col) => {
                    const max = Math.max(1, ...col.items.map((i) => i.value));
                    return (
                      <div key={col.title} className="home-day__col">
                        <h3>{col.title} <span className="home-muted">{col.items.length}</span></h3>
                        {col.items.slice(0, 6).map((item) => (
                          <button key={item.id} type="button" className="home-day__row" onClick={() => navigate(`${col.base}/${encodeURIComponent(item.id)}`)}>
                            <span className="home-day__name">{item.name}</span>
                            <span className="home-day__bar"><i style={{ width: `${(item.value / max) * 100}%`, background: col.color }} /></span>
                            <b className="mono">{fmtM3(item.value)}</b>
                          </button>
                        ))}
                        {!col.items.length && <span className="home-muted">None reported</span>}
                        {col.items.length > 6 && <span className="home-muted">+{col.items.length - 6} more</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="home-empty">No approved production or demand in this period{region === "all" ? "" : ` for ${region}`}.</div>
        )}
      </Card>
    ),

    attention: (
      <Card id="attention" title="Needs attention" icon={AlertTriangle} count={overview ? exceptions.length : null} countTone={exceptions.length ? "warn" : "ok"} className="home-card--attention">
        <div className="home-rows">
          {exceptions.slice(0, 4).map((item) => (
            <button type="button" key={item.id} className="home-row" onClick={() => navigate(item.path)}>
              <span className={`home-row__icon home-tone--${item.tone === "critical" ? "err" : "warn"}`} aria-hidden="true"><AlertTriangle size={14} /></span>
              <span className="home-row__text"><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ChevronRight size={14} className="home-row__chev" aria-hidden="true" />
            </button>
          ))}
          {exceptions.length > 4 && <span className="home-rows__more">+{exceptions.length - 4} more</span>}
          {overview && exceptions.length === 0 && (
            <div className="home-clear home-clear--small">
              <span className="home-row__icon home-tone--ok" aria-hidden="true"><CheckCircle2 size={16} /></span>
              <strong>No active exceptions</strong>
            </div>
          )}
        </div>
        {overview && (
          <>
            <div className="home-pending">
              {[
                { label: "Maintenance", hint: "Maintenance reviews waiting", value: overview.pending.maintenance, path: "/production", icon: Wrench, tone: "warn" },
                { label: "Demand", hint: "Demand decisions waiting", value: overview.pending.demand, path: "/demand", icon: Waves, tone: "acc" },
                { label: "Draft plans", hint: "Dispatch plans not yet published", value: overview.pending.draftPlans, path: "/simulation-config", icon: FileClock, tone: "acc" },
              ].map(({ label, hint, value, path, icon: Icon, tone }) => (
                <button type="button" key={label} className="home-pending__item" onClick={() => navigate(path)} title={hint}>
                  <span className={`home-row__icon home-tone--${value ? tone : "ok"}`} aria-hidden="true"><Icon size={14} /></span>
                  <span className="home-pending__text">
                    <small>{label}</small>
                    <strong className="mono">{number.format(value)}</strong>
                  </span>
                </button>
              ))}
            </div>
            <dl className="home-facts">
              <div><dt>Headroom</dt><dd className="mono">{fmtM3(overview.supply.headroomM3)} m³</dd></div>
              <div><dt>Maintenance impact</dt><dd className="mono">{fmtM3(overview.transmission.maintenanceImpactM3)} m³</dd></div>
              <div><dt>Outage loss</dt><dd className="mono home-facts__bad">{fmtM3(overview.transmission.outageLossM3)} m³</dd></div>
            </dl>
          </>
        )}
      </Card>
    ),

    map: (
      <Card id="map" title="Network map" icon={MapIcon} className="home-card--map" aside={<button type="button" className="home-link" onClick={() => navigate("/asset-registry")}>Asset registry <ArrowRight size={12} aria-hidden="true" /></button>}>
        <HomeNetworkMap assets={data.assets} region={region} onOpen={(asset) => navigate(assetPath(asset))} />
      </Card>
    ),

    regions: (
      <Card id="regions" title="Regional balance" icon={PieChart} className="home-card--regions" aside={<span className="home-muted">avg m³/day</span>}>
        <HomeRegionChart rows={regionRows} selected={region} onSelect={setRegion} />
      </Card>
    ),

    performance: (
      <Card id="performance" title="Performance" icon={Table2} className="home-card--performance" aside={<span className="home-muted">{regionNote}</span>}>
        <HomePerformanceTable
          plants={plantRows}
          gates={gateRows}
          onOpen={(tab, row) => navigate(`/${tab === "plants" ? "production" : "demand"}/${encodeURIComponent(row.id)}`)}
        />
      </Card>
    ),

    activity: (
      <Card id="activity" title="Activity" icon={Activity} className="home-card--activity">
        <HomeActivityFeed items={activity} onOpen={(path) => navigate(path)} />
      </Card>
    ),

    quick: (
      <section className="home-quick" aria-label="Quick actions" data-section="quick">
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
    ),
  };

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <main className="home page-transition">
      {/* Filters: period and region drive the KPIs, charts and tables. */}
      <div className="home-toolbar" role="toolbar" aria-label="Filters">
        <div className="home-seg" role="tablist" aria-label="Period">
          {PERIOD_PRESETS.map((p) => (
            <button key={p.key} type="button" className={filters.period.key === p.key ? "is-on" : ""} onClick={() => setPeriod({ key: p.key })}
              title={p.days ? `The last ${p.days} days of data` : "Everything on record"}>
              {p.label}
            </button>
          ))}
          <button type="button" className={filters.period.key === "custom" ? "is-on" : ""}
            onClick={() => setPeriod({ key: "custom", from: period?.from ?? bounds.first, to: period?.to ?? bounds.last })}>
            <CalendarRange size={13} aria-hidden="true" /> Custom
          </button>
        </div>
        {filters.period.key === "custom" && (
          <div className="home-dates">
            <DateInput value={filters.period.from || ""} min={bounds.first || undefined} max={bounds.last || undefined}
              onChange={(e) => setPeriod({ ...filters.period, from: e.target.value })} aria-label="From" />
            <span className="home-muted">to</span>
            <DateInput value={filters.period.to || ""} min={bounds.first || undefined} max={bounds.last || undefined}
              onChange={(e) => setPeriod({ ...filters.period, to: e.target.value })} aria-label="To" />
          </div>
        )}
        {period && (
          <span className="home-muted home-toolbar__range" title={bounds.last ? `Approved data through ${fmtDay(bounds.last)}` : undefined}>
            {period.days} days · {fmtDay(period.from)} – {fmtDay(period.to)}
          </span>
        )}
        <span className="home-toolbar__spacer" />
        {status && <span className={`home-pill home-pill--${exceptions.length ? "warn" : "ok"}`}>{status}</span>}
        <span className="home__updated"><Clock3 size={13} aria-hidden="true" /> Updated {fmtDateTime(overview?.generatedAt)}</span>
        <label className="home-select">
          <span>Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">All regions</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <div className="home-customise-wrap">
          <button type="button" className={`home-btn home-customise-toggle${customising ? " is-on" : ""}`} onClick={() => setCustomising((v) => !v)} aria-expanded={customising}>
            <LayoutGrid size={13} aria-hidden="true" /> Customise
          </button>
          {customising && (
            <CustomisePanel layout={layout} onChange={setLayout} onReset={() => setLayout(DEFAULT_LAYOUT)} onClose={() => setCustomising(false)} />
          )}
        </div>
        <button type="button" className="home-btn" onClick={load} disabled={loading} title="Reload all sections">
          {loading ? <LoaderCircle size={13} className="home-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <Banner tone="err" action={<button type="button" className="home-btn" onClick={load}>Try again</button>}>
          Operating position unavailable: {error}
        </Banner>
      )}
      {!error && (warnings.length > 0 || overview?.warnings?.length > 0) && (
        <Banner tone="warn">Some sources are delayed{warnings.length ? ` (${warnings.join(", ")})` : ""}. The available sections are shown; refresh to retry.</Banner>
      )}

      {loading && !overview && !data.production.length && (
        <div className="home-skeleton" aria-busy="true" aria-label="Loading the operating position">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} />)}
        </div>
      )}

      {(overview || data.production.length > 0) && (
        <div className={`home__body home-layout${loading ? " is-refreshing" : ""}`}>
          {visible.map((id) => {
            const section = SECTIONS.find((s) => s.id === id);
            const content = sections[id];
            if (!content) return null;
            return <div key={id} className={`home-slot home-slot--${section.span}`}>{content}</div>;
          })}
          {!visible.length && (
            <div className="home-slot home-slot--full">
              <div className="home-empty">All sections are hidden. <button type="button" className="home-link" onClick={() => setCustomising(true)}>Customise</button></div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

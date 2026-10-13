import React, { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, PlayCircle, Send, TriangleAlert } from "lucide-react";

const KINDS = [
  { key: "all", label: "All" },
  { key: "outage", label: "Outages" },
  { key: "runs", label: "Runs" },
  { key: "approval", label: "Approvals" },
];

const ICONS = {
  outage: { icon: TriangleAlert, tone: "err" },
  run: { icon: PlayCircle, tone: "acc" },
  published: { icon: Send, tone: "ok" },
  approval: { icon: CheckCircle2, tone: "ok" },
};

const relative = (iso) => {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));
};
const dayKey = (iso) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

// Recent events as a timeline grouped by day, filterable by kind; each opens
// what it's about.
export default function HomeActivityFeed({ items, onOpen }) {
  const [kind, setKind] = useState("all");
  const filtered = useMemo(
    () => items.filter((item) => kind === "all" || (kind === "runs" ? item.kind === "run" || item.kind === "published" : item.kind === kind)),
    [items, kind]
  );
  const groups = useMemo(() => {
    const out = [];
    for (const item of filtered) {
      const key = dayKey(item.at);
      const last = out.at(-1);
      if (last?.key === key) last.items.push(item);
      else out.push({ key, items: [item] });
    }
    return out;
  }, [filtered]);

  return (
    <div className="home-feed">
      <div className="home-feed__filters">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={`home-chip home-chip--plain${kind === k.key ? " is-on" : ""}`} onClick={() => setKind(k.key)}>{k.label}</button>
        ))}
      </div>
      <div className="home-feed__list">
        {groups.map((group) => (
          <div key={group.key} className="home-feed__group">
            <div className="home-feed__day">{group.key}</div>
            {group.items.map((item) => {
              const { icon: Icon, tone } = ICONS[item.kind] || ICONS.run;
              return (
                <button key={item.id} type="button" className="home-feed__item" onClick={() => item.path && onOpen(item.path)} disabled={!item.path}>
                  <span className={`home-feed__dot home-tone--${item.tone || tone}`} aria-hidden="true"><Icon size={13} /></span>
                  <span className="home-row__text">
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                  <span className="home-feed__time">{relative(item.at)}</span>
                  {item.path && <ChevronRight size={13} className="home-row__chev" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
        {!groups.length && <div className="home-empty">No recent activity of this kind.</div>}
      </div>
    </div>
  );
}

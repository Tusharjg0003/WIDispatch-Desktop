import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchRecentOutages } from "../../api/production";
import "./OutageNotificationToast.css";

const POLL_MS = 10_000;
const FIRST_LOAD_RECENT_MS = 5 * 60_000;

function latestTime(rows) {
  return rows
    .map((row) => row.eventTime)
    .filter(Boolean)
    .sort()
    .at(-1);
}

export default function OutageNotificationToast() {
  const navigate = useNavigate();
  const latestSeenRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let alive = true;
    let timerId;

    const poll = async () => {
      try {
        const rows = await fetchRecentOutages({ since: latestSeenRef.current, limit: 10 });
        if (!alive) return;

        if (!latestSeenRef.current) {
          rows.forEach((row) => seenIdsRef.current.add(row.id));
          latestSeenRef.current = latestTime(rows) || new Date().toISOString();
          const firstLoadRecent = rows
            .filter((row) => row.eventTime && Date.now() - new Date(row.eventTime).getTime() <= FIRST_LOAD_RECENT_MS)
            .sort((a, b) => (a.eventTime || "").localeCompare(b.eventTime || ""));
          if (firstLoadRecent.length > 0) {
            setToast({ ...firstLoadRecent.at(-1), count: firstLoadRecent.length });
          }
          return;
        }

        const unseen = rows
          .filter((row) => row.id && !seenIdsRef.current.has(row.id))
          .sort((a, b) => (a.eventTime || "").localeCompare(b.eventTime || ""));

        unseen.forEach((row) => seenIdsRef.current.add(row.id));
        const nextLatest = latestTime(rows);
        if (nextLatest && nextLatest > latestSeenRef.current) latestSeenRef.current = nextLatest;

        if (unseen.length > 0) {
          setToast({ ...unseen.at(-1), count: unseen.length });
        }
      } catch {
        // Keep notification polling quiet; the rest of the app still surfaces API errors locally.
      }
    };

    poll();
    timerId = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timerId);
    };
  }, []);

  if (!toast) return null;

  const openOutage = () => {
    setToast(null);
    if (toast.plantId) {
      navigate(`/production/${encodeURIComponent(toast.plantId)}?tab=outages`);
    }
  };

  const isPartial = String(toast.scope || "").toLowerCase() === "partial";

  return (
    <div
      className={`outage-toast ${isPartial ? "outage-toast--partial" : "outage-toast--full"}`}
      role="status"
      aria-live="polite"
    >
      <button type="button" className="outage-toast__body" onClick={openOutage}>
        <span className="outage-toast__icon"><AlertTriangle size={18} /></span>
        <span className="outage-toast__copy">
          <span className="outage-toast__title">{toast.count > 1 ? `${toast.count} new outages` : "New outage reported"}</span>
          <span className="outage-toast__meta">{toast.failureType} at {toast.plantName}</span>
        </span>
      </button>
      <button type="button" className="outage-toast__close" aria-label="Dismiss outage notification" onClick={() => setToast(null)}>
        <X size={15} />
      </button>
    </div>
  );
}

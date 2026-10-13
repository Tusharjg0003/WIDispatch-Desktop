// How dates read on screen across the app: day before month, short month
// names ("Tue, 18 Aug", "05 Aug 2026, 02:36"). CSV exports keep ISO dates
// (2026-08-05 02:36) so spreadsheets sort and parse them.

import { format, parseISO, startOfDay, subDays } from "date-fns";

const toDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Tue, 18 Aug" — a row's day in a daily table. */
export const fmtDayLabel = (value) => {
  const d = toDate(value);
  return d ? format(d, "EEE, dd MMM") : "—";
};

/** "05 Aug 2026, 02:36" — a full timestamp. */
export const fmtDateTime = (value, empty = "N/A") => {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy, HH:mm") : empty;
};

/** "20 Jun, 09:00" — a timestamp within a short window. */
export const fmtShortDateTime = (value, empty = "—") => {
  const d = toDate(value);
  return d ? format(d, "dd MMM, HH:mm") : empty;
};

/**
 * The default range for a daily table: the 30 days up to its latest data,
 * or up to today when the data reaches today (or there is none). Approved
 * data lags, so "the last 30 days from today" can be empty.
 */
export const defaultDataRange = (rows, days = 30) => {
  const today = startOfDay(new Date());
  const latest = (rows || []).reduce((max, r) => (r?.date && r.date > max ? r.date : max), "");
  const end = latest && toDate(latest) < today ? startOfDay(toDate(latest)) : today;
  return { start: startOfDay(subDays(end, days)), end };
};

/** The display name of the plant / city gate / pump station a record list belongs to. */
export const recordName = (bundle, fallback) =>
  bundle?.plant?.name || bundle?.cityGate?.name || bundle?.pumpStation?.name || fallback;

/** A file-name-safe piece of a record's name ("Al Amal Desalination Plant 1" → "al-amal-desalination-plant-1"). */
export const fileSlug = (name) =>
  String(name || "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").toLowerCase().slice(0, 60) || "record";

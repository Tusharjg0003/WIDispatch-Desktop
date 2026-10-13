// Query-string checks shared by the routes: a bad value is the client's
// mistake (400), not a silent empty result or a garbled range.

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD, or undefined when absent; throws 400 otherwise. */
export function parseIsoDate(value, name) {
  if (value == null || value === "") return undefined;
  const text = String(value);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!ISO_DATE.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw badRequest(`${name} must be a valid YYYY-MM-DD date`);
  }
  return text;
}

/** from/to pair: both valid, and from not after to. */
export function parseDateRange({ from, to }) {
  const range = { from: parseIsoDate(from, "from"), to: parseIsoDate(to, "to") };
  if (range.from && range.to && range.from > range.to) throw badRequest("from must not be after to");
  return range;
}

/**
 * A positive whole-number limit, capped; the default when absent. Anything
 * else (negative, zero, not a number) is a 400 rather than a quietly wrong page.
 */
export function parseLimit(value, { fallback, max }) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest("limit must be a positive whole number");
  return Math.min(n, max);
}

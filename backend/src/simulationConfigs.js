// Saved simulation configurations and the dispatch plans they produce.
//
// A config is the reusable part (which network, which date range, which per-run
// overrides); a plan is one immutable run of it. Plans start as drafts and only
// touch the portal collections when explicitly published — the desktop should
// never rewrite a portal's planning numbers as a side effect of pressing Run.

import { getDb } from "./db.js";
import { runDispatch } from "./simulation/dispatch.js";
import { publishPlan } from "./simulation/writeback.js";

const CONFIGS = "simulationConfigs";
const PLANS = "dispatchPlans";

const CONFIG_PROJECTION = { _id: 0 };
const LIST_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  description: 1,
  networkId: 1,
  from: 1,
  to: 1,
  latestPlanId: 1,
  latestRunAt: 1,
  updatedAt: 1,
};

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

const rid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const isIsoDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Default horizon: today plus the next 13 days, matching the 14-day window Production forecasts over. */
export function defaultRange(today = new Date()) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 13);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function normalise(body = {}, existing = {}) {
  const out = {};
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw badRequest("Configuration name cannot be empty");
    out.name = name;
  }
  if (body.description != null) out.description = String(body.description);
  if (body.networkId != null) out.networkId = String(body.networkId);
  for (const field of ["from", "to"]) {
    if (body[field] != null) {
      if (!isIsoDate(body[field])) throw badRequest(`${field} must be a YYYY-MM-DD date`);
      out[field] = body[field];
    }
  }
  if (body.overrides != null) {
    if (typeof body.overrides !== "object" || Array.isArray(body.overrides)) {
      throw badRequest("overrides must be an object keyed by canvas element id");
    }
    out.overrides = body.overrides;
  }

  const from = out.from ?? existing.from;
  const to = out.to ?? existing.to;
  if (from && to && from > to) throw badRequest("The from date must not be after the to date");
  return out;
}

export async function listSimulationConfigs() {
  const db = await getDb();
  const configs = await db.collection(CONFIGS).find({}, { projection: LIST_PROJECTION }).sort({ updatedAt: -1 }).toArray();
  return { configs, total: configs.length };
}

export async function getSimulationConfig(id) {
  const db = await getDb();
  const config = await db.collection(CONFIGS).findOne({ id }, { projection: CONFIG_PROJECTION });
  if (!config) throw notFound("Simulation configuration not found");
  return config;
}

export async function createSimulationConfig(body = {}) {
  if (!body.name || !String(body.name).trim()) throw badRequest("Configuration name is required");
  const db = await getDb();
  const now = new Date().toISOString();
  const range = defaultRange();

  const doc = {
    id: rid("simcfg"),
    name: "",
    description: "",
    networkId: null,
    from: range.from,
    to: range.to,
    overrides: {},
    latestPlanId: null,
    latestRunAt: null,
    createdAt: now,
    updatedAt: now,
    ...normalise(body),
  };

  await db.collection(CONFIGS).insertOne(doc);
  const { _id, ...clean } = doc;
  return clean;
}

export async function updateSimulationConfig(id, body = {}) {
  const db = await getDb();
  const existing = await db.collection(CONFIGS).findOne({ id }, { projection: CONFIG_PROJECTION });
  if (!existing) throw notFound("Simulation configuration not found");

  const set = { ...normalise(body, existing), updatedAt: new Date().toISOString() };
  const result = await db
    .collection(CONFIGS)
    .findOneAndUpdate({ id }, { $set: set }, { returnDocument: "after", projection: CONFIG_PROJECTION });

  // Driver v6 returns the doc directly; older shapes wrap it in `.value`.
  const doc = result && (result.value !== undefined ? result.value : result);
  if (!doc || !doc.id) throw notFound("Simulation configuration not found");
  return doc;
}

export async function deleteSimulationConfig(id) {
  const db = await getDb();
  const result = await db.collection(CONFIGS).deleteOne({ id });
  if (result.deletedCount === 0) throw notFound("Simulation configuration not found");
}

/**
 * Run a config and store the result as a draft plan. Body fields override the
 * stored config for this run only, so an operator can trial a different date
 * range without saving it.
 */
export async function runSimulationConfig(id, body = {}) {
  const config = await getSimulationConfig(id);
  const from = body.from ?? config.from;
  const to = body.to ?? config.to;
  const overrides = body.overrides ?? config.overrides ?? {};

  const result = await runDispatch({ networkId: config.networkId, from, to, overrides });

  const db = await getDb();
  const now = new Date().toISOString();
  const plan = {
    id: rid("plan"),
    configId: config.id,
    configName: config.name,
    status: "draft",
    runAt: now,
    updatedAt: now,
    ...result,
  };

  await db.collection(PLANS).insertOne(plan);
  await db
    .collection(CONFIGS)
    .updateOne({ id: config.id }, { $set: { latestPlanId: plan.id, latestRunAt: now, updatedAt: now } });

  const { _id, ...clean } = plan;
  return clean;
}

export async function getDispatchPlan(id) {
  const db = await getDb();
  const plan = await db.collection(PLANS).findOne({ id }, { projection: { _id: 0 } });
  if (!plan) throw notFound("Dispatch plan not found");
  return plan;
}

export async function publishDispatchPlan(id) {
  const plan = await getDispatchPlan(id);
  if (plan.status === "published") throw badRequest("This plan has already been published");
  return publishPlan(plan);
}

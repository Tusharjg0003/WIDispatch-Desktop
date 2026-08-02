// Publishing a dispatch plan into the portals' collections.
//
// This is the only place the desktop writes planning values back. Every row is
// tagged with `dispatch_plan_id` so a portal user can trace any desktop-set
// number to the run that produced it, per the result contract in
// WIDispatch-Demand/docs/wireframes/dispatch-flow.html.
//
// Field-name note: the desktop's existing per-row approve/reject writes
// `desktop_approval_status` on demandInputs (see demand.js) and the Demand tab
// reads it, while the Demand portal reads `desktop_approved_m3` +
// `desktop_decision_status`. Both are written so neither side breaks.

import { getDb } from "../db.js";
import { ObjectId } from "mongodb";

const rid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Apply a plan. Returns per-collection counts so the UI can report exactly what
 * changed rather than a bare "published".
 */
export async function publishPlan(plan) {
  const db = await getDb();
  const now = new Date().toISOString();
  const planId = plan.id;

  const productionOps = plan.plantAllocations.map((row) => ({
    updateOne: {
      filter: { plant_id: row.assetId, date: row.date },
      update: {
        $set: {
          required_m3: row.allocatedM3,
          // The Production portal refuses a required_m3 write unless the
          // source is marked as a desktop simulation.
          data_source: "desktop_simulation",
          desktop_decision_status: row.status,
          desktop_decision_comments: `Dispatch plan ${planId}`,
          dispatch_plan_id: planId,
          updated_at: now,
        },
        $setOnInsert: {
          id: rid("prod"),
          plant_id: row.assetId,
          date: row.date,
          submission_status: "draft",
          created_at: now,
        },
      },
      upsert: true,
    },
  }));

  const demandOps = plan.demandVerdicts.map((row) => ({
    updateOne: {
      filter: { plant_id: row.assetId, date: row.date },
      update: {
        $set: {
          desktop_approved_m3: row.approved,
          desktop_decision_status: row.status,
          // Kept in step with the desktop's own Demand tab, which reads this.
          desktop_approval_status: row.status === "shortfall" ? "rejected" : "approved",
          desktop_decision_comments: row.reason,
          desktop_approved_at: now,
          dispatch_plan_id: planId,
          updated_at: now,
        },
      },
    },
  }));

  const maintenanceOps = plan.maintenanceVerdicts.map((row) => ({
    updateOne: {
      filter: ObjectId.isValid(row.recordId)
        ? { $or: [{ id: row.recordId }, { _id: new ObjectId(row.recordId) }] }
        : { id: row.recordId },
      update: {
        $set: {
          // The existing PATCH endpoint only allows approved|rejected, so keep
          // this field to that vocabulary and carry the richer verdict
          // (postponed) alongside it.
          desktop_approval_status: row.status === "approved" ? "approved" : "rejected",
          desktop_decision_status: row.status,
          desktop_decision_comments: row.reason,
          desktop_approved_at: now,
          dispatch_plan_id: planId,
          updated_at: now,
        },
      },
    },
  }));

  const [production, demand, maintenance] = await Promise.all([
    productionOps.length ? db.collection("productionInputs").bulkWrite(productionOps, { ordered: false }) : null,
    demandOps.length ? db.collection("demandInputs").bulkWrite(demandOps, { ordered: false }) : null,
    maintenanceOps.length ? db.collection("maintenanceRecords").bulkWrite(maintenanceOps, { ordered: false }) : null,
  ]);

  const counts = {
    productionAllocations: (production?.modifiedCount ?? 0) + (production?.upsertedCount ?? 0),
    demandDecisions: demand?.modifiedCount ?? 0,
    maintenanceDecisions: maintenance?.modifiedCount ?? 0,
  };

  await db.collection("dispatchPlans").updateOne(
    { id: planId },
    { $set: { status: "published", publishedAt: now, publishedCounts: counts, updatedAt: now } },
  );

  return { planId, publishedAt: now, counts };
}

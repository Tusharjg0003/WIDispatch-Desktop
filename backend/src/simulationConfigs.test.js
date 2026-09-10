import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDecisionPatches, validatePlanDecisions } from "./simulationConfigs.js";

const plan = () => ({
  maintenanceVerdicts: [{ recordId: "m1", assetName: "Plant", status: "rejected", decision: false, operatorComment: "" }],
  demandVerdicts: [{ assetId: "g1", gateName: "Gate", date: "2026-08-10", required: 100, approved: 60, status: "adjusted", operatorComment: "" }],
});

test("applyDecisionPatches: persists maintenance overrides without changing the recommendation", () => {
  const source = plan();
  source.maintenanceVerdicts[0].recommendedStatus = "rejected";
  const updated = applyDecisionPatches(source, { maintenanceVerdicts: [{ recordId: "m1", decision: true }] });
  assert.equal(updated.maintenanceVerdicts[0].status, "approved");
  assert.equal(updated.maintenanceVerdicts[0].decision, true);
  assert.equal(updated.maintenanceVerdicts[0].recommendedStatus, "rejected");
});

test("applyDecisionPatches: revised demand requires a comment and derives the cross status", () => {
  assert.throws(() => applyDecisionPatches(plan(), {
    demandVerdicts: [{ assetId: "g1", date: "2026-08-10", approved: 50, operatorComment: "" }],
  }), /comment is required/i);
  const updated = applyDecisionPatches(plan(), {
    demandVerdicts: [{ assetId: "g1", date: "2026-08-10", approved: 50, operatorComment: "Network constraint" }],
  });
  assert.equal(updated.demandVerdicts[0].status, "adjusted");
  assert.equal(updated.demandVerdicts[0].decision, false);
  assert.equal(updated.demandVerdicts[0].operatorComment, "Network constraint");
});

test("validatePlanDecisions: publishing blocks incomplete crosses and invalid volumes", () => {
  assert.throws(() => validatePlanDecisions(plan()), /comment is required/i);
  const valid = plan();
  valid.maintenanceVerdicts[0].operatorComment = "Reschedule";
  valid.demandVerdicts[0].operatorComment = "Approve partial supply";
  assert.doesNotThrow(() => validatePlanDecisions(valid));
  valid.demandVerdicts[0].approved = 101;
  assert.throws(() => validatePlanDecisions(valid), /between 0 and 100/i);
});

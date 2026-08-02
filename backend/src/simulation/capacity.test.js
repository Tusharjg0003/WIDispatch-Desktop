import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableForDay,
  dayLoss,
  eachDay,
  getContractedCapacityForDate,
  inServiceOn,
  overlapsDay,
  pumpCapacity,
  pumpReduction,
  recordDaySpan,
  totalDesignCapacity,
} from "./capacity.js";

const plant = { id: "P1", specifications: { contracted_capacity: 1000, design_capacity: 1200 } };
const day = "2026-08-10";
const window = { start_datetime: "2026-08-09T00:00:00Z", end_datetime: "2026-08-12T00:00:00Z" };

test("getContractedCapacityForDate: an effective-dated row beats the plant spec", () => {
  const rows = [
    { effective_from: "2026-08-01", value_m3: 800 },
    { effective_from: "2026-01-01", value_m3: 600 },
  ];
  assert.equal(getContractedCapacityForDate(plant, day, rows), 800);
});

test("getContractedCapacityForDate: falls back to the spec when no row applies yet", () => {
  const rows = [{ effective_from: "2027-01-01", value_m3: 800 }];
  // Rows are newest-first; none is effective yet, so the oldest is used.
  assert.equal(getContractedCapacityForDate(plant, day, rows), 800);
  assert.equal(getContractedCapacityForDate(plant, day, []), 1000);
});

test("getContractedCapacityForDate: spec precedence is contracted, design, capacity", () => {
  assert.equal(getContractedCapacityForDate({ specifications: { design_capacity: 500 } }, day, []), 500);
  assert.equal(getContractedCapacityForDate({ capacity: 300, specifications: {} }, day, []), 300);
  assert.equal(getContractedCapacityForDate(null, day, []), 0);
});

test("dayLoss: a full outage removes the whole day's contracted capacity", () => {
  assert.equal(dayLoss({ outage_scope: "full", expected_loss_m3: 10 }, day, 1000), 1000);
});

test("dayLoss: daily_losses beats the legacy total", () => {
  const record = {
    expected_loss_m3: 999,
    daily_losses: [{ date: day, loss_m3: 250 }, { date: "2026-08-11", loss_m3: 100 }],
  };
  assert.equal(dayLoss(record, day, 1000), 250);
  assert.equal(dayLoss(record, "2026-08-20", 1000), 0);
});

test("dayLoss: legacy records fall back through the loss field aliases", () => {
  // No window on these, so the span is 1 day and the total is the daily figure.
  assert.equal(dayLoss({ expected_impact_m3: 120 }, day, 1000), 120);
  assert.equal(dayLoss({ estimated_loss_m3: 75 }, day, 1000), 75);
  assert.equal(dayLoss({}, day, 1000), 0);
});

test("dayLoss: an empty daily_losses array falls through instead of zeroing", () => {
  // The production website writes `daily_losses: daily_losses ?? []` on every
  // update, so treating [] as authoritative would silently derate by nothing.
  const record = { ...window, daily_losses: [], expected_loss_m3: 400 };
  assert.equal(dayLoss(record, day, 1000), 100); // 400 spread over the 4-day window
});

test("dayLoss: the legacy total is spread across the record's window, not repeated", () => {
  // Both portals write expected_loss_m3 as a window total. Applying it whole to
  // every overlapping day multiplied the loss by the window length.
  const fourDay = { start_datetime: "2026-08-09T00:00:00Z", end_datetime: "2026-08-12T00:00:00Z" };
  assert.equal(dayLoss({ ...fourDay, expected_loss_m3: 1000 }, day, 5000), 250);

  // A single-day record is unaffected.
  const oneDay = { start_datetime: "2026-08-10T00:00:00Z", end_datetime: "2026-08-10T23:00:00Z" };
  assert.equal(dayLoss({ ...oneDay, expected_loss_m3: 1000 }, day, 5000), 1000);
});

test("recordDaySpan: inclusive of both ends, and never less than one", () => {
  assert.equal(recordDaySpan({ start_datetime: "2026-08-09T00:00:00Z", end_datetime: "2026-08-12T00:00:00Z" }), 4);
  assert.equal(recordDaySpan({ start_datetime: "2026-08-10T00:00:00Z", end_datetime: "2026-08-10T23:59:00Z" }), 1);
  assert.equal(recordDaySpan({}), 1);
  assert.equal(recordDaySpan({ start_datetime: "2026-08-12T00:00:00Z", end_datetime: "2026-08-09T00:00:00Z" }), 1);
});

test("overlapsDay: open-ended records still cover the day", () => {
  assert.equal(overlapsDay(window, day), true);
  assert.equal(overlapsDay(window, "2026-08-20"), false);
  assert.equal(overlapsDay({ start_datetime: "2026-08-10T06:00:00Z" }, day), true);
  assert.equal(overlapsDay({}, day), false);
});

test("availableForDay: plant capacity nets off maintenance and outage losses", () => {
  // Per-day losses are used as given.
  const out = availableForDay(plant, "plant", day, {
    maintenanceRecords: [{
      id: "m1", submission_status: "submitted", ...window,
      daily_losses: [{ date: day, loss_m3: 200 }],
    }],
    outages: [{
      id: "o1", submission_status: "approved", ...window,
      daily_losses: [{ date: day, loss_m3: 100 }],
    }],
  });
  assert.equal(out.base, 1000);
  assert.equal(out.maintenanceLoss, 200);
  assert.equal(out.outageLoss, 100);
  assert.equal(out.available, 700);
});

test("availableForDay: unapproved outages and draft maintenance do not derate", () => {
  const out = availableForDay(plant, "plant", day, {
    maintenanceRecords: [{ id: "m1", submission_status: "draft", ...window, expected_loss_m3: 200 }],
    outages: [{ id: "o1", submission_status: "submitted", ...window, estimated_loss_m3: 100 }],
  });
  assert.equal(out.available, 1000);
});

test("availableForDay: excludeMaintenanceIds drives the counterfactual run", () => {
  const maintenanceRecords = [{
    id: "m1", submission_status: "approved", ...window,
    daily_losses: [{ date: day, loss_m3: 400 }],
  }];
  const withWork = availableForDay(plant, "plant", day, { maintenanceRecords });
  const withoutWork = availableForDay(plant, "plant", day, {
    maintenanceRecords,
    excludeMaintenanceIds: new Set(["m1"]),
  });
  assert.equal(withWork.available, 600);
  assert.equal(withoutWork.available, 1000);
});

test("totalDesignCapacity: the pump list wins, station figure is the fallback", () => {
  // No pump list — fall back to the station-level aggregate.
  assert.equal(totalDesignCapacity({ design_capacity: 900 }), 900);
  assert.equal(totalDesignCapacity({ capacity_m3_day: 750 }), 750);
  assert.equal(totalDesignCapacity({}), 0);

  // Only active functional pumps contribute.
  assert.equal(
    totalDesignCapacity({
      pumps: [
        { id: "a", role: "active", design_capacity: 300 },
        { id: "b", role: "active", design_capacity: 300, active: false },
        { id: "c", role: "standby", design_capacity: 300 },
      ],
    }),
    300,
  );
});

test("totalDesignCapacity: a stale station aggregate does not override the pumps", () => {
  // Migration leaves design_capacity behind; the transmission website derates
  // against the pump list, so that has to win or the two disagree.
  const spec = {
    design_capacity: 999999,
    pumps: [
      { id: "a", role: "functional", capacity_m3_day: 50000 },
      { id: "b", role: "functional", capacity_m3_day: 50000 },
      { id: "c", role: "backup", capacity_m3_day: 50000 },
    ],
  };
  assert.equal(totalDesignCapacity(spec), 100000);
});

test("pumpCapacity: a zero design_capacity falls through to capacity_m3_day", () => {
  assert.equal(pumpCapacity({ design_capacity: 0, capacity_m3_day: 5000 }), 5000);
  assert.equal(pumpCapacity({ design_capacity: 4000, capacity_m3_day: 5000 }), 4000);
  assert.equal(pumpCapacity({ capacity: 3000 }), 3000);
  assert.equal(pumpCapacity(undefined), 0);
});

test("pumpReduction: a standby pump under maintenance costs nothing", () => {
  // The transmission website writes every ticked pump into
  // pumps_under_maintenance, including standbys it excludes from its own
  // reduction. Charging for them would overstate the derate.
  const spec = {
    pumps: [
      { id: "f1", role: "functional", capacity_m3_day: 50000 },
      { id: "s1", role: "backup", capacity_m3_day: 50000 },
    ],
  };
  assert.equal(pumpReduction({}, spec, ["s1"]), 0);
  assert.equal(pumpReduction({}, spec, ["f1"]), 50000);
  assert.equal(pumpReduction({}, spec, ["f1", "s1"]), 50000);
  assert.equal(pumpReduction({}, spec, ["unknown"]), 0);
});

test("availableForDay: a standby substitution offsets the pump taken down", () => {
  const station = {
    id: "PS1",
    specifications: {
      pumps: [
        { id: "p1", role: "active", design_capacity: 400 },
        { id: "p2", role: "active", design_capacity: 400 },
        { id: "s1", role: "standby", design_capacity: 300 },
      ],
    },
  };
  const base = { submission_status: "approved", ...window, pumps_under_maintenance: ["p1"] };

  const uncovered = availableForDay(station, "pump", day, { maintenanceRecords: [{ id: "m1", ...base }] });
  const covered = availableForDay(station, "pump", day, {
    maintenanceRecords: [{ id: "m2", ...base, substitutions: [{ down_pump_id: "p1", standby_pump_id: "s1" }] }],
  });

  assert.equal(uncovered.base, 800);
  assert.equal(uncovered.available, 400);
  assert.equal(covered.available, 700); // 800 - (400 - 300)
});

test("availableForDay: the pump list beats daily_losses for a station", () => {
  // daily_losses is a snapshot the portal took at submission time; it does not
  // follow later edits to the station's pumps, so the pump list wins.
  const station = {
    id: "PS1",
    specifications: {
      pumps: [
        { id: "p1", role: "functional", capacity_m3_day: 50000 },
        { id: "p2", role: "functional", capacity_m3_day: 50000 },
        { id: "s1", role: "backup", capacity_m3_day: 50000 },
      ],
    },
  };
  const out = availableForDay(station, "pump", day, {
    maintenanceRecords: [{
      id: "m1",
      submission_status: "approved",
      ...window,
      pumps_under_maintenance: ["p1", "p2"],
      substitutions: [{ down_pump_id: "p1", standby_pump_id: "s1" }, { down_pump_id: "p2" }],
      daily_losses: [{ date: day, loss_m3: 999999 }], // stale, must be ignored
    }],
  });

  // P1 down but covered by the standby -> 0; P2 down uncovered -> 50,000.
  assert.equal(out.base, 100000);
  assert.equal(out.maintenanceLoss, 50000);
  assert.equal(out.available, 50000);
});

test("availableForDay: a station record without a pump list still uses daily_losses", () => {
  const station = { specifications: { design_capacity: 100000 } };
  const out = availableForDay(station, "pump", day, {
    maintenanceRecords: [{
      id: "m1", submission_status: "approved", ...window,
      daily_losses: [{ date: day, loss_m3: 30000 }],
    }],
  });
  assert.equal(out.available, 70000);
});

test("availableForDay: a non-partial outage takes the whole station offline", () => {
  const station = { specifications: { design_capacity: 800 } };
  const out = availableForDay(station, "pump", day, {
    outages: [{ id: "o1", submission_status: "approved", ...window, outage_scope: "full" }],
  });
  assert.equal(out.fullOutage, true);
  assert.equal(out.available, 0);
});

test("eachDay: inclusive of both ends", () => {
  assert.deepEqual(eachDay("2026-08-10", "2026-08-12"), ["2026-08-10", "2026-08-11", "2026-08-12"]);
  assert.deepEqual(eachDay("2026-08-10", "2026-08-10"), ["2026-08-10"]);
});

test("inServiceOn: out of service before commissioning and on/after decommissioning", () => {
  assert.equal(inServiceOn("2026-08-11", null, day), false);
  assert.equal(inServiceOn("2026-08-10", null, day), true);
  assert.equal(inServiceOn(null, "2026-08-10", day), false);
  assert.equal(inServiceOn(null, "2026-08-11", day), true);
  assert.equal(inServiceOn(null, null, day), true);
});

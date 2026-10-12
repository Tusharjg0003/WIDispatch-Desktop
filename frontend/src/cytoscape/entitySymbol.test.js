import test from "node:test";
import assert from "node:assert/strict";
import cytoscape from "cytoscape";

import { ENTITY_TYPE_COLORS } from "./buildCyStyle.js";
import {
  SYMBOL_SIZE,
  SYMBOL_TYPES,
  applyEntitySymbol,
  hasCapacityLimit,
  makeEntitySymbol,
  statusBorderColor,
} from "./entitySymbol.js";

const decode = (uri) => decodeURIComponent(uri.replace("data:image/svg+xml;utf8,", ""));

test("makeEntitySymbol draws a 44px symbol tinted with the entity colour", () => {
  const svg = decode(makeEntitySymbol({ type: "plant", typeColor: ENTITY_TYPE_COLORS.plant }));

  assert.match(svg, new RegExp(`width="${SYMBOL_SIZE}" height="${SYMBOL_SIZE}"`));
  // Tinted tile with a ring in the type colour (same build as the app's icon tiles).
  assert.match(svg, /<circle cx="22" cy="22" r="19" fill="#3b82f6" fill-opacity="0\.16" stroke="#3b82f6" stroke-opacity="0\.32"/);
  assert.match(svg, /stroke="#3b82f6"/);
});

test("makeEntitySymbol draws a rounded square when asked for a box", () => {
  const svg = decode(makeEntitySymbol({ type: "tank", symbolShape: "box" }));
  assert.match(svg, /<rect x="3" y="3" width="38" height="38" rx="9" ry="9" fill="#6fa300" fill-opacity="0\.16"/);
});

test("makeEntitySymbol adds the amber dot only for capacity-limited assets", () => {
  const plain = decode(makeEntitySymbol({ type: "tank" }));
  const limited = decode(makeEntitySymbol({ type: "tank", hasCapacityLimit: true }));

  assert.ok(!plain.includes("#f59e0b"));
  // Inside the disc, not in the corner of the box — the node clips its
  // background to its shape.
  assert.match(limited, /<circle cx="33" cy="11" r="5" fill="#f59e0b"/);
});

test("makeEntitySymbol falls back to a neutral glyph for an unknown type", () => {
  const svg = decode(makeEntitySymbol({ type: "mystery" }));
  assert.match(svg, /<rect x="5" y="5" width="14" height="14" rx="3"\/>/);
  assert.match(svg, /#6b7280/);
});

test("statusBorderColor reports lifecycle, with a neutral fallback", () => {
  assert.equal(statusBorderColor("operational"), "#6fa300");
  assert.equal(statusBorderColor("in-operation"), "#6fa300");
  assert.equal(statusBorderColor("planned"), "#3b82f6");
  assert.equal(statusBorderColor("under_construction"), "#f59e0b");
  assert.equal(statusBorderColor("decommissioned"), "#ef4444");
  assert.equal(statusBorderColor("inactive"), "#d1d5db");
  assert.equal(statusBorderColor(undefined), "#94a3b8");
  assert.equal(statusBorderColor("something-else"), "#94a3b8");
});

test("hasCapacityLimit reads whichever spec field the category uses", () => {
  assert.equal(hasCapacityLimit({ meta: { specifications: { capacity_limit_mode: "percentage" } } }), true);
  assert.equal(hasCapacityLimit({ meta: { specifications: { capacity_limitation_type: "absolute" } } }), true);
  assert.equal(hasCapacityLimit({ meta: { specifications: { capacity_limit_mode: "none" } } }), false);
  assert.equal(hasCapacityLimit({ meta: { specifications: {} } }), false);
  assert.equal(hasCapacityLimit({}), false);
  assert.equal(hasCapacityLimit(null), false);
});

const makeCy = (data) =>
  cytoscape({ headless: true, layout: { name: "preset" }, elements: [{ group: "nodes", data: { id: "n", ...data } }] });

test("applyEntitySymbol fills in the symbol and the status border", () => {
  const cy = makeCy({ type: "tank", status: "operational" });
  const node = cy.getElementById("n");

  applyEntitySymbol(node);

  assert.match(node.data("cardIcon"), /^data:image\/svg\+xml/);
  assert.equal(node.data("cardStatusColor"), "#6fa300");
});

test("applyEntitySymbol gives non-symbol nodes a valid empty background", () => {
  // Junctions and annotations draw no symbol, but the base rule's data mapper
  // must still resolve to something Cytoscape accepts.
  for (const type of ["node", "note", "group-box"]) {
    const node = makeCy({ type }).getElementById("n");
    applyEntitySymbol(node);
    assert.equal(node.data("cardIcon"), "none");
  }
});

test("applyEntitySymbol only writes when something actually changed", () => {
  // The canvas re-runs this on every data change, so an unconditional write
  // would trigger itself forever.
  const cy = makeCy({ type: "pump", status: "planned" });
  const node = cy.getElementById("n");
  applyEntitySymbol(node);

  let writes = 0;
  cy.on("data", "node", () => { writes += 1; });
  applyEntitySymbol(node);
  assert.equal(writes, 0);

  node.data("status", "decommissioned");
  writes = 0;
  applyEntitySymbol(node);
  assert.equal(writes, 1);
  assert.equal(node.data("cardStatusColor"), "#ef4444");
});

test("every symbol type has an entity colour", () => {
  for (const type of SYMBOL_TYPES) {
    assert.ok(ENTITY_TYPE_COLORS[type], `expected a colour for ${type}`);
  }
});

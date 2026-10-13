import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CANVAS_AREA,
  areaRectPx,
  describeArea,
  fitAreaToBounds,
  formatDistance,
  idsOutside,
  niceScaleBar,
  normalizeCanvasArea,
  resizeArea,
  shortfallForBounds,
} from "./canvasArea.js";

test("normalizeCanvasArea rejects missing/invalid sizes and fills the rest", () => {
  assert.equal(normalizeCanvasArea(null), null);
  assert.equal(normalizeCanvasArea({ width: 0, height: 10, resolution: 1 }), null);
  assert.deepEqual(normalizeCanvasArea({ width: "20", height: 10, resolution: 0.5, unit: "mi" }), {
    width: 20, height: 10, unit: "km", resolution: 0.5, origin: { x: 0, y: 0 },
  });
});

test("the default sheet is 100 × 70 km at 1 km per 40 px grid square", () => {
  const rect = areaRectPx(DEFAULT_CANVAS_AREA);
  assert.deepEqual([rect.w, rect.h], [4000, 2800]);
  assert.equal(describeArea(DEFAULT_CANVAS_AREA), "100 × 70 km");
});

test("fitAreaToBounds wraps a drawing in whole grid squares with a margin", () => {
  const area = fitAreaToBounds({ x1: 100, y1: 50, x2: 900, y2: 450 });
  const rect = areaRectPx(area);
  assert.ok(rect.x1 <= 100 - 40 && rect.y1 <= 50 - 40, "margin on the top/left");
  assert.ok(rect.x2 >= 900 + 40 && rect.y2 >= 450 + 40, "margin on the bottom/right");
  assert.equal(rect.x1 % 40, 0);
  assert.ok(Number.isInteger(area.width) && Number.isInteger(area.height));
  // Nothing drawn: the default sheet.
  assert.equal(fitAreaToBounds(null).width, 100);
});

test("resizeArea keeps the scale; centre anchoring grows on every side", () => {
  const area = { ...DEFAULT_CANVAS_AREA, width: 10, height: 10, origin: { x: 0, y: 0 } };
  assert.deepEqual(resizeArea(area, { width: 20, height: 10 }).origin, { x: 0, y: 0 });
  assert.deepEqual(resizeArea(area, { width: 20, height: 10 }, "center").origin, { x: -200, y: 0 });
});

test("shortfallForBounds blocks a sheet that would cut the drawing off", () => {
  const area = { ...DEFAULT_CANVAS_AREA, width: 10, height: 10, origin: { x: 0, y: 0 } }; // 400 px
  assert.equal(shortfallForBounds(area, { x1: 10, y1: 10, x2: 390, y2: 390 }), null);
  assert.deepEqual(shortfallForBounds(area, { x1: 10, y1: 10, x2: 610, y2: 300 }), {
    width: 16, height: 10, startsBefore: false,
  });
  assert.equal(shortfallForBounds(area, { x1: -5, y1: 10, x2: 300, y2: 300 }).startsBefore, true);
});

test("idsOutside lists the points off the sheet", () => {
  const rect = { x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.deepEqual(idsOutside(rect, [{ id: "a", x: 50, y: 50 }, { id: "b", x: 150, y: 50 }, { id: "c", x: 0, y: 100 }]), ["b"]);
});

test("niceScaleBar picks a 1/2/5 step that fits, in m or km", () => {
  // 1 km per 40 px at zoom 1 → 25 m per screen px → 120 px holds 3000 m → 2 km.
  const bar = niceScaleBar(1 / 40, "km");
  assert.equal(bar.label, "2 km");
  assert.equal(bar.px, 80);
  assert.equal(niceScaleBar(0.5, "m").label, "50 m");
  assert.equal(formatDistance(0.25, "km"), "250 m");
});

import { areaFromRect, dragSheetRect, onSheetBounds } from "./canvasArea.js";

test("dragSheetRect moves only the dragged edges and snaps to whole squares", () => {
  const rect = { x1: 0, y1: 0, x2: 400, y2: 400, w: 400, h: 400 };
  assert.deepEqual(dragSheetRect(rect, "e", { x: 515, y: 999 }), { x1: 0, y1: 0, x2: 520, y2: 400, w: 520, h: 400 });
  assert.deepEqual(dragSheetRect(rect, "nw", { x: -45, y: 130 }), { x1: -40, y1: 120, x2: 400, y2: 400, w: 440, h: 280 });
  // Alt: no snapping.
  assert.equal(dragSheetRect(rect, "s", { x: 0, y: 455 }, { free: true }).y2, 455);
});

test("dragSheetRect stops at what is on the sheet", () => {
  const rect = { x1: 0, y1: 0, x2: 400, y2: 400, w: 400, h: 400 };
  const keep = { x1: 100, y1: 100, x2: 300, y2: 330 };
  assert.equal(dragSheetRect(rect, "e", { x: 50, y: 0 }, { keep }).x2, 320);
  assert.equal(dragSheetRect(rect, "n", { x: 0, y: 380 }, { keep }).y1, 80);
  // Never collapses below one square, even with nothing on it.
  assert.equal(dragSheetRect(rect, "w", { x: 999, y: 0 }).w, 40);
});

test("areaFromRect / onSheetBounds", () => {
  const area = { width: 10, height: 10, unit: "km", resolution: 1, origin: { x: 0, y: 0 } };
  assert.deepEqual(areaFromRect(area, { x1: -40, y1: 0, w: 520, h: 400 }), { ...area, width: 13, origin: { x: -40, y: 0 } });
  const items = [{ id: "a", x: 10, y: 20 }, { id: "b", x: 900, y: 20 }, { id: "c", x: 300, y: 350 }];
  assert.deepEqual(onSheetBounds({ x1: 0, y1: 0, x2: 400, y2: 400 }, items), { x1: 10, y1: 20, x2: 300, y2: 350 });
});

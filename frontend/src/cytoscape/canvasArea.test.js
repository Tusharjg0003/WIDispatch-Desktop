import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CANVAS_AREA,
  areaFromRect,
  areaRectPx,
  describeArea,
  describeGrid,
  dragSheetRect,
  fitAreaToBounds,
  gridOf,
  idsOutside,
  normalizeCanvasArea,
  onSheetBounds,
  resizeArea,
  shortfallForBounds,
} from "./canvasArea.js";

test("normalizeCanvasArea rejects missing/invalid sizes and fills the rest", () => {
  assert.equal(normalizeCanvasArea(null), null);
  assert.equal(normalizeCanvasArea({ width: 0, height: 10, grid: 40 }), null);
  assert.deepEqual(normalizeCanvasArea({ width: "2000", height: 1000 }), {
    width: 2000, height: 1000, grid: 40, origin: { x: 0, y: 0 },
  });
  // The grid size is kept within sensible bounds.
  assert.equal(normalizeCanvasArea({ width: 100, height: 100, grid: 1 }).grid, 5);
  assert.equal(normalizeCanvasArea({ width: 100, height: 100, grid: 9999 }).grid, 400);
});

test("a sheet saved in km/m converts to the same pixels", () => {
  // 100 × 70 km at 1 km per 40 px square → 4000 × 2800 px.
  assert.deepEqual(
    normalizeCanvasArea({ width: 100, height: 70, unit: "km", resolution: 1, origin: { x: -40, y: 80 } }),
    { width: 4000, height: 2800, grid: 40, origin: { x: -40, y: 80 } }
  );
  // 500 m at 50 m per square → 10 squares → 400 px.
  assert.equal(normalizeCanvasArea({ width: 500, height: 500, unit: "m", resolution: 50 }).width, 400);
  assert.equal(normalizeCanvasArea({ width: 5, height: 5, unit: "km" }), null);
});

test("the default sheet is 4000 × 2800 px on a 40 px grid", () => {
  const rect = areaRectPx(DEFAULT_CANVAS_AREA);
  assert.deepEqual([rect.w, rect.h], [4000, 2800]);
  assert.equal(describeArea(DEFAULT_CANVAS_AREA), "4,000 × 2,800 px");
  assert.equal(describeGrid(DEFAULT_CANVAS_AREA), "40 px grid");
  assert.equal(gridOf(null), 40);
});

test("fitAreaToBounds wraps a drawing in whole grid squares with a margin", () => {
  const area = fitAreaToBounds({ x1: 100, y1: 50, x2: 900, y2: 450 });
  const rect = areaRectPx(area);
  assert.ok(rect.x1 <= 100 - 40 && rect.y1 <= 50 - 40, "margin on the top/left");
  assert.ok(rect.x2 >= 900 + 40 && rect.y2 >= 450 + 40, "margin on the bottom/right");
  assert.equal(rect.x1 % 40, 0);
  assert.equal(area.width % 40, 0);
  // On a 25 px grid the sheet lines up with that grid instead.
  const fine = fitAreaToBounds({ x1: 100, y1: 50, x2: 900, y2: 450 }, { grid: 25 });
  assert.equal(fine.grid, 25);
  assert.equal(fine.origin.x % 25, 0);
  assert.equal(fine.width % 25, 0);
  // Nothing drawn: the default sheet.
  assert.equal(fitAreaToBounds(null).width, 4000);
});

test("resizeArea: centre anchoring grows on every side", () => {
  const area = { ...DEFAULT_CANVAS_AREA, width: 400, height: 400, origin: { x: 0, y: 0 } };
  assert.deepEqual(resizeArea(area, { width: 800, height: 400 }).origin, { x: 0, y: 0 });
  assert.deepEqual(resizeArea(area, { width: 800, height: 400 }, "center").origin, { x: -200, y: 0 });
  assert.equal(resizeArea(area, { width: 800, height: 400, grid: 20 }).grid, 20);
});

test("shortfallForBounds blocks a sheet that would cut the drawing off", () => {
  const area = { ...DEFAULT_CANVAS_AREA, width: 400, height: 400, origin: { x: 0, y: 0 } };
  assert.equal(shortfallForBounds(area, { x1: 10, y1: 10, x2: 390, y2: 390 }), null);
  assert.deepEqual(shortfallForBounds(area, { x1: 10, y1: 10, x2: 610, y2: 300 }), {
    width: 640, height: 400, startsBefore: false,
  });
  assert.equal(shortfallForBounds(area, { x1: -5, y1: 10, x2: 300, y2: 300 }).startsBefore, true);
});

test("idsOutside lists the points off the sheet", () => {
  const rect = { x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.deepEqual(idsOutside(rect, [{ id: "a", x: 50, y: 50 }, { id: "b", x: 150, y: 50 }, { id: "c", x: 0, y: 100 }]), ["b"]);
});

test("dragSheetRect moves only the dragged edges and snaps to whole squares", () => {
  const rect = { x1: 0, y1: 0, x2: 400, y2: 400, w: 400, h: 400 };
  assert.deepEqual(dragSheetRect(rect, "e", { x: 515, y: 999 }), { x1: 0, y1: 0, x2: 520, y2: 400, w: 520, h: 400 });
  assert.deepEqual(dragSheetRect(rect, "nw", { x: -45, y: 130 }), { x1: -40, y1: 120, x2: 400, y2: 400, w: 440, h: 280 });
  assert.equal(dragSheetRect(rect, "e", { x: 512, y: 0 }, { pitch: 25 }).x2, 500);
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
  const area = { width: 400, height: 400, grid: 40, origin: { x: 0, y: 0 } };
  assert.deepEqual(areaFromRect(area, { x1: -40, y1: 0, w: 520, h: 400 }), { ...area, width: 520, origin: { x: -40, y: 0 } });
  const items = [{ id: "a", x: 10, y: 20 }, { id: "b", x: 900, y: 20 }, { id: "c", x: 300, y: 350 }];
  assert.deepEqual(onSheetBounds({ x1: 0, y1: 0, x2: 400, y2: 400 }, items), { x1: 10, y1: 20, x2: 300, y2: 350 });
});

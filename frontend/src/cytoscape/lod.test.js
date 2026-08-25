import test from "node:test";
import assert from "node:assert/strict";

import { zoomBand } from "./lod.js";

test("zoomBand: cards keep full detail at or above 0.7", () => {
  assert.equal(zoomBand(1), "near");
  assert.equal(zoomBand(0.7), "near");
  assert.equal(zoomBand(4), "near");
});

test("zoomBand: the middle band is a smaller card", () => {
  assert.equal(zoomBand(0.69), "mid");
  assert.equal(zoomBand(0.35), "mid");
});

test("zoomBand: far enough out, cards collapse to icons", () => {
  assert.equal(zoomBand(0.34), "far");
  assert.equal(zoomBand(0.05), "far");
});

test("zoomBand: a missing zoom reads as 1:1 rather than collapsing the canvas", () => {
  assert.equal(zoomBand(undefined), "near");
  assert.equal(zoomBand(0), "near");
  assert.equal(zoomBand(Number.NaN), "near");
});

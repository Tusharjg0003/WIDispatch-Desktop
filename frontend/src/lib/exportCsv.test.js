import { test } from "node:test";
import assert from "node:assert/strict";
import { assetsToCsv } from "./exportCsv.js";

test("assetsToCsv: header + one row in column order", () => {
  const csv = assetsToCsv([
    { id: "P1", name: "Alpha", activity: "Water production", asset_type: "Seawater desalination", region: "Riyadh", governorate: "Riyadh City", status: "operational" },
  ]);
  assert.equal(
    csv,
    "generated_id,name,activity,asset_type,region,governorate,status\n" +
      "P1,Alpha,Water production,Seawater desalination,Riyadh,Riyadh City,operational"
  );
});

test("assetsToCsv: escapes commas, quotes, and treats NULL governorate as blank", () => {
  const csv = assetsToCsv([
    { id: "H1", name: 'Gate "A", North', activity: "", asset_type: "", region: "", governorate: "NULL", status: "" },
  ]);
  const dataRow = csv.split("\n")[1];
  assert.equal(dataRow, 'H1,"Gate ""A"", North",,,,,');
});

test("assetsToCsv: empty list yields header only", () => {
  assert.equal(assetsToCsv([]), "generated_id,name,activity,asset_type,region,governorate,status");
});

test("assetsToCsv: neutralizes leading formula metacharacters", () => {
  const csv = assetsToCsv([
    { id: "=cmd", name: "@SUM(A1)", activity: "-2", asset_type: "+3", region: "", governorate: "", status: "" },
  ]);
  assert.equal(csv.split("\n")[1], "'=cmd,'@SUM(A1),'-2,'+3,,,");
});

test("assetsToCsv: quotes values containing a carriage return", () => {
  const csv = assetsToCsv([
    { id: "X", name: "line1\rline2", activity: "", asset_type: "", region: "", governorate: "", status: "" },
  ]);
  assert.equal(csv.split("\n")[1], 'X,"line1\rline2",,,,,');
});

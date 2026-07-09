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

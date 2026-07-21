import express from "express";
import cors from "cors";
import { buildSummary, buildRecords, DOMAINS } from "./metrics.js";
import { buildTransmission } from "./transmission.js";
import { buildQuality } from "./quality.js";
import { buildEconomics } from "./economics.js";
import { listAssets, createAsset, getAssetById, updateAsset, deleteAsset } from "./assetRegistry.js";
import {
  listTransmissionSystems, createTransmissionSystem,
  listTransmissionLines, createTransmissionLine,
} from "./transmissionRegistry.js";
import { listNetworks, getNetwork, createNetwork, updateNetwork, deleteNetwork } from "./networks.js";
import {
  listProductionPlants,
  getPlantBundle,
  updateMaintenanceDesktopApproval,
  listRecentOutages,
} from "./production.js";
import { listPumpStations, getPumpStationBundle } from "./pumpStations.js";
import { listCityGates, getCityGateBundle, updateDemandDesktopApproval } from "./demand.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

function filtersFrom(req) {
  const { from, to, plant } = req.query;
  return { from: from || undefined, to: to || undefined, plant: plant || undefined };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Shared routes for every metric domain (production, demand).
for (const domain of Object.keys(DOMAINS)) {
  app.get(`/api/${domain}/summary`, async (req, res) => {
    try {
      res.json(await buildSummary(domain, filtersFrom(req)));
    } catch (err) {
      console.error(`${domain} summary error:`, err);
      res.status(500).json({ error: `Failed to build ${domain} summary` });
    }
  });

  app.get(`/api/${domain}/records`, async (req, res) => {
    try {
      res.json(await buildRecords(domain, filtersFrom(req)));
    } catch (err) {
      console.error(`${domain} records error:`, err);
      res.status(500).json({ error: `Failed to fetch ${domain} records` });
    }
  });
}

app.get("/api/transmission/summary", async (req, res) => {
  try {
    res.json(await buildTransmission(filtersFrom(req)));
  } catch (err) {
    console.error("transmission error:", err);
    res.status(500).json({ error: "Failed to build transmission summary" });
  }
});

app.get("/api/transmission-systems", async (_req, res) => {
  try {
    res.json(await listTransmissionSystems());
  } catch (err) {
    console.error("transmission systems list error:", err);
    res.status(500).json({ error: "Failed to list transmission systems" });
  }
});

app.post("/api/transmission-systems", async (req, res) => {
  try {
    const created = await createTransmissionSystem(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error("transmission system create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create transmission system" });
  }
});

app.get("/api/transmission-lines", async (_req, res) => {
  try {
    res.json(await listTransmissionLines());
  } catch (err) {
    console.error("transmission lines list error:", err);
    res.status(500).json({ error: "Failed to list transmission lines" });
  }
});

app.post("/api/transmission-lines", async (req, res) => {
  try {
    const created = await createTransmissionLine(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error("transmission line create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create transmission line" });
  }
});

app.get("/api/quality", async (req, res) => {
  try {
    res.json(await buildQuality(filtersFrom(req)));
  } catch (err) {
    console.error("quality error:", err);
    res.status(500).json({ error: "Failed to fetch quality records" });
  }
});

app.get("/api/economics", async (req, res) => {
  try {
    res.json(await buildEconomics(filtersFrom(req)));
  } catch (err) {
    console.error("economics error:", err);
    res.status(500).json({ error: "Failed to build economics summary" });
  }
});

app.get("/api/assets", async (req, res) => {
  try {
    const { category, status, region, q, limit } = req.query;
    res.json(await listAssets({ category, status, region, q, limit }));
  } catch (err) {
    console.error("assets list error:", err);
    res.status(500).json({ error: "Failed to list assets" });
  }
});

app.get("/api/assets/:id", async (req, res) => {
  try {
    const asset = await getAssetById(req.params.id);
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    res.json(asset);
  } catch (err) {
    console.error("asset get error:", err);
    res.status(500).json({ error: "Failed to load asset" });
  }
});

app.post("/api/assets", async (req, res) => {
  try {
    const { category, ...body } = req.body || {};
    const created = await createAsset(category, body);
    res.status(201).json(created);
  } catch (err) {
    console.error("asset create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create asset" });
  }
});

app.put("/api/assets/:id", async (req, res) => {
  try {
    const { category, id, ...patch } = req.body || {};
    const updated = await updateAsset(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "Asset not found" });
    res.json(updated);
  } catch (err) {
    console.error("asset update error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update asset" });
  }
});

app.delete("/api/assets/:id", async (req, res) => {
  try {
    const deleted = await deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Asset not found" });
    res.status(204).end();
  } catch (err) {
    console.error("asset delete error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to delete asset" });
  }
});

// ── Network Builder: saved canvas graphs ─────────────────────────────────────
app.get("/api/networks", async (_req, res) => {
  try {
    res.json(await listNetworks());
  } catch (err) {
    console.error("networks list error:", err);
    res.status(500).json({ error: "Failed to list networks" });
  }
});

app.get("/api/networks/:id", async (req, res) => {
  try {
    res.json(await getNetwork(req.params.id));
  } catch (err) {
    console.error("network get error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to fetch network" });
  }
});

app.post("/api/networks", async (req, res) => {
  try {
    const created = await createNetwork(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error("network create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create network" });
  }
});

app.put("/api/networks/:id", async (req, res) => {
  try {
    res.json(await updateNetwork(req.params.id, req.body || {}));
  } catch (err) {
    console.error("network update error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update network" });
  }
});

app.delete("/api/networks/:id", async (req, res) => {
  try {
    await deleteNetwork(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(`network delete error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to delete network" });
  }
});

app.get("/api/production/plants", async (_req, res) => {
  try {
    res.json(await listProductionPlants());
  } catch (err) {
    console.error("production plants error:", err);
    res.status(500).json({ error: "Failed to list production plants" });
  }
});

app.get("/api/transmission/pump-stations", async (_req, res) => {
  try {
    res.json(await listPumpStations());
  } catch (err) {
    console.error("transmission pump stations error:", err);
    res.status(500).json({ error: "Failed to list pump stations" });
  }
});

app.get("/api/production/plant/:id/bundle", async (req, res) => {
  try {
    res.json(await getPlantBundle(req.params.id));
  } catch (err) {
    console.error(`production bundle error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to fetch plant bundle" });
  }
});

app.get("/api/transmission/pump-station/:id/bundle", async (req, res) => {
  try {
    res.json(await getPumpStationBundle(req.params.id));
  } catch (err) {
    console.error(`transmission pump station bundle error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to fetch pump station bundle" });
  }
});

app.get("/api/demand/city-gates", async (_req, res) => {
  try {
    res.json(await listCityGates());
  } catch (err) {
    console.error("demand city gates error:", err);
    res.status(500).json({ error: "Failed to list city gates" });
  }
});

app.get("/api/demand/city-gate/:id/bundle", async (req, res) => {
  try {
    res.json(await getCityGateBundle(req.params.id));
  } catch (err) {
    console.error(`demand city gate bundle error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to load city gate bundle" });
  }
});

app.patch("/api/demand/:recordId/desktop-approval", async (req, res) => {
  try {
    res.json(await updateDemandDesktopApproval(req.params.recordId, req.body?.status));
  } catch (err) {
    console.error(`demand desktop approval error (id=${req.params.recordId}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update desktop approval" });
  }
});

app.get("/api/production/outages/recent", async (req, res) => {
  try {
    res.json(await listRecentOutages({ since: req.query.since, limit: req.query.limit }));
  } catch (err) {
    console.error("recent outages error:", err);
    res.status(500).json({ error: "Failed to fetch recent outages" });
  }
});

app.patch("/api/production/maintenance/:recordId/desktop-approval", async (req, res) => {
  try {
    res.json(await updateMaintenanceDesktopApproval(req.params.recordId, req.body?.status));
  } catch (err) {
    console.error(`maintenance desktop approval error (id=${req.params.recordId}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update desktop approval" });
  }
});

app.listen(PORT, () => {
  console.log(`WIDispatch API listening on http://localhost:${PORT}`);
});

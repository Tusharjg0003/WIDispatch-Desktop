import express from "express";
import cors from "cors";
import { buildSummary, buildRecords, DOMAINS } from "./metrics.js";
import { buildTransmission } from "./transmission.js";
import { buildQuality } from "./quality.js";
import { buildEconomics } from "./economics.js";
import { listAssets, createAsset } from "./assetRegistry.js";

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

app.listen(PORT, () => {
  console.log(`WIDispatch API listening on http://localhost:${PORT}`);
});

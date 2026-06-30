import express from "express";
import cors from "cors";
import { buildSummary, buildRecords, DOMAINS } from "./metrics.js";

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

app.listen(PORT, () => {
  console.log(`WIDispatch API listening on http://localhost:${PORT}`);
});

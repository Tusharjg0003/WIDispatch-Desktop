import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Env lives in the repo root (.env.local), one level above backend/.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set (expected in repo-root .env.local)");
}

// Database name is taken from the connection string.
const client = new MongoClient(uri);
let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = client.connect().then((c) => c.db());
  }
  return dbPromise;
}

export async function closeDb() {
  await client.close();
  dbPromise = null;
}

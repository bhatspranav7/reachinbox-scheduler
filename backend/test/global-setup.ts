import { Client } from "pg";
import "./setup-env";

/** Creates the test database on first run, so `npm test` works with no manual step. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
  await client.end();
}

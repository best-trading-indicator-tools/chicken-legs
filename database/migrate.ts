import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL explicitly before running migrations.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL("./001_auctions.sql", import.meta.url), "utf8"));
  console.log("Migration applied. Six permanent auction slots are present.");
} finally { await pool.end(); }

import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL explicitly before running migrations.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const filename of ["001_auctions.sql", "002_front_ankles.sql"]) {
    await pool.query(await readFile(new URL(`./${filename}`, import.meta.url), "utf8"));
  }
  console.log("Migrations applied. Eight permanent auction slots are present.");
} finally { await pool.end(); }

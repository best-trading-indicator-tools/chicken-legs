import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

// Intentionally separate from DATABASE_URL. These checks never target a live
// application's schema; an isolated throwaway schema is removed in afterAll.
const testUrl = process.env.TEST_DATABASE_URL;
const schema = `auction_test_${randomUUID().replaceAll("-", "")}`;
const suite = testUrl ? describe : describe.skip;
let pool: Pool;
let control: Pool;

suite("PostgreSQL migration and durable uniqueness (TEST_DATABASE_URL required)", () => {
  beforeAll(async () => {
    control = new Pool({ connectionString: testUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    await pool.query(await readFile(new URL("../database/001_auctions.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../database/002_front_ankles.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (control) { await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await control.end(); }
  });
  it("migrations are idempotent and create exactly eight permanent slots", async () => {
    await pool.query(await readFile(new URL("../database/001_auctions.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../database/002_front_ankles.sql", import.meta.url), "utf8"));
    expect((await pool.query("SELECT * FROM auction_slots")).rows).toHaveLength(8);
  });
  it("duplicate jobs create only one durable obligation to process", async () => {
    await Promise.all(Array.from({ length: 10 }, () => pool.query("INSERT INTO jobs (unique_key,kind,entity_id) VALUES ('refund:one','refund','one') ON CONFLICT DO NOTHING")));
    expect((await pool.query("SELECT * FROM jobs WHERE unique_key='refund:one'")).rows).toHaveLength(1);
  });
  it("different reservations cannot acquire the same slot concurrently", async () => {
    const reserve = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const slot = (await client.query("SELECT * FROM auction_slots WHERE id='left-quad' FOR UPDATE")).rows[0];
        if (slot.reservation_id) { await client.query("ROLLBACK"); return false; }
        await client.query("UPDATE auction_slots SET reservation_id=$1 WHERE id='left-quad'", [randomUUID()]);
        await client.query("COMMIT");
        return true;
      } finally { client.release(); }
    };
    const attempts = await Promise.all(Array.from({ length: 8 }, reserve));
    expect(attempts.filter(Boolean)).toHaveLength(1);
  });
});

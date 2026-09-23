import "server-only";
import { Pool, type PoolClient } from "pg";

const globalPool = globalThis as unknown as { auctionPool?: Pool };
export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!globalPool.auctionPool) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5,
      connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000,
      // A dropped network must not leave every checked-out connection waiting
      // forever and make subsequent availability requests time out on the pool.
      query_timeout: 15_000, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
    pool.on("error", () => {
      // pg removes the failed idle client automatically. Handle the event so a
      // laptop sleep/network change cannot become an uncaught server exception.
      console.error("An idle database connection was lost; the pool will replace it.");
    });
    globalPool.auctionPool = pool;
  }
  return globalPool.auctionPool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

export async function enqueue(client: Pick<PoolClient, "query">, kind: "event" | "reservation" | "refund", id: string, when = new Date()): Promise<void> {
  await client.query("INSERT INTO jobs (unique_key,kind,entity_id,run_after) VALUES ($1,$2,$3,$4) ON CONFLICT (unique_key) DO NOTHING", [`${kind}:${id}`, kind, id, when]);
}

export interface ReservationRow {
  id: string;
  request_key: string;
  request_hash: string;
  slot_id: string;
  slot_version: number;
  amount: number;
  currency: string;
  sponsor_name: string;
  sponsor_email: string;
  sponsor_website: string;
  logo_url: string | null;
  terms_version: string;
  state: "pending" | "accepted" | "refunding" | "expired" | "review";
  session_id: string | null;
  payment_intent_id: string | null;
  checkout_params: import("stripe").default.Checkout.SessionCreateParams;
  created_at: Date;
  release_after: Date;
}

export interface SlotRow {
  id: string;
  version: number;
  current_bid_id: string | null;
  current_amount: number;
  reservation_id: string | null;
  needs_review: boolean;
}

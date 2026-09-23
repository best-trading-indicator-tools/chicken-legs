import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

vi.mock("server-only", () => ({}));

import { db, transaction } from "../src/lib/db";

const state = globalThis as unknown as { auctionPool?: Pool };

beforeEach(() => {
  // No connection is opened: transaction clients below are isolated test doubles.
  vi.stubEnv("DATABASE_URL", "postgres://unused-in-recovery-tests");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await state.auctionPool?.end();
  delete state.auctionPool;
  vi.unstubAllEnvs();
});

function stubClient() {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  vi.spyOn(db(), "connect").mockImplementation(async () => client as unknown as PoolClient);
  return client;
}

describe("database connection recovery", () => {
  it("handles a lost idle connection without an uncaught exception or exposing credentials", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("private database connection details"), { code: "EHOSTUNREACH" });
    expect(() => db().emit("error", failure)).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database connection details");
  });

  it("commits and releases a healthy connection", async () => {
    const client = stubClient();
    await expect(transaction(async () => "snapshot")).resolves.toBe("snapshot");
    expect(client.query.mock.calls).toEqual([["BEGIN"], ["COMMIT"]]);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("rolls back an application error without discarding a healthy connection", async () => {
    const client = stubClient();
    const failure = new Error("Placement reserved");
    await expect(transaction(async () => { throw failure; })).rejects.toBe(failure);
    expect(client.query.mock.calls).toEqual([["BEGIN"], ["ROLLBACK"]]);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("discards a disconnected client and preserves the original failure when rollback also fails", async () => {
    const client = stubClient();
    client.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("Rollback connection lost"));
    const failure = new Error("Query read timeout");
    await expect(transaction(async () => { throw failure; })).rejects.toBe(failure);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);

    // The failed client has been released; a subsequent request can use a fresh one.
    const recovered = stubClient();
    await expect(transaction(async () => "available")).resolves.toBe("available");
    expect(recovered.release).toHaveBeenCalledExactlyOnceWith(false);
  });
});

import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AuctionError } from "./auction-domain";

export function errorResponse(error: unknown): Response {
  if (error instanceof AuctionError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (typeof error === "object" && error && "code" in error && error.code === "23505") return Response.json({ error: { code: "CHECKOUT_IN_PROGRESS", message: "A checkout is already in progress. Please try again shortly." } }, { status: 409 });
  // Provider, SQL and secrets must never be reflected into a public response.
  return Response.json({ error: { code: "TEMPORARILY_UNAVAILABLE", message: "This service is temporarily unavailable. Please try again shortly." } }, { status: 503 });
}

export function requireWorkerAuth(request: Request): void {
  const secret = process.env.WORKER_SECRET;
  if (!secret || secret.length < 32) throw new AuctionError("NOT_CONFIGURED", "Operations are not configured.", 503);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AuctionError("UNAUTHORIZED", "Authentication required.", 401);
}

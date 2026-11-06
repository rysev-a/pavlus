// Small pure helpers for the class-controller style: read rows out of a pg
// reply, clamp query paging, and answer as HTTP effects. Nothing here does
// I/O; every function returns plain effects that carry the request's ctx (the
// runtime stamps it), so answers find their socket by themselves.
import type { Effect, Message } from "@service-laboratory/pavlus";
import { httpEffector } from "../plugins/http/helpers.ts";
import { logEffector } from "../plugins/log/helpers.ts";

// ---------------------------------------------------------------- pg replies --

/** The rows of a pg reply: `rowsOf<User>(message)`. */
export function rowsOf<T = Record<string, unknown>>(msg: Message): T[] {
  const p = msg.payload as { rows?: T[] } | undefined;
  return p?.rows ?? [];
}

/** The first row of a pg reply, or undefined. */
export function oneOf<T = Record<string, unknown>>(
  msg: Message,
): T | undefined {
  return rowsOf<T>(msg)[0];
}

// ------------------------------------------------------------------ queries --

type QueryLike = Record<string, unknown>;

const numOf = (v: unknown): number | undefined => {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== "string" || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** A positive integer query param (`?limit=20`) or undefined. */
export function intParam(q: QueryLike, name: string): number | undefined {
  return numOf(q[name]);
}

/** A string query param or undefined. */
export function strParam(q: QueryLike, name: string): string | undefined {
  const raw = q[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Paging clamped to sane bounds: `?limit=1..100&offset>=0` (50 / 0). */
export function pageOf(q: QueryLike): { limit: number; offset: number } {
  const limit = Math.min(100, Math.max(1, Math.trunc(numOf(q.limit) ?? 50)));
  const offset = Math.max(0, Math.trunc(numOf(q.offset) ?? 0));
  return { limit, offset };
}

/** `params.id` as a positive integer, or undefined. */
export function idOf(params: QueryLike): number | undefined {
  const n = numOf(params?.id);
  return n !== undefined && Number.isInteger(n) && n >= 1 ? n : undefined;
}

// ---------------------------------------------------------------- responses --

/** `{status, body?}` as one respond effect. */
export function answer(status: number, body?: unknown): Effect {
  return httpEffector.makeResponse(status, body);
}

/** `{error: {code, message, details?}}` with the status, as effects. */
export function problem(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Effect[] {
  return [
    httpEffector.makeResponse(status, {
      error: { code, message, ...(details !== undefined && { details }) },
    }),
  ];
}

/** 422: the request did not validate. */
export function invalid(message: string, details?: unknown): Effect[] {
  return problem(422, "validation", message, details);
}

/** 404, the same shape for every model. */
export function notFound(message = "no such row"): Effect[] {
  return problem(404, "not_found", message);
}

/** An infrastructure error: log it, tell the client nothing but "internal". */
export function internal(error: unknown, where?: string): Effect[] {
  return [
    logEffector.error("internal error", { where, error }),
    ...problem(500, "internal", "internal error"),
  ];
}

/**
 * A write failed inside Postgres: unique and foreign-key violations are the
 * client's conflict (409, with the constraint); the rest is infrastructure.
 */
export function writeConflict(error: unknown): Effect[] {
  const e = error as { code?: string; constraint?: string };
  const details = e?.constraint ? { constraint: e.constraint } : undefined;
  if (e?.code === "23505")
    return problem(
      409,
      "duplicate",
      "a row with these unique values already exists",
      details,
    );
  if (e?.code === "23503")
    return problem(
      409,
      "missing_reference",
      "a referenced row does not exist",
      details,
    );
  return internal(error, "write");
}

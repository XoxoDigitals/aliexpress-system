import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Wrap a route handler so thrown errors become clean JSON responses. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const field = first?.path.join(".");
        return fail(field ? `${field}: ${first.message}` : first?.message || "Validation failed", 422);
      }
      const e = err as Error & { status?: number; expose?: boolean };
      if (e?.status && e.expose) return fail(e.message, e.status);
      if (e?.status === 400) return fail("Bad request", 400);
      if (e?.status === 401) return fail("Unauthorized", 401);
      if (e?.status === 403) return fail("Forbidden", 403);
      if (e?.status === 404) return fail("Not found", 404);
      console.error("API error:", err);
      return fail("Internal server error", 500);
    }
  };
}

export async function parseJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    const err = new Error("Invalid JSON body") as Error & { status?: number; expose?: boolean };
    err.status = 400;
    err.expose = true;
    throw err;
  }
}

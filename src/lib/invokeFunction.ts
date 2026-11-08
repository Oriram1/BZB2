import { supabase } from "@/integrations/supabase/client";

// Both keys exist on both arms: the project does not compile with strict null
// checks, so a plain union would not narrow and `result.code` would not resolve.
export type Result<T> = { ok: true; data: T; code?: undefined } | { ok: false; code: string; data?: undefined };

/** The failure code when no usable answer arrived: offline, or a reply that is not the functions' JSON error body. */
export const NETWORK_ERROR = "network_error";
export const SESSION_EXPIRED = "session_expired";

const isUnauthorized = (error: unknown) => (error as { context?: Response } | null)?.context?.status === 401;

/** The edge functions answer failures with `{ error: "<code>" }`; read that code, or fall back when the body is not JSON. */
export async function functionErrorCode(error: unknown, fallback: string): Promise<string> {
  try {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.json() : null;
    if (typeof payload?.error === "string") return payload.error;
  } catch {
    // Not a JSON error body (a network failure): keep the fallback.
  }
  return fallback;
}

/**
 * Calls a payment function and returns its `{ error: "<code>" }` failure as a
 * code. A 401 is answered before any payment is created, so that case alone is
 * retried once with a fresh session; an uncertain outcome is never replayed.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
  let { data, error } = await supabase.functions.invoke(name, { body });
  if (isUnauthorized(error)) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) return { ok: false, code: SESSION_EXPIRED };
    ({ data, error } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${refreshed.data.session.access_token}` },
    }));
    if (isUnauthorized(error)) return { ok: false, code: SESSION_EXPIRED };
  }
  if (error) return { ok: false, code: await functionErrorCode(error, NETWORK_ERROR) };
  if (data && typeof data === "object" && "error" in data) return { ok: false, code: String((data as { error: unknown }).error) };
  return { ok: true, data: data as T };
}

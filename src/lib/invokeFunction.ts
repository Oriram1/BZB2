// Both keys exist on both arms: the project does not compile with strict null
// checks, so a plain union would not narrow and `result.code` would not resolve.
export type Result<T> = { ok: true; data: T; code?: undefined } | { ok: false; code: string; data?: undefined };

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

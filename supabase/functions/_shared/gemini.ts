/** The model follows Google's "-latest" Flash-Lite alias, so a retired version never breaks us. */
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 15_000;

/**
 * The provider failed. `status` is Google's HTTP status, which is safe to
 * return to callers and says why (bad key, API disabled, unknown model);
 * `null` means it answered 200 with output that is not the expected JSON.
 */
export class GeminiError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? "gemini_unparseable_output" : `gemini_http_${status}`);
  }
}

/**
 * One structured-output call: `contents` in, the model's JSON answer out.
 * Throws `server_not_configured` without a key and `GeminiError` for anything
 * the provider did wrong. Callers must treat the returned value as untrusted.
 */
export async function generateJson(options: {
  system: string;
  contents: { role: "user" | "model"; text: string }[];
  schema: unknown;
  temperature: number;
  fetcher?: typeof fetch;
}): Promise<unknown> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("server_not_configured");
  const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL;

  const response = await (options.fetcher ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: options.contents.map(({ role, text }) => ({ role, parts: [{ text }] })),
        generationConfig: {
          temperature: options.temperature,
          responseMimeType: "application/json",
          responseSchema: options.schema,
        },
      }),
    },
  );
  if (!response.ok) {
    // Google's error body names the cause and never echoes the key.
    console.error("gemini_request_failed", response.status, (await response.text()).slice(0, 1_000));
    throw new GeminiError(response.status);
  }
  const output = (await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof output !== "string") throw new GeminiError(null);
  try {
    return JSON.parse(output);
  } catch {
    throw new GeminiError(null);
  }
}

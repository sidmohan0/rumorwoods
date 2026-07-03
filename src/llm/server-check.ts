/**
 * Connectivity + model listing for OpenAI-compatible local servers
 * (llama.cpp, Ollama, LM Studio, vLLM — anything with /v1/models).
 * From the deployed HTTPS page this works against http://localhost
 * because browsers exempt localhost from mixed-content blocking; the
 * server just needs permissive CORS (Ollama: OLLAMA_ORIGINS='*').
 */
export interface ServerCheckResult {
  ok: boolean;
  models: string[];
  error?: string;
}

export async function checkServer(baseUrl: string): Promise<ServerCheckResult> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, models: [], error: "Enter a server URL" };
  try {
    const res = await fetch(`${base}/v1/models`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { ok: false, models: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };
    const models = (data.data ?? data.models ?? [])
      .map((m) => m.id ?? m.name ?? "")
      .filter(Boolean);
    return { ok: true, models };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "No response (is the server running?)"
        : "Unreachable (server down, or CORS blocked — for Ollama set OLLAMA_ORIGINS='*')";
    return { ok: false, models: [], error: message };
  }
}

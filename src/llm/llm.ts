import {
  CreateWebWorkerMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /**
   * JSON Schema to constrain the output. Backends translate this to
   * their grammar-constrained decoding API; the reply is guaranteed
   * parseable JSON when supported, and plain text otherwise.
   */
  jsonSchema?: object;
}

export interface UsageStats {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface LLMBackend {
  readonly name: string;
  /** Cumulative token usage, when the backend reports it. */
  readonly usage?: UsageStats;
  chat(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}

export const WEBLLM_QWEN_MODELS = [
  "Qwen2.5-7B-Instruct-q4f16_1-MLC",
  "Qwen2.5-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Qwen3-8B-q4f16_1-MLC",
  "Qwen3-4B-q4f16_1-MLC",
].filter((id) => prebuiltAppConfig.model_list.some((m) => m.model_id === id));

export const DEFAULT_WEBLLM_MODEL =
  WEBLLM_QWEN_MODELS[0] ?? "Qwen2.5-7B-Instruct-q4f16_1-MLC";

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export class WebLLMBackend implements LLMBackend {
  readonly name: string;
  readonly usage: UsageStats = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
  private engine: MLCEngineInterface | null = null;
  private modelId: string;
  private onProgress?: (report: InitProgressReport) => void;

  constructor(
    modelId: string = DEFAULT_WEBLLM_MODEL,
    onProgress?: (report: InitProgressReport) => void,
  ) {
    this.modelId = modelId;
    this.name = `WebLLM (${modelId})`;
    this.onProgress = onProgress;
  }

  async init(): Promise<void> {
    if (this.engine) return;
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU is not available in this browser. Use a WebGPU-capable browser (Chrome 113+), or switch to a local llama.cpp/Ollama server in Settings.",
      );
    }
    this.engine = await CreateWebWorkerMLCEngine(
      new Worker(new URL("./webllm-worker.ts", import.meta.url), {
        type: "module",
      }),
      this.modelId,
      { initProgressCallback: this.onProgress },
    );
  }

  async chat(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<string> {
    await this.init();
    const reply = await this.engine!.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 512,
      stop: options.stop,
      response_format: options.jsonSchema
        ? { type: "json_object", schema: JSON.stringify(options.jsonSchema) }
        : undefined,
      extra_body: { enable_thinking: false },
    });
    this.usage.calls++;
    this.usage.promptTokens += reply.usage?.prompt_tokens ?? 0;
    this.usage.completionTokens += reply.usage?.completion_tokens ?? 0;
    return stripThinking(reply.choices[0]?.message?.content ?? "");
  }
}

/**
 * OpenAI-compatible chat backend for local servers such as
 * `llama-server` (llama.cpp) or Ollama (`/v1/chat/completions`).
 */
export class OpenAICompatBackend implements LLMBackend {
  readonly name: string;
  readonly usage: UsageStats = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  /** Flips off if the server rejects response_format (e.g. old Ollama). */
  private schemaSupported = true;

  constructor(baseUrl: string, model: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.apiKey = apiKey;
    this.name = `${this.baseUrl} (${model || "default model"})`;
  }

  async chat(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const useSchema = options.jsonSchema !== undefined && this.schemaSupported;
    const body = (withSchema: boolean) =>
      JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.8,
        max_tokens: options.maxTokens ?? 512,
        stop: options.stop,
        response_format:
          withSchema && options.jsonSchema
            ? {
                type: "json_schema",
                json_schema: { name: "response", schema: options.jsonSchema },
              }
            : undefined,
        chat_template_kwargs: { enable_thinking: false },
      });
    let res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: body(useSchema),
    });
    if (res.status === 400 && useSchema) {
      this.schemaSupported = false;
      res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: body(false),
      });
    }
    if (!res.ok) {
      throw new Error(`LLM server error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    this.usage.calls++;
    this.usage.promptTokens += data.usage?.prompt_tokens ?? 0;
    this.usage.completionTokens += data.usage?.completion_tokens ?? 0;
    return stripThinking(data.choices?.[0]?.message?.content ?? "");
  }
}

/** Serializes LLM calls through a queue with bounded concurrency. */
export class LLMQueue {
  private backend: LLMBackend;
  private concurrency: number;
  private active = 0;
  private queue: Array<() => void> = [];
  callCount = 0;
  onStats?: (active: number, queued: number, total: number) => void;

  constructor(backend: LLMBackend, concurrency = 1) {
    this.backend = backend;
    this.concurrency = concurrency;
  }

  setBackend(backend: LLMBackend): void {
    this.backend = backend;
  }

  get backendName(): string {
    return this.backend.name;
  }

  get usage(): UsageStats | undefined {
    return this.backend.usage;
  }

  get pending(): number {
    return this.active + this.queue.length;
  }

  /** Wall-clock latency of every completed call, in ms. */
  readonly latenciesMs: number[] = [];

  async chat(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<string> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    this.callCount++;
    this.emitStats();
    const started = performance.now();
    try {
      const result = await this.backend.chat(messages, options);
      this.latenciesMs.push(performance.now() - started);
      return result;
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
      this.emitStats();
    }
  }

  private emitStats(): void {
    this.onStats?.(this.active, this.queue.length, this.callCount);
  }
}

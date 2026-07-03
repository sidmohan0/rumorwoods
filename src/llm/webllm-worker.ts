import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

/**
 * Dedicated Web Worker hosting the WebLLM engine, so WebGPU inference
 * never blocks the main thread (map rendering, UI). The main-thread
 * side is CreateWebWorkerMLCEngine in llm.ts.
 */
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);

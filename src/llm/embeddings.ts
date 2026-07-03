import { pipeline, FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * Sentence-embedding model used for memory-retrieval relevance scoring
 * (cosine similarity between memory descriptions and queries), mirroring
 * the paper's use of language-model embeddings. Runs fully in-browser
 * via transformers.js.
 */
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractor: Promise<FeatureExtractionPipeline> | null = null;
const cache = new Map<string, Float32Array>();

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    const create = pipeline as (
      task: "feature-extraction",
      model: string,
    ) => Promise<FeatureExtractionPipeline>;
    extractor = create("feature-extraction", EMBEDDING_MODEL);
  }
  return extractor;
}

export async function embed(text: string): Promise<Float32Array> {
  const cached = cache.get(text);
  if (cached) return cached;
  const model = await getExtractor();
  const output = await model(text, { pooling: "mean", normalize: true });
  const vector = new Float32Array(output.data as Float32Array);
  if (cache.size > 5000) cache.clear();
  cache.set(text, vector);
  return vector;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

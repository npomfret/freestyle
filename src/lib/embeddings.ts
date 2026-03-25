import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
let embedder: FeatureExtractionPipeline | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedder) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedder = await (pipeline as any)("feature-extraction", MODEL, {
      dtype: "fp32",
    }) as FeatureExtractionPipeline;
  }
  return embedder;
}

/**
 * Embed one or more texts using a local model.
 * Returns an array of 384-dimension vectors.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const model = await getEmbedder();
  const results: number[][] = [];
  for (const text of texts) {
    const output = await model(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}

/** Vector dimension for this model */
export const EMBEDDING_DIM = 384;

/**
 * embedder.ts — Lazy-loaded local embedding model
 *
 * Uses @xenova/transformers with the all-MiniLM-L6-v2 model (384 dimensions).
 * The model (~25 MB) is downloaded on first use and cached in
 * ~/.cache/huggingface/ (or the platform-specific equivalent).
 *
 * No API key required — the model runs entirely locally in Node.js.
 */

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedPipeline: any = null;

async function getPipeline(showProgress = false) {
  if (!embedPipeline) {
    // Dynamic import handles ESM/CJS interop on Node 22+
    const { pipeline } = await import("@xenova/transformers");

    embedPipeline = await pipeline("feature-extraction", MODEL_ID, {
      progress_callback: showProgress
        ? (progress: { status: string; progress?: number }) => {
            if (progress.status === "downloading") {
              const pct = progress.progress
                ? ` ${progress.progress.toFixed(0)}%`
                : "";
              process.stdout.write(
                `\r[gospel-library] Downloading model${pct}...    `
              );
            }
          }
        : undefined,
    });

    if (showProgress) process.stdout.write("\n");
  }
  return embedPipeline;
}

/**
 * Generate a 384-dimension embedding for a single text string.
 * @param text  The text to embed
 * @param showProgress  Whether to show model download progress (CLI mode only)
 */
export async function embed(
  text: string,
  showProgress = false
): Promise<Float32Array> {
  const pipe = await getPipeline(showProgress);
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Float32Array.from(output.data as Float32Array);
}

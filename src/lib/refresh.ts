/**
 * refresh.ts — Incremental index refresh
 *
 * Detects whether the current index was built in truncated or chunked mode
 * and calls the appropriate build function so refresh stays consistent.
 */

import { getIndexMode } from "./vectorStore.js";
import { buildIndex, buildFullIndex, BuildResult, IndexProgress } from "./indexer.js";

export async function refresh(
  onProgress?: (p: IndexProgress) => void
): Promise<BuildResult> {
  const mode = getIndexMode();
  if (mode === "chunked") {
    return buildFullIndex(true, onProgress);
  }
  return buildIndex(true, onProgress);
}

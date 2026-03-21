/**
 * refresh.ts — Incremental index refresh
 *
 * Compares the current sitemap against already-indexed URLs and only
 * fetches and embeds articles that are new since the last run.
 */

import { buildIndex, BuildResult, IndexProgress } from "./indexer.js";

export async function refresh(
  onProgress?: (p: IndexProgress) => void
): Promise<BuildResult> {
  return buildIndex(true, onProgress);
}

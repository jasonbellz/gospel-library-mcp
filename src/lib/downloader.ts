/**
 * downloader.ts — Download the pre-built index.db from GitHub Releases
 *
 * Downloads from the latest GitHub release so users don't need to run
 * build-index themselves (~30 seconds vs 45-90 minutes).
 *
 * Standard:  releases/latest/download/index.db      (~12-13 MB)
 * Full:      releases/latest/download/index-full.db  (~35-40 MB)
 */

import fetch from "node-fetch";
import * as fs from "fs";
import { DB_DIR, DB_PATH } from "./vectorStore.js";

const RELEASE_BASE =
  "https://github.com/jasonbellz/gospel-library-mcp/releases/latest/download";

export type DownloadProgressCallback = (downloaded: number, total: number) => void;

/**
 * Download a pre-built index from the latest GitHub release.
 * Saves atomically — uses a .tmp file and renames on completion.
 *
 * @param onProgress  Progress callback (bytes downloaded, total bytes)
 * @param filename    Asset filename: "index.db" (default) or "index-full.db"
 */
export async function downloadIndex(
  onProgress?: DownloadProgressCallback,
  filename: string = "index.db"
): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const url = `${RELEASE_BASE}/${filename}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "GospelLibraryMCP/2.4" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `Download failed: HTTP ${res.status}. ` +
      `Check https://github.com/jasonbellz/gospel-library-mcp/releases for the latest release.`
    );
  }

  const total = parseInt(res.headers.get("content-length") ?? "0", 10);
  let downloaded = 0;

  const chunks: Buffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const chunk of res.body as AsyncIterable<any>) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    downloaded += buf.length;
    onProgress?.(downloaded, total);
  }

  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.concat(chunks));

  // Atomically replace any existing index
  fs.renameSync(tmpPath, DB_PATH);
}

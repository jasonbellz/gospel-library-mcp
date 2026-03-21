/**
 * downloader.ts — Download the pre-built index.db from GitHub Releases
 *
 * Downloads from the latest GitHub release so users don't need to run
 * build-index themselves (~30 seconds vs 15-30 minutes).
 *
 * URL: https://github.com/jasonbellz/gospel-library-mcp/releases/latest/download/index.db
 */

import fetch from "node-fetch";
import * as fs from "fs";
import { DB_DIR, DB_PATH } from "./vectorStore.js";

const DOWNLOAD_URL =
  "https://github.com/jasonbellz/gospel-library-mcp/releases/latest/download/index.db";

export type DownloadProgressCallback = (downloaded: number, total: number) => void;

/**
 * Download the pre-built index.db from the latest GitHub release.
 * Saves atomically — uses a .tmp file and renames on completion.
 */
export async function downloadIndex(
  onProgress?: DownloadProgressCallback
): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const res = await fetch(DOWNLOAD_URL, {
    headers: { "User-Agent": "GospelLibraryMCP/2.1" },
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

  // Collect chunks (response is ~12-20 MB — fits comfortably in memory)
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

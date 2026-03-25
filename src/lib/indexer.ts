/**
 * indexer.ts — Crawl Gospel Library sitemap and build the vector search index
 *
 * Two build modes:
 *
 *  Truncated (default, build-index):
 *    Fetches full page content, truncates to ~350 words, one embedding per article.
 *    Fast build (~45-90 min), small index (~12-13 MB).
 *
 *  Chunked (build-index --full):
 *    Fetches full page content, splits into overlapping ~350-word chunks,
 *    multiple embeddings per article for full semantic coverage.
 *    Slower build (~2-4 hrs), larger index (~35-40 MB).
 *
 * Indexed categories:
 *   - General Conference talks (1971–present)
 *   - General Handbook sections
 *   - Gospel Topics essays
 *   - Come Follow Me manuals
 */

import fetch from "node-fetch";
import {
  getAllIndexedUrls,
  isArticleIndexed,
  upsertDocuments,
  VectorDocument,
} from "./vectorStore.js";
import { embed } from "./embedder.js";
import { getArticle } from "../tools/fetch.js";

const SITEMAP_INDEX =
  "https://sitemaps.churchofjesuschrist.org/sitemap-service/www.churchofjesuschrist.org/en/index.xml";

const INDEXED_PATH_PATTERNS = [
  "/study/general-conference/",
  "/study/manual/general-handbook/",
  "/study/manual/gospel-topics/",
  "/study/manual/come-follow-me-for-individuals-and-families-",
  "/study/manual/come-follow-me-for-sunday-school-",
];

// Full page fetches — lower concurrency to avoid rate limiting
const FULL_FETCH_CONCURRENCY = 5;
const EMBED_BATCH_SIZE = 32;

// Chunking parameters
const CHUNK_MAX_WORDS = 350;
const CHUNK_OVERLAP_WORDS = 50;

export interface IndexProgress {
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (p: IndexProgress) => void;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCategory(url: string): string {
  if (url.includes("/general-conference/")) return "general-conference";
  if (url.includes("/general-handbook/")) return "general-handbook";
  if (url.includes("/gospel-topics/")) return "gospel-topics";
  return "other";
}

function slugToTitle(url: string): string {
  const slug = url.replace(/[?#].*$/, "").split("/").pop() ?? "";
  return slug
    .replace(/^\d+-/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || url;
}

/**
 * Split text into overlapping chunks of ~maxWords words.
 */
function chunkText(
  text: string,
  maxWords: number = CHUNK_MAX_WORDS,
  overlapWords: number = CHUNK_OVERLAP_WORDS
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= maxWords) return [words.join(" ")];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start += maxWords - overlapWords;
  }
  return chunks;
}

interface PageEntry {
  url: string;
  title: string;
  embedText: string;
  category: string;
}

/**
 * Fetch a full article and return a single entry with title + first ~350 words
 * as the embed text (truncated mode).
 */
async function fetchAndTruncate(url: string): Promise<PageEntry | null> {
  try {
    const article = await getArticle(url, "eng");
    const title = article.title || slugToTitle(url);
    const words = article.content.split(/\s+/).filter((w) => w.length > 0);
    const truncated = words.slice(0, CHUNK_MAX_WORDS).join(" ");
    return {
      url,
      title,
      embedText: `${title}. ${truncated}`,
      category: getCategory(url),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a full article and return one entry per overlapping chunk (full mode).
 * Each chunk URL is url#chunk-N.
 */
async function fetchAndChunk(url: string): Promise<PageEntry[] | null> {
  try {
    const article = await getArticle(url, "eng");
    const title = article.title || slugToTitle(url);
    const chunks = chunkText(article.content);
    const category = getCategory(url);
    return chunks.map((chunk, i) => ({
      url: `${url}#chunk-${i}`,
      title,
      embedText: `${title}. ${chunk}`,
      category,
    }));
  } catch {
    return null;
  }
}

/** Run an async function over an array with limited concurrency. */
async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// ── Sitemap download ──────────────────────────────────────────────────────────

async function getCandidateUrls(onProgress: ProgressCallback): Promise<string[]> {
  onProgress({ current: 0, total: 0, message: "Downloading sitemap index..." });

  const indexRes = await fetch(SITEMAP_INDEX);
  if (!indexRes.ok)
    throw new Error(`Failed to fetch sitemap index: ${indexRes.status}`);
  const indexXml = await indexRes.text();

  const subSitemapUrls = [
    ...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g),
  ].map((m) => m[1]);

  onProgress({
    current: 0,
    total: 0,
    message: `Downloading ${subSitemapUrls.length} sub-sitemaps...`,
  });

  const allUrls: string[] = [];
  await Promise.all(
    subSitemapUrls.map(async (sUrl) => {
      try {
        const res = await fetch(sUrl);
        if (!res.ok) return;
        const xml = await res.text();
        const pageUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
          (m) => m[1]
        );
        const filtered = pageUrls.filter((u) =>
          INDEXED_PATH_PATTERNS.some((p) => u.includes(p))
        );
        allUrls.push(...filtered);
      } catch {
        // skip failed sub-sitemaps
      }
    })
  );

  return [...new Set(allUrls)];
}

// ── Main exports ──────────────────────────────────────────────────────────────

export interface BuildResult {
  added: number;
  skipped: number;
}

/**
 * Build or refresh the truncated index (one embedding per article, ~350 words).
 * This is the default build mode.
 *
 * @param onlyNew  Skip URLs already in the index (incremental refresh).
 */
export async function buildIndex(
  onlyNew = false,
  onProgress: ProgressCallback = () => undefined
): Promise<BuildResult> {
  const allCandidateUrls = await getCandidateUrls(onProgress);

  let urlsToIndex = allCandidateUrls;

  if (onlyNew) {
    const indexed = getAllIndexedUrls();
    // Strip #chunk-N suffixes when checking for already-indexed articles
    const indexedBase = new Set([...indexed].map((u) => u.replace(/#chunk-\d+$/, "")));
    urlsToIndex = allCandidateUrls.filter((u) => !indexedBase.has(u));
    onProgress({
      current: 0,
      total: urlsToIndex.length,
      message: `${urlsToIndex.length} new pages to index (${allCandidateUrls.length - urlsToIndex.length} already indexed)`,
    });
  } else {
    onProgress({
      current: 0,
      total: urlsToIndex.length,
      message: `Found ${urlsToIndex.length} pages to index`,
    });
  }

  if (urlsToIndex.length === 0) {
    onProgress({ current: 0, total: 0, message: "Nothing new to index." });
    return { added: 0, skipped: allCandidateUrls.length };
  }

  onProgress({
    current: 0,
    total: urlsToIndex.length,
    message: "Fetching page content (truncated mode)...",
  });

  let fetched = 0;
  const entries: PageEntry[] = (
    await mapConcurrent(
      urlsToIndex,
      async (url) => {
        const entry = await fetchAndTruncate(url);
        fetched++;
        if (fetched % 50 === 0) {
          onProgress({
            current: fetched,
            total: urlsToIndex.length,
            message: `Fetching pages (${fetched}/${urlsToIndex.length})...`,
          });
        }
        return entry;
      },
      FULL_FETCH_CONCURRENCY
    )
  ).filter((e): e is PageEntry => e !== null);

  return embedAndStore(entries, allCandidateUrls.length - urlsToIndex.length, onProgress);
}

/**
 * Build or refresh the chunked index (multiple overlapping embeddings per article).
 * Produces a larger, higher-quality index for deep semantic search.
 *
 * @param onlyNew  Skip articles already in the index (incremental refresh).
 */
export async function buildFullIndex(
  onlyNew = false,
  onProgress: ProgressCallback = () => undefined
): Promise<BuildResult> {
  const allCandidateUrls = await getCandidateUrls(onProgress);

  let urlsToIndex = allCandidateUrls;

  if (onlyNew) {
    urlsToIndex = allCandidateUrls.filter((u) => !isArticleIndexed(u));
    onProgress({
      current: 0,
      total: urlsToIndex.length,
      message: `${urlsToIndex.length} new articles to index (${allCandidateUrls.length - urlsToIndex.length} already indexed)`,
    });
  } else {
    onProgress({
      current: 0,
      total: urlsToIndex.length,
      message: `Found ${urlsToIndex.length} articles to index (chunked mode)`,
    });
  }

  if (urlsToIndex.length === 0) {
    onProgress({ current: 0, total: 0, message: "Nothing new to index." });
    return { added: 0, skipped: allCandidateUrls.length };
  }

  onProgress({
    current: 0,
    total: urlsToIndex.length,
    message: "Fetching and chunking page content...",
  });

  let fetched = 0;
  const allChunks: PageEntry[] = [];

  await mapConcurrent(
    urlsToIndex,
    async (url) => {
      const chunks = await fetchAndChunk(url);
      fetched++;
      if (fetched % 25 === 0) {
        onProgress({
          current: fetched,
          total: urlsToIndex.length,
          message: `Fetching pages (${fetched}/${urlsToIndex.length}, ${allChunks.length} chunks so far)...`,
        });
      }
      if (chunks) allChunks.push(...chunks);
    },
    FULL_FETCH_CONCURRENCY
  );

  onProgress({
    current: 0,
    total: allChunks.length,
    message: `Generated ${allChunks.length} chunks from ${fetched} articles. Embedding...`,
  });

  return embedAndStore(allChunks, allCandidateUrls.length - urlsToIndex.length, onProgress);
}

// ── Shared embed + store ──────────────────────────────────────────────────────

async function embedAndStore(
  entries: PageEntry[],
  alreadySkipped: number,
  onProgress: ProgressCallback
): Promise<BuildResult> {
  onProgress({
    current: 0,
    total: entries.length,
    message: "Generating embeddings (model download on first run)...",
  });

  let embedded = 0;
  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE);
    const docs: VectorDocument[] = [];

    for (const entry of batch) {
      const embedding = await embed(entry.embedText, embedded === 0);
      docs.push({
        url: entry.url,
        title: entry.title,
        category: entry.category,
        embedding,
        indexed_at: Date.now(),
      });
      embedded++;
    }

    upsertDocuments(docs);

    onProgress({
      current: embedded,
      total: entries.length,
      message: `Generating embeddings (${embedded}/${entries.length})...`,
    });
  }

  return { added: embedded, skipped: alreadySkipped };
}


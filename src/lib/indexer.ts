/**
 * indexer.ts — Crawl Gospel Library sitemap and build the vector search index
 *
 * Fetches article titles for key content categories, generates 384-dimension
 * embeddings using the local all-MiniLM-L6-v2 model, and stores them in the
 * local SQLite vector store.
 *
 * Indexed categories:
 *   - General Conference talks (1971–present)
 *   - General Handbook sections
 *   - Gospel Topics essays
 */

import fetch from "node-fetch";
import {
  getAllIndexedUrls,
  upsertDocuments,
  VectorDocument,
} from "./vectorStore.js";
import { embed } from "./embedder.js";

const SITEMAP_INDEX =
  "https://sitemaps.churchofjesuschrist.org/sitemap-service/www.churchofjesuschrist.org/en/index.xml";

// Only these URL path patterns are indexed for semantic search.
// Scriptures are omitted because the existing reference resolver works well for them.
const INDEXED_PATH_PATTERNS = [
  "/study/general-conference/",
  "/study/manual/general-handbook/",
  "/study/manual/gospel-topics/",
  "/study/manual/come-follow-me-for-individuals-and-families-",
  "/study/manual/come-follow-me-for-sunday-school-",
];

const TITLE_FETCH_CONCURRENCY = 10;
const EMBED_BATCH_SIZE = 32;

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
  const slug = url.replace(/\?.*$/, "").split("/").pop() ?? "";
  return slug
    .replace(/^\d+-/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || url;
}

interface PageMetadata {
  title: string;
  excerpt: string | null;
}

/** Decode common HTML entities from meta tag content. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Fetch the og:title and og:description from a page using a Range header
 * (first 16 KB is enough to capture the full <head> section).
 */
async function fetchTitleAndExcerpt(url: string): Promise<PageMetadata | null> {
  try {
    const langUrl = url.includes("lang=")
      ? url
      : `${url}${url.includes("?") ? "&" : "?"}lang=eng`;

    const res = await fetch(langUrl, {
      headers: {
        Range: "bytes=0-16383",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "GospelLibraryMCP-Indexer/2.1",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // og:title (two attribute orderings)
    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);

    let title: string | null = ogTitle ? decodeEntities(ogTitle[1].trim()) : null;

    // <title> fallback
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) {
        title = decodeEntities(
          t[1].replace(/ [-–|] The Church of Jesus Christ of Latter-day Saints$/i, "").trim()
        );
      }
    }

    if (!title) return null;

    // og:description — provides a meaningful summary of the article content
    const ogDesc =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

    const excerpt = ogDesc ? decodeEntities(ogDesc[1].trim()) : null;

    return { title, excerpt };
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

  // Deduplicate
  return [...new Set(allUrls)];
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface BuildResult {
  added: number;
  skipped: number;
}

/**
 * Build or incrementally refresh the vector index.
 *
 * @param onlyNew  If true, skip URLs already in the index (incremental refresh).
 * @param onProgress  Optional callback for progress updates.
 */
export async function buildIndex(
  onlyNew = false,
  onProgress: ProgressCallback = () => undefined
): Promise<BuildResult> {
  const allCandidateUrls = await getCandidateUrls(onProgress);

  // Filter to only new URLs when doing an incremental refresh
  let urlsToIndex = allCandidateUrls;
  const skipped = onlyNew ? 0 : 0;

  if (onlyNew) {
    const indexed = getAllIndexedUrls();
    urlsToIndex = allCandidateUrls.filter((u) => !indexed.has(u));
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

  // Phase 1 — Fetch title + description (parallel, rate-limited)
  onProgress({
    current: 0,
    total: urlsToIndex.length,
    message: "Fetching page titles and descriptions...",
  });

  let titlesFetched = 0;
  const entries: Array<{ url: string; title: string; embedText: string; category: string }> =
    await mapConcurrent(
      urlsToIndex,
      async (url) => {
        const meta = await fetchTitleAndExcerpt(url);
        const title = meta?.title ?? slugToTitle(url);
        // Combine title + description for a richer semantic signal
        const embedText = meta?.excerpt
          ? `${title}. ${meta.excerpt}`
          : title;
        titlesFetched++;
        if (titlesFetched % 100 === 0) {
          onProgress({
            current: titlesFetched,
            total: urlsToIndex.length,
            message: `Fetching metadata (${titlesFetched}/${urlsToIndex.length})...`,
          });
        }
        return { url, title, embedText, category: getCategory(url) };
      },
      TITLE_FETCH_CONCURRENCY
    );

  onProgress({
    current: 0,
    total: entries.length,
    message: "Generating embeddings (this may take a while on first run)...",
  });

  // Phase 2 — Embed in batches and store
  let embedded = 0;
  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE);
    const docs: VectorDocument[] = [];

    for (const entry of batch) {
      // showProgress=true on first embed call so model download is visible
      const embedding = await embed(entry.embedText, embedded === 0);
      docs.push({
        url: entry.url,
        title: entry.title,
        category: entry.category,
        embedding,
        indexed_at: Date.now(),
      });
    }

    upsertDocuments(docs);
    embedded += batch.length;

    onProgress({
      current: embedded,
      total: entries.length,
      message: `Generating embeddings (${embedded}/${entries.length})...`,
    });
  }

  return {
    added: embedded,
    skipped: allCandidateUrls.length - urlsToIndex.length + skipped,
  };
}

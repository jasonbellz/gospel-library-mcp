/**
 * search.ts — Gospel Library search
 *
 * Uses local vector (semantic) search when the index has been built, and
 * falls back to sitemap-based slug matching otherwise.
 *
 * Build the index once with:
 *   npx @jasonbellz/gospel-library-mcp build-index
 *
 * Refresh incrementally after new General Conference sessions:
 *   npx @jasonbellz/gospel-library-mcp refresh
 */

import fetch from "node-fetch";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { isIndexBuilt, searchByVector } from "../lib/vectorStore.js";
import { embed } from "../lib/embedder.js";

const SITEMAP_INDEX = "https://sitemaps.churchofjesuschrist.org/sitemap-service/www.churchofjesuschrist.org/en/index.xml";
const CACHE_FILE = path.join(os.tmpdir(), "gospel-library-sitemap-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function searchGospelLibrary(
  query: string,
  category?: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  if (isIndexBuilt()) {
    return searchViaVectors(query, category, maxResults);
  }
  // Index not yet built — fall back to slug search and nudge the user
  process.stderr.write(
    "[gospel-library] Vector index not built — using slug-based search.\n" +
    "  For semantic search, run: npx @jasonbellz/gospel-library-mcp build-index\n"
  );
  return searchViaSitemap(query, category, maxResults);
}

// ── Vector search ─────────────────────────────────────────────────────────────

async function searchViaVectors(
  query: string,
  category: string | undefined,
  maxResults: number
): Promise<SearchResult[]> {
  const queryEmbedding = await embed(query);
  const categoryFilter = category
    ? CATEGORY_ALIASES[category] ?? category
    : undefined;

  const results = searchByVector(queryEmbedding, categoryFilter, maxResults);

  return results.map((r) => ({
    title: r.title,
    url: r.url.includes("lang=")
      ? r.url
      : `${r.url}${r.url.includes("?") ? "&" : "?"}lang=eng`,
    snippet: `Relevance: ${(r.score * 100).toFixed(0)}% — Use get_article to read full content.`,
  }));
}

// ── Sitemap cache ─────────────────────────────────────────────────────────────

interface SitemapCache {
  urls: string[];
  fetchedAt: number;
}

async function loadSitemapUrls(): Promise<string[]> {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cached: SitemapCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.urls;
      }
    } catch {
      // ignore corrupt cache
    }
  }

  const indexRes = await fetch(SITEMAP_INDEX);
  if (!indexRes.ok) throw new Error(`Failed to fetch sitemap index: ${indexRes.status}`);
  const indexXml = await indexRes.text();

  const subSitemapUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  const allUrls: string[] = [];
  await Promise.all(
    subSitemapUrls.map(async (sitemapUrl) => {
      try {
        const res = await fetch(sitemapUrl);
        if (!res.ok) return;
        const xml = await res.text();
        const pageUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        allUrls.push(...pageUrls);
      } catch {
        // skip failed sub-sitemaps
      }
    })
  );

  try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ urls: allUrls, fetchedAt: Date.now() })); } catch { /* ignore */ }
  return allUrls;
}

// ── Search logic ──────────────────────────────────────────────────────────────

/** Convert a URL path to a human-readable title. */
function slugToTitle(url: string): string {
  const parts = url.replace(/\?.*$/, "").split("/").filter(Boolean);
  const slug = parts[parts.length - 1] || "";
  return slug
    .replace(/^\d+-/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || url;
}

/** Score a URL against an array of query terms. */
function scoreUrl(url: string, terms: string[]): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) {
      score += 1;
      // Bonus: term appears in the slug (final path segment) vs just anywhere
      const slug = lower.split("/").pop()?.split("?")[0] || "";
      if (slug.includes(term)) score += 1;
    }
  }
  return score;
}

// Category path aliases for convenience
const CATEGORY_ALIASES: Record<string, string> = {
  "general-conference": "churchofjesuschrist.org/study/general-conference",
  "scriptures": "churchofjesuschrist.org/study/scriptures",
  "manual": "churchofjesuschrist.org/study/manual",
  "liahona": "churchofjesuschrist.org/study/liahona",
  "ensign": "churchofjesuschrist.org/study/ensign",
  "friend": "churchofjesuschrist.org/study/friend",
  "handbooks": "churchofjesuschrist.org/study/manual/general-handbook",
};

async function searchViaSitemap(
  query: string,
  category: string | undefined,
  maxResults: number
): Promise<SearchResult[]> {
  const urls = await loadSitemapUrls();

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return [];

  // Resolve category filter
  const categoryFilter = category
    ? CATEGORY_ALIASES[category] ?? `churchofjesuschrist.org/study/${category}`
    : "churchofjesuschrist.org/study/";

  const scored = urls
    .filter((u) => u.includes(categoryFilter))
    .map((u) => ({ url: u, score: scoreUrl(u, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map(({ url }) => ({
    title: slugToTitle(url),
    url: url.includes("lang=") ? url : `${url}${url.includes("?") ? "&" : "?"}lang=eng`,
    snippet: "Use get_article to read full content.",
  }));
}


